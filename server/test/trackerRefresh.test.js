const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const BaseClientManager = require('../lib/BaseClientManager');
const { QbittorrentManager } = require('../modules/qbittorrentManager');
const { DelugeManager } = require('../modules/delugeManager');
const { TransmissionManager } = require('../modules/transmissionManager');
const { readIntervalMs, readChoice, hasDemand, markApiRead, resetDemand } = require('../lib/refreshPolicy');

// The tracker/peer scan used to run on a fixed 10s setInterval that never
// waited for the previous pass, over every torrent, whether or not anyone was
// looking. On a large qBittorrent library that is two API requests per torrent
// every 10s, and passes piled up once one took longer than the interval (#99).

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const viewers = (n) => ({ clients: { size: n } });

/**
 * Manager whose scan takes `scanMs`, recording what it scanned and how many
 * scans ran at once.
 */
function makeManager({ items = [], scanMs = 0, wss = viewers(1), scope = 'all' } = {}) {
  const m = new BaseClientManager();
  m.log = m.warn = m.error = () => {};
  m.client = {};
  m.wss = wss;
  m._trackerRefreshIntervalMs = 5;
  m._trackerRefreshScope = scope;
  m.items = items;
  m.scans = [];
  m.running = 0;
  m.maxRunning = 0;
  m._getItemsForTrackerRefresh = async () => m.items;
  m._fetchTrackersAndPeers = async (batch) => {
    m.running++;
    m.maxRunning = Math.max(m.maxRunning, m.running);
    m.scans.push(batch.map(i => i.hash));
    await sleep(scanMs);
    m.running--;
    const trackersByHash = new Map(batch.map(i => [i.hash, { trackersDetailed: [{ url: `t-${i.hash}` }] }]));
    const peersByHash = new Map(batch.map(i => [i.hash, [{ address: '10.0.0.1' }]]));
    return { trackersByHash, peersByHash };
  };
  return m;
}

const item = (hash, active = false) => ({ hash, active });

describe('tracker refresh loop', () => {
  it('never runs two passes at once, however slow a pass is', async () => {
    const m = makeManager({ items: [item('a')], scanMs: 40 });
    m.startTrackerRefresh();
    await sleep(200);
    m.stopTrackerRefresh();
    assert.ok(m.scans.length >= 2, `expected several passes, got ${m.scans.length}`);
    assert.equal(m.maxRunning, 1);
  });

  it('starts one loop when start is called again during the first pass', async () => {
    // The guard used to be set only after the first pass, which on a large
    // library is the slow one; a reconnect in that window started a second loop.
    const m = makeManager({ items: [item('a')], scanMs: 40 });
    m.startTrackerRefresh();
    m.startTrackerRefresh();
    await sleep(150);
    m.stopTrackerRefresh();
    assert.equal(m.maxRunning, 1);
  });

  it('does not schedule another pass when stopped during one', async () => {
    const m = makeManager({ items: [item('a')], scanMs: 40 });
    m.startTrackerRefresh();
    await sleep(10);
    m.stopTrackerRefresh();
    await sleep(100);
    assert.equal(m.scans.length, 1);
  });

  it('can be started again after a stop', async () => {
    const m = makeManager({ items: [item('a')] });
    m.startTrackerRefresh();
    await sleep(20);
    m.stopTrackerRefresh();
    const before = m.scans.length;
    m.startTrackerRefresh();
    await sleep(20);
    m.stopTrackerRefresh();
    assert.ok(m.scans.length > before);
  });
});

describe('which torrents a pass scans', () => {
  beforeEach(() => resetDemand());

  it('scans everything with scope "all" while someone is reading', async () => {
    const m = makeManager({ items: [item('a'), item('b', true)] });
    await m.refreshAllTrackers();
    assert.deepEqual(m.scans, [['a', 'b']]);
  });

  it('scans only torrents never seen before when nobody is reading', async () => {
    // History still needs a tracker domain for each new torrent, once.
    const m = makeManager({ items: [item('a')], wss: viewers(0) });
    await m.refreshAllTrackers();
    m.items = [item('a'), item('b')];
    await m.refreshAllTrackers();
    await m.refreshAllTrackers();
    assert.deepEqual(m.scans, [['a'], ['b']]);
  });

  it('counts a recent API read as someone reading', async () => {
    const m = makeManager({ items: [item('a')], wss: viewers(0) });
    await m.refreshAllTrackers();
    markApiRead();
    await m.refreshAllTrackers();
    assert.deepEqual(m.scans, [['a'], ['a']]);
  });

  it('with scope "active", scans active torrents plus any never seen', async () => {
    const m = makeManager({ items: [item('idle'), item('busy', true)], scope: 'active' });
    m._isTrackerRefreshActive = (i) => i.active;
    await m.refreshAllTrackers();   // first pass: both unseen
    await m.refreshAllTrackers();
    assert.deepEqual(m.scans, [['idle', 'busy'], ['busy']]);
  });

  it('keeps tracker lists of skipped torrents but drops their peers', async () => {
    // Peers are live: kept, they would show old upload rates as current ones.
    const m = makeManager({ items: [item('idle'), item('busy', true)], scope: 'active' });
    m._isTrackerRefreshActive = (i) => i.active;
    await m.refreshAllTrackers();
    await m.refreshAllTrackers();
    assert.ok(m._trackerCache.has('idle'));
    assert.equal(m._peerCache.has('idle'), false);
    assert.ok(m._peerCache.has('busy'));
  });

  it('drops cache entries for torrents that no longer exist', async () => {
    const m = makeManager({ items: [item('a'), item('b')] });
    await m.refreshAllTrackers();
    m.items = [item('a')];
    await m.refreshAllTrackers();
    assert.deepEqual([...m._trackerCache.keys()], ['a']);
    assert.deepEqual([...m._peerCache.keys()], ['a']);
  });
});

