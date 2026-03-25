/**
 * DelugeClient - JSON-RPC HTTP client for Deluge WebUI
 *
 * Communicates with Deluge's WebUI daemon via JSON-RPC over HTTP.
 * All API calls go to the /json endpoint with method + params.
 * Auth is password-only (no username) via auth.login().
 */

const logger = require('../logger');

class DelugeClient {
  constructor(options = {}) {
    this.host = options.host || 'localhost';
    this.port = options.port || 8112;
    this.path = (options.path || '').replace(/\/+$/, ''); // strip trailing slashes
    this.password = options.password || 'deluge';
    this.useSsl = options.useSsl || false;

    this.baseUrl = `${this.useSsl ? 'https' : 'http'}://${this.host}:${this.port}${this.path}`;
    this.sessionCookie = null; // _session_id cookie
    this.connected = false;
    this._requestId = 0;
    this._labelPluginAvailable = null; // cached after first check
  }

  // ============================================================================
  // JSON-RPC TRANSPORT
  // ============================================================================

  /**
   * Make a JSON-RPC call to the Deluge WebUI /json endpoint.
   * Handles session cookie injection and auto-reauth on 403.
   * @param {string} method - RPC method name (e.g. 'core.get_torrent_status')
   * @param {Array} params - RPC params array
   * @param {Object} options - { timeout, retryAuth }
   * @returns {Promise<any>} RPC result
   */
  async _call(method, params = [], { timeout = 30000, retryAuth = true } = {}) {
    const body = JSON.stringify({
      method,
      params,
      id: ++this._requestId
    });

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    if (this.sessionCookie) {
      headers['Cookie'] = this.sessionCookie;
    }

    let response;
    try {
      response = await fetch(`${this.baseUrl}/json`, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(timeout)
      });
    } catch (err) {
      if (err.name === 'AbortError' || err.message.includes('timeout')) {
        throw new Error(`Connection timeout to ${this.host}:${this.port}`);
      }
      throw err;
    }

    // Handle session expiry — re-login and retry once
    if (response.status === 403 || response.status === 401) {
      if (retryAuth) {
        this.sessionCookie = null;
        this.connected = false;
        await this.login();
        return this._call(method, params, { timeout, retryAuth: false });
      }
      throw new Error(`Auth failed for ${method}: HTTP ${response.status}`);
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    }

