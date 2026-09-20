const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const core = require('./helpers/amuleCore');

// Integration tests against a real aMule core. See helpers/amuleCore.js for the
// environment they need; without AMULE_TEST_PASSWORD they skip rather than run.
//
// aMule watches its own shared folders and reloads on its own, so a rescan we
// ask for after our own deletes and moves is a full walk of every shared
// directory that was going to happen anyway. The core reports the watcher's
// state in its directory preferences, and that is what the gate reads.
describe('aMule shared-dir watcher gate', async () => {
  const reachable = await core.isReachable();
  const skip = core.skipReason(reachable);
  // Node treats the mere presence of `skip` as a skip, whatever its value, so
  // the option has to be absent entirely when the tests should run.
  const when = skip ? { skip } : {};

  let mgr, cleanup, unmute, prefs;

  before(async () => {
    if (skip) return;
    unmute = core.muteLogs();
    ({ mgr, cleanup } = await core.bootManager());
    prefs = await mgr.client.getDirectoryPreferences();
  });

  after(async () => {
    if (cleanup) await cleanup();
    if (unmute) unmute();
  });

  /** Run fn with the reload counted, and the real call still reaching the core. */
  const countingReloads = async (fn) => {
    const real = mgr.client.refreshSharedFiles;
    let reloads = 0;
    mgr.client.refreshSharedFiles = async (...args) => { reloads++; return real.call(mgr.client, ...args); };
    try { return { result: await fn(), reloads }; }
    finally { mgr.client.refreshSharedFiles = real; }
  };

  /** Run fn with the watcher preference reported as `autoRescan`. */
  const withAutoRescan = async (autoRescan, fn) => {
    const real = mgr.client.getDirectoryPreferences;
    mgr.client.getDirectoryPreferences = async () => ({ ...prefs, autoRescan });
    try { return await fn(); }
    finally { mgr.client.getDirectoryPreferences = real; }
  };

  it('reads the watcher state off the live core', when, async () => {
    assert.equal(typeof prefs?.autoRescan, 'boolean',
      `core did not report autoRescan: ${JSON.stringify(prefs)}`);
    assert.equal(await mgr.isWatchingSharedDirs(), prefs.autoRescan === true);
  });

  it('sends no reload while the core watches its own folders', when, async () => {
    const { result, reloads } = await countingReloads(
      () => withAutoRescan(true, () => mgr.refreshSharedFilesIfUnwatched()));
    assert.equal(result, false, 'claimed to have reloaded');
    assert.equal(reloads, 0, 'reloaded a core that watches itself');
  });

  it('sends one when the watcher is off', when, async () => {
    const { result, reloads } = await countingReloads(
      () => withAutoRescan(false, () => mgr.refreshSharedFilesIfUnwatched()));
    assert.equal(result, true);
    assert.equal(reloads, 1);
  });

  it('reloads rather than skips when the preference cannot be read', when, async () => {
    // Unknown has to land on the same side as "watcher off". QueuedAmuleClient
    // turns a failed call into null, but a throw must not slip past either.
    const real = mgr.client.getDirectoryPreferences;
    for (const broken of [async () => null, async () => { throw new Error('unreachable'); }]) {
      mgr.client.getDirectoryPreferences = broken;
      const { result, reloads } = await countingReloads(() => mgr.refreshSharedFilesIfUnwatched());
      assert.equal(result, true, 'skipped the reload on an unreadable preference');
      assert.equal(reloads, 1);
    }
    mgr.client.getDirectoryPreferences = real;
  });

  it('reads the preference on every call rather than caching it', when, async () => {
    // The core applies this live: a startup snapshot would go stale the moment
    // someone toggles it in aMule's own preferences.
    const real = mgr.client.getDirectoryPreferences;
    let reads = 0;
    mgr.client.getDirectoryPreferences = async () => { reads++; return real.call(mgr.client); };
    await mgr.isWatchingSharedDirs();
    await mgr.isWatchingSharedDirs();
    mgr.client.getDirectoryPreferences = real;
    assert.equal(reads, 2, 'the preference was cached across calls');
  });

  it('leaves the manual reload ungated', when, async () => {
    // The Shared view's refresh button and "Rescan now" call this one; someone
    // who asks for a rescan gets a rescan, watcher or not.
    const { reloads } = await countingReloads(
      () => withAutoRescan(true, () => mgr.refreshSharedFiles()));
    assert.equal(reloads, 1, 'the manual reload was swallowed by the gate');
  });
});
