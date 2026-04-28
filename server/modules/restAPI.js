/**
 * REST API Module
 *
 * Exposes WebSocket actions as HTTP REST endpoints.
 * Uses a thin bridge to call existing WS handler methods directly,
 * avoiding any code duplication.
 *
 * Auth: session cookie or X-API-Key header (same as other HTTP routes).
 * Capabilities: reuses ACTION_CAPABILITIES from webSocketHandlers.
 */

'use strict';

const express = require('express');
const logger = require('../lib/logger');
const config = require('./config');
const categoryManager = require('../lib/CategoryManager');
const { requireCapability } = require('../middleware/capabilities');

let webSocketHandlers = null;

/**
 * Create a mock WS context for HTTP requests.
 * Captures the first `send()` or `broadcast()` call as the HTTP response.
 * Some handlers (e.g., search) send results via broadcast instead of send.
 */
function createHttpContext(req) {
  let _resolve;
  let _resolved = false;
  const responsePromise = new Promise(resolve => { _resolve = resolve; });

  // Tracks the last broadcast as fallback if send() is never called
  let _lastBroadcast = null;

  // send() is the direct response — always takes priority
  const onSend = (data) => {
    if (_resolved) return;
    _resolved = true;
    _resolve(data);
  };

  // broadcast() captures the last non-skipped broadcast as fallback.
  // Used only if the handler never calls send() (e.g., search results come via broadcast).
  const SKIP_BROADCAST_TYPES = new Set(['search-lock', 'connected', 'batch-update']);

  const onBroadcast = (data) => {
    if (_resolved) return;
    if (data?.type && SKIP_BROADCAST_TYPES.has(data.type)) return;
    _lastBroadcast = data;
  };

  // Called by bridge() after the handler completes — resolves with broadcast fallback
  // or empty response if neither send() nor broadcast() was called
  const resolveFallback = () => {
    if (_resolved) return;
    _resolved = true;
    _resolve(_lastBroadcast || { type: 'empty', message: 'No data available' });
  };

  const username = req.session?.username || 'unknown';
  const clientIp = req.ip || 'unknown';
  const isAdmin = config.getAuthEnabled() ? (req.session?.isAdmin || false) : true;

  const context = {
    // Mock ws with user info for handlers that access ws.user (e.g., snapshot filtering)
    ws: {
      user: {
        userId: req.session?.userId || null,
        username,
        isAdmin,
        capabilities: req.session?.capabilities || [],
        subscriptions: new Set()
      }
    },
    log: (...args) => logger.info(`[HTTP-API] [${clientIp}(${username})]`, ...args),
    send: onSend,
    broadcast: (data) => onBroadcast(data),
    clientInfo: {
      username,
      nickname: 'unknown',
      clientIp,
      userId: req.session?.userId || null,
      isAdmin,
      capabilities: req.session?.capabilities || []
    },
    categoryManager
  };

  return { context, responsePromise, resolveFallback };
}

// Handlers that take only (context), not (data, context)
const CONTEXT_ONLY = new Set(['handleGetCategories', 'handleRequestFullSnapshot']);
// Subset of CONTEXT_ONLY that are synchronous (don't need await)
const SYNC_HANDLERS = new Set(['handleRequestFullSnapshot']);

/**
 * Bridge an HTTP request to a WS handler method.
 * @param {string} method - Handler method name (e.g., 'handleBatchPause')
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Object} [extraData] - Additional data to merge into the handler payload
 */
