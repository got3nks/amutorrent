const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const TorznabHandler = require('../lib/torznab/TorznabHandler');

// Whether a core's progress figure can be trusted immediately is a property of
// the core, and one poll reveals it.
//
// A 3.1 core sends EC_TAG_SEARCH_LIFECYCLE_STATE, which describes THIS search.
// Older cores have only the overloaded progress value, which briefly carries
// the previous search's. Measured on a 3.0.1 core, a global search still
// reported progress 100 at 0.0s and 0.5s while holding zero results; the real
// sweep began near 1.0s. Reading it in that window returns nothing and, since
// completion decides caching, stores that nothing for the whole TTL.
function makeHandler({ lifecycle, completeFrom = 0 }) {
  const handler = new TorznabHandler();
  handler.stopCacheSweep();
  let polls = 0;
  handler.setDependencies({
    getAmuleClient: () => ({
      startSearch: async () => { polls = 0; return { started: true }; },
      getSearchProgress: async () => {
        const n = polls++;
        return lifecycle
          ? { lifecycleState: n >= completeFrom ? 2 : 1, complete: n >= completeFrom }
          : { lifecycleState: null, complete: n >= completeFrom };
      },
      getSearchResults: async () => ({ resultsLength: 0, totalLength: 0, results: [] })
    }),
    getAmuleManager: () => ({ withSearchLock: async (fn) => fn() })
  });
  handler.searchDelayMs = 0;
  handler.searchPollMs = 5;
  handler.searchTimeoutMs = 400;
  handler.searchSettleMs = 300;      // large enough to time
  return handler;
}

const res = () => ({ status() { return this; }, set() { return this; }, send() { return this; } });
const run = (h) => h.handleRequest({ query: { t: 'search', q: 'example' } }, res());

describe('search settle adapts to what the core can tell us', () => {
  it('skips the settle when the core reports a lifecycle state', async () => {
    const h = makeHandler({ lifecycle: true, completeFrom: 0 });
    const t0 = Date.now();
    await run(h);
    const took = Date.now() - t0;
    // Two networks; a settle each would be 600ms.
    assert.ok(took < 200, `waited ${took}ms, i.e. it still settled`);
  });

  it('still waits when the core has only the overloaded progress value', async () => {
    const h = makeHandler({ lifecycle: false, completeFrom: 0 });
    const t0 = Date.now();
    await run(h);
    const took = Date.now() - t0;
    assert.ok(took >= 500, `waited only ${took}ms, so a pre-3.1 core was trusted too early`);
  });

  it('trusts an immediate completion only when the lifecycle state backs it', async () => {
    // The pre-3.1 core claims complete on its very first poll, which is the
    // stale reading. It must not be believed before the settle has elapsed.
    const h = makeHandler({ lifecycle: false, completeFrom: 0 });
    const t0 = Date.now();
    await run(h);
    assert.ok(Date.now() - t0 >= 500);
  });

  it('keeps polling a lifecycle core that is still running', async () => {
    const h = makeHandler({ lifecycle: true, completeFrom: 3 });
    const t0 = Date.now();
    await run(h);
    const took = Date.now() - t0;
    assert.ok(took < 200, `waited ${took}ms`);
  });
});
