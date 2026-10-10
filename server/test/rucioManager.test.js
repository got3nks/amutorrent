const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { RucioManager } = require('../modules/rucioManager.js');
const { normalizeRucioSharedFile } = require('../lib/downloadNormalizer.js');
const RucioClient = require('../lib/rucio/RucioClient.js');
const clientMeta = require('../lib/clientMeta.js');
const { isCompletedShare, movesSharedForCategoryChange, clientManagesDeletion } = require('../lib/sharedFilePolicy.js');

// Build a RucioManager without running the constructor (which would need a
// client config); we drive the methods under test directly with mocks.
function makeManager(overrides = {}) {
  const m = Object.create(RucioManager.prototype);
  m.log = () => {};
  m.warn = () => {};
  m.error = () => {};
  m.trackDeletion = () => {};
  m.trackDownload = () => {};
  m.instanceId = 'rucio-1';
  Object.assign(m, overrides);
  return m;
}

describe('RucioManager.onConnectSync', () => {
  function makeCategoryManager(appCats) {
    const calls = { imported: [], addSource: [], propagate: 0, saved: 0 };
    const cm = {
      getByName: (n) => (appCats.has(n) ? appCats.get(n) : null),
      addSource: (n, s) => calls.addSource.push([n, s]),
      importCategory: (o) => { calls.imported.push(o); appCats.set(o.name, { color: o.color }); },
      getCategoriesSnapshot: () => ({ entries: () => Array.from(appCats.entries()) }),
      propagateToOtherClients: async () => { calls.propagate++; },
      save: async () => { calls.saved++; }
    };
    return { cm, calls };
  }

  const daemonCats = [
    { id: 1, name: 'Movies', color: '#ff0000', download_dir: '/daemon/movies' },
    { id: 2, name: 'Shared', color: '#00ff00', download_dir: null },
    { id: 3, name: 'Default', color: null }
  ];

  it('imports new daemon categories and re-sources known ones (sync-out)', async () => {
    const created = [];
    const m = makeManager({
      client: { getCategories: async () => daemonCats },
      _createCategoryRaw: async ({ name, color, path }) => { created.push({ name, color, path }); return { id: 99, name }; },
      isCategorySyncOut: () => true,
      isCategorySyncIn: () => false
    });
    const appCats = new Map([['Shared', { color: '#111' }], ['Default', {}]]);
    const { cm, calls } = makeCategoryManager(appCats);

    await m.onConnectSync(cm);

    assert.equal(calls.imported.length, 1);
    assert.equal(calls.imported[0].name, 'Movies');
    assert.equal(calls.imported[0].source, 'rucio-1');
    assert.equal(calls.imported[0].color, '#ff0000');
    assert.deepEqual(calls.addSource, [['Shared', 'rucio-1']]);
    assert.equal(calls.propagate, 1, 'propagates on sync-out');
    assert.equal(created.length, 0, 'does not push when sync-in is off');
  });

  it('pushes app-only categories to the daemon (sync-in)', async () => {
    const created = [];
    const m = makeManager({
      client: { getCategories: async () => daemonCats },
      _createCategoryRaw: async ({ name, color, path }) => { created.push({ name, color, path }); return { id: 99, name }; },
      isCategorySyncOut: () => false,
      isCategorySyncIn: () => true
    });
    const appCats = new Map([
      ['Shared', { color: '#111' }],        // already on the daemon → skip
      ['Music', { color: '#abc', path: '/app/music' }], // app-only → push
      ['Default', {}]                        // never pushed
    ]);
    const { cm, calls } = makeCategoryManager(appCats);

    await m.onConnectSync(cm);

    assert.equal(created.length, 1);
    assert.equal(created[0].name, 'Music');
    assert.equal(created[0].path, '/app/music');
    assert.equal(calls.propagate, 0, 'no propagate when sync-out is off');
  });

  it('is a no-op without a client', async () => {
    const m = makeManager({ client: null });
    // Should not throw.
    await m.onConnectSync({ getByName: () => null });
  });
});

