/**
 * qBittorrent API Module
 * Provides qBittorrent WebUI API v2 compatibility for aMule
 */

const express = require('express');
const BaseModule = require('../lib/BaseModule');
const { createQBittorrentHandler } = require('../lib/qbittorrent');

class QBittorrentAPI extends BaseModule {
  constructor() {
    super();
    this.amuleManager = null;
    this.hashStore = null;
    this.configManager = null;
    this.handler = null;
  }

  /**
   * Set dependencies
   */
  setAmuleManager(manager) {
    this.amuleManager = manager;
    this.updateHandler();
  }

  setHashStore(store) {
    this.hashStore = store;
    this.updateHandler();
  }

  setConfigManager(manager) {
    this.configManager = manager;
    this.updateHandler();
  }

  /**
   * Update handler when dependencies are set
   */
  updateHandler() {
    if (this.amuleManager && this.hashStore && this.configManager) {
      this.handler = createQBittorrentHandler(
        () => this.amuleManager.getClient(),
        this.hashStore,
        () => this.configManager.isFirstRun()
      );
    }
  }

  /**
   * Ensure handler is initialized
   */
  ensureHandler(res) {
    if (!this.handler) {
      res.status(500).json({
        error: 'qBittorrent handler not initialized'
      });
      return false;
    }
    return true;
  }

  /**
   * Register all qBittorrent API routes
   */
  registerRoutes(app) {
    const router = express.Router();

    // App endpoints
    router.get('/app/version', (req, res) => {
      if (this.ensureHandler(res)) this.handler.getVersion(req, res);
    });

    router.get('/app/webapiVersion', (req, res) => {
      if (this.ensureHandler(res)) this.handler.getWebApiVersion(req, res);
    });

    router.get('/app/preferences', (req, res) => {
      if (this.ensureHandler(res)) this.handler.getPreferences(req, res);
    });

    // Auth endpoints
    router.post('/auth/login', (req, res) => {
      if (this.ensureHandler(res)) this.handler.login(req, res);
    });

    router.post('/auth/logout', (req, res) => {
      if (this.ensureHandler(res)) this.handler.logout(req, res);
    });

    // Torrents endpoints
    router.get('/torrents/info', (req, res) => {
      if (this.ensureHandler(res)) this.handler.getTorrentsInfo(req, res);
    });

    router.post('/torrents/add', (req, res) => {
      if (this.ensureHandler(res)) this.handler.addTorrent(req, res);
    });

    router.post('/torrents/delete', (req, res) => {
      if (this.ensureHandler(res)) this.handler.deleteTorrent(req, res);
    });

    router.post('/torrents/pause', (req, res) => {
      if (this.ensureHandler(res)) this.handler.pauseTorrent(req, res);
    });

    router.post('/torrents/resume', (req, res) => {
      if (this.ensureHandler(res)) this.handler.resumeTorrent(req, res);
    });

    router.get('/torrents/categories', (req, res) => {
      if (this.ensureHandler(res)) this.handler.getCategories(req, res);
    });

    router.post('/torrents/createCategory', (req, res) => {
      if (this.ensureHandler(res)) this.handler.createCategory(req, res);
    });

    // Mount router under /api/v2
    app.use('/api/v2', router);

    if (this.log) {
      this.log('🔌 qBittorrent API routes registered');
    }
  }
}

module.exports = new QBittorrentAPI();
