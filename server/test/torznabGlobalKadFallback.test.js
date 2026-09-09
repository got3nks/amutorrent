const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const TorznabHandler = require('../lib/torznab/TorznabHandler');

// Medusa (and other *arr clients) abort the Torznab HTTP request at ~30s.
// Always waiting for Kad after a successful Global search is what blew that
// budget (#89): Global already had the file, Kad added nothing, and the
// client was gone before the merged feed was sent.
const res = () => ({ status() { return this; }, set() { return this; }, send() { return this; } });

const GLOBAL_HIT = [{
  fileHash: 'A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4',
  fileName: 'Example.Show.Episode.Title.mkv',
  fileSize: 1,
  sourceCount: 2
}];

const KAD_ONLY_HIT = [{
  fileHash: 'B1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D5',
  fileName: 'Kad.Only.Release.mkv',
  fileSize: 2,
  sourceCount: 1
}];

function captureRes() {
  const state = { body: null };
  return {
    status() { return this; },
    set() { return this; },
    send(body) { state.body = body; return this; },
    state
  };
}

/** Serialises searches the same way AmuleManager.withSearchLock does. */
function makeSearchLock() {
  let held = false;
  const waiters = [];
  return {
    async withSearchLock(fn) {
      while (held) {
        await new Promise(resolve => waiters.push(resolve));
      }
      held = true;
      try {
        return await fn();
      } finally {
        held = false;
        const next = waiters.shift();
        if (next) next();
      }
    },
    isSearchInProgress() {
      return held;
    }
  };
}

/**
 * @param {Object} opts
 * @param {Array} [opts.globalResults]
 * @param {Array} [opts.kadResults]
 * @param {number} [opts.kadDelayMs] - extra delay inside Kad startSearch
 * @param {boolean} [opts.useRealLock]
 */
function makeHandler({
  globalResults = GLOBAL_HIT,
  kadResults = KAD_ONLY_HIT,
  kadDelayMs = 0,
  globalDelayMs = 0,
  strategy = 'global-first',
  useRealLock = false
} = {}) {
  const handler = new TorznabHandler();
  handler.searchNetworkStrategy = strategy;
  const started = [];
  const lockHolder = useRealLock ? makeSearchLock() : { withSearchLock: async (fn) => fn() };

  handler.setDependencies({
    getAmuleClient: () => ({
      startSearch: async (query, network) => {
        started.push({ query, network });
        const delayMs = network === 'kad' ? kadDelayMs : globalDelayMs;
        if (delayMs > 0) {
          await new Promise(r => setTimeout(r, delayMs));
        }
        return { started: true };
      },
      getSearchProgress: async () => ({ complete: true }),
      getSearchResults: async () => {
        const last = started[started.length - 1];
        const results = last?.network === 'kad' ? kadResults : globalResults;
        return {
          resultsLength: results.length,
          totalLength: results.length,
          results
        };
      }
    }),
    getAmuleManager: () => lockHolder
  });
  handler.searchDelayMs = 0;
  handler.searchSettleMs = 0;
  handler.stopCacheSweep();

  return { handler, started, lockHolder };
}

const search = (q) => ({ query: { t: 'search', q } });

