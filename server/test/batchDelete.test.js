const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const webSocketHandlers = require('../modules/webSocketHandlers');
const dataFetchService = require('../lib/DataFetchService');
const registry = require('../lib/ClientRegistry');
const eventScriptingManager = require('../lib/EventScriptingManager');

// The delete modal used to send deleteFiles=true for a whole batch whenever it
// held an aMule shared file, and `source: 'shared'` made the server treat every
// item as shared. In the Shared view, deleting an aMule shared file together
// with a torrent removed the torrent's data with the box unchecked, and an
// aMule partfile in the batch was never cancelled.

const AMULE = 'amule-test';
const QBIT = 'qbittorrent-test';

let calls, events;
const originals = {};

function fakeManager(clientType, instanceId) {
  return {
    clientType,
    instanceId,
    displayName: instanceId,
    deleteItem: async (hash, opts) => {
      calls.push({ instanceId, hash, ...opts });
      return { success: true, pathsToDelete: [] };
    }
  };
}

const cached = [
  { instanceId: AMULE, hash: 'aaaa', name: 'Shared Sample.avi', client: 'amule', shared: true, downloading: false, complete: true, raw: { path: '/incoming' } },
  { instanceId: AMULE, hash: 'bbbb', name: 'Partial Sample.avi', client: 'amule', shared: true, downloading: true },
  { instanceId: QBIT, hash: 'cccc', name: 'Torrent Sample', client: 'qbittorrent', shared: true, downloading: false, complete: true }
];

const item = (instanceId, fileHash, extra = {}) => ({ instanceId, fileHash, fileName: fileHash, ...extra });

async function runDelete(data) {
  const context = {
    clientInfo: { isAdmin: true, username: 'tester' },
    send: () => {}, log: () => {}, error: () => {}
  };
  await webSocketHandlers.handleBatchDelete(data, context);
}

describe('batch delete', () => {
  beforeEach(() => {
    calls = [];
    events = [];
    registry.register(AMULE, 'amule', fakeManager('amule', AMULE));
    registry.register(QBIT, 'qbittorrent', fakeManager('qbittorrent', QBIT));
    originals.getCachedBatchData = dataFetchService.getCachedBatchData;
    originals.broadcast = webSocketHandlers.broadcastItemsUpdate;
    originals.emit = eventScriptingManager.emit;
    dataFetchService.getCachedBatchData = () => ({ items: cached });
    webSocketHandlers.broadcastItemsUpdate = async () => {};
    eventScriptingManager.emit = (name, payload) => events.push(payload);
  });

  afterEach(() => {
    registry.unregister(AMULE);
    registry.unregister(QBIT);
    dataFetchService.getCachedBatchData = originals.getCachedBatchData;
    webSocketHandlers.broadcastItemsUpdate = originals.broadcast;
    eventScriptingManager.emit = originals.emit;
  });

  const callFor = (hash) => calls.find(c => c.hash === hash);

  it('applies deleteFiles per item, so a torrent keeps its data next to an aMule shared file', async () => {
    await runDelete({
      items: [item(AMULE, 'aaaa', { deleteFiles: true }), item(QBIT, 'cccc', { deleteFiles: false })],
      deleteFiles: false,
      source: 'shared'
    });
    assert.equal(callFor('aaaa').deleteFiles, true);
    assert.equal(callFor('cccc').deleteFiles, false);
    const torrentEvent = events.find(e => e.hash === 'cccc');
    assert.equal(torrentEvent.deletedFromDisk, false);
  });

  it('falls back to the batch deleteFiles when an item has none', async () => {
    // REST callers send one flag for the batch.
    await runDelete({ items: [item(QBIT, 'cccc')], deleteFiles: true });
    assert.equal(callFor('cccc').deleteFiles, true);
  });

  it('treats a cached partfile as a download even when the batch is sent as shared', async () => {
    await runDelete({
      items: [item(AMULE, 'aaaa', { deleteFiles: true }), item(AMULE, 'bbbb', { deleteFiles: false })],
      source: 'shared'
    });
    assert.equal(callFor('aaaa').isShared, true);
    assert.equal(callFor('bbbb').isShared, false);
  });

  it('uses the batch source for an item missing from the cache', async () => {
    await runDelete({ items: [item(AMULE, 'dddd', { deleteFiles: true })], source: 'shared' });
    assert.equal(callFor('dddd').isShared, true);
  });
});

