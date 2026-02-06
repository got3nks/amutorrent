/**
 * qBittorrent API Module
 * Provides qBittorrent WebUI API v2 compatibility for aMule
 */

const express = require('express');
const BaseModule = require('../lib/BaseModule');
const QBittorrentHandler = require('../lib/qbittorrent/QBittorrentHandler');
const config = require('./config');
const { parseBasicAuth, verifyPassword } = require('../lib/authUtils');

// Singleton managers - imported directly instead of injected
const amuleManager = require('./amuleManager');

class QBittorrentAPI extends BaseModule {
  constructor() {
    super();
    this.hashStore = null;
    this.handler = new QBittorrentHandler();
  }

  /**
   * Middleware to check HTTP Basic Authentication for qBittorrent API
   */
  async checkBasicAuth(req, res, next) {
    const authEnabled = config.getAuthEnabled();

    if (!authEnabled) {
      return next();
    }

    const credentials = parseBasicAuth(req.headers.authorization);

    if (!credentials) {
      res.setHeader('WWW-Authenticate', 'Basic realm="qBittorrent"');
      return res.status(401).send('Unauthorized: Authentication required');
    }

    try {
      if (!credentials.password) {
        res.setHeader('WWW-Authenticate', 'Basic realm="qBittorrent"');
        return res.status(401).send('Unauthorized: Password required');
      }

      const hashedPassword = config.getAuthPassword();

      if (!hashedPassword) {
        return next();
      }

      const isValid = await verifyPassword(credentials.password, hashedPassword);

      if (isValid) {
        next();
      } else {
        res.setHeader('WWW-Authenticate', 'Basic realm="qBittorrent"');
        res.status(401).send('Unauthorized: Invalid credentials');
      }
    } catch (err) {
      this.log('qBittorrent Basic Auth error:', err);
      res.status(500).send('Internal server error');
    }
  }

  /**
   * Set dependencies
   */
  setHashStore(store) {
    this.hashStore = store;
    this.updateHandler();
  }

  /**
   * Update handler when all dependencies are available
   */
  updateHandler() {
    if (amuleManager && this.hashStore) {
      this.handler.setDependencies({
        getAmuleClient: () => amuleManager.getClient(),
        hashStore: this.hashStore,
        config: config,
        isFirstRun: () => config.isFirstRun()
      });
    }
  }

  /**
   * Register all qBittorrent API routes
   */
  registerRoutes(app) {
    // Auth endpoints (no authentication required)
    app.post('/api/v2/auth/login', this.handler.login);
    app.post('/api/v2/auth/logout', this.handler.logout);

    // Protected router with Basic Auth middleware
    const router = express.Router();
    router.use(this.checkBasicAuth.bind(this));

    // App endpoints
    router.get('/app/version', this.handler.getVersion);
    router.get('/app/webapiVersion', this.handler.getWebApiVersion);
    router.get('/app/preferences', this.handler.getPreferences);

    // Torrents endpoints
    router.get('/torrents/info', this.handler.getTorrentsInfo);
    router.post('/torrents/add', this.handler.addTorrent);
    router.post('/torrents/delete', this.handler.deleteTorrent);
    router.post('/torrents/pause', this.handler.pauseTorrent);
    router.post('/torrents/resume', this.handler.resumeTorrent);
    router.get('/torrents/categories', this.handler.getCategories);
    router.post('/torrents/createCategory', this.handler.createCategory);

    // Mount protected router under /api/v2
    app.use('/api/v2', router);

    this.log('🗃️ qBittorrent API routes registered with Basic Auth protection');
  }
}

module.exports = new QBittorrentAPI();
