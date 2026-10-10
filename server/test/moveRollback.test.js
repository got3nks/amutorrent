const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const mom = require('../lib/MoveOperationManager');

// A failed manual move used to delete its destination unconditionally. After a
// rename the destination is the only copy, so a client error after the rename
// (rTorrent disconnected, a failed directory update) lost the file.

let root, src, dst;
const at = (p) => fs.existsSync(p);

function quiet() {
  for (const k of ['log', 'warn', 'error', 'debug']) mom[k] = () => {};
  mom.db = {
    updateStatus() {}, update() {}, updateProgress() {}, complete() {}, markComplete() {},
    getByHash() { return null; }, getActive: () => [], delete() {}, remove() {}
  };
  mom.updateActiveOperation = () => {};
  mom.broadcastSuccess = mom.broadcastError = () => {};
  mom.triggerBatchUpdate = async () => {};
  mom.sleep = async () => {};
  mom.processQueue = () => {};
}

function useManager(updateDirectory) {
  mom._getManagerForOp = () => ({ resume: async () => {}, stop: async () => {}, updateDirectory });
}

function op(extra = {}) {
  return {
    hash: 'ab'.repeat(20), instanceId: 'rt-1', name: 'f.mkv', clientType: 'rtorrent',
    sourcePath: src, destPath: dst, remoteSourcePath: src, remoteDestPath: dst,
    isMultiFile: false, totalSize: 5, ...extra
  };
}

beforeEach(() => {
  quiet();
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'move-rollback-'));
  src = path.join(root, 'src');
  dst = path.join(root, 'dst');
  fs.mkdirSync(src);
  fs.mkdirSync(dst);
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('a failed manual move never deletes the only copy', () => {
  it('moves a renamed file back when the client update fails', async () => {
    fs.writeFileSync(path.join(src, 'f.mkv'), 'data!');
    useManager(async () => { throw new Error('rtorrent not connected'); });
    await mom.executeMove(op()).catch(() => {});
    assert.equal(at(path.join(src, 'f.mkv')), true);
    assert.equal(at(path.join(dst, 'f.mkv')), false);
    assert.equal(fs.readFileSync(path.join(src, 'f.mkv'), 'utf8'), 'data!');
  });

  it('moves a renamed directory back when the client update fails', async () => {
    const item = path.join(src, 'Item');
    fs.mkdirSync(item);
    fs.writeFileSync(path.join(item, 'a.bin'), 'aaaaa');
    useManager(async () => { throw new Error('rtorrent not connected'); });
    await mom.executeMove(op({ name: 'Item', sourcePath: item, remoteSourcePath: item, isMultiFile: true })).catch(() => {});
    assert.equal(at(path.join(item, 'a.bin')), true);
    assert.equal(at(path.join(dst, 'Item')), false);
  });

  it('still moves the file when nothing fails', async () => {
    fs.writeFileSync(path.join(src, 'f.mkv'), 'data!');
    useManager(async () => {});
    await mom.executeMove(op());
    assert.equal(at(path.join(src, 'f.mkv')), false);
    assert.equal(at(path.join(dst, 'f.mkv')), true);
  });
});

describe('cleanupPartialDest', () => {
  it('deletes a partial copy while the source is intact', async () => {
    fs.writeFileSync(path.join(src, 'f.mkv'), 'data!');
    fs.writeFileSync(path.join(dst, 'f.mkv'), 'da');
    await mom.cleanupPartialDest(op());
    assert.equal(at(path.join(src, 'f.mkv')), true);
    assert.equal(at(path.join(dst, 'f.mkv')), false);
  });

  it('keeps the file where the client already points once the source is gone', async () => {
    // A copy whose source was cleaned up after the client switched over.
    fs.writeFileSync(path.join(dst, 'f.mkv'), 'data!');
    await mom.cleanupPartialDest(op(), { clientUpdated: true });
    assert.equal(at(path.join(dst, 'f.mkv')), true);
    assert.equal(at(path.join(src, 'f.mkv')), false);
  });

  it('does nothing when there is no destination', async () => {
    fs.writeFileSync(path.join(src, 'f.mkv'), 'data!');
    await mom.cleanupPartialDest(op());
    assert.equal(at(path.join(src, 'f.mkv')), true);
  });
});

describe('recovery after a restart mid-move', () => {
  it('moves an already renamed file back instead of deleting it', async () => {
    // Interrupted between the rename and the client update.
    fs.writeFileSync(path.join(dst, 'f.mkv'), 'data!');
    mom.db.getActive = () => [{ ...op(), status: 'moving' }];
    mom.resumeDownload = async () => {};
    await mom.recoverOperations();
    assert.equal(at(path.join(src, 'f.mkv')), true);
    assert.equal(at(path.join(dst, 'f.mkv')), false);
  });
});
