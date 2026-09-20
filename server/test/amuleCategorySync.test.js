const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const core = require('./helpers/amuleCore');

// Integration tests against a real aMule core. See helpers/amuleCore.js for the
// environment they need; without AMULE_TEST_PASSWORD they skip rather than run.
//
// An aMule category id is its index in m_CatList, so deleting one shifts every
// higher id down. Cached ids therefore go stale, and a write using one either
// lands on a different category or past the end of the list — which is what
// amutorrent#86 and #85 were.
describe('aMule category sync', async () => {
  const reachable = await core.isReachable();
  const skip = core.skipReason(reachable);
  // Node treats the mere presence of `skip` as a skip, whatever its value, so
  // the option has to be absent entirely when the tests should run.
  const when = skip ? { skip } : {};

  let mgr, categoryManager, instanceId, cleanup, unmute;

  before(async () => {
    if (skip) return;
    unmute = core.muteLogs();
    ({ mgr, categoryManager, instanceId, cleanup } = await core.bootManager());
    await core.resetCategories(mgr);
  });

  after(async () => {
    if (cleanup) await cleanup();
    if (unmute) unmute();
  });

  // Clean both sides: CategoryManager keeps its own map, so clearing only the
  // core leaves names behind and the next create() collides.
  const seed = async (names) => {
    for (const [name] of categoryManager.getCategoriesSnapshot().entries()) {
      if (name !== 'Default') await categoryManager.delete(name);
    }
    await core.resetCategories(mgr);
    for (const [name, p] of names) await categoryManager.create(name, { path: p });
  };

  it('re-resolves surviving ids after a delete renumbers them', when, async () => {
    await seed([['alpha', '/tmp/alpha'], ['beta', '/tmp/beta'], ['gamma', '/tmp/gamma']]);
    await categoryManager.delete('beta');

    const inCore = await core.categoryRows(mgr);
    for (const [name, cat] of categoryManager.getCategoriesSnapshot().entries()) {
      const id = cat.amuleIds?.[instanceId];
      if (id == null || name === 'Default') continue;
      assert.equal(inCore.find(c => c.id === id)?.title, name,
        `cached id ${id} for "${name}" points at a different category`);
    }
  });

  it('edits the named category rather than whatever moved into its old slot', when, async () => {
    await seed([['alpha', '/tmp/alpha'], ['beta', '/tmp/beta'], ['gamma', '/tmp/gamma']]);
    await categoryManager.delete('beta');
    await categoryManager.update('gamma', { path: '/tmp/gamma-edited' });

    const rows = await core.categoryRows(mgr);
    assert.equal(rows.find(c => c.title === 'gamma')?.path, '/tmp/gamma-edited');
    // The bystander that inherited gamma's old index must be untouched.
    assert.ok(rows.some(c => c.title === 'alpha'), '"alpha" was clobbered');
    assert.equal(rows.filter(c => c.title === 'gamma').length, 1, 'duplicate "gamma" created');
  });

  it('renames the right category after a delete', when, async () => {
    await seed([['one', '/tmp/one'], ['two', '/tmp/two'], ['three', '/tmp/three']]);
    await categoryManager.delete('one');
    await categoryManager.rename('three', 'THREE');

    const rows = await core.categoryRows(mgr);
    assert.ok(rows.some(c => c.title === 'THREE'));
    assert.ok(rows.some(c => c.title === 'two'), '"two" was clobbered by the rename');
  });

  it('refuses to write through an out-of-range cached id', when, async () => {
    // Pre-#1228 cores abort on this packet, so it must never reach the socket.
    await seed([['solo', '/tmp/solo']]);
    const result = await mgr.editCategory({ id: 28, name: 'ghost', path: '/tmp/ghost', defaultPath: '/tmp' });
    assert.equal(result.success, false);
    assert.ok(await core.isReachable(), 'the daemon died — an out-of-range index reached it');
  });

  it('reports a refused path as applied, since aMule kept everything else', when, async () => {
    // EC_OP_FAILED + a path tag means the rest landed (amule-org/amule#1213).
    await seed([['pathcat', '/tmp/pathcat']]);
    const result = await mgr.editCategory({
      id: categoryManager.getByName('pathcat').amuleIds[instanceId],
      name: 'pathcat', lookupName: 'pathcat',
      path: '/sbin/cannot-create-this', defaultPath: '/tmp'
    });
    assert.equal(result.success, true);
    assert.equal(result.verified, false);
    assert.ok(result.mismatches.some(m => m.startsWith('path:')));
  });

  it('converges on reconnect and stays idempotent', when, async () => {
    await seed([['one', '/tmp/one'], ['two', '/tmp/two']]);
    await categoryManager.delete('one');
    await mgr.onConnectSync(categoryManager, {});

    const rows = await core.categoryRows(mgr);
    const titles = rows.map(c => c.title);
    assert.equal(new Set(titles).size, titles.length, 'sync created duplicate categories');

    const before = JSON.stringify(await core.categoryRows(mgr));
    await mgr.onConnectSync(categoryManager, {});
    assert.equal(JSON.stringify(await core.categoryRows(mgr)), before, 'a second sync changed state');
  });
});
