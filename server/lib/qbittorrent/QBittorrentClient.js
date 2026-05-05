/**
 * QBittorrentClient - HTTP client for qBittorrent WebUI API v2
 *
 * Communicates with qBittorrent's WebUI API to fetch and manage torrents.
 * This is separate from QBittorrentHandler.js which provides *arr compatibility API.
 */

const logger = require('../logger');

class QBittorrentClient {
  constructor(options = {}) {
    this.host = options.host || 'localhost';
    this.port = options.port || 8080;
    this.path = (options.path || '').replace(/\/+$/, ''); // strip trailing slashes
    this.username = options.username || 'admin';
    this.password = options.password || '';
    this.useSsl = options.useSsl || false;

    this.baseUrl = `${this.useSsl ? 'https' : 'http'}://${this.host}:${this.port}${this.path}`;
    this.sid = null; // Session cookie value
    this.sidName = null; // Session cookie name: 'SID' on qBittorrent < 5.x, 'QBT_SID_<port>' on 5.x+
    this.connected = false;
  }

  // ============================================================================
  // HTTP HELPERS
  // ============================================================================

  /**
   * Make an HTTP request to the qBittorrent API
   * @param {string} endpoint - API endpoint (e.g., '/api/v2/torrents/info')
   * @param {Object} options - Fetch options
   * @returns {Promise<Response>}
   */
  async _fetch(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;

    const headers = {
      ...options.headers
    };

    // Include session cookie if we have one
    if (this.sid) {
      headers['Cookie'] = `${this.sidName}=${this.sid}`;
    }

    const fetchOptions = {
      ...options,
      headers,
      signal: AbortSignal.timeout(options.timeout || 30000)
    };

    try {
      const response = await fetch(url, fetchOptions);

      // Check for session expiry
      if (response.status === 403) {
        // Session expired, try to re-authenticate
        this.sid = null;
        this.sidName = null;
        this.connected = false;
      }

      return response;
    } catch (err) {
      if (err.name === 'AbortError' || err.message.includes('timeout')) {
        throw new Error(`Connection timeout to ${this.host}:${this.port}`);
      }
      throw err;
    }
  }