describe('RucioManager._mapSearchResults', () => {
  it('groups results sharing a hash and takes the richest source count', () => {
    const m = makeManager({ lastDownloads: [], lastSharedFiles: [], _lastSearch: {} });
    const md4 = 'aa'.repeat(16);
    const detail = { results: [
      { name: 'Movie.A.mkv', size: 100, peer_count: 3, source: 'emule', download_link: `ed2k://|file|Movie.A.mkv|100|${md4}|/` },
      { name: 'Movie.B.mkv', size: 100, peer_count: 5, source: 'emule', download_link: `ed2k://|file|Movie.B.mkv|100|${md4}|/` },
      { name: 'Other.mkv', size: 200, peer_count: 2, source: 'rucio', download_link: `rucio:${'bb'.repeat(32)}?name=Other.mkv&size=200` }
    ] };

    const out = m._mapSearchResults(7, detail);

    assert.equal(out.results.length, 2, 'two distinct hashes → two rows');
    const grouped = out.results.find(r => r.fileHash === md4);
    assert.equal(grouped.fileName, 'Movie.B.mkv', 'richest variant is the parent');
    assert.equal(grouped.sourceCount, 5, 'source count is the max, not the sum');
    assert.equal(grouped.children.length, 1);
    assert.equal(grouped.children[0].fileName, 'Movie.A.mkv');
  });

  it('skips results whose link carries no hash', () => {
    const m = makeManager({ lastDownloads: [], lastSharedFiles: [], _lastSearch: {} });
    const out = m._mapSearchResults(1, { results: [{ name: 'x', size: 1, peer_count: 1, download_link: 'not-a-link' }] });
    assert.equal(out.results.length, 0);
  });
});

describe('RucioManager.deleteItem', () => {
  function makeClientSpy(overrides = {}) {
    const calls = { cancel: [], remove: [], unshare: [] };
    const client = {
      cancelDownload: async (id) => calls.cancel.push(id),
      removeDownload: async (id) => calls.remove.push(id),
      unshare: async (h) => calls.unshare.push(h),
      ...overrides
    };
    return { client, calls };
  }

  it('removes (and unshares) a completed download without cancelling it', async () => {
    const { client, calls } = makeClientSpy();
    const m = makeManager({
      client,
      hashToId: new Map([['aa', 5]]),
      lastDownloads: [{ hash: 'aa', isComplete: true }],
      // path is the containing folder; the full file path lives in raw.path
      lastSharedFiles: [{ hash: 'aa', path: '/data', raw: { path: '/data/f.mkv' } }]
    });

    const res = await m.deleteItem('AA', { deleteFiles: true });

    assert.deepEqual(calls.cancel, [], 'a completed download is never cancelled');
    assert.deepEqual(calls.remove, [5]);
    assert.deepEqual(calls.unshare, ['aa']);
    assert.deepEqual(res.pathsToDelete, ['/data/f.mkv'], 'wipes the real file path, not the folder');
  });

  it('cancels then removes an active download', async () => {
    const { client, calls } = makeClientSpy();
    const m = makeManager({
      client,
      hashToId: new Map([['bb', 9]]),
      lastDownloads: [{ hash: 'bb', isComplete: false }],
      lastSharedFiles: []
    });

    await m.deleteItem('BB', {});

    assert.deepEqual(calls.cancel, [9]);
    assert.deepEqual(calls.remove, [9]);
    assert.deepEqual(calls.unshare, [], 'not shared → not unshared');
  });

  it('only unshares a pure shared file', async () => {
    const { client, calls } = makeClientSpy();
    const m = makeManager({
      client,
      hashToId: new Map(),
      lastDownloads: [],
      lastSharedFiles: [{ hash: 'cc', path: '/s/x' }]
    });

    const res = await m.deleteItem('CC', { deleteFiles: false });

    assert.deepEqual(calls.remove, []);
    assert.deepEqual(calls.unshare, ['cc']);
    assert.deepEqual(res.pathsToDelete, [], 'no path without deleteFiles');
  });

  it('propagates a refused removeDownload instead of reporting success', async () => {
    const { client } = makeClientSpy({ removeDownload: async () => { throw new Error('refused'); } });
    const m = makeManager({
      client,
      hashToId: new Map([['aa', 5]]),
      lastDownloads: [{ hash: 'aa', isComplete: true }],
      lastSharedFiles: []
    });

    await assert.rejects(() => m.deleteItem('AA', {}), /refused/);
  });
});

describe('RucioManager._getAllShares', () => {
  it('pages through the daemon\'s capped share list', async () => {
    const pages = [
      Array.from({ length: 1000 }, (_, i) => ({ root_hash: `a${i}` })),
      Array.from({ length: 1000 }, (_, i) => ({ root_hash: `b${i}` })),
      Array.from({ length: 10 }, (_, i) => ({ root_hash: `c${i}` }))
    ];
    let calls = 0;
    const m = makeManager({ client: { getShares: async ({ offset }) => { calls++; return { shares: pages[offset / 1000] || [], total: 2010 }; } } });

    const { shares } = await m._getAllShares();

    assert.equal(shares.length, 2010, 'collects every page, not just the first 1000');
    assert.equal(calls, 3, 'stops once the reported total is reached');
  });

  it('pages past a server page shorter than the requested limit', async () => {
    // Daemon caps a page at 500 even though we asked for 1000: a short page is
    // not the last one — keep going until `total`.
    let calls = 0;
    const m = makeManager({ client: { getShares: async ({ offset }) => {
      calls++;
      return { shares: Array.from({ length: offset < 500 ? 500 : 10 }, (_, i) => ({ root_hash: `${offset}-${i}` })), total: 510 };
    } } });

    const { shares } = await m._getAllShares();

    assert.equal(shares.length, 510, 'does not stop on the first short page');
    assert.equal(calls, 2);
  });

  it('stops on an empty page when offset is ignored (no infinite loop)', async () => {
    let calls = 0;
    const m = makeManager({ client: { getShares: async () => {
      calls++;
      // Ignores offset: first call returns 3, then empties (backstop).
      return calls === 1 ? { shares: [{ root_hash: 'x' }, { root_hash: 'y' }, { root_hash: 'z' }] } : { shares: [] };
    } } });

    const { shares } = await m._getAllShares();

    assert.equal(shares.length, 3);
    assert.ok(calls <= 2, 'the empty-page backstop stops it');
  });

  it('stops when a full page repeats, with no total and ignored offset (7)', async () => {
    // A daemon that reports no total and ignores offset serves the same full
    // page forever — stop as soon as a page repeats, before re-adding it, so it
    // costs two requests and no duplicates (not a million).
    let calls = 0;
    const samePage = Array.from({ length: 1000 }, (_, i) => ({ root_hash: `a${i}` }));
    const m = makeManager({ client: { getShares: async () => { calls++; return { shares: samePage }; } } });

    const { shares } = await m._getAllShares();

    assert.equal(shares.length, 1000, 'the repeated page is added once, not duplicated');
    assert.equal(calls, 2, 'detected the repeat on the second request');
  });
});

describe('RucioManager.getNetworkStatus', () => {
  it('reads a reachable node as Connected in either casing', () => {
    const m = makeManager();
    assert.equal(m.getNetworkStatus({ status: { connected_peers: 3, class: 'HighId' } }).text, 'Connected');
    assert.equal(m.getNetworkStatus({ status: { connected_peers: 3, class: 'high_id' } }).text, 'Connected');
    assert.equal(m.getNetworkStatus({ status: { connected_peers: 3, class: 'LowId' } }).text, 'Limited');
    assert.equal(m.getNetworkStatus({ status: { connected_peers: 0 } }).connected, false);
  });
});

describe('RucioManager.ensureCategoriesBatch', () => {
  it('resolves a whole set from one category fetch', async () => {
    let getCount = 0, createCount = 0;
    const m = makeManager({ client: {
      getCategories: async () => { getCount++; return [{ id: 1, name: 'Movies' }]; },
      createCategory: async ({ name }) => { createCount++; return { id: 100 + createCount, name }; }
    } });

    const out = await m.ensureCategoriesBatch([
      { name: 'Movies' }, { name: 'TV' }, { name: 'Music' }, { name: 'TV' }
    ]);

    assert.equal(getCount, 1, 'one list fetch for the whole batch');
    assert.equal(createCount, 2, 'TV and Music created once each; the second TV reuses the first');
    assert.deepEqual(out.map(o => o.name), ['Movies', 'TV', 'Music', 'TV']);
  });
});

