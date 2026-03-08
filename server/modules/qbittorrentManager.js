/**
 * qBittorrent Client Management Module
 * Handles qBittorrent connection, reconnection, and data retrieval
 */

const QBittorrentClient = require('../lib/qbittorrent/QBittorrentClient');
const BaseClientManager = require('../lib/BaseClientManager');
const logger = require('../lib/logger');
const { parseMagnetUri, parseTorrentBuffer } = require('../lib/torrentUtils');
const { normalizeQBittorrentDownload, extractQBittorrentUploads } = require('../lib/downloadNormalizer');


class QbittorrentManager extends BaseClientManager {
  constructor() {
    super();
    this.lastTorrents = [];
    this.lastStats = null;
    this.cachedListenPort = 0;
  }

  /**
   * Initialize qBittorrent client
   * @returns {Promise<boolean>} True if connection successful
   */
  async initClient() {
    // Prevent concurrent connection attempts
    if (this.connectionInProgress) {
      this.log('⚠️  qBittorrent connection attempt already in progress, skipping...');
      return false;
    }

    // Check if qBittorrent is enabled and configured
    if (!this._clientConfig || !this._clientConfig.enabled) {
      this.log('ℹ️  qBittorrent integration is disabled');
      return false;
    }

    if (!this._clientConfig.host) {
      this.log('⚠️  qBittorrent host not configured');
      return false;
    }

    this.connectionInProgress = true;

    try {
      // Cleanup old client
      if (this.client) {
        this.log('🔄 Cleaning up old qBittorrent client...');
        await this.client.disconnect();
        this.client = null;
      }

      this.log(`🔌 Creating new qBittorrent client (${this._clientConfig.host}:${this._clientConfig.port})...`);

      const newClient = new QBittorrentClient({
        host: this._clientConfig.host,
        port: this._clientConfig.port || 8080,
        username: this._clientConfig.username || 'admin',
        password: this._clientConfig.password || '',
        useSsl: this._clientConfig.useSsl || false
      });

      // Test the connection
      const testResult = await newClient.testConnection();

      if (!testResult.success) {
        throw new Error(testResult.error || 'Connection test failed');
      }

      this.client = newClient;
      this._clearConnectionError();
      this.log(`✅ Connected to qBittorrent ${testResult.version} successfully`);

      // Stop reconnection attempts
      this.clearReconnect();

      // Cache listen port from preferences (not available in server_state)
      try {
        const prefs = await newClient.getPreferences();
        this.cachedListenPort = prefs?.listen_port || 0;
      } catch (err) {
        this.log('⚠️  Could not fetch listen port from preferences:', logger.errorDetail(err));
      }

      // Start tracker cache refresh
      this.startTrackerRefresh();

      // Notify connection listeners
      this._onConnectCallbacks.forEach(cb => cb());

      return true;
    } catch (err) {
      this.log('❌ Failed to connect to qBittorrent:', logger.errorDetail(err));
      this._setConnectionError(err);
      this.client = null;
      this.stopTrackerRefresh();
      return false;
    } finally {
      this.connectionInProgress = false;
    }
  }

  /**
   * Start connection and auto-reconnect
   */
  async startConnection() {
    // Don't start if not enabled
    if (!this._clientConfig || !this._clientConfig.enabled) {
      this.log('ℹ️  qBittorrent integration is disabled, skipping connection');
      return;
    }

    const connected = await this.initClient();
    if (!connected) {
      this.scheduleReconnect(30000);
    }
  }

  /**
   * Check if client is connected
   * @returns {boolean}
   */
  isConnected() {
    return !!this.client && this.client.isConnected();
  }