describe('refreshTrackersFor (opening an item)', () => {
  it('returns a fresh cached list without fetching', async () => {
    const m = makeManager({ items: [item('a')] });
    await m.refreshAllTrackers();
    m._trackerRefreshIntervalMs = 60000;
    const out = await m.refreshTrackersFor('A');
    assert.deepEqual(out, [{ url: 't-a' }]);
    assert.equal(m.scans.length, 1);
  });

  it('fetches a stale or missing entry', async () => {
    const m = makeManager({ items: [item('a')] });
    const out = await m.refreshTrackersFor('a');
    assert.deepEqual(out, [{ url: 't-a' }]);
    assert.deepEqual(m.scans, [['a']]);
  });

  it('gives up after the timeout and returns what it has', async () => {
    const m = makeManager({ items: [item('a')], scanMs: 200 });
    const started = Date.now();
    const out = await m.refreshTrackersFor('a', 20);
    assert.equal(out, null);
    assert.ok(Date.now() - started < 150);
  });
});

describe('what counts as active, per client', () => {
  it('qBittorrent', () => {
    const q = new QbittorrentManager();
    assert.equal(q._isTrackerRefreshActive({ upspeed: 10, progress: 1, state: 'uploading' }), true);
    assert.equal(q._isTrackerRefreshActive({ num_leechs: 1, progress: 1, state: 'stalledUP' }), true);
    assert.equal(q._isTrackerRefreshActive({ progress: 0.4, state: 'stalledDL' }), true);
    assert.equal(q._isTrackerRefreshActive({ progress: 0.4, state: 'pausedDL' }), false);
    assert.equal(q._isTrackerRefreshActive({ progress: 0.4, state: 'stoppedDL' }), false);
    assert.equal(q._isTrackerRefreshActive({ progress: 1, state: 'stalledUP' }), false);
  });

  it('Deluge', () => {
    const d = new DelugeManager();
    assert.equal(d._isTrackerRefreshActive({ upload_payload_rate: 5, state: 'Seeding' }), true);
    assert.equal(d._isTrackerRefreshActive({ num_peers: 2, state: 'Seeding' }), true);
    assert.equal(d._isTrackerRefreshActive({ state: 'Downloading' }), true);
    assert.equal(d._isTrackerRefreshActive({ state: 'Seeding' }), false);
    assert.equal(d._isTrackerRefreshActive({ state: 'Paused' }), false);
  });

  it('Transmission', () => {
    const t = new TransmissionManager();
    assert.equal(t._isTrackerRefreshActive({ rateUpload: 5, status: 6 }), true);
    assert.equal(t._isTrackerRefreshActive({ peersConnected: 1, status: 6 }), true);
    assert.equal(t._isTrackerRefreshActive({ status: 4 }), true);
    assert.equal(t._isTrackerRefreshActive({ status: 6 }), false);
    assert.equal(t._isTrackerRefreshActive({ status: 0 }), false);
  });
});

describe('refresh settings from the environment', () => {
  it('uses the default when unset or empty', () => {
    assert.equal(readIntervalMs('X', 3000, 1000, {}), 3000);
    assert.equal(readIntervalMs('X', 3000, 1000, { X: '' }), 3000);
  });

  it('accepts a whole number at or above the minimum', () => {
    assert.equal(readIntervalMs('X', 3000, 1000, { X: '120000' }), 120000);
    assert.equal(readIntervalMs('X', 3000, 1000, { X: '1000' }), 1000);
  });

  it('falls back on anything else', () => {
    for (const bad of ['abc', '0', '-5', '999', '1.5', 'Infinity', '1e9x']) {
      assert.equal(readIntervalMs('X', 3000, 1000, { X: bad }), 3000, bad);
    }
  });

  it('reads a choice case-insensitively and falls back on unknown values', () => {
    assert.equal(readChoice('S', ['all', 'active'], 'all', { S: 'Active' }), 'active');
    assert.equal(readChoice('S', ['all', 'active'], 'all', { S: 'some' }), 'all');
    assert.equal(readChoice('S', ['all', 'active'], 'all', {}), 'all');
  });
});

describe('hasDemand', () => {
  beforeEach(() => resetDemand());

  it('is true with a browser connected', () => assert.equal(hasDemand(viewers(1)), true));
  it('is false with no browser and no API read', () => assert.equal(hasDemand(viewers(0)), false));
  it('is true after an API read', () => { markApiRead(); assert.equal(hasDemand(viewers(0)), true); });
  it('assumes yes when there is no WebSocket server to ask', () => assert.equal(hasDemand(undefined), true));
});
