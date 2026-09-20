const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const TorznabHandler = require('../lib/torznab/TorznabHandler');

// A Torznab answer is cached for ED2K_CACHE_TTL_MS, so caching the wrong
// thing is expensive: a search cut short by a timeout, or one aMule refused,
// looks exactly like a query with no matches, and caching it serves that
// non-answer to every later request for the whole TTL (#89).
//
// The result count cannot be the test. A query that genuinely matches nothing
// is a real answer and re-running it for ten minutes is waste. What matters is
// whether aMule declared the search finished.
const res = () => ({ status() { return this; }, set() { return this; }, send() { return this; } });
const FILE = (hash, name) => ({ fileHash: hash, fileName: name, fileSize: 1, sourceCount: 1 });

function makeHandler(perNetwork) {
  const handler = new TorznabHandler();
  handler.stopCacheSweep();
  let current = null;

  handler.setDependencies({
    getAmuleClient: () => ({
      startSearch: async (q, net) => {
        current = perNetwork[net] || { results: [], completes: true };
        return { started: !current.refused, message: 'refused' };
      },
      getSearchProgress: async () => ({ complete: current.completes !== false }),
      getSearchResults: async () => ({
        resultsLength: current.results.length,
        totalLength: current.results.length,
        results: current.results
      })
    }),
    getAmuleManager: () => ({ withSearchLock: async (fn) => fn() })
  });
  handler.searchDelayMs = 0;
  handler.searchSettleMs = 0;
  handler.searchPollMs = 5;
  handler.searchTimeoutMs = 60;
  return handler;
}

const keyFor = (h, q) => h.getCacheKey('search', q, undefined, undefined);
const run = (h, q) => h.handleRequest({ query: { t: 'search', q } }, res());
const bothNetworks = (spec) => ({ global: spec, kad: spec });

describe('caching is gated on completion, not on the result count', () => {
  it('caches a completed search that legitimately found nothing', async () => {
    const h = makeHandler(bothNetworks({ results: [], completes: true }));
    await run(h, 'nothing here');
    assert.ok(h.searchCache.has(keyFor(h, 'nothing here')),
      'an empty but finished search should be cached, it is a real answer');
  });

  it('caches a completed search that found files', async () => {
    const h = makeHandler({
      global: { results: [FILE('a'.repeat(32), 'One.mkv')], completes: true },
      kad: { results: [], completes: true }
    });
    await run(h, 'has results');
    assert.ok(h.searchCache.has(keyFor(h, 'has results')));
  });

  it('does not cache a search cut short by its timeout', async () => {
    const h = makeHandler(bothNetworks({ results: [], completes: false }));
    await run(h, 'timed out');
    assert.ok(!h.searchCache.has(keyFor(h, 'timed out')), 'a truncated search was cached');
  });

  it('does not cache when one leg finished and the other did not', async () => {
    // The union is incomplete, so it is not the answer for this query.
    const h = makeHandler({
      global: { results: [FILE('a'.repeat(32), 'One.mkv')], completes: true },
      kad: { results: [], completes: false }
    });
    await run(h, 'half done');
    assert.ok(!h.searchCache.has(keyFor(h, 'half done')));
  });

  it('does not cache a query aMule refused', async () => {
    const h = makeHandler(bothNetworks({ results: [], completes: true, refused: true }));
    await run(h, 'refused query');
    assert.ok(!h.searchCache.has(keyFor(h, 'refused query')), 'a refused search was cached');
  });

  it('still serves a cached empty answer without searching again', async () => {
    const h = makeHandler(bothNetworks({ results: [], completes: true }));
    await run(h, 'no matches');
    let searched = 0;
    const client = h.getAmuleClient();
    h.setDependencies({
      getAmuleClient: () => ({ ...client, startSearch: async () => { searched++; return { started: true }; } }),
      getAmuleManager: () => ({ withSearchLock: async (fn) => fn() })
    });
    await run(h, 'no matches');
    assert.equal(searched, 0, 'a cached empty answer should not be re-searched');
  });
});
