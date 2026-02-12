/**
 * rtorrent Client Management Module
 * Handles rtorrent connection, reconnection, and data retrieval
 */

const crypto = require('crypto');
const RtorrentHandler = require('../lib/rtorrent/RtorrentHandler');
const config = require('./config');
const BaseModule = require('../lib/BaseModule');
const logger = require('../lib/logger');


class RtorrentManager extends BaseModule {
  constructor() {
    super();
    this.client = null;
    this.reconnectInterval = null;
    this.connectionInProgress = false;
    this.lastDownloads = [];
    this.lastStats = null;

    // Tracker cache: Map<hash, { trackers: string[], trackersDetailed: Object[], lastUpdated: number }>
    this.trackerCache = new Map();
    // Peer cache: Map<hash, { peers: Object[], lastUpdated: number }>
    this.peerCache = new Map();
    this.trackerRefreshInterval = null;
    this.TRACKER_REFRESH_INTERVAL = 10000; // Refresh trackers every 10 seconds (batched calls are efficient)

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
      logger.warn('[rtorrentManager] Failed to parse magnet URI:', err.message);
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
   * Parse torrent file buffer to extract info hash, name, and size
   * Uses minimal bencode parsing
   * @param {Buffer} torrentData - Raw torrent file data
   * @returns {Object} { hash, name, size }
   */
  parseTorrentBuffer(torrentData) {
    let hash = null;
    let name = null;
    let size = null;

    try {
      // Find the info dictionary in the torrent
      const dataStr = torrentData.toString('binary');
      const infoStart = dataStr.indexOf('4:info');

      if (infoStart !== -1) {
        // Find the info dict boundaries
        const dictStart = infoStart + 6; // After "4:info"

        // Extract the info dictionary for hashing
        // We need to find the matching end of the dictionary
        let depth = 0;
        let pos = dictStart;
        let foundStart = false;

        while (pos < dataStr.length) {
          const char = dataStr[pos];
          if (char === 'd' || char === 'l') {
            if (!foundStart) foundStart = true;
            depth++;
          } else if (char === 'e') {
            depth--;
            if (foundStart && depth === 0) {
              pos++; // Include the final 'e'
              break;
            }
          } else if (char >= '0' && char <= '9') {
            // String length prefix - skip the string
            let lenStr = '';
            while (pos < dataStr.length && dataStr[pos] >= '0' && dataStr[pos] <= '9') {
              lenStr += dataStr[pos];
              pos++;
            }
            pos++; // Skip the ':'
            pos += parseInt(lenStr, 10); // Skip the string content
            continue;
          } else if (char === 'i') {
            // Integer - skip to 'e'
            while (pos < dataStr.length && dataStr[pos] !== 'e') pos++;
          }
          pos++;
        }

        // Extract info dict and compute SHA1 hash
        const infoDict = torrentData.slice(dictStart, pos);
        hash = crypto.createHash('sha1').update(infoDict).digest('hex').toLowerCase();

        // Try to extract name from the info dict
        const nameMatch = dataStr.match(/4:name(\d+):/);
        if (nameMatch) {
          const nameLen = parseInt(nameMatch[1], 10);
          const nameStart = dataStr.indexOf(nameMatch[0]) + nameMatch[0].length;
          name = dataStr.slice(nameStart, nameStart + nameLen);
        }

        // Try to extract size
        // Single file: look for "6:lengthi<number>e" (but not inside files list)
        // Multi-file: sum all lengths in "5:files" list
        const filesMatch = dataStr.indexOf('5:filesl');
        if (filesMatch !== -1 && filesMatch > infoStart) {
          // Multi-file torrent: sum all file lengths
          // Find all "6:lengthi<number>e" patterns after "5:files"
          const lengthRegex = /6:lengthi(\d+)e/g;
          let match;
          let totalSize = 0;
          // Start searching from files list position
          const filesSection = dataStr.slice(filesMatch);
          while ((match = lengthRegex.exec(filesSection)) !== null) {
            totalSize += parseInt(match[1], 10);
          }
          if (totalSize > 0) {
            size = totalSize;
          }
        } else {
          // Single file: look for length field
          const lengthMatch = dataStr.match(/6:lengthi(\d+)e/);
          if (lengthMatch) {
            size = parseInt(lengthMatch[1], 10);
          }
        }
      }
    } catch (err) {
      logger.warn('[rtorrentManager] Failed to parse torrent file:', err.message);
    }

    return { hash, name, size };
  }

  /**
   * Track a download in history
   * @param {string} hash - Info hash
   * @param {string} name - Torrent name
   * @param {number} size - Size in bytes (optional)
   * @param {string} username - Username (optional)
   * @param {string} category - Category/label name (optional)
   */
  trackDownload(hash, name, size = null, username = null, category = null) {
    if (!this.isHistoryEnabled() || !hash) return;

    try {
      this.log(`📜 History: tracking rtorrent download - hash: ${hash}, name: ${name}, size: ${size}`);
      this.downloadHistoryDB.addDownload(hash, name || 'Unknown', size, username, 'rtorrent', category);
    } catch (err) {
      logger.warn('[rtorrentManager] Failed to track download:', err.message);
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
      logger.warn('[rtorrentManager] Failed to track deletion:', err.message);
    }
  }

  /**
   * Initialize rtorrent client
   * @returns {Promise<boolean>} True if connection successful
   */
  async initClient() {
    // Prevent concurrent connection attempts
    if (this.connectionInProgress) {
      this.log('⚠️  rtorrent connection attempt already in progress, skipping...');
      return false;
    }

    const rtorrentConfig = config.getRtorrentConfig();

    // Check if rtorrent is enabled and configured
    if (!rtorrentConfig || !rtorrentConfig.enabled) {
      this.log('ℹ️  rtorrent integration is disabled');
      return false;
    }

    if (!rtorrentConfig.host) {
      this.log('⚠️  rtorrent host not configured');
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

      this.log(`🔌 Creating new rtorrent client (${rtorrentConfig.host}:${rtorrentConfig.port}${rtorrentConfig.path})...`);

      const newClient = new RtorrentHandler({
        host: rtorrentConfig.host,
        port: rtorrentConfig.port || 8000,
        path: rtorrentConfig.path || '/RPC2',
        username: rtorrentConfig.username || null,
        password: rtorrentConfig.password || null
      });

      newClient.connect();

      // Test the connection
      const testResult = await newClient.testConnection();

      if (!testResult.success) {
        throw new Error(testResult.error || 'Connection test failed');
      }

      this.client = newClient;
      this.log(`✅ Connected to rtorrent ${testResult.version} successfully`);

      // Stop reconnection attempts
      if (this.reconnectInterval) {
        clearInterval(this.reconnectInterval);
        this.reconnectInterval = null;
      }

      // Start tracker cache refresh (await initial refresh)
      await this.startTrackerRefresh();

      // Notify connection listeners
      this._onConnectCallbacks.forEach(cb => cb());

      return true;
    } catch (err) {
      this.log('❌ Failed to connect to rtorrent:', err.message);
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
    const rtorrentConfig = config.getRtorrentConfig();

    // Don't start if not enabled
    if (!rtorrentConfig || !rtorrentConfig.enabled) {
      this.log('ℹ️  rtorrent integration is disabled, skipping connection');
      return;
    }

    const connected = await this.initClient();
    if (!connected && !this.reconnectInterval) {
      this.log('🔄 Will retry rtorrent connection every 30 seconds...');
      this.reconnectInterval = setInterval(async () => {
        // Check if still enabled before retrying
        const currentConfig = config.getRtorrentConfig();
        if (!currentConfig || !currentConfig.enabled) {
          this.log('ℹ️  rtorrent disabled, stopping reconnection attempts');
          if (this.reconnectInterval) {
            clearInterval(this.reconnectInterval);
            this.reconnectInterval = null;
          }
          return;
        }
        this.log('🔄 Attempting to reconnect to rtorrent...');
        await this.initClient();
      }, 30000);
    }
  }

  /**
   * Get current client
   * @returns {RtorrentHandler|null}
   */
  getClient() {
    return this.client;
  }

  /**
   * Check if client is connected
   * @returns {boolean}
   */
  isConnected() {
    return !!this.client && this.client.connected;
  }

  /**
   * Check if rtorrent is enabled in config
   * @returns {boolean}
   */
  isEnabled() {
    const rtorrentConfig = config.getRtorrentConfig();
    return rtorrentConfig && rtorrentConfig.enabled === true;
  }

  /**
   * Register a callback to be called when rtorrent connects
   * @param {Function} callback - Callback function
   */
  onConnect(callback) {
    this._onConnectCallbacks.push(callback);
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
      downloads.forEach(download => {
        const trackerCached = this.trackerCache.get(download.hash);
        download.trackers = trackerCached ? trackerCached.trackers : [];
        download.trackersDetailed = trackerCached ? trackerCached.trackersDetailed : [];

        const peerCached = this.peerCache.get(download.hash);
        download.peersDetailed = peerCached ? peerCached.peers : [];
      });

      this.lastDownloads = downloads;
      return downloads;
    } catch (err) {
      this.log('❌ Error fetching rtorrent downloads:', err.message);
      // Connection might be lost, mark as disconnected
      if (err.message.includes('ECONNREFUSED') || err.message.includes('socket hang up')) {
        this.client = null;
        this.scheduleReconnect();
      }
      return this.lastDownloads; // Return cached data on error
    }
  }

  /**
   * Start periodic tracker refresh
   */
  async startTrackerRefresh() {
    if (this.trackerRefreshInterval) {
      return; // Already running
    }

    this.log('🔄 Starting tracker cache refresh (every 10s)');

    // Do initial refresh and wait for it to complete
    await this.refreshAllTrackers();

    // Schedule periodic refresh
    this.trackerRefreshInterval = setInterval(() => {
      this.refreshAllTrackers();
    }, this.TRACKER_REFRESH_INTERVAL);
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
   * Uses batched system.multicall for efficiency - 2 HTTP requests instead of N*2
   */
  async refreshAllTrackers() {
    if (!this.client) {
      return;
    }

    try {
      // Get list of all torrent hashes
      const downloads = this.lastDownloads.length > 0
        ? this.lastDownloads
        : await this.client.getAllDownloads();

      if (downloads.length === 0) {
        return;
      }

      const hashes = downloads.map(d => d.hash);
      let totalTrackers = 0;
      let totalPeers = 0;

      // Fetch all trackers and peers in just 2 batched HTTP requests
      const [trackersMap, peersMap] = await Promise.all([
        this.client.getAllTrackersDetailed(hashes).catch(() => new Map()),
        this.client.getAllPeersDetailed(hashes).catch(() => new Map())
      ]);

      // Update caches from batched results
      const now = Date.now();
      for (const download of downloads) {
        const trackersDetailed = trackersMap.get(download.hash) || [];
        const peersDetailed = peersMap.get(download.hash) || [];

        // Extract simple tracker URLs from detailed data
        const trackers = trackersDetailed
          .filter(t => t.enabled)
          .map(t => t.url);

        this.trackerCache.set(download.hash, {
          trackers,
          trackersDetailed,
          lastUpdated: now
        });
        this.peerCache.set(download.hash, {
          peers: peersDetailed,
          lastUpdated: now
        });

        totalTrackers += trackers.length;
        totalPeers += peersDetailed.length;
      }

      // this.log(`🔄 Cache refreshed: ${downloads.length} torrents, ${totalTrackers} trackers, ${totalPeers} peers (batched)`);

      // Clean up cache for torrents that no longer exist
      const currentHashes = new Set(hashes);
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
      this.log('❌ Error fetching rtorrent stats:', err.message);
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
      this.log('❌ Error fetching rtorrent default directory:', err.message);
      return '';
    }
  }

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
   * Add a torrent from magnet link
   * @param {string} magnetUri - Magnet URI
   * @param {Object} options - Options (label, directory, start, username)
   */
  async addMagnet(magnetUri, options = {}) {
    if (!this.client) {
      throw new Error('rtorrent not connected');
    }

    await this.client.addMagnet(magnetUri, options);

    // Track in history
    const { hash, name } = this.parseMagnetUri(magnetUri);
    if (hash) {
      this.trackDownload(hash, name || 'Magnet download', null, options.username, options.label || null);
    }
  }

  /**
   * Add a torrent from raw data (Buffer)
   * Use this when rtorrent doesn't have filesystem access to the torrent file
   * @param {Buffer} torrentData - Raw .torrent file contents
   * @param {Object} options - Options (label, directory, start, username)
   */
  async addTorrentRaw(torrentData, options = {}) {
    if (!this.client) {
      throw new Error('rtorrent not connected');
    }

    await this.client.addTorrentRaw(torrentData, options);

    // Track in history
    const { hash, name, size } = this.parseTorrentBuffer(torrentData);
    if (hash) {
      this.trackDownload(hash, name || 'Torrent download', size, options.username, options.label || null);
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
   * Schedule reconnection if not already scheduled
   */
  scheduleReconnect() {
    if (this.reconnectInterval) {
      return; // Already scheduled
    }

    const rtorrentConfig = config.getRtorrentConfig();
    if (!rtorrentConfig || !rtorrentConfig.enabled) {
      return; // Disabled, don't reconnect
    }

    this.log('🔄 Will retry rtorrent connection in 30 seconds...');
    this.reconnectInterval = setInterval(async () => {
      const currentConfig = config.getRtorrentConfig();
      if (!currentConfig || !currentConfig.enabled) {
        if (this.reconnectInterval) {
          clearInterval(this.reconnectInterval);
          this.reconnectInterval = null;
        }
        return;
      }
      this.log('🔄 Attempting to reconnect to rtorrent...');
      await this.initClient();
    }, 30000);
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    this.log('🛑 Shutting down rtorrent connection...');

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
        this.client.disconnect();
      } catch (err) {
        this.log('⚠️  Error during rtorrent client shutdown:', err.message);
      }
      this.client = null;
    }

    this.connectionInProgress = false;
    this.log('✅ rtorrent connection shutdown complete');
  }
}

module.exports = new RtorrentManager();
