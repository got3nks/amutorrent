const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const arrManager = require('../modules/arrManager');
const config = require('../modules/config');

// With a trailing slash in the Sonarr/Radarr URL, the scheduler posted to
// `//api/v3/command`, which Sonarr answers with 405 for POST, while the
// Settings test (which trims the slash) passed (#103).

describe('Sonarr/Radarr URL', () => {
  let originalFetch, originalRuntime, calls;

  beforeEach(() => {
    originalFetch = global.fetch;
    originalRuntime = config.runtimeConfig;
    calls = [];
    global.fetch = async (url) => {
      calls.push(url);
      return { ok: true, status: 201, json: async () => ({ id: 1, status: 'completed' }), text: async () => '' };
    };
    config.runtimeConfig = {
      ...originalRuntime,
      integrations: {
        sonarr: { enabled: true, url: 'http://sonarr.local:8989/', apiKey: 'k', searchIntervalHours: 6 },
        radarr: { enabled: true, url: 'http://radarr.local:7878//', apiKey: 'k', searchIntervalHours: 6 }
      }
    };
    arrManager.log = arrManager.warn = arrManager.error = () => {};
  });

  afterEach(() => {
    global.fetch = originalFetch;
    config.runtimeConfig = originalRuntime;
  });

  it('drops trailing slashes from the configured URL', () => {
    assert.equal(arrManager.getServiceConfig('sonarr').url, 'http://sonarr.local:8989');
    assert.equal(arrManager.getServiceConfig('radarr').url, 'http://radarr.local:7878');
  });

  it('posts search commands to /api/v3/command, not //api/v3/command', async () => {
    await arrManager.searchEpisode(5);
    await arrManager.searchMovie(7);
    assert.ok(calls.length >= 2);
    for (const url of calls) assert.doesNotMatch(url, /[^:]\/\/api/, url);
    assert.ok(calls.includes('http://sonarr.local:8989/api/v3/command'));
    assert.ok(calls.includes('http://radarr.local:7878/api/v3/command'));
  });
});
