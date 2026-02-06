/**
 * rtorrent XML-RPC Handler
 *
 * Communicates with rtorrent via XML-RPC protocol
 */

const xmlrpc = require('xmlrpc');
const peerid = require('bittorrent-peerid');
const logger = require('../logger');

class RtorrentHandler {
  constructor(options = {}) {
    this.host = options.host || 'localhost';
    this.port = options.port || 8000;
    this.path = options.path || '/RPC2';
    this.username = options.username || null;
    this.password = options.password || null;

    this.client = null;
    this.connected = false;
  }

  /**
   * Initialize the XML-RPC client
   */
  connect() {
    const clientOptions = {
      host: this.host,
      port: this.port,
      path: this.path
    };

    // Add basic auth if credentials provided
    if (this.username && this.password) {
      clientOptions.basic_auth = {
        user: this.username,
        pass: this.password
      };
    }

    this.client = xmlrpc.createClient(clientOptions);
    return this;
  }

  /**
   * Make an XML-RPC method call
   * @param {string} method - Method name
   * @param {Array} params - Method parameters
   * @returns {Promise<any>}
   */
  call(method, params = []) {
    return new Promise((resolve, reject) => {
      if (!this.client) {
        reject(new Error('Not connected. Call connect() first.'));
        return;
      }

      this.client.methodCall(method, params, (error, value) => {
        if (error) {
          reject(error);
        } else {
          resolve(value);
        }
      });
    });
  }

  /**
   * Batch multiple XML-RPC calls into a single HTTP request using system.multicall
   * @param {Array<{method: string, params: Array}>} calls - Array of method calls
   * @returns {Promise<Array>} Array of results (each result is wrapped in array or contains fault)
   */
  async multicall(calls) {
    if (!calls || calls.length === 0) {
      return [];
    }

    // Format calls for system.multicall: [{methodName, params}, ...]
    const formattedCalls = calls.map(c => ({
      methodName: c.method,
      params: c.params || []
    }));

    const results = await this.call('system.multicall', [formattedCalls]);

    // system.multicall returns [[result1], [result2], ...] or [{faultCode, faultString}]
    return results.map((r, i) => {
      if (r && r.faultCode !== undefined) {
        // This call failed
        return { error: r.faultString || 'Unknown error', faultCode: r.faultCode };
      }
      // Success - result is wrapped in array
      return Array.isArray(r) ? r[0] : r;
    });
  }

  /**
   * Test connection to rtorrent
   * @returns {Promise<{success: boolean, version?: string, error?: string}>}
   */
  async testConnection() {
    try {
      if (!this.client) {
        this.connect();
      }

      const version = await this.call('system.client_version');
      this.connected = true;

      return {
        success: true,
        version: version
      };
    } catch (error) {
      this.connected = false;
      return {
        success: false,
        error: error.message || 'Connection failed'
      };
    }
  }

