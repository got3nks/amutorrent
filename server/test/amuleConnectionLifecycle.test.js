const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { AmuleManager } = require('../modules/amuleManager');
const QueuedAmuleClient = require('../modules/queuedAmuleClient');

// Every aMule outage used to leave one extra EC connection open: the manager
// dropped its client and built another, while the dropped one reconnected by
// itself. These pin the two halves of the fix.

function makeManager() {
  const manager = new AmuleManager();
  manager.broadcast = () => {};
  const scheduled = [];
  manager.scheduleReconnect = (ms) => scheduled.push(ms);
  return { manager, scheduled };
}

describe('AmuleManager._dropClient', () => {
  it('closes the client it drops', async () => {
    const { manager, scheduled } = makeManager();
    let closed = 0;
    manager.client = { disconnect: async () => { closed++; } };

    manager._dropClient(new Error('gone'), 1000);
    await new Promise(r => setImmediate(r));

    assert.equal(manager.client, null);
    assert.equal(closed, 1);
    assert.deepEqual(scheduled, [1000]);
  });

  it('still schedules a reconnect when there is no client', () => {
    const { manager, scheduled } = makeManager();
    manager._dropClient(new Error('gone'), 10000);
    assert.deepEqual(scheduled, [10000]);
  });

  it('survives a disconnect that throws', async () => {
    const { manager } = makeManager();
    manager.client = { disconnect: async () => { throw new Error('already gone'); } };
    manager._dropClient(new Error('gone'), 1000);
    await new Promise(r => setImmediate(r));
    assert.equal(manager.client, null);
  });
});

describe('QueuedAmuleClient: reporting a lost connection', () => {
  // Attach a fake socket the way a successful connect() would.
  function withSocket() {
    const client = new QueuedAmuleClient('127.0.0.1', 4712, 'x', { autoReconnect: false });
    const socket = new EventEmitter();
    socket.end = () => {};
    socket.destroy = () => {};
    // The proxy forwards unknown properties to the inner AmuleClient.
    client.session.socket = socket;
    client.setupErrorHandlers();
    const reports = [];
    client.onError(err => reports.push(err.message));
    return { client, socket, reports };
  }

  it('reports a clean close, which emits no error', () => {
    // Without this nothing reconnects when no browser is polling for data.
    const { socket, reports } = withSocket();
    socket.emit('close');
    assert.equal(reports.length, 1);
  });

  it('reports an error followed by its close only once', () => {
    const { socket, reports } = withSocket();
    socket.emit('error', new Error('ECONNRESET'));
    socket.emit('close');
    assert.deepEqual(reports, ['ECONNRESET']);
  });

  it('stays silent when the owner closed it on purpose', async () => {
    const { client, socket, reports } = withSocket();
    await client.disconnect();
    socket.emit('close');
    assert.equal(reports.length, 0);
  });
});
