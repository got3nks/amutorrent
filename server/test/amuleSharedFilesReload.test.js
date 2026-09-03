const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { AmuleManager } = require('../modules/amuleManager');

// aMule watches its own shared folders (CSharedDirWatcher, on by default since
// 3.0.0), so a rescan after our own deletes and moves is redundant work: a full
// walk of every shared directory that the watcher was going to do anyway.
//
// The core says so on the wire. EC_TAG_DIRECTORIES_AUTO_RESCAN is an empty tag
// emitted only while the watcher is enabled, so absence covers both a user who
// turned it off and a core old enough to have no watcher at all. Both of those
// still need us to ask.
function makeManager(getDirectoryPreferences) {
  const manager = new AmuleManager({
    id: 'amule-test', name: 'test', host: '127.0.0.1', port: 4712, password: 'x'
  });
  const reloads = [];
  manager.client = {
    getDirectoryPreferences,
    refreshSharedFiles: async () => { reloads.push(Date.now()); return true; }
  };
  return { manager, reloads };
}

describe('shared files reload: gated on the core watcher', () => {
  it('skips the reload when the core reports its watcher on', async () => {
    const { manager, reloads } = makeManager(async () => ({ autoRescan: true }));
    assert.equal(await manager.refreshSharedFilesIfUnwatched(), false);
    assert.equal(reloads.length, 0, 'reloaded despite the core watching');
  });

  it('reloads when the core reports its watcher off', async () => {
    const { manager, reloads } = makeManager(async () => ({ autoRescan: false }));
    assert.equal(await manager.refreshSharedFilesIfUnwatched(), true);
    assert.equal(reloads.length, 1);
  });

  it('reloads when the core never sends the tag at all', async () => {
    // A core predating the watcher answers the same request without the field.
    const { manager, reloads } = makeManager(async () => ({ incoming: '/incoming' }));
    assert.equal(await manager.refreshSharedFilesIfUnwatched(), true);
    assert.equal(reloads.length, 1);
  });

  it('reloads when the preference could not be read', async () => {
    // QueuedAmuleClient turns a failed call into null rather than throwing.
    // Unknown has to read as "not watching": a redundant reload is the cheaper
    // error than a shared entry that never goes away.
    const { manager, reloads } = makeManager(async () => null);
    assert.equal(await manager.refreshSharedFilesIfUnwatched(), true);
    assert.equal(reloads.length, 1);
  });

  it('does not read the preference more than once per call', async () => {
    // The core applies this live, so it is deliberately not cached. That only
    // works if each decision costs exactly one read.
    let reads = 0;
    const { manager } = makeManager(async () => { reads++; return { autoRescan: true }; });
    await manager.refreshSharedFilesIfUnwatched();
    await manager.refreshSharedFilesIfUnwatched();
    assert.equal(reads, 2, 'the preference was cached across calls');
  });
});

describe('shared files reload: the manual path', () => {
  it('always reloads, watcher or not', async () => {
    // The Shared view's refresh button and the "Rescan now" button call this
    // one. Someone who asks for a rescan gets a rescan.
    const { manager, reloads } = makeManager(async () => ({ autoRescan: true }));
    await manager.refreshSharedFiles();
    assert.equal(reloads.length, 1);
  });

  it('refuses when there is no connection', async () => {
    const { manager } = makeManager(async () => ({ autoRescan: false }));
    manager.client = null;
    await assert.rejects(() => manager.refreshSharedFiles(), /not connected/);
  });
});
