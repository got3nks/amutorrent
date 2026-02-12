/**
 * qBittorrent Client Management Module
 * Handles qBittorrent connection, reconnection, and data retrieval
 */

const crypto = require('crypto');
const QBittorrentClient = require('../lib/qbittorrent/QBittorrentClient');
const config = require('./config');
const BaseModule = require('../lib/BaseModule');
const logger = require('../lib/logger');


class QbittorrentManager extends BaseModule {
  constructor() {
    super();
    this.client = null;
    this.reconnectInterval = null;
    this.connectionInProgress = false;
    this.lastTorrents = [];
    this.lastStats = null;
    this.cachedListenPort = 0;

    // Tracker cache: Map<hash, { trackers: Object[], lastUpdated: number }>
    this.trackerCache = new Map();
    // Peer cache: Map<hash, { peers: Object[], lastUpdated: number }>
    this.peerCache = new Map();
    this.trackerRefreshInterval = null;
    this.TRACKER_REFRESH_INTERVAL = 10000; // Refresh every 10 seconds

    // Connection callbacks
    this._onConnectCallbacks = [];
  }

  /**
   * Check if history tracking is enabled
   * @returns {boolean}
   */
  isHistoryEnabled() {
    return config.getConfig()?.history?.enabled !== false && this.downloadHistoryDB;
  }

  /**
   * Parse magnet URI to extract hash and name
   * @param {string} magnetUri - Magnet URI
   * @returns {Object} { hash, name }
   */
  parseMagnetUri(magnetUri) {
    let hash = null;
    let name = null;

    try {
      // Extract hash from xt=urn:btih:HASH
      const hashMatch = magnetUri.match(/xt=urn:btih:([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})/i);
      if (hashMatch) {
        hash = hashMatch[1];
        // Convert base32 to hex if needed (32 chars = base32, 40 chars = hex)
        if (hash.length === 32) {
          hash = this.base32ToHex(hash);
        }
        hash = hash.toLowerCase();
      }

      // Extract name from dn= parameter
      const nameMatch = magnetUri.match(/dn=([^&]+)/);
      if (nameMatch) {
        name = decodeURIComponent(nameMatch[1].replace(/\+/g, ' '));
      }
    } catch (err) {
      logger.warn('[qbittorrentManager] Failed to parse magnet URI:', err.message);
    }

    return { hash, name };
  }

