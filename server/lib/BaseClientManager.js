/**
 * BaseClientManager - Base class for download client managers
 *
 * Extends BaseModule with download-client-specific functionality:
 * - Client lifecycle (connection, reconnection, config)
 * - Download history tracking
 * - Tracker/peer cache with periodic refresh
 *
 * Only download client managers (AmuleManager, RtorrentManager, QbittorrentManager)
 * should extend this class. All other modules extend BaseModule directly.
 */
const BaseModule = require('./BaseModule');
const logger = require('./logger');

class BaseClientManager extends BaseModule {
  constructor() {
    super();

    // Note: BaseModule already binds level-aware loggers (this.log/info/warn/
    // error/debug) and uses `logSource()` to tag each record with this
    // module's source — defaulting to `instanceId` when present. So we don't
    // need a separate prefixing override here; the source surfaces in the
    // log file's `[source]` slot and on the LogsView.

    // Client connection
    this.client = null;
    this.connectionInProgress = false;
    this._onConnectCallbacks = [];
    this._clientConfig = null;
    this.reconnectInterval = null;

    // Connection error state
    this.lastError = null;      // Human-readable error string
    this.lastErrorTime = null;   // ISO timestamp

    // Tracker/peer cache (used by torrent managers, no-op for aMule)
    this._trackerCache = new Map();
    this._peerCache = new Map();
    this._trackerRefreshInterval = null;
  }

  // ============================================================================
  // CLIENT LIFECYCLE
  // ============================================================================

  /**
   * Set the client configuration for this manager instance.
   * @param {Object} clientConfig - Client config from config.clients array
   */
  setClientConfig(clientConfig) {
    this._clientConfig = clientConfig;
  }

  /**
   * Get current client
   * @returns {Object|null}
   */
  getClient() {
    return this.client;
  }

  /**
   * Check if this client is enabled in config
   * @returns {boolean}
   */
  isEnabled() {
    return this._clientConfig && this._clientConfig.enabled === true;
  }

  /**
   * Register a callback to be called when the client connects
   * @param {Function} callback - Callback function
   */
  onConnect(callback) {
    this._onConnectCallbacks.push(callback);
  }

  /**
   * Store a connection error for frontend display.
   * @param {*} err - Error object or string
   */
  _setConnectionError(err) {
    this.lastError = logger.errorDetail(err);
    this.lastErrorTime = new Date().toISOString();
  }

  /**
   * Clear any stored connection error (on successful connect).
   */
  _clearConnectionError() {
    this.lastError = null;
    this.lastErrorTime = null;
  }

  // ============================================================================
  // DOWNLOAD HISTORY TRACKING
  // ============================================================================

  /**
   * Check if history tracking is enabled
   * @returns {boolean}
   */
  isHistoryEnabled() {
    // Lazy require to avoid circular dependency
    const config = require('../modules/config');
    return config.getConfig()?.history?.enabled !== false && !!this.downloadHistoryDB;
  }

  /**
   * Track a download in history
   * @param {string} hash - Info hash
   * @param {string} name - Download name
   * @param {number|null} size - Size in bytes
   * @param {string|null} username - Username
   * @param {string|null} category - Category/label name
   */
  trackDownload(hash, name, size = null, username = null, category = null) {
    if (!this.isHistoryEnabled() || !hash) return;

    try {
      this.downloadHistoryDB.addDownload(hash, name || 'Unknown', size, username, this.clientType, category, this.instanceId);
    } catch (err) {
      logger.warn(`[${this.clientType}] Failed to track download:`, err.message);
    }
  }

  /**
   * Track a deletion in history
   * @param {string} hash - Info hash
   */
  trackDeletion(hash) {
    if (!this.isHistoryEnabled() || !hash) return;

    try {
      this.downloadHistoryDB.markDeleted(hash, this.instanceId);
    } catch (err) {
      logger.warn(`[${this.clientType}] Failed to track deletion:`, err.message);
    }
  }

  // ============================================================================
  // TRACKER / PEER CACHE
  // ============================================================================

