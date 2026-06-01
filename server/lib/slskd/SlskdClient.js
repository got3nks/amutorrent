/**
 * SlskdClient - HTTP API client for slskd (Soulseek daemon)
 *
 * Supports authentication via:
 * 1) X-API-Key header (recommended for machine integrations)
 * 2) JWT token from /api/v0/session (username/password fallback)
 */

'use strict';

class SlskdClient {
  constructor(options = {}) {
    this.host = options.host || 'localhost';
    this.port = options.port || 5030;
    this.path = (options.path || '').replace(/\/+$/, '');
    this.useSsl = options.useSsl || false;

    this.apiKey = options.apiKey || '';
    this.username = options.username || '';
    this.password = options.password || '';

    this.baseUrl = `${this.useSsl ? 'https' : 'http'}://${this.host}:${this.port}${this.path}`;
    this.apiBase = `${this.baseUrl}/api/v0`;

    this.token = null;
    this.connected = false;
  }

  _buildHeaders() {
    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };

    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey;
    }
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    return headers;
  }

  async _call(method, route, { body, timeout = 30000, retryAuth = true } = {}) {
    const url = `${this.apiBase}${route}`;
    const init = {
      method,
      headers: this._buildHeaders(),
      signal: AbortSignal.timeout(timeout)
    };

    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }

    let response;
    try {
      response = await fetch(url, init);
    } catch (err) {
      if (err.name === 'AbortError' || (err.message && err.message.includes('timeout'))) {
        throw new Error(`Connection timeout to ${this.host}:${this.port}`);
      }
      throw err;
    }

    if (response.status === 401 && retryAuth && !this.apiKey && this.username && this.password) {
      await this.login();
      return this._call(method, route, { body, timeout, retryAuth: false });
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text || response.statusText}`);
    }

    if (response.status === 204) {
      return null;
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const text = await response.text();
      return text;
    }

    return await response.json();
  }

  async login() {
    if (!this.username || !this.password) {
      throw new Error('Username/password are required for JWT login');
    }

    const json = await this._call('POST', '/session', {
      body: { username: this.username, password: this.password },
      retryAuth: false
    });

    this.token = json?.token || null;
    if (!this.token) {
      throw new Error('No token returned by slskd session endpoint');
    }

    this.connected = true;
    return true;
  }

  async testConnection() {
    try {
      const app = await this._call('GET', '/application', { retryAuth: true });
      this.connected = true;
      return {
        success: true,
        version: app?.version || app?.Version || 'unknown'
      };
    } catch (err) {
      this.connected = false;
      return {
        success: false,
        error: err.message || 'Connection failed'
      };
    }
  }

  async disconnect() {
    this.token = null;
    this.connected = false;
  }

  isConnected() {
    return this.connected;
  }

  async getDownloads(includeRemoved = false) {
    return await this._call('GET', `/transfers/downloads?includeRemoved=${includeRemoved ? 'true' : 'false'}`);
  }

  async getUploads(includeRemoved = false) {
    return await this._call('GET', `/transfers/uploads?includeRemoved=${includeRemoved ? 'true' : 'false'}`);
  }

  async getLogs() {
    return await this._call('GET', '/logs');
  }

  async getShares() {
    return await this._call('GET', '/shares');
  }

  async getShareContents(id) {
    const shareId = encodeURIComponent(String(id));
    return await this._call('GET', `/shares/${shareId}/contents`);
  }

  async getUserDirectoryContents(username, directory) {
    const user = encodeURIComponent(String(username));
    return await this._call('POST', `/users/${user}/directory`, {
      body: { directory }
    });
  }

  async cancelDownload(username, id, remove = false) {
    const u = encodeURIComponent(username);
    const t = encodeURIComponent(id);
    await this._call('DELETE', `/transfers/downloads/${u}/${t}?remove=${remove ? 'true' : 'false'}`);
  }

  async enqueueDownloads(username, files) {
    const u = encodeURIComponent(username);
    return await this._call('POST', `/transfers/downloads/${u}`, { body: files || [] });
  }

  _extractSearchResults(payload) {
    const results = [];
    const visit = (node, inheritedUser = null) => {
      if (!node) return;
      if (Array.isArray(node)) {
        for (const entry of node) visit(entry, inheritedUser);
        return;
      }
      if (typeof node !== 'object') return;

      const username = node.username || node.Username || inheritedUser;

      const listKeys = ['files', 'Files', 'results', 'Results', 'responses', 'Responses', 'items', 'Items'];
      for (const key of listKeys) {
        if (Array.isArray(node[key])) {
          visit(node[key], username);
        }
      }

      // Some slskd responses can be dictionaries keyed by username or other
      // nested wrappers. Walk unknown object children too so we don't miss hits.
      for (const [key, value] of Object.entries(node)) {
        if (listKeys.includes(key)) continue;
        if (!value || typeof value !== 'object') continue;
        const keyedUsername = !username && typeof key === 'string' ? key : username;
        visit(value, keyedUsername || username);
      }

      const filename = node.filename || node.fileName || node.name || node.Filename || node.FileName || node.Name;
      const size = Number(node.size || node.Size || node.fileSize || node.FileSize || 0) || 0;
      if (filename && username) {
        const id = node.id || node.Id || node.token || node.Token || null;
        const bitrate = Number(node.bitrate || node.Bitrate || 0) || null;
        const length = Number(node.length || node.Length || node.duration || node.Duration || 0) || null;
        results.push({
          id: id ? String(id) : null,
          username: String(username),
          filename: String(filename),
          size,
          bitrate,
          length,
          raw: node
        });
      }
    };

    visit(payload, null);

    const dedup = new Map();
    for (const item of results) {
      const key = `${item.id || ''}|${item.username}|${item.filename}|${item.size}`;
      if (!dedup.has(key)) dedup.set(key, item);
    }

    return Array.from(dedup.values());
  }

  _extractSearchId(payload) {
    if (!payload || typeof payload !== 'object') return null;
    return payload.id || payload.Id || payload.searchId || payload.SearchId || payload.token || payload.Token || null;
  }

  async _createSearch(query) {
    const payloadCandidates = [
      { searchText: query },
      { query },
      { text: query },
      { term: query }
    ];

    let lastErr = null;
    for (const body of payloadCandidates) {
      try {
        return await this._call('POST', '/searches', { body });
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error('Failed to create slskd search');
  }

  async getSearchResults(searchId) {
    const sid = encodeURIComponent(String(searchId));
    // Newer slskd versions expose result rows via /responses; older builds may
    // only embed them in /searches/{id}. Try both for compatibility.
    try {
      const responsePayload = await this._call('GET', `/searches/${sid}/responses`);
      const responseResults = this._extractSearchResults(responsePayload);
      if (responseResults.length > 0 || Array.isArray(responsePayload)) {
        return responseResults;
      }
    } catch (_err) {
      // Fall back to the legacy endpoint below.
    }

    const payload = await this._call('GET', `/searches/${sid}`);
    return this._extractSearchResults(payload);
  }

  async getEvents() {
    return await this._call('GET', '/events');
  }

  async getTelemetrySummary() {
    return await this._call('GET', '/telemetry/reports/transfers/summary');
  }

  async searchText(query, { maxWaitMs = 45000, pollIntervalMs = 1500 } = {}) {
    const trimmed = String(query || '').trim();
    if (!trimmed) {
      return { searchId: null, results: [] };
    }

    const created = await this._createSearch(trimmed);
    const searchId = this._extractSearchId(created);

    // Some slskd versions may return immediate results directly.
    const immediate = this._extractSearchResults(created);
    if (!searchId) {
      return { searchId: null, results: immediate };
    }

    const start = Date.now();
    let best = immediate;

    while (Date.now() - start < maxWaitMs) {
      const current = await this.getSearchResults(searchId);
      if (current.length > best.length) {
        best = current;
      }
      if (current.length > 0 && Date.now() - start >= 4000) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    return { searchId: String(searchId), results: best };
  }

  // ============================================================================
  // CONVERSATIONS (Private Messages)
  // ============================================================================

  async getConversations() {
    return await this._call('GET', '/conversations');
  }

  async getConversation(username) {
    const u = encodeURIComponent(String(username));
    return await this._call('GET', `/conversations/${u}`);
  }

  async sendConversationMessage(username, message) {
    const u = encodeURIComponent(String(username));
    return await this._call('POST', `/conversations/${u}`, { body: message });
  }

  async acknowledgeConversationMessage(username, messageId) {
    const u = encodeURIComponent(String(username));
    const mid = encodeURIComponent(String(messageId));
    // slskd API: PUT /api/v0/conversations/{username}/{id}
    return await this._call('PUT', `/conversations/${u}/${mid}`);
  }

  async deleteConversation(username) {
    const u = encodeURIComponent(String(username));
    return await this._call('DELETE', `/conversations/${u}`);
  }

  // ============================================================================
  // ROOMS
  // ============================================================================

  async getRooms() {
    return await this._call('GET', '/rooms/joined');
  }

  async joinRoom(roomName) {
    return await this._call('POST', '/rooms/joined', { body: String(roomName) });
  }

  async leaveRoom(roomName) {
    const r = encodeURIComponent(String(roomName));
    return await this._call('DELETE', `/rooms/joined/${r}`);
  }

  async sendRoomMessage(roomName, message) {
    const r = encodeURIComponent(String(roomName));
    return await this._call('POST', `/rooms/joined/${r}/messages`, { body: String(message) });
  }

  async getRoomByName(roomName) {
    const r = encodeURIComponent(String(roomName));
    return await this._call('GET', `/rooms/joined/${r}`);
  }

  async getUserInfo(username) {
    const u = encodeURIComponent(String(username));
    return await this._call('GET', `/users/${u}`);
  }
}

module.exports = SlskdClient;