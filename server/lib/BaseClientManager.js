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
const { TRACKER_REFRESH_INTERVAL, TRACKER_REFRESH_SCOPE, hasDemand } = require('./refreshPolicy');
const { parseEd2kLink } = require('./torrentUtils');

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
    this._trackerRefreshRunning = false;
    this._trackerRefreshGeneration = 0;   // bumped by stop, so a pass in flight never reschedules
    this._trackerRefreshTimer = null;
    this._trackerRefreshIntervalMs = TRACKER_REFRESH_INTERVAL;
    this._trackerRefreshScope = TRACKER_REFRESH_SCOPE;

    // One search at a time per client (the search box greys while held).
    this._searchInProgress = false;
  }

  // ============================================================================
  // SEARCH LOCK (one search at a time per client; shared by searchable managers)
  // ============================================================================

  /** Take the lock, or false if a search is already running. */
  acquireSearchLock() {
    if (this._searchInProgress) return false;
    this._searchInProgress = true;
    this._broadcastSearchLock(true);
    return true;
  }

  releaseSearchLock() {
    if (!this._searchInProgress) return;
    this._searchInProgress = false;
    this._broadcastSearchLock(false);
  }

  /** Tell the clients that may search about the slot changing hands. */
  _broadcastSearchLock(locked) {
    this.broadcast?.({ type: 'search-lock', locked, instanceId: this.instanceId }, {
      filter: u => u?.isAdmin || u?.capabilities?.includes('search')
    });
  }

  isSearchInProgress() {
    return !!this._searchInProgress;
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
   * Per-instance category sync gates. Default to `true` so existing setups
   * keep cross-syncing untouched.
   *
   * The UI exposes a single `categorySync` toggle today, which controls both
   * directions. We split the check into `In` / `Out` here so a future
   * advanced-config UI can override per direction (e.g. push-only or
   * receive-only) without any data migration: when `categorySyncIn` /
   * `categorySyncOut` are absent, both fall back to the unified
   * `categorySync` value.
   *
   * Semantics:
   *  - `In`  → does central CategoryManager push categories TO this instance?
   *           Used by CategoryManager when iterating clients for propagation.
   *  - `Out` → does this instance publish its local categories INTO the central
   *           registry on connect-sync? Used by each manager's onConnectSync().
   */
  isCategorySyncIn() {
    const cfg = this._clientConfig || {};
    if (cfg.categorySyncIn !== undefined) return cfg.categorySyncIn !== false;
    return cfg.categorySync !== false;
  }

  isCategorySyncOut() {
    const cfg = this._clientConfig || {};
    if (cfg.categorySyncOut !== undefined) return cfg.categorySyncOut !== false;
    return cfg.categorySync !== false;
  }

  /**
   * Per-instance notifications gate. When `false`, the EventScriptingManager
   * skips Apprise notifications sourced from this instance (both download-
   * lifecycle events and health events). Event scripts still run — they're
   * automation, not messaging. Defaults to `true` (missing field = enabled)
   * so legacy configs keep notifying as before.
   */
  isNotificationsEnabled() {
    const cfg = this._clientConfig || {};
    return cfg.notifications !== false;
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

  /**
   * Shared `extractHistoryMetadata` default for single-file, source-based clients
   * (aMule, Rucio): no trackers, one file per item. A shared file (no `progress`
   * field) counts as fully downloaded; the directory is the item's path when
   * absolute. The caller passes the uploaded total, which each client names
   * differently.
   * @param {Object} item - raw download/shared-file item
   * @param {number} uploaded - bytes uploaded for this item
   * @returns {Object} history-DB metadata
   */
  sourceBasedHistoryMetadata(item, uploaded = 0) {
    const size = item.size || 0;
    const isSharedFile = item.progress === undefined;
    const downloaded = isSharedFile ? size : (item.downloaded || 0);
    const ratio = downloaded > 0 ? uploaded / downloaded : 0;
    const directory = item.path && item.path.startsWith('/') ? item.path : null;
    return {
      hash: item.hash?.toLowerCase(),
      instanceId: item.instanceId,
      size,
      name: item.name,
      downloaded,
      uploaded,
      ratio,
      trackerDomain: null,
      directory,
      multiFile: false,
      category: null // filled from the unified items' categoryByKey lookup
    };
  }

  /**
   * Pull the content hash out of a link this client handles, so generic code
   * (e.g. recording ownership) never has to know a specific network's scheme.
   * The default reads an ed2k MD4 (ed2k://|file|name|size|<32-hex>|/) via the
   * field-based parseEd2kLink, which keys the hash off its position after the
   * numeric size — so a 32-hex file name isn't mistaken for the hash. A manager
   * with other link shapes overrides this.
   * @param {string} link
   * @returns {string|null} lower-cased hash, or null
   */
  hashFromLink(link) {
    return parseEd2kLink(link).hash;
  }

  // ============================================================================
  // TRACKER / PEER CACHE
  // ============================================================================

  /**
   * Start the tracker/peer cache refresh loop.
   *
   * Each pass is scheduled only after the previous one settles, so a slow pass
   * over a large library never overlaps the next. Callers should not await
   * this: the first pass runs in the background.
   * @returns {Promise<void>}
   */
  async startTrackerRefresh() {
    // Set before the first pass, which can take a while on a large library:
    // the guard must already hold if a reconnect calls this again meanwhile.
    if (this._trackerRefreshRunning) return;
    this._trackerRefreshRunning = true;
    const generation = ++this._trackerRefreshGeneration;

    this.log(`🔄 Starting tracker cache refresh (${this._trackerRefreshIntervalMs / 1000}s between passes, scope: ${this._trackerRefreshScope})`);

    const runPass = async () => {
      if (generation !== this._trackerRefreshGeneration) return;
      try {
        await this.refreshAllTrackers();
      } finally {
        if (generation === this._trackerRefreshGeneration) {
          this._trackerRefreshTimer = setTimeout(runPass, this._trackerRefreshIntervalMs);
        }
      }
    };
    await runPass();
  }

  /**
   * Stop the tracker/peer cache refresh loop, including a pass in flight.
   */
  stopTrackerRefresh() {
    if (!this._trackerRefreshRunning) return;
    this._trackerRefreshRunning = false;
    this._trackerRefreshGeneration++;
    clearTimeout(this._trackerRefreshTimer);
    this._trackerRefreshTimer = null;
    this.log('⏹️  Stopped tracker cache refresh');
  }

  /**
   * Refresh tracker and peer data for the items worth scanning this pass.
   *
   * Which items those are: see _selectTrackerRefreshItems(). Stale entries are
   * removed against the full item list, not the scanned subset - a torrent
   * skipped this pass still exists.
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

      const toScan = this._selectTrackerRefreshItems(items);
      const scanned = new Set();

      if (toScan.length > 0) {
        const { trackersByHash, peersByHash } = await this._fetchTrackersAndPeers(toScan);
        const now = Date.now();

        for (const item of toScan) {
          const hash = this._trackerItemHash(item);
          if (!hash) continue;
          scanned.add(hash);

          const trackerData = trackersByHash.get(hash);
          if (trackerData) {
            this._trackerCache.set(hash, { ...trackerData, lastUpdated: now });
          }

          const peers = peersByHash.get(hash);
          if (peers) {
            this._peerCache.set(hash, { peers, lastUpdated: now });
          }
        }
      }

      const currentHashes = new Set(items.map(i => this._trackerItemHash(i)).filter(Boolean));
      for (const hash of this._trackerCache.keys()) {
        if (!currentHashes.has(hash)) {
          this._trackerCache.delete(hash);
        }
      }
      // Peers are live data: an item not scanned this pass would keep showing
      // old peers and their upload rates. Tracker lists change slowly, so an
      // unscanned item keeps its last one.
      for (const hash of this._peerCache.keys()) {
        if (!currentHashes.has(hash) || !scanned.has(hash)) {
          this._peerCache.delete(hash);
        }
      }
    } catch (err) {
      this.error('❌ Error refreshing tracker/peer cache:', logger.errorDetail(err));
    }
  }

  /**
   * Choose the items to scan this pass.
   *
   * - Nobody reading (no browser, no recent API read): only items never
   *   scanned. History still gets a tracker domain for each new torrent once.
   * - Scope 'active': items the client reports as active, plus any never
   *   scanned. The rest are fetched on demand by refreshTrackersFor().
   * - Otherwise: everything.
   * @param {Array} items
   * @returns {Array}
   */
  _selectTrackerRefreshItems(items) {
    const unseen = (item) => {
      const hash = this._trackerItemHash(item);
      return hash && !this._trackerCache.has(hash);
    };
    if (!hasDemand(this.wss)) {
      return items.filter(unseen);
    }
    if (this._trackerRefreshScope === 'active') {
      return items.filter(item => unseen(item) || this._isTrackerRefreshActive(item));
    }
    return items;
  }

  /**
   * Refresh tracker data for one item if its cached copy is older than a pass,
   * and return the cached tracker list either way. Used when an item is
   * opened, since 'active' scope does not scan idle items on a schedule.
   * @param {string} hash
   * @param {number} [timeoutMs] - Give up waiting and return what is cached
   * @returns {Promise<Array|null>} trackersDetailed, or null if never fetched
   */
  async refreshTrackersFor(hash, timeoutMs = 5000) {
    const h = String(hash || '').toLowerCase();
    const cached = () => this._trackerCache.get(h)?.trackersDetailed || null;
    if (!this.client || !h) return cached();

    const entry = this._trackerCache.get(h);
    if (entry && Date.now() - entry.lastUpdated < 2 * this._trackerRefreshIntervalMs) {
      return cached();
    }

    const fetchOne = (async () => {
      const items = await this._getItemsForTrackerRefresh();
      const item = (items || []).find(i => this._trackerItemHash(i) === h);
      if (!item) return;
      const { trackersByHash } = await this._fetchTrackersAndPeers([item]);
      const trackerData = trackersByHash.get(h);
      if (trackerData) {
        this._trackerCache.set(h, { ...trackerData, lastUpdated: Date.now() });
      }
    })().catch(err => this.warn(`⚠️  On-demand tracker refresh failed for ${h}: ${err.message}`));

    // Caught above, so a fetch that fails after the timeout has nowhere to leak.
    let timer;
    const timeout = new Promise(resolve => { timer = setTimeout(resolve, timeoutMs); });
    await Promise.race([fetchOne, timeout]);
    clearTimeout(timer);
    return cached();
  }

  /**
   * Override in subclass: is this item worth scanning on every pass under
   * 'active' scope? Default: yes, which suits clients that fetch every item in
   * one call anyway.
   * @param {Object} _item - Item from _getItemsForTrackerRefresh()
   * @returns {boolean}
   */
  _isTrackerRefreshActive(_item) {
    return true;
  }

  _trackerItemHash(item) {
    return (item?.hash || item?.hashString || '').toLowerCase();
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
   * Re-resolve cached client-side category IDs. Only clients with positional
   * IDs (aMule) need this; name-keyed clients have nothing to refresh.
   * @returns {Promise<void>}
   */
  async refreshCategoryIds() {
    // no-op for clients with stable (name-keyed) category identities
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