async function bridge(method, req, res, extraData = {}) {
  if (!webSocketHandlers) {
    return res.status(503).json({ success: false, error: 'Service not ready' });
  }

  const { context, responsePromise, resolveFallback } = createHttpContext(req);
  const data = { ...req.body, ...req.query, ...extraData };

  // Timeout covers the entire handler execution — if it hangs, the HTTP request won't block forever
  const timeoutMs = method === 'handleSearch' ? 130000 : 30000;
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Handler ${method} timed out after ${timeoutMs / 1000}s`)), timeoutMs)
  );

  try {
    await Promise.race([
      (async () => {
        // Some handlers take only (context), others take (data, context)
        // Sync handlers (like handleRequestFullSnapshot) don't need await
        if (SYNC_HANDLERS.has(method)) {
          webSocketHandlers[method](context);
        } else if (CONTEXT_ONLY.has(method)) {
          await webSocketHandlers[method](context);
        } else {
          await webSocketHandlers[method](data, context);
        }

        // Handler completed — if send() was never called, use last broadcast as fallback
        // (e.g., search results arrive via broadcast, not send)
        resolveFallback();
      })(),
      timeout
    ]);

    const result = await responsePromise;
    res.json(result);
  } catch (err) {
    logger.error(`[REST API] ${method} error:`, err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Register all REST API routes.
 * @param {Object} app - Express app
 */
function registerRoutes(app) {
  const router = express.Router();

  // ============================================================================
  // DOWNLOADS
  // ============================================================================

  // Add magnet links
  router.post('/downloads/magnets', requireCapability('add_downloads'), (req, res) =>
    bridge('handleAddMagnetLinks', req, res)
  );

  // Add ED2K links
  router.post('/downloads/ed2k', requireCapability('add_downloads'), (req, res) =>
    bridge('handleAddEd2kLinks', req, res)
  );

  // Add torrent file (base64 in JSON body: { data: "base64...", fileName: "...", ... })
  router.post('/downloads/torrent', requireCapability('add_downloads'), (req, res) =>
    bridge('handleAddTorrentFile', req, res)
  );

  // Batch download search results (aMule)
  router.post('/downloads/search-results', requireCapability('add_downloads'), (req, res) =>
    bridge('handleBatchDownloadSearchResults', req, res)
  );

  // ============================================================================
  // DOWNLOAD CONTROL
  // ============================================================================

  router.post('/downloads/pause', requireCapability('pause_resume'), (req, res) =>
    bridge('handleBatchPause', req, res)
  );

  router.post('/downloads/resume', requireCapability('pause_resume'), (req, res) =>
    bridge('handleBatchResume', req, res)
  );

  router.post('/downloads/stop', requireCapability('pause_resume'), (req, res) =>
    bridge('handleBatchStop', req, res)
  );

  router.post('/downloads/delete', requireCapability('remove_downloads'), (req, res) =>
    bridge('handleBatchDelete', req, res)
  );

  router.post('/downloads/move', requireCapability('edit_downloads'), (req, res) =>
    bridge('handleBatchMoveFiles', req, res)
  );

  router.post('/downloads/category', requireCapability('assign_categories'), (req, res) =>
    bridge('handleBatchSetFileCategory', req, res)
  );

  router.post('/downloads/rename', requireCapability('rename_files'), (req, res) =>
    bridge('handleRenameFile', req, res)
  );

  router.post('/downloads/rating-comment', requireCapability('set_comment'), (req, res) =>
    bridge('handleSetFileRatingComment', req, res)
  );

  // ============================================================================
  // PERMISSIONS (pre-flight checks)
  // ============================================================================

  router.post('/permissions/delete', requireCapability('remove_downloads'), (req, res) =>
    bridge('handleCheckDeletePermissions', req, res)
  );

  router.post('/permissions/move', requireCapability('move_files'), (req, res) =>
    bridge('handleCheckMovePermissions', req, res)
  );

  router.post('/permissions/move-to', requireCapability('edit_downloads'), (req, res) =>
    bridge('handleCheckMoveToPermissions', req, res)
  );

  // ============================================================================
  // CATEGORIES
  // ============================================================================

  router.get('/categories', (req, res) =>
    bridge('handleGetCategories', req, res)
  );

  router.post('/categories', requireCapability('manage_categories'), (req, res) =>
    bridge('handleCreateCategory', req, res)
  );

  router.put('/categories', requireCapability('manage_categories'), (req, res) =>
    bridge('handleUpdateCategory', req, res)
  );

  router.delete('/categories', requireCapability('manage_categories'), (req, res) =>
    bridge('handleDeleteCategory', req, res)
  );

  // ============================================================================
  // SEARCH (ED2K)
  // ============================================================================

  router.post('/search', requireCapability('search'), (req, res) => {
    const wait = req.body.wait !== false && req.query.wait !== 'false';
    if (wait) {
      // Blocking: wait for search to complete (up to 120s)
      bridge('handleSearch', req, res);
    } else {
      // Non-blocking: start search in background, return immediately
      // Results can be polled via GET /api/v1/search/results
      const noopRes = { json: () => {}, status: () => ({ json: () => {} }) };
      bridge('handleSearch', req, noopRes);
      res.json({ type: 'search-started', message: 'Search started. Poll GET /api/v1/search/results for results.' });
    }
  });

  router.get('/search/results', requireCapability('search'), (req, res) =>
    bridge('handleGetPreviousSearchResults', req, res)
  );

  // ============================================================================
  // aMULE SPECIFIC
  // ============================================================================

  router.get('/amule/servers', requireCapability('view_servers'), (req, res) =>
    bridge('handleGetServersList', req, res)
  );

  router.post('/amule/servers/action', requireCapability('view_servers'), (req, res) =>
    bridge('handleServerDoAction', req, res)
  );

  router.get('/amule/server-info', requireCapability('view_servers'), (req, res) =>
    bridge('handleGetServerInfo', req, res)
  );

  router.get('/amule/stats-tree', requireCapability('view_statistics'), (req, res) =>
    bridge('handleGetStatsTree', req, res)
  );

  router.post('/amule/refresh-shared', requireCapability('view_shared'), (req, res) =>
    bridge('handleRefreshSharedFiles', req, res)
  );

  // ============================================================================
  // LOGS
  // ============================================================================

  router.get('/logs/amule', requireCapability('view_logs'), (req, res) =>
    bridge('handleGetLog', req, res)
  );

  router.get('/logs/app', requireCapability('view_logs'), (req, res) =>
    bridge('handleGetAppLog', req, res)
  );

  router.get('/logs/qbittorrent', requireCapability('view_logs'), (req, res) =>
    bridge('handleGetQbittorrentLog', req, res)
  );

  // ============================================================================
  // DATA
  // ============================================================================

  router.get('/data/snapshot', (req, res) =>
    bridge('handleRequestFullSnapshot', req, res)
  );

  app.use('/api/v1', router);
}

/**
 * Set the WebSocket handlers instance (called during initialization).
 * @param {Object} handlers - WebSocketHandlers instance
 */
function setHandlers(handlers) {
  webSocketHandlers = handlers;
}

module.exports = { registerRoutes, setHandlers };