describe('RucioManager._updateCategoryRaw', () => {
  it('keeps the daemon download_dir and match_keywords when ours are empty', async () => {
    const puts = [];
    const m = makeManager({
      lastCategories: [{ id: 7, name: 'Movies', color: '#111', download_dir: '/daemon/movies', match_keywords: '1080p|bluray' }],
      client: { updateCategory: async (id, body) => { puts.push({ id, body }); return { id }; } }
    });

    await m._updateCategoryRaw(7, { name: 'Films', color: '#00ff00', path: undefined });

    assert.equal(puts.length, 1);
    assert.equal(puts[0].body.download_dir, '/daemon/movies', 'daemon dir preserved');
    assert.equal(puts[0].body.match_keywords, '1080p|bluray', 'keyword rules preserved');
    assert.equal(puts[0].body.name, 'Films');
  });

  it('uses our path when we have one', async () => {
    const puts = [];
    const m = makeManager({
      lastCategories: [{ id: 7, name: 'Movies', download_dir: '/daemon/movies' }],
      client: { updateCategory: async (id, body) => { puts.push({ id, body }); return { id }; } }
    });

    await m._updateCategoryRaw(7, { name: 'Movies', path: '/app/movies' });

    assert.equal(puts[0].body.download_dir, '/app/movies');
  });
});

describe('RucioManager.fetchData category list', () => {
  it('keeps the last category list when the fetch fails (no empty cache)', async () => {
    const m = makeManager({
      lastCategories: [{ id: 7, name: 'Movies' }],
      hashToId: new Map(),
      client: {
        getDownloads: async () => [{ id: 1, root_hash: 'aa', name: 'x', size: 10, bytes_done: 10, state: 'completed', category_id: 7 }],
        getShares: async () => ({ shares: [], total: 0 }),
        getCategories: async () => { throw new Error('boom'); }
      }
    });

    const { downloads } = await m.fetchData();

    assert.deepEqual(m.lastCategories, [{ id: 7, name: 'Movies' }], 'kept the previous list');
    assert.equal(downloads[0].categoryName, 'Movies', 'name resolves from the kept list, not Default');
  });
});

describe('normalizeRucioSharedFile', () => {
  it('emits the containing folder as path and keeps the full path in raw', () => {
    const n = normalizeRucioSharedFile({ root_hash: 'aa', name: 'f.mkv', size: 10, path: '/data/sub/f.mkv', magnet: 'rucio:aa' });
    assert.equal(n.path, '/data/sub', 'path is the containing folder (resolveItemPath joins the name)');
    assert.equal(n.raw.path, '/data/sub/f.mkv', 'full file path preserved in raw');
  });
});

describe('RucioManager.extractHistoryMetadata', () => {
  it('keeps a shared file\'s folder path without stripping a level', () => {
    const m = makeManager();
    // normalizeRucioSharedFile already emits the containing folder, so the
    // history record must keep it verbatim, not strip to the parent.
    const meta = m.extractHistoryMetadata({
      hash: 'AA', name: 'f.mkv', size: 10, instanceId: 'rucio-1', path: '/data/movies'
    });
    assert.equal(meta.directory, '/data/movies');
    assert.equal(meta.hash, 'aa', 'hash is lower-cased');
    assert.equal(meta.downloaded, 10, 'a share (no progress) counts as fully downloaded');
  });

  it('reports no directory for a download (no path)', () => {
    const m = makeManager();
    const meta = m.extractHistoryMetadata({ hash: 'bb', name: 'g.mkv', size: 20, progress: 0.5, downloaded: 10 });
    assert.equal(meta.directory, null);
    assert.equal(meta.downloaded, 10);
  });
});

