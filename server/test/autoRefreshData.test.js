const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const autoRefreshManager = require('../modules/autoRefreshManager');
const dataFetchService = require('../lib/DataFetchService');
const registry = require('../lib/ClientRegistry');
const webSocketHandlers = require('../modules/webSocketHandlers');
const { resetDemand } = require('../lib/refreshPolicy');
const config = require('../modules/config');

// The item lists used to be fetched on every 3s cycle whenever a browser was
// open, and not at all otherwise, which left HTTP API readers with stale data
// (#99). Now they refresh on their own interval while anyone is reading, and
// the API snapshot refreshes itself when stale.

const fakeClient = {
  displayName: 'test',
  _clientConfig: {},
  isConnected: () => true,
  isEnabled: () => false,          // keeps the health check out of the way
  getStats: async () => ({}),
  extractMetrics: () => ({ uploadSpeed: 0, downloadSpeed: 0 }),
  getNetworkStatus: () => null
};

let fetches;
const originalFetch = dataFetchService.getBatchData;

function setup({ browsers = 1 } = {}) {
  resetDemand();
  fetches = 0;
  dataFetchService.getBatchData = async () => { fetches++; return { items: [], categories: [] }; };
  registry.register('qbittorrent-test', 'qbittorrent', fakeClient);
  Object.assign(autoRefreshManager, {
    wss: { clients: { size: browsers } },
    broadcast: () => {},
    metricsDB: { insertInstanceMetrics: () => {} },
    downloadHistoryDB: null,
    log: () => {}, warn: () => {}, error: () => {},
    _lastBatchData: null, _lastDataFetch: 0, _cachedBatchUpdate: null, _cachedAt: 0
  });
}

describe('item list refresh', () => {
  beforeEach(() => setup());
  afterEach(() => {
    registry.unregister('qbittorrent-test');
    dataFetchService.getBatchData = originalFetch;
  });

  it('reuses the item lists until the data interval has passed', async () => {
    await autoRefreshManager._runCycle();
    await autoRefreshManager._runCycle();
    assert.equal(fetches, 1);
    // Stats are rebuilt on every cycle regardless.
    assert.ok(autoRefreshManager.getCachedBatchUpdate()?.data?.stats);
  });

  it('fetches on the next cycle once marked stale', async () => {
    // After an action, or when a browser connects.
    await autoRefreshManager._runCycle();
    autoRefreshManager.markDataStale();
    await autoRefreshManager._runCycle();
    assert.equal(fetches, 2);
  });

  it('lets history wait for the next fetch while someone is reading', async () => {
    // Otherwise history's own 30s timer adds fetches on top of the data interval.
    const originalGetConfig = config.getConfig;
    const originalUpdate = autoRefreshManager.updateHistoryStatus;
    let historyRuns = 0;
    config.getConfig = () => ({ history: { enabled: true } });
    autoRefreshManager.downloadHistoryDB = {};
    autoRefreshManager.updateHistoryStatus = () => { historyRuns++; };
    try {
      await autoRefreshManager._runCycle();            // first fetch, history runs
      autoRefreshManager._lastHistoryUpdate = 0;       // history due again
      await autoRefreshManager._runCycle();            // data not due: no fetch
      assert.equal(fetches, 1);
      assert.equal(historyRuns, 1);
      autoRefreshManager.markDataStale();
      await autoRefreshManager._runCycle();            // next fetch carries history
      assert.equal(fetches, 2);
      assert.equal(historyRuns, 2);
    } finally {
      config.getConfig = originalGetConfig;
      autoRefreshManager.updateHistoryStatus = originalUpdate;
      autoRefreshManager.downloadHistoryDB = null;
    }
  });

  it('fetches nothing with nobody reading', async () => {
    autoRefreshManager.wss = { clients: { size: 0 } };
    await autoRefreshManager._runCycle();
    assert.equal(fetches, 0);
  });
});

describe('API snapshot', () => {
  beforeEach(() => setup({ browsers: 0 }));
  afterEach(() => {
    registry.unregister('qbittorrent-test');
    dataFetchService.getBatchData = originalFetch;
  });

  it('refreshes before answering when nothing is cached', async () => {
    const snapshot = await autoRefreshManager.getFreshBatchUpdate();
    assert.equal(fetches, 1);
    assert.ok(snapshot?.data?.items);
  });

  it('answers from the cache while it is current', async () => {
    await autoRefreshManager.getFreshBatchUpdate();
    await autoRefreshManager.getFreshBatchUpdate();
    assert.equal(fetches, 1);
  });

  it('refreshes a stale cache', async () => {
    await autoRefreshManager.getFreshBatchUpdate();
    autoRefreshManager._cachedAt = 0;
    await autoRefreshManager.getFreshBatchUpdate();
    assert.equal(fetches, 2);
  });

  it('keeps the loop fetching for a while after an API read', async () => {
    // A poller should get current data from the loop, not a refresh per call.
    await autoRefreshManager.getFreshBatchUpdate();
    autoRefreshManager.markDataStale();
    await autoRefreshManager._runCycle();
    assert.equal(fetches, 2);
  });
});

describe('the refresh loop', () => {
  it('does not reschedule when stopped during a cycle', async () => {
    let release;
    const original = autoRefreshManager._runCycle;
    autoRefreshManager._runCycle = () => new Promise(r => { release = r; });
    autoRefreshManager._stopped = false;
    const loop = autoRefreshManager.autoRefreshLoop();
    autoRefreshManager.stop();
    release();
    await loop;
    assert.equal(autoRefreshManager.refreshInterval, null);
    autoRefreshManager._runCycle = original;
  });
});

describe('actions mark the item lists stale', () => {
  it('after a handler that changes something, not after a read', () => {
    let marked = 0;
    const original = autoRefreshManager.markDataStale;
    autoRefreshManager.markDataStale = () => { marked++; };
    webSocketHandlers.afterAction('handleBatchPause');
    webSocketHandlers.afterAction('handleAddMagnetLinks');
    webSocketHandlers.afterAction('handleGetLog');
    webSocketHandlers.afterAction('handleRequestFullSnapshot');
    autoRefreshManager.markDataStale = original;
    assert.equal(marked, 2);
  });
});