  /**
   * Parse a single torrent row from d.multicall2 result
   * @param {Array} row - Row data from multicall
   * @returns {Object} Parsed torrent object
   */
  parseTorrentRow(row) {
    const [
      hash,
      name,
      sizeBytes,
      completedBytes,
      downloadRate,
      uploadRate,
      uploadTotal,
      downloadTotal,
      state,
      isActive,
      isOpen,
      isHashChecking,
      complete,
      ratio,
      label,
      directory,
      creationDate,
      timestampStarted,
      timestampFinished,
      peersConnected,
      seeders,
      peersAccounted,
      message,
      isMultiFile,
      hashing,
      priority
    ] = row;

    // Handle null/undefined values and convert to numbers
    const safeSize = parseInt(sizeBytes, 10) || 0;
    const safeCompleted = parseInt(completedBytes, 10) || 0;
    const safeDownRate = parseInt(downloadRate, 10) || 0;
    const safeUpRate = parseInt(uploadRate, 10) || 0;

    // Convert state values to integers for comparison
    const stateInt = parseInt(state, 10) || 0;
    const isActiveInt = parseInt(isActive, 10) || 0;
    const isOpenInt = parseInt(isOpen, 10) || 0;
    const isHashCheckingInt = parseInt(isHashChecking, 10) || 0;
    const completeInt = parseInt(complete, 10) || 0;
    const hashingInt = parseInt(hashing, 10) || 0;

    // Calculate progress
    const progress = safeSize > 0 ? safeCompleted / safeSize : 0;

    // Determine status based on rtorrent state
    // From rtorrent docs (https://kannibalox.github.io/rtorrent-docs/cmd-ref.html):
    // - Stopped/Closed: state=0, is_open=0, is_active=0
    // - Paused: state=1, is_open=1, is_active=0
    // - Active: state=1, is_open=1, is_active=1
    let status = 'unknown';

    if (isHashCheckingInt === 1) {
      status = 'checking';
    } else if (hashingInt > 0) {
      // Queued for hash check (hashing flag set but not actively checking yet)
      status = 'hashing-queued';
    } else if (isOpenInt !== 1) {
      // Closed/stopped
      status = completeInt === 1 ? 'completed' : 'stopped';
    } else if (isActiveInt !== 1) {
      // Open but not active = paused
      status = 'paused';
    } else {
      // Open and active
      status = completeInt === 1 ? 'seeding' : 'downloading';
    }

    return {
      hash: (hash || '').toUpperCase(),
      name: name || `[Magnet] ${(hash || '').substring(0, 8)}...`,
      size: safeSize,
      completedBytes: safeCompleted,
      progress,
      downloadSpeed: safeDownRate,
      uploadSpeed: safeUpRate,
      downloadTotal: parseInt(downloadTotal, 10) || 0,
      uploadTotal: parseInt(uploadTotal, 10) || 0,
      status,
      state: stateInt,
      isActive: isActiveInt === 1,
      isComplete: completeInt === 1,
      ratio: ratio ? parseInt(ratio, 10) / 1000 : 0, // rtorrent stores ratio * 1000
      label: label || '',
      directory: directory || '',
      creationDate: creationDate ? new Date(parseInt(creationDate, 10) * 1000) : null,
      startedTime: timestampStarted ? new Date(parseInt(timestampStarted, 10) * 1000) : null,
      finishedTime: timestampFinished ? new Date(parseInt(timestampFinished, 10) * 1000) : null,
      peers: {
        connected: parseInt(peersConnected, 10) || 0,
        seeders: parseInt(seeders, 10) || 0,
        total: parseInt(peersAccounted, 10) || 0
      },
      message: message || '',  // Tracker/download message (errors, etc.)
      isMultiFile: parseInt(isMultiFile, 10) === 1,
      priority: parseInt(priority, 10) || 0,  // 0=off, 1=low, 2=normal, 3=high
      clientType: 'rtorrent'
    };
  }

  /**
   * Get all downloads with details using d.multicall2
   * This is much more efficient than individual calls - single request for all torrents
   * @returns {Promise<Object[]>}
   */
  async getAllDownloads() {
    try {
      // Use d.multicall2 to fetch all torrents at once
      const result = await this.call('d.multicall2', [
        '',      // empty string for first arg
        'main',  // view name
        'd.hash=',
        'd.name=',
        'd.size_bytes=',
        'd.completed_bytes=',
        'd.down.rate=',
        'd.up.rate=',
        'd.up.total=',
        'd.down.total=',
        'd.state=',
        'd.is_active=',
        'd.is_open=',
        'd.is_hash_checking=',
        'd.complete=',
        'd.ratio=',
        'd.custom1=',        // Label
        'd.directory=',
        'd.creation_date=',
        'd.timestamp.started=',
        'd.timestamp.finished=',
        'd.peers_connected=',
        'd.peers_complete=',  // Seeders
        'd.peers_accounted=',
        'd.message=',         // Tracker/download message (errors, etc.)
        'd.is_multi_file=',   // Whether torrent has multiple files
        'd.hashing=',         // Hashing state: 0=none, 1=initial, 2=end-game, 3=rehash
        'd.priority='         // Priority: 0=off, 1=low, 2=normal, 3=high
      ]);

      if (!result || !Array.isArray(result)) {
        return [];
      }

      // Parse all torrent rows
      return result.map(row => this.parseTorrentRow(row)).filter(d => d !== null);
    } catch (err) {
      logger.warn('Error in getAllDownloads:', err.message);
      return [];
    }
  }

  /**
   * Parse raw tracker data into structured object
   * @private
   */
  _parseTrackerRow(t) {
    const [
      url,
      isEnabled,
      isUsable,
      type,
      seeders,
      leechers,
      downloaded,
      failedCount,
      successCount,
      lastActivity,
      nextActivity
    ] = t;

    // Determine status based on counters and usability
    let status = 'unknown';
    if (!isEnabled) {
      status = 'disabled';
    } else if (isUsable && successCount > 0) {
      status = 'working';
    } else if (failedCount > 0 && successCount === 0) {
      status = 'error';
    } else if (failedCount > successCount) {
      status = 'unreliable';
    } else if (successCount > 0) {
      status = 'working';
    } else {
      status = 'not_contacted';
    }

    // Type: 1=http, 2=udp, 3=dht
    const typeNames = { 1: 'http', 2: 'udp', 3: 'dht' };

    return {
      url,
      enabled: !!isEnabled,
      usable: !!isUsable,
      type: typeNames[type] || 'unknown',
      status,
      message: '',
      // Use scrapeComplete/scrapeIncomplete/scrapeDownloaded to match frontend expectations
      // Keep -1 as-is (means "not available") so frontend can display "-"
      scrapeComplete: parseInt(seeders, 10),
      scrapeIncomplete: parseInt(leechers, 10),
      scrapeDownloaded: parseInt(downloaded, 10),
      failedCount: parseInt(failedCount, 10) || 0,
      successCount: parseInt(successCount, 10) || 0,
      lastActivity: lastActivity ? new Date(parseInt(lastActivity, 10) * 1000) : null,
      nextActivity: nextActivity ? new Date(parseInt(nextActivity, 10) * 1000) : null
    };
  }

