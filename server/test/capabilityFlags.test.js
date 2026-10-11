const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const clientMeta = require('../lib/clientMeta');
const { assembleUnifiedItems } = require('../lib/unifiedItemBuilder');

// The frontend used to ask "is this BitTorrent?" by network type. It now reads
// capabilities, and the item flag the server derives from them.

describe('torrent-shaped items', () => {
  it('carry hasTrackers from the trackers capability', () => {
    for (const type of Object.keys(clientMeta.CLIENT_TYPES)) {
      const [item] = assembleUnifiedItems([{ clientType: type, hash: 'ab12', name: 'Sample', instanceId: `${type}-x` }], []);
      assert.equal(item.hasTrackers, !!clientMeta.hasCapability(type, 'trackers'), type);
    }
  });
});

describe('Stop and pausing a shared item', () => {
  it('are capabilities, not a network check', () => {
    for (const type of Object.keys(clientMeta.CLIENT_TYPES)) {
      const torrent = !!clientMeta.hasCapability(type, 'trackers');
      assert.equal(!!clientMeta.hasCapability(type, 'stop'), torrent, `${type} stop`);
      assert.equal(!!clientMeta.hasCapability(type, 'pauseSeeding'), torrent, `${type} pauseSeeding`);
    }
  });
});
