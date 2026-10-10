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
