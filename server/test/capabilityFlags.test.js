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

describe('settings and wizard metadata', () => {
  const configAPI = require('../modules/configAPI');
  const api = typeof configAPI === 'function' ? new configAPI() : configAPI;
  const config = require('../modules/config');

  it('ships capabilities for every client type', () => {
    assert.deepEqual(Object.keys(api.buildClientCapabilities()), Object.keys(clientMeta.CLIENT_TYPES));
  });

  it('builds one from-env flag per client env field, from the env registry', () => {
    // Used to be a hand-written list that each new client had to extend.
    const flags = api.buildClientFromEnvMeta();
    for (const [type, fields] of Object.entries(config.CLIENT_ENV_FIELDS)) {
      for (const { field } of Object.values(fields)) {
        assert.ok(`${type}${field[0].toUpperCase()}${field.slice(1)}` in flags, `${type}.${field}`);
      }
    }
  });
});

describe('*arr instance', () => {
  const registry = require('../lib/ClientRegistry');
  const { resolveArrManager } = require('../lib/arrInstance');
  const fake = (instanceId, clientType, connected) => ({ instanceId, clientType, isConnected: () => connected });

  it('picks the first connected instance with arrIntegration', () => {
    registry.register('transmission-arr', 'transmission', fake('transmission-arr', 'transmission', true));
    registry.register('amule-arr-off', 'amule', fake('amule-arr-off', 'amule', false));
    registry.register('amule-arr-on', 'amule', fake('amule-arr-on', 'amule', true));
    try {
      assert.equal(resolveArrManager()?.instanceId, 'amule-arr-on');
    } finally {
      for (const id of ['transmission-arr', 'amule-arr-off', 'amule-arr-on']) registry.unregister(id);
    }
  });
});