  /**
   * Make a GET request
   * @param {string} endpoint - API endpoint
   * @param {Object} params - Query parameters
   * @returns {Promise<any>}
   */
  async _get(endpoint, params = {}) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        searchParams.append(key, value);
      }
    }

    const queryString = searchParams.toString();
    const url = queryString ? `${endpoint}?${queryString}` : endpoint;

    const response = await this._fetch(url, { method: 'GET' });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return response.json();
    }
    return response.text();
  }

  /**
   * Make a POST request with form data
   * @param {string} endpoint - API endpoint
   * @param {Object} data - Form data
   * @returns {Promise<any>}
   */
  async _post(endpoint, data = {}) {
    const formData = new URLSearchParams();
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && value !== null) {
        formData.append(key, value);
      }
    }

    const response = await this._fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData.toString()
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    }

    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return response.json();
    }
    return response.text();
  }

  /**
   * Make a POST request with multipart form data (for file uploads)
   * @param {string} endpoint - API endpoint
   * @param {FormData} formData - FormData object
   * @returns {Promise<any>}
   */
  async _postMultipart(endpoint, formData) {
    const headers = {};
    if (this.sid) {
      headers['Cookie'] = `${this.sidName}=${this.sid}`;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers,
      body: formData,
      signal: AbortSignal.timeout(60000) // Longer timeout for file uploads
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    }

    return response.text();
  }

  // ============================================================================
  // AUTHENTICATION
  // ============================================================================

  /**
   * Login to qBittorrent
   * @returns {Promise<boolean>} True if login successful
   */
  async login() {
    try {
      const response = await this._fetch('/api/v2/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: `username=${encodeURIComponent(this.username)}&password=${encodeURIComponent(this.password)}`
      });

      if (!response.ok) {
        throw new Error(`Login failed: HTTP ${response.status}`);
      }

      const text = await response.text();

      // qBittorrent < 5.2 returns 200 + "Fails." on bad credentials.
      // qBittorrent 5.2+ returns 401 (handled above by !response.ok).
      if (text === 'Fails.') {
        throw new Error('Login failed: Invalid credentials');
      }

      // Cookie name varies: "SID" on < 5.2 (also user-configurable on 5.1.x),
      // "QBT_SID_<port>" on 5.2+. Trust whatever the server sets.
      const setCookie = response.headers.get('set-cookie');
      if (setCookie) {
        const sidMatch = setCookie.match(/^\s*([^=;\s]+)=([^;]+)/);
        if (sidMatch) {
          this.sidName = sidMatch[1];
          this.sid = sidMatch[2];
          this.connected = true;
          return true;
        }
      }
      // Some setups don't issue a cookie (e.g. localhost auth bypass)
      this.connected = true;
      return true;
    } catch (err) {
      this.connected = false;
      throw err;
    }
  }

  /**
   * Logout from qBittorrent
   * @returns {Promise<void>}
   */
  async logout() {
    try {
      await this._post('/api/v2/auth/logout');
    } catch (err) {
      // Ignore logout errors
    } finally {
      this.sid = null;
      this.sidName = null;
      this.connected = false;
    }
  }

  /**
   * Ensure we're logged in, login if not
   * @returns {Promise<void>}
   */
  async ensureLoggedIn() {
    if (!this.connected || !this.sid) {
      await this.login();
    }
  }

  // ============================================================================
  // DATA RETRIEVAL
  // ============================================================================

  /**
   * Get all torrents
   * @param {Object} options - Filter options
   * @returns {Promise<Array>} Array of torrent objects
   */
  async getTorrents(options = {}) {
    await this.ensureLoggedIn();
    return this._get('/api/v2/torrents/info', options);
  }

  /**
   * Get peers for a specific torrent
   * @param {string} hash - Torrent hash
   * @returns {Promise<Object>} Peers data
   */
  async getTorrentPeers(hash) {
    await this.ensureLoggedIn();
    const data = await this._get('/api/v2/sync/torrentPeers', { hash });
    return data.peers || {};
  }

  /**
   * Get trackers for a specific torrent
   * @param {string} hash - Torrent hash
   * @returns {Promise<Array>} Array of tracker objects
   */
  async getTorrentTrackers(hash) {
    await this.ensureLoggedIn();
    return this._get('/api/v2/torrents/trackers', { hash });
  }

  /**
   * Get files for a specific torrent
   * @param {string} hash - Torrent hash
   * @returns {Promise<Array>} Array of file objects
   */
  async getTorrentFiles(hash) {
    await this.ensureLoggedIn();
    return this._get('/api/v2/torrents/files', { hash });
  }

  /**
   * Get torrent properties (detailed info)
   * @param {string} hash - Torrent hash
   * @returns {Promise<Object>} Torrent properties
   */
  async getTorrentProperties(hash) {
    await this.ensureLoggedIn();
    return this._get('/api/v2/torrents/properties', { hash });
  }

  /**
   * Get global transfer info (speeds, all-time totals)
   * Uses /sync/maindata for all-time stats that persist across qBittorrent restarts
   * @returns {Promise<Object>} Transfer info with server_state containing alltime_dl/alltime_ul
   */
  async getGlobalStats() {
    await this.ensureLoggedIn();
    return this._get('/api/v2/sync/maindata');
  }

  /**
   * Get all categories
   * @returns {Promise<Object>} Categories object
   */
  async getCategories() {
    await this.ensureLoggedIn();
    return this._get('/api/v2/torrents/categories');
  }

  /**
   * Get application preferences
   * @returns {Promise<Object>} Preferences object
   */
  async getPreferences() {
    await this.ensureLoggedIn();
    return this._get('/api/v2/app/preferences');
  }

  /**
   * Get application log entries
   * @param {Object} options - Filter options
   * @returns {Promise<Array>} Array of { id, message, timestamp, type }
   */
  async getLog(options = {}) {
    await this.ensureLoggedIn();
    return this._get('/api/v2/log/main', {
      normal: true,
      info: true,
      warning: true,
      critical: true,
      ...options
    });
  }

  // ============================================================================
  // ACTIONS
  // ============================================================================

  /**
   * Add a magnet link
   * @param {string} uri - Magnet URI
   * @param {Object} options - Options (category, savepath, paused, etc.)
   * @returns {Promise<void>}
   */
  async addMagnet(uri, options = {}) {
    await this.ensureLoggedIn();

    const data = {
      urls: uri,
      ...options
    };

    // Convert boolean options
    if (options.paused !== undefined) {
      data.paused = options.paused ? 'true' : 'false';
    }
    if (options.skip_checking !== undefined) {
      data.skip_checking = options.skip_checking ? 'true' : 'false';
    }

    await this._post('/api/v2/torrents/add', data);
  }

  /**
   * Add a torrent file
   * @param {Buffer} buffer - Torrent file buffer
   * @param {Object} options - Options (category, savepath, paused, etc.)
   * @returns {Promise<void>}
   */
  async addTorrent(buffer, options = {}) {
    await this.ensureLoggedIn();

    // Create FormData for multipart upload
    const formData = new FormData();
    const blob = new Blob([buffer], { type: 'application/x-bittorrent' });
    formData.append('torrents', blob, 'torrent.torrent');

    // Add options
    for (const [key, value] of Object.entries(options)) {
      if (value !== undefined && value !== null) {
        formData.append(key, typeof value === 'boolean' ? (value ? 'true' : 'false') : value);
      }
    }

    await this._postMultipart('/api/v2/torrents/add', formData);
  }

  /**
   * Pause/Stop a torrent
   * Note: qBittorrent 5.0+ uses 'stop', older versions use 'pause'
   * @param {string} hash - Torrent hash (or 'all' for all torrents)
   * @returns {Promise<void>}
   */
  async pauseTorrent(hash) {
    await this.ensureLoggedIn();
    // Try new API first (qBittorrent 5.0+), fall back to old API
    try {
      await this._post('/api/v2/torrents/stop', { hashes: hash });
    } catch (err) {
      if (err.message.includes('404')) {
        // Fall back to old API for qBittorrent < 5.0
        await this._post('/api/v2/torrents/pause', { hashes: hash });
      } else {
        throw err;
      }
    }
  }

  /**
   * Resume/Start a torrent
   * Note: qBittorrent 5.0+ uses 'start', older versions use 'resume'
   * @param {string} hash - Torrent hash (or 'all' for all torrents)
   * @returns {Promise<void>}
   */
  async resumeTorrent(hash) {
    await this.ensureLoggedIn();
    // Try new API first (qBittorrent 5.0+), fall back to old API
    try {
      await this._post('/api/v2/torrents/start', { hashes: hash });
    } catch (err) {
      if (err.message.includes('404')) {
        // Fall back to old API for qBittorrent < 5.0
        await this._post('/api/v2/torrents/resume', { hashes: hash });
      } else {
        throw err;
      }
    }
  }

  /**
   * Delete a torrent
   * @param {string} hash - Torrent hash
   * @param {boolean} deleteFiles - Whether to delete files from disk
   * @returns {Promise<void>}
   */
  async deleteTorrent(hash, deleteFiles = false) {
    await this.ensureLoggedIn();
    await this._post('/api/v2/torrents/delete', {
      hashes: hash,
      deleteFiles: deleteFiles ? 'true' : 'false'
    });
  }

  /**
   * Set category for a torrent
   * @param {string} hash - Torrent hash
   * @param {string} category - Category name
   * @returns {Promise<void>}
   */
  async setCategory(hash, category) {
    await this.ensureLoggedIn();
    await this._post('/api/v2/torrents/setCategory', {
      hashes: hash,
      category
    });
  }

  /**
   * Set location (save path) for a torrent
   * @param {string} hash - Torrent hash
   * @param {string} location - New save path
   * @returns {Promise<void>}
   */
  async setLocation(hash, location) {
    await this.ensureLoggedIn();
    await this._post('/api/v2/torrents/setLocation', {
      hashes: hash,
      location
    });
  }

  // ============================================================================
  // CATEGORY MANAGEMENT
  // ============================================================================

  /**
   * Create a new category
   * @param {string} category - Category name
   * @param {string} savePath - Download path for this category (optional)
   * @returns {Promise<void>}
   */
  async createCategory(category, savePath = '') {
    await this.ensureLoggedIn();
    await this._post('/api/v2/torrents/createCategory', {
      category,
      savePath
    });
  }

  /**
   * Edit an existing category (update its save path)
   * @param {string} category - Category name
   * @param {string} savePath - New download path for this category
   * @returns {Promise<void>}
   */
  async editCategory(category, savePath) {
    await this.ensureLoggedIn();
    await this._post('/api/v2/torrents/editCategory', {
      category,
      savePath
    });
  }

  /**
   * Remove categories
   * @param {string|Array<string>} categories - Category name(s) to remove
   * @returns {Promise<void>}
   */
  async removeCategories(categories) {
    await this.ensureLoggedIn();
    const categoryList = Array.isArray(categories) ? categories.join('\n') : categories;
    await this._post('/api/v2/torrents/removeCategories', {
      categories: categoryList
    });
  }

  /**
   * Recheck a torrent
   * @param {string} hash - Torrent hash
   * @returns {Promise<void>}
   */
  async recheckTorrent(hash) {
    await this.ensureLoggedIn();
    await this._post('/api/v2/torrents/recheck', { hashes: hash });
  }

  /**
   * Reannounce a torrent
   * @param {string} hash - Torrent hash
   * @returns {Promise<void>}
   */
  async reannounceTorrent(hash) {
    await this.ensureLoggedIn();
    await this._post('/api/v2/torrents/reannounce', { hashes: hash });
  }

  // ============================================================================
  // CONNECTION TESTING
  // ============================================================================

  /**
   * Test connection to qBittorrent
   * @returns {Promise<{success: boolean, version?: string, error?: string}>}
   */
  async testConnection() {
    try {
      // Try to login first
      await this.login();

      // Get version to verify connection
      const version = await this._get('/api/v2/app/version');

      return {
        success: true,
        version: version
      };
    } catch (err) {
      this.connected = false;
      return {
        success: false,
        error: err.cause ? `${err.message} (${err.cause.code || err.cause.message})` : (err.message || 'Connection failed')
      };
    }
  }

  /**
   * Check if connected
   * @returns {boolean}
   */
  isConnected() {
    return this.connected;
  }

  /**
   * Disconnect (logout and cleanup)
   */
  async disconnect() {
    await this.logout();
  }
}

module.exports = QBittorrentClient;
