/**
 * WebSocket Handlers Module
 * Handles all WebSocket message handlers and real-time updates
 */

const fs = require('fs').promises;
const path = require('path');
const cookieSignature = require('cookie-signature');
const BaseModule = require('../lib/BaseModule');
const config = require('./config');
const logger = require('../lib/logger');
const { getClientIP } = require('../lib/authUtils');
const dataFetchService = require('../lib/DataFetchService');
const autoRefreshManager = require('./autoRefreshManager');
const moveOperationManager = require('../lib/MoveOperationManager');
const { checkPathPermissions, resolveItemPath, resolveCategoryDestPaths } = require('../lib/pathUtils');

// Client registry and metadata for multi-instance manager lookups
const registry = require('../lib/ClientRegistry');
const clientMeta = require('../lib/clientMeta');
const { itemKey } = require('../lib/itemKey');
const { parseTorrentBuffer } = require('../lib/torrentUtils');
const geoIPManager = require('./geoIPManager');
const authManager = require('./authManager');
const categoryManager = require('../lib/CategoryManager');
const prowlarrAPI = require('./prowlarrAPI');
const eventScriptingManager = require('../lib/EventScriptingManager');

// Capability requirements per WS action (actions not listed require no specific capability)
const ACTION_CAPABILITIES = {
  search: ['search'],
  getPreviousSearchResults: ['search'],
  batchDownloadSearchResults: ['add_downloads'],
  addEd2kLinks: ['add_downloads'],
  addMagnetLinks: ['add_downloads'],
  addTorrentFile: ['add_downloads'],
  batchPause: ['pause_resume'],
  batchResume: ['pause_resume'],
  batchStop: ['pause_resume'],
  batchDelete: ['remove_downloads'],
  batchSetFileCategory: ['assign_categories'],
  batchMoveFiles: ['edit_downloads'],
  createCategory: ['manage_categories'],
  updateCategory: ['manage_categories'],
  deleteCategory: ['manage_categories'],
  getServersList: ['view_servers'],
  serverDoAction: ['view_servers'],
  getServerInfo: ['view_servers'],
  getLog: ['view_logs'],
  getAppLog: ['view_logs'],
  getQbittorrentLog: ['view_logs'],
  getStatsTree: ['view_statistics'],
  refreshSharedFiles: ['view_shared'],
  renameFile: ['rename_files'],
  checkDeletePermissions: ['remove_downloads'],
  checkMovePermissions: ['move_files'],
};

class WebSocketHandlers extends BaseModule {
  constructor() {
    super();
    // Track when the last aMule search was performed
    this.lastAmuleSearchTimestamp = 0;
    this.lastAmuleSearchInstanceId = null;
  }

  /**
   * Resolve manager by instanceId (preferred) or first of clientType (fallback).
   * @param {string|null} instanceId - Instance ID to look up directly
   * @param {string|null} clientType - Client type fallback (e.g. 'rtorrent', 'qbittorrent', 'amule')
   * @returns {Object|null} Manager instance or null
   */
  _getManager(instanceId, clientType) {
    if (instanceId) {
      const mgr = registry.get(instanceId);
      if (mgr) return mgr;
    }
    if (clientType) {
      const all = registry.getByType(clientType);
      const fallback = all.find(m => m.isConnected?.()) || all.find(m => m.isEnabled?.()) || all[0] || null;
      if (fallback) logger.log(`⚠️ [WebSocket._getManager] No instanceId provided, falling back to ${clientType} instance "${fallback.instanceId}"`);
      return fallback;
    }
    return null;
  }

