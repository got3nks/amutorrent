const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { matchesTorrentHash } = require('../lib/qbittorrent/torrentLookup');

const btih = '0123456789abcdef0123456789abcdef01234567';
const ed2k = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

describe('matchesTorrentHash', () => {
  it('matches qBittorrent info hash (BTIH)', () => {
    const info = { hash: btih };
    assert.equal(matchesTorrentHash(btih, info, ed2k, () => null), true);
  });

  it('matches raw ED2K hash', () => {
    const info = { hash: btih };
    assert.equal(matchesTorrentHash(ed2k, info, ed2k, () => null), true);
  });

  it('matches BTIH via hash-store mapping to ED2K', () => {
    const info = { hash: btih };
    const getEd2kHash = (hash) => (hash === btih ? ed2k : null);
    assert.equal(matchesTorrentHash(btih, info, ed2k, getEd2kHash), true);
  });

  it('returns false for unknown hash', () => {
    const info = { hash: btih };
    assert.equal(matchesTorrentHash('deadbeef', info, ed2k, () => null), false);
  });
});
