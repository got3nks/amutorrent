const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const TorznabHandler = require('../lib/torznab/TorznabHandler');

// The completed-search cache only helps a repeat that arrives after the first
// search finished. A search takes up to two minutes per network, and an *arr
// backlog re-asks for the same episode well inside that window: every
// duplicate missed the cache, queued on the search lock, and ran the whole
// search again on its turn. Five requests for one query meant ten aMule
// searches, and the ones at the back timed out waiting for a lock they did
// not need (#89).
const res = () => ({ status() { return this; }, set() { return this; }, send() { return this; } });

function deferred() {
  let resolve, reject;
  const promise = new Promise((res2, rej) => { resolve = res2; reject = rej; });
  return { promise, resolve, reject };
}

/**
 * Handler whose searches block until released, so several requests can be in
 * flight at once the way an *arr backlog puts them there.
 */
function makeHandler() {
  const handler = new TorznabHandler();
  const started = [];
  const gate = deferred();

  handler.setDependencies({
    getAmuleClient: () => ({
      startSearch: async (q) => { started.push(q); await gate.promise; return { started: true }; },
      getSearchProgress: async () => ({ complete: true }),
      getSearchResults: async () => ({
        resultsLength: 1, totalLength: 1,
        results: [{ fileHash: 'A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4', fileName: 'Example.mkv', fileSize: 1, sourceCount: 1 }]
      })
    }),
    getAmuleManager: () => ({ withSearchLock: async (fn) => fn() })
  });
  handler.searchDelayMs = 0;
  handler.searchSettleMs = 0;
  handler.stopCacheSweep();   // the timer is not what these tests are about

  return { handler, started, gate };
}

const query = (q) => ({ query: { t: 'search', q } });

describe('in-flight search deduplication', () => {
  it('runs one search for several identical requests in flight', async () => {
    const { handler, started, gate } = makeHandler();

    const requests = Promise.all(
      [1, 2, 3, 4, 5].map(() => handler.handleRequest(query('example show'), res()))
    );
    await new Promise(r => setImmediate(r));   // let them all reach the search
    gate.resolve();
    await requests;

    // One request searches both networks, so two startSearch calls total.
    assert.equal(started.length, 2, `ran ${started.length / 2} searches instead of 1`);
  });

  it('does not merge different queries', async () => {
    const { handler, started, gate } = makeHandler();

    const requests = Promise.all([
      handler.handleRequest(query('example alpha'), res()),
      handler.handleRequest(query('example bravo'), res())
    ]);
    await new Promise(r => setImmediate(r));
    gate.resolve();
    await requests;

    assert.equal(started.length, 4, 'two distinct queries should be two searches');
  });

  it('gives every joiner the same results', async () => {
    const { handler, gate } = makeHandler();
    const bodies = [];
    const capture = () => {
      const state = {};
      return { status() { return this; }, set() { return this; }, send(b) { state.body = b; bodies.push(b); return this; } };
    };

    const requests = Promise.all([capture(), capture(), capture()].map(r => handler.handleRequest(query('example show'), r)));
    await new Promise(r => setImmediate(r));
    gate.resolve();
    await requests;

    assert.equal(bodies.length, 3);
    assert.ok(bodies.every(b => b === bodies[0]), 'joiners got different feeds');
    assert.ok(bodies[0].includes('Example.mkv'), bodies[0]);
  });

  it('clears the key when the search finishes, so the cache serves the next one', async () => {
    const { handler, started, gate } = makeHandler();
    gate.resolve();

    await handler.handleRequest(query('example show'), res());
    assert.equal(handler.inFlightSearches.size, 0, 'the in-flight entry outlived the search');

    await handler.handleRequest(query('example show'), res());
    assert.equal(started.length, 2, 'the second request should have hit the cache');
  });

  it('clears the key when the search fails, so the next request retries', async () => {
    const { handler, gate } = makeHandler();
    gate.reject(new Error('aMule went away'));

    await handler.handleRequest(query('example show'), res());
    assert.equal(handler.inFlightSearches.size, 0, 'a failed search poisoned the key');
  });
});

describe('cache sweep', () => {
  it('drops entries past the TTL', () => {
    const { handler } = makeHandler();
    handler.cacheTtlMs = 1000;
    handler.setCachedResults('fresh', []);
    handler.searchCache.set('stale', { results: [], timestamp: Date.now() - 5000 });

    assert.equal(handler.sweepCache(), 1);
    assert.ok(handler.searchCache.has('fresh'));
    assert.ok(!handler.searchCache.has('stale'), 'expired entry survived the sweep');
  });

  it('reclaims entries nothing will ever ask for again', () => {
    // The old behaviour only dropped an entry when its own key was read again,
    // so a backlog of distinct queries held every result set it ever produced.
    const { handler } = makeHandler();
    handler.cacheTtlMs = 1000;
    for (let i = 0; i < 50; i++) {
      handler.searchCache.set(`old-${i}`, { results: [], timestamp: Date.now() - 5000 });
    }
    assert.equal(handler.sweepCache(), 50);
    assert.equal(handler.searchCache.size, 0);
  });

  it('runs on a timer that cannot hold the process open', () => {
    const handler = new TorznabHandler();
    assert.ok(handler.cacheSweepTimer, 'no sweep scheduled');
    assert.equal(handler.cacheSweepTimer.hasRef?.(), false, 'the sweep timer is not unref\'d');
    handler.stopCacheSweep();
    assert.equal(handler.cacheSweepTimer, null);
  });
});
