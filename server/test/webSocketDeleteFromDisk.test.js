const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const wsHandlers = require('../modules/webSocketHandlers');

// The web UI's batch delete removes the file itself before telling the client
// to drop the entry. A file that is already gone is the normal case once an
// importer has moved it out, and reporting that as a failure both showed the
// user an error for work that was already done and aborted the rest of the
// item's cleanup (#81).
function makeContext() {
  const logs = [], errors = [];
  return { logs, errors, log: (m) => logs.push(m), error: (m) => errors.push(m) };
}

describe('deleteFromDisk', () => {
  it('removes a file', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amt-dfd-'));
    const file = path.join(dir, 'file.mkv');
    fs.writeFileSync(file, 'x');

    const result = await wsHandlers.deleteFromDisk(file, makeContext());

    assert.equal(result.success, true);
    assert.equal(fs.existsSync(file), false);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('removes a directory and its contents', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amt-dfd-'));
    const sub = path.join(dir, 'release');
    fs.mkdirSync(sub);
    fs.writeFileSync(path.join(sub, 'file.mkv'), 'x');

    const result = await wsHandlers.deleteFromDisk(sub, makeContext());

    assert.equal(result.success, true);
    assert.equal(fs.existsSync(sub), false);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('treats an already-missing path as done, not as a failure', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amt-dfd-'));
    const context = makeContext();

    const result = await wsHandlers.deleteFromDisk(path.join(dir, 'never.mkv'), context);

    assert.equal(result.success, true);
    assert.equal(context.errors.length, 0, 'a missing file was reported as an error');
    assert.ok(context.logs.some(l => l.includes('Already gone')), 'nothing was logged');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('still fails on a path it genuinely cannot delete', async () => {
    // A file used as a directory component: ENOTDIR, not ENOENT.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amt-dfd-'));
    const file = path.join(dir, 'file.mkv');
    fs.writeFileSync(file, 'x');
    const context = makeContext();

    const result = await wsHandlers.deleteFromDisk(path.join(file, 'child.mkv'), context);

    assert.equal(result.success, false);
    assert.ok(context.errors.length > 0, 'a real failure was swallowed');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