describe('Torznab Global-then-Kad fallback (#89)', () => {
  it('returns Global results without starting Kad', async () => {
    const { handler, started } = makeHandler({ globalResults: GLOBAL_HIT });
    const captured = captureRes();

    await handler.handleRequest(search('example show episode title'), captured);

    assert.deepEqual(started.map(s => s.network), ['global']);
    assert.ok(captured.state.body.includes('Example.Show.Episode.Title.mkv'));
    assert.ok(!captured.state.body.includes('Kad.Only.Release.mkv'));
  });

  it('falls back to Kad when Global is empty', async () => {
    const { handler, started } = makeHandler({ globalResults: [], kadResults: KAD_ONLY_HIT });
    const captured = captureRes();

    await handler.handleRequest(search('example missing on global'), captured);

    assert.deepEqual(started.map(s => s.network), ['global', 'kad']);
    assert.ok(captured.state.body.includes('Kad.Only.Release.mkv'));
  });

  it('returns an empty feed when both networks miss', async () => {
    const { handler, started } = makeHandler({ globalResults: [], kadResults: [] });
    const captured = captureRes();

    await handler.handleRequest(search('nothing anywhere'), captured);

    assert.deepEqual(started.map(s => s.network), ['global', 'kad']);
    assert.equal((captured.state.body.match(/<item>/g) || []).length, 0);
  });

  it('does not wait for the ED2K rate-limit gap before Kad fallback', async () => {
    const { handler, started } = makeHandler({ globalResults: [], kadResults: KAD_ONLY_HIT });
    handler.searchDelayMs = 10000;
    const startedAt = Date.now();

    await handler.handleRequest(search('rate limit must not apply to kad'), res());

    const elapsed = Date.now() - startedAt;
    assert.deepEqual(started.map(s => s.network), ['global', 'kad']);
    assert.ok(elapsed < 2000, `Kad fallback waited ${elapsed}ms for the ED2K rate limiter`);
  });

  it('still rate-limits the next Global search', async () => {
    const { handler } = makeHandler({ globalResults: GLOBAL_HIT });
    handler.searchDelayMs = 80;

    await handler.handleRequest(search('first global'), res());
    const startedAt = Date.now();
    await handler.handleRequest(search('second global distinct'), res());
    const elapsed = Date.now() - startedAt;

    assert.ok(elapsed >= 70, `second Global was not delayed (${elapsed}ms)`);
  });
});

describe('search lock contention after a Global hit (#89)', () => {
  it('releases the slot without Kad so a distinct query is not starved', async () => {
    const kadDelayMs = 400;
    const { handler, started } = makeHandler({
      globalResults: GLOBAL_HIT,
      kadDelayMs,
      useRealLock: true
    });

    const startedAt = Date.now();
    await Promise.all([
      handler.handleRequest(search('example alpha'), res()),
      handler.handleRequest(search('example bravo'), res())
    ]);
    const elapsed = Date.now() - startedAt;

    assert.deepEqual(started.map(s => s.network), ['global', 'global']);
    assert.ok(
      elapsed < kadDelayMs,
      `distinct queries waited ${elapsed}ms; Kad would have held the lock ${kadDelayMs}ms`
    );
    assert.equal(handler.getAmuleManager().isSearchInProgress(), false);
  });

  it('lets a second distinct search start as soon as Global of the first finishes', async () => {
    const { handler, started, lockHolder } = makeHandler({
      globalResults: GLOBAL_HIT,
      useRealLock: true
    });

    const first = handler.handleRequest(search('example alpha'), res());
    await new Promise(r => setImmediate(r));
    const second = handler.handleRequest(search('example bravo'), res());
    await Promise.all([first, second]);

    assert.equal(started.length, 2);
    assert.ok(started.every(s => s.network === 'global'));
    assert.equal(lockHolder.isSearchInProgress(), false);
  });
});