// aMule keeps a finished download listed (status PS_COMPLETE) until it is
// cleared, and shares it at the same time. The unified item keeps the download's
// raw data, which has no path, so deleting it failed with "File path required".
describe('deleting a finished aMule download', () => {
  const { normalizeAmuleDownload, normalizeAmuleSharedFile } = require('../lib/downloadNormalizer');
  const { assembleUnifiedItems } = require('../lib/unifiedItemBuilder');
  const { AmuleManager } = require('../modules/amuleManager');
  const { importStatic } = require('./helpers/importEsm');

  const HASH = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
  const finishedDownload = () => Object.assign(normalizeAmuleDownload({
    fileName: 'Finished Sample.avi', rawFileName: 'Finished Sample.avi', fileHash: HASH,
    fileSize: 10, fileSizeDownloaded: 10, status: 9, ecid: 77, raw: { EC_TAG_PARTFILE_STATUS: 9 }
  }), { instanceId: AMULE });
  const sharedEntry = () => Object.assign(normalizeAmuleSharedFile({
    fileName: 'Finished Sample.avi', rawFileName: 'Finished Sample.avi', fileHash: HASH,
    fileSize: 10, path: '/incoming', raw: {}
  }, []), { instanceId: AMULE });

  let cachedItems;
  beforeEach(() => {
    calls = [];
    registry.register(AMULE, 'amule', fakeManager('amule', AMULE));
    originals.getCachedBatchData = dataFetchService.getCachedBatchData;
    originals.broadcast = webSocketHandlers.broadcastItemsUpdate;
    originals.emit = eventScriptingManager.emit;
    dataFetchService.getCachedBatchData = () => ({ items: cachedItems });
    webSocketHandlers.broadcastItemsUpdate = async () => {};
    eventScriptingManager.emit = () => {};
  });

  afterEach(() => {
    registry.unregister(AMULE);
    dataFetchService.getCachedBatchData = originals.getCachedBatchData;
    webSocketHandlers.broadcastItemsUpdate = originals.broadcast;
    eventScriptingManager.emit = originals.emit;
  });

  it('passes the shared file path for a finished download that is also shared', async () => {
    cachedItems = assembleUnifiedItems([finishedDownload()], [sharedEntry()]);
    await runDelete({ items: [item(AMULE, HASH, { deleteFiles: true })] });
    assert.equal(calls[0].isShared, true);
    assert.equal(calls[0].filePath, '/incoming/Finished Sample.avi');
  });

  it('never cancels a finished download missing from the shared list yet', async () => {
    // Cancelling a finished aMule download is not safe; it is refused for lack of a path instead.
    cachedItems = assembleUnifiedItems([finishedDownload()], []);
    await runDelete({ items: [item(AMULE, HASH, { deleteFiles: true })] });
    assert.equal(calls[0].isShared, true);
    assert.equal(calls[0].filePath, undefined);
  });

  it('clears the finished entry after deleting its file', async () => {
    const cleared = [];
    const m = Object.create(AmuleManager.prototype);
    Object.assign(m, {
      trackDeletion() {}, markSharedDeletion() {}, warn() {},
      client: { clearCompleted: async (ecids) => { cleared.push(...ecids); } },
      _finishedEcidByHash: new Map([[HASH, 77]])
    });
    const res = await m.deleteItem(HASH.toUpperCase(), { deleteFiles: true, isShared: true, filePath: '/incoming/f' });
    assert.equal(res.success, true);
    assert.deepEqual(cleared, [77]);
  });

  it('the delete modal treats it as a shared file', async () => {
    const { classifyDeleteItem } = await importStatic('utils', 'itemActionPolicy.js');
    const clientMeta = require('../lib/clientMeta');
    const caps = clientMeta.get('amule').capabilities;
    assert.equal(classifyDeleteItem(caps, { complete: true, shared: false, downloading: false }), 'shared');
    assert.equal(classifyDeleteItem(caps, { complete: false, shared: true, downloading: true }), 'autoClean');
  });
});
