const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const restAPI = require('../modules/restAPI');
const webSocketHandlers = require('../modules/webSocketHandlers');
const registry = require('../lib/ClientRegistry');
const config = require('../modules/config');

// The REST bridge's context only had `log`, while handlers also call debug,
// warn and error: these four endpoints threw on success, then again in the
// catch, and always answered "context.error is not a function".

describe('REST bridge', () => {
  let server, base, originalAuth;

  before(async () => {
    originalAuth = config.getAuthEnabled;
    config.getAuthEnabled = () => false;
    registry.register('amule-rest', 'amule', {
      instanceId: 'amule-rest', clientType: 'amule', displayName: 'Sample aMule',
      isConnected: () => true, isEnabled: () => true,
      getStatsTree: async () => ({ label: 'Statistics' }),
      getServerInfo: async () => ({ header: 'Sample server' }),
      getServerList: async () => [{ name: 'Sample server' }],
      getLog: async () => 'sample log line'
    });
    restAPI.setHandlers(webSocketHandlers);
    const app = express();
    app.use(express.json());
    restAPI.registerRoutes(app);
    await new Promise(r => { server = app.listen(0, '127.0.0.1', r); });
    base = `http://127.0.0.1:${server.address().port}/api/v1`;
  });

  after(() => {
    server.close();
    registry.unregister('amule-rest');
    config.getAuthEnabled = originalAuth;
  });

  for (const [path, type] of [
    ['/amule/stats-tree', 'stats-tree-update'],
    ['/amule/server-info', 'server-info-update'],
    ['/amule/servers', 'servers-update'],
    ['/logs/amule', 'log-update']
  ]) {
    it(`GET ${path} answers with its data`, async () => {
      const body = await (await fetch(`${base}${path}?instanceId=amule-rest`)).json();
      assert.equal(body.type, type, JSON.stringify(body));
      assert.equal(body.instanceId, 'amule-rest');
    });
  }
});
