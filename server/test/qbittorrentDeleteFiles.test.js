const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const QBittorrentHandler = require('../lib/qbittorrent/QBittorrentHandler');
const logger = require('../lib/logger');

// Sonarr/Radarr delete with `deleteFiles=true` when they have imported a
// release. aMuTorrent has to remove the file from disk, or aMule keeps sharing
// it and the *arr keeps showing it in the queue (amutorrent#81).
//
// The trap this covers: a unified item's `filePath` is the containing
// DIRECTORY, not the file. aMule sends the directory in
// EC_TAG_KNOWNFILE_FILENAME for a completed file, despite the tag's name.
// Passing it straight to unlink() fails with EISDIR, and the delete used to
// report success anyway.
function makeRes() {
  const state = { status: 200, body: null };
  return {
    status(s) { state.status = s; return this; },
    type() { return this; },
    send(b) { state.body = b; return this; },
    json(b) { state.body = b; return this; },
    _state: state
  };
}

const HASH = 'cdf14a2bc407e0d1c3c3127c7ac45062';

/**
 * Handler wired to one shared file in a real temp directory, so the unlink is
 * exercised against the filesystem rather than a stub.
 */
function makeHandler(dir, fileName, deleteResult = null) {
  const handler = new QBittorrentHandler();
  const deleted = [];
  const refreshCalls = [];

  handler.hashStore = { getEd2kHash: () => HASH, removeMapping: () => {} };
  handler._findCachedItem = () => ({
    hash: HASH,
    shared: true,
    downloading: false,
    name: fileName,
    rawName: fileName,
    // As the unified item really carries it: the directory, not the file.
    filePath: dir,
    raw: { path: dir }
  });
  handler._getAmuleManager = () => ({
    clientType: 'amule',
    displayName: 'test',
    isConnected: () => true,
    deleteItem: async (hash, opts) => {
      deleted.push(opts);
      if (deleteResult) return deleteResult;
      // Mirrors AmuleManager: the caller is expected to unlink these.
      return { success: true, pathsToDelete: opts.filePath ? [opts.filePath] : [] };
    },
    // The gated call is the one this path must use: aMule notices the unlink
    // itself when its directory watcher is on, and a rescan we asked for is a
    // full walk of every shared folder for nothing.
    refreshSharedFiles: async () => { refreshCalls.push('ungated'); return true; },
    refreshSharedFilesIfUnwatched: async () => { refreshCalls.push('gated'); return true; }
  });

  return { handler, deleted, refreshCalls };
}

describe('qBittorrent delete with deleteFiles', () => {
  it('unlinks the file, not the directory that contains it', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amt-del-'));
    const fileName = 'Some.Release.2024.mkv';
    const full = path.join(dir, fileName);
    fs.writeFileSync(full, 'x');

    const { handler, deleted } = makeHandler(dir, fileName);
    const res = makeRes();
    await handler.deleteTorrent(
      { body: { hashes: HASH, deleteFiles: 'true' } },
      res
    );

    assert.equal(deleted.length, 1, 'deleteItem was not called');
    assert.equal(deleted[0].filePath, full,
      'deleteItem got the directory instead of the file path');
    assert.equal(fs.existsSync(full), false, 'the file is still on disk');
    assert.equal(fs.existsSync(dir), true, 'the containing directory was removed');

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('leaves the file alone when deleteFiles is not set', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amt-del-'));
    const fileName = 'Keep.Me.mkv';
    const full = path.join(dir, fileName);
    fs.writeFileSync(full, 'x');

    const { handler } = makeHandler(dir, fileName);
    await handler.deleteTorrent({ body: { hashes: HASH, deleteFiles: 'false' } }, makeRes());

    assert.equal(fs.existsSync(full), true, 'the file was deleted without deleteFiles');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('qBittorrent delete: the post-delete rescan', () => {
  it('still asks for a rescan when the file was already gone', async () => {
    // Nothing to unlink does not mean nothing to do: aMule may still be
    // listing the entry, and on a core with no watcher the rescan is the only
    // thing that clears it. Gating the rescan on a successful unlink left
    // Radarr re-issuing the same delete once a minute (#81).
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amt-del-'));
    const { handler, refreshCalls } = makeHandler(dir, 'Already.Imported.2024.mkv');

    await handler.deleteTorrent({ body: { hashes: HASH, deleteFiles: 'true' } }, makeRes());

    assert.deepEqual(refreshCalls, ['gated']);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('does not ask for one when aMule refused the delete', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amt-del-'));
    const { handler, refreshCalls } = makeHandler(dir, 'Refused.2024.mkv',
      { success: false, error: 'File path required for shared file deletion' });

    await handler.deleteTorrent({ body: { hashes: HASH, deleteFiles: 'true' } }, makeRes());

    assert.deepEqual(refreshCalls, []);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('goes through the watcher-gated call, not the unconditional one', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amt-del-'));
    const fileName = 'Some.Release.2024.mkv';
    fs.writeFileSync(path.join(dir, fileName), 'x');

    const { handler, refreshCalls } = makeHandler(dir, fileName);
    await handler.deleteTorrent({ body: { hashes: HASH, deleteFiles: 'true' } }, makeRes());

    assert.deepEqual(refreshCalls, ['gated']);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

// What the route says happened has to match what happened. Sonarr and Radarr
// treat a delete as "the file is gone" and stop tracking the release, so a
// delete that reports success it did not earn strands the download in their
// queue with nothing in the log to explain it (#81).
function captureLogs(fn) {
  const lines = { log: [], warn: [] };
  const original = { log: logger.log, warn: logger.warn };
  logger.log = (...args) => lines.log.push(args.join(' '));
  logger.warn = (...args) => lines.warn.push(args.join(' '));
  return Promise.resolve(fn()).finally(() => Object.assign(logger, original)).then(() => lines);
}

describe('qBittorrent delete: reporting what actually happened', () => {
  it('does not claim success when aMule refused the delete', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amt-del-'));
    const { handler } = makeHandler(dir, 'Refused.2024.mkv',
      { success: false, error: 'File path required for shared file deletion' });

    const lines = await captureLogs(() =>
      handler.deleteTorrent({ body: { hashes: HASH, deleteFiles: 'true' } }, makeRes()));

    assert.ok(!lines.log.some(l => l.includes('Successfully deleted')),
      'reported success for a delete aMule refused');
    assert.ok(lines.warn.some(l => l.includes('File path required')),
      'the refusal reason never reached the log');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('says so when the file was already gone', async () => {
    // The *arr imports by moving the file out, so by delete time there is
    // nothing left to unlink. That used to pass silently.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amt-del-'));
    const { handler } = makeHandler(dir, 'Already.Imported.2024.mkv');

    const lines = await captureLogs(() =>
      handler.deleteTorrent({ body: { hashes: HASH, deleteFiles: 'true' } }, makeRes()));

    assert.ok(lines.log.some(l => l.includes('already gone')),
      'an already-missing file left no trace in the log');
    assert.equal(lines.warn.length, 0, 'a missing file was reported as a failure');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('still reports a real unlink failure', async () => {
    // Point the item at the directory itself: unlink cannot remove a directory.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amt-del-'));
    fs.mkdirSync(path.join(dir, 'Sub.Dir'));
    const { handler } = makeHandler(dir, 'Sub.Dir');

    const lines = await captureLogs(() =>
      handler.deleteTorrent({ body: { hashes: HASH, deleteFiles: 'true' } }, makeRes()));

    assert.ok(lines.warn.some(l => l.includes('Failed to unlink')),
      'a failed unlink was swallowed');
    assert.ok(!lines.log.some(l => l.includes('Successfully deleted')),
      'reported success despite the file surviving');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
