const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const TorznabHandler = require('../lib/torznab/TorznabHandler');
const { FifoLock } = require('../lib/FifoLock');
const { AmuleManager } = require('../modules/amuleManager');

// Under an *arr backlog, Torznab requests used to wait for the aMule search
// lock in no particular order, took it separately for each network, and kept
// waiting - then searched - after their client had already given up. Most of
// aMule's search time went to answers nobody read (#89).

const tick = () => new Promise(r => setImmediate(r));

/** Express-like response that can be disconnected. */
function makeRes() {
  const res = new EventEmitter();
  res.writableFinished = false;
  res.sent = false;
  res.status = () => res;
  res.set = () => res;
  res.send = () => { res.sent = true; res.writableFinished = true; return res; };
  res.disconnect = () => res.emit('close');
  return res;
}

function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}

/**
 * Handler whose searches block until released one at a time, recording the
 * order searches start in and how often the aMule lock is taken.
 */
function makeHandler({ neverComplete = false } = {}) {
  const handler = new TorznabHandler();
  const started = [];
  const gates = [];
  let lockTurns = 0;

  handler.setDependencies({
    getAmuleClient: () => ({
      startSearch: async (q, network) => {
        started.push(`${q}:${network}`);
        const g = deferred();
        gates.push(g);
        await g.promise;
        return { started: true };
      },
      getSearchProgress: async () => ({ complete: !neverComplete, lifecycleState: neverComplete ? 1 : 2 }),
      getSearchResults: async () => ({ resultsLength: 0, totalLength: 0, results: [] })
    }),
    getAmuleManager: () => ({ withSearchLock: async (fn) => { lockTurns++; return fn(); } })
  });
  handler.searchDelayMs = 0;
  handler.searchSettleMs = 0;
  handler.searchPollMs = 5;
  handler.stopCacheSweep();

  const releaseNext = async () => {
    for (let i = 0; i < 50 && gates.length === 0; i++) await tick();
    gates.shift()?.resolve();
    await tick();
  };
  return { handler, started, releaseNext, lockTurns: () => lockTurns };
}

const query = (q) => ({ query: { t: 'search', q }, headers: {} });

describe('FifoLock', () => {
  it('grants waiters in arrival order', async () => {
    const lock = new FifoLock();
    const order = [];
    await lock.acquire();
    const a = lock.acquire().then(() => order.push('a'));
    const b = lock.acquire().then(() => order.push('b'));
    lock.release(); await a;
    lock.release(); await b;
    lock.release();
    assert.deepEqual(order, ['a', 'b']);
    assert.equal(lock.held, false);
  });

  it('never frees the lock while someone is queued', async () => {
    // Handed over on release, so a newcomer cannot slip in ahead.
    const lock = new FifoLock();
    await lock.acquire();
    const waiting = lock.acquire();
    lock.release();
    assert.equal(lock.held, true);
    await waiting;
  });

  it('removes a waiter that is aborted, and serves the next one', async () => {
    const lock = new FifoLock();
    await lock.acquire();
    const ctrl = new AbortController();
    const aborted = lock.acquire({ signal: ctrl.signal });
    const next = lock.acquire();
    ctrl.abort();
    await assert.rejects(aborted, { name: 'AbortError' });
    lock.release();
    await next;
    assert.equal(lock.waiters.length, 0);
  });

  it('gives up after the timeout and leaves the queue', async () => {
    const lock = new FifoLock();
    await lock.acquire();
    await assert.rejects(lock.acquire({ timeoutMs: 10 }), { code: 'LOCK_TIMEOUT' });
    assert.equal(lock.waiters.length, 0);
  });
});