  /**
   * Start periodic tracker/peer cache refresh.
   * Subclasses that have tracker data should implement _getItemsForTrackerRefresh()
   * and _fetchTrackersAndPeers(items).
   * Callers should NOT await this — initial refresh runs in background.
   * @returns {Promise<void>}
   */
  async startTrackerRefresh() {
    if (this._trackerRefreshInterval) {
      return; // Already running
    }

    this.log('🔄 Starting tracker cache refresh (every 10s)');

    // Do initial refresh (runs in background when caller doesn't await)
    await this.refreshAllTrackers();

    // Schedule periodic refresh
    this._trackerRefreshInterval = setInterval(() => {
      this.refreshAllTrackers();
    }, 10000);
  }

  /**
   * Stop periodic tracker/peer cache refresh.
   */
  stopTrackerRefresh() {
    if (this._trackerRefreshInterval) {
      clearInterval(this._trackerRefreshInterval);
      this._trackerRefreshInterval = null;
      this.log('⏹️  Stopped tracker cache refresh');
    }
  }

  /**
   * Refresh trackers and peers for all known items.
   * Gets items via _getItemsForTrackerRefresh(), fetches data via _fetchTrackersAndPeers(),
   * updates caches, and cleans up stale entries.
   */
  async refreshAllTrackers() {
    if (!this.client) {
      return;
    }

    try {
      const items = await this._getItemsForTrackerRefresh();
      if (!items || items.length === 0) {
        return;
      }

      const { trackersByHash, peersByHash } = await this._fetchTrackersAndPeers(items);

      // Update caches
      const now = Date.now();
      const currentHashes = new Set();

      for (const item of items) {
        const hash = (item.hash || item.hashString || '')?.toLowerCase();
        if (!hash) continue;
        currentHashes.add(hash);

        const trackerData = trackersByHash.get(hash);
        if (trackerData) {
          this._trackerCache.set(hash, { ...trackerData, lastUpdated: now });
        }

        const peers = peersByHash.get(hash);
        if (peers) {
          this._peerCache.set(hash, { peers, lastUpdated: now });
        }
      }

      // Clean up cache for items that no longer exist
      for (const hash of this._trackerCache.keys()) {
        if (!currentHashes.has(hash)) {
          this._trackerCache.delete(hash);
        }
      }
      for (const hash of this._peerCache.keys()) {
        if (!currentHashes.has(hash)) {
          this._peerCache.delete(hash);
        }
      }
    } catch (err) {
      this.error('❌ Error refreshing tracker/peer cache:', logger.errorDetail(err));
    }
  }

  /**
   * Merge cached tracker/peer data into item objects.
   * Sets trackersDetailed, peersDetailed (role-stamped), and optionally trackers (simple URL array).
   * @param {Array} items - Download/torrent objects with a .hash property
   */
  _mergeTrackerData(items) {
    for (const item of items) {
      const hash = (item.hash || item.hashString || '')?.toLowerCase();
      if (!hash) continue;

      const trackerCached = this._trackerCache.get(hash);
      if (trackerCached) {
        item.trackersDetailed = trackerCached.trackersDetailed || [];
        if (trackerCached.trackers) {
          item.trackers = trackerCached.trackers;
        }
      } else {
        item.trackersDetailed = [];
      }

      const peerCached = this._peerCache.get(hash);
      item.peersDetailed = (peerCached?.peers || []).map(p => ({ ...p, role: 'peer' }));
    }
  }

  /**
   * Override in subclass: return cached items or fetch fresh ones for tracker refresh.
   * @returns {Promise<Array>} Array of items with .hash property
   */
  async _getItemsForTrackerRefresh() {
    return [];
  }

  /**
   * Override in subclass: fetch tracker and peer data for the given items.
   * @param {Array} items - Items from _getItemsForTrackerRefresh()
   * @returns {Promise<{ trackersByHash: Map, peersByHash: Map }>}
   *   trackersByHash values: { trackersDetailed: Object[], trackers?: string[] }
   *   peersByHash values: Object[] (peer arrays)
   */
  async _fetchTrackersAndPeers(_items) {
    return { trackersByHash: new Map(), peersByHash: new Map() };
  }

  // ============================================================================
  // RECONNECTION
  // ============================================================================

