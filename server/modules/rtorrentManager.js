/**
 * rtorrent Client Management Module
 * Handles rtorrent connection, reconnection, and data retrieval
 */

const RtorrentHandler = require('../lib/rtorrent/RtorrentHandler');
const BaseClientManager = require('../lib/BaseClientManager');
const logger = require('../lib/logger');
const clientMeta = require('../lib/clientMeta');
const { parseMagnetUri, parseTorrentBuffer } = require('../lib/torrentUtils');
const { normalizeRtorrentDownload } = require('../lib/downloadNormalizer');


class RtorrentManager extends BaseClientManager {
  constructor() {
    super();
    this.lastDownloads = [];
    this.lastStats = null;
  }

  /**
   * Initialize rtorrent client
   * @returns {Promise<boolean>} True if connection successful
   */
  async initClient() {
    // Prevent concurrent connection attempts
    if (this.connectionInProgress) {
      this.warn('⚠️  rtorrent connection attempt already in progress, skipping...');
      return false;
    }

    // Check if rtorrent is enabled and configured
    if (!this._clientConfig || !this._clientConfig.enabled) {
      this.log('ℹ️  rtorrent integration is disabled');
      return false;
    }

    if (this._clientConfig.mode === 'scgi-socket') {
      if (!this._clientConfig.socketPath) {
        this.warn('⚠️  rtorrent socket path not configured');
        return false;
      }
    } else if (!this._clientConfig.host) {
      this.warn('⚠️  rtorrent host not configured');
      return false;
    }

    this.connectionInProgress = true;

    try {
      // Cleanup old client
      if (this.client) {
        this.log('🔄 Cleaning up old rtorrent client...');
        this.client.disconnect();
        this.client = null;
      }

      const mode = this._clientConfig.mode || 'http';
      const modeLabel = mode === 'scgi-socket'
        ? `SCGI socket ${this._clientConfig.socketPath}`
        : mode === 'scgi'
          ? `SCGI ${this._clientConfig.host}:${this._clientConfig.port}`
          : `${this._clientConfig.host}:${this._clientConfig.port}${this._clientConfig.path || '/RPC2'}`;
      this.log(`🔌 Creating new rtorrent client (${modeLabel})...`);

      const newClient = new RtorrentHandler({
        host: this._clientConfig.host,
        port: this._clientConfig.port || 8000,
        path: this._clientConfig.path || '/RPC2',
        mode,
        socketPath: this._clientConfig.socketPath || null,
        username: this._clientConfig.username || null,
        password: this._clientConfig.password || null,
        useSsl: this._clientConfig.useSsl || false
      });

      newClient.connect();

      // Test the connection
      const testResult = await newClient.testConnection();

      if (!testResult.success) {
        throw new Error(testResult.error || 'Connection test failed');
      }

      this.client = newClient;
      this._clearConnectionError();
      this.log(`✅ Connected to rtorrent ${testResult.version} successfully`);

      // Stop reconnection attempts
      this.clearReconnect();

      // Start tracker cache refresh (fire-and-forget, initial refresh runs in background)
      this.startTrackerRefresh();

      // Notify connection listeners
      this._onConnectCallbacks.forEach(cb => cb());

      return true;
    } catch (err) {
      this.error('❌ Failed to connect to rtorrent:', logger.errorDetail(err));
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
      this.log('ℹ️  rtorrent integration is disabled, skipping connection');
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
    return !!this.client && this.client.connected;
  }

  /**
   * Get all downloads from rtorrent
   * @returns {Promise<Array>}
   */
  async getDownloads() {
    if (!this.client) {
      return [];
    }

    try {
      const downloads = await this.client.getAllDownloads();

      // Merge tracker and peer data from cache
      this._mergeTrackerData(downloads);

      this.lastDownloads = downloads;
      return downloads;
    } catch (err) {
      this.error('❌ Error fetching rtorrent downloads:', logger.errorDetail(err));
      this._setConnectionError(err);
      this.client = null;
      this.scheduleReconnect(30000);
      return this.lastDownloads; // Return cached data on error
    }
  }

  /**
   * Return cached downloads or fetch fresh for tracker refresh.
   * @returns {Promise<Array>}
   */
  async _getItemsForTrackerRefresh() {
    return this.lastDownloads.length > 0
      ? this.lastDownloads
      : await this.client.getAllDownloads();
  }

  /**
   * Fetch tracker and peer data for all downloads using batched XML-RPC multicall.
   * Only 2 HTTP requests regardless of torrent count.
   * @param {Array} items - Download objects with .hash
   * @returns {Promise<{ trackersByHash: Map, peersByHash: Map }>}
   */
  async _fetchTrackersAndPeers(items) {
    const hashes = items.map(d => d.hash);

    const [rawTrackersMap, rawPeersMap] = await Promise.all([
      this.client.getAllTrackersDetailed(hashes).catch(() => new Map()),
      this.client.getAllPeersDetailed(hashes).catch(() => new Map())
    ]);

    const trackersByHash = new Map();
    const peersByHash = new Map();

    for (const item of items) {
      const hash = item.hash?.toLowerCase();
      if (!hash) continue;

      const trackersDetailed = rawTrackersMap.get(item.hash) || [];
      const trackers = trackersDetailed
        .filter(t => t.enabled)
        .map(t => t.url);

      trackersByHash.set(hash, { trackersDetailed, trackers });
      peersByHash.set(hash, rawPeersMap.get(item.hash) || []);
    }

    return { trackersByHash, peersByHash };
  }

  /**
   * Get global stats from rtorrent
   * @returns {Promise<Object>}
   */
  async getGlobalStats() {
    if (!this.client) {
      return { downloadSpeed: 0, uploadSpeed: 0, downloadTotal: 0, uploadTotal: 0 };
    }

    try {
      const stats = await this.client.getGlobalStats();
      this.lastStats = stats;
      return stats;
    } catch (err) {
      this.error('❌ Error fetching rtorrent stats:', logger.errorDetail(err));
      this._setConnectionError(err);
      this.client = null;
      this.scheduleReconnect(30000);
      return this.lastStats || { downloadSpeed: 0, uploadSpeed: 0, downloadTotal: 0, uploadTotal: 0 };
    }
  }

  /**
   * Get the default download directory from rtorrent
   * @returns {Promise<string>}
   */
  async getDefaultDirectory() {
    if (!this.client) {
      return '';
    }

    try {
      return await this.client.getDefaultDirectory();
    } catch (err) {
      this.error('❌ Error fetching rtorrent default directory:', logger.errorDetail(err));
      return '';
    }
  }

  // ============================================================================
  // UNIFIED DATA FETCHING (same interface as all managers)
  // ============================================================================

  /**
   * Fetch and normalize all data from rTorrent.
   * @returns {Promise<Object>} { downloads, sharedFiles, uploads }
   */
  async fetchData() {
    const rawDownloads = await this.getDownloads();

    if (!rawDownloads || rawDownloads.length === 0) {
      return { downloads: [], sharedFiles: [] };
    }

    // Normalize all downloads (peers already embedded with role: 'peer')
    const downloads = rawDownloads.map(d => normalizeRtorrentDownload(d));

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
   * Get raw stats from rtorrent (alias for getGlobalStats)
   * @returns {Promise<Object>} Raw stats
   */
  async getStats() {
    return await this.getGlobalStats();
  }

  /**
   * Extract normalized metrics from raw rtorrent stats
   * @param {Object} rawStats - Raw rtorrent stats
   * @returns {Object} { uploadSpeed, downloadSpeed, uploadTotal, downloadTotal, pid? }
   */
  extractMetrics(rawStats) {
    return {
      uploadSpeed: rawStats.uploadSpeed || 0,
      downloadSpeed: rawStats.downloadSpeed || 0,
      uploadTotal: rawStats.uploadTotal || 0,
      downloadTotal: rawStats.downloadTotal || 0,
      pid: rawStats.pid
    };
  }

  /**
   * Compute network status from raw rtorrent stats
   * @param {Object} rawStats - Raw rtorrent stats
   * @returns {Object} { status, text, portOpen, listenPort }
   */
  getNetworkStatus(rawStats) {
    const portOpen = !!rawStats.portOpen;
    return {
      status: portOpen ? 'green' : 'yellow',
      text: portOpen ? 'OK' : 'Firewalled',
      portOpen,
      listenPort: rawStats.listenPort || null
    };
  }

  /**
   * Extract normalized history metadata from a raw rtorrent download item
   * @param {Object} item - Raw rtorrent download data
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
      category: item.label || null
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
   * Hard stop a download (fully close the torrent, release file handles)
   * @param {string} hash - Torrent hash
   */
  async stop(hash) {
    return await this.closeDownload(hash);
  }

  /**
   * Update client's view of the download directory
   * @param {string} hash - Torrent hash
   * @param {string} path - New directory path
   */
  async updateDirectory(hash, path) {
    if (!this.client) {
      throw new Error('rtorrent not connected');
    }
    await this.client.call('d.directory.set', [hash, path]);
  }

  // ============================================================================
  // INTERNAL DOWNLOAD CONTROL
  // ============================================================================

  /**
   * Start a download
   * @param {string} hash - Torrent hash
   */
  async startDownload(hash) {
    if (!this.client) {
      throw new Error('rtorrent not connected');
    }
    await this.client.startDownload(hash);
  }

  /**
   * Stop/pause a download
   * @param {string} hash - Torrent hash
   */
  async stopDownload(hash) {
    if (!this.client) {
      throw new Error('rtorrent not connected');
    }
    await this.client.stopDownload(hash);
  }

  /**
   * Close a download (fully stop and close the torrent)
   * @param {string} hash - Torrent hash
   */
  async closeDownload(hash) {
    if (!this.client) {
      throw new Error('rtorrent not connected');
    }
    await this.client.closeDownload(hash);
  }

  /**
   * Get download path info (for file deletion before removal)
   * @param {string} hash - Torrent hash
   * @returns {Promise<Object>} { basePath, isMultiFile }
   */
  async getDownloadPathInfo(hash) {
    if (!this.client) {
      throw new Error('rtorrent not connected');
    }
    return await this.client.getDownloadPathInfo(hash);
  }

  /**
   * Remove a download from rtorrent (does not delete files)
   * @param {string} hash - Torrent hash
   */
  async removeDownload(hash) {
    if (!this.client) {
      throw new Error('rtorrent not connected');
    }

    await this.client.removeDownload(hash);

    // Track deletion in history
    this.trackDeletion(hash);
  }

  /**
   * Delete an item (remove from rtorrent + optionally return paths for disk deletion)
   * Gets path info before removal since rtorrent state is lost after erase.
   * @param {string} hash - Torrent hash
   * @param {Object} options - { deleteFiles }
   * @returns {Promise<Object>} { success, pathsToDelete }
   */
  async deleteItem(hash, { deleteFiles } = {}) {
    const pathsToDelete = [];
    if (deleteFiles) {
      try {
        const pathInfo = await this.getDownloadPathInfo(hash);
        if (pathInfo?.basePath) pathsToDelete.push(pathInfo.basePath);
      } catch (err) {
        this.warn(`⚠️  Failed to get path info for ${hash}: ${err.message}`);
      }
    }
    await this.removeDownload(hash);
    return { success: true, pathsToDelete };
  }

  /**
   * Build rTorrent-native options from unified format.
   * Unified: { categoryName, savePath, priority, start, username }
   * rTorrent: { label, directory, priority, start, username }
   */
  _buildAddOptions(options) {
    const label = options.categoryName ?? options.label ?? '';
    const directory = options.savePath ?? options.directory ?? null;
    const mappedPriority = options.priority !== undefined
      ? (clientMeta.mapPriority(this.clientType, options.priority) ?? options.priority)
      : undefined;
    const rtOptions = { label, start: options.start, username: options.username };
    if (directory) rtOptions.directory = directory;
    if (mappedPriority !== undefined) rtOptions.priority = mappedPriority;
    return rtOptions;
  }

  /**
   * Add a torrent from magnet link
   * @param {string} magnetUri - Magnet URI
   * @param {Object} options - Unified options { categoryName, savePath, priority, start, username }
   */
  async addMagnet(magnetUri, options = {}) {
    if (!this.client) {
      throw new Error('rtorrent not connected');
    }

    // Parse hash before loading — needed for post-load property setting
    const { hash, name } = parseMagnetUri(magnetUri);

    const rtOptions = this._buildAddOptions(options);
    if (hash) rtOptions.hash = hash;
    await this.client.addMagnet(magnetUri, rtOptions);

    // Track in history
    if (hash) {
      this.trackDownload(hash, name || 'Magnet download', null, options.username, rtOptions.label || null);
    }
  }

  /**
   * Add a torrent from raw data (Buffer)
   * Use this when rtorrent doesn't have filesystem access to the torrent file
   * @param {Buffer} torrentData - Raw .torrent file contents
   * @param {Object} options - Unified options { categoryName, savePath, priority, start, username }
   */
  async addTorrentRaw(torrentData, options = {}) {
    if (!this.client) {
      throw new Error('rtorrent not connected');
    }

    // Parse hash before loading — needed for post-load property setting
    const { hash, name, size } = parseTorrentBuffer(torrentData);

    const rtOptions = this._buildAddOptions(options);
    if (hash) rtOptions.hash = hash;
    await this.client.addTorrentRaw(torrentData, rtOptions);

    // Track in history
    if (hash) {
      this.trackDownload(hash, name || 'Torrent download', size, options.username, rtOptions.label || null);
    }
  }

  /**
   * Set label/category for a download
   * @param {string} hash - Torrent hash
   * @param {string} label - Label to set
   */
  async setLabel(hash, label) {
    if (!this.client) {
      throw new Error('rtorrent not connected');
    }
    await this.client.setLabel(hash, label);
  }

  /**
   * Set both label and priority for a download
   * More efficient than separate calls when both need to be set
   * @param {string} hash - Torrent hash
   * @param {string} label - Label to set
   * @param {number} priority - Priority (0=off, 1=low, 2=normal, 3=high)
   */
  async setLabelAndPriority(hash, label, priority) {
    if (!this.client) {
      throw new Error('rtorrent not connected');
    }
    await this.client.setLabelAndPriority(hash, label, priority);
  }

  /**
   * Set category/label for a download (unified interface)
   * Maps category name to label and priority to rTorrent's native values.
   * @param {string} hash - Torrent hash
   * @param {Object} options - { categoryName, priority }
   * @returns {Promise<Object>} { success }
   */
  async setCategoryOrLabel(hash, { categoryName, priority } = {}) {
    const labelValue = categoryName === 'Default' ? '' : (categoryName || '');
    const mappedPriority = clientMeta.mapPriority(this.clientType, priority) ?? 2;
    await this.setLabelAndPriority(hash, labelValue, mappedPriority);
    return { success: true };
  }

  /**
   * Set priority for a download
   * @param {string} hash - Torrent hash
   * @param {number} priority - Priority (0=off, 1=low, 2=normal, 3=high)
   */
  async setPriority(hash, priority) {
    if (!this.client) {
      throw new Error('rtorrent not connected');
    }
    await this.client.setPriority(hash, priority);
  }

  /**
   * Get files for a torrent
   * @param {string} hash - Torrent hash
   * @returns {Promise<Array>} Array of file objects
   */
  async getFiles(hash) {
    if (!this.client) {
      throw new Error('rtorrent not connected');
    }
    return await this.client.getFiles(hash);
  }

  /**
   * Perform category sync when this rTorrent instance connects.
   * Creates app categories for rTorrent labels that don't exist yet.
   * @param {Object} categoryManager - CategoryManager instance
   */
  async onConnectSync(categoryManager) {
    const defaultDir = await this.getDefaultDirectory();
    if (defaultDir) {
      categoryManager.setClientDefaultPath(this.instanceId, defaultDir);
    }
    const downloads = await this.getDownloads();
    const labels = [...new Set(downloads.map(d => d.label).filter(Boolean))];

    let created = 0;
    for (const label of labels) {
      if (!label || label === '(none)') continue;
      if (categoryManager.getByName(label)) continue;
      categoryManager.importCategory({
        name: label,
        comment: 'Auto-created from rTorrent label'
      });
      created++;
    }
    if (created > 0) await categoryManager.save();

    this.log(`📊 rTorrent sync complete: ${created} categories created`);

    // Propagate all app categories to other connected clients that may not have them
    await categoryManager.propagateToOtherClients(this.instanceId);
    await categoryManager.validateAllPaths();
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    this.log('🛑 Shutting down rtorrent connection...');

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
        this.client.disconnect();
      } catch (err) {
        this.warn('⚠️  Error during rtorrent client shutdown:', logger.errorDetail(err));
      }
      this.client = null;
    }

    this.connectionInProgress = false;
    this.log('✅ rtorrent connection shutdown complete');
  }
}

module.exports = { RtorrentManager };
