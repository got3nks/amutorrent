/**
 * Torznab API Module
 * Provides Torznab indexer API for aMule integration with *arr apps
 */

const BaseModule = require('../lib/BaseModule');
const TorznabHandler = require('../lib/torznab/TorznabHandler');
const config = require('./config');
const response = require('../lib/responseFormatter');

// Client registry - replaces direct singleton manager imports
const registry = require('../lib/ClientRegistry');

class TorznabAPI extends BaseModule {
  constructor() {
    super();
    this.handler = new TorznabHandler();
    // Initialize handler dependencies (uses configured or first aMule instance)
    this.handler.setDependencies({
      getAmuleClient: () => {
        const configuredId = config.getConfig()?.integrations?.amuleInstanceId;
        let amuleMgr;
        if (configuredId) {
          amuleMgr = registry.get(configuredId);
          if (!amuleMgr) {
            amuleMgr = registry.getByType('amule').find(m => m.isConnected());
            if (amuleMgr) this.warn(`⚠️ [TorznabAPI.getAmuleClient] Configured amuleInstanceId "${configuredId}" not found, falling back to "${amuleMgr.instanceId}"`);
          }
        } else {
          amuleMgr = registry.getByType('amule').find(m => m.isConnected());
        }
        return amuleMgr?.getClient() || null;
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

    this.log('🔍 Torznab API routes registered with authentication');
  }
}

module.exports = new TorznabAPI();
