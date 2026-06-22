/**
 * RucioClient - thin REST wrapper over the Rucio daemon HTTP API
 *
 * Rucio (github.com/ogarcia/rucio) is a P2P file-sharing daemon: a native
 * libp2p network (BLAKE3/bao-tree verified streaming) plus eMule/Kad2 compat.
 * Its daemon exposes a clean JSON REST API under /api/v1 — this class is a
 * stateless wrapper around it using the global fetch().
 *
 * The daemon has no built-in auth (access control is delegated to a reverse
 * proxy). We therefore connect with just a base URL; optional username/password
 * are sent as HTTP Basic for setups that put nginx basic-auth in front. A
 * basePath is supported for daemons served under a sub-path (RUCIOD_BASE_PATH).
 *
 * Downloads are addressed by a signed integer id (positive = rucio, negative =
 * eMule); shares and search results are addressed by hash. The manager layer
 * owns the hash→id mapping; this client speaks the API verbatim.
 */

'use strict';

const DEFAULT_TIMEOUT_MS = 15000;

class RucioClient {
  /**
   * @param {Object} opts
   * @param {string} opts.host
   * @param {number} opts.port
   * @param {boolean} [opts.useSsl=false]
   * @param {string} [opts.basePath=''] - sub-path the daemon is served under (e.g. '/rucio')
   * @param {string} [opts.username] - optional, for reverse-proxy basic auth
   * @param {string} [opts.password] - optional, for reverse-proxy basic auth
   * @param {number} [opts.timeoutMs]
   */
  constructor({ host, port, useSsl = false, basePath = '', username = '', password = '', timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    const scheme = useSsl ? 'https' : 'http';
    // Normalize basePath to '' or '/segment' (no trailing slash).
    const trimmed = String(basePath || '').trim().replace(/\/+$/, '');
    const normBase = trimmed && !trimmed.startsWith('/') ? `/${trimmed}` : trimmed;
    this.origin = `${scheme}://${host}:${port}${normBase}`;
    this.username = username || '';
    this.password = password || '';
    this.timeoutMs = timeoutMs;
    this.connected = false;
  }

  isConnected() {
    return this.connected;
  }

  _headers(hasBody = false) {
    const headers = {};
    if (hasBody) headers['Content-Type'] = 'application/json';
    if (this.username || this.password) {
      const token = Buffer.from(`${this.username}:${this.password}`).toString('base64');
      headers['Authorization'] = `Basic ${token}`;
    }
    return headers;
  }

  /**
   * Perform a request. Returns parsed JSON (or null for empty/204 bodies).
   * Throws on network error, timeout, or non-2xx status.
   * @param {string} method
   * @param {string} path - absolute API path beginning with '/' (e.g. '/api/v1/status')
   * @param {Object|null} [body]
   * @returns {Promise<*>}
   */
  async _request(method, path, body = null) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res;
    try {
      res = await fetch(`${this.origin}${path}`, {
        method,
        headers: this._headers(body != null),
        body: body != null ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new Error(`Rucio request timed out after ${this.timeoutMs}ms: ${method} ${path}`);
      }
      throw new Error(`Rucio request failed: ${method} ${path} — ${err.message}`);
    }
    clearTimeout(timer);

    if (!res.ok) {
      let detail = '';
      try { detail = (await res.text()).slice(0, 300); } catch { /* ignore */ }
      throw new Error(`Rucio ${method} ${path} → HTTP ${res.status}${detail ? `: ${detail}` : ''}`);
    }

    if (res.status === 204) return null;
    const text = await res.text();
    if (!text) return null;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) return JSON.parse(text);
    return text; // plain-text endpoints (e.g. /shares/{hash}/magnet)
  }

  // ── Status / health ────────────────────────────────────────────────────

