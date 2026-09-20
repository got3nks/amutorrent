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
    // One resolver, and the client derived from it: the search lock and the
    // connection must be the same instance or the lock protects nothing.
    const resolveAmuleManager = () => {
      const configuredId = config.getConfig()?.integrations?.amuleInstanceId;
      if (configuredId) {
        const byId = registry.get(configuredId);
        if (byId) return byId;
        const fallback = registry.getByType('amule').find(m => m.isConnected());
        if (fallback) {
          this.warn(`⚠️ [TorznabAPI] Configured amuleInstanceId "${configuredId}" not found, falling back to "${fallback.instanceId}"`);
        }
        return fallback || null;
      }
      return registry.getByType('amule').find(m => m.isConnected()) || null;
    };

    this.handler.setDependencies({
      getAmuleManager: resolveAmuleManager,
      getAmuleClient: () => resolveAmuleManager()?.getClient() || null
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
