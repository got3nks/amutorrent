const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeAmuleDownload, normalizeAmuleSharedFile } = require('../lib/downloadNormalizer');
const { assembleUnifiedItems } = require('../lib/unifiedItemBuilder');
const { convertToQBittorrentInfo } = require('../lib/qbittorrent/stateMapping');
const QBittorrentHandler = require('../lib/qbittorrent/QBittorrentHandler');
const DataFetchService = require('../lib/DataFetchService');

// #100: Sonarr/Radarr imported before aMule had the file in its category folder.

const HASH = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const INSTANCE = 'amule-test-4712';

function rawDownload(overrides = {}) {
  return {
    fileName: 'Placeholder.Movie.mkv',
    fileHash: HASH,
    fileSize: 1000,
    fileSizeDownloaded: 1000,
    gapStatus: [],
    status: 0,
    category: 2,
    ...overrides
  };
}

function itemFromDownload(raw) {
  const download = { ...normalizeAmuleDownload(raw, () => 'Movies'), instanceId: INSTANCE };
  return assembleUnifiedItems([download], [])[0];
}

describe('aMule completion (#100)', () => {
  it('is not complete while aMule is still hashing and moving the file', () => {
    const item = itemFromDownload(rawDownload({ status: 8 }));
    assert.equal(item.complete, false);
    assert.equal(item.status, 'moving');
  });

  it('is not complete when raw bytes reach the size but gaps remain', () => {
    const item = itemFromDownload(rawDownload({ gapStatus: [{ start: 0, end: 99 }] }));
    assert.equal(item.complete, false);
  });

  it('is complete once aMule reports PS_COMPLETE', () => {
    const item = itemFromDownload(rawDownload({ status: 9 }));
    assert.equal(item.complete, true);
  });
});

describe('qBittorrent state while aMule finishes (#100)', () => {
  const base = { fileName: 'Placeholder.Movie.mkv', fileSize: 1000, fileSizeDownloaded: 1000 };

  it('never reports 100% before the completion flag', () => {
    const info = convertToQBittorrentInfo({ ...base, isComplete: false, status: 'active' });
    assert.ok(info.progress < 1);
    assert.notEqual(info.state, 'pausedUP');
  });

  it('reports moving during the final hash and move', () => {
    const info = convertToQBittorrentInfo({ ...base, isComplete: false, status: 'moving' });
    assert.equal(info.state, 'moving');
  });

  it('reports pausedUP once complete', () => {
    const info = convertToQBittorrentInfo({ ...base, fileSizeDownloaded: 900, isComplete: true });
    assert.equal(info.progress, 1);
    assert.equal(info.state, 'pausedUP');
  });
});

describe('qBittorrent category for a finished file (#100)', () => {
  afterEach(() => DataFetchService.invalidateBatchCache());

  const amuleCategories = [
    { id: 0, title: 'all', path: '/downloads/incoming' },
    { id: 1, title: 'Series', path: '/downloads/series' },
    { id: 2, title: 'Movies', path: '/downloads/movies' }
  ];

  async function torrentsInfo(unifiedCategories, fileDir, category) {
    const shared = {
      ...normalizeAmuleSharedFile({
        fileName: 'Placeholder.Movie.mkv',
        fileHash: HASH,
        fileSize: 1000,
        path: fileDir
      }, unifiedCategories),
      instanceId: INSTANCE
    };
    DataFetchService._cachedBatchData = { items: assembleUnifiedItems([], [shared]) };
    DataFetchService._cacheTimestamp = Date.now();

    const handler = new QBittorrentHandler();
    handler.getAmuleInstanceId = () => INSTANCE;
    handler.hashStore = { getMagnetHash: () => null };
    handler.categoryCacheInitialized = true;
    handler.categoriesCache = amuleCategories;

    let body;
    await handler.getTorrentsInfo({ query: { category } }, { json: (b) => { body = b; } });
    return body;
  }

  it('keeps it in a category our list does not know yet', async () => {
    // Created through createCategory, so not imported into our list.
    const body = await torrentsInfo([{ id: 0, title: 'Default', path: '' }], '/downloads/movies', 'Movies');
    assert.equal(body.length, 1);
    assert.equal(body[0].category, 'Movies');
    assert.equal(body[0].content_path, '/downloads/movies/Placeholder.Movie.mkv');
    assert.equal(body[0].state, 'pausedUP');
  });

  it('keeps it in its category when our ids differ from aMule ids', async () => {
    const body = await torrentsInfo([
      { id: 0, title: 'Default', path: '' },
      { id: 1, title: 'Movies', path: '/downloads/movies' },
      { id: 2, title: 'Series', path: '/downloads/series' }
    ], '/downloads/movies', 'Movies');
    assert.equal(body.length, 1);
    assert.equal(body[0].content_path, '/downloads/movies/Placeholder.Movie.mkv');
  });

  it('puts a file outside every category folder in aMule category 0', async () => {
    const body = await torrentsInfo([{ id: 0, title: 'Default', path: '' }], '/elsewhere', 'all');
    assert.equal(body.length, 1);
  });
});