describe('ED2K_SEARCH_NETWORK_STRATEGY (#89)', () => {
  it('kad-first returns Kad results without starting Global', async () => {
    const { handler, started } = makeHandler({
      strategy: 'kad-first',
      globalResults: GLOBAL_HIT,
      kadResults: KAD_ONLY_HIT
    });
    const captured = captureRes();

    await handler.handleRequest(search('example kad first hit'), captured);

    assert.deepEqual(started.map(s => s.network), ['kad']);
    assert.ok(captured.state.body.includes('Kad.Only.Release.mkv'));
    assert.ok(!captured.state.body.includes('Example.Show.Episode.Title.mkv'));
  });

  it('kad-first falls back to Global when Kad is empty', async () => {
    const { handler, started } = makeHandler({
      strategy: 'kad-first',
      globalResults: GLOBAL_HIT,
      kadResults: []
    });
    const captured = captureRes();

    await handler.handleRequest(search('example kad miss'), captured);

    assert.deepEqual(started.map(s => s.network), ['kad', 'global']);
    assert.ok(captured.state.body.includes('Example.Show.Episode.Title.mkv'));
  });

  it('global-only never starts Kad', async () => {
    const { handler, started } = makeHandler({
      strategy: 'global-only',
      globalResults: [],
      kadResults: KAD_ONLY_HIT
    });
    const captured = captureRes();

    await handler.handleRequest(search('example global only miss'), captured);

    assert.deepEqual(started.map(s => s.network), ['global']);
    assert.equal((captured.state.body.match(/<item>/g) || []).length, 0);
  });

  it('kad-only never starts Global', async () => {
    const { handler, started } = makeHandler({
      strategy: 'kad-only',
      globalResults: GLOBAL_HIT,
      kadResults: KAD_ONLY_HIT
    });
    const captured = captureRes();

    await handler.handleRequest(search('example kad only'), captured);

    assert.deepEqual(started.map(s => s.network), ['kad']);
    assert.ok(captured.state.body.includes('Kad.Only.Release.mkv'));
  });

  it('both merges Global and Kad even when Global already had a hit', async () => {
    const { handler, started } = makeHandler({
      strategy: 'both',
      globalResults: GLOBAL_HIT,
      kadResults: KAD_ONLY_HIT
    });
    const captured = captureRes();

    await handler.handleRequest(search('example both merge'), captured);

    assert.deepEqual(started.map(s => s.network), ['global', 'kad']);
    assert.ok(captured.state.body.includes('Example.Show.Episode.Title.mkv'));
    assert.ok(captured.state.body.includes('Kad.Only.Release.mkv'));
  });

  it('both keeps alternate names when the same hash appears on both networks', async () => {
    const kadSameHash = [{
      fileHash: GLOBAL_HIT[0].fileHash,
      fileName: 'Example.Show.Alternate.Name.mkv',
      fileSize: 1,
      sourceCount: 3
    }];
    const { handler, started } = makeHandler({
      strategy: 'both',
      globalResults: GLOBAL_HIT,
      kadResults: kadSameHash
    });
    const captured = captureRes();

    await handler.handleRequest(search('example both hash dedup'), captured);

    assert.deepEqual(started.map(s => s.network), ['global', 'kad']);
    assert.equal((captured.state.body.match(/<item>/g) || []).length, 2);
    assert.ok(captured.state.body.includes('Example.Show.Episode.Title.mkv'));
    assert.ok(captured.state.body.includes('Example.Show.Alternate.Name.mkv'));
  });

  it('falls back to global-first for an unknown strategy name', async () => {
    const { handler, started } = makeHandler({
      strategy: 'not-a-mode',
      globalResults: GLOBAL_HIT,
      kadResults: KAD_ONLY_HIT
    });

    await handler.handleRequest(search('example unknown strategy'), res());

    assert.deepEqual(started.map(s => s.network), ['global']);
  });
});

describe('HTTP client abort (#89)', () => {
  it('does not start Kad after Global if the client has gone', async () => {
    const req = { query: { t: 'search', q: 'example client abort' }, aborted: false };
    const { handler, started } = makeHandler({
      globalResults: [],
      kadResults: KAD_ONLY_HIT,
      globalDelayMs: 40
    });

    const pending = handler.handleRequest(req, res());
    const startedAt = Date.now();
    while (started.length === 0) {
      if (Date.now() - startedAt > 1000) {
        throw new Error('Global search never started');
      }
      await new Promise(r => setImmediate(r));
    }
    req.aborted = true;
    await pending;

    assert.deepEqual(started.map(s => s.network), ['global']);
  });

  it('does not start any aMule search if the client is already gone', async () => {
    const req = { query: { t: 'search', q: 'example already gone' }, aborted: true };
    const { handler, started } = makeHandler({
      globalResults: GLOBAL_HIT,
      kadResults: KAD_ONLY_HIT
    });

    await handler.handleRequest(req, res());

    assert.deepEqual(started, []);
  });
});