  /**
   * Get detailed tracker info for ALL torrents in a single batched request
   * Uses system.multicall to batch all t.multicall calls into one HTTP request
   * @param {string[]} hashes - Array of torrent hashes
   * @returns {Promise<Map<string, Object[]>>} Map of hash -> tracker array
   */
  async getAllTrackersDetailed(hashes) {
    if (!hashes || hashes.length === 0) {
      return new Map();
    }

    try {
      // Build batch of t.multicall calls for each hash
      const calls = hashes.map(hash => ({
        method: 't.multicall',
        params: [
          hash,
          '',
          't.url=',
          't.is_enabled=',
          't.is_usable=',
          't.type=',
          't.scrape_complete=',
          't.scrape_incomplete=',
          't.scrape_downloaded=',
          't.failed_counter=',
          't.success_counter=',
          't.activity_time_last=',
          't.activity_time_next='
        ]
      }));

      // Execute all calls in one HTTP request
      const results = await this.multicall(calls);

      // Build result map
      const trackersMap = new Map();
      hashes.forEach((hash, index) => {
        const result = results[index];
        if (result && result.error) {
          trackersMap.set(hash, []);
        } else if (Array.isArray(result)) {
          const trackers = result
            .map(t => this._parseTrackerRow(t))
            .filter(t => t.url && (t.url.startsWith('http') || t.url.startsWith('udp')));
          trackersMap.set(hash, trackers);
        } else {
          trackersMap.set(hash, []);
        }
      });

      return trackersMap;
    } catch (err) {
      logger.warn('Error in getAllTrackersDetailed:', err.message);
      // Return empty map on error
      return new Map(hashes.map(h => [h, []]));
    }
  }

  /**
   * Parse raw peer data into structured object
   * @private
   */
  _parsePeerRow(p) {
    const [
      address,
      clientVersion,
      peerId,
      completedPercent,
      downRate,
      upRate,
      downTotal,
      upTotal,
      peerRate,
      peerTotal,
      isEncrypted,
      isIncoming,
      port
    ] = p;

    // Build flags string similar to ruTorrent
    const flags = [];
    if (isEncrypted) flags.push('E');
    if (isIncoming) flags.push('I');

    // Determine client name using bittorrent-peerid library
    // 1. First try to decode peer ID with the library (most accurate)
    // 2. Fall back to rtorrent's clientVersion if decode fails
    // 3. Last resort: "Unknown"
    let client = 'Unknown';

    if (peerId && peerId.length >= 8) {
      try {
        // Convert peer ID string to Buffer for the library
        // Peer IDs can come as hex strings or raw bytes
        let peerIdBuffer;
        if (peerId.length === 40 && /^[0-9A-Fa-f]+$/.test(peerId)) {
          // Hex-encoded peer ID
          peerIdBuffer = Buffer.from(peerId, 'hex');
        } else {
          // Raw string (may contain binary data)
          peerIdBuffer = Buffer.from(peerId, 'binary');
        }

        const decoded = peerid(peerIdBuffer);
        if (decoded && decoded.client && decoded.client !== 'unknown') {
          client = decoded.version ? `${decoded.client} ${decoded.version}` : decoded.client;
        }
      } catch (e) {
        // Decoding failed, will fall back below
      }
    }

    // If library couldn't decode, try rtorrent's clientVersion
    if (client === 'Unknown' && clientVersion && clientVersion.length > 0) {
      // Check if clientVersion looks valid (starts with letter, no control chars)
      if (/^[a-zA-Z]/.test(clientVersion) && !/[\x00-\x1F]/.test(clientVersion)) {
        client = clientVersion;
      }
    }

    return {
      address: address || '',
      port: parseInt(port, 10) || 0,
      client: client,
      peerId: peerId || '',
      flags: flags.join(''),
      completedPercent: parseInt(completedPercent, 10) || 0,
      downloadRate: parseInt(downRate, 10) || 0,
      uploadRate: parseInt(upRate, 10) || 0,
      downloadTotal: parseInt(downTotal, 10) || 0,
      uploadTotal: parseInt(upTotal, 10) || 0,
      peerDownloadRate: parseInt(peerRate, 10) || 0,
      peerDownloadTotal: parseInt(peerTotal, 10) || 0,
      isEncrypted: !!isEncrypted,
      isIncoming: !!isIncoming
    };
  }

