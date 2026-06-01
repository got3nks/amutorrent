/**
 * qBittorrent API Module
 * Provides qBittorrent WebUI API v2 compatibility for aMule
 */

const crypto = require('crypto');
const express = require('express');
const BaseModule = require('../lib/BaseModule');
const QBittorrentHandler = require('../lib/qbittorrent/QBittorrentHandler');
const config = require('./config');
const { parseBasicAuth, verifyPassword } = require('../lib/authUtils');

// Client registry - replaces direct singleton manager imports
const registry = require('../lib/ClientRegistry');

// Session TTL for /api/v2 cookie sessions. Sliding-window: extended on each request.
// Matches qBittorrent's default WebUI session timeout.
const SID_TTL_MS = 60 * 60 * 1000;

class QBittorrentAPI extends BaseModule {
  constructor() {
    super();
    this.hashStore = null;
    this.handler = new QBittorrentHandler();
    // sid (hex string) → { userId, expiresAt }
    this._sessions = new Map();
  }

  /**
   * Issue a new SID for a freshly-authenticated user. Stored in-memory only —
   * server restart invalidates all sessions, matching qBittorrent's behavior.
   * @returns {{ sid: string, ttlMs: number }}
   */
  createSession(user) {
    const sid = crypto.randomBytes(32).toString('hex');
    this._sessions.set(sid, { userId: user.id, expiresAt: Date.now() + SID_TTL_MS });
    return { sid, ttlMs: SID_TTL_MS };
  }

  /**
   * Validate an SID. Re-fetches the user from DB so admin/disabled changes
   * since login take effect immediately. Extends expiry on success (sliding window).
   * @returns {object|null} fresh user object or null on invalid/expired
   */
  validateSession(sid) {
    if (!sid) return null;
    const entry = this._sessions.get(sid);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this._sessions.delete(sid);
      return null;
    }
    if (!this.userManager) return null;
    const user = this.userManager.getUser(entry.userId);
    if (!user || user.disabled || !user.is_admin) {
      this._sessions.delete(sid);
      return null;
    }
    entry.expiresAt = Date.now() + SID_TTL_MS;
    return user;
  }

  destroySession(sid) {
    if (sid) this._sessions.delete(sid);
  }

  /**
   * Auth middleware for /api/v2/*. Three accepted modes (in order):
   *   1. `Authorization: Bearer <apiKey>` — newer Sonarr's preferred mode.
   *   2. `Cookie: SID=<token>` — classic qBittorrent session flow used by
   *      Sonarr's username/password mode and qBit-native browser clients.
   *   3. `Authorization: Basic <base64(user:pass)>` — fallback for curl /
   *      direct tooling. password may also be an API key.
   * 401 on no auth provided. 403 on auth provided but rejected (matches
   * qBittorrent's behavior — Sonarr will then re-login on the SID path).
   * Admin role required on all paths.
   */
  async checkAuth(req, res, next) {
    if (!config.getAuthEnabled()) return next();

    if (!this.userManager) {
      return res.status(500).send('User management not available');
    }

    const authHeader = req.headers.authorization || '';

    // 1. Bearer API key
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      const user = this.userManager.getUserByApiKey(token);
      if (user && !user.disabled && user.is_admin) {
        req.apiUser = user;
        return next();
      }
      return res.status(403).send('Forbidden: Invalid bearer token');
    }

    // 2. SID cookie
    const sid = req.cookies?.SID;
    if (sid) {
      const user = this.validateSession(sid);
      if (user) {
        req.apiUser = user;
        return next();
      }
      // qBit returns 403 on expired/invalid session → triggers Sonarr's re-auth path
      return res.status(403).send('Forbidden: Session expired');
    }

    // 3. Basic Auth (fallback)
    if (authHeader.startsWith('Basic ')) {
      const credentials = parseBasicAuth(authHeader);
      if (!credentials || !credentials.password) {
        res.setHeader('WWW-Authenticate', 'Basic realm="qBittorrent"');
        return res.status(401).send('Unauthorized: Invalid auth header');
      }
      try {
        // Username + password
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
        // API key as password
        const user = this.userManager.getUserByApiKey(credentials.password);
        if (user && !user.disabled && user.is_admin) {
          if (credentials.username && user.username !== credentials.username) {
            res.setHeader('WWW-Authenticate', 'Basic realm="qBittorrent"');
            return res.status(403).send('Forbidden: Invalid credentials');
          }
          req.apiUser = user;
          return next();
        }
        res.setHeader('WWW-Authenticate', 'Basic realm="qBittorrent"');
        return res.status(403).send('Forbidden: Invalid credentials');
      } catch (err) {
        this.error('qBittorrent auth error:', err);
        return res.status(500).send('Internal server error');
      }
    }

    // 4. No auth provided
    res.setHeader('WWW-Authenticate', 'Basic realm="qBittorrent"');
    return res.status(401).send('Unauthorized: Authentication required');
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
      // Resolves the download/search provider manager.
      // Priority: integrations.arrDownloadInstanceId -> integrations.amuleInstanceId (legacy)
      // -> first connected aMule instance (backward compat).
      const resolveAmuleManager = () => {
        const integrations = config.getConfig()?.integrations || {};
        const configuredId = integrations.arrDownloadInstanceId || integrations.amuleInstanceId;
        let amuleMgr;
        if (configuredId) {
          amuleMgr = registry.get(configuredId);
          if (!amuleMgr) {
            amuleMgr = registry.getByType('amule').find(m => m.isConnected());
            if (amuleMgr) this.warn(`⚠️ [QBittorrentAPI] Configured provider "${configuredId}" not found, falling back to "${amuleMgr.instanceId}"`);
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
        userManager: this.userManager,
        createSession: (user) => this.createSession(user),
        destroySession: (sid) => this.destroySession(sid),
        getSlskdManager: () => {
          const mgrs = registry.getByType('slskd').filter(m => m.isConnected?.());
          return mgrs[0] || null;
        }
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

    // Protected router. Accepts Bearer API key, SID cookie, or Basic Auth (admin-only).
    const router = express.Router();
    router.use(this.checkAuth.bind(this));

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

    this.log('🗃️ qBittorrent API routes registered (Bearer / SID cookie / Basic Auth)');
  }
}

module.exports = new QBittorrentAPI();
