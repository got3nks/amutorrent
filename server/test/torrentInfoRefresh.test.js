const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const QBittorrentHandler = require('../lib/qbittorrent/QBittorrentHandler');

function makeDownload(overrides = {}) {
  return {
    fileName: 'Book.epub',
    fileHash: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
    fileSize: '1000',
    fileSizeDownloaded: '0',
    progress: '0',
    sourceCount: 0,
    speed: 0,
    priority: 1,
    category: null,
    status: 0,
    uploadSpeed: 0,
    ratio: 0,
    uploadTotal: 0,
    directory: '/incoming',
    ...overrides
  };
}

function makeHandler({ getEd2kHash = () => null } = {}) {
  const handler = new QBittorrentHandler();
  handler.hashStore = { getEd2kHash };
  handler.enrichDownload = async (item) => ({
    ...item,
    magnetHash: item.fileHash,
    categoryName: '',
    categoryPath: '/incoming'
  });
  return handler;
}

describe('QBittorrentHandler hash lookup refresh', () => {
  it('retries with a forced refresh when the cached snapshot misses', async () => {
    const handler = makeHandler();
    const download = makeDownload();

    let calls = 0;
    handler._getAmuleDownloads = async (forceRefresh) => {
      calls += 1;
      return forceRefresh ? [download] : [];
    };

    const info = await handler._findTorrentInfoByHash(download.fileHash);

    assert.ok(info);
    assert.equal(info.name, 'Book.epub');
    assert.equal(calls, 2);
  });

  it('enriches only the matched download, not every candidate', async () => {
    const handler = makeHandler();
    const target = makeDownload();
    const noise = [
      makeDownload({ fileHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', fileName: 'Noise1.epub' }),
      makeDownload({ fileHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', fileName: 'Noise2.epub' }),
      target,
      makeDownload({ fileHash: 'cccccccccccccccccccccccccccccccc', fileName: 'Noise3.epub' })
    ];

    let enrichCalls = 0;
    handler._getAmuleDownloads = async () => noise;
    handler.enrichDownload = async (item) => {
      enrichCalls += 1;
      return { ...item, magnetHash: item.fileHash, categoryName: '', categoryPath: '/incoming' };
    };

    const info = await handler._findTorrentInfoByHash(target.fileHash);

    assert.ok(info);
    assert.equal(info.name, 'Book.epub');
    assert.equal(enrichCalls, 1, 'enrichDownload should run once (the winner only)');
  });

  it('caches negative results so bogus-hash polls do not refetch aMule', async () => {
    const handler = makeHandler();

    let fetchCalls = 0;
    handler._getAmuleDownloads = async () => {
      fetchCalls += 1;
      return [];
    };

    const bogus = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef';

    assert.equal(await handler._findTorrentInfoByHash(bogus), null);
    assert.equal(fetchCalls, 2, 'first miss: cached lookup + forced refresh');

    assert.equal(await handler._findTorrentInfoByHash(bogus), null);
    assert.equal(fetchCalls, 2, 'second miss: served from negative-result cache, no refetch');

    handler._clearMissedHashes();
    assert.equal(await handler._findTorrentInfoByHash(bogus), null);
    assert.equal(fetchCalls, 4, 'after clear: full cached+forced sequence again');
  });
});