  /**
   * Parse cookies from cookie header
   * @param {string} cookieHeader - Cookie header string
   * @returns {Object} Parsed cookies as key-value pairs
   */
  parseCookies(cookieHeader) {
    if (!cookieHeader) return {};

    return cookieHeader.split(';').reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split('=');
      if (key && value) {
        try { acc[key] = decodeURIComponent(value); } catch { acc[key] = value; }
      }
      return acc;
    }, {});
  }

  /**
   * Parse and verify signed session cookie to extract session ID.
   * Express-session uses format: s:<sessionId>.<signature>
   * The signature is verified using the session secret via cookie-signature.
   * @param {string} signedCookie - Signed cookie value
   * @returns {string|null} Session ID or null if invalid/tampered
   */
  parseSignedCookie(signedCookie) {
    if (!signedCookie) return null;

    // Check if it starts with 's:' (signed cookie prefix)
    if (!signedCookie.startsWith('s:')) {
      return null;
    }

    // Verify signature using session secret
    const secret = config.ensureSessionSecret();
    const unsigned = cookieSignature.unsign(signedCookie.slice(2), secret);

    // unsign() returns false if signature is invalid
    if (unsigned === false) {
      return null;
    }

    return unsigned;
  }

  // Create client-specific logger
  createClientLog(ws, username, nickname, clientIp) {
    return (...args) => {
      const logParts = [];
      args.forEach(arg => {
        if (arg instanceof Error) {
          // Special handling for Error objects
          const errorString = `${arg.name}: ${arg.message}\n${arg.stack}`;
          logParts.push(errorString);
        } else if (typeof arg === 'object' && arg !== null) {
          // Full object as JSON
          try {
            logParts.push(JSON.stringify(arg));
          } catch {
            logParts.push('[Circular]');
          }
        } else {
          logParts.push(String(arg));
        }
      });
      const logMessage = `[${clientIp}(${username}, ${nickname})] ${logParts.join(' ')}`;
      // Use the main logger which will add timestamp and write to both console and file
      this.log && this.log(logMessage);
    };
  }

  // Create context object with all client-specific utilities
  createContext(ws, username, nickname, clientIp) {
    return {
      ws,
      log: this.createClientLog(ws, username, nickname, clientIp),
      send: (data) => ws.send(JSON.stringify(data)),
      clientInfo: { username, nickname, clientIp },
      broadcast: this.broadcast,
      categoryManager
    };
  }

  // Handle WebSocket connection
  handleConnection(ws, req) {
    // Get username from configurable header (for proxy auth like Authelia)
    // Falls back to 'remote-user' if not configured, then 'unknown'
    const proxyConfig = config.getTrustedProxyConfig();
    const usernameHeader = (proxyConfig.usernameHeader || 'remote-user').toLowerCase();
    let username = req.headers[usernameHeader] || 'unknown';
    const nickname = req.headers['remote-name'] || 'unknown';
    const clientIp = getClientIP(req);

    // Check authentication if enabled
    let sessionUser = null;
    let sessionId = null;
    const authEnabled = config.getAuthEnabled();
    if (authEnabled) {
      // Parse cookies from WebSocket upgrade request
      const cookieHeader = req.headers.cookie;
      if (!cookieHeader) {
        ws.close(1008, 'Authentication required');
        this.log(`🚫 WebSocket rejected from ${clientIp}: No cookies`);
        return;
      }

      // Parse session cookie
      const cookies = this.parseCookies(cookieHeader);
      const signedSessionCookie = cookies['amule.sid'];

      if (!signedSessionCookie) {
        ws.close(1008, 'Authentication required');
        this.log(`🚫 WebSocket rejected from ${clientIp}: No session cookie`);
        return;
      }

      // Parse signed cookie to extract session ID
      sessionId = this.parseSignedCookie(signedSessionCookie);

      if (!sessionId) {
        ws.close(1008, 'Authentication required');
        this.log(`🚫 WebSocket rejected from ${clientIp}: Invalid session cookie format`);
        return;
      }

      // Validate session
      if (!authManager.validateSession(sessionId)) {
        ws.close(1008, 'Authentication required');
        this.log(`🚫 WebSocket rejected from ${clientIp}: Invalid or expired session`);
        return;
      }

      // Extract user info from session
      sessionUser = authManager.getSessionUser(sessionId);
      if (sessionUser && sessionUser.username) {
        username = sessionUser.username;
      }
    }

    const geoData = geoIPManager.getGeoIPData(clientIp);
    const locationInfo = geoIPManager.formatLocationInfo(geoData);

    const context = this.createContext(ws, username, nickname, clientIp);

    // Attach user info to context for capability enforcement
    if (sessionUser) {
      context.clientInfo.userId = sessionUser.userId;
      context.clientInfo.isAdmin = sessionUser.isAdmin;
      context.clientInfo.capabilities = sessionUser.capabilities;
    } else if (!authEnabled) {
      // Auth disabled — treat all connections as admin
      context.clientInfo.isAdmin = true;
    }

    // Attach user info to ws object for per-client broadcast filtering
    ws.user = {
      userId: sessionUser?.userId || null,
      username: sessionUser?.username || username,
      isAdmin: authEnabled ? (sessionUser?.isAdmin || false) : true,
      capabilities: sessionUser?.capabilities || [],
      subscriptions: new Set()
    };

    context.log(`New WebSocket connection from ${clientIp}${locationInfo}`);
    context.send({ type: 'connected', message: 'Connected to aMule Controller' });
    context.send({ type: 'search-lock', locked: registry.getByType('amule').some(m => m.isSearchInProgress()) });

    // Send cached batch update to newly connected client (if available), filtered by ownership
    // Always sends full snapshot (items array), never delta, for new connections
    const cachedBatchUpdate = autoRefreshManager.getCachedBatchUpdate();
    if (cachedBatchUpdate) {
      const batchData = cachedBatchUpdate.data || cachedBatchUpdate;
      const filtered = this._filterBatchUpdateForUser(batchData, context.clientInfo, ws.user);
      context.send({ type: 'batch-update', data: filtered });
      context.log('Sent cached batch update to new client');
    }

    // Periodic session re-validation (every 5 minutes)
    let sessionHeartbeat = null;
    if (authEnabled && sessionId) {
      sessionHeartbeat = setInterval(() => {
        if (!authManager.validateSession(sessionId)) {
          context.log(`Session expired for ${username}, closing WebSocket`);
          clearInterval(sessionHeartbeat);
          ws.close(4001, 'Session expired');
        }
      }, 5 * 60 * 1000);
    }

    ws.on('message', async message => {
      await this.handleMessage(message, context);
    });

    ws.on('close', () => {
      if (sessionHeartbeat) clearInterval(sessionHeartbeat);
      context.log(`WebSocket connection closed from ${clientIp}`);
    });
    ws.on('error', (err) => context.log('WebSocket error:', err));
  }

  // Handle WebSocket messages
  async handleMessage(message, context) {
    try {
      const data = JSON.parse(message);
      context.log(`Received action: ${data.action}`, data);

      // Capability gate: check if the user has the required capability for this action
      const requiredCaps = ACTION_CAPABILITIES[data.action];
      if (requiredCaps && !this._hasCapability(context, ...requiredCaps)) {
        logger.warn(`[WS Auth] Capability denied: user="${context.clientInfo.username}" (id=${context.clientInfo.userId}) missing [${requiredCaps.join(', ')}] for action="${data.action}"`);
        context.send({ type: 'error', message: 'Insufficient permissions' });
        return;
      }

      // Auto-reconnect all enabled-but-disconnected aMule instances
      for (const mgr of registry.getByType('amule')) {
        if (mgr.isEnabled() && !mgr.isConnected()) {
          try { await mgr.initClient(); } catch (e) { /* will retry on next message */ }
        }
      }

      switch (data.action) {
        case 'search': await this.handleSearch(data, context); break;
        case 'getPreviousSearchResults': await this.handleGetPreviousSearchResults(data, context); break;
        case 'refreshSharedFiles': await this.handleRefreshSharedFiles(data, context); break;
        case 'getServersList': await this.handleGetServersList(data, context); break;
        case 'serverDoAction': await this.handleServerDoAction(data, context); break;
        case 'getStatsTree': await this.handleGetStatsTree(data, context); break;
        case 'getServerInfo': await this.handleGetServerInfo(data, context); break;
        case 'getLog': await this.handleGetLog(data, context); break;
        case 'getAppLog': await this.handleGetAppLog(context); break;
        case 'getQbittorrentLog': await this.handleGetQbittorrentLog(data, context); break;
        case 'batchDownloadSearchResults': await this.handleBatchDownloadSearchResults(data, context); break;
        case 'addEd2kLinks': await this.handleAddEd2kLinks(data, context); break;
        case 'addMagnetLinks': await this.handleAddMagnetLinks(data, context); break;
        case 'addTorrentFile': await this.handleAddTorrentFile(data, context); break;
        case 'getCategories': await this.handleGetCategories(context); break;
        case 'createCategory': await this.handleCreateCategory(data, context); break;
        case 'updateCategory': await this.handleUpdateCategory(data, context); break;
        case 'deleteCategory': await this.handleDeleteCategory(data, context); break;
        // All file operations use batch handlers (single broadcast, handles 1 or N items)
        case 'batchPause': await this.handleBatchPause(data, context); break;
        case 'batchResume': await this.handleBatchResume(data, context); break;
        case 'batchStop': await this.handleBatchStop(data, context); break;
        case 'batchDelete': await this.handleBatchDelete(data, context); break;
        case 'batchSetFileCategory': await this.handleBatchSetFileCategory(data, context); break;
        case 'batchMoveFiles': await this.handleBatchMoveFiles(data, context); break;
        case 'renameFile': await this.handleRenameFile(data, context); break;
        case 'checkDeletePermissions': await this.handleCheckDeletePermissions(data, context); break;
        case 'checkMovePermissions': await this.handleCheckMovePermissions(data, context); break;
        case 'checkMoveToPermissions': await this.handleCheckMoveToPermissions(data, context); break;
        case 'requestFullSnapshot': this.handleRequestFullSnapshot(context); break;
        case 'subscribe': this.handleSubscribe(data, context); break;
        case 'unsubscribe': this.handleUnsubscribe(data, context); break;
        default:
          context.send({ type: 'error', message: `Unknown action: ${data.action}` });
      }
    } catch (err) {
      context.log('Error processing message:', err);
      context.send({ type: 'error', message: err.message });
    }
  }

  // Handler implementations
  async handleSearch(data, context) {
    const manager = this._getManager(data.instanceId, 'amule');
    if (!manager) {
      context.send({ type: 'error', message: 'No aMule instance available' });
      return;
    }
    if (!manager.acquireSearchLock()) {
      context.send({ type: 'error', message: 'Another search is running on this instance' });
      return;
    }

    const searchFilter = { filter: u => u?.isAdmin || u?.capabilities?.includes('search') };
    context.broadcast({ type: 'search-lock', locked: true }, searchFilter);

    try {
      const result = await manager.search(data.query, data.type, data.extension);
      // Track timestamp and instance for comparison with Prowlarr results
      this.lastAmuleSearchTimestamp = Date.now();
      this.lastAmuleSearchInstanceId = manager.instanceId;
      context.broadcast({ type: 'search-results', data: result.results || [], instanceId: manager.instanceId }, searchFilter);
      context.log(`Search completed on ${manager.displayName}: ${result.resultsLength || 0} results found`);
    } catch (err) {
      context.log('Search error:', err);
      context.send({ type: 'error', message: 'Search failed: ' + err.message });
    } finally {
      manager.releaseSearchLock();
      context.broadcast({ type: 'search-lock', locked: false }, searchFilter);
    }
  }

  async handleGetPreviousSearchResults(data, context) {
    try {
      // Get Prowlarr cached results (already transformed)
      const prowlarrCache = prowlarrAPI.getCachedResults();

      // Get aMule cached results from the specified or last-searched instance
      const instanceId = data?.instanceId || this.lastAmuleSearchInstanceId;
      const manager = this._getManager(instanceId, 'amule');
      let amuleResults = [];
      try {
        if (manager) {
          const result = await manager.getSearchResults();
          amuleResults = result.results || [];
        }
      } catch (err) {
        // aMule might not be connected, that's ok
        context.log('aMule search results not available:', err.message);
      }

      // Compare timestamps and return the most recent
      if (prowlarrCache.timestamp > this.lastAmuleSearchTimestamp && prowlarrCache.results.length > 0) {
        context.send({ type: 'previous-search-results', data: prowlarrCache.results });
        context.log(`Previous search results: ${prowlarrCache.results.length} Prowlarr results (more recent)`);
      } else {
        context.send({ type: 'previous-search-results', data: amuleResults, instanceId: manager?.instanceId });
        context.log(`Previous search results: ${amuleResults.length} aMule results`);
      }
    } catch (err) {
      context.log('Get previous search results error:', err);
      context.send({ type: 'previous-search-results', data: [] });
    }
  }

  async handleRefreshSharedFiles(data, context) {
    try {
      const managers = registry.getByType('amule').filter(m => m.isConnected());
      if (managers.length === 0) {
        context.send({ type: 'error', message: 'No aMule instance available' });
        return;
      }
      for (const mgr of managers) {
        try {
          await mgr.refreshSharedFiles();
          context.log(`Shared files refresh command sent to ${mgr.displayName}`);
        } catch (err) {
          context.log(`Shared files refresh failed for ${mgr.displayName}: ${err.message}`);
        }
      }
      context.send({ type: 'shared-files-refreshed', message: 'Shared files reloaded successfully' });
      // Broadcast unified items after refresh
      setTimeout(async () => {
        await this.broadcastItemsUpdate(context);
      }, 100);
    } catch (err) {
      context.log('Refresh shared files error:', err);
      context.send({ type: 'error', message: 'Failed to refresh shared files: ' + err.message });
    }
  }

  async handleGetServersList(data, context) {
    try {
      const manager = this._getManager(data?.instanceId, 'amule');
      if (!manager) {
        context.send({ type: 'error', message: 'No aMule instance available' });
        return;
      }
      const servers = await manager.getServerList();
      context.send({ type: 'servers-update', data: servers, instanceId: manager.instanceId });
      context.log('Servers list fetched successfully');
    } catch (err) {
      context.log('Get servers list error:', err);
      context.send({ type: 'error', message: 'Failed to fetch servers list: ' + err.message });
    }
  }

  async handleServerDoAction(data, context) {
    try {
      const { ip, port, serverAction, instanceId } = data;
      if (!ip || !port || !serverAction) {
        throw new Error('Missing required parameters: ip, port, or serverAction');
      }

      const manager = this._getManager(instanceId, 'amule');
      if (!manager) {
        context.send({ type: 'error', message: 'No aMule instance available' });
        return;
      }

      let success;

      switch (serverAction) {
        case 'connect':
          success = await manager.connectServer(ip, port);
          break;
        case 'disconnect':
          success = await manager.disconnectServer(ip, port);
          break;
        case 'remove':
          success = await manager.removeServer(ip, port);
          break;
        default:
          throw new Error(`Unknown action: ${serverAction}`);
      }

      context.send({ type: 'server-action', data: success, instanceId: manager.instanceId });
      context.log(`Action ${serverAction} on server ${ip}:${port} ${success ? 'completed successfully' : 'failed'}`);
    } catch (err) {
      context.log('Server action error:', err);
      context.send({ type: 'error', message: `Failed to perform action on server: ${err.message}` });
    }
  }

  async handleGetStatsTree(data, context) {
    try {
      const manager = this._getManager(data?.instanceId, 'amule');
      if (!manager) {
        context.send({ type: 'error', message: 'aMule client not connected. Please complete setup first.' });
        return;
      }
      const statsTree = await manager.getStatsTree();
      context.send({ type: 'stats-tree-update', data: statsTree, instanceId: manager.instanceId });
      context.log('Stats tree fetched successfully');
    } catch (err) {
      context.log('Get stats tree error:', err);
      context.send({ type: 'error', message: 'Failed to fetch stats tree: ' + err.message });
    }
  }

  async handleGetServerInfo(data, context) {
    try {
      const manager = this._getManager(data?.instanceId, 'amule');
      if (!manager) {
        context.send({ type: 'error', message: 'No aMule instance available' });
        return;
      }
      const serverInfo = await manager.getServerInfo();
      context.send({ type: 'server-info-update', data: serverInfo, instanceId: manager.instanceId });
      context.log('Server info fetched successfully');
    } catch (err) {
      context.log('Get server info error:', err);
      context.send({ type: 'error', message: 'Failed to fetch server info: ' + err.message });
    }
  }

  async handleGetLog(data, context) {
    try {
      const manager = this._getManager(data?.instanceId, 'amule');
      if (!manager) {
        context.send({ type: 'error', message: 'No aMule instance available' });
        return;
      }
      const log = await manager.getLog();
      context.send({ type: 'log-update', data: log, instanceId: manager.instanceId });
      context.log('Log fetched successfully');
    } catch (err) {
      context.log('Get log error:', err);
      context.send({ type: 'error', message: 'Failed to fetch log: ' + err.message });
    }
  }

  async handleGetAppLog(context) {
    try {
      const log = await logger.readLog(500);
      context.send({ type: 'app-log-update', data: log });
    } catch (err) {
      context.log('Get app log error:', err);
      context.send({ type: 'error', message: 'Failed to fetch app log: ' + err.message });
    }
  }

  async handleGetQbittorrentLog(data, context) {
    try {
      const qbMgr = this._getManager(data?.instanceId, 'qbittorrent');
      if (!qbMgr) {
        context.send({ type: 'error', message: 'No qBittorrent instance registered' });
        return;
      }
      const log = await qbMgr.getLog();
      context.send({ type: 'qbittorrent-log-update', data: log, instanceId: qbMgr.instanceId });
    } catch (err) {
      context.log('Get qBittorrent log error:', err);
      context.send({ type: 'error', message: 'Failed to fetch qBittorrent log: ' + err.message });
    }
  }

  async handleBatchDownloadSearchResults(data, context) {
    try {
      const { fileHashes, categoryId: rawCategoryId, categoryName } = data;

      if (!fileHashes || !Array.isArray(fileHashes) || fileHashes.length === 0) {
        throw new Error('No file hashes provided for batch download');
      }

      const manager = this._getManager(data.instanceId, 'amule');
      if (!manager) { throw new Error('No aMule instance available'); }

      // Support both legacy categoryId and new categoryName
      let categoryId = 0;
      if (categoryName) {
        // Ensure category exists in aMule (creates if needed)
        // This handles rTorrent-only categories that don't have an amuleId yet
        categoryId = await manager.ensureAmuleCategoryId(categoryName) ?? 0;
        context.log(`Category lookup: name="${categoryName}" → amuleId=${categoryId}`);
      } else if (rawCategoryId !== undefined && rawCategoryId !== null) {
        categoryId = rawCategoryId;
        context.log(`Using legacy categoryId: ${categoryId}`);
      }
      const username = context.clientInfo.username !== 'unknown' ? context.clientInfo.username : null;

      // File info callback for history tracking (resolves hash → filename/size from search results)
      const fileInfoCallback = async (hash) => {
        try {
          const searchResults = await manager.getSearchResults();
          const results = searchResults?.results || [];
          const file = results.find(r => {
            const resultHash = r.fileHash || r.raw?.EC_TAG_SEARCHFILE_HASH;
            return resultHash?.toLowerCase() === hash.toLowerCase();
          });
          if (file) {
            const filename = file.fileName || file.raw?.EC_TAG_PARTFILE_NAME || 'Unknown';
            const size = file.fileSize || file.raw?.EC_TAG_PARTFILE_SIZE_FULL || null;
            return { filename, size };
          }
        } catch (err) {
          // Silently fail - filename will be 'Unknown'
        }
        return { filename: 'Unknown', size: null };
      };

      const results = [];
      for (const fileHash of fileHashes) {
        try {
          const success = await manager.addSearchResult(fileHash, categoryId, username, fileInfoCallback);
          results.push({ fileHash, success });
          if (success && context.clientInfo.userId && this.userManager) {
            this.userManager.recordOwnership(itemKey(manager.instanceId, fileHash), context.clientInfo.userId);
          }
          context.log(`Download ${success ? 'started' : 'failed'} for: ${fileHash} (category: ${categoryId})`);
        } catch (err) {
          context.log(`Download failed for ${fileHash}: ${err.message}`);
          results.push({ fileHash, success: false, error: err.message });
        }
      }

      // Broadcast unified items for instant UI feedback
      await this.broadcastItemsUpdate(context);

      const successCount = results.filter(r => r.success).length;
      context.send({
        type: 'batch-download-complete',
        results,
        message: `Downloaded ${successCount}/${fileHashes.length} files`
      });
      context.log(`Batch download: ${successCount}/${fileHashes.length} successful`);
    } catch (err) {
      context.log('Batch download error:', err);
      context.send({ type: 'error', message: 'Batch download failed: ' + err.message });
    }
  }

  async handleAddEd2kLinks(data, context) {
    try {
      const links = data.links;
      const username = context.clientInfo.username !== 'unknown' ? context.clientInfo.username : null;

      const cleaned = links
        .map(s => String(s).trim())
        .filter(Boolean);

      if (cleaned.length === 0) {
        context.send({ type: 'error', message: 'No ED2K links provided' });
        return;
      }

      const manager = this._getManager(data.instanceId, 'amule');
      if (!manager) { throw new Error('No aMule instance available for ED2K links'); }

      // Resolve category: prefer categoryName (new), fall back to categoryId (legacy)
      let categoryId = data.categoryId || 0;
      if (data.categoryName) {
        const resolved = await manager.ensureAmuleCategoryId(data.categoryName);
        categoryId = resolved ?? 0;
        context.log(`Category lookup: name="${data.categoryName}" → amuleId=${categoryId}`);
      }

      const results = [];
      for (const link of cleaned) {
        context.log(`Adding ED2K link: ${link} (category: ${categoryId})`);
        // Process links sequentially using the existing queue to maintain order and avoid saturating aMule
        const success = await manager.addEd2kLink(link, categoryId, username);
        results.push({ link, success });
        // Record ownership — extract hash from ed2k link format: ed2k://|file|name|size|hash|/
        if (success && context.clientInfo.userId && this.userManager) {
          const hashMatch = link.match(/\|([a-fA-F0-9]{32})\|/);
          if (hashMatch) {
            this.userManager.recordOwnership(itemKey(manager.instanceId, hashMatch[1]), context.clientInfo.userId);
          }
        }
      }

      // Broadcast unified items for instant UI feedback
      await this.broadcastItemsUpdate(context);

      context.send({ type: 'ed2k-added', results });
    } catch (err) {
      context.log('Failed to add ED2K links:', err);
      context.send({ type: 'error', message: `Failed to add ED2K links: ${err.message}` });
    }
  }

  async handleAddMagnetLinks(data, context) {
    try {
      const { links, label, clientId = 'rtorrent', instanceId, savePath: customSavePath } = data;

      // Resolve manager from registry
      const manager = this._getManager(instanceId, clientId);
      if (!manager || !manager.isConnected()) {
        context.send({ type: 'error', message: `${clientId} is not connected` });
        return;
      }

      if (!links || !Array.isArray(links) || links.length === 0) {
        context.send({ type: 'error', message: 'No magnet links provided' });
        return;
      }

      // Look up category path and priority from CategoryManager
      // Auto-create category if it doesn't exist (for "create new category" option in modal)
      let category = label ? context.categoryManager.getByName(label) : null;
      if (label && !category) {
        context.log(`Creating new category "${label}" on demand`);
        category = await context.categoryManager.create(label);
        // Re-validate all paths after category change
        await context.categoryManager.validateAllPaths();
        // Broadcast updated categories to all clients
        const { categories: updatedCategories, clientDefaultPaths, hasPathWarnings } = context.categoryManager.getAllForFrontend();
        context.broadcast({ type: 'categories-update', data: updatedCategories, clientDefaultPaths, hasPathWarnings });
      }
      const directory = customSavePath || category?.path || null;

      const username = context.clientInfo.username !== 'unknown' ? context.clientInfo.username : null;
      const results = [];
      const addOptions = { categoryName: label || '', savePath: directory, priority: category?.priority, start: true, username };
      const clientName = manager.displayName || clientId;

      for (const magnetUri of links) {
        try {
          context.log(`Adding magnet link to ${clientName}: ${magnetUri.substring(0, 60)}... (category: ${label || 'none'}${directory ? `, path: ${directory}` : ''})`);
          await manager.addMagnet(magnetUri, addOptions);
          results.push({ link: magnetUri, success: true });
          // Record ownership — extract hash from magnet URI xt=urn:btih:<hash>
          if (context.clientInfo.userId && this.userManager) {
            const hashMatch = magnetUri.match(/xt=urn:btih:([a-fA-F0-9]{40})/i);
            if (hashMatch) {
              this.userManager.recordOwnership(itemKey(manager.instanceId, hashMatch[1]), context.clientInfo.userId);
            }
          }
        } catch (err) {
          context.log(`Failed to add magnet to ${clientName}: ${err.message}`);
          results.push({ link: magnetUri, success: false, error: err.message });
        }
      }

      // Broadcast unified items for instant UI feedback
      await this.broadcastItemsUpdate(context);

      context.send({ type: 'magnet-added', results, clientId });
    } catch (err) {
      context.log('Failed to add magnet links:', err);
      context.send({ type: 'error', message: `Failed to add magnet links: ${err.message}` });
    }
  }

  async handleAddTorrentFile(data, context) {
    try {
      const { fileData, fileName, label, clientId = 'rtorrent', instanceId, savePath: customSavePath } = data;

      // Resolve manager from registry
      const manager = this._getManager(instanceId, clientId);
      if (!manager || !manager.isConnected()) {
        context.send({ type: 'error', message: `${clientId} is not connected` });
        return;
      }

      if (!fileData) {
        context.send({ type: 'error', message: 'No torrent file data provided' });
        return;
      }

      // Look up category path and priority from CategoryManager
      // Auto-create category if it doesn't exist (for "create new category" option in modal)
      let category = label ? context.categoryManager.getByName(label) : null;
      if (label && !category) {
        context.log(`Creating new category "${label}" on demand`);
        category = await context.categoryManager.create(label);
        // Re-validate all paths after category change
        await context.categoryManager.validateAllPaths();
        // Broadcast updated categories to all clients
        const { categories: updatedCategories, clientDefaultPaths, hasPathWarnings } = context.categoryManager.getAllForFrontend();
        context.broadcast({ type: 'categories-update', data: updatedCategories, clientDefaultPaths, hasPathWarnings });
      }
      const directory = customSavePath || category?.path || null;

      // fileData is base64 encoded - convert to Buffer
      const buffer = Buffer.from(fileData, 'base64');
      const username = context.clientInfo.username !== 'unknown' ? context.clientInfo.username : null;
      const clientName = manager.displayName || clientId;

      context.log(`Adding torrent file to ${clientName}: ${fileName} (category: ${label || 'none'}${directory ? `, path: ${directory}` : ''})`);

      await manager.addTorrentRaw(buffer, {
        categoryName: label || '', savePath: directory, priority: category?.priority,
        start: true, filename: fileName, username
      });

      // Record ownership — extract hash from torrent buffer
      if (context.clientInfo.userId && this.userManager) {
        try {
          const { hash } = parseTorrentBuffer(buffer);
          if (hash) {
            this.userManager.recordOwnership(itemKey(manager.instanceId, hash), context.clientInfo.userId);
          }
        } catch (e) { /* best-effort */ }
      }

      // Broadcast unified items for instant UI feedback
      await this.broadcastItemsUpdate(context);

      context.send({ type: 'torrent-added', success: true, fileName, clientId });
    } catch (err) {
      context.log('Failed to add torrent file:', err);
      context.send({ type: 'error', message: `Failed to add torrent file: ${err.message}` });
    }
  }

  async handleGetCategories(context) {
    try {
      // Use unified category manager instead of direct aMule call
      const { categories, clientDefaultPaths, hasPathWarnings } = context.categoryManager.getAllForFrontend();
      context.send({ type: 'categories-update', data: categories, clientDefaultPaths, hasPathWarnings });
      context.log(`Categories fetched: ${categories.length} categories${hasPathWarnings ? ' (with path warnings)' : ''}`);
    } catch (err) {
      context.log('Get categories error:', err);
      context.send({
        type: 'error',
        message: 'Failed to fetch categories: ' + err.message
      });
    }
  }

  async handleCreateCategory(data, context) {
    try {
      const { title, path, pathMappings, comment, color, priority } = data;

      if (!title || title.trim() === '') {
        throw new Error('Category title is required');
      }

      const trimmedTitle = title.trim();

      // Validate category name — block path-unsafe characters
      if (/[\/\\\x00]/.test(trimmedTitle) || trimmedTitle.includes('..')) {
        throw new Error('Category name contains invalid characters');
      }

      // Convert color from aMule BGR integer to hex if needed
      const { amuleColorToHex } = require('../lib/CategoryManager');
      const hexColor = typeof color === 'number' ? amuleColorToHex(color) : (color || '#CCCCCC');

      // Normalize pathMappings - trim values and filter out empty mappings
      let normalizedMappings = null;
      if (pathMappings && typeof pathMappings === 'object') {
        const filtered = {};
        for (const [key, value] of Object.entries(pathMappings)) {
          const trimmed = value?.trim();
          if (trimmed) {
            filtered[key] = trimmed;
          }
        }
        if (Object.keys(filtered).length > 0) {
          normalizedMappings = filtered;
        }
      }

      // Create in unified category manager (also creates in aMule if connected)
      const category = await context.categoryManager.create(trimmedTitle, {
        color: hexColor,
        path: path?.trim() || null,
        pathMappings: normalizedMappings,
        comment: comment?.trim() || '',
        priority: priority || 0
      });

      // Re-validate all paths after category change
      await context.categoryManager.validateAllPaths();

      // Broadcast updated categories
      const { categories, clientDefaultPaths, hasPathWarnings } = context.categoryManager.getAllForFrontend();
      context.broadcast({ type: 'categories-update', data: categories, clientDefaultPaths, hasPathWarnings });

      context.send({
        type: 'category-created',
        success: true,
        message: `Category "${trimmedTitle}" created successfully`
      });
      context.log(`Category created: ${trimmedTitle}`);
    } catch (err) {
      context.log('Create category error:', err);
      context.send({
        type: 'error',
        message: 'Failed to create category: ' + err.message
      });
    }
  }

  async handleUpdateCategory(data, context) {
    try {
      const { title, name, path, pathMappings, comment, color, priority } = data;

      const categoryName = name || title;

      if (!categoryName || categoryName.trim() === '') {
        throw new Error('Category name/title is required');
      }

      const trimmedName = categoryName.trim();

      let category = context.categoryManager.getByName(trimmedName);

      if (!category) {
        throw new Error(`Category "${trimmedName}" not found`);
      }

      // Check if this is the Default category - restrict what can be changed
      const isDefaultCategory = category.name === 'Default';
      if (isDefaultCategory) {
        // Block rename attempts
        const newTitle = title?.trim();
        if (newTitle && newTitle !== 'Default') {
          throw new Error('The Default category cannot be renamed');
        }
        // Block priority changes (priority is managed by clients for Default)
        if (priority !== undefined && priority !== category.priority) {
          throw new Error('Priority cannot be changed for the Default category');
        }
      }

      // Convert color from aMule BGR integer to hex if needed
      const { amuleColorToHex } = require('../lib/CategoryManager');
      const hexColor = typeof color === 'number' ? amuleColorToHex(color) : color;

      // Normalize pathMappings if provided - trim values and filter out empty mappings
      let normalizedMappings = undefined;
      if (pathMappings !== undefined) {
        if (pathMappings && typeof pathMappings === 'object') {
          const filtered = {};
          for (const [key, value] of Object.entries(pathMappings)) {
            const trimmed = value?.trim();
            if (trimmed) {
              filtered[key] = trimmed;
            }
          }
          normalizedMappings = Object.keys(filtered).length > 0 ? filtered : null;
        } else {
          normalizedMappings = null;
        }
      }

      // Handle rename if title differs from current name (also updates aMule)
      const newTitle = title?.trim();
      if (newTitle && (/[\/\\\x00]/.test(newTitle) || newTitle.includes('..'))) {
        throw new Error('Category name contains invalid characters');
      }
      if (newTitle && newTitle !== category.name) {
        const renameResult = await context.categoryManager.rename(category.name, newTitle);
        if (renameResult.clientVerification) {
          const v = renameResult.clientVerification;
          context.send({
            type: 'error',
            message: `Failed to rename category in ${v.clientType} (${v.instanceId}): ${v.mismatches?.join(', ') || 'verification failed'}`
          });
          return;
        }
        category = context.categoryManager.getByName(newTitle);
      }

      // Update in unified category manager (also updates aMule if connected)
      const updateResult = await context.categoryManager.update(category.name, {
        color: hexColor !== undefined ? hexColor : undefined,
        path: path !== undefined ? (path?.trim() || null) : undefined,
        pathMappings: normalizedMappings,
        comment: comment !== undefined ? (comment?.trim() || '') : undefined,
        priority: priority !== undefined ? priority : undefined
      });

      // Check for client verification failure
      if (updateResult.clientVerification) {
        const v = updateResult.clientVerification;
        context.send({
          type: 'error',
          message: `Category saved locally but ${v.clientType} sync failed (${v.instanceId}): ${v.mismatches?.join(', ') || 'verification failed'}`
        });
      }

      // Re-validate all paths after category change
      await context.categoryManager.validateAllPaths();

      // Broadcast updated categories
      const { categories, clientDefaultPaths, hasPathWarnings } = context.categoryManager.getAllForFrontend();
      context.broadcast({ type: 'categories-update', data: categories, clientDefaultPaths, hasPathWarnings });

      context.send({
        type: 'category-updated',
        success: true,
        message: `Category "${newTitle || category.name}" updated successfully`
      });
      context.log(`Category updated: ${newTitle || category.name}`);
    } catch (err) {
      context.log('Update category error:', err);
      context.send({
        type: 'error',
        message: 'Failed to update category: ' + err.message
      });
    }
  }

  async handleDeleteCategory(data, context) {
    try {
      const { name } = data;

      if (!name) {
        throw new Error('Category name is required');
      }

      const category = context.categoryManager.getByName(name);

      if (!category) {
        throw new Error('Category not found');
      }

      const categoryName = category.name;

      // Delete from unified category manager (also deletes from aMule if connected)
      await context.categoryManager.delete(categoryName);

      // Re-validate all paths after category change
      await context.categoryManager.validateAllPaths();

      // Broadcast updated categories
      const { categories, clientDefaultPaths, hasPathWarnings } = context.categoryManager.getAllForFrontend();
      context.broadcast({ type: 'categories-update', data: categories, clientDefaultPaths, hasPathWarnings });

      context.send({
        type: 'category-deleted',
        success: true,
        message: 'Category deleted successfully'
      });
      context.log(`Category deleted: ${categoryName}`);
    } catch (err) {
      context.log('Delete category error:', err);
      context.send({
        type: 'error',
        message: 'Failed to delete category: ' + err.message
      });
    }
  }

  /**
   * Subscribe to a data channel (e.g. 'segmentData' for gapStatus/reqStatus)
   */
  handleSubscribe(data, context) {
    const channel = data.channel;
    if (channel && context.ws?.user?.subscriptions) {
      context.ws.user.subscriptions.add(channel);
      // Send segment data for existing items as a targeted delta
      if (channel === 'segmentData') {
        this._sendSegmentData(context);
      }
    }
  }

  /**
   * Send gapStatus/reqStatus for all items that have them, as a minimal delta
   */
  _sendSegmentData(context) {
    const cached = autoRefreshManager.getCachedBatchUpdate();
    if (!cached) return;
    const batchData = cached.data || cached;
    const items = batchData.items || [];
    const patches = [];
    for (const item of items) {
      if (item.gapStatus || item.reqStatus) {
        const patch = { hash: item.hash, instanceId: item.instanceId };
        if (item.gapStatus) patch.gapStatus = item.gapStatus;
        if (item.reqStatus) patch.reqStatus = item.reqStatus;
        patches.push(patch);
      }
    }
    if (patches.length > 0) {
      // No seq — this is a supplemental delta, not part of the regular sequence
      context.send({
        type: 'batch-update',
        data: { delta: { added: [], removed: [], changed: patches } }
      });
    }
  }

  /**
   * Unsubscribe from a data channel
   */
  handleUnsubscribe(data, context) {
    const channel = data.channel;
    if (channel && context.ws?.user?.subscriptions) {
      context.ws.user.subscriptions.delete(channel);
    }
  }

  /**
   * Send full snapshot to a single client (e.g. after seq gap)
   */
  handleRequestFullSnapshot(context) {
    const cached = autoRefreshManager.getCachedBatchUpdate();
    if (!cached) return;
    const batchData = cached.data || cached;
    const filtered = this._filterBatchUpdateForUser(batchData, context.clientInfo, context.ws?.user);
    context.send({ type: 'batch-update', data: filtered });
    context.log('Sent full snapshot (client requested)');
  }

  // ============================================================================
  // AUTHORIZATION HELPERS
  // ============================================================================

  /**
   * Check if context user has all the specified capabilities
   * Admins implicitly have all capabilities
   */
  _hasCapability(context, ...caps) {
    if (context.clientInfo.isAdmin) return true;
    const userCaps = context.clientInfo.capabilities;
    if (!Array.isArray(userCaps)) return false;
    return caps.every(c => userCaps.includes(c));
  }

  /**
   * Check if context user can mutate a specific download item
   * Admins and users with edit_all_downloads can mutate any item.
   * Otherwise, user must own the item.
   */
  _canMutateItem(context, key) {
    if (context.clientInfo.isAdmin) return true;
    if (context.clientInfo.capabilities?.includes('edit_all_downloads')) return true;
    if (!context.clientInfo.userId) return false;
    return this.userManager?.isOwnedBy(key, context.clientInfo.userId) ?? true;
  }

  /**
   * Filter a batch-update message for a specific user's ownership
   */
  _filterBatchUpdateForUser(batchData, clientInfo, wsUser) {
    const items = batchData.items || [];
    const stripSegments = !wsUser?.subscriptions?.has('segmentData');
    const mapItem = (i, owned) => {
      const item = { ...i, ownedByMe: owned };
      if (stripSegments) { delete item.gapStatus; delete item.reqStatus; }
      return item;
    };

    if (!clientInfo || clientInfo.isAdmin || clientInfo.capabilities?.includes('view_all_downloads')) {
      // Annotate items with ownership flag for frontend mutation gating
      if (!clientInfo?.userId || !this.userManager || clientInfo?.isAdmin) {
        return { ...batchData, items: items.map(i => mapItem(i, true)) };
      }
      const ownedKeys = this.userManager.getOwnedKeys(clientInfo.userId);
      return { ...batchData, items: items.map(i => mapItem(i, ownedKeys.has(itemKey(i.instanceId, i.hash)))) };
    }
    // Ownership-filtered — all surviving items are owned
    if (!clientInfo.userId || !this.userManager) return batchData;
    const ownedKeys = this.userManager.getOwnedKeys(clientInfo.userId);
    return {
      ...batchData,
      items: items.filter(item => ownedKeys.has(itemKey(item.instanceId, item.hash))).map(i => mapItem(i, true))
    };
  }

  // ============================================================================
  // UNIFIED ITEMS BROADCAST HELPER
  // ============================================================================

  /**
   * Fetch fresh unified items and broadcast to all clients.
   * Called after user actions (pause, resume, delete, add links, etc.)
   * to provide immediate UI feedback via the unified items array.
   */
  async broadcastItemsUpdate(context) {
    try {
      const batchData = await dataFetchService.getBatchData();
      // Strip heavy modal-only fields from broadcast
      const strippedItems = batchData.items.map(({ raw, trackersDetailed, ...rest }) => rest);
      context.broadcast({ type: 'batch-update', data: { items: strippedItems } }, {
        transform: (msg, user) => {
          const items = msg.data.items || [];
          const stripSegments = !user?.subscriptions?.has('segmentData');
          const mapItem = (i, owned) => {
            const item = { ...i, ownedByMe: owned };
            if (stripSegments) { delete item.gapStatus; delete item.reqStatus; }
            return item;
          };
          if (!user || user.isAdmin || user.capabilities?.includes('view_all_downloads')) {
            if (!user?.userId || !this.userManager || user?.isAdmin) {
              return { ...msg, data: { ...msg.data, items: items.map(i => mapItem(i, true)) } };
            }
            const ownedKeys = this.userManager.getOwnedKeys(user.userId);
            return { ...msg, data: { ...msg.data, items: items.map(i => mapItem(i, ownedKeys.has(itemKey(i.instanceId, i.hash)))) } };
          }
          if (!user.userId || !this.userManager) return msg;
          const ownedKeys = this.userManager.getOwnedKeys(user.userId);
          return {
            ...msg,
            data: {
              ...msg.data,
              items: items.filter(item => ownedKeys.has(itemKey(item.instanceId, item.hash))).map(i => mapItem(i, true))
            }
          };
        }
      });
    } catch (err) {
      context.log('Failed to broadcast items update:', err.message);
    }
  }

  // ============================================================================
  // BATCH OPERATIONS (single broadcast after all operations complete)
  // Handles both single items and multiple items uniformly
  // ============================================================================

  /**
   * Generic batch operation executor for pause/resume/stop
   * @param {Object} opts - Operation config
   * @param {Array} opts.items - Items to operate on ({ fileHash, clientType, instanceId, fileName })
   * @param {Object} opts.context - WebSocket context
   * @param {string} opts.name - Action name for logging (e.g. 'pause')
   * @param {string} opts.responseType - WebSocket response type (e.g. 'batch-pause-complete')
   * @param {Function} opts.method - Unified method: async (manager, hash) => result
   *   result === false → "rejected" error (aMule pattern).
   */
  async _executeBatchOperation({ items, context, name, responseType, method }) {
    const label = name.charAt(0).toUpperCase() + name.slice(1);
    try {
      if (!items || !Array.isArray(items) || items.length === 0) {
        throw new Error(`No items provided for batch ${name}`);
      }
      if (items.length > 1000) {
        throw new Error(`Batch ${name} exceeds maximum size of 1000 items`);
      }

      const results = [];
      for (const item of items) {
        // Ownership check: skip items user doesn't own
        const key = itemKey(item.instanceId, item.fileHash);
        if (!this._canMutateItem(context, key)) {
          logger.warn(`[WS Auth] Ownership denied: user="${context.clientInfo.username}" (id=${context.clientInfo.userId}) cannot mutate ${key} (action="${name}")`);
          results.push({ fileHash: item.fileHash, fileName: item.fileName, success: false, error: 'Permission denied', denied: true });
          continue;
        }

        let manager;
        try {
          manager = registry.get(item.instanceId);
          if (!manager) {
            const error = item.instanceId ? `Instance "${item.instanceId}" not found` : 'No instanceId provided';
            context.log(`${label} failed for ${item.fileName || item.fileHash}: ${error}`);
            results.push({ fileHash: item.fileHash, fileName: item.fileName, success: false, error: 'Client instance not found', instanceId: item.instanceId, instanceName: null });
            continue;
          }
          if (!manager.isConnected()) {
            const error = `${manager.clientType} not connected`;
            context.log(`${label} failed for ${item.fileName || item.fileHash}: ${error}`);
            results.push({ fileHash: item.fileHash, fileName: item.fileName, success: false, error, instanceId: item.instanceId, instanceName: manager?.displayName });
            continue;
          }

          const result = await method(manager, item.fileHash);
          if (result === false) {
            const error = `${manager.clientType} rejected request`;
            context.log(`${label} failed for ${item.fileName || item.fileHash}: ${error}`);
            results.push({ fileHash: item.fileHash, fileName: item.fileName, success: false, error, instanceId: item.instanceId, instanceName: manager.displayName });
          } else {
            results.push({ fileHash: item.fileHash, success: true, instanceId: item.instanceId, instanceName: manager.displayName });
          }
        } catch (err) {
          context.log(`${label} failed for ${item.fileName || item.fileHash}: ${err.message}`);
          results.push({ fileHash: item.fileHash, fileName: item.fileName, success: false, error: err.message, instanceId: item.instanceId, instanceName: manager?.displayName });
        }
      }

      await this.broadcastItemsUpdate(context);

      const successCount = results.filter(r => r.success).length;
      context.send({ type: responseType, results, message: `${successCount}/${items.length} successful` });
      context.log(`Batch ${name}: ${successCount}/${items.length} successful`);
    } catch (err) {
      context.log(`Batch ${name} error:`, err);
      context.send({ type: 'error', message: `Batch ${name} failed: ${err.message}` });
    }
  }

  async handleRenameFile(data, context) {
    try {
      const { fileHash, newName, instanceId } = data;
      if (!fileHash || !newName) {
        throw new Error('fileHash and newName are required');
      }

      // Ownership check
      const key = itemKey(instanceId, fileHash);
      if (!this._canMutateItem(context, key)) {
        context.send({ type: 'rename-complete', success: false, error: 'Permission denied' });
        return;
      }

      const manager = registry.get(instanceId);
      if (!manager || !manager.isConnected()) {
        throw new Error('Client not connected');
      }
      if (!manager.renameFile) {
        throw new Error('Rename not supported by this client');
      }

      const result = await manager.renameFile(fileHash, newName.trim());
      if (result.success === false) {
        context.send({ type: 'rename-complete', success: false, error: result.error || 'Rename failed' });
      } else {
        context.log(`Renamed ${fileHash} → "${newName}"`);
        await this.broadcastItemsUpdate(context);
        context.send({ type: 'rename-complete', success: true });
      }
    } catch (err) {
      context.log('Rename error:', err.message);
      context.send({ type: 'rename-complete', success: false, error: err.message });
    }
  }

  async handleBatchPause(data, context) {
    await this._executeBatchOperation({
      items: data.items, context, name: 'pause', responseType: 'batch-pause-complete',
      method: (mgr, hash) => mgr.pause(hash)
    });
  }

  async handleBatchResume(data, context) {
    await this._executeBatchOperation({
      items: data.items, context, name: 'resume', responseType: 'batch-resume-complete',
      method: (mgr, hash) => mgr.resume(hash)
    });
  }

  async handleBatchStop(data, context) {
    await this._executeBatchOperation({
      items: data.items, context, name: 'stop', responseType: 'batch-stop-complete',
      method: (mgr, hash) => mgr.stop(hash)
    });
  }

  /**
   * Delete a file or directory from disk
   * @param {string} filePath - Path to delete (already translated for Docker)
   * @param {Object} context - Request context for logging
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async deleteFromDisk(filePath, context) {
    try {
      const stats = await fs.stat(filePath);
      if (stats.isDirectory()) {
        await fs.rm(filePath, { recursive: true, force: true });
        context.log(`Deleted directory: ${filePath}`);
      } else {
        await fs.unlink(filePath);
        context.log(`Deleted file: ${filePath}`);
      }
      return { success: true };
    } catch (err) {
      context.log(`Failed to delete ${filePath}: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  async handleBatchDelete(data, context) {
    try {
      const { items, deleteFiles, source } = data; // items: Array of { fileHash, clientType, instanceId, fileName }

      if (!items || !Array.isArray(items) || items.length === 0) {
        throw new Error('No items provided for batch delete');
      }
      if (items.length > 1000) {
        throw new Error('Batch delete exceeds maximum size of 1000 items');
      }

      // Build compound-key lookup from cached unified items
      const cachedItems = dataFetchService.getCachedBatchData()?.items || [];
      const itemByKey = new Map(cachedItems.map(i => [itemKey(i.instanceId, i.hash), i]));

      const results = [];
      const instanceIdsToRefresh = new Set();

      for (const item of items) {
        // Ownership check: skip items user doesn't own
        const ownershipKey = itemKey(item.instanceId, item.fileHash);
        if (!this._canMutateItem(context, ownershipKey)) {
          logger.warn(`[WS Auth] Ownership denied: user="${context.clientInfo.username}" (id=${context.clientInfo.userId}) cannot mutate ${ownershipKey} (action="batchDelete")`);
          results.push({ fileHash: item.fileHash, fileName: item.fileName, success: false, error: 'Permission denied', denied: true });
          continue;
        }

        const cachedItem = itemByKey.get(itemKey(item.instanceId, item.fileHash?.toLowerCase()));
        const fileName = item.fileName || cachedItem?.name;
        const instanceId = item.instanceId || cachedItem?.instanceId;
        const manager = registry.get(instanceId);

        if (!manager) {
          const reason = instanceId ? `Instance "${instanceId}" not found` : 'No instanceId provided';
          context.log(`Delete failed for ${fileName || item.fileHash}: ${reason}`);
          results.push({ fileHash: item.fileHash, fileName, success: false, error: 'Client instance not found', instanceId, instanceName: null });
          continue;
        }

        try {
          const caps = clientMeta.get(manager.clientType).capabilities;
          const isShared = caps.sharedFiles && (source === 'shared' || (cachedItem && cachedItem.shared && !cachedItem.downloading));

          // Build options for deleteItem
          const opts = { deleteFiles: !!deleteFiles, isShared };
          if (isShared && cachedItem?.raw?.path && cachedItem?.name) {
            opts.filePath = path.join(cachedItem.raw.path, cachedItem.name);
          }

          const result = await manager.deleteItem(item.fileHash, opts);

          if (!result.success) {
            results.push({ fileHash: item.fileHash, fileName, success: false, error: result.error, instanceId, instanceName: manager.displayName });
            continue;
          }

          // Delete files from disk if manager returned paths
          let diskDeleteFailed = false;
          for (const rawPath of (result.pathsToDelete || [])) {
            const translatedPath = categoryManager.translatePath(rawPath, manager.clientType, instanceId);
            const deleteResult = await this.deleteFromDisk(translatedPath, context);
            if (!deleteResult.success) {
              results.push({ fileHash: item.fileHash, fileName, success: false, error: `Failed to delete file: ${deleteResult.error}`, instanceId, instanceName: manager.displayName });
              diskDeleteFailed = true;
              break;
            }
          }
          if (diskDeleteFailed) continue;

          // Track instances needing shared file refresh
          if (caps.refreshSharedAfterDelete && isShared) {
            instanceIdsToRefresh.add(instanceId);
          }

          results.push({ fileHash: item.fileHash, success: true, instanceId, instanceName: manager.displayName, clientType: manager.clientType });
        } catch (err) {
          context.log(`Delete failed for ${fileName || item.fileHash}: ${err.message}`);
          results.push({ fileHash: item.fileHash, fileName, success: false, error: err.message, instanceId, instanceName: manager?.displayName });
        }
      }

      // Post-delete: refresh shared files for applicable instances
      for (const instId of instanceIdsToRefresh) {
        try {
          const mgr = registry.get(instId);
          mgr?.refreshSharedFiles?.();
          context.log(`Triggered shared files refresh for ${mgr?.displayName || instId}`);
        } catch (refreshErr) {
          context.log(`Failed to refresh shared files for ${instId}:`, refreshErr.message);
        }
      }
      if (instanceIdsToRefresh.size > 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Emit fileDeleted events for successful deletions
      for (const result of results) {
        if (result.success) {
          const reqItem = items.find(i => i.fileHash === result.fileHash);
          const ci = itemByKey.get(itemKey(result.instanceId || reqItem?.instanceId, result.fileHash?.toLowerCase()));
          const dir = ci?.directory || ci?.filePath || null;
          const name = result.fileName || ci?.name || 'Unknown';
          const fullPath = dir ? `${dir.replace(/\/+$/, '')}/${name}` : null;

          const resolvedClientType = result.clientType || reqItem?.clientType || ci?.client;
          const caps = resolvedClientType ? clientMeta.get(resolvedClientType)?.capabilities : {};
          const isShared = caps?.sharedFiles && (source === 'shared' || (ci && ci.shared && !ci.downloading));

          eventScriptingManager.emit('fileDeleted', {
            hash: result.fileHash?.toLowerCase(),
            instanceId: result.instanceId || reqItem?.instanceId || null,
            filename: name,
            clientType: resolvedClientType,
            deletedFromDisk: deleteFiles === true || (caps?.cancelDeletesFiles && !isShared),
            category: ci?.category || null,
            path: fullPath,
            multiFile: ci?.multiFile || false,
            triggeredBy: context.clientInfo.username !== 'unknown' ? context.clientInfo.username : ''
          });
        }
      }

      // Broadcast unified items for instant UI feedback
      await this.broadcastItemsUpdate(context);

      const successCount = results.filter(r => r.success).length;
      context.send({
        type: 'batch-delete-complete',
        results,
        message: `Deleted ${successCount}/${items.length} files`
      });
      context.log(`Batch delete: ${successCount}/${items.length} successful`);
    } catch (err) {
      context.log('Batch delete error:', err);
      context.send({ type: 'error', message: 'Batch delete failed: ' + err.message });
    }
  }

  async handleBatchSetFileCategory(data, context) {
    try {
      const { items: reqItems, categoryName, moveFiles } = data;

      if (!reqItems || !Array.isArray(reqItems) || reqItems.length === 0) {
        throw new Error('No items provided for batch category change');
      }
      if (reqItems.length > 1000) {
        throw new Error('Batch category change exceeds maximum size of 1000 items');
      }

      // Support both legacy categoryId and new categoryName
      let targetCategory = null;

      if (categoryName) {
        // Validate category name
        if (/[\/\\\x00]/.test(categoryName) || categoryName.includes('..')) {
          throw new Error('Category name contains invalid characters');
        }
        targetCategory = context.categoryManager.getByName(categoryName);
        // Auto-create category if it doesn't exist (for "create new category" option in modal)
        if (!targetCategory) {
          context.log(`Creating new category "${categoryName}" on demand`);
          targetCategory = await context.categoryManager.create(categoryName);
          // Re-validate all paths after category change
          await context.categoryManager.validateAllPaths();
          // Broadcast updated categories to all clients
          const { categories: updatedCategories, clientDefaultPaths, hasPathWarnings } = context.categoryManager.getAllForFrontend();
          context.broadcast({ type: 'categories-update', data: updatedCategories, clientDefaultPaths, hasPathWarnings });
        }
      } else {
        throw new Error('Category name is required');
      }

      if (!targetCategory) {
        throw new Error('Target category not found');
      }

      // Build compound-key lookup from cached unified items
      const cachedItems = dataFetchService.getCachedBatchData()?.items || [];
      const itemByKey = new Map(cachedItems.map(i => [itemKey(i.instanceId, i.hash), i]));

      const results = [];
      for (const reqItem of reqItems) {
        const fileHash = reqItem.fileHash;

        // Ownership check: skip items user doesn't own
        const ownershipKey = itemKey(reqItem.instanceId, fileHash);
        if (!this._canMutateItem(context, ownershipKey)) {
          logger.warn(`[WS Auth] Ownership denied: user="${context.clientInfo.username}" (id=${context.clientInfo.userId}) cannot mutate ${ownershipKey} (action="batchSetFileCategory")`);
          results.push({ fileHash, fileName: reqItem.fileName, success: false, error: 'Permission denied', denied: true });
          continue;
        }

        const item = itemByKey.get(itemKey(reqItem.instanceId, fileHash?.toLowerCase()));
        const fileName = item?.name;
        const instanceId = reqItem.instanceId || item?.instanceId;
        const manager = registry.get(instanceId);

        if (!manager) {
          const reason = instanceId ? `Instance "${instanceId}" not found` : 'No instanceId provided';
          context.log(`Set category failed for ${fileName || fileHash}: ${reason}`);
          results.push({ fileHash, fileName, success: false, error: 'Client instance not found', instanceId, instanceName: null });
          continue;
        }

        try {
          const caps = clientMeta.get(manager.clientType).capabilities;
          const isShared = caps.sharedFiles && item?.shared && !item?.downloading;

          // Set category/label (skip for shared files — they only need a move, no API call)
          if (!isShared) {
            if (!manager.isConnected()) {
              results.push({ fileHash, fileName, success: false, error: `${manager.clientType} not connected`, instanceId, instanceName: manager.displayName });
              continue;
            }

            const result = await manager.setCategoryOrLabel(fileHash, {
              categoryName: targetCategory.name,
              priority: targetCategory.priority
            });

            if (!result.success) {
              context.log(`Category change failed for ${fileName || fileHash}: ${result.error}`);
              results.push({ fileHash, fileName, success: false, error: result.error, instanceId, instanceName: manager.displayName });
              continue;
            }
          }

          results.push({ fileHash, success: true, instanceId, instanceName: manager.displayName });

          // Queue move if requested (or always for shared files — they need explicit moving)
          if (moveFiles || isShared) {
            const { localPath: destPathLocal, remotePath: destPathRemote } = resolveCategoryDestPaths(targetCategory, manager.clientType, item?.instanceId);
            const sourcePath = item?.directory || item?.filePath;

            if (destPathLocal && sourcePath && destPathRemote !== sourcePath) {
              try {
                await moveOperationManager.queueMove({
                  hash: fileHash,
                  instanceId: item?.instanceId,
                  name: item?.name,
                  clientType: manager.clientType,
                  sourcePathRemote: sourcePath,
                  destPathLocal,
                  destPathRemote,
                  totalSize: item?.complete ? item.size : (item?.sizeDownloaded || item?.size),
                  isMultiFile: clientMeta.hasCapability(manager.clientType, 'multiFile') && (item?.multiFile || false),
                  categoryName: targetCategory.name
                });
                context.log(`Queued move for ${fileName || fileHash} -> ${destPathRemote}`);
              } catch (moveErr) {
                context.log(`Failed to queue move for ${fileName || fileHash}: ${moveErr.message}`);
                // Don't fail the category change if move queueing fails
              }
            }
          }
        } catch (err) {
          context.log(`Category change failed for ${fileName || fileHash}: ${err.message}`);
          results.push({ fileHash, fileName, success: false, error: err.message, instanceId, instanceName: manager?.displayName });
        }
      }

      // Emit categoryChanged events for successful operations
      for (const result of results) {
        if (result.success) {
          const item = itemByKey.get(itemKey(result.instanceId, result.fileHash?.toLowerCase()));
          const oldCategory = item?.category || 'Default';
          // Only emit if category actually changed
          if (oldCategory !== targetCategory.name) {
            // Build full path from cached item data
            const dir = item?.directory || item?.filePath || null;
            const itemName = item?.name || 'Unknown';
            const fullPath = dir ? `${dir.replace(/\/+$/, '')}/${itemName}` : null;

            eventScriptingManager.emit('categoryChanged', {
              hash: result.fileHash?.toLowerCase(),
              instanceId: item?.instanceId || null,
              filename: itemName,
              clientType: item?.client || 'unknown',
              oldCategory,
              newCategory: targetCategory.name,
              path: fullPath,
              multiFile: item?.multiFile || false,
              triggeredBy: context.clientInfo.username !== 'unknown' ? context.clientInfo.username : ''
            });
          }
        }
      }

      // Broadcast unified items for instant UI feedback
      await this.broadcastItemsUpdate(context);

      const successCount = results.filter(r => r.success).length;
      const displayName = targetCategory?.name || categoryName;
      context.send({
        type: 'batch-category-changed',
        results,
        message: `Changed category for ${successCount}/${reqItems.length} files`
      });
      context.log(`Batch category change: ${successCount}/${reqItems.length} -> "${displayName}"${moveFiles ? ' (with move)' : ''}`);
    } catch (err) {
      context.log('Batch set file category error:', err);
      context.send({ type: 'error', message: 'Batch category change failed: ' + err.message });
    }
  }

  /**
   * Check if we have permission to delete files from disk
   * Used by the delete modal to show warnings before deletion
   * @param {Object} data - { fileHashes: string[], source: 'downloads' | 'shared' }
   */
  async handleCheckDeletePermissions(data, context) {
    try {
      const { items: reqItems, source } = data;

      if (!reqItems || !Array.isArray(reqItems) || reqItems.length === 0) {
        context.send({ type: 'delete-permissions', results: [] });
        return;
      }

      // Build compound-key lookup from cached unified items
      const cachedItems = dataFetchService.getCachedBatchData()?.items || [];
      const itemByKey = new Map(cachedItems.map(i => [itemKey(i.instanceId, i.hash), i]));

      const results = [];

      for (const reqItem of reqItems) {
        const fileHash = reqItem.fileHash;
        const item = itemByKey.get(itemKey(reqItem.instanceId, fileHash?.toLowerCase()));

        if (!item) {
          results.push({
            fileHash,
            canDelete: false,
            reason: 'not_found',
            message: 'Item not found in cache'
          });
          continue;
        }

        const clientType = item.client;
        const caps = clientMeta.get(clientType)?.capabilities || {};
        const isShared = caps.sharedFiles && item.shared && !item.downloading;

        // Client handles deletion internally (no filesystem permission needed)
        // cancelDeletesFiles: client auto-deletes temp files on cancel (e.g., aMule active downloads)
        // apiDeletesFiles: client API handles file deletion (e.g., qBittorrent)
        // removeSharedMustDeleteFiles: shared files need explicit disk deletion (exempt from cancelDeletesFiles shortcut)
        if ((caps.cancelDeletesFiles && !(isShared && caps.removeSharedMustDeleteFiles)) || caps.apiDeletesFiles) {
          results.push({
            fileHash,
            clientType,
            canDelete: true,
            reason: 'managed',
            message: 'Client manages file deletion'
          });
          continue;
        }

        // Resolve file path using shared helper
        const pathInfo = resolveItemPath(item);

        if (!pathInfo) {
          context.log(`⚠️ No file path available for ${item.name || fileHash}`);
          results.push({
            fileHash,
            clientType,
            canDelete: false,
            reason: 'no_path',
            message: 'File path not available'
          });
          continue;
        }

        // Check if file exists and is writable using shared helper
        const checkResult = await checkPathPermissions(pathInfo.localPath, { requireRead: false, requireWrite: true });

        if (checkResult.exists && checkResult.writable) {
          results.push({
            fileHash,
            clientType,
            canDelete: true,
            reason: 'ok',
            path: pathInfo.localPath
          });
        } else {
          const reason = checkResult.errorCode === 'not_found' ? 'not_visible' :
                        checkResult.errorCode === 'not_writable' ? 'no_permission' : 'error';
          const message = checkResult.errorCode === 'not_found'
            ? 'File not visible (volume may not be mounted)'
            : checkResult.error || 'Unknown error';

          context.log(`⚠️ Delete permission check failed (${reason}, ${clientType}): ${pathInfo.localPath}`);
          results.push({
            fileHash,
            clientType,
            canDelete: false,
            reason,
            message,
            path: pathInfo.localPath
          });
        }
      }

      // Include isDocker flag for better error messages on frontend
      const isDocker = require('./config').isDocker;
      context.send({ type: 'delete-permissions', results, isDocker });
    } catch (err) {
      context.log('Check delete permissions error:', err);
      context.send({ type: 'delete-permissions', results: [], error: err.message });
    }
  }

  /**
   * Core move permission checking logic shared by both category-move and standalone move.
   * Resolves source/dest paths, checks filesystem permissions, returns structured results.
   *
   * @param {Array} reqItems - Items to check [{ fileHash, instanceId }]
   * @param {Function} resolveDestForItem - (item, cacheKey) => { localPath, remotePath, clientType } | null
   * @param {Object} context - WS context for logging
   * @returns {Object} { results, canMoveAny, primaryDestPath, firstDestError }
   */
  async _checkMovePermissionsCore(reqItems, resolveDestForItem, context) {
    const cachedItems = dataFetchService.getCachedBatchData()?.items || [];
    const itemByKey = new Map(cachedItems.map(i => [itemKey(i.instanceId, i.hash), i]));

    const results = [];
    const sourcePathsByClient = new Map();
    const destPathsByClient = new Map();

    // First pass: collect sources and destinations
    for (const reqItem of reqItems) {
      const fileHash = reqItem.fileHash;
      const item = itemByKey.get(itemKey(reqItem.instanceId, fileHash?.toLowerCase()));

      if (!item) {
        results.push({ fileHash, canMove: false, reason: 'not_found', message: 'Item not found in cache' });
        continue;
      }

      const clientType = item.client || 'amule';
      const hasNativeMove = clientMeta.hasCapability(clientType, 'nativeMove');
      const cacheKey = item.instanceId || clientType;

      // Resolve destination for this item
      if (!destPathsByClient.has(cacheKey)) {
        const dest = resolveDestForItem(item, cacheKey);
        if (dest) {
          destPathsByClient.set(cacheKey, dest);
        }
      }
      const destInfo = destPathsByClient.get(cacheKey);
      const localDestPath = destInfo?.localPath;
      const remoteDestPath = destInfo?.remotePath;

      // Check destination is configured
      const destPath = hasNativeMove ? remoteDestPath : localDestPath;
      if (!destPath) {
        results.push({ fileHash, canMove: false, reason: 'no_dest_path', message: 'No destination path configured' });
        continue;
      }

      // Resolve source path
      const pathInfo = resolveItemPath(item);
      if (!pathInfo) {
        results.push({ fileHash, canMove: false, reason: 'no_path', message: 'Source path not available', clientType });
        continue;
      }

      // Already at destination?
      const compareDestPath = remoteDestPath || localDestPath;
      if (pathInfo.baseDir === compareDestPath) {
        results.push({ fileHash, canMove: true, reason: 'same_path', message: 'Already at destination path', shared: item.shared, clientType });
        continue;
      }

      // Collect source for permission check (skip for nativeMove)
      if (!hasNativeMove) {
        if (!sourcePathsByClient.has(clientType)) sourcePathsByClient.set(clientType, new Map());
        sourcePathsByClient.get(clientType).set(pathInfo.localPath, pathInfo.remotePath);
      }

      results.push({
        fileHash, name: item.name, clientType, instanceId: item.instanceId,
        sourcePath: pathInfo.remotePath, translatedSourcePath: pathInfo.localPath,
        canMove: null, shared: item.shared, isMultiFile: pathInfo.isMultiFile
      });
    }

    // Check destination accessibility
    const destErrors = new Map();
    const destAccessible = new Map();
    let primaryDestPath = null;

    for (const [cacheKey, { localPath, remotePath, clientType }] of destPathsByClient) {
      if (clientMeta.hasCapability(clientType, 'nativeMove')) {
        destAccessible.set(cacheKey, true);
        if (!primaryDestPath) primaryDestPath = remotePath || localPath;
        continue;
      }
      if (!localPath) {
        destErrors.set(cacheKey, 'No destination path configured');
        destAccessible.set(cacheKey, false);
        continue;
      }
      if (!primaryDestPath) primaryDestPath = remotePath || localPath;

      const destCheck = await checkPathPermissions(localPath, { requireRead: true, requireWrite: true, requireDirectory: true });
      const displayPath = remotePath || localPath;
      if (destCheck.exists && destCheck.writable) {
        destAccessible.set(cacheKey, true);
      } else {
        destAccessible.set(cacheKey, false);
        const errorMsg = destCheck.errorCode === 'not_found'
          ? `Destination path not found: ${displayPath}`
          : destCheck.errorCode === 'not_writable'
            ? `No write permission for destination: ${displayPath}`
            : `Cannot access destination: ${destCheck.error}`;
        destErrors.set(cacheKey, errorMsg);
        context.log(`⚠️ Move permission check failed (dest, ${cacheKey}): ${errorMsg}`);
      }
    }

    // Check source accessibility
    const sourceErrors = new Map();
    for (const [clientType, pathMap] of sourcePathsByClient) {
      if (clientMeta.hasCapability(clientType, 'nativeMove')) continue;
      for (const [localPath, remotePath] of pathMap) {
        const srcCheck = await checkPathPermissions(localPath, { requireRead: true, requireWrite: true });
        if (!srcCheck.exists || !srcCheck.readable || !srcCheck.writable) {
          const displayPath = remotePath || localPath;
          const errorMsg = srcCheck.errorCode === 'not_found'
            ? `Source path not found: ${displayPath} (volume may not be mounted)`
            : `No permission to access source path: ${displayPath}`;
          sourceErrors.set(localPath, errorMsg);
          context.log(`⚠️ Move permission check failed (source, ${clientType}): ${errorMsg}`);
        }
      }
    }

    // Update results with permission outcomes
    let canMoveAny = false;
    for (const result of results) {
      if (result.canMove !== null) { if (result.canMove && result.reason !== 'same_path') canMoveAny = true; continue; }
      const lookupKey = result.instanceId || result.clientType;
      if (!destAccessible.get(lookupKey)) {
        result.canMove = false;
        result.reason = 'dest_error';
        result.message = destErrors.get(lookupKey) || 'Destination not accessible';
      } else if (result.translatedSourcePath && sourceErrors.has(result.translatedSourcePath)) {
        result.canMove = false;
        result.reason = 'source_error';
        result.message = sourceErrors.get(result.translatedSourcePath);
      } else {
        result.canMove = true;
        result.reason = 'ok';
        canMoveAny = true;
      }
    }

    if (!canMoveAny) canMoveAny = results.some(r => r.canMove === true && r.reason !== 'same_path');
    const anyDestAccessible = Array.from(destAccessible.values()).some(v => v);
    const firstDestError = destErrors.size > 0 ? destErrors.values().next().value : null;

    return { results, canMoveAny: canMoveAny || anyDestAccessible, primaryDestPath, firstDestError };
  }

  /**
   * Check move permissions for category change (resolves dest from category).
   */
  async handleCheckMovePermissions(data, context) {
    try {
      const { items: reqItems, categoryName } = data;

      if (!reqItems || !Array.isArray(reqItems) || reqItems.length === 0) {
        context.send({ type: 'move-permissions', results: [], canMove: false });
        return;
      }

      const targetCategory = context.categoryManager?.getByName(categoryName);
      if (!targetCategory) {
        context.send({ type: 'move-permissions', results: [], canMove: false, error: `Category not found: ${categoryName}` });
        return;
      }

      // Resolve destination from category (per instance)
      const resolveDestForItem = (item, cacheKey) => {
        const clientType = item.client || 'amule';
        const hasNativeMove = clientMeta.hasCapability(clientType, 'nativeMove');
        if (hasNativeMove) {
          const remotePath = targetCategory?.path || null;
          return { localPath: remotePath, remotePath, clientType };
        }
        return { ...resolveCategoryDestPaths(targetCategory, clientType, item.instanceId), clientType };
      };

      const { results, canMoveAny, primaryDestPath, firstDestError } = await this._checkMovePermissionsCore(reqItems, resolveDestForItem, context);

      context.send({
        type: 'move-permissions',
        results,
        canMove: canMoveAny,
        destPath: primaryDestPath,
        destError: firstDestError,
        isDocker: require('./config').isDocker
      });
    } catch (err) {
      context.log('Check move permissions error:', err);
      context.send({ type: 'move-permissions', results: [], canMove: false, error: err.message });
    }
  }

  /**
   * Check move permissions for standalone "Move to..." (raw dest path).
   */
  async handleCheckMoveToPermissions(data, context) {
    try {
      const { items: reqItems, destPath } = data;

      if (!reqItems || !Array.isArray(reqItems) || reqItems.length === 0 || !destPath) {
        context.send({ type: 'move-to-permissions', results: [], canMove: false });
        return;
      }
      if (destPath.includes('..') || destPath.includes('\0')) {
        context.send({ type: 'move-to-permissions', results: [], canMove: false, error: 'Invalid destination path' });
        return;
      }

      // Resolve destination from raw path (translate per instance)
      const resolveDestForItem = (item, cacheKey) => {
        const clientType = item.client || 'amule';
        const hasNativeMove = clientMeta.hasCapability(clientType, 'nativeMove');
        if (hasNativeMove) {
          return { localPath: destPath, remotePath: destPath, clientType };
        }
        const localPath = categoryManager.translatePath(destPath, clientType, item.instanceId);
        return { localPath, remotePath: destPath, clientType };
      };

      const { results, canMoveAny } = await this._checkMovePermissionsCore(reqItems, resolveDestForItem, context);

      context.send({
        type: 'move-to-permissions',
        results,
        canMove: canMoveAny,
        destPath,
        isDocker: require('./config').isDocker
      });
    } catch (err) {
      context.log('Check move-to permissions error:', err);
      context.send({ type: 'move-to-permissions', results: [], canMove: false, error: err.message });
    }
  }

  /**
   * Move files to a destination path without changing category.
   * Reuses MoveOperationManager for execution.
   */
  async handleBatchMoveFiles(data, context) {
    try {
      const { items: reqItems, destPath } = data;

      if (!reqItems || !Array.isArray(reqItems) || reqItems.length === 0) {
        throw new Error('No items provided');
      }
      if (!destPath || destPath.includes('..') || destPath.includes('\0')) {
        throw new Error('Invalid destination path');
      }
      if (reqItems.length > 1000) {
        throw new Error('Batch move exceeds maximum size of 1000 items');
      }

      const cachedItems = dataFetchService.getCachedBatchData()?.items || [];
      const itemByKey = new Map(cachedItems.map(i => [itemKey(i.instanceId, i.hash), i]));

      const results = [];

      for (const reqItem of reqItems) {
        const fileHash = reqItem.fileHash;
        const ownershipKey = itemKey(reqItem.instanceId, fileHash);

        if (!this._canMutateItem(context, ownershipKey)) {
          results.push({ fileHash, fileName: reqItem.fileName, success: false, error: 'Permission denied' });
          continue;
        }

        const item = itemByKey.get(itemKey(reqItem.instanceId, fileHash?.toLowerCase()));
        if (!item) {
          results.push({ fileHash, fileName: reqItem.fileName, success: false, error: 'Item not found' });
          continue;
        }

        const manager = registry.get(item.instanceId);
        if (!manager || !manager.isConnected()) {
          results.push({ fileHash, fileName: item.name, success: false, error: 'Client not connected' });
          continue;
        }

        try {
          const sourcePath = item.directory || item.filePath;
          if (!sourcePath || sourcePath === destPath) {
            results.push({ fileHash, fileName: item.name, success: true, skipped: true });
            continue;
          }

          const destPathLocal = categoryManager.translatePath(destPath, manager.clientType, item.instanceId);

          await moveOperationManager.queueMove({
            hash: fileHash,
            instanceId: item.instanceId,
            name: item.name,
            clientType: manager.clientType,
            sourcePathRemote: sourcePath,
            destPathLocal,
            destPathRemote: destPath,
            totalSize: item.complete ? item.size : (item.sizeDownloaded || item.size),
            isMultiFile: clientMeta.hasCapability(manager.clientType, 'multiFile') && (item.multiFile || false),
            categoryName: null
          });

          results.push({ fileHash, fileName: item.name, success: true, instanceId: item.instanceId });
          context.log(`Queued move for ${item.name} -> ${destPath}`);
        } catch (err) {
          context.log(`Move failed for ${item.name}: ${err.message}`);
          results.push({ fileHash, fileName: item.name, success: false, error: err.message });
        }
      }

      await this.broadcastItemsUpdate(context);

      const successCount = results.filter(r => r.success).length;
      context.send({
        type: 'batch-move-complete',
        results,
        message: `Moving ${successCount}/${reqItems.length} files to ${destPath}`
      });
      context.log(`Batch move: ${successCount}/${reqItems.length} queued to ${destPath}`);
    } catch (err) {
      context.log('Batch move error:', err);
      context.send({ type: 'error', message: 'Batch move failed: ' + err.message });
    }
  }

}

module.exports = new WebSocketHandlers();