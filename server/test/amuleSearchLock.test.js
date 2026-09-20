const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { AmuleManager } = require('../modules/amuleManager');
const arrManager = require('../modules/arrManager');

// aMule has one ed2k search slot: a second EC_OP_SEARCH_START discards the
// first search's results. The lock guards that slot, and it doubles as the
// UI's "search busy" signal - it is a mutex, so it has one holder and its two
// transitions are the only edges there are.
function makeManager() {
  const manager = new AmuleManager({
    id: 'amule-test', name: 'test', host: '127.0.0.1', port: 4712, password: 'x'
  });
  const sent = [];
  manager.broadcast = (msg) => sent.push(msg);
  return { manager, sent };
}

const locks = (sent) => sent.filter(m => m.type === 'search-lock').map(m => m.locked);

describe('aMule search lock: the UI signal rides on the lock', () => {
  it('announces both edges of one search', () => {
    const { manager, sent } = makeManager();
    manager.acquireSearchLock();
    manager.releaseSearchLock();
    assert.deepEqual(locks(sent), [true, false]);
  });

  it('says nothing when the lock is already held', () => {
    // The waiting acquire polls this in a loop; a refused attempt is not an
    // edge and must not reach the clients.
    const { manager, sent } = makeManager();
    manager.acquireSearchLock();
    for (let i = 0; i < 5; i++) assert.equal(manager.acquireSearchLock(), false);
    assert.deepEqual(locks(sent), [true]);
  });

  it('says nothing when releasing a lock nobody holds', () => {
    const { manager, sent } = makeManager();
    manager.releaseSearchLock();
    manager.releaseSearchLock();
    assert.deepEqual(locks(sent), []);
  });

  it('covers a Torznab search, which used to leave the box stuck', () => {
    // Only the UI and the arr cycle used to broadcast, while the connect
    // handler reported the real slot. A client connecting during a Torznab
    // search was told "locked" and never told otherwise.
    const { manager, sent } = makeManager();
    return manager.withSearchLock(async () => 'results').then(result => {
      assert.equal(result, 'results');
      assert.deepEqual(locks(sent), [true, false]);
    });
  });

  it('releases and announces even when the search throws', async () => {
    const { manager, sent } = makeManager();
    await assert.rejects(() => manager.withSearchLock(async () => { throw new Error('refused'); }));
    assert.deepEqual(locks(sent), [true, false]);
    assert.equal(manager.isSearchInProgress(), false);
  });

  it('works without a broadcaster attached', () => {
    // Managers are constructed before inject() runs.
    const manager = new AmuleManager({ id: 'x', name: 'x', host: 'h', port: 1, password: 'p' });
    manager.broadcast = null;
    assert.doesNotThrow(() => { manager.acquireSearchLock(); manager.releaseSearchLock(); });
  });
});

describe('arrManager does not touch the search slot', () => {
  it('has no lock API left', () => {
    // It never searched aMule itself - it asks Sonarr/Radarr to search, and
    // those come back through Torznab, which takes the slot per search. Holding
    // the slot across that cycle deadlocked our own endpoint: every callback
    // waited the full lock timeout and returned an empty feed (#89).
    assert.equal(arrManager.acquireSearchLockWithTimeout, undefined);
    assert.equal(arrManager.releaseSearchLock, undefined);
  });
});
