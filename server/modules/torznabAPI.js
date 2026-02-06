/**
 * Torznab API Module
 * Provides Torznab indexer API for aMule integration with *arr apps
 */

const BaseModule = require('../lib/BaseModule');
const TorznabHandler = require('../lib/torznab/TorznabHandler');
const config = require('./config');
const { verifyPassword } = require('../lib/authUtils');
const response = require('../lib/responseFormatter');

// Singleton managers - imported directly instead of injected
const amuleManager = require('./amuleManager');

class TorznabAPI extends BaseModule {
  constructor() {
    super();
    this.handler = new TorznabHandler();
    // Initialize handler dependencies
    this.handler.setDependencies({
      getAmuleClient: () => amuleManager.getClient()
    });
  }

  /**
   * Middleware to check Torznab API key authentication
   */
  async checkApiKey(req, res, next) {
    const authEnabled = config.getAuthEnabled();

    if (!authEnabled) {
      return next();
    }

    const apiKey = req.query.apikey || req.query.t;

    if (!apiKey) {
      return response.unauthorized(res, 'API key required');
    }

    try {
      const hashedPassword = config.getAuthPassword();

      if (!hashedPassword) {
        return next();
      }

      const isValid = await verifyPassword(apiKey, hashedPassword);

      if (isValid) {
        next();
      } else {
        response.unauthorized(res, 'Invalid API key');
      }
    } catch (err) {
      this.log('Torznab API key verification error:', err);
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
