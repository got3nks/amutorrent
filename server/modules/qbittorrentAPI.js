/**
 * qBittorrent API Module
 * Provides qBittorrent WebUI API v2 compatibility for aMule
 */

const express = require('express');
const BaseModule = require('../lib/BaseModule');
const QBittorrentHandler = require('../lib/qbittorrent/QBittorrentHandler');
const config = require('./config');
const { parseBasicAuth, verifyPassword } = require('../lib/authUtils');

// Client registry - replaces direct singleton manager imports
const registry = require('../lib/ClientRegistry');

class QBittorrentAPI extends BaseModule {
  constructor() {
    super();
    this.hashStore = null;
    this.handler = new QBittorrentHandler();
  }

  /**
   * Middleware to check HTTP Basic Authentication for qBittorrent API (admin-only)
   * Supports: username+password via Basic Auth, or API key as password.
   */
  async checkBasicAuth(req, res, next) {
    if (!config.getAuthEnabled()) return next();

    const credentials = parseBasicAuth(req.headers.authorization);
    if (!credentials) {
      res.setHeader('WWW-Authenticate', 'Basic realm="qBittorrent"');
      return res.status(401).send('Unauthorized: Authentication required');
    }

    if (!credentials.password) {
      res.setHeader('WWW-Authenticate', 'Basic realm="qBittorrent"');
      return res.status(401).send('Unauthorized: Password required');
    }

    try {
      if (!this.userManager) {
        return res.status(500).send('User management not available');
      }

      // Try username + password login
      if (credentials.username) {
        const user = this.userManager.getUserByUsername(credentials.username);
        if (user && !user.disabled && user.password_hash) {
          const isValid = await verifyPassword(credentials.password, user.password_hash);
          if (isValid) {
            if (!user.is_admin) {
              return res.status(403).send('Forbidden: Admin access required');
            }
            req.apiUser = user;
            return next();
          }
        }
      }

      // Try API key as password
      const user = this.userManager.getUserByApiKey(credentials.password);
      if (user && !user.disabled && user.is_admin) {
        if (credentials.username && user.username !== credentials.username) {
          res.setHeader('WWW-Authenticate', 'Basic realm="qBittorrent"');
          return res.status(401).send('Unauthorized: Invalid credentials');
        }
        req.apiUser = user;
        return next();
      }

      res.setHeader('WWW-Authenticate', 'Basic realm="qBittorrent"');
      res.status(401).send('Unauthorized: Invalid credentials');
    } catch (err) {
      this.error('qBittorrent Basic Auth error:', err);
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

  setUserManager(userManager) {
    super.setUserManager(userManager);
    this.updateHandler();
  }

  /**
   * Update handler when all dependencies are available
   */
  updateHandler() {
    if (this.hashStore) {
      const resolveAmuleManager = () => {
        const configuredId = config.getConfig()?.integrations?.amuleInstanceId;
        let amuleMgr;
        if (configuredId) {
          amuleMgr = registry.get(configuredId);
          if (!amuleMgr) {
            amuleMgr = registry.getByType('amule').find(m => m.isConnected());
            if (amuleMgr) this.warn(`⚠️ [QBittorrentAPI.getAmuleClient] Configured amuleInstanceId "${configuredId}" not found, falling back to "${amuleMgr.instanceId}"`);
          }
        } else {
          amuleMgr = registry.getByType('amule').find(m => m.isConnected());
        }
        return amuleMgr;
      };

      this.handler.setDependencies({
        getAmuleClient: () => resolveAmuleManager()?.getClient() || null,
        getAmuleInstanceId: () => resolveAmuleManager()?.instanceId || null,
        hashStore: this.hashStore,
        config: config,
        registry: registry,
        isFirstRun: () => config.isFirstRun(),
        userManager: this.userManager
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

    // Real qBittorrent client API (separate from compatibility API above)
    // Get files for a torrent from the real qBittorrent client
    app.get('/api/qbittorrent/files/:hash', async (req, res) => {
      try {
        const { hash } = req.params;
        const { instanceId } = req.query;

        const qbMgr = registry.get(instanceId);
        if (!qbMgr) {
          return res.status(503).json({ error: 'qBittorrent not connected' });
        }

        const files = await qbMgr.getFiles(hash);

        // Normalize to same format as rtorrent files API
        // qBit priority: 0=Do not download, 1=Normal, 6=High, 7=Max
        // Normalized:    0=Off,              1=Normal, 2=High
        const normalizedFiles = files.map((file, index) => ({
          index,
          path: file.name,
          size: file.size,
          sizeBytes: file.size,
          downloaded: Math.round(file.size * (file.progress || 0)),
          priority: file.priority === 0 ? 0 : file.priority >= 6 ? 2 : 1,
          progress: Math.round((file.progress || 0) * 100)
        }));

        res.json({ files: normalizedFiles });
      } catch (err) {
        this.error('Error fetching qBittorrent files:', err.message);
        res.status(500).json({ error: err.message });
      }
    });

    this.log('🗃️ qBittorrent API routes registered with Basic Auth protection');
  }
}

module.exports = new QBittorrentAPI();
