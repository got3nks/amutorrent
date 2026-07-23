const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const QBittorrentHandler = require('../lib/qbittorrent/QBittorrentHandler');

describe('QBittorrentHandler hash lookup refresh', () => {
  it('retries with a forced refresh when the cached snapshot misses', async () => {
    const handler = new QBittorrentHandler();
    handler.hashStore = { getEd2kHash: () => null };

    const download = {
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
      directory: '/incoming'
    };

    let calls = 0;
    handler._getAmuleDownloads = async (forceRefresh) => {
      calls += 1;
      return forceRefresh ? [download] : [];
    };

    handler.enrichDownload = async (item) => ({
      ...item,
      magnetHash: item.fileHash,
      categoryName: '',
      categoryPath: '/incoming'
    });

    const info = await handler._findTorrentInfoByHash(download.fileHash);

    assert.ok(info);
    assert.equal(info.name, 'Book.epub');
    assert.equal(calls, 2);
  });
});
