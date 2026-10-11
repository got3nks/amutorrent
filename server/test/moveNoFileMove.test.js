const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const webSocketHandlers = require('../modules/webSocketHandlers');
const dataFetchService = require('../lib/DataFetchService');
const registry = require('../lib/ClientRegistry');
const moveOperationManager = require('../lib/MoveOperationManager');
const eventScriptingManager = require('../lib/EventScriptingManager');

// A client that declares noFileMove (Rucio: no move API, moving behind the daemon
// breaks seeding) must be refused at every move entry point — the standalone batch
// move, the category-change move, and the move pre-check — so the rename-then-
// failing-updateDirectory path that unlinks the only copy can never be reached.

const RUCIO = 'rucio-test';
const AMULE = 'amule-test';

let queued, sends;
const originals = {};

function fakeManager(clientType, instanceId) {
  return {
    clientType,
    instanceId,
    displayName: instanceId,
    isConnected: () => true,
    setCategoryOrLabel: async () => ({ success: true })
  };
}

const cached = [
  { instanceId: RUCIO, hash: 'rr01', name: 'Rucio File', client: 'rucio', complete: true, shared: false, downloading: false, directory: '/data/rucio' },
  { instanceId: AMULE, hash: 'am01', name: 'aMule File', client: 'amule', complete: true, shared: false, downloading: false, directory: '/data/amule' }
];

function makeContext() {
  return {
    clientInfo: { isAdmin: true, username: 'tester' },
    categoryManager: { getByName: (n) => ({ name: n, priority: 0 }) },
    send: (m) => sends.push(m),
    broadcast: () => {},
    log: () => {},
    error: () => {}
  };
}

describe('move refuses a noFileMove client', () => {
  beforeEach(() => {
    queued = [];
    sends = [];
    registry.register(RUCIO, 'rucio', fakeManager('rucio', RUCIO));
    registry.register(AMULE, 'amule', fakeManager('amule', AMULE));
    originals.getCachedBatchData = dataFetchService.getCachedBatchData;
    originals.queueMove = moveOperationManager.queueMove;
    originals.broadcast = webSocketHandlers.broadcastItemsUpdate;
    originals.emit = eventScriptingManager.emit;
    dataFetchService.getCachedBatchData = () => ({ items: cached });
    moveOperationManager.queueMove = async (op) => { queued.push(op); };
    webSocketHandlers.broadcastItemsUpdate = async () => {};
    eventScriptingManager.emit = () => {};
  });

  afterEach(() => {
    registry.unregister(RUCIO);
    registry.unregister(AMULE);
    dataFetchService.getCachedBatchData = originals.getCachedBatchData;
    moveOperationManager.queueMove = originals.queueMove;
    webSocketHandlers.broadcastItemsUpdate = originals.broadcast;
    eventScriptingManager.emit = originals.emit;
  });

  it('the batch move refuses a noFileMove item and never queues it', async () => {
    const ctx = makeContext();
    await webSocketHandlers.handleBatchMoveFiles(
      { items: [{ fileHash: 'rr01', instanceId: RUCIO, fileName: 'Rucio File' }], destPath: '/dest' },
      ctx
    );
    assert.equal(queued.length, 0, 'no move queued for a noFileMove client');
    const res = sends.find(m => m.type === 'batch-move-complete');
    assert.ok(res, 'sent a batch-move-complete');
    assert.equal(res.results[0].success, false);
    assert.match(res.results[0].error, /cannot move files/);
  });

  it('the category-change move skips the move for a noFileMove item but still sets the category', async () => {
    const ctx = makeContext();
    await webSocketHandlers.handleBatchSetFileCategory(
      { items: [{ fileHash: 'rr01', instanceId: RUCIO, fileName: 'Rucio File' }], categoryName: 'Movies', moveFiles: true },
      ctx
    );
    assert.equal(queued.length, 0, 'no move queued for a noFileMove client');
    const res = sends.find(m => m.type === 'batch-category-changed');
    assert.ok(res, 'sent a batch-category-changed');
    assert.equal(res.results[0].success, true, 'the category change itself still succeeds');
  });

  it('the move pre-check reports cannot_move for a noFileMove item', async () => {
    const ctx = makeContext();
    await webSocketHandlers.handleCheckMoveToPermissions(
      { items: [{ fileHash: 'rr01', instanceId: RUCIO }], destPath: '/dest' },
      ctx
    );
    const res = sends.find(m => m.type === 'move-to-permissions');
    assert.ok(res, 'sent move-to-permissions');
    assert.equal(res.canMove, false);
    assert.equal(res.results[0].reason, 'cannot_move');
  });

  it('a movable client (aMule) is not refused by the same pre-check', async () => {
    const ctx = makeContext();
    await webSocketHandlers.handleCheckMoveToPermissions(
      { items: [{ fileHash: 'am01', instanceId: AMULE }], destPath: '/dest' },
      ctx
    );
    const res = sends.find(m => m.type === 'move-to-permissions');
    assert.ok(res);
    // aMule may fail for another reason (path checks), but never 'cannot_move'.
    assert.notEqual(res.results[0].reason, 'cannot_move');
  });
});
