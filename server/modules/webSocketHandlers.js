/**
 * WebSocket Handlers Module
 * Handles all WebSocket message handlers and real-time updates
 */

const fs = require('fs').promises;
const path = require('path');
const BaseModule = require('../lib/BaseModule');
const config = require('./config');
const logger = require('../lib/logger');
const { getClientIP } = require('../lib/authUtils');
const dataFetchService = require('../lib/DataFetchService');
const autoRefreshManager = require('./autoRefreshManager');
const moveOperationManager = require('../lib/MoveOperationManager');
const { checkPathPermissions, resolveItemPath, resolveCategoryDestPaths } = require('../lib/pathUtils');

// Singleton managers - imported directly instead of injected
const amuleManager = require('./amuleManager');
const rtorrentManager = require('./rtorrentManager');
const geoIPManager = require('./geoIPManager');
const authManager = require('./authManager');
const categoryManager = require('../lib/CategoryManager');
const prowlarrAPI = require('./prowlarrAPI');
const eventScriptingManager = require('../lib/EventScriptingManager');

class WebSocketHandlers extends BaseModule {
  constructor() {
    super();
    // Track when the last aMule search was performed
    this.lastAmuleSearchTimestamp = 0;
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
        // URL decode the cookie value
        acc[key] = decodeURIComponent(value);
      }
      return acc;
    }, {});
  }

  /**
   * Parse signed session cookie to extract session ID
   * Express-session uses format: s:<sessionId>.<signature>
   * @param {string} signedCookie - Signed cookie value
   * @returns {string|null} Session ID or null if invalid
   */
  parseSignedCookie(signedCookie) {
    if (!signedCookie) return null;

    // Check if it starts with 's:' (signed cookie prefix)
    if (!signedCookie.startsWith('s:')) {
      return null;
    }

    // Remove 's:' prefix
    const withoutPrefix = signedCookie.slice(2);

    // Extract session ID (everything before the first '.')
    const dotIndex = withoutPrefix.indexOf('.');
    if (dotIndex === -1) {
      return null;
    }

    return withoutPrefix.slice(0, dotIndex);
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
      log: this.createClientLog(ws, username, nickname, clientIp),
      send: (data) => ws.send(JSON.stringify(data)),
      clientInfo: { username, nickname, clientIp },
      broadcast: this.broadcast,
      amuleManager,
      rtorrentManager,
      categoryManager
    };
  }

  // Handle WebSocket connection
  handleConnection(ws, req) {
    // Get username from configurable header (for proxy auth like Authelia)
    // Falls back to 'remote-user' if not configured, then 'unknown'
    const historyConfig = config.getConfig()?.history || {};
    const usernameHeader = (historyConfig.usernameHeader || 'remote-user').toLowerCase();
    const username = req.headers[usernameHeader] || 'unknown';
    const nickname = req.headers['remote-name'] || 'unknown';
    const clientIp = getClientIP(req);

    // Check authentication if enabled
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
      const sessionId = this.parseSignedCookie(signedSessionCookie);

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
    }

    const geoData = geoIPManager.getGeoIPData(clientIp);
    const locationInfo = geoIPManager.formatLocationInfo(geoData);

    const context = this.createContext(ws, username, nickname, clientIp);

    context.log(`New WebSocket connection from ${clientIp}${locationInfo}`);
    context.send({ type: 'connected', message: 'Connected to aMule Controller' });
    context.send({ type: 'search-lock', locked: amuleManager.isSearchInProgress() });

    // Send cached batch update to newly connected client (if available)
    const cachedBatchUpdate = autoRefreshManager.getCachedBatchUpdate();
    if (cachedBatchUpdate) {
      context.send({ type: 'batch-update', data: cachedBatchUpdate });
      context.log('Sent cached batch update to new client');
    }

    ws.on('message', async message => {
      await this.handleMessage(message, context);
    });

    ws.on('close', () => context.log(`WebSocket connection closed from ${clientIp}`));
    ws.on('error', (err) => context.log('WebSocket error:', err));
  }

  // Handle WebSocket messages
  async handleMessage(message, context) {
    try {
      const data = JSON.parse(message);
      context.log(`Received action: ${data.action}`, data);

      if (amuleManager.isEnabled() && !amuleManager.isConnected()) {
        await amuleManager.initClient();
      }

      switch (data.action) {
        case 'search': await this.handleSearch(data, context); break;
        case 'getPreviousSearchResults': await this.handleGetPreviousSearchResults(context); break;
        case 'refreshSharedFiles': await this.handleRefreshSharedFiles(context); break;
        case 'getServersList': await this.handleGetServersList(context); break;
        case 'serverDoAction': await this.handleServerDoAction(data, context); break;
        case 'getStatsTree': await this.handleGetStatsTree(context); break;
        case 'getServerInfo': await this.handleGetServerInfo(context); break;
        case 'getLog': await this.handleGetLog(context); break;
        case 'getAppLog': await this.handleGetAppLog(context); break;
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
        case 'checkDeletePermissions': await this.handleCheckDeletePermissions(data, context); break;
        case 'checkMovePermissions': await this.handleCheckMovePermissions(data, context); break;
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
    if (!context.amuleManager.acquireSearchLock()) {
      context.send({ type: 'error', message: 'Another search is running' });
      return;
    }

    context.broadcast({ type: 'search-lock', locked: true });

    try {
      const result = await context.amuleManager.getClient().searchAndWaitResults(data.query, data.type, data.extension);
      // Track timestamp for comparison with Prowlarr results
      this.lastAmuleSearchTimestamp = Date.now();
      context.broadcast({ type: 'search-results', data: result.results || [] });
      context.log(`Search completed: ${result.resultsLength || 0} results found`);
    } catch (err) {
      context.log('Search error:', err);
      context.send({ type: 'error', message: 'Search failed: ' + err.message });
    } finally {
      context.amuleManager.releaseSearchLock();
      context.broadcast({ type: 'search-lock', locked: false });
    }
  }

  async handleGetPreviousSearchResults(context) {
    try {
      // Get Prowlarr cached results (already transformed)
      const prowlarrCache = prowlarrAPI.getCachedResults();

      // Get aMule cached results
      let amuleResults = [];
      try {
        const result = await context.amuleManager.getClient().getSearchResults();
        amuleResults = result.results || [];
      } catch (err) {
        // aMule might not be connected, that's ok
        context.log('aMule search results not available:', err.message);
      }

      // Compare timestamps and return the most recent
      if (prowlarrCache.timestamp > this.lastAmuleSearchTimestamp && prowlarrCache.results.length > 0) {
        context.send({ type: 'previous-search-results', data: prowlarrCache.results });
        context.log(`Previous search results: ${prowlarrCache.results.length} Prowlarr results (more recent)`);
      } else {
        context.send({ type: 'previous-search-results', data: amuleResults });
        context.log(`Previous search results: ${amuleResults.length} aMule results`);
      }
    } catch (err) {
      context.log('Get previous search results error:', err);
      context.send({ type: 'previous-search-results', data: [] });
    }
  }

  async handleRefreshSharedFiles(context) {
    try {
      await context.amuleManager.getClient().refreshSharedFiles();
      context.send({ type: 'shared-files-refreshed', message: 'Shared files reloaded successfully' });
      context.log('Shared files refresh command sent to aMule');
      // Broadcast unified items after refresh
      setTimeout(async () => {
        await this.broadcastItemsUpdate(context);
      }, 100);
    } catch (err) {
      context.log('Refresh shared files error:', err);
      context.send({ type: 'error', message: 'Failed to refresh shared files: ' + err.message });
    }
  }

  async handleGetServersList(context) {
    try {
      const servers = await context.amuleManager.getClient().getServerList();
      context.send({ type: 'servers-update', data: servers });
      context.log('Servers list fetched successfully');
    } catch (err) {
      context.log('Get servers list error:', err);
      context.send({ type: 'error', message: 'Failed to fetch servers list: ' + err.message });
    }
  }

  async handleServerDoAction(data, context) {
    try {
      const { ip, port, serverAction } = data;
      if (!ip || !port || !serverAction) {
        throw new Error('Missing required parameters: ip, port, or serverAction');
      }

      let success;
      
      switch (serverAction) {
        case 'connect':
          success = await context.amuleManager.getClient().connectServer(ip, port);
          break;
        case 'disconnect':
          success = await context.amuleManager.getClient().disconnectServer(ip, port);
          break;
        case 'remove':
          success = await context.amuleManager.getClient().removeServer(ip, port);
          break;
        default:
          throw new Error(`Unknown action: ${serverAction}`);
      }

      context.send({ type: 'server-action', data: success });
      context.log(`Action ${serverAction} on server ${ip}:${port} ${success ? 'completed successfully' : 'failed'}`);
    } catch (err) {
      context.log('Server action error:', err);
      context.send({ type: 'error', message: `Failed to perform action on server: ${err.message}` });
    }
  }

  async handleGetStatsTree(context) {
    try {
      const client = context.amuleManager.getClient();
      if (!client) {
        context.send({ type: 'error', message: 'aMule client not connected. Please complete setup first.' });
        return;
      }
      const statsTree = await client.getStatsTree();
      context.send({ type: 'stats-tree-update', data: statsTree });
      context.log('Stats tree fetched successfully');
    } catch (err) {
      context.log('Get stats tree error:', err);
      context.send({ type: 'error', message: 'Failed to fetch stats tree: ' + err.message });
    }
  }

  async handleGetServerInfo(context) {
    try {
      const serverInfo = await context.amuleManager.getClient().getServerInfo();
      context.send({ type: 'server-info-update', data: serverInfo });
      context.log('Server info fetched successfully');
    } catch (err) {
      context.log('Get server info error:', err);
      context.send({ type: 'error', message: 'Failed to fetch server info: ' + err.message });
    }
  }

  async handleGetLog(context) {
    try {
      const log = await context.amuleManager.getClient().getLog();
      context.send({ type: 'log-update', data: log });
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

  async handleBatchDownloadSearchResults(data, context) {
    try {
      const { fileHashes, categoryId: rawCategoryId, categoryName } = data;

      // Support both legacy categoryId and new categoryName
      let categoryId = 0;
      if (categoryName) {
        // Ensure category exists in aMule (creates if needed)
        // This handles rTorrent-only categories that don't have an amuleId yet
        categoryId = await context.categoryManager?.ensureAmuleCategory(categoryName) ?? 0;
        context.log(`Category lookup: name="${categoryName}" → amuleId=${categoryId}`);
      } else if (rawCategoryId !== undefined && rawCategoryId !== null) {
        categoryId = rawCategoryId;
        context.log(`Using legacy categoryId: ${categoryId}`);
      }

      if (!fileHashes || !Array.isArray(fileHashes) || fileHashes.length === 0) {
        throw new Error('No file hashes provided for batch download');
      }

      const client = context.amuleManager.getClient();
      const username = context.clientInfo.username !== 'unknown' ? context.clientInfo.username : null;

      // Set up file info callback once for all downloads
      client.setFileInfoCallback(async (hash) => {
        try {
          const searchResults = await client.getSearchResults();
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
      });

      const results = [];
      for (const fileHash of fileHashes) {
        try {
          const success = await client.downloadSearchResult(fileHash, categoryId, username);
          results.push({ fileHash, success });
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
      const categoryId = data.categoryId || 0;
      const username = context.clientInfo.username !== 'unknown' ? context.clientInfo.username : null;

      const cleaned = links
        .map(s => String(s).trim())
        .filter(Boolean);

      if (cleaned.length === 0) {
        context.send({ type: 'error', message: 'No ED2K links provided' });
        return;
      }

      const results = [];
      for (const link of cleaned) {
        context.log(`Adding ED2K link: ${link} (category: ${categoryId})`);
        // Process links sequentially using the existing queue to maintain order and avoid saturating aMule
        const success = await context.amuleManager.getClient().addEd2kLink(link, categoryId, username);
        results.push({ link, success });
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
      if (!context.rtorrentManager || !context.rtorrentManager.isConnected()) {
        context.send({ type: 'error', message: 'rtorrent is not connected' });
        return;
      }

      const { links, label } = data;

      if (!links || !Array.isArray(links) || links.length === 0) {
        context.send({ type: 'error', message: 'No magnet links provided' });
        return;
      }

      // Look up category path and priority from CategoryManager
      const category = label ? context.categoryManager.getByName(label) : null;
      const directory = category?.path || null;

      // Map category priority to rtorrent priority
      const { mapPriorityToRtorrent } = require('../lib/CategoryManager');
      const rtorrentPriority = category ? mapPriorityToRtorrent(category.priority) : null;

      const username = context.clientInfo.username !== 'unknown' ? context.clientInfo.username : null;
      const results = [];
      for (const magnetUri of links) {
        try {
          context.log(`Adding magnet link: ${magnetUri.substring(0, 60)}... (label: ${label || 'none'}${directory ? `, path: ${directory}` : ''}${rtorrentPriority !== null ? `, priority: ${rtorrentPriority}` : ''})`);
          await context.rtorrentManager.addMagnet(magnetUri, { label: label || '', directory, priority: rtorrentPriority, start: true, username });
          results.push({ link: magnetUri, success: true });
        } catch (err) {
          context.log(`Failed to add magnet: ${err.message}`);
          results.push({ link: magnetUri, success: false, error: err.message });
        }
      }

      // Broadcast unified items for instant UI feedback
      await this.broadcastItemsUpdate(context);

      context.send({ type: 'magnet-added', results });
    } catch (err) {
      context.log('Failed to add magnet links:', err);
      context.send({ type: 'error', message: `Failed to add magnet links: ${err.message}` });
    }
  }

  async handleAddTorrentFile(data, context) {
    try {
      if (!context.rtorrentManager || !context.rtorrentManager.isConnected()) {
        context.send({ type: 'error', message: 'rtorrent is not connected' });
        return;
      }

      const { fileData, fileName, label } = data;

      if (!fileData) {
        context.send({ type: 'error', message: 'No torrent file data provided' });
        return;
      }

      // Look up category path and priority from CategoryManager
      const category = label ? context.categoryManager.getByName(label) : null;
      const directory = category?.path || null;

      // Map category priority to rtorrent priority
      const { mapPriorityToRtorrent } = require('../lib/CategoryManager');
      const rtorrentPriority = category ? mapPriorityToRtorrent(category.priority) : null;

      // fileData is base64 encoded - convert to Buffer
      const buffer = Buffer.from(fileData, 'base64');
      const username = context.clientInfo.username !== 'unknown' ? context.clientInfo.username : null;

      context.log(`Adding torrent file: ${fileName} (label: ${label || 'none'}${directory ? `, path: ${directory}` : ''}${rtorrentPriority !== null ? `, priority: ${rtorrentPriority}` : ''})`);

      // Use addTorrentRaw to send raw data directly to rtorrent
      // This works even when rtorrent is on a different machine/container
      await context.rtorrentManager.addTorrentRaw(buffer, { label: label || '', directory, priority: rtorrentPriority, start: true, username });

      // Broadcast unified items for instant UI feedback
      await this.broadcastItemsUpdate(context);

      context.send({ type: 'torrent-added', success: true, fileName });
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
        categoryId: category.amuleId,
        message: `Category "${trimmedTitle}" created successfully`
      });
      context.log(`Category created: ${trimmedTitle}${category.amuleId !== null ? ` (aMule ID: ${category.amuleId})` : ''}`);
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
      const { categoryId, title, name, path, pathMappings, comment, color, priority } = data;

      // Support both legacy categoryId and new name-based lookup
      const categoryName = name || title;

      if (!categoryName || categoryName.trim() === '') {
        throw new Error('Category name/title is required');
      }

      const trimmedName = categoryName.trim();

      // Find the category - support both by name and by amuleId
      let category = context.categoryManager.getByName(trimmedName);
      if (!category && categoryId !== undefined && categoryId !== null) {
        category = context.categoryManager.getByAmuleId(categoryId);
      }

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
      if (newTitle && newTitle !== category.name) {
        const renameResult = await context.categoryManager.rename(category.name, newTitle);
        // If rename failed verification in aMule, stop and report error
        if (renameResult.amuleVerification && !renameResult.amuleVerification.verified) {
          context.send({
            type: 'error',
            message: `Failed to rename category in aMule: ${renameResult.amuleVerification.mismatches?.join(', ') || 'verification failed'}`
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

      // Check for aMule verification failure
      if (updateResult.amuleVerification && !updateResult.amuleVerification.verified) {
        context.send({
          type: 'error',
          message: `Category saved locally but aMule sync failed: ${updateResult.amuleVerification.mismatches?.join(', ') || 'verification failed'}`
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
      const { categoryId, name } = data;

      // Support both legacy categoryId and new name-based deletion
      let category;
      if (name) {
        category = context.categoryManager.getByName(name);
      } else if (categoryId !== undefined && categoryId !== null) {
        category = context.categoryManager.getByAmuleId(categoryId);
      }

      if (!category) {
        throw new Error('Category not found');
      }

      const categoryName = category.name;
      const amuleId = category.amuleId;

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
      context.log(`Category deleted: ${categoryName}${amuleId !== null ? ` (aMule ID: ${amuleId})` : ''}`);
    } catch (err) {
      context.log('Delete category error:', err);
      context.send({
        type: 'error',
        message: 'Failed to delete category: ' + err.message
      });
    }
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
      context.broadcast({ type: 'batch-update', data: { items: batchData.items } });
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
   * @param {Array} opts.items - Items to operate on ({ fileHash, clientType, fileName })
   * @param {Object} opts.context - WebSocket context
   * @param {string} opts.name - Action name for logging (e.g. 'pause')
   * @param {string} opts.responseType - WebSocket response type (e.g. 'batch-pause-complete')
   * @param {Function|null} opts.rtorrentFn - async (rtorrentManager, hash) => void, or null if unsupported
   * @param {Function|null} opts.amuleFn - async (amuleClient, hash) => bool, or null if unsupported
   */
  async _executeBatchOperation({ items, context, name, responseType, rtorrentFn, amuleFn }) {
    const label = name.charAt(0).toUpperCase() + name.slice(1);
    try {
      if (!items || !Array.isArray(items) || items.length === 0) {
        throw new Error(`No items provided for batch ${name}`);
      }

      const results = [];
      for (const item of items) {
        try {
          if (item.clientType === 'rtorrent') {
            if (!rtorrentFn) {
              const error = `${label} is not supported for rtorrent`;
              context.log(`${label} failed for ${item.fileName || item.fileHash}: ${error}`);
              results.push({ fileHash: item.fileHash, fileName: item.fileName, success: false, error });
            } else if (context.rtorrentManager?.isConnected()) {
              await rtorrentFn(context.rtorrentManager, item.fileHash);
              results.push({ fileHash: item.fileHash, success: true });
            } else {
              const error = 'rtorrent not connected';
              context.log(`${label} failed for ${item.fileName || item.fileHash}: ${error}`);
              results.push({ fileHash: item.fileHash, fileName: item.fileName, success: false, error });
            }
          } else if (amuleFn) {
            const success = await amuleFn(context.amuleManager.getClient(), item.fileHash);
            if (success) {
              results.push({ fileHash: item.fileHash, success: true });
            } else {
              const error = 'aMule rejected request';
              context.log(`${label} failed for ${item.fileName || item.fileHash}: ${error}`);
              results.push({ fileHash: item.fileHash, fileName: item.fileName, success: false, error });
            }
          } else {
            const error = `${label} is not supported for aMule`;
            context.log(`${label} failed for ${item.fileName || item.fileHash}: ${error}`);
            results.push({ fileHash: item.fileHash, fileName: item.fileName, success: false, error });
          }
        } catch (err) {
          context.log(`${label} failed for ${item.fileName || item.fileHash}: ${err.message}`);
          results.push({ fileHash: item.fileHash, fileName: item.fileName, success: false, error: err.message });
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

  async handleBatchPause(data, context) {
    await this._executeBatchOperation({
      items: data.items, context, name: 'pause', responseType: 'batch-pause-complete',
      rtorrentFn: (mgr, hash) => mgr.stopDownload(hash),
      amuleFn: (client, hash) => client.pauseDownload(hash)
    });
  }

  async handleBatchResume(data, context) {
    await this._executeBatchOperation({
      items: data.items, context, name: 'resume', responseType: 'batch-resume-complete',
      rtorrentFn: (mgr, hash) => mgr.startDownload(hash),
      amuleFn: (client, hash) => client.resumeDownload(hash)
    });
  }

  async handleBatchStop(data, context) {
    await this._executeBatchOperation({
      items: data.items, context, name: 'stop', responseType: 'batch-stop-complete',
      rtorrentFn: (mgr, hash) => mgr.closeDownload(hash),
      amuleFn: null
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
      const { items, deleteFiles, source } = data; // items: Array of { fileHash, clientType, fileName }

      if (!items || !Array.isArray(items) || items.length === 0) {
        throw new Error('No items provided for batch delete');
      }

      // Build hash→item lookup from cached unified items
      const cachedItems = dataFetchService.getCachedBatchData()?.items || [];
      const itemByHash = new Map(cachedItems.map(i => [i.hash, i]));

      const results = [];
      for (const item of items) {
        const cachedItem = itemByHash.get(item.fileHash?.toLowerCase());
        const fileName = item.fileName || cachedItem?.name;

        try {
          if (item.clientType === 'rtorrent') {
            // ── rTorrent deletion ──
            if (!context.rtorrentManager || !context.rtorrentManager.isConnected()) {
              results.push({ fileHash: item.fileHash, fileName, success: false, error: 'rtorrent not connected' });
              continue;
            }

            // Get path info before removing from rtorrent (needed for file deletion)
            let pathInfo = null;
            if (deleteFiles) {
              try {
                pathInfo = await context.rtorrentManager.getDownloadPathInfo(item.fileHash);
              } catch (pathErr) {
                context.log(`Failed to get path info for ${fileName || item.fileHash}: ${pathErr.message}`);
              }
            }

            // Remove from rtorrent (does not delete files)
            await context.rtorrentManager.removeDownload(item.fileHash);

            // Delete files from disk if requested
            if (deleteFiles && pathInfo?.basePath) {
              const translatedPath = categoryManager.translatePath(pathInfo.basePath, 'rtorrent');
              const deleteResult = await this.deleteFromDisk(translatedPath, context);
              if (!deleteResult.success) {
                results.push({ fileHash: item.fileHash, fileName, success: false, error: deleteResult.error });
                continue;
              }
            }

            results.push({ fileHash: item.fileHash, success: true });

          } else {
            // ── aMule deletion ──
            if (source === 'shared') {
              // aMule shared files require file deletion (can't just unshare)
              if (!deleteFiles) {
                results.push({ fileHash: item.fileHash, fileName, success: false, error: 'aMule shared files require "Delete files" option' });
                continue;
              }

              // Get file path from cached item
              if (!cachedItem || !cachedItem.raw?.path || !cachedItem.name) {
                results.push({ fileHash: item.fileHash, fileName, success: false, error: 'File not found or path unavailable' });
                continue;
              }

              const fullFilePath = path.join(cachedItem.raw.path, cachedItem.name);
              const translatedPath = categoryManager.translatePath(fullFilePath, 'amule');
              const deleteResult = await this.deleteFromDisk(translatedPath, context);

              if (!deleteResult.success) {
                results.push({ fileHash: item.fileHash, fileName: cachedItem.name, success: false, error: deleteResult.error });
                continue;
              }

              results.push({ fileHash: item.fileHash, success: true });

            } else {
              // aMule download cancellation (aMule handles .part file cleanup internally)
              const success = await context.amuleManager.getClient().cancelDownload(item.fileHash);
              if (success) {
                results.push({ fileHash: item.fileHash, success: true });
              } else {
                results.push({ fileHash: item.fileHash, fileName, success: false, error: 'aMule rejected request' });
              }
            }
          }
        } catch (err) {
          context.log(`Delete failed for ${fileName || item.fileHash}: ${err.message}`);
          results.push({ fileHash: item.fileHash, fileName, success: false, error: err.message });
        }
      }

      // Post-delete cleanup: refresh aMule shared files if any were deleted
      if (source === 'shared') {
        const amuleDeletedCount = results.filter(r => {
          const item = items.find(i => i.fileHash === r.fileHash);
          return r.success && item?.clientType !== 'rtorrent';
        }).length;

        if (amuleDeletedCount > 0) {
          try {
            await context.amuleManager.getClient().refreshSharedFiles();
            context.log('Triggered aMule shared files refresh after deletion');
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (refreshErr) {
            context.log('Failed to refresh aMule shared files:', refreshErr.message);
          }
        }
      }

      // Emit fileDeleted events for successful deletions
      for (const result of results) {
        if (result.success) {
          const item = items.find(i => i.fileHash === result.fileHash);
          const cachedItem = itemByHash.get(result.fileHash?.toLowerCase());
          eventScriptingManager.emit('fileDeleted', {
            hash: result.fileHash?.toLowerCase(),
            filename: result.fileName || cachedItem?.name || 'Unknown',
            clientType: item?.clientType || cachedItem?.client || 'unknown',
            deletedFromDisk: deleteFiles === true
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
      const { fileHashes, categoryId, categoryName, moveFiles } = data;

      if (!fileHashes || !Array.isArray(fileHashes) || fileHashes.length === 0) {
        throw new Error('No file hashes provided');
      }

      // Support both legacy categoryId and new categoryName
      let targetCategory = null;

      if (categoryName) {
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
      } else if (categoryId !== undefined && categoryId !== null) {
        targetCategory = context.categoryManager.getByAmuleId(categoryId);
      } else {
        throw new Error('Category ID or name is required');
      }

      if (!targetCategory) {
        throw new Error('Target category not found');
      }

      // Look up file names and client types from cached unified items
      const cachedItems = dataFetchService.getCachedBatchData()?.items || [];
      const itemByHash = new Map(cachedItems.map(i => [i.hash, i]));

      const results = [];
      for (const fileHash of fileHashes) {
        const item = itemByHash.get(fileHash?.toLowerCase());
        const fileName = item?.name;

        try {
          if (item?.client === 'rtorrent') {
            // For rtorrent, set both label and priority based on category
            if (context.rtorrentManager && context.rtorrentManager.isConnected()) {
              const labelValue = targetCategory.name === 'Default' ? '' : targetCategory.name;

              // Map category priority to rtorrent priority
              const { mapPriorityToRtorrent } = require('../lib/CategoryManager');
              const rtorrentPriority = mapPriorityToRtorrent(targetCategory.priority);

              // Set both label and priority in one batch call
              await context.rtorrentManager.setLabelAndPriority(fileHash, labelValue, rtorrentPriority);
              results.push({ fileHash, success: true });

              // Check if move requested
              if (moveFiles) {
                const { localPath: destPathLocal, remotePath: destPathRemote } = resolveCategoryDestPaths(targetCategory, 'rtorrent');

                // Only move if there's a valid local destination and it differs from current
                // Compare with remote path since item.directory is what rtorrent reports
                if (destPathLocal && item.directory && destPathRemote !== item.directory) {
                  try {
                    await moveOperationManager.queueMove({
                      hash: fileHash,
                      name: item.name,
                      clientType: item.client || 'rtorrent',
                      sourcePathRemote: item.directory,
                      destPathLocal,
                      destPathRemote,
                      totalSize: item.size,
                      isMultiFile: item.multiFile
                    });
                    context.log(`Queued move for ${fileName || fileHash} -> ${destPathRemote}`);
                  } catch (moveErr) {
                    context.log(`Failed to queue move for ${fileName || fileHash}: ${moveErr.message}`);
                    // Don't fail the category change if move queueing fails
                  }
                }
              }
            } else {
              const error = 'rtorrent not connected';
              context.log(`Category change failed for ${fileName || fileHash}: ${error}`);
              results.push({ fileHash, fileName, success: false, error });
            }
          } else if (item?.shared && item?.client === 'amule' && !item?.downloading) {
            // aMule shared files (completed, not downloading): Move is required (aMule doesn't auto-move shared files)
            if (!context.amuleManager || !context.amuleManager.isConnected()) {
              const error = 'aMule not connected';
              context.log(`Category change failed for ${fileName || fileHash}: ${error}`);
              results.push({ fileHash, fileName, success: false, error });
              continue;
            }

            // Get destination paths using shared helper
            const { localPath: destPathLocal, remotePath: destPathRemote } = resolveCategoryDestPaths(targetCategory, 'amule');

            // Queue move if path differs (aMule shared uses filePath as directory)
            // item.filePath is the directory containing the file
            if (destPathLocal && item.filePath && destPathRemote !== item.filePath) {
              try {
                await moveOperationManager.queueMove({
                  hash: fileHash,
                  name: item.name,
                  clientType: 'amule',
                  sourcePathRemote: item.filePath,
                  destPathLocal,
                  destPathRemote,
                  totalSize: item.size,
                  isMultiFile: false // aMule files are always single files
                });
                context.log(`Queued move for aMule shared file ${fileName || fileHash} -> ${destPathRemote}`);
              } catch (moveErr) {
                context.log(`Failed to queue move for ${fileName || fileHash}: ${moveErr.message}`);
                // Don't fail the category change if move queueing fails
              }
            }
            results.push({ fileHash, success: true });
          } else {
            // For aMule downloads, use categoryId
            // Note: aMule handles file moves automatically on category change for downloads
            if (!context.amuleManager || !context.amuleManager.isConnected()) {
              const error = 'aMule not connected';
              context.log(`Category change failed for ${fileName || fileHash}: ${error}`);
              results.push({ fileHash, fileName, success: false, error });
              continue;
            }

            // Ensure category exists in aMule (creates on demand if needed)
            const amuleIdToUse = await context.categoryManager.ensureAmuleCategory(targetCategory.name);

            if (amuleIdToUse === null) {
              const error = 'Could not resolve aMule category ID';
              context.log(`Category change failed for ${fileName || fileHash}: ${error}`);
              results.push({ fileHash, fileName, success: false, error });
              continue;
            }

            const success = await context.amuleManager.getClient().setFileCategory(fileHash, amuleIdToUse);
            if (success) {
              results.push({ fileHash, success: true });
            } else {
              const error = 'aMule rejected request';
              context.log(`Category change failed for ${fileName || fileHash}: ${error}`);
              results.push({ fileHash, fileName, success: false, error });
            }
          }
        } catch (err) {
          context.log(`Category change failed for ${fileName || fileHash}: ${err.message}`);
          results.push({ fileHash, fileName, success: false, error: err.message });
        }
      }

      // Emit categoryChanged events for successful operations
      for (const result of results) {
        if (result.success) {
          const item = itemByHash.get(result.fileHash?.toLowerCase());
          const oldCategory = item?.category || 'Default';
          // Only emit if category actually changed
          if (oldCategory !== targetCategory.name) {
            eventScriptingManager.emit('categoryChanged', {
              hash: result.fileHash?.toLowerCase(),
              filename: item?.name || 'Unknown',
              clientType: item?.client || 'unknown',
              oldCategory,
              newCategory: targetCategory.name
            });
          }
        }
      }

      // Broadcast unified items for instant UI feedback
      await this.broadcastItemsUpdate(context);

      const successCount = results.filter(r => r.success).length;
      const displayName = targetCategory?.name || `ID ${categoryId}`;
      context.send({
        type: 'batch-category-changed',
        results,
        message: `Changed category for ${successCount}/${fileHashes.length} files`
      });
      context.log(`Batch category change: ${successCount}/${fileHashes.length} -> "${displayName}"${moveFiles ? ' (with move)' : ''}`);
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
      const { fileHashes, source } = data;

      if (!fileHashes || !Array.isArray(fileHashes) || fileHashes.length === 0) {
        context.send({ type: 'delete-permissions', results: [] });
        return;
      }

      // Get cached items to look up file paths
      const cachedItems = dataFetchService.getCachedBatchData()?.items || [];
      const itemByHash = new Map(cachedItems.map(i => [i.hash, i]));

      const results = [];

      for (const fileHash of fileHashes) {
        const item = itemByHash.get(fileHash?.toLowerCase());

        if (!item) {
          results.push({
            fileHash,
            canDelete: false,
            reason: 'not_found',
            message: 'Item not found in cache'
          });
          continue;
        }

        const clientType = item.client || 'amule';

        // aMule active downloads: aMule handles temp file deletion internally
        // No permission check needed - aMule always deletes the temp file
        if (item.client === 'amule' && source === 'downloads') {
          results.push({
            fileHash,
            clientType,
            canDelete: true,
            reason: 'amule_managed',
            message: 'aMule manages temp file deletion'
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
   * Check move permissions for items (works with any client type)
   * Validates source and destination paths are accessible and writable
   */
  async handleCheckMovePermissions(data, context) {
    try {
      const { fileHashes, categoryName } = data;

      if (!fileHashes || !Array.isArray(fileHashes) || fileHashes.length === 0) {
        context.send({ type: 'move-permissions', results: [], canMove: false });
        return;
      }

      // Get target category
      const targetCategory = context.categoryManager?.getByName(categoryName);
      if (!targetCategory) {
        context.send({
          type: 'move-permissions',
          results: [],
          canMove: false,
          error: `Category not found: ${categoryName}`
        });
        return;
      }

      // Get cached items to look up file paths and client types
      const cachedItems = dataFetchService.getCachedBatchData()?.items || [];
      const itemByHash = new Map(cachedItems.map(i => [i.hash, i]));

      const results = [];
      const sourcePathsByClient = new Map(); // Map<clientType, Map<translatedPath, remotePath>>
      const destPathsByClient = new Map(); // Map<clientType, { localPath, remotePath }>

      // First pass: collect all source paths and validate items
      for (const fileHash of fileHashes) {
        const item = itemByHash.get(fileHash?.toLowerCase());

        if (!item) {
          results.push({
            fileHash,
            canMove: false,
            reason: 'not_found',
            message: 'Item not found in cache'
          });
          continue;
        }

        const clientType = item.client || 'amule';

        // Get destination paths for this client type (cached per client)
        if (!destPathsByClient.has(clientType)) {
          destPathsByClient.set(clientType, resolveCategoryDestPaths(targetCategory, clientType));
        }
        const { localPath: localDestPath, remotePath: remoteDestPath } = destPathsByClient.get(clientType);

        // Check if destination is configured
        if (!localDestPath) {
          results.push({
            fileHash,
            canMove: false,
            reason: 'no_dest_path',
            message: 'No destination path configured for this category'
          });
          continue;
        }

        // Resolve source path using shared helper
        const pathInfo = resolveItemPath(item);

        if (!pathInfo) {
          results.push({
            fileHash,
            canMove: false,
            reason: 'no_path',
            message: 'Source path not available',
            clientType
          });
          continue;
        }

        // Check if already at destination (compare directories with remote path since source is client's view)
        const compareDestPath = remoteDestPath || localDestPath;
        if (pathInfo.baseDir === compareDestPath) {
          results.push({
            fileHash,
            canMove: true,
            reason: 'same_path',
            message: 'Already at destination path',
            shared: item.shared,
            clientType
          });
          continue;
        }

        // Collect source path for permission check
        if (!sourcePathsByClient.has(clientType)) {
          sourcePathsByClient.set(clientType, new Map()); // Map<translatedPath, remotePath>
        }
        sourcePathsByClient.get(clientType).set(pathInfo.localPath, pathInfo.remotePath);

        results.push({
          fileHash,
          name: item.name,
          clientType,
          sourcePath: pathInfo.remotePath,
          translatedSourcePath: pathInfo.localPath,
          canMove: null, // Will be determined after path checks
          shared: item.shared,
          isMultiFile: pathInfo.isMultiFile
        });
      }

      // Check destination paths accessibility (one per client type)
      const destErrors = new Map(); // Map<clientType, errorMessage>
      const destAccessible = new Map(); // Map<clientType, boolean>
      let primaryDestPath = null; // For response (use first client's dest path)

      for (const [clientType, { localPath, remotePath }] of destPathsByClient) {
        if (!localPath) {
          destErrors.set(clientType, 'No destination path configured');
          destAccessible.set(clientType, false);
          continue;
        }

        if (!primaryDestPath) {
          primaryDestPath = remotePath || localPath;
        }

        const destCheck = await checkPathPermissions(localPath, {
          requireRead: true,
          requireWrite: true,
          requireDirectory: true
        });

        const displayPath = remotePath || localPath;
        if (destCheck.exists && destCheck.writable) {
          destAccessible.set(clientType, true);
        } else {
          destAccessible.set(clientType, false);
          const errorMsg = destCheck.errorCode === 'not_found'
            ? `Destination path not found: ${displayPath}`
            : destCheck.errorCode === 'not_writable'
              ? `No write permission for destination: ${displayPath}`
              : `Cannot access destination: ${destCheck.error}`;
          destErrors.set(clientType, errorMsg);
          const pathInfo = localPath !== remotePath ? `local: ${localPath}, remote: ${remotePath}` : `path: ${localPath}`;
          context.log(`⚠️ Move permission check failed (dest, ${clientType}): ${errorMsg} [${pathInfo}]`);
        }
      }

      // Check source paths accessibility (grouped by client type)
      const sourceErrors = new Map(); // Map<translatedPath, errorMessage>
      for (const [clientType, pathMap] of sourcePathsByClient) {
        for (const [localPath, remotePath] of pathMap) {
          const srcCheck = await checkPathPermissions(localPath, {
            requireRead: true,
            requireWrite: true
          });

          if (!srcCheck.exists || !srcCheck.readable || !srcCheck.writable) {
            // Use remotePath in user-facing message (what they configured), localPath in logs (what app sees)
            const displayPath = remotePath || localPath;
            const errorMsg = srcCheck.errorCode === 'not_found'
              ? `Source path not found: ${displayPath} (volume may not be mounted)`
              : srcCheck.errorCode === 'not_readable' || srcCheck.errorCode === 'not_writable'
                ? `No permission to access source path: ${displayPath}`
                : `Cannot access source path ${displayPath}: ${srcCheck.error}`;
            sourceErrors.set(localPath, errorMsg);
            const pathInfo = localPath !== remotePath ? `local: ${localPath}, remote: ${remotePath}` : `path: ${localPath}`;
            context.log(`⚠️ Move permission check failed (source, ${clientType}): ${errorMsg} [${pathInfo}]`);
          }
        }
      }

      // Update results with permission check outcomes
      let canMoveAny = false;
      for (const result of results) {
        if (result.canMove !== null) continue; // Already determined

        const clientType = result.clientType || 'amule';

        if (!destAccessible.get(clientType)) {
          result.canMove = false;
          result.reason = 'dest_error';
          result.message = destErrors.get(clientType) || 'Destination not accessible';
        } else if (result.translatedSourcePath) {
          const srcError = sourceErrors.get(result.translatedSourcePath);
          if (srcError) {
            result.canMove = false;
            result.reason = 'source_error';
            result.message = srcError;
          } else {
            result.canMove = true;
            result.reason = 'ok';
            canMoveAny = true;
          }
        }
      }

      // Also check if any already-ok items exist
      if (!canMoveAny) {
        canMoveAny = results.some(r => r.canMove === true && r.reason !== 'same_path');
      }

      // Check if any destination is accessible
      const anyDestAccessible = Array.from(destAccessible.values()).some(v => v);

      // Get first destination error for response (if any)
      const firstDestError = destErrors.size > 0 ? destErrors.values().next().value : null;

      const isDocker = require('./config').isDocker;
      context.send({
        type: 'move-permissions',
        results,
        canMove: canMoveAny || anyDestAccessible,
        destPath: primaryDestPath,
        destError: firstDestError,
        isDocker
      });
    } catch (err) {
      context.log('Check move permissions error:', err);
      context.send({ type: 'move-permissions', results: [], canMove: false, error: err.message });
    }
  }

}

module.exports = new WebSocketHandlers();