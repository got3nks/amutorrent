const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const QBittorrentHandler = require('../lib/qbittorrent/QBittorrentHandler');

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
function makeHandler(dir, fileName) {
  const handler = new QBittorrentHandler();
  const deleted = [];

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
      // Mirrors AmuleManager: the caller is expected to unlink these.
      return { success: true, pathsToDelete: opts.filePath ? [opts.filePath] : [] };
    },
    refreshSharedFiles: async () => true
  });

  return { handler, deleted };
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