describe('sharedFilePolicy with a Rucio item', () => {
  const rucioCaps = clientMeta.get('rucio').capabilities;
  const amuleCaps = clientMeta.get('amule').capabilities;
  const completedShare = { shared: true, downloading: false };
  const activeDownload = { shared: false, downloading: true };

  it('identifies a completed Rucio share but not an active download', () => {
    assert.equal(isCompletedShare(rucioCaps, completedShare), true);
    assert.equal(isCompletedShare(rucioCaps, activeDownload), false);
  });

  it('recategorises a completed Rucio share via the API, not a disk move (bug 2)', () => {
    // Rucio declares moveSharedForCategoryChange:false, so the category change
    // must reach the daemon instead of moving the file behind it.
    assert.equal(movesSharedForCategoryChange(rucioCaps, completedShare), false);
    // aMule, which must move the file to recategorise it, still moves.
    assert.equal(movesSharedForCategoryChange(amuleCaps, completedShare), true);
  });

  it('checks the path before deleting any COMPLETE Rucio item (bug 3 / A)', () => {
    // Keyed on completeness, not sharedness: a completed download that isn't in
    // the share list yet (or never shared) still hands its path back, so the
    // "managed" shortcut must not apply.
    assert.equal(clientManagesDeletion(rucioCaps, true), false);
  });

  it('still treats a cancelled unfinished Rucio download as client-managed (bug 3)', () => {
    // cancelDeletesFiles applies to an unfinished download: the daemon discards
    // the partial, so no path check is needed.
    assert.equal(clientManagesDeletion(rucioCaps, false), true);
  });
});

describe('RucioManager.deleteItem', () => {
  it('finds a completed download\'s path from the daemon when not in shares (A)', async () => {
    let cancelled = false, removed = false, askedDetail = null;
    const m = makeManager({
      lastSharedFiles: [], // not in the share list (just completed, or never shared)
      lastDownloads: [{ hash: 'aa', isComplete: true }],
      hashToId: new Map([['aa', 7]]),
      client: {
        getDownload: async (id) => { askedDetail = id; return { dest_path: '/data/done/f.mkv' }; },
        cancelDownload: async () => { cancelled = true; },
        removeDownload: async () => { removed = true; },
        unshare: async () => {}
      }
    });
    const res = await m.deleteItem('aa', { deleteFiles: true });
    assert.deepEqual(res.pathsToDelete, ['/data/done/f.mkv'], 'wipes the daemon dest_path');
    assert.equal(askedDetail, 7, 'asked the daemon for the download detail');
    assert.equal(cancelled, false, 'a completed download is never cancelled');
    assert.equal(removed, true);
  });

  it('resets the share cache so a delete is reflected next poll (B)', async () => {
    const m = makeManager({
      _lastSharesFetch: Date.now(),
      lastSharedFiles: [{ hash: 'bb', path: '/data', raw: { path: '/data/f.mkv' } }],
      lastDownloads: [],
      hashToId: new Map(),
      client: { unshare: async () => {} }
    });
    await m.deleteItem('bb', { deleteFiles: false });
    assert.equal(m._lastSharesFetch, 0, 'share cache invalidated after delete');
  });
});

describe('RucioManager.search cancellation', () => {
  it('cancels the daemon search when a poll throws (F)', async () => {
    const realSetTimeout = global.setTimeout;
    global.setTimeout = (fn) => realSetTimeout(fn, 0); // don't actually wait 2s
    let cancelled = null;
    const m = makeManager({
      _lastSearch: { id: null, results: [], links: new Map() },
      client: {
        startSearch: async () => ({ id: 99 }),
        getSearch: async () => { throw new Error('poll failed'); },
        cancelSearch: async (id) => { cancelled = id; }
      }
    });
    try {
      await assert.rejects(() => m.search('matrix'), /poll failed/);
      assert.equal(cancelled, 99, 'cancelled the lingering daemon search');
    } finally {
      global.setTimeout = realSetTimeout;
    }
  });
});

describe('RucioClient._request timeout', () => {
  it('times out when the body stalls after the headers arrive', async () => {
    const origFetch = global.fetch;
    global.fetch = (url, opts) => Promise.resolve({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      // Headers arrive, but the body never does — rejects on abort, like fetch.
      text: () => new Promise((_, reject) => {
        opts.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      })
    });
    try {
      const c = new RucioClient({ host: 'h', port: 1, timeoutMs: 20 });
      await assert.rejects(() => c._request('GET', '/x'), /timed out/);
    } finally {
      global.fetch = origFetch;
    }
  });
});