  /**
   * Get detailed peer info for ALL torrents in a single batched request
   * Uses system.multicall to batch all p.multicall calls into one HTTP request
   * @param {string[]} hashes - Array of torrent hashes
   * @returns {Promise<Map<string, Object[]>>} Map of hash -> peers array
   */
  async getAllPeersDetailed(hashes) {
    if (!hashes || hashes.length === 0) {
      return new Map();
    }

    try {
      // Build batch of p.multicall calls for each hash
      const calls = hashes.map(hash => ({
        method: 'p.multicall',
        params: [
          hash,
          '',
          'p.address=',
          'p.client_version=',
          'p.id=',
          'p.completed_percent=',
          'p.down_rate=',
          'p.up_rate=',
          'p.down_total=',
          'p.up_total=',
          'p.peer_rate=',
          'p.peer_total=',
          'p.is_encrypted=',
          'p.is_incoming=',
          'p.port='
        ]
      }));

      // Execute all calls in one HTTP request
      const results = await this.multicall(calls);

      // Build result map
      const peersMap = new Map();
      hashes.forEach((hash, index) => {
        const result = results[index];
        if (result && result.error) {
          peersMap.set(hash, []);
        } else if (Array.isArray(result)) {
          const peers = result.map(p => this._parsePeerRow(p));
          peersMap.set(hash, peers);
        } else {
          peersMap.set(hash, []);
        }
      });

      return peersMap;
    } catch (err) {
      logger.warn('Error in getAllPeersDetailed:', err.message);
      return new Map(hashes.map(h => [h, []]));
    }
  }

  /**
   * Get global transfer stats
   * @returns {Promise<Object>}
   */
  async getGlobalStats() {
    const results = await this.multicall([
      { method: 'throttle.global_down.rate', params: [] },
      { method: 'throttle.global_up.rate', params: [] },
      { method: 'throttle.global_down.total', params: [] },
      { method: 'throttle.global_up.total', params: [] },
      { method: 'network.port_open', params: [] },
      { method: 'network.listen.port', params: [] },
      { method: 'system.pid', params: [] }
    ]);

    return {
      downloadSpeed: parseInt(results[0], 10) || 0,
      uploadSpeed: parseInt(results[1], 10) || 0,
      downloadTotal: parseInt(results[2], 10) || 0,
      uploadTotal: parseInt(results[3], 10) || 0,
      portOpen: results[4] === 1 || results[4] === '1',
      listenPort: parseInt(results[5], 10) || 0,
      pid: parseInt(results[6], 10) || 0  // Process ID - changes on restart
    };
  }

  /**
   * Get the default download directory configured in rTorrent
   * @returns {Promise<string>} Default directory path
   */
  async getDefaultDirectory() {
    try {
      const result = await this.call('directory.default');
      return result || '';
    } catch (err) {
      logger.warn('Error getting default directory:', err.message);
      return '';
    }
  }

  /**
   * Get files for a torrent
   * @param {string} hash - Torrent info hash
   * @returns {Promise<Array>} Array of file objects with path, size, progress, priority
   */
  async getFiles(hash) {
    try {
      const result = await this.call('f.multicall', [
        hash,
        '',
        'f.path=',
        'f.size_bytes=',
        'f.completed_chunks=',
        'f.size_chunks=',
        'f.priority='
      ]);

      if (!result || !Array.isArray(result)) {
        return [];
      }

      return result.map((row, index) => {
        const [path, sizeBytes, completedChunks, totalChunks, priority] = row;
        const progress = totalChunks > 0 ? (completedChunks / totalChunks) * 100 : 0;

        return {
          index,
          path: path || '',
          size: parseInt(sizeBytes, 10) || 0,
          progress: Math.round(progress * 100) / 100,
          priority: parseInt(priority, 10) || 0,
          completedChunks: parseInt(completedChunks, 10) || 0,
          totalChunks: parseInt(totalChunks, 10) || 0
        };
      });
    } catch (err) {
      logger.warn('Error in getFiles:', err.message);
      return [];
    }
  }

