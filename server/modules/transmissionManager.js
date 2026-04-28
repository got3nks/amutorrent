/**
 * Transmission Client Management Module
 * Handles Transmission connection, reconnection, and data retrieval
 */

const TransmissionClient = require('../lib/transmission/TransmissionClient');
const BaseClientManager = require('../lib/BaseClientManager');
const logger = require('../lib/logger');
const { parseMagnetUri, parseTorrentBuffer } = require('../lib/torrentUtils');
const { normalizeTransmissionDownload } = require('../lib/downloadNormalizer');


class TransmissionManager extends BaseClientManager {
  constructor() {
    super();
    this.lastTorrents = [];
    this.lastStats = null;
    this.cachedListenPort = 0;
    this.cachedSession = null;
    this._portOpen = null;           // null = unknown, true/false = last test result
    this._portTestInterval = null;
  }

  /**
   * Initialize Transmission client
   * @returns {Promise<boolean>} True if connection successful
   */
  async initClient() {
    // Prevent concurrent connection attempts
    if (this.connectionInProgress) {
      this.log('  Transmission connection attempt already in progress, skipping...');
      return false;
    }

    // Check if Transmission is enabled and configured
    if (!this._clientConfig || !this._clientConfig.enabled) {
      this.log('  Transmission integration is disabled');
      return false;
    }

    if (!this._clientConfig.host) {
      this.log('  Transmission host not configured');
      return false;
    }

    this.connectionInProgress = true;

    try {
      // Cleanup old client
      if (this.client) {
        this.log('Cleaning up old Transmission client...');
        await this.client.disconnect();
        this.client = null;
      }

      this.log(`Creating new Transmission client (${this._clientConfig.host}:${this._clientConfig.port})...`);

      const newClient = new TransmissionClient({
        host: this._clientConfig.host,
        port: this._clientConfig.port || 9091,
        username: this._clientConfig.username || '',
        password: this._clientConfig.password || '',
        useSsl: this._clientConfig.useSsl || false,
        path: this._clientConfig.path || '/transmission/rpc'
      });

      // Test the connection
      const testResult = await newClient.testConnection();

      if (!testResult.success) {
        throw new Error(testResult.error || 'Connection test failed');
      }

      this.client = newClient;
      this._clearConnectionError();
      this.log(`Connected to Transmission ${testResult.version} successfully`);

      // Stop reconnection attempts
      this.clearReconnect();

      // Cache session info (for listen port, download-dir, etc.)
      try {
        this.cachedSession = await newClient.getSession();
        this.cachedListenPort = this.cachedSession['peer-port'] || 0;
      } catch (err) {
        this.warn('Could not fetch session info:', logger.errorDetail(err));
      }

      // Start tracker cache refresh
      this.startTrackerRefresh();

      // Start periodic port reachability test
      this._startPortTest();

      // Notify connection listeners
      this._onConnectCallbacks.forEach(cb => cb());

      return true;
    } catch (err) {
      this.error('Failed to connect to Transmission:', logger.errorDetail(err));
      this._setConnectionError(err);
      this.client = null;
      this.stopTrackerRefresh();
      this._stopPortTest();
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
      this.log('Transmission integration is disabled, skipping connection');
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
  // PORT TEST
  // ============================================================================

  /**
   * Run a port-test and cache the result.
   */
  async _refreshPortTest() {
    if (!this.client) return;
    try {
      this._portOpen = await this.client.portTest();
    } catch (err) {
      this.error('Port test failed:', logger.errorDetail(err));
    }
  }

  /**
   * Start periodic port reachability test (every 15 minutes).
   * Initial test runs immediately in the background.
   */
  _startPortTest() {
    if (this._portTestInterval) return;
    this._refreshPortTest();
    this._portTestInterval = setInterval(() => this._refreshPortTest(), 15 * 60 * 1000);
  }

  /**
   * Stop periodic port test.
   */
  _stopPortTest() {
    if (this._portTestInterval) {
      clearInterval(this._portTestInterval);
      this._portTestInterval = null;
    }
    this._portOpen = null;
  }

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  /**
   * Get all torrents from Transmission
   * @returns {Promise<Array>} Array of torrent objects
   */
  async getTorrents() {
    if (!this.client) {
      return [];
    }

    try {
      const result = await this.client.getTorrents();
      const torrents = result.torrents || [];

      // Merge tracker and peer data from cache
      this._mergeTrackerData(torrents);

      this.lastTorrents = torrents;
      return torrents;
    } catch (err) {
      this.error('Error fetching Transmission torrents:', logger.errorDetail(err));
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
      return result.torrents || [];
    } catch {
      return [];
    }
  }

  /**
   * Fetch tracker and peer data for all torrents.
   * @param {Array} items - Torrent objects with .hashString
   * @returns {Promise<{ trackersByHash: Map, peersByHash: Map }>}
   */
  async _fetchTrackersAndPeers(items) {
    const trackersByHash = new Map();
    const peersByHash = new Map();

    // Process in batches to avoid overwhelming the Transmission daemon
    const BATCH_SIZE = 10;
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async (torrent) => {
        const hash = (torrent.hashString || torrent.hash || '').toLowerCase();
        if (!hash) return;

        try {
          const detail = await this.client.getTorrentDetails(
            [torrent.hashString || torrent.hash],
            ['peers', 'trackerStats']
          );

          if (!detail) return;

          // Trackers
          const trackerStats = detail.trackerStats || [];
          const trackerUrls = trackerStats
            .map(t => t.announce || t.host)
            .filter(url => typeof url === 'string' && url.length > 0);
          trackersByHash.set(hash, { trackersDetailed: trackerStats, trackers: trackerUrls });

          // Peers
          const rawPeers = detail.peers || [];
          const peersArray = rawPeers.map(p => ({
            address: p.address || '',
            port: p.port || 0,
            client: p.clientName || 'Unknown',
            flags: p.flagStr || '',
            completedPercent: Math.round((p.progress || 0) * 100),
            downloadRate: p.rateToClient || 0,
            uploadRate: p.rateToPeer || 0,
            downloadTotal: 0,
            uploadTotal: 0,
            isEncrypted: !!(p.isEncrypted),
            isIncoming: !!(p.isIncoming),
            country: '',
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
   * Get global stats from Transmission
   * @returns {Promise<Object>} { uploadSpeed, downloadSpeed, uploadTotal, downloadTotal, ... }
   */
  async getGlobalStats() {
    if (!this.client) {
      return { uploadSpeed: 0, downloadSpeed: 0, uploadTotal: 0, downloadTotal: 0 };
    }

    try {
      const stats = await this.client.getSessionStats();
      this.lastStats = stats;

      const cumulative = stats['cumulative-stats'] || {};

      return {
        uploadSpeed: stats.uploadSpeed || 0,
        downloadSpeed: stats.downloadSpeed || 0,
        uploadTotal: cumulative.uploadedBytes || 0,
        downloadTotal: cumulative.downloadedBytes || 0,
        activeTorrents: stats.activeTorrentCount || 0,
        totalTorrents: stats.torrentCount || 0,
        portOpen: this._portOpen,
        listenPort: this.cachedListenPort
      };
    } catch (err) {
      this.error('❌ Error fetching Transmission stats:', logger.errorDetail(err));
      this._setConnectionError(err);
      if (this.client) this.client.connected = false;
      this.scheduleReconnect(30000);
      return {
        uploadSpeed: 0,
        downloadSpeed: 0,
        uploadTotal: 0,
        downloadTotal: 0,
        portOpen: this._portOpen,
        listenPort: this.cachedListenPort
      };
    }
  }

  // ============================================================================
  // UNIFIED DATA FETCHING (same interface as all managers)
  // ============================================================================

  /**
   * Fetch and normalize all data from Transmission.
   * @returns {Promise<Object>} { downloads, sharedFiles, uploads }
   */
  async fetchData() {
    const rawTorrents = await this.getTorrents();

    if (!rawTorrents || rawTorrents.length === 0) {
      return { downloads: [], sharedFiles: [] };
    }

    // Normalize all torrents (peers already embedded with role: 'peer')
    const downloads = rawTorrents.map(t => normalizeTransmissionDownload(t));

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
   * Get raw stats from Transmission (alias for getGlobalStats)
   * @returns {Promise<Object>} Raw stats
   */
  async getStats() {
    return await this.getGlobalStats();
  }

  /**
   * Extract normalized metrics from raw Transmission stats
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
   * Compute network status from raw Transmission stats
   * @param {Object} rawStats - Raw stats (already normalized by getGlobalStats)
   * @returns {Object} { status, text, connectionStatus, listenPort }
   */
  getNetworkStatus(rawStats) {
    const portOpen = rawStats.portOpen;
    let status, text, connectionStatus;

    if (portOpen === true) {
      status = 'green';
      text = 'OK';
      connectionStatus = 'connected';
    } else if (portOpen === false) {
      status = 'yellow';
      text = 'Firewalled';
      connectionStatus = 'firewalled';
    } else {
      // port test hasn't completed yet — infer from activity
      status = 'yellow';
      text = 'Checking port...';
      connectionStatus = 'connected';
    }

    return {
      status,
      text,
      connectionStatus,
      listenPort: rawStats.listenPort || null
    };
  }

  /**
   * Extract normalized history metadata from a normalized Transmission download item
   * @param {Object} item - Normalized Transmission download data
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
   * Pause a download (Transmission: stop)
   * @param {string} hash - Torrent hash
   */
  async pause(hash) {
    if (!this.client) throw new Error('Transmission not connected');
    await this.client.stopTorrents([hash]);
  }

  /**
   * Resume a download
   * @param {string} hash - Torrent hash
   */
  async resume(hash) {
    if (!this.client) throw new Error('Transmission not connected');
    await this.client.startTorrents([hash]);
  }

  /**
   * Hard stop a download (Transmission: same as pause)
   * @param {string} hash - Torrent hash
   */
  async stop(hash) {
    return await this.pause(hash);
  }

  /**
   * Update client's view of the download directory (uses native moveTorrents)
   * @param {string} hash - Torrent hash
   * @param {string} path - New directory path
   */
  async updateDirectory(hash, path) {
    if (!this.client) throw new Error('Transmission not connected');
    await this.client.moveTorrents([hash], path, true);
  }

  /**
   * Remove a download from Transmission
   * @param {string} hash - Torrent hash
   * @param {boolean} deleteFiles - Whether to delete files
   */
  async removeDownload(hash, deleteFiles = false) {
    if (!this.client) throw new Error('Transmission not connected');
    await this.client.removeTorrent([hash], deleteFiles);
    this.trackDeletion(hash);
  }

  /**
   * Delete an item (Transmission API handles file deletion natively)
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
   * Build Transmission-native options from unified format.
   * Unified: { categoryName, savePath, priority, start, username }
   * Transmission: { download-dir, labels, paused }
   */
  _buildAddOptions(options) {
    const rawLabel = options.categoryName ?? options.category ?? '';
    const label = rawLabel === 'Default' ? '' : rawLabel;
    const savePath = options.savePath ?? options.directory;
    const addArgs = {};

    if (savePath) {
      addArgs['download-dir'] = savePath;
    }
    if (label) {
      addArgs.labels = [label];
    }
    if (options.start === false) {
      addArgs.paused = true;
    }

    return { addArgs, label };
  }

  /**
   * Add a torrent from magnet link
   * @param {string} magnetUri - Magnet URI
   * @param {Object} options - Unified options { categoryName, savePath, priority, start, username }
   */
  async addMagnet(magnetUri, options = {}) {
    if (!this.client) throw new Error('Transmission not connected');

    const { addArgs, label } = this._buildAddOptions(options);
    addArgs.filename = magnetUri;

    const result = await this.client.addTorrent(addArgs);

    // If label was specified but not set via addTorrent, set it via torrent-set
    const added = result['torrent-added'] || result['torrent-duplicate'];
    if (label && added) {
      try {
        const id = added.hashString || added.id;
        await this.client.setTorrents([id], { labels: [label] });
      } catch (err) {
        this.warn(`Could not set label "${label}" for magnet: ${err.message}`);
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
    if (!this.client) throw new Error('Transmission not connected');

    const { addArgs, label } = this._buildAddOptions(options);
    addArgs.metainfo = torrentData.toString('base64');

    const result = await this.client.addTorrent(addArgs);

    // Set label via torrent-set if needed
    const added = result['torrent-added'] || result['torrent-duplicate'];
    if (label && added) {
      try {
        const id = added.hashString || added.id;
        await this.client.setTorrents([id], { labels: [label] });
      } catch (err) {
        this.warn(`Could not set label "${label}" for torrent: ${err.message}`);
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
    if (!this.client) throw new Error('Transmission not connected');

    const labelValue = categoryName === 'Default' ? '' : (categoryName || '');
    const labels = labelValue ? [labelValue] : [];
    await this.client.setTorrents([hash], { labels });

    return { success: true };
  }

  /**
   * Get all labels from Transmission torrents (scanned from torrent labels)
   * @returns {Promise<Object>} Labels mapped as { name: { name, savePath: '' } }
   */
  async getCategories() {
    if (!this.client) {
      return {};
    }

    try {
      // Scan all torrents to collect unique labels
      const result = await this.client.getTorrents(['labels']);
      const torrents = result.torrents || [];
      const labelSet = new Set();

      for (const t of torrents) {
        if (t.labels && Array.isArray(t.labels)) {
          for (const label of t.labels) {
            if (label) labelSet.add(label);
          }
        }
      }

      const categories = {};
      for (const label of labelSet) {
        categories[label] = { name: label, savePath: '' };
      }
      return categories;
    } catch (err) {
      this.error('Error fetching Transmission labels:', logger.errorDetail(err));
      return {};
    }
  }

  /**
   * Ensure a label exists — no-op for Transmission since labels are ad-hoc.
   * @param {Object} opts - { name }
   * @returns {Promise<Object>} { success: true }
   */
  async ensureCategoryExists({ name } = {}) {
    // Transmission labels are ad-hoc; they exist when assigned to a torrent.
    return { success: true };
  }

  /**
   * Ensure multiple labels exist — no-op for Transmission.
   * @param {Array<Object>} categories - Array of { name }
   * @returns {Promise<Array<Object>>} Empty array
   */
  async ensureCategoriesBatch(categories) {
    return [];
  }

  // ============================================================================
  // FILES
  // ============================================================================

  /**
   * Get files for a torrent
   * @param {string} hash - Torrent hash
   * @returns {Promise<Array>} Array of file objects
   */
  async getFiles(hash) {
    if (!this.client) throw new Error('Transmission not connected');

    const detail = await this.client.getTorrentDetails([hash], ['files', 'fileStats']);
    if (!detail) return [];

    const files = detail.files || [];
    const fileStats = detail.fileStats || [];

    return files.map((file, i) => {
      const stats = fileStats[i] || {};
      return {
        path: file.name || '',
        size: file.length || file.bytesCompleted || 0,
        progress: file.length > 0 ? parseFloat(((stats.bytesCompleted || 0) / file.length * 100).toFixed(2)) : 0,
        priority: stats.wanted === false ? 0 : stats.priority === 1 ? 2 : 1,
        index: i
      };
    });
  }

  // ============================================================================
  // SYNC
  // ============================================================================

  /**
   * Perform label sync when this Transmission instance connects.
   * Imports Transmission labels into app, pushes app categories as labels.
   * @param {Object} categoryManager - CategoryManager instance
   */
  async onConnectSync(categoryManager) {
    // Register default download path
    const defaultDir = await this.getDefaultDirectory();
    if (defaultDir) {
      categoryManager.setClientDefaultPath(this.instanceId, defaultDir);
    }

    // Scan all torrents for labels
    let torrentLabels = new Set();
    try {
      const result = await this.client.getTorrents(['labels']);
      const torrents = result.torrents || [];
      for (const t of torrents) {
        if (t.labels && Array.isArray(t.labels)) {
          for (const label of t.labels) {
            if (label) torrentLabels.add(label);
          }
        }
      }
    } catch (err) {
      this.error(`Failed to fetch labels for sync: ${err.message}`);
      return;
    }

    // Phase 1: Import Transmission labels into app
    let createdInApp = 0;
    for (const label of torrentLabels) {
      if (!label) continue;
      if (categoryManager.getByName(label)) continue;
      categoryManager.importCategory({
        name: label,
        comment: 'Auto-created from Transmission label'
      });
      createdInApp++;
    }
    if (createdInApp > 0) await categoryManager.save();

    this.log(`Transmission sync complete: ${createdInApp} imported`);

    // Propagate all app categories to other connected clients
    await categoryManager.propagateToOtherClients(this.instanceId);
    await categoryManager.validateAllPaths();
  }

  // ============================================================================
  // MISC
  // ============================================================================

  /**
   * Get the default save path from Transmission session.
   * @returns {Promise<string|null>} Default save path or null
   */
  async getDefaultDirectory() {
    if (!this.client) return null;

    try {
      // Use cached session if available
      if (this.cachedSession && this.cachedSession['download-dir']) {
        return this.cachedSession['download-dir'];
      }
      const session = await this.client.getSession();
      this.cachedSession = session;
      return session['download-dir'] || null;
    } catch (err) {
      this.error('Failed to get Transmission default directory:', logger.errorDetail(err));
      return null;
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    this.log('Shutting down Transmission connection...');

    // Stop tracker refresh
    this.stopTrackerRefresh();

    // Stop port test
    this._stopPortTest();

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
        this.error('Error during Transmission client shutdown:', logger.errorDetail(err));
      }
      this.client = null;
    }

    this.connectionInProgress = false;
    this.log('Transmission connection shutdown complete');
  }
}

module.exports = { TransmissionManager };