    // Extract session cookie from Set-Cookie header
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      const match = setCookie.match(/_session_id=([^;]+)/);
      if (match) {
        this.sessionCookie = `_session_id=${match[1]}`;
      }
    }

    const json = await response.json();

    if (json.error) {
      const errMsg = json.error.message || JSON.stringify(json.error);
      throw new Error(`RPC error in ${method}: ${errMsg}`);
    }

    return json.result;
  }

  // ============================================================================
  // AUTHENTICATION
  // ============================================================================

  /**
   * Login to Deluge WebUI
   * @returns {Promise<boolean>} True if login successful
   */
  async login() {
    try {
      const result = await this._call('auth.login', [this.password], { retryAuth: false });

      if (result === true) {
        this.connected = true;
        return true;
      }

      throw new Error('Login failed: Invalid password');
    } catch (err) {
      this.connected = false;
      throw err;
    }
  }

  /**
   * Test connection to Deluge.
   * Logs in, checks daemon connectivity, and retrieves version.
   * @returns {Promise<{success: boolean, version?: string, error?: string}>}
   */
  async testConnection() {
    try {
      await this.login();

      // Check if WebUI is connected to a daemon
      const webConnected = await this._call('web.connected');
      if (!webConnected) {
        // Try to connect to the first available daemon
        const hosts = await this._call('web.get_hosts');
        if (hosts && hosts.length > 0) {
          const hostId = hosts[0][0]; // First host's ID
          await this._call('web.connect', [hostId]);
          // Verify connection
          const nowConnected = await this._call('web.connected');
          if (!nowConnected) {
            return { success: false, error: 'WebUI not connected to daemon and auto-connect failed' };
          }
        } else {
          return { success: false, error: 'WebUI not connected to any daemon' };
        }
      }

      // Get daemon version via web.get_host_status
      let version = 'unknown';
      try {
        const hosts = await this._call('web.get_hosts');
        if (hosts && hosts.length > 0) {
          const hostStatus = await this._call('web.get_host_status', [hosts[0][0]]);
          // hostStatus: [id, status, version]
          if (Array.isArray(hostStatus)) {
            // Find the version string (the entry that looks like a semver)
            version = hostStatus.find(v => typeof v === 'string' && /^\d+\.\d+/.test(v)) || 'unknown';
          }
        }
      } catch {
        // Version detection is best-effort
      }

      return {
        success: true,
        version
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
   * Delete session and disconnect
   * @returns {Promise<void>}
   */
  async disconnect() {
    try {
      await this._call('auth.delete_session', [], { retryAuth: false });
    } catch {
      // Ignore disconnect errors
    } finally {
      this.sessionCookie = null;
      this.connected = false;
      this._labelPluginAvailable = null;
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
   * Ensure we're logged in, login if not
   * @returns {Promise<void>}
   */
  async ensureLoggedIn() {
    if (!this.connected || !this.sessionCookie) {
      await this.login();
    }
  }

  // ============================================================================
  // DATA RETRIEVAL
  // ============================================================================

  /**
   * The standard set of torrent fields to request from Deluge.
   * Used by getTorrents() and getTorrentStatus().
   */
  static get TORRENT_FIELDS() {
    return [
      'name', 'state', 'hash', 'save_path', 'move_completed_path',
      'total_size', 'total_done', 'total_uploaded', 'total_wanted',
      'progress', 'download_payload_rate', 'upload_payload_rate',
      'num_seeds', 'num_peers', 'total_seeds', 'total_peers',
      'ratio', 'eta', 'time_added', 'completed_time',
      'tracker_host', 'trackers', 'label', 'message',
      'is_finished', 'paused', 'move_on_completed', 'move_on_completed_path',
      'num_files', 'comment', 'active_time', 'seeding_time',
      'all_time_download', 'total_payload_download', 'total_payload_upload'
    ];
  }

  /**
   * Get all torrents with their status.
   * Uses web.update_ui which returns both torrent data and session stats.
   * @param {Array} keys - Fields to request (defaults to TORRENT_FIELDS)
   * @returns {Promise<{torrents: Object, stats: Object}>} { torrents: { hash: data }, stats: { ... } }
   */
  async getTorrents(keys) {
    await this.ensureLoggedIn();
    const fields = keys || DelugeClient.TORRENT_FIELDS;
    const result = await this._call('web.update_ui', [fields, {}]);

    return {
      torrents: result?.torrents || {},
      stats: result?.stats || {},
      filters: result?.filters || {},
      connected: result?.connected ?? false
    };
  }

  /**
   * Get detailed status for a single torrent.
   * @param {string} hash - Torrent hash (lowercase)
   * @param {Array} keys - Fields to request (defaults to TORRENT_FIELDS)
   * @returns {Promise<Object>} Torrent status object
   */
  async getTorrentStatus(hash, keys) {
    await this.ensureLoggedIn();
    const fields = keys || DelugeClient.TORRENT_FIELDS;
    return await this._call('core.get_torrent_status', [hash, fields]);
  }

  /**
   * Get file tree for a torrent.
   * @param {string} hash - Torrent hash
   * @returns {Promise<Object>} File tree structure
   */
  async getTorrentFiles(hash) {
    await this.ensureLoggedIn();
    return await this._call('web.get_torrent_files', [hash]);
  }

  // ============================================================================
  // SESSION STATS
  // ============================================================================

  /**
   * Get session statistics (transfer rates, totals).
   * @param {Array} keys - Stat keys to request
   * @returns {Promise<Object>} Session stats
   */
  async getSessionStatus(keys) {
    await this.ensureLoggedIn();
    const defaultKeys = [
      'upload_rate', 'download_rate',
      'total_upload', 'total_download',
      'payload_upload_rate', 'payload_download_rate',
      'dht_nodes', 'has_incoming_connections'
    ];
    return await this._call('core.get_session_status', [keys || defaultKeys]);
  }

  /**
   * Get the daemon's listen port.
   * @returns {Promise<number>} Listen port
   */
  async getListenPort() {
    await this.ensureLoggedIn();
    return await this._call('core.get_listen_port');
  }

  /**
   * Get free disk space at the given path.
   * @param {string} path - Path to check
   * @returns {Promise<number>} Free space in bytes
   */
  async getFreeSpace(path) {
    await this.ensureLoggedIn();
    return await this._call('core.get_free_space', [path]);
  }

  // ============================================================================
  // TORRENT CONTROL
  // ============================================================================

  /**
   * Pause one or more torrents.
   * @param {string|Array<string>} ids - Torrent hash(es)
   * @returns {Promise<void>}
   */
  async pauseTorrents(ids) {
    await this.ensureLoggedIn();
    const hashList = Array.isArray(ids) ? ids : [ids];
    await this._call('core.pause_torrent', [hashList]);
  }

  /**
   * Resume one or more torrents.
   * @param {string|Array<string>} ids - Torrent hash(es)
   * @returns {Promise<void>}
   */
  async resumeTorrents(ids) {
    await this.ensureLoggedIn();
    const hashList = Array.isArray(ids) ? ids : [ids];
    await this._call('core.resume_torrent', [hashList]);
  }

  /**
   * Remove a torrent.
   * @param {string} id - Torrent hash
   * @param {boolean} removeData - Whether to delete downloaded data
   * @returns {Promise<boolean>} True if removed
   */
  async removeTorrent(id, removeData = false) {
    await this.ensureLoggedIn();
    return await this._call('core.remove_torrent', [id, removeData]);
  }

  /**
   * Force recheck one or more torrents.
   * @param {string|Array<string>} ids - Torrent hash(es)
   * @returns {Promise<void>}
   */
  async forceRecheck(ids) {
    await this.ensureLoggedIn();
    const hashList = Array.isArray(ids) ? ids : [ids];
    await this._call('core.force_recheck', [hashList]);
  }

  /**
   * Move storage for one or more torrents to a new location.
   * @param {string|Array<string>} ids - Torrent hash(es)
   * @param {string} dest - Destination path
   * @returns {Promise<void>}
   */
  async moveStorage(ids, dest) {
    await this.ensureLoggedIn();
    const hashList = Array.isArray(ids) ? ids : [ids];
    await this._call('core.move_storage', [hashList, dest]);
  }

  /**
   * Set options for one or more torrents.
   * @param {string|Array<string>} ids - Torrent hash(es)
   * @param {Object} options - Options to set (e.g. { max_download_speed, max_upload_speed })
   * @returns {Promise<void>}
   */
  async setTorrentOptions(ids, options) {
    await this.ensureLoggedIn();
    const hashList = Array.isArray(ids) ? ids : [ids];
    await this._call('core.set_torrent_options', [hashList, options]);
  }

  // ============================================================================
  // ADD DOWNLOADS
  // ============================================================================

  /**
   * Add a torrent from a magnet URI.
   * @param {string} uri - Magnet URI
   * @param {Object} options - Deluge add options (e.g. { download_location, add_paused })
   * @returns {Promise<string|null>} Torrent hash or null
   */
  async addTorrentMagnet(uri, options = {}) {
    await this.ensureLoggedIn();
    return await this._call('core.add_torrent_magnet', [uri, options]);
  }

  /**
   * Add a torrent from a .torrent file (base64 encoded).
   * @param {string} filename - Original filename
   * @param {string} b64 - Base64-encoded .torrent file content
   * @param {Object} options - Deluge add options
   * @returns {Promise<string|null>} Torrent hash or null
   */
  async addTorrentFile(filename, b64, options = {}) {
    await this.ensureLoggedIn();
    return await this._call('core.add_torrent_file', [filename, b64, options]);
  }

  // ============================================================================
  // LABEL PLUGIN
  // ============================================================================

  /**
   * Get list of enabled plugins.
   * @returns {Promise<Array<string>>} Plugin names
   */
  async getEnabledPlugins() {
    await this.ensureLoggedIn();
    return await this._call('core.get_enabled_plugins');
  }

  /**
   * Check if the Label plugin is enabled (cached after first check).
   * @returns {Promise<boolean>}
   */
  async isLabelPluginEnabled() {
    if (this._labelPluginAvailable !== null) {
      return this._labelPluginAvailable;
    }
    try {
      const plugins = await this.getEnabledPlugins();
      this._labelPluginAvailable = Array.isArray(plugins) && plugins.includes('Label');
    } catch {
      this._labelPluginAvailable = false;
    }
    return this._labelPluginAvailable;
  }

  /**
   * Enable a plugin on the daemon.
   * @param {string} name - Plugin name (e.g. 'Label')
   * @returns {Promise<void>}
   */
  async enablePlugin(name) {
    await this.ensureLoggedIn();
    await this._call('core.enable_plugin', [name]);
  }

  /**
   * Ensure the Label plugin is enabled (enable it if not already).
   * Also checks that the plugin is available before trying to enable.
   * @returns {Promise<boolean>} True if Label plugin is now enabled
   */
  async ensureLabelPluginEnabled() {
    // Check if already enabled
    const alreadyEnabled = await this.isLabelPluginEnabled();
    if (alreadyEnabled) return true;

    // Check if Label is in the list of available plugins
    try {
      const available = await this._call('core.get_available_plugins');
      if (!Array.isArray(available) || !available.includes('Label')) {
        return false; // Plugin not installed
      }

      // Enable it
      await this.enablePlugin('Label');

      // Clear cache and verify
      this._labelPluginAvailable = null;
      const nowEnabled = await this.isLabelPluginEnabled();
      return nowEnabled;
    } catch {
      return false;
    }
  }

  /**
   * Get all labels. Returns empty array if Label plugin is not enabled.
   * @returns {Promise<Array<string>>} Label names (lowercase)
   */
  async getLabels() {
    if (!await this.isLabelPluginEnabled()) {
      return [];
    }
    try {
      return await this._call('label.get_labels');
    } catch {
      return [];
    }
  }

  /**
   * Add a new label.
   * @param {string} name - Label name (will be lowercased by Deluge)
   * @returns {Promise<void>}
   */
  async addLabel(name) {
    await this.ensureLoggedIn();
    await this._call('label.add', [name]);
  }

  /**
   * Remove a label.
   * @param {string} name - Label name
   * @returns {Promise<void>}
   */
  async removeLabel(name) {
    await this.ensureLoggedIn();
    await this._call('label.remove', [name]);
  }

  /**
   * Set the label for a torrent.
   * @param {string} hash - Torrent hash
   * @param {string} label - Label name (empty string to clear)
   * @returns {Promise<void>}
   */
  async setTorrentLabel(hash, label) {
    await this.ensureLoggedIn();
    await this._call('label.set_torrent', [hash, label]);
  }
}

module.exports = DelugeClient;
