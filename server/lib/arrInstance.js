'use strict';

const config = require('../modules/config');
const registry = require('./ClientRegistry');
const clientMeta = require('./clientMeta');

/**
 * The instance the *arr integrations (Torznab, qBittorrent-compatible API)
 * search and download through: the configured one, else the first connected
 * instance with the `arrIntegration` capability.
 * @param {function} [warn] - Logs a fallback from a configured id that is gone
 * @returns {Object|null} manager
 */
function resolveArrManager(warn) {
  const configuredId = config.getConfig()?.integrations?.amuleInstanceId;
  if (configuredId) {
    const byId = registry.get(configuredId);
    if (byId) return byId;
  }
  const fallback = registry.getAll()
    .find(m => clientMeta.hasCapability(m.clientType, 'arrIntegration') && m.isConnected()) || null;
  if (configuredId && fallback) {
    warn?.(`⚠️ Configured *arr instance "${configuredId}" not found, falling back to "${fallback.instanceId}"`);
  }
  return fallback;
}

module.exports = { resolveArrManager };
