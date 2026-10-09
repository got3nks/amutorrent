const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { RucioManager } = require('../modules/rucioManager.js');

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
      lastSharedFiles: [{ hash: 'aa', path: '/data/f.mkv' }]
    });

    const res = await m.deleteItem('AA', { deleteFiles: true });

    assert.deepEqual(calls.cancel, [], 'a completed download is never cancelled');
    assert.deepEqual(calls.remove, [5]);
    assert.deepEqual(calls.unshare, ['aa']);
    assert.deepEqual(res.pathsToDelete, ['/data/f.mkv']);
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