  /**
   * Schedule reconnection if not already scheduled.
   * Subclasses must implement initClient().
   * @param {number} intervalMs - Reconnection interval in milliseconds
   */
  scheduleReconnect(intervalMs) {
    if (this.reconnectInterval) {
      return; // Already scheduled
    }

    if (!this._clientConfig || !this._clientConfig.enabled) {
      return; // Disabled, don't reconnect
    }

    const name = this.displayName || this.clientType || 'client';
    this.log(`🔄 Will retry ${name} connection in ${intervalMs / 1000} seconds...`);
    this.reconnectInterval = setInterval(async () => {
      if (!this._clientConfig || !this._clientConfig.enabled) {
        this.clearReconnect();
        return;
      }
      this.log(`🔄 Attempting to reconnect to ${name}...`);
      await this.initClient();
    }, intervalMs);
  }

  /**
   * Clear any active reconnection interval
   */
  clearReconnect() {
    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval);
      this.reconnectInterval = null;
    }
  }

  /**
   * Fetch and normalize all data from this client.
   * Override in each manager to implement client-specific fetch + normalization.
   * @param {Array} _categories - Categories for normalizer (aMule uses these)
   * @returns {Promise<Object>} { downloads: [], sharedFiles: [], uploads: [] }
   */
  async fetchData(_categories) {
    return { downloads: [], sharedFiles: [], uploads: [] };
  }

  /**
   * Delete an item from this client.
   * Override in each manager to implement client-specific deletion.
   * @param {string} _hash - Item hash
   * @param {Object} _options - { deleteFiles, isShared, filePath }
   * @returns {Promise<Object>} { success, pathsToDelete?: string[], error?: string }
   */
  async deleteItem(_hash, _options) {
    throw new Error(`deleteItem() not implemented for ${this.clientType}`);
  }

  /**
   * Set category or label for a download.
   * Override in each manager to implement client-specific category/label setting.
   * @param {string} _hash - Item hash
   * @param {Object} _options - { categoryName, priority }
   * @returns {Promise<Object>} { success, error? }
   */
  async setCategoryOrLabel(_hash, _options) {
    throw new Error(`setCategoryOrLabel() not implemented for ${this.clientType}`);
  }

  // ============================================================================
  // CATEGORY CRUD (options-object pattern)
  // ============================================================================

  /**
   * Get categories from this client. Override in managers with category support.
   * @returns {Promise<*>} Client-specific category data, or null if not supported
   */
  async getCategories() {
    return null;
  }

  /**
   * Create a category in this client. Override in managers with category support.
   * @param {Object} _opts - { name, path, comment, color, priority }
   * @returns {Promise<Object|null>} Result or null if not supported
   */
  async createCategory(_opts) {
    return null;
  }

  /**
   * Edit a category in this client. Override in managers with category support.
   * @param {Object} _opts - { id, name, path, defaultPath, comment, color, priority }
   * @returns {Promise<Object|null>} { success, verified, mismatches } or null if not supported
   */
  async editCategory(_opts) {
    return null;
  }

  /**
   * Delete a category from this client. Override in managers with category support.
   * @param {Object} _opts - { id, name }
   */
  async deleteCategory(_opts) {
    // no-op for clients without category support
  }

  /**
   * Rename a category in this client. Override in managers with category support.
   * @param {Object} _opts - { oldName, newName, path, defaultPath, id, comment, color, priority }
   * @returns {Promise<Object|null>} { success, verified, mismatches } or null if not supported
   */
  async renameCategory(_opts) {
    // no-op for clients without category support
    return null;
  }

  /**
   * Ensure a category exists in this client (create if missing, link if found).
   * Override in managers with category support.
   * @param {Object} _opts - { name, path, color, comment, priority }
   * @returns {Promise<Object|null>} Result (e.g. { amuleId } for aMule), or null
   */
  async ensureCategoryExists(_opts) {
    return null;
  }

  /**
   * Ensure multiple categories exist in this client (batch-aware: fetches existing list once).
   * Override in managers with category support for efficient batch operations.
   * @param {Array<Object>} _categories - Array of { name, path, color, comment, priority }
   * @returns {Promise<Array<Object>>} Results per category (e.g. [{ name, amuleId }] for aMule)
   */
  async ensureCategoriesBatch(_categories) {
    return [];
  }
}


module.exports = BaseClientManager;
