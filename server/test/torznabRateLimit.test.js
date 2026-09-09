const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const TorznabHandler = require('../lib/torznab/TorznabHandler');

// The gap between searches exists for ED2K server flood protection. Kad is a
// DHT and has no such limit, so making a Kad search wait for it, or letting one
// stamp the clock, spends the delay for nothing. A Torznab request runs both
// networks, so that was up to a full gap of pure waiting per request (#89).
const handler = () => { const h = new TorznabHandler(); h.stopCacheSweep(); return h; };
const noop = async () => ({ results: [], completed: true });

describe('the ED2K flood gap belongs to ED2K alone', () => {
  it('makes an ED2K search wait for the gap', async () => {
    const h = handler();
    h.searchDelayMs = 300;
    h.lastSearchTime = Date.now();

    const t0 = Date.now();
    await h.rateLimitedSearch(noop, 'global');
    assert.ok(Date.now() - t0 >= 250, 'ED2K search did not wait for the flood gap');
  });

  it('does not make a Kad search wait for it', async () => {
    const h = handler();
    h.searchDelayMs = 300;
    h.lastSearchTime = Date.now();

    const t0 = Date.now();
    await h.rateLimitedSearch(noop, 'kad');
    assert.ok(Date.now() - t0 < 150, 'Kad waited for a gap that protects ED2K servers');
  });

  it('does not let a Kad search stamp the ED2K clock', async () => {
    // Otherwise the gap is moved onto the next ED2K search rather than skipped.
    const h = handler();
    h.lastSearchTime = 0;

    await h.rateLimitedSearch(noop, 'kad');
    assert.equal(h.lastSearchTime, 0, 'Kad stamped the ED2K flood clock');
  });

  it('stamps the clock for an ED2K search', async () => {
    const h = handler();
    h.lastSearchTime = 0;

    await h.rateLimitedSearch(noop, 'global');
    assert.ok(h.lastSearchTime > 0, 'an ED2K search must stamp the clock');
  });

  it('stamps the clock even when the search throws', async () => {
    const h = handler();
    h.lastSearchTime = 0;

    await assert.rejects(() => h.rateLimitedSearch(async () => { throw new Error('refused'); }, 'global'));
    assert.ok(h.lastSearchTime > 0, 'a failed ED2K search still hit the server');
  });
});