  /**
   * Start a download
   * @param {string} hash - Torrent info hash
   */
  async startDownload(hash) {
    // d.open: opens files on disk (no-op if already open)
    // d.start: sets state=1, adds to started view (macro, does NOT set is_active)
    // d.resume: sets is_active=1, starts transfers (the actual low-level activation)
    await this.call('d.open', [hash]);
    await this.call('d.start', [hash]);
    await this.call('d.resume', [hash]);
  }

  /**
   * Stop/pause a download
   * @param {string} hash - Torrent info hash
   */
  async stopDownload(hash) {
    await this.call('d.stop', [hash]);
  }

  /**
   * Close/stop a download (fully closes the torrent)
   * @param {string} hash - Torrent info hash
   */
  async closeDownload(hash) {
    await this.call('d.close', [hash]);
  }

  /**
   * Remove a download (keeps files)
   * @param {string} hash - Torrent info hash
   */
  async removeDownload(hash) {
    await this.call('d.erase', [hash]);
  }

  /**
   * Get download path info (for path translation before deletion)
   * @param {string} hash - Torrent info hash
   * @returns {Promise<Object>} { basePath, isMultiFile }
   */
  async getDownloadPathInfo(hash) {
    const basePath = await this.call('d.base_path', [hash]);
    const isMultiFile = await this.call('d.is_multi_file', [hash]);
    return { basePath, isMultiFile };
  }

  /**
   * Set label/category for a download
   * @param {string} hash - Torrent info hash
   * @param {string} label - Label to set
   */
  async setLabel(hash, label) {
    await this.call('d.custom1.set', [hash, label]);
  }

  /**
   * Set priority for a download
   * @param {string} hash - Torrent info hash
   * @param {number} priority - Priority (0=off, 1=low, 2=normal, 3=high)
   */
  async setPriority(hash, priority) {
    // Ensure priority is within valid range
    const validPriority = Math.max(0, Math.min(3, parseInt(priority, 10) || 2));
    await this.call('d.priority.set', [hash, validPriority]);
  }

  /**
   * Set both label and priority for a download
   * More efficient than separate calls when both need to be set
   * @param {string} hash - Torrent info hash
   * @param {string} label - Label to set
   * @param {number} priority - Priority (0=off, 1=low, 2=normal, 3=high)
   */
  async setLabelAndPriority(hash, label, priority) {
    const validPriority = Math.max(0, Math.min(3, parseInt(priority, 10) || 2));
    await this.multicall([
      { method: 'd.custom1.set', params: [hash, label] },
      { method: 'd.priority.set', params: [hash, validPriority] }
    ]);
  }

  /**
   * Add a torrent from raw data (Buffer)
   * Use this when rtorrent doesn't have filesystem access to the torrent file
   * @param {Buffer} torrentData - Raw .torrent file contents
   * @param {Object} options - Options (label, directory, start, priority)
   */
  async addTorrentRaw(torrentData, options = {}) {
    // Use load.raw_start for immediate start, load.raw to add paused
    const method = options.start !== false ? 'load.raw_start' : 'load.raw';

    // The raw torrent data needs to be passed as a buffer
    const params = ['', torrentData];

    // Add custom commands if options provided
    if (options.label) {
      params.push(`d.custom1.set="${options.label}"`);
    }
    if (options.directory) {
      params.push(`d.directory.set="${options.directory}"`);
    }
    if (options.priority !== undefined && options.priority !== null) {
      // Priority: 0=off, 1=low, 2=normal, 3=high
      const validPriority = Math.max(0, Math.min(3, parseInt(options.priority, 10) || 2));
      params.push(`d.priority.set=${validPriority}`);
    }

    await this.call(method, params);
  }

  /**
   * Add a torrent from a magnet link
   * @param {string} magnetUri - Magnet URI
   * @param {Object} options - Options (label, directory, priority)
   */
  async addMagnet(magnetUri, options = {}) {
    const method = options.start !== false ? 'load.start' : 'load.normal';

    const params = ['', magnetUri];

    if (options.label) {
      params.push(`d.custom1.set="${options.label}"`);
    }
    if (options.directory) {
      params.push(`d.directory.set="${options.directory}"`);
    }
    if (options.priority !== undefined && options.priority !== null) {
      // Priority: 0=off, 1=low, 2=normal, 3=high
      const validPriority = Math.max(0, Math.min(3, parseInt(options.priority, 10) || 2));
      params.push(`d.priority.set=${validPriority}`);
    }

    await this.call(method, params);
  }

  /**
   * Close the connection
   */
  disconnect() {
    this.client = null;
    this.connected = false;
  }
}

module.exports = RtorrentHandler;