describe('Torznab search queue', () => {
  it('runs one request on both networks before the next one starts', async () => {
    const { handler, started, releaseNext } = makeHandler();
    const a = handler.handleRequest(query('alpha'), makeRes());
    const b = handler.handleRequest(query('bravo'), makeRes());
    for (let i = 0; i < 4; i++) await releaseNext();
    await Promise.all([a, b]);
    assert.deepEqual(started, ['alpha:global', 'alpha:kad', 'bravo:global', 'bravo:kad']);
  });

  it('serves queued requests in arrival order', async () => {
    const { handler, started, releaseNext } = makeHandler();
    const reqs = ['alpha', 'bravo', 'charlie'].map(q => handler.handleRequest(query(q), makeRes()));
    for (let i = 0; i < 6; i++) await releaseNext();
    await Promise.all(reqs);
    assert.deepEqual(started.filter(s => s.endsWith(':global')), ['alpha:global', 'bravo:global', 'charlie:global']);
  });

  it('still takes the aMule lock for each network leg', async () => {
    // So a web UI search can run between a request's two legs.
    const { handler, releaseNext, lockTurns } = makeHandler();
    const a = handler.handleRequest(query('alpha'), makeRes());
    await releaseNext(); await releaseNext();
    await a;
    assert.equal(lockTurns(), 2);
  });

  it('never searches for a queued request whose client disconnected', async () => {
    const { handler, started, releaseNext } = makeHandler();
    const first = handler.handleRequest(query('alpha'), makeRes());
    const res = makeRes();
    const gone = handler.handleRequest(query('bravo'), res);
    await tick();
    res.disconnect();
    await gone;
    await releaseNext(); await releaseNext();
    await first;
    assert.equal(started.some(s => s.startsWith('bravo')), false);
    assert.equal(res.sent, false);
  });

  it('keeps a shared search going while one client still waits for it', async () => {
    const { handler, started, releaseNext } = makeHandler();
    const leaver = makeRes();
    const stayer = makeRes();
    const a = handler.handleRequest(query('alpha'), leaver);
    const b = handler.handleRequest(query('alpha'), stayer);
    await tick();
    leaver.disconnect();
    await releaseNext(); await releaseNext();
    await Promise.all([a, b]);
    assert.deepEqual(started, ['alpha:global', 'alpha:kad']);
    assert.equal(stayer.sent, true);
    assert.equal(leaver.sent, false);
  });

  it('cancels a shared search once every client has disconnected', async () => {
    const { handler, started, releaseNext } = makeHandler();
    const blocker = handler.handleRequest(query('alpha'), makeRes());
    const r1 = makeRes();
    const r2 = makeRes();
    const a = handler.handleRequest(query('bravo'), r1);
    const b = handler.handleRequest(query('bravo'), r2);
    await tick();
    r1.disconnect();
    r2.disconnect();
    await Promise.all([a, b]);
    await releaseNext(); await releaseNext();
    await blocker;
    assert.equal(started.some(s => s.startsWith('bravo')), false);
  });

  it('frees the slot at once when the client of a running search leaves', async () => {
    // Otherwise a search nobody reads holds the queue for its full timeout.
    const { handler, started, releaseNext } = makeHandler({ neverComplete: true });
    handler.searchTimeoutMs = 60000;
    const alphaRes = makeRes();
    const bravoRes = makeRes();
    const alpha = handler.handleRequest(query('alpha'), alphaRes);
    const bravo = handler.handleRequest(query('bravo'), bravoRes);

    await releaseNext();                 // alpha's global search is now polling
    const leftAt = Date.now();
    alphaRes.disconnect();
    await alpha;

    for (let i = 0; i < 200 && !started.includes('bravo:global'); i++) {
      await new Promise(r => setTimeout(r, 5));
    }
    assert.equal(started.includes('bravo:global'), true);
    assert.ok(Date.now() - leftAt < 2000, 'bravo should not wait out alpha\'s timeout');

    bravoRes.disconnect();
    await releaseNext();
    await bravo;
  });
});

describe('AmuleManager: waiting for the search lock', () => {
  it('stops waiting when its signal is aborted', async () => {
    const manager = new AmuleManager();
    manager.broadcast = () => {};
    manager.acquireSearchLock();
    const ctrl = new AbortController();
    const waiting = manager.acquireSearchLockWaiting({ timeoutMs: 60000, pollMs: 5, signal: ctrl.signal });
    ctrl.abort();
    await assert.rejects(waiting, { name: 'AbortError' });
  });
});
