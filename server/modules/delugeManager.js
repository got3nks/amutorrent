/**
 * Deluge Client Management Module
 * Handles Deluge connection, reconnection, and data retrieval
 */

const DelugeClient = require('../lib/deluge/DelugeClient');
const BaseClientManager = require('../lib/BaseClientManager');
const logger = require('../lib/logger');
const { parseMagnetUri, parseTorrentBuffer } = require('../lib/torrentUtils');
const { normalizeDelugeDownload } = require('../lib/downloadNormalizer');


class DelugeManager extends BaseClientManager {
  constructor() {
    super();
    this.lastTorrents = [];
    this.lastStats = null;
    this.cachedListenPort = 0;
    this._labelPluginAvailable = false;
  }

  /**
   * Initialize Deluge client
   * @returns {Promise<boolean>} True if connection successful
   */
  async initClient() {
    // Prevent concurrent connection attempts
    if (this.connectionInProgress) {
      this.log('  Deluge connection attempt already in progress, skipping...');
      return false;
    }

    // Check if Deluge is enabled and configured
    if (!this._clientConfig || !this._clientConfig.enabled) {
      this.log('  Deluge integration is disabled');
      return false;
    }

    if (!this._clientConfig.host) {
      this.log('  Deluge host not configured');
      return false;
    }

    this.connectionInProgress = true;

    try {
      // Cleanup old client
      if (this.client) {
        this.log('Cleaning up old Deluge client...');
        await this.client.disconnect();
        this.client = null;
      }

      this.log(`Creating new Deluge client (${this._clientConfig.host}:${this._clientConfig.port})...`);

      const newClient = new DelugeClient({
        host: this._clientConfig.host,
        port: this._clientConfig.port || 8112,
        path: this._clientConfig.path || '',
        password: this._clientConfig.password || 'deluge',
        useSsl: this._clientConfig.useSsl || false
      });

      // Test the connection
      const testResult = await newClient.testConnection();

      if (!testResult.success) {
        throw new Error(testResult.error || 'Connection test failed');
      }

      this.client = newClient;
      this._clearConnectionError();
      this.log(`Connected to Deluge ${testResult.version} successfully`);

      // Stop reconnection attempts
      this.clearReconnect();

      // Ensure Label plugin is enabled (auto-enable if available but not active)
      try {
        this._labelPluginAvailable = await newClient.ensureLabelPluginEnabled();
        if (this._labelPluginAvailable) {
          this.log('Label plugin: enabled');
        } else {
          this.log('Label plugin: not available (plugin not installed on daemon)');
        }
      } catch (err) {
        this.log('Could not check/enable Label plugin:', logger.errorDetail(err));
        this._labelPluginAvailable = false;
      }

      // Cache listen port
      try {
        this.cachedListenPort = await newClient.getListenPort();
      } catch (err) {
        this.log('Could not fetch listen port:', logger.errorDetail(err));
      }

      // Start tracker cache refresh
      this.startTrackerRefresh();

      // Notify connection listeners
      this._onConnectCallbacks.forEach(cb => cb());

      return true;
    } catch (err) {
      this.log('Failed to connect to Deluge:', logger.errorDetail(err));
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
    if (!this._clientConfig || !this._clientConfig.enabled) {
      this.log('Deluge integration is disabled, skipping connection');
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

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  /**
   * Get all torrents from Deluge
   * @returns {Promise<Array>} Array of normalized torrent objects
   */
  async getTorrents() {
    if (!this.client) {
      return [];
    }

    try {
      const result = await this.client.getTorrents();
      const torrents = result.torrents || {};

      // Also capture stats from update_ui
      if (result.stats) {
        this.lastStats = result.stats;
      }

      // Convert hash-keyed object to array, normalize each
      const torrentArray = Object.entries(torrents).map(([hash, data]) => ({
        hash: hash.toLowerCase(),
        ...data
      }));

      // Merge tracker and peer data from cache
      this._mergeTrackerData(torrentArray);

      this.lastTorrents = torrentArray;
      return torrentArray;
    } catch (err) {
      this.log('Error fetching Deluge torrents:', logger.errorDetail(err));
      this._setConnectionError(err);
      if (this.client) {
        this.client.connected = false;
      }
      this.scheduleReconnect(30000);
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
      : (await this._fetchTorrentList());
  }

  /**
   * Fetch raw torrent list (for tracker refresh when no cached data).
   * @returns {Promise<Array>}
   */
  async _fetchTorrentList() {
    try {
      const result = await this.client.getTorrents();
      const torrents = result.torrents || {};
      return Object.entries(torrents).map(([hash, data]) => ({
        hash: hash.toLowerCase(),
        ...data
      }));
    } catch {
      return [];
    }
  }

  /**
   * Fetch tracker and peer data for all torrents.
   * Deluge: fetches per-torrent status with tracker/peer fields.
   * @param {Array} items - Torrent objects with .hash
   * @returns {Promise<{ trackersByHash: Map, peersByHash: Map }>}
   */
  async _fetchTrackersAndPeers(items) {
    const trackersByHash = new Map();
    const peersByHash = new Map();

    const peerFields = [
      'peers', 'trackers', 'tracker_host'
    ];

    // Process in batches to avoid overwhelming the Deluge daemon
    const BATCH_SIZE = 10;
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async (torrent) => {
        const hash = torrent.hash.toLowerCase();

        try {
          const status = await this.client.getTorrentStatus(hash, peerFields);

          // Trackers
          const trackers = status.trackers || [];
          const trackerUrls = trackers
            .map(t => t.url || t)
            .filter(url => typeof url === 'string' && url.length > 0);
          trackersByHash.set(hash, { trackersDetailed: trackers, trackers: trackerUrls });

          // Peers — Deluge returns peers as array of objects
          const rawPeers = status.peers || [];
          const peersArray = rawPeers.map(p => ({
            address: p.ip || '',
            port: p.port || 0,
            client: p.client || 'Unknown',
            flags: '',
            completedPercent: Math.round((p.progress || 0) * 100),
            downloadRate: p.down_speed || 0,
            uploadRate: p.up_speed || 0,
            downloadTotal: 0,
            uploadTotal: 0,
            isEncrypted: !!(p.is_encrypted),
            isIncoming: !!(p.is_incoming || p.direction === 'Incoming'),
            country: p.country || '',
            countryCode: ''
          }));

          peersByHash.set(hash, peersArray);
        } catch {
          // Individual torrent fetch failed, skip
        }
      }));
    }
    return { trackersByHash, peersByHash };
  }

  /**
   * Get global stats from Deluge
   * @returns {Promise<Object>} { uploadSpeed, downloadSpeed, uploadTotal, downloadTotal, ... }
   */
  async getGlobalStats() {
    if (!this.client) {
      return { uploadSpeed: 0, downloadSpeed: 0, uploadTotal: 0, downloadTotal: 0 };
    }

    try {
      const sessionStatus = await this.client.getSessionStatus();
      // Update cached stats
      this.lastStats = sessionStatus;

      return {
        uploadSpeed: sessionStatus.payload_upload_rate || sessionStatus.upload_rate || 0,
        downloadSpeed: sessionStatus.payload_download_rate || sessionStatus.download_rate || 0,
        uploadTotal: sessionStatus.total_upload || 0,
        downloadTotal: sessionStatus.total_download || 0,
        dhtNodes: sessionStatus.dht_nodes || 0,
        hasIncoming: sessionStatus.has_incoming_connections || false,
        listenPort: this.cachedListenPort
      };
    } catch (err) {
      this.log('❌ Error fetching Deluge stats:', logger.errorDetail(err));
      this._setConnectionError(err);
      if (this.client) this.client.connected = false;
      this.scheduleReconnect(30000);
      return {
        uploadSpeed: 0,
        downloadSpeed: 0,
        uploadTotal: 0,
        downloadTotal: 0,
        listenPort: this.cachedListenPort
      };
    }
  }

  // ============================================================================
  // UNIFIED DATA FETCHING (same interface as all managers)
  // ============================================================================

  /**
   * Fetch and normalize all data from Deluge.
   * @returns {Promise<Object>} { downloads, sharedFiles, uploads }
   */
  async fetchData() {
    const rawTorrents = await this.getTorrents();

    if (!rawTorrents || rawTorrents.length === 0) {
      return { downloads: [], sharedFiles: [] };
    }

    // Normalize all torrents (peers already embedded with role: 'peer')
    const downloads = rawTorrents.map(t => normalizeDelugeDownload(t.hash, t));

    // Stamp instanceId on all normalized items
    const instanceId = this.instanceId;
    downloads.forEach(d => { d.instanceId = instanceId; });

    // For torrent clients, downloads ARE shared files (all torrents seed)
    return { downloads, sharedFiles: downloads };
  }

  // ============================================================================
  // UNIFIED STATS & NETWORK STATUS (same interface as all managers)
  // ============================================================================

  /**
   * Get raw stats from Deluge (alias for getGlobalStats)
   * @returns {Promise<Object>} Raw stats
   */
  async getStats() {
    return await this.getGlobalStats();
  }

  /**
   * Extract normalized metrics from raw Deluge stats
   * @param {Object} rawStats - Raw stats (already normalized by getGlobalStats)
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
   * Compute network status from raw Deluge stats
   * @param {Object} rawStats - Raw stats (already normalized by getGlobalStats)
   * @returns {Object} { status, text, connectionStatus, listenPort }
   */
  getNetworkStatus(rawStats) {
    const hasIncoming = rawStats.hasIncoming || false;
    let status, text, connectionStatus;

    if (hasIncoming) {
      status = 'green';
      text = 'OK';
      connectionStatus = 'connected';
    } else if (rawStats.dhtNodes > 0) {
      status = 'yellow';
      text = 'No incoming';
      connectionStatus = 'firewalled';
    } else {
      status = 'red';
      text = 'Disconnected';
      connectionStatus = 'disconnected';
    }

    return {
      status,
      text,
      connectionStatus,
      listenPort: rawStats.listenPort || null
    };
  }

  /**
   * Extract normalized history metadata from a normalized Deluge download item
   * @param {Object} item - Normalized Deluge download data
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
    if (!this.client) throw new Error('Deluge not connected');
    await this.client.pauseTorrents(hash);
  }

  /**
   * Resume a download
   * @param {string} hash - Torrent hash
   */
  async resume(hash) {
    if (!this.client) throw new Error('Deluge not connected');
    await this.client.resumeTorrents(hash);
  }

  /**
   * Hard stop a download (Deluge: same as pause)
   * @param {string} hash - Torrent hash
   */
  async stop(hash) {
    return await this.pause(hash);
  }

  /**
   * Update client's view of the download directory (uses native moveStorage)
   * @param {string} hash - Torrent hash
   * @param {string} path - New directory path
   */
  async updateDirectory(hash, path) {
    if (!this.client) throw new Error('Deluge not connected');
    await this.client.moveStorage(hash, path);
  }

  /**
   * Remove a download from Deluge
   * @param {string} hash - Torrent hash
   * @param {boolean} deleteFiles - Whether to delete files
   */
  async removeDownload(hash, deleteFiles = false) {
    if (!this.client) throw new Error('Deluge not connected');
    await this.client.removeTorrent(hash, deleteFiles);
    this.trackDeletion(hash);
  }

  /**
   * Delete an item (Deluge API handles file deletion natively)
   * @param {string} hash - Torrent hash
   * @param {Object} options - { deleteFiles }
   * @returns {Promise<Object>} { success, pathsToDelete }
   */
  async deleteItem(hash, { deleteFiles } = {}) {
    await this.removeDownload(hash, !!deleteFiles);
    return { success: true, pathsToDelete: [] };
  }

  // ============================================================================
  // ADD DOWNLOADS
  // ============================================================================

  /**
   * Build Deluge-native options from unified format.
   * Unified: { categoryName, savePath, priority, start, username }
   * Deluge: { download_location, add_paused }
   */
  _buildAddOptions(options) {
    const label = options.categoryName ?? options.category ?? '';
    const savePath = options.savePath ?? options.directory;
    const addOptions = {};

    if (savePath) {
      addOptions.download_location = savePath;
    }
    if (options.start === false) {
      addOptions.add_paused = true;
    }

    return { addOptions, label };
  }

  /**
   * Add a torrent from magnet link
   * @param {string} magnetUri - Magnet URI
   * @param {Object} options - Unified options { categoryName, savePath, priority, start, username }
   */
  async addMagnet(magnetUri, options = {}) {
    if (!this.client) throw new Error('Deluge not connected');

    const { addOptions, label } = this._buildAddOptions(options);
    const hash = await this.client.addTorrentMagnet(magnetUri, addOptions);

    // Set label if Label plugin is available
    if (label && this._labelPluginAvailable && hash) {
      try {
        await this._ensureLabelExists(label);
        await this.client.setTorrentLabel(hash, label.toLowerCase());
      } catch (err) {
        this.log(`Could not set label "${label}" for magnet: ${err.message}`);
      }
    }

    // Track in history
    const parsed = parseMagnetUri(magnetUri);
    if (parsed.hash) {
      this.trackDownload(parsed.hash, parsed.name || 'Magnet download', null, options.username, label || null);
    }
  }

  /**
   * Add a torrent from raw data (Buffer)
   * @param {Buffer} torrentData - Raw .torrent file contents
   * @param {Object} options - Unified options { categoryName, savePath, priority, start, username }
   */
  async addTorrentRaw(torrentData, options = {}) {
    if (!this.client) throw new Error('Deluge not connected');

    const { addOptions, label } = this._buildAddOptions(options);
    const b64 = torrentData.toString('base64');
    const hash = await this.client.addTorrentFile('torrent.torrent', b64, addOptions);

    // Set label if Label plugin is available
    if (label && this._labelPluginAvailable && hash) {
      try {
        await this._ensureLabelExists(label);
        await this.client.setTorrentLabel(hash, label.toLowerCase());
      } catch (err) {
        this.log(`Could not set label "${label}" for torrent: ${err.message}`);
      }
    }

    // Track in history
    const parsed = parseTorrentBuffer(torrentData);
    if (parsed.hash) {
      this.trackDownload(parsed.hash, parsed.name || 'Torrent download', parsed.size, options.username, label || null);
    }
  }

  // ============================================================================
  // CATEGORY / LABEL MANAGEMENT
  // ============================================================================

  /**
   * Set category/label for a download (unified interface)
   * @param {string} hash - Torrent hash
   * @param {Object} options - { categoryName }
   * @returns {Promise<Object>} { success }
   */
  async setCategoryOrLabel(hash, { categoryName } = {}) {
    if (!this.client) throw new Error('Deluge not connected');

    const labelValue = categoryName === 'Default' ? '' : (categoryName || '');

    if (this._labelPluginAvailable) {
      if (labelValue) {
        await this._ensureLabelExists(labelValue);
      }
      await this.client.setTorrentLabel(hash, labelValue.toLowerCase());
    }

    return { success: true };
  }

  /**
   * Ensure a label exists in Deluge (create if missing).
   * @param {string} name - Label name
   */
  async _ensureLabelExists(name) {
    if (!this._labelPluginAvailable || !name) return;

    try {
      const existing = await this.client.getLabels();
      const lowerName = name.toLowerCase();
      if (!existing.includes(lowerName)) {
        await this.client.addLabel(lowerName);
        this.log(`Created label "${lowerName}" in Deluge`);
      }
    } catch (err) {
      this.log(`Failed to ensure label "${name}": ${err.message}`);
    }
  }

  /**
   * Get all labels from Deluge (mapped to category format)
   * @returns {Promise<Object>} Labels mapped as { name: { name, savePath: '' } }
   */
  async getCategories() {
    if (!this.client || !this._labelPluginAvailable) {
      return {};
    }

    try {
      const labels = await this.client.getLabels();
      const result = {};
      for (const label of labels) {
        result[label] = { name: label, savePath: '' };
      }
      return result;
    } catch (err) {
      this.log('Error fetching Deluge labels:', logger.errorDetail(err));
      return {};
    }
  }

  /**
   * Create a label in Deluge
   * @param {Object} opts - { name }
   * @returns {Promise<void>}
   */
  async createCategory({ name } = {}) {
    if (!this.client || !this._labelPluginAvailable) return;

    await this.client.addLabel(name.toLowerCase());
    this.log(`Created label "${name}" in Deluge`);
  }

  /**
   * Delete a label from Deluge
   * @param {Object} opts - { name }
   * @returns {Promise<void>}
   */
  async deleteCategory({ name } = {}) {
    if (!this.client || !this._labelPluginAvailable) return;

    await this.client.removeLabel(name.toLowerCase());
    this.log(`Removed label "${name}" from Deluge`);
  }

  /**
   * Ensure a label exists in Deluge (create if missing).
   * @param {Object} opts - { name }
   * @returns {Promise<Object>} { success: true }
   */
  async ensureCategoryExists({ name } = {}) {
    if (!this.client || !this._labelPluginAvailable) return { success: true };

    await this._ensureLabelExists(name);
    return { success: true };
  }

  /**
   * Ensure multiple labels exist in Deluge (batch-aware).
   * @param {Array<Object>} categories - Array of { name }
   * @returns {Promise<Array<Object>>} Results per created label
   */
  async ensureCategoriesBatch(categories) {
    if (!this.client || !this._labelPluginAvailable || !categories?.length) return [];

    const results = [];
    try {
      const existing = await this.client.getLabels();
      const existingSet = new Set(existing);

      for (const cat of categories) {
        const lowerName = cat.name.toLowerCase();
        if (existingSet.has(lowerName)) continue;

        try {
          await this.client.addLabel(lowerName);
          results.push({ name: cat.name });
          this.log(`Propagated label "${cat.name}" to Deluge`);
        } catch (err) {
          this.log(`Failed to propagate "${cat.name}" to Deluge: ${err.message}`);
        }
      }
    } catch (err) {
      this.log(`Failed to fetch Deluge labels for batch propagation: ${err.message}`);
    }
    return results;
  }

  // ============================================================================
  // FILES
  // ============================================================================

  /**
   * Get files for a torrent (flattened from tree structure)
   * @param {string} hash - Torrent hash
   * @returns {Promise<Array>} Array of file objects
   */
  async getFiles(hash) {
    if (!this.client) throw new Error('Deluge not connected');

    const fileTree = await this.client.getTorrentFiles(hash);
    return this._flattenFileTree(fileTree);
  }

  /**
   * Flatten Deluge's nested file tree into a flat array.
   * Deluge returns files as { type: "dir", contents: { ... } } or { type: "file", ... }
   * @param {Object} tree - Deluge file tree
   * @param {string} prefix - Path prefix for recursion
   * @returns {Array} Flat array of { name, size, progress, priority, index }
   */
  _flattenFileTree(tree, prefix = '') {
    const files = [];
    if (!tree || typeof tree !== 'object') return files;

    // Handle { contents: { ... } } wrapper
    const contents = tree.contents || tree;

    for (const [name, entry] of Object.entries(contents)) {
      const fullPath = prefix ? `${prefix}/${name}` : name;

      if (entry.type === 'dir' || entry.contents) {
        // Directory — recurse
        files.push(...this._flattenFileTree(entry, fullPath));
      } else {
        // File
        // Deluge priority: 0=Do not download, 1=Normal, 5=High, 7=Max
        // Normalized:     0=Off,              1=Normal, 2=High
        const rawPrio = entry.priority || 1;
        files.push({
          path: fullPath,
          size: entry.size || 0,
          progress: entry.progress != null ? (entry.progress * 100) : 0,
          priority: rawPrio === 0 ? 0 : rawPrio >= 5 ? 2 : 1,
          index: entry.index ?? files.length
        });
      }
    }

    return files;
  }

  // ============================================================================
  // SYNC
  // ============================================================================

  /**
   * Perform label sync when this Deluge instance connects.
   * Imports Deluge labels into app, pushes app categories to Deluge.
   * @param {Object} categoryManager - CategoryManager instance
   */
  async onConnectSync(categoryManager) {
    // Register default download path
    const defaultDir = await this.getDefaultDirectory();
    if (defaultDir) {
      categoryManager.setClientDefaultPath(this.instanceId, defaultDir);
    }

    if (!this._labelPluginAvailable) {
      this.log('Label plugin not available, skipping category sync');
      await categoryManager.propagateToOtherClients(this.instanceId);
      return;
    }

    let delugeLabels;
    try {
      delugeLabels = await this.client.getLabels();
    } catch (err) {
      this.log(`Failed to fetch labels for sync: ${err.message}`);
      return;
    }

    // Phase 1: Import Deluge labels into app
    let createdInApp = 0;
    for (const label of delugeLabels) {
      if (!label) continue;
      if (categoryManager.getByName(label)) continue;
      categoryManager.importCategory({
        name: label,
        comment: 'Auto-created from Deluge label'
      });
      createdInApp++;
    }
    if (createdInApp > 0) await categoryManager.save();

    // Phase 2: Push app categories to Deluge as labels
    let createdInDeluge = 0;
    const existingSet = new Set(delugeLabels);
    for (const [name] of categoryManager.getCategoriesSnapshot().entries()) {
      if (name === 'Default') continue;
      const lowerName = name.toLowerCase();
      if (existingSet.has(lowerName)) continue;

      try {
        await this.client.addLabel(lowerName);
        createdInDeluge++;
        this.log(`Pushed label "${lowerName}" to Deluge`);
      } catch (err) {
        this.log(`Failed to push label "${lowerName}" to Deluge: ${err.message}`);
      }
    }

    this.log(`Deluge sync complete: ${createdInApp} imported, ${createdInDeluge} pushed`);

    // Propagate all app categories to other connected clients
    await categoryManager.propagateToOtherClients(this.instanceId);
    await categoryManager.validateAllPaths();
  }

  // ============================================================================
  // MISC
  // ============================================================================

  /**
   * Get the default save path from Deluge config.
   * @returns {Promise<string|null>} Default save path or null
   */
  async getDefaultDirectory() {
    if (!this.client) return null;

    try {
      // Deluge doesn't have a single getPreferences call;
      // use core.get_config_value for the download location
      await this.client.ensureLoggedIn();
      const path = await this.client._call('core.get_config_value', ['download_location']);
      return path || null;
    } catch (err) {
      this.log('Failed to get Deluge default directory:', logger.errorDetail(err));
      return null;
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    this.log('Shutting down Deluge connection...');

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
        this.log('Error during Deluge client shutdown:', logger.errorDetail(err));
      }
      this.client = null;
    }

    this.connectionInProgress = false;
    this.log('Deluge connection shutdown complete');
  }
}

module.exports = { DelugeManager };
