/**
 * Torznab API Module
 * Provides Torznab indexer API for aMule integration with *arr apps
 */

const BaseModule = require('../lib/BaseModule');
const TorznabHandler = require('../lib/torznab/TorznabHandler');
const SoulseekTorznabHandler = require('../lib/torznab/SoulseekTorznabHandler');
const config = require('./config');
const clientMeta = require('../lib/clientMeta');
const response = require('../lib/responseFormatter');

// Client registry - replaces direct singleton manager imports
const registry = require('../lib/ClientRegistry');

class TorznabAPI extends BaseModule {
  constructor() {
    super();
    this.handler = new TorznabHandler();
    this.soulseekHandler = new SoulseekTorznabHandler();
    // Initialize handler dependencies.
    // Uses arrDownloadInstanceId (new generic key) -> amuleInstanceId (legacy) -> first
    // connected instance with search capability. Returns raw aMule client for backward
    // compat with TorznabHandler; non-aMule providers are gated with a warning.
    this.handler.setDependencies({
      getSearchProviderClient: () => {
        const integrations = config.getConfig()?.integrations || {};
        const configuredId = integrations.arrDownloadInstanceId || integrations.amuleInstanceId;
        let mgr;
        if (configuredId) {
          mgr = registry.get(configuredId);
          if (!mgr) {
            mgr = registry.getByType('amule').find(m => m.isConnected());
            if (mgr) this.warn(`⚠️ [TorznabAPI] Configured provider "${configuredId}" not found, falling back to "${mgr.instanceId}"`);
          }
        } else {
          mgr = registry.getByType('amule').find(m => m.isConnected());
        }
        if (!mgr) return null;
        if (!clientMeta.hasCapability(mgr.clientType, 'search')) {
          this.warn(`⚠️ [TorznabAPI] Provider "${mgr.instanceId}" (${mgr.clientType}) does not support search`);
          return null;
        }
        // Only aMule exposes a raw client with searchAndWaitResults; other types
        // (e.g. slskd) will be routed here once Phase 4 indexer support is added.
        return mgr.getClient?.() || null;
      }
    });

    // Soulseek indexer — resolves the first connected slskd instance
    this.soulseekHandler.setDependencies({
      getSlskdManager: () => {
        const mgrs = registry.getByType('slskd').filter(m => m.isConnected?.());
        return mgrs[0] || null;
      }
    });
  }

  /**
   * Middleware to check Torznab API key authentication (admin-only)
   */
  checkApiKey(req, res, next) {
    if (!config.getAuthEnabled()) return next();

    const apiKey = req.query.apikey || req.query.t;
    if (!apiKey) {
      return response.unauthorized(res, 'API key required');
    }

    try {
      if (!this.userManager) {
        return response.serverError(res, 'User management not available');
      }

      const user = this.userManager.getUserByApiKey(apiKey);

      if (!user || user.disabled) {
        return response.unauthorized(res, 'Invalid API key');
      }

      if (!user.is_admin) {
        return response.forbidden(res, 'Admin access required');
      }

      next();
    } catch (err) {
      this.error('Torznab API key verification error:', err);
      response.serverError(res, 'Internal server error');
    }
  }

  /**
   * Register all Torznab API routes
   */
  registerRoutes(app) {
    app.get('/indexer/amule/api', this.checkApiKey.bind(this), this.handler.handleRequest);
    app.get('/indexer/soulseek/api', this.checkApiKey.bind(this), this.soulseekHandler.handleRequest);

    this.log('🔍 Torznab API routes registered with authentication');
  }
}

module.exports = new TorznabAPI();