  /**
   * @returns {Promise<{success: boolean, version?: string, error?: string}>}
   */
  async testConnection() {
    try {
      const health = await this._request('GET', '/health');
      this.connected = true;
      return { success: true, version: health?.version || 'unknown' };
    } catch (err) {
      this.connected = false;
      return { success: false, error: err.message };
    }
  }

  getStatus() { return this._request('GET', '/api/v1/status'); }
  getMetrics() { return this._request('GET', '/api/v1/metrics'); }
  getUploads() { return this._request('GET', '/api/v1/uploads'); }
  getEmuleStatus() { return this._request('GET', '/api/v1/emule/status'); }

  // ── Downloads ─────────────────────────────────────────────────────────

  async getDownloads() {
    const data = await this._request('GET', '/api/v1/downloads');
    return data?.downloads || [];
  }

  /**
   * Start a rucio download from a `rucio:` magnet link.
   * @param {string} magnet
   * @param {{providers?: string[], category_id?: number|null}} [opts]
   */
  addMagnet(magnet, { providers = [], category_id = null } = {}) {
    return this._request('POST', '/api/v1/downloads', { magnet, providers, category_id });
  }

  /**
   * Start an eMule download from an `ed2k://` link.
   * @param {string} link
   * @param {{category_id?: number|null}} [opts]
   */
  addEd2k(link, { category_id = null } = {}) {
    return this._request('POST', '/api/v1/downloads/ed2k', { link, category_id });
  }

  pauseDownload(id) { return this._request('POST', `/api/v1/downloads/${id}/pause`); }
  resumeDownload(id) { return this._request('POST', `/api/v1/downloads/${id}/resume`); }
  cancelDownload(id) { return this._request('POST', `/api/v1/downloads/${id}/cancel`); }
  removeDownload(id) { return this._request('DELETE', `/api/v1/downloads/${id}`); }
  renameDownload(id, name) { return this._request('POST', `/api/v1/downloads/${id}/rename`, { name }); }
  setDownloadCategory(id, category_id) { return this._request('PUT', `/api/v1/downloads/${id}/category`, { category_id }); }

  // ── Shares ───────────────────────────────────────────────────────────

  /**
   * @param {{q?: string, dir?: string, limit?: number, offset?: number}} [opts]
   * @returns {Promise<{shares: Array, total: number}>}
   */
  async getShares({ q, dir, limit = 1000, offset = 0 } = {}) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (dir) params.set('dir', dir);
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    const data = await this._request('GET', `/api/v1/shares/files?${params.toString()}`);
    return { shares: data?.shares || [], total: data?.total || 0 };
  }

  unshare(hash) { return this._request('DELETE', `/api/v1/shares/${hash}`); }

  // ── Search ───────────────────────────────────────────────────────────

  /**
   * @param {string[]} keywords
   * @param {'rucio'|'emule'|'both'} [network='both']
   * @returns {Promise<{id: number}>}
   */
  startSearch(keywords, network = 'both') {
    return this._request('POST', '/api/v1/searches', { keywords, network });
  }

  getSearch(id) { return this._request('GET', `/api/v1/searches/${id}`); }
  listSearches() { return this._request('GET', '/api/v1/searches'); }
  cancelSearch(id) { return this._request('DELETE', `/api/v1/searches/${id}`); }

  // ── Categories ───────────────────────────────────────────────────────

  async getCategories() {
    const data = await this._request('GET', '/api/v1/categories');
    return data?.categories || [];
  }

  createCategory(body) { return this._request('POST', '/api/v1/categories', body); }
  updateCategory(id, body) { return this._request('PUT', `/api/v1/categories/${id}`, body); }
  deleteCategory(id) { return this._request('DELETE', `/api/v1/categories/${id}`); }

  // ── Lifecycle ────────────────────────────────────────────────────────

  // No persistent connection/session to tear down; flip the flag so callers
  // that poll isConnected() see the client as down.
  async disconnect() {
    this.connected = false;
  }
}

module.exports = RucioClient;