  /**
   * Get all torrents from qBittorrent
   * @returns {Promise<Array>}
   */
  async getTorrents() {
    if (!this.client) {
      return [];
    }

    try {
      const torrents = await this.client.getTorrents();

      // Merge tracker and peer data from cache
      this._mergeTrackerData(torrents);

      this.lastTorrents = torrents;
      return torrents;
    } catch (err) {
      this.log('❌ Error fetching qBittorrent torrents:', logger.errorDetail(err));
      // Connection might be lost, mark as disconnected
      const errDetail = logger.errorDetail(err);
      if (errDetail.includes('ECONNREFUSED') || errDetail.includes('timeout') || errDetail.includes('403')) {
        this._setConnectionError(err);
        if (this.client) {
          this.client.connected = false;
        }
        this.scheduleReconnect(30000);
      }
      return this.lastTorrents; // Return cached data on error
    }
  }

  /**
   * Return cached torrents or fetch fresh for tracker refresh.
   * @returns {Promise<Array>}
   */
  async _getItemsForTrackerRefresh() {
    return this.lastTorrents.length > 0
      ? this.lastTorrents
      : await this.client.getTorrents();
  }

  /**
   * Fetch tracker and peer data for all torrents.
   * qBittorrent API has no batch endpoint — fetches per-torrent in parallel.
   * @param {Array} items - Torrent objects with .hash
   * @returns {Promise<{ trackersByHash: Map, peersByHash: Map }>}
   */
  async _fetchTrackersAndPeers(items) {
    const trackersByHash = new Map();
    const peersByHash = new Map();

    // Process in batches to avoid overwhelming the qBittorrent daemon
    const BATCH_SIZE = 10;
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async (torrent) => {
        const hash = torrent.hash.toLowerCase();

        try {
          const [trackers, peers] = await Promise.all([
            this.client.getTorrentTrackers(hash).catch(() => []),
            this.client.getTorrentPeers(hash).catch(() => ({}))
          ]);

          trackersByHash.set(hash, { trackersDetailed: trackers });

          // Convert peers object to normalized array
          // Keys are "ip:port" for IPv4 or "[ipv6]:port" for IPv6
          const peersArray = Object.entries(peers).map(([ip, data]) => {
            let address, port;
            if (ip.startsWith('[')) {
              const closeBracket = ip.lastIndexOf(']');
              address = ip.substring(1, closeBracket);
              port = parseInt(ip.substring(closeBracket + 2)) || 0;
            } else {
              const lastColon = ip.lastIndexOf(':');
              address = lastColon > 0 ? ip.substring(0, lastColon) : ip;
              port = lastColon > 0 ? parseInt(ip.substring(lastColon + 1)) || 0 : 0;
            }
            return {
              address,
              port,
              client: data.client || 'Unknown',
              flags: data.flags || '',
              completedPercent: Math.round((data.progress || 0) * 100),
              downloadRate: data.dl_speed || 0,
              uploadRate: data.up_speed || 0,
              downloadTotal: data.downloaded || 0,
              uploadTotal: data.uploaded || 0,
              isEncrypted: !!(data.flags && data.flags.includes('E')),
              isIncoming: !!(data.flags && data.flags.includes('I')),
              country: data.country || '',
              countryCode: data.country_code || '',
            };
          });

          peersByHash.set(hash, peersArray);
        } catch {
          // Individual torrent fetch failed, skip
        }
      }));
    }
    return { trackersByHash, peersByHash };
  }

  /**
   * Get global stats from qBittorrent
   * Returns normalized field names to match rtorrent format
   * @returns {Promise<Object>} { uploadSpeed, downloadSpeed, uploadTotal, downloadTotal }
   */
  async getGlobalStats() {
    if (!this.client) {
      return { uploadSpeed: 0, downloadSpeed: 0, uploadTotal: 0, downloadTotal: 0 };
    }

    try {
      const maindata = await this.client.getGlobalStats();
      const serverState = maindata.server_state || {};
      this.lastStats = serverState;
      // Return normalized field names to match rtorrent format
      // Using all-time totals that persist across qBittorrent restarts
      return {
        uploadSpeed: serverState.up_info_speed || 0,
        downloadSpeed: serverState.dl_info_speed || 0,
        uploadTotal: serverState.alltime_ul || 0,   // All-time total (persists across restarts)
        downloadTotal: serverState.alltime_dl || 0,  // All-time total (persists across restarts)
        connectionStatus: serverState.connection_status || 'disconnected',
        listenPort: this.cachedListenPort
      };
    } catch (err) {
      this.log('❌ Error fetching qBittorrent stats:', logger.errorDetail(err));
      const fallback = this.lastStats || {};
      return {
        uploadSpeed: fallback.up_info_speed || 0,
        downloadSpeed: fallback.dl_info_speed || 0,
        uploadTotal: fallback.alltime_ul || 0,
        downloadTotal: fallback.alltime_dl || 0,
        connectionStatus: fallback.connection_status || 'disconnected',
        listenPort: this.cachedListenPort
      };
    }
  }

  // ============================================================================
  // UNIFIED DATA FETCHING (same interface as all managers)
  // ============================================================================

  /**
   * Fetch and normalize all data from qBittorrent.
   * @returns {Promise<Object>} { downloads, sharedFiles, uploads }
   */
  async fetchData() {
    const rawTorrents = await this.getTorrents();

    if (!rawTorrents || rawTorrents.length === 0) {
      return { downloads: [], sharedFiles: [], uploads: [] };
    }

    // Normalize all torrents
    const downloads = rawTorrents.map(t => normalizeQBittorrentDownload(t));

    // Extract uploads (peers with active upload) from raw data
    const uploads = extractQBittorrentUploads(rawTorrents);

    // Stamp instanceId on all normalized items
    const instanceId = this.instanceId;
    downloads.forEach(d => { d.instanceId = instanceId; });
    uploads.forEach(u => { u.instanceId = instanceId; });

    // For torrent clients, downloads ARE shared files (all torrents seed)
    return { downloads, sharedFiles: downloads, uploads };
  }

  // ============================================================================
  // UNIFIED STATS & NETWORK STATUS (same interface as all managers)
  // ============================================================================

  /**
   * Get raw stats from qBittorrent (alias for getGlobalStats)
   * @returns {Promise<Object>} Raw stats
   */
  async getStats() {
    return await this.getGlobalStats();
  }

  /**
   * Extract normalized metrics from raw qBittorrent stats
   * @param {Object} rawStats - Raw qBittorrent stats (already normalized by getGlobalStats)
   * @returns {Object} { uploadSpeed, downloadSpeed, uploadTotal, downloadTotal }
   */
  extractMetrics(rawStats) {
    return {
      uploadSpeed: rawStats.uploadSpeed || 0,
      downloadSpeed: rawStats.downloadSpeed || 0,
      uploadTotal: rawStats.uploadTotal || 0,
      downloadTotal: rawStats.downloadTotal || 0
    };
  }

  /**
   * Compute network status from raw qBittorrent stats
   * @param {Object} rawStats - Raw qBittorrent stats (already normalized by getGlobalStats)
   * @returns {Object} { status, text, connectionStatus, listenPort }
   */
  getNetworkStatus(rawStats) {
    const connectionStatus = rawStats.connectionStatus || 'disconnected';
    let status, text;
    switch (connectionStatus) {
      case 'connected': status = 'green'; text = 'OK'; break;
      case 'firewalled': status = 'yellow'; text = 'Firewalled'; break;
      default: status = 'red'; text = 'Disconnected'; break;
    }
    return {
      status,
      text,
      connectionStatus,
      listenPort: rawStats.listenPort || null
    };
  }

  /**
   * Extract normalized history metadata from a raw qBittorrent download item
   * @param {Object} item - Raw qBittorrent download data
   * @returns {Object} Normalized metadata for history DB
   */
  extractHistoryMetadata(item) {
    return {
      hash: item.hash?.toLowerCase(),
      instanceId: item.instanceId,
      size: item.size,
      name: item.name,
      downloaded: item.downloaded || 0,
      uploaded: item.uploadTotal || 0,
      ratio: item.ratio || 0,
      trackerDomain: item.trackerDomain || null,
      directory: item.directory || null,
      multiFile: item.isMultiFile || false,
      category: item.category || null
    };
  }

  // ============================================================================
  // UNIFIED DOWNLOAD CONTROL (same interface as all managers)
  // ============================================================================

  /**
   * Pause a download
   * @param {string} hash - Torrent hash
   */
  async pause(hash) {
    return await this.stopDownload(hash);
  }

  /**
   * Resume a download
   * @param {string} hash - Torrent hash
   */
  async resume(hash) {
    return await this.startDownload(hash);
  }

  /**
   * Hard stop a download (qBittorrent: same as pause, no separate hard-stop)
   * @param {string} hash - Torrent hash
   */
  async stop(hash) {
    return await this.pause(hash);
  }

  /**
   * Update client's view of the download directory (uses native setLocation)
   * @param {string} hash - Torrent hash
   * @param {string} path - New directory path
   */
  async updateDirectory(hash, path) {
    if (!this.client) {
      throw new Error('qBittorrent not connected');
    }
    await this.client.setLocation(hash, path);
  }

  // ============================================================================
  // INTERNAL DOWNLOAD CONTROL
  // ============================================================================

  /**
   * Start a download (resume)
   * @param {string} hash - Torrent hash
   */
  async startDownload(hash) {
    if (!this.client) {
      throw new Error('qBittorrent not connected');
    }
    await this.client.resumeTorrent(hash);
  }

  /**
   * Stop/pause a download
   * @param {string} hash - Torrent hash
   */
  async stopDownload(hash) {
    if (!this.client) {
      throw new Error('qBittorrent not connected');
    }
    await this.client.pauseTorrent(hash);
  }

  /**
   * Remove a download from qBittorrent
   * @param {string} hash - Torrent hash
   * @param {boolean} deleteFiles - Whether to delete files
   */
  async removeDownload(hash, deleteFiles = false) {
    if (!this.client) {
      throw new Error('qBittorrent not connected');
    }

    await this.client.deleteTorrent(hash, deleteFiles);

    // Track deletion in history
    this.trackDeletion(hash);
  }

  /**
   * Delete an item (qBittorrent API handles file deletion natively)
   * @param {string} hash - Torrent hash
   * @param {Object} options - { deleteFiles }
   * @returns {Promise<Object>} { success, pathsToDelete }
   */
  async deleteItem(hash, { deleteFiles } = {}) {
    await this.removeDownload(hash, !!deleteFiles);
    return { success: true, pathsToDelete: [] };
  }

  /**
   * Build qBittorrent-native options from unified format.
   * Unified: { categoryName, savePath, priority, start, username }
   * qBittorrent: { category, savepath, paused }
   */
  _buildAddOptions(options) {
    const category = options.categoryName ?? options.category ?? '';
    const savePath = options.savePath ?? options.savepath ?? options.directory;
    const addOptions = {
      category,
      paused: options.start === false
    };
    if (savePath) {
      addOptions.savepath = savePath;
    }
    return addOptions;
  }

  /**
   * Add a torrent from magnet link
   * @param {string} magnetUri - Magnet URI
   * @param {Object} options - Unified options { categoryName, savePath, priority, start, username }
   */
  async addMagnet(magnetUri, options = {}) {
    if (!this.client) {
      throw new Error('qBittorrent not connected');
    }

    const addOptions = this._buildAddOptions(options);
    await this.client.addMagnet(magnetUri, addOptions);

    // Track in history
    const { hash, name } = parseMagnetUri(magnetUri);
    if (hash) {
      this.trackDownload(hash, name || 'Magnet download', null, options.username, addOptions.category || null);
    }
  }

  /**
   * Add a torrent from raw data (Buffer)
   * @param {Buffer} torrentData - Raw .torrent file contents
   * @param {Object} options - Unified options { categoryName, savePath, priority, start, username }
   */
  async addTorrentRaw(torrentData, options = {}) {
    if (!this.client) {
      throw new Error('qBittorrent not connected');
    }

    const addOptions = this._buildAddOptions(options);
    await this.client.addTorrent(torrentData, addOptions);

    // Track in history
    const { hash, name, size } = parseTorrentBuffer(torrentData);
    if (hash) {
      this.trackDownload(hash, name || 'Torrent download', size, options.username, addOptions.category || null);
    }
  }

  /**
   * Set category for a download
   * @param {string} hash - Torrent hash
   * @param {string} category - Category name
   */
  async setCategory(hash, category) {
    if (!this.client) {
      throw new Error('qBittorrent not connected');
    }
    await this.client.setCategory(hash, category);
  }

  /**
   * Set category/label for a download (unified interface)
   * @param {string} hash - Torrent hash
   * @param {Object} options - { categoryName }
   * @returns {Promise<Object>} { success }
   */
  async setCategoryOrLabel(hash, { categoryName } = {}) {
    const categoryValue = categoryName === 'Default' ? '' : (categoryName || '');
    await this.setCategory(hash, categoryValue);
    return { success: true };
  }

  /**
   * Get files for a torrent
   * @param {string} hash - Torrent hash
   * @returns {Promise<Array>} Array of file objects
   */
  async getFiles(hash) {
    if (!this.client) {
      throw new Error('qBittorrent not connected');
    }
    return await this.client.getTorrentFiles(hash);
  }

  /**
   * Get all categories from qBittorrent
   * @returns {Promise<Object>} Categories object { name: { name, savePath } }
   */
  async getCategories() {
    if (!this.client) {
      throw new Error('qBittorrent not connected');
    }
    return await this.client.getCategories();
  }

  /**
   * Create a category in qBittorrent
   * @param {Object} opts - { name, path }
   * @returns {Promise<void>}
   */
  async createCategory({ name, path = '' } = {}) {
    if (!this.client) {
      throw new Error('qBittorrent not connected');
    }
    await this.client.createCategory(name, path);
    this.log(`📁 Created category "${name}" in qBittorrent${path ? ` (path: ${path})` : ''}`);
  }

  /**
   * Edit/update a category in qBittorrent (update its savePath) with read-back verification.
   * @param {Object} opts - { name, path }
   * @returns {Promise<Object>} { success, verified, mismatches }
   */
  async editCategory({ name, path = '' } = {}) {
    if (!this.client) {
      throw new Error('qBittorrent not connected');
    }

    try {
      // Check current state — skip if path unchanged, create if missing
      const existing = await this.getCategories();
      const existingCat = existing?.[name];

      if (!existingCat) {
        this.log(`📁 Category "${name}" not found in qBittorrent, creating it`);
        await this.createCategory({ name, path });
      } else if ((existingCat.savePath || '') !== path) {
        await this.client.editCategory(name, path);
        this.log(`📁 Updated category "${name}" in qBittorrent (path: ${path})`);
      } else {
        return { success: true, verified: true, mismatches: [] };
      }

      // Verify by reading back
      const categories = await this.getCategories();
      const savedCat = categories?.[name];

      if (!savedCat) {
        this.log(`⚠️ Verify: Category "${name}" not found in qBittorrent after update`);
        return { success: true, verified: false, mismatches: ['Category not found after update'] };
      }

      const mismatches = [];
      const savedPath = savedCat.savePath || '';
      if (savedPath !== path) mismatches.push(`path: expected "${path}", got "${savedPath}"`);

      if (mismatches.length > 0) {
        this.log(`⚠️ Verify: Category "${name}" mismatches: ${mismatches.join(', ')}`);
        return { success: true, verified: false, mismatches };
      }

      this.log(`✅ Verify: Category "${name}" saved correctly in qBittorrent`);
      return { success: true, verified: true, mismatches: [] };
    } catch (err) {
      this.log(`⚠️ Failed to update category in qBittorrent: ${err.message}`);
      return { success: false, verified: false, mismatches: [err.message] };
    }
  }

  /**
   * Ensure a category exists in qBittorrent (create if missing).
   * @param {Object} opts - { name, path }
   * @returns {Promise<Object>} { success: true }
   */
  async ensureCategoryExists({ name, path = '' } = {}) {
    if (!this.client) throw new Error('qBittorrent not connected');

    try {
      const categories = await this.getCategories();
      if (!categories || !categories[name]) {
        await this.createCategory({ name, path });
      }
    } catch (err) {
      this.log(`⚠️ Failed to ensure category in qBittorrent: ${err.message}`);
    }
    return { success: true };
  }

  /**
   * Ensure multiple categories exist in qBittorrent (batch-aware: fetches existing list once).
   * @param {Array<Object>} categories - Array of { name, path }
   * @returns {Promise<Array<Object>>} Results per created category: [{ name }]
   */
  async ensureCategoriesBatch(categories) {
    if (!this.client || !categories?.length) return [];

    const results = [];
    try {
      const qbCategories = await this.getCategories() || {};

      for (const cat of categories) {
        if (qbCategories[cat.name]) continue;

        try {
          await this.createCategory({ name: cat.name, path: cat.path || '' });
          results.push({ name: cat.name });
          this.log(`📤 Propagated category "${cat.name}" to qBittorrent`);
        } catch (err) {
          this.log(`⚠️ Failed to propagate "${cat.name}" to qBittorrent: ${err.message}`);
        }
      }
    } catch (err) {
      this.log(`⚠️ Failed to fetch qBittorrent categories for batch propagation: ${err.message}`);
    }
    return results;
  }

  /**
   * Delete a category from qBittorrent
   * @param {Object} opts - { name }
   * @returns {Promise<void>}
   */
  async deleteCategory({ name } = {}) {
    if (!this.client) {
      throw new Error('qBittorrent not connected');
    }
    await this.client.removeCategories(name);
    this.log(`🗑️  Removed category from qBittorrent: ${name}`);
  }

  /**
   * Rename a category in qBittorrent with verification.
   * qBittorrent has no native rename — creates new, migrates torrents, deletes old.
   * @param {Object} opts - { oldName, newName, path }
   * @returns {Promise<Object>} { success, verified, mismatches }
   */
  async renameCategory({ oldName, newName, path = '' } = {}) {
    if (!this.client) throw new Error('qBittorrent not connected');

    try {
      // 1. Create new category
      await this.client.createCategory(newName, path);

      // 2. Find all torrents in the old category and reassign
      const torrents = await this.client.getTorrents({ category: oldName });
      if (torrents && torrents.length > 0) {
        const hashes = torrents.map(t => t.hash).join('|');
        await this.client.setCategory(hashes, newName);
        this.log(`🔄 Migrated ${torrents.length} torrent(s) from "${oldName}" to "${newName}"`);
      }

      // 3. Delete old category
      await this.client.removeCategories(oldName);
      this.log(`📤 Renamed category "${oldName}" → "${newName}" in qBittorrent`);

      // Verify by reading back
      const categories = await this.getCategories();
      const mismatches = [];
      if (!categories?.[newName]) mismatches.push(`New category "${newName}" not found after rename`);
      if (categories?.[oldName]) mismatches.push(`Old category "${oldName}" still exists after rename`);

      if (mismatches.length > 0) {
        this.log(`⚠️ Verify: Rename "${oldName}" → "${newName}" mismatches: ${mismatches.join(', ')}`);
        return { success: true, verified: false, mismatches };
      }

      this.log(`✅ Verify: Category renamed "${oldName}" → "${newName}" correctly in qBittorrent`);
      return { success: true, verified: true, mismatches: [] };
    } catch (err) {
      this.log(`⚠️ Failed to rename category in qBittorrent: ${err.message}`);
      return { success: false, verified: false, mismatches: [err.message] };
    }
  }

  /**
   * Get the default save path from qBittorrent preferences
   * @returns {Promise<string|null>} Default save path or null
   */
  async getDefaultDirectory() {
    if (!this.client) {
      return null;
    }
    try {
      const prefs = await this.client.getPreferences();
      return prefs?.save_path || null;
    } catch (err) {
      this.log('Failed to get qBittorrent default directory:', logger.errorDetail(err));
      return null;
    }
  }

  /**
   * Get application log as formatted text
   * @returns {Promise<string>} Formatted log string
   */
  async getLog() {
    if (!this.client) {
      return '';
    }

    try {
      const entries = await this.client.getLog();
      if (!Array.isArray(entries) || entries.length === 0) {
        return '';
      }

      const typeMap = { 1: 'NORMAL', 2: 'INFO', 4: 'WARNING', 8: 'CRITICAL' };

      return entries.map(entry => {
        const date = new Date(entry.timestamp * 1000);
        const ts = date.toLocaleString();
        const level = typeMap[entry.type] || 'UNKNOWN';
        return `[${ts}] [${level}] ${entry.message}`;
      }).join('\n');
    } catch (err) {
      this.log('❌ Error fetching qBittorrent log:', logger.errorDetail(err));
      return '';
    }
  }

  /**
   * Perform category sync when this qBittorrent instance connects.
   * Imports qBit categories into app, pushes app categories to qBit,
   * and updates qBit paths to match app (app is source of truth).
   * @param {Object} categoryManager - CategoryManager instance
   */
  async onConnectSync(categoryManager) {
    const defaultDir = await this.getDefaultDirectory();
    if (defaultDir) {
      categoryManager.setClientDefaultPath(this.instanceId, defaultDir);
    }

    let qbCategories = await this.getCategories();
    if (!qbCategories || typeof qbCategories !== 'object') qbCategories = {};
    const categoryNames = Object.keys(qbCategories);

    // Phase 1: Import qBittorrent categories into app
    let createdInApp = 0;
    for (const name of categoryNames) {
      if (!name) continue;
      if (categoryManager.getByName(name)) continue;
      const savePath = qbCategories[name]?.savePath || null;
      categoryManager.importCategory({
        name, path: savePath,
        comment: 'Auto-created from qBittorrent category'
      });
      createdInApp++;
    }
    if (createdInApp > 0) await categoryManager.save();

    // Phase 2: Push app categories to qBittorrent + update paths
    let createdInQb = 0, updatedInQb = 0;
    for (const [name, category] of categoryManager.getCategoriesSnapshot().entries()) {
      if (name === 'Default') continue;
      const qbCat = qbCategories[name];
      const appPath = category.path || '';

      if (!qbCat) {
        try {
          await this.createCategory({ name, path: appPath });
          createdInQb++;
          this.log(`📤 Created category "${name}" in qBittorrent (path: ${appPath})`);
        } catch (err) {
          this.log(`⚠️ Failed to create category "${name}" in qBittorrent: ${err.message}`);
        }
      } else if (qbCat.savePath !== appPath) {
        try {
          await this.editCategory({ name, path: appPath });
          updatedInQb++;
          this.log(`🔄 Updated qBittorrent category "${name}" path: ${qbCat.savePath} -> ${appPath}`);
        } catch (err) {
          this.log(`⚠️ Failed to update category "${name}" in qBittorrent: ${err.message}`);
        }
      }
    }

    this.log(`📊 qBittorrent sync complete: ${createdInApp} imported, ${createdInQb} pushed, ${updatedInQb} updated`);

    // Propagate all app categories to other connected clients that may not have them
    await categoryManager.propagateToOtherClients(this.instanceId);
    await categoryManager.validateAllPaths();
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    this.log('🛑 Shutting down qBittorrent connection...');

    // Stop tracker refresh
    this.stopTrackerRefresh();

    // Stop reconnection attempts
    this.clearReconnect();

    // Wait for any ongoing connection attempts
    let waitAttempts = 0;
    while (this.connectionInProgress && waitAttempts < 50) {
      await new Promise(resolve => setTimeout(resolve, 100));
      waitAttempts++;
    }

    // Disconnect client
    if (this.client) {
      try {
        await this.client.disconnect();
      } catch (err) {
        this.log('⚠️  Error during qBittorrent client shutdown:', logger.errorDetail(err));
      }
      this.client = null;
    }

    this.connectionInProgress = false;
    this.log('✅ qBittorrent connection shutdown complete');
  }
}

module.exports = { QbittorrentManager };