  /**
   * Convert base32 to hex (for magnet links with base32 hashes)
   * @param {string} base32 - Base32 encoded string
   * @returns {string} Hex string
   */
  base32ToHex(base32) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    for (const char of base32.toUpperCase()) {
      const val = alphabet.indexOf(char);
      if (val === -1) continue;
      bits += val.toString(2).padStart(5, '0');
    }
    let hex = '';
    for (let i = 0; i + 4 <= bits.length; i += 4) {
      hex += parseInt(bits.substr(i, 4), 2).toString(16);
    }
    return hex;
  }

  /**
   * Track a download in history
   * @param {string} hash - Info hash
   * @param {string} name - Torrent name
   * @param {number} size - Size in bytes (optional)
   * @param {string} username - Username (optional)
   * @param {string} category - Category name (optional)
   */
  trackDownload(hash, name, size = null, username = null, category = null) {
    if (!this.isHistoryEnabled() || !hash) return;

    try {
      this.log(`📜 History: tracking qbittorrent download - hash: ${hash}, name: ${name}, size: ${size}`);
      this.downloadHistoryDB.addDownload(hash, name || 'Unknown', size, username, 'qbittorrent', category);
    } catch (err) {
      logger.warn('[qbittorrentManager] Failed to track download:', err.message);
    }
  }

  /**
   * Track a deletion in history
   * @param {string} hash - Info hash
   */
  trackDeletion(hash) {
    if (!this.isHistoryEnabled() || !hash) return;

    try {
      this.downloadHistoryDB.markDeleted(hash);
    } catch (err) {
      logger.warn('[qbittorrentManager] Failed to track deletion:', err.message);
    }
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

    const qbConfig = config.getQbittorrentConfig();

    // Check if qBittorrent is enabled and configured
    if (!qbConfig || !qbConfig.enabled) {
      this.log('ℹ️  qBittorrent integration is disabled');
      return false;
    }

    if (!qbConfig.host) {
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

      this.log(`🔌 Creating new qBittorrent client (${qbConfig.host}:${qbConfig.port})...`);

      const newClient = new QBittorrentClient({
        host: qbConfig.host,
        port: qbConfig.port || 8080,
        username: qbConfig.username || 'admin',
        password: qbConfig.password || '',
        useSsl: qbConfig.useSsl || false
      });

      // Test the connection
      const testResult = await newClient.testConnection();

      if (!testResult.success) {
        throw new Error(testResult.error || 'Connection test failed');
      }

      this.client = newClient;
      this.log(`✅ Connected to qBittorrent ${testResult.version} successfully`);

      // Stop reconnection attempts
      if (this.reconnectInterval) {
        clearInterval(this.reconnectInterval);
        this.reconnectInterval = null;
      }

      // Cache listen port from preferences (not available in server_state)
      try {
        const prefs = await newClient.getPreferences();
        this.cachedListenPort = prefs?.listen_port || 0;
      } catch (err) {
        this.log('⚠️  Could not fetch listen port from preferences:', err.message);
      }

      // Start tracker cache refresh
      this.startTrackerRefresh();

      // Notify connection listeners
      this._onConnectCallbacks.forEach(cb => cb());

      return true;
    } catch (err) {
      this.log('❌ Failed to connect to qBittorrent:', err.message);
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
    const qbConfig = config.getQbittorrentConfig();

    // Don't start if not enabled
    if (!qbConfig || !qbConfig.enabled) {
      this.log('ℹ️  qBittorrent integration is disabled, skipping connection');
      return;
    }

    const connected = await this.initClient();
    if (!connected && !this.reconnectInterval) {
      this.log('🔄 Will retry qBittorrent connection every 30 seconds...');
      this.reconnectInterval = setInterval(async () => {
        // Check if still enabled before retrying
        const currentConfig = config.getQbittorrentConfig();
        if (!currentConfig || !currentConfig.enabled) {
          this.log('ℹ️  qBittorrent disabled, stopping reconnection attempts');
          if (this.reconnectInterval) {
            clearInterval(this.reconnectInterval);
            this.reconnectInterval = null;
          }
          return;
        }
        this.log('🔄 Attempting to reconnect to qBittorrent...');
        await this.initClient();
      }, 30000);
    }
  }

  /**
   * Get current client
   * @returns {QBittorrentClient|null}
   */
  getClient() {
    return this.client;
  }

  /**
   * Check if client is connected
   * @returns {boolean}
   */
  isConnected() {
    return !!this.client && this.client.isConnected();
  }

  /**
   * Check if qBittorrent is enabled in config
   * @returns {boolean}
   */
  isEnabled() {
    const qbConfig = config.getQbittorrentConfig();
    return qbConfig && qbConfig.enabled === true;
  }

  /**
   * Register a callback to be called when qBittorrent connects
   * @param {Function} callback - Callback function
   */
  onConnect(callback) {
    this._onConnectCallbacks.push(callback);
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
      for (const torrent of torrents) {
        const hash = torrent.hash.toLowerCase();
        const trackerCached = this.trackerCache.get(hash);
        torrent.trackersDetailed = trackerCached ? trackerCached.trackers : [];

        const peerCached = this.peerCache.get(hash);
        torrent.peersDetailed = peerCached ? peerCached.peers : [];
      }

      this.lastTorrents = torrents;
      return torrents;
    } catch (err) {
      this.log('❌ Error fetching qBittorrent torrents:', err.message);
      // Connection might be lost, mark as disconnected
      if (err.message.includes('ECONNREFUSED') || err.message.includes('timeout') || err.message.includes('403')) {
        if (this.client) {
          this.client.connected = false;
        }
        this.scheduleReconnect();
      }
      return this.lastTorrents; // Return cached data on error
    }
  }

  /**
   * Start periodic tracker/peer refresh
   */
  startTrackerRefresh() {
    if (this.trackerRefreshInterval) {
      return; // Already running
    }

    this.log('🔄 Starting tracker/peer cache refresh (every 10s)');

    // Schedule periodic refresh
    this.trackerRefreshInterval = setInterval(() => {
      this.refreshAllTrackers();
    }, this.TRACKER_REFRESH_INTERVAL);

    // Do initial refresh
    this.refreshAllTrackers();
  }

  /**
   * Stop periodic tracker refresh
   */
  stopTrackerRefresh() {
    if (this.trackerRefreshInterval) {
      clearInterval(this.trackerRefreshInterval);
      this.trackerRefreshInterval = null;
      this.log('⏹️  Stopped tracker cache refresh');
    }
  }

  /**
   * Refresh trackers and peers for all known torrents
   */
  async refreshAllTrackers() {
    if (!this.client) {
      return;
    }

    try {
      // Get list of all torrent hashes
      const torrents = this.lastTorrents.length > 0
        ? this.lastTorrents
        : await this.client.getTorrents();

      if (torrents.length === 0) {
        return;
      }

      const now = Date.now();

      // Fetch trackers and peers for each torrent
      // qBittorrent API doesn't have batch endpoints, so we do them individually
      // but run them in parallel for efficiency
      const promises = torrents.map(async (torrent) => {
        const hash = torrent.hash.toLowerCase();

        try {
          const [trackers, peers] = await Promise.all([
            this.client.getTorrentTrackers(hash).catch(() => []),
            this.client.getTorrentPeers(hash).catch(() => ({}))
          ]);

          // Update tracker cache
          this.trackerCache.set(hash, {
            trackers: trackers,
            lastUpdated: now
          });

          // Convert peers object to normalized array (matching rTorrent peer format)
          const peersArray = Object.entries(peers).map(([ip, data]) => ({
            address: ip.split(':')[0] || ip,
            port: parseInt(ip.split(':')[1]) || 0,
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
          }));

          // Update peer cache
          this.peerCache.set(hash, {
            peers: peersArray,
            lastUpdated: now
          });
        } catch (err) {
          // Individual torrent fetch failed, skip
        }
      });

      await Promise.all(promises);

      // Clean up cache for torrents that no longer exist
      const currentHashes = new Set(torrents.map(t => t.hash.toLowerCase()));
      for (const hash of this.trackerCache.keys()) {
        if (!currentHashes.has(hash)) {
          this.trackerCache.delete(hash);
        }
      }
      for (const hash of this.peerCache.keys()) {
        if (!currentHashes.has(hash)) {
          this.peerCache.delete(hash);
        }
      }
    } catch (err) {
      this.log('❌ Error refreshing tracker/peer cache:', err.message);
    }
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
      this.log('❌ Error fetching qBittorrent stats:', err.message);
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
   * Add a torrent from magnet link
   * @param {string} magnetUri - Magnet URI
   * @param {Object} options - Options (category, savepath, paused, username)
   */
  async addMagnet(magnetUri, options = {}) {
    if (!this.client) {
      throw new Error('qBittorrent not connected');
    }

    // Build options, only include savepath if explicitly set
    // (otherwise qBittorrent uses the category's configured path)
    // Support both 'directory' and 'savepath' property names for flexibility
    const savePath = options.savepath || options.directory;
    const addOptions = {
      category: options.category,
      paused: options.start === false
    };
    if (savePath) {
      addOptions.savepath = savePath;
    }

    await this.client.addMagnet(magnetUri, addOptions);

    // Track in history
    const { hash, name } = this.parseMagnetUri(magnetUri);
    if (hash) {
      this.trackDownload(hash, name || 'Magnet download', null, options.username, options.category || null);
    }
  }

  /**
   * Add a torrent from raw data (Buffer)
   * @param {Buffer} torrentData - Raw .torrent file contents
   * @param {Object} options - Options (category, savepath, paused, username)
   */
  async addTorrentRaw(torrentData, options = {}) {
    if (!this.client) {
      throw new Error('qBittorrent not connected');
    }

    // Build options, only include savepath if explicitly set
    // (otherwise qBittorrent uses the category's configured path)
    // Support both 'directory' and 'savepath' property names for flexibility
    const savePath = options.savepath || options.directory;
    const addOptions = {
      category: options.category,
      paused: options.start === false
    };
    if (savePath) {
      addOptions.savepath = savePath;
    }

    await this.client.addTorrent(torrentData, addOptions);

    // We don't have an easy way to parse the hash from the torrent buffer here
    // History tracking will happen when we see the torrent appear in the list
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
   * @param {string} name - Category name
   * @param {string} savePath - Download path for this category
   * @returns {Promise<void>}
   */
  async createCategory(name, savePath = '') {
    if (!this.client) {
      throw new Error('qBittorrent not connected');
    }
    await this.client.createCategory(name, savePath);
    this.log(`📁 Created category "${name}" in qBittorrent${savePath ? ` (path: ${savePath})` : ''}`);
  }

  /**
   * Edit/update a category in qBittorrent (update its savePath)
   * @param {string} name - Category name
   * @param {string} savePath - New download path for this category
   * @returns {Promise<void>}
   */
  async editCategory(name, savePath) {
    if (!this.client) {
      throw new Error('qBittorrent not connected');
    }
    await this.client.editCategory(name, savePath);
    this.log(`📁 Updated category "${name}" in qBittorrent (path: ${savePath})`);
  }

  /**
   * Remove categories from qBittorrent
   * @param {string|Array<string>} categories - Category name(s) to remove
   * @returns {Promise<void>}
   */
  async removeCategories(categories) {
    if (!this.client) {
      throw new Error('qBittorrent not connected');
    }
    await this.client.removeCategories(categories);
    const names = Array.isArray(categories) ? categories.join(', ') : categories;
    this.log(`🗑️  Removed category/categories from qBittorrent: ${names}`);
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
      this.log('Failed to get qBittorrent default directory:', err.message);
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
      this.log('❌ Error fetching qBittorrent log:', err.message);
      return '';
    }
  }

  /**
   * Schedule reconnection if not already scheduled
   */
  scheduleReconnect() {
    if (this.reconnectInterval) {
      return; // Already scheduled
    }

    const qbConfig = config.getQbittorrentConfig();
    if (!qbConfig || !qbConfig.enabled) {
      return; // Disabled, don't reconnect
    }

    this.log('🔄 Will retry qBittorrent connection in 30 seconds...');
    this.reconnectInterval = setInterval(async () => {
      const currentConfig = config.getQbittorrentConfig();
      if (!currentConfig || !currentConfig.enabled) {
        if (this.reconnectInterval) {
          clearInterval(this.reconnectInterval);
          this.reconnectInterval = null;
        }
        return;
      }
      this.log('🔄 Attempting to reconnect to qBittorrent...');
      await this.initClient();
    }, 30000);
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    this.log('🛑 Shutting down qBittorrent connection...');

    // Stop tracker refresh
    this.stopTrackerRefresh();

    // Stop reconnection attempts
    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval);
      this.reconnectInterval = null;
    }

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
        this.log('⚠️  Error during qBittorrent client shutdown:', err.message);
      }
      this.client = null;
    }

    this.connectionInProgress = false;
    this.log('✅ qBittorrent connection shutdown complete');
  }
}

module.exports = new QbittorrentManager();
