/**
 * RucioManager - lifecycle wrapper for a Rucio daemon instance
 *
 * Extends BaseClientManager. Rucio is its own libp2p P2P network that also
 * bridges eMule/Kad, with its own 'rucio' networkType. Its capability profile —
 * search, shared files, categories, seeds completed files, no trackers,
 * single-file — drives behaviour through clientMeta capabilities rather than
 * network-type branches. See clientMeta.js → CLIENT_TYPES.rucio.
 *
 * Key structural difference from the other clients: Rucio addresses downloads
 * by a signed integer id (positive = rucio, negative = eMule), while the rest
 * of the app keys everything off the file hash. This manager owns the
 * hash→id map (rebuilt every fetchData) and translates the hash-based control
 * methods (pause/resume/stop/delete/category) into id-based REST calls.
 */

'use strict';

const RucioClient = require('../lib/rucio/RucioClient');
const BaseClientManager = require('../lib/BaseClientManager');
const logger = require('../lib/logger');
const { normalizeRucioDownload, normalizeRucioSharedFile } = require('../lib/downloadNormalizer');
const { normaliseQueryForm } = require('../lib/searchQuery');

// Pull the BLAKE3 (rucio) or MD4 (ed2k) hash out of a download link so search
// results can be keyed by hash like aMule's, and looked up again on download.
function hashFromLink(link) {
  if (!link) return null;
  const ed2k = link.match(/\|([a-fA-F0-9]{32})\|/); // ed2k://|file|name|size|<md4>|/
  if (ed2k) return ed2k[1].toLowerCase();
  const rucio = link.match(/^rucio:([a-fA-F0-9]{64})/i); // rucio:<blake3>?...
  if (rucio) return rucio[1].toLowerCase();
  return null;
}

// Normalize a category colour to the '#rrggbb' hex the daemon expects. The
// CategoryManager hands the per-client sync an aMule-style BGR integer (see its
// hexColorToAmule); the on-demand path hands us the stored hex string. Accept
// both. Returns undefined for an unset colour (so the field is omitted).
function toHexColor(color) {
  if (color == null) return undefined;
  if (typeof color === 'string') {
    const c = color.trim();
    if (!c) return undefined;
    return c.startsWith('#') ? c : `#${c}`;
  }
  if (typeof color === 'number') {
    const r = color & 0xff;
    const g = (color >> 8) & 0xff;
    const b = (color >> 16) & 0xff;
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  return undefined;
}

// Mirrors SEARCH_DOWNLOAD_STATUS (static/utils/searchDownloadStatus.js). The
// daemon doesn't report whether a result is already known, so we derive it from
// what this client currently holds. Re-declared rather than imported: that file
// is a browser ESM module.
const SEARCH_STATUS = { NEW: 0, DOWNLOADED: 1, QUEUED: 2 };

class RucioManager extends BaseClientManager {
  constructor() {
    super();
    this.lastDownloads = [];
    this.lastSharedFiles = [];
    // hash (lowercase) → signed integer download id, rebuilt each fetchData.
    this.hashToId = new Map();
    // Search state. Rucio search is async (own id, polled); we mirror aMule's
    // blocking search() surface and keep a hash→download_link map so a result
    // can be queued by hash later.
    this._searchInProgress = false;
    this._lastSearch = { id: null, results: [], links: new Map() };
    this._version = null;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────

  async initClient() {
    if (this.connectionInProgress) {
      this.log('Connection attempt already in progress, skipping...');
      return false;
    }
    if (!this._clientConfig || !this._clientConfig.enabled) return false;
    if (!this._clientConfig.host) return false;

    this.connectionInProgress = true;
    try {
      if (this.client) {
        await this.client.disconnect();
        this.client = null;
      }

      const cfg = this._clientConfig;
      this.log(`Connecting to Rucio (${cfg.host}:${cfg.port}${cfg.path || ''})...`);

      const client = new RucioClient({
        host: cfg.host,
        port: cfg.port || 3003,
        useSsl: cfg.useSsl || false,
        path: cfg.path || '',
        username: cfg.username || '',
        password: cfg.password || ''
      });

      const result = await client.testConnection();
      if (!result.success) {
        throw new Error(result.error || 'Connection test failed');
      }

      this.client = client;
      this._version = result.version;
      this._clearConnectionError();
      this.log(`Connected to Rucio ${result.version} successfully`);
      this.clearReconnect();
      this._onConnectCallbacks.forEach(cb => cb());
      return true;
    } catch (err) {
      this.error('Failed to connect:', logger.errorDetail(err));
      this._setConnectionError(err);
      this.client = null;
      return false;
    } finally {
      this.connectionInProgress = false;
    }
  }

  async startConnection() {
    if (!this._clientConfig || !this._clientConfig.enabled) return;
    const connected = await this.initClient();
    if (!connected) {
      this.scheduleReconnect(30000);
    }
  }

  isConnected() {
    return !!this.client && this.client.isConnected();
  }

  // ── Search lock (mirrors aMule; Rucio runs one search at a time per UI) ──

  acquireSearchLock() {
    if (this._searchInProgress) return false;
    this._searchInProgress = true;
    this._broadcastSearchLock(true);
    return true;
  }

  releaseSearchLock() {
    if (!this._searchInProgress) return;
    this._searchInProgress = false;
    this._broadcastSearchLock(false);
  }

  // Tell the clients that may search about the slot changing hands. Since
  // v3.9.3 handleSearch no longer broadcasts this itself, so without it the
  // search box stays on "Searching…" until a page reload. Mirrors aMule.
  _broadcastSearchLock(locked) {
    this.broadcast?.({ type: 'search-lock', locked }, {
      filter: u => u?.isAdmin || u?.capabilities?.includes('search')
    });
  }

  isSearchInProgress() {
    return this._searchInProgress;
  }

  // ── History ──────────────────────────────────────────────────────────

  // Shape a unified Rucio item (download or shared file) into the record the
  // history tracker expects. autoRefreshManager calls this on every item with
  // no guard, so a manager that lacks it throws and breaks history for ALL
  // clients. Rucio exposes no per-file uploaded total, so ratio stays 0.
  extractHistoryMetadata(item) {
    const size = item.size || 0;
    // Shared files carry no `progress` field → treat them as fully downloaded.
    const isSharedFile = item.progress === undefined;
    const downloaded = isSharedFile ? size : (item.downloaded || 0);
    const uploaded = item.uploadTotal || 0;
    const ratio = downloaded > 0 ? uploaded / downloaded : 0;
    // Only shared files carry a path, and it's the file itself — record its
    // containing directory, like the other managers. Downloads have no path.
    const directory = item.path && item.path.startsWith('/')
      ? item.path.replace(/\/[^/]*$/, '') || '/'
      : null;
    return {
      hash: item.hash?.toLowerCase(),
      instanceId: item.instanceId,
      size,
      name: item.name,
      downloaded,
      uploaded,
      ratio,
      trackerDomain: null,
      directory,
      multiFile: false,
      category: null // filled from the unified items' categoryByKey lookup
    };
  }

  // ── Data fetch ───────────────────────────────────────────────────────

  async fetchData(_categories = []) {
    if (!this.client) {
      return { downloads: [], sharedFiles: [] };
    }

    const triggerReconnect = (err) => {
      this.error(`❌ fetchData failed: ${err.message} — reconnecting`);
      const failed = this.client;
      this.client = null;
      this._setConnectionError(err);
      if (failed && typeof failed.disconnect === 'function') {
        Promise.resolve(failed.disconnect()).catch(() => {});
      }
      this.scheduleReconnect(5000);
    };

    let rawDownloads, sharesResult, rucioCategories;
    try {
      [rawDownloads, sharesResult, rucioCategories] = await Promise.all([
        this.client.getDownloads(),
        this.client.getShares({ limit: 1000 }),
        this.client.getCategories().catch(() => [])
      ]);
    } catch (err) {
      triggerReconnect(err);
      // Reuse the last-known frame so the UI doesn't flash empty during reconnect.
      return { downloads: this.lastDownloads, sharedFiles: this.lastSharedFiles };
    }

    // Resolve category_id → name from the daemon's own category list.
    const catNameById = new Map((rucioCategories || []).map(c => [c.id, c.name]));
    const resolveCategoryName = (id) => (id == null ? 'Default' : (catNameById.get(id) || 'Default'));

    // ── Downloads + hash→id map ──────────────────────────────────────────
    this.hashToId.clear();
    const downloads = [];
    for (const d of rawDownloads) {
      if (d.root_hash) this.hashToId.set(String(d.root_hash).toLowerCase(), d.id);
      downloads.push(normalizeRucioDownload(d, resolveCategoryName));
    }

    // ── Shared files ────────────────────────────────────────────────────
    const sharedFiles = (sharesResult.shares || []).map(normalizeRucioSharedFile);

    // Stamp instanceId on every item so the unified pipeline and batch
    // operations (pause/resume/cancel/delete/category) can resolve this
    // manager from the registry. Without it the UI reports "Client instance
    // not found" on any action.
    const instanceId = this.instanceId;
    downloads.forEach(d => { d.instanceId = instanceId; });
    sharedFiles.forEach(f => { f.instanceId = instanceId; });

    this.lastDownloads = downloads;
    this.lastSharedFiles = sharedFiles;
    return { downloads, sharedFiles };
  }

  // ── Stats / metrics / network status ─────────────────────────────────

  async getStats() {
    if (!this.client) return {};
    try {
      const [status, metrics, emule] = await Promise.all([
        this.client.getStatus(),
        this.client.getMetrics(),
        this.client.getEmuleStatus().catch(() => null)
      ]);
      return { status: status || {}, metrics: metrics || {}, emule };
    } catch (err) {
      this.error('❌ Error fetching Rucio stats:', logger.errorDetail(err));
      return {};
    }
  }

  extractMetrics(rawStats) {
    const session = rawStats?.metrics?.session || {};
    const total = rawStats?.metrics?.total || {};
    return {
      uploadSpeed: session.upload_speed || 0,
      downloadSpeed: session.download_speed || 0,
      uploadTotal: total.uploaded_bytes || 0,
      downloadTotal: total.downloaded_bytes || 0
    };
  }

  /**
   * Flat network status, as the footer's non-aMule (per-client badge) section
   * expects: { status, text, connected }. Rucio is its own network, so it
   * shows as a single "Rucio" badge rather than under the aMule ED2K/KAD
   * headers. Derived from libp2p reachability: HighId = publicly reachable,
   * LowId = reachable but behind NAT.
   */
  getNetworkStatus(rawStats) {
    const status = rawStats?.status || {};
    const peers = status.connected_peers || 0;
    if (peers === 0) {
      return { status: 'red', text: 'Disconnected', connected: false };
    }
    const highId = status.class === 'HighId';
    return {
      status: highId ? 'green' : 'yellow',
      text: highId ? 'Connected' : 'Limited',
      connected: true
    };
  }

  // ── Download control (hash → id translation) ──────────────────────────

  _idForHash(hash) {
    const id = this.hashToId.get(String(hash).toLowerCase());
    if (id === undefined) {
      throw new Error(`Unknown download hash: ${hash}`);
    }
    return id;
  }

  async pause(hash) {
    if (!this.client) throw new Error('Rucio not connected');
    await this.client.pauseDownload(this._idForHash(hash));
  }

  async resume(hash) {
    if (!this.client) throw new Error('Rucio not connected');
    await this.client.resumeDownload(this._idForHash(hash));
  }

  // Rucio has no separate stop; pausing preserves progress (stopReplacesPause
  // is false in clientMeta, so the UI uses pause/resume — this is a fallback).
  async stop(hash) {
    return this.pause(hash);
  }

  async renameFile(hash, newName) {
    if (!this.client) throw new Error('Rucio not connected');
    await this.client.renameDownload(this._idForHash(hash), newName);
    return { success: true };
  }

  /**
   * Delete an item. The caller's `isShared`/`filePath` are advisory: a Rucio
   * completed download is BOTH a download-list row and a shared file, and the
   * caller's joined filePath is built for directory-based clients, so we decide
   * from our own state instead.
   *
   * Tracked download (in the download list, completed or active) → remove it
   *   from the list (and cancel first when still active, to discard the partial)
   *   and un-share it when it's being seeded, so the row can't reappear.
   * Pure shared file (no download row) → un-share via the API only.
   *
   * The on-disk file is left intact unless `deleteFiles` is set; the path comes
   * from the shared-files list (the download list carries none), so a disk wipe
   * is only possible for a file this client is sharing.
   */
  async deleteItem(hash, { deleteFiles } = {}) {
    if (!this.client) throw new Error('Rucio not connected');
    const h = String(hash).toLowerCase();

    const shared = (this.lastSharedFiles || []).find(f => String(f.hash).toLowerCase() === h);
    const pathsToDelete = deleteFiles && shared?.path ? [shared.path] : [];

    const id = this.hashToId.get(h);
    if (id !== undefined) {
      const dl = (this.lastDownloads || []).find(d => String(d.hash).toLowerCase() === h);
      // Cancel only an active download (cancel discards the partial file); a
      // completed one is just dropped from the list, never cancelled, so the
      // finished file is never touched. Cancel is best-effort — it legitimately
      // no-ops / errors on an already-terminal download — so it stays caught.
      if (!dl?.isComplete) await this.client.cancelDownload(id).catch(() => {});
      // removeDownload / unshare are the operation itself: let a refusal throw
      // so the caller reports failure instead of a false success + a row that
      // reappears on the next poll.
      await this.client.removeDownload(id);
      if (shared) await this.client.unshare(h);
      this.trackDeletion(hash);
      return { success: true, pathsToDelete };
    }

    await this.client.unshare(h);
    this.trackDeletion(hash);
    return { success: true, pathsToDelete };
  }

  async setCategoryOrLabel(hash, { categoryName } = {}) {
    if (!this.client) throw new Error('Rucio not connected');
    const id = this._idForHash(hash);
    const categoryId = await this.ensureAmuleCategoryId(categoryName);
    await this.client.setDownloadCategory(id, categoryId);
    return { success: true };
  }

  // ── Adding downloads ─────────────────────────────────────────────────

  /**
   * Resolve an aMuTorrent category name to a Rucio category id, creating the
   * category in the daemon if it doesn't exist yet. Returns null for the
   * default/global category. Named to match the contract the search/add
   * handlers call (they were written for aMule). Only the name is synced —
   * category download paths live in different filesystems on each side.
   */
  async ensureAmuleCategoryId(categoryName) {
    if (!this.client) throw new Error('Rucio not connected');
    if (!categoryName || categoryName === 'Default') return null;
    // Carry over the colour and download dir from the app's category so a
    // category created on demand (adding/recategorizing) isn't name-only.
    const appCat = require('../lib/CategoryManager').getByName?.(categoryName);
    return this._resolveOrCreateCategoryId(categoryName, { color: appCat?.color, path: appCat?.path });
  }

  // Find a daemon category by name (case-insensitive), creating it with the
  // given colour/dir if missing. Returns its id, or null for Default/none.
  async _resolveOrCreateCategoryId(name, { color, path } = {}) {
    if (!name || name === 'Default') return null;
    const cats = await this.client.getCategories();
    const found = cats.find(c => c.name.toLowerCase() === String(name).toLowerCase());
    if (found) return found.id;
    const created = await this._createCategoryRaw({ name, color, path });
    return created?.id ?? null;
  }

  // Create with colour + download_dir, retrying without the dir if the daemon
  // rejects it (e.g. the path doesn't exist on the daemon host) so a category
  // is still created rather than failing outright.
  async _createCategoryRaw({ name, color, path }) {
    const body = { name, color: toHexColor(color), download_dir: path || undefined };
    try {
      return await this.client.createCategory(body);
    } catch (err) {
      if (body.download_dir && /HTTP 400/.test(err.message)) {
        this.warn(`Rucio rejected download_dir for category "${name}" (${err.message}); creating without it`);
        return await this.client.createCategory({ name, color: body.color });
      }
      throw err;
    }
  }

  async _updateCategoryRaw(id, { name, color, path }) {
    // The daemon's PUT is a full replace, and aMuTorrent doesn't manage Rucio's
    // keyword auto-filing rules (match_keywords). Read the category's current
    // value and send it back untouched — otherwise editing name/colour/path here
    // would wipe rules the user set in Rucio's own panel. Best-effort: if the
    // read fails we omit it, leaving the pre-existing behaviour.
    let match_keywords;
    try {
      const cats = await this.client.getCategories();
      match_keywords = cats.find(c => c.id === id)?.match_keywords ?? undefined;
    } catch { /* can't read it — don't fabricate a value */ }
    const body = { name, color: toHexColor(color), download_dir: path || undefined, match_keywords };
    try {
      return await this.client.updateCategory(id, body);
    } catch (err) {
      if (body.download_dir && /HTTP 400/.test(err.message)) {
        this.warn(`Rucio rejected download_dir for category "${name}" (${err.message}); updating without it`);
        return await this.client.updateCategory(id, { name, color: body.color, match_keywords });
      }
      throw err;
    }
  }

  // categoryId comes from ensureAmuleCategoryId() (or the legacy `?? 0` in the
  // handlers); normalize anything non-positive to null = global category.
  _normalizeCategoryId(categoryId) {
    return categoryId && categoryId > 0 ? categoryId : null;
  }

  // Resolve a daemon category id to its name for history display — aMule records
  // the name, not the id (so history reads "Movies", not "7"). Cached briefly so
  // a batch add doesn't refetch the list per item.
  async _categoryNameById(id) {
    if (id == null) return null;
    const now = Date.now();
    if (!this._catCache || now - this._catCache.at > 3000) {
      try {
        this._catCache = { at: now, list: (await this.client.getCategories()) || [] };
      } catch {
        this._catCache = { at: now, list: [] };
      }
    }
    return this._catCache.list.find(c => c.id === id)?.name || null;
  }

  /**
   * Queue a previously-found search result by its hash. Routes to the right
   * endpoint by link scheme (rucio: → libp2p, ed2k:// → eMule).
   */
  async addSearchResult(fileHash, categoryId = 0, username = null, fileInfoCallback = null) {
    if (!this.client) throw new Error('Rucio not connected');
    const link = this._lastSearch.links.get(String(fileHash).toLowerCase());
    if (!link) throw new Error(`No search result link for hash ${fileHash}`);

    const category_id = this._normalizeCategoryId(categoryId);
    if (link.toLowerCase().startsWith('ed2k://')) {
      await this.client.addEd2k(link, { category_id });
    } else {
      await this.client.addMagnet(link, { category_id });
    }

    let filename = 'Unknown';
    let size = null;
    if (fileInfoCallback) {
      try {
        const info = await fileInfoCallback(fileHash);
        filename = info?.filename || 'Unknown';
        size = info?.size || null;
      } catch { /* use defaults */ }
    }
    const categoryName = await this._categoryNameById(category_id);
    this.trackDownload(fileHash, filename, size, username, categoryName);
    return true;
  }

  /**
   * Add an ed2k:// link (called by the ED2K-links handler).
   */
  async addEd2kLink(link, categoryId = 0, username = null) {
    if (!this.client) throw new Error('Rucio not connected');
    const category_id = this._normalizeCategoryId(categoryId);
    // The ed2k-links path can carry a rucio: magnet too (the Add Download modal
    // groups both under it) — route by scheme.
    if (String(link).toLowerCase().startsWith('rucio:')) {
      await this.client.addMagnet(link, { category_id });
    } else {
      await this.client.addEd2k(link, { category_id });
    }
    const hash = hashFromLink(link);
    if (hash) this.trackDownload(hash, 'Unknown', null, username, null);
    return true;
  }

  /**
   * Add a magnet/link (called by the magnet handler). Accepts both rucio: and
   * ed2k:// — routed by scheme. `opts` mirrors the BitTorrent shape
   * { categoryName, savePath, priority, start, username }; only categoryName
   * is meaningful for Rucio (dir is category-driven daemon-side).
   */
  async addMagnet(link, { categoryName, username } = {}) {
    if (!this.client) throw new Error('Rucio not connected');
    const category_id = await this.ensureAmuleCategoryId(categoryName);
    if (String(link).toLowerCase().startsWith('ed2k://')) {
      await this.client.addEd2k(link, { category_id });
    } else {
      await this.client.addMagnet(link, { category_id });
    }
    const hash = hashFromLink(link);
    if (hash) this.trackDownload(hash, 'Unknown', null, username, categoryName || null);
    return { success: true };
  }

  // ── Search ───────────────────────────────────────────────────────────

  /**
   * Run a search and wait (bounded) for results, mirroring aMule's blocking
   * search() surface: returns { results, resultsLength }. `type`/`extension`
   * are ignored — Rucio searches both its own network and eMule/Kad.
   * @returns {Promise<{results: Array, resultsLength: number}>}
   */
  async search(query, _type, _extension) {
    if (!this.client) throw new Error('Rucio not connected');
    // NFC-normalise before splitting: a decomposed accent (common from macOS
    // and *arr pastes) looks identical on screen but the eMule/Kad bridge
    // matches nothing with it. Rucio's own network folds accents either way.
    const composed = normaliseQueryForm(String(query || ''));
    if (composed !== query) {
      this.log(`Search query composed to NFC: "${query}" -> "${composed}"`);
    }
    const keywords = composed.trim().split(/\s+/).filter(Boolean);
    if (keywords.length === 0) return { results: [], resultsLength: 0 };

    const { id } = await this.client.startSearch(keywords, 'both');

    // Poll until done or a ~60s budget elapses (Gossipsub ~30s, Kad2 ~60s).
    const deadline = Date.now() + 62000;
    let detail;
    /* eslint-disable no-await-in-loop */
    do {
      await new Promise(r => setTimeout(r, 2000));
      detail = await this.client.getSearch(id);
    } while (detail.state === 'running' && Date.now() < deadline);
    /* eslint-enable no-await-in-loop */

    return this._mapSearchResults(id, detail);
  }

  /**
   * Return the most recent search's results (used for the "previous results"
   * panel and as the file-info lookup during batch download).
   */
  async getSearchResults() {
    if (!this.client) throw new Error('Rucio not connected');
    if (this._lastSearch.id == null) return { results: [] };
    const detail = await this.client.getSearch(this._lastSearch.id).catch(() => null);
    if (!detail) return { results: this._lastSearch.results };
    return this._mapSearchResults(this._lastSearch.id, detail);
  }

  // Map Rucio search detail → the result row shape the frontend renders
  // (fileHash/fileName/fileSize/sourceCount/ed2kLink), and refresh the
  // hash→link map used by addSearchResult().
  //
  // Results that share a hash are grouped under one row with the others as
  // `children` (#82): the eMule/Kad bridge can return one file under several
  // names, and the results list keys every row by fileHash, so emitting them
  // flat would collide. The richest variant (most sources, then largest size)
  // becomes the parent, and its source count is the group total.
  _mapSearchResults(id, detail) {
    const links = new Map();
    // Derive the "already downloaded / queued" badge (#77): the daemon doesn't
    // report it, so key it off what this client currently holds. Sharing a file
    // means we have it, so it wins over an in-flight download of the same hash.
    const statusByHash = new Map();
    for (const d of (this.lastDownloads || [])) {
      if (d.hash) statusByHash.set(String(d.hash).toLowerCase(), d.isComplete ? SEARCH_STATUS.DOWNLOADED : SEARCH_STATUS.QUEUED);
    }
    for (const f of (this.lastSharedFiles || [])) {
      if (f.hash) statusByHash.set(String(f.hash).toLowerCase(), SEARCH_STATUS.DOWNLOADED);
    }
    const groups = new Map(); // fileHash → variant rows
    for (const r of (detail.results || [])) {
      const link = r.download_link;
      const fileHash = hashFromLink(link);
      if (!fileHash) continue; // can't be queued without a hash; skip
      const row = {
        fileHash,
        fileName: r.name,
        fileSize: r.size,
        sourceCount: r.peer_count || 0,
        ed2kLink: link,
        source: r.source,
        rating: 0,
        categories: []
      };
      if (!groups.has(fileHash)) groups.set(fileHash, []);
      groups.get(fileHash).push(row);
    }

    const results = [];
    for (const rows of groups.values()) {
      rows.sort((a, b) => (b.sourceCount - a.sourceCount) || (b.fileSize - a.fileSize));
      const [parent, ...children] = rows;
      // Use the richest variant's count, not the sum: the same hash under
      // several eMule/Kad names can be served by overlapping peers, so summing
      // would double-count and wrongly float those results to the top.
      const groupSources = Math.max(...rows.map(x => x.sourceCount || 0));
      links.set(parent.fileHash, parent.ed2kLink); // queue the richest variant
      results.push({
        ...parent,
        sourceCount: groupSources,
        downloadStatus: statusByHash.get(parent.fileHash) ?? SEARCH_STATUS.NEW,
        children
      });
    }

    this._lastSearch = { id, results, links };
    return { results, resultsLength: results.length };
  }

  // ── Category CRUD (synced to the daemon: name, colour, download dir) ──

  async getCategories() {
    if (!this.client) return null;
    return this.client.getCategories();
  }

  // CategoryManager passes { name, path, color (aMule BGR int), comment, priority }.
  async createCategory({ name, path, color } = {}) {
    if (!this.client || !name) return null;
    const created = await this._createCategoryRaw({ name, color, path });
    return created ? { id: created.id, name } : null;
  }

  async deleteCategory({ id, name } = {}) {
    if (!this.client) return;
    let catId = id;
    if (catId == null && name) {
      const cats = await this.client.getCategories();
      catId = cats.find(c => c.name.toLowerCase() === String(name).toLowerCase())?.id;
    }
    if (catId != null) await this.client.deleteCategory(catId);
  }

  // Update colour/dir (and name) of an existing category. `id` is the daemon
  // category id we returned earlier as `amuleId`; fall back to lookup by name,
  // and create it if it isn't in the daemon yet.
  async editCategory({ id, name, path, color } = {}) {
    if (!this.client || !name) return null;
    let catId = id;
    if (catId == null) {
      const cats = await this.client.getCategories();
      catId = cats.find(c => c.name.toLowerCase() === String(name).toLowerCase())?.id;
    }
    if (catId == null) {
      const created = await this._createCategoryRaw({ name, color, path });
      return created ? { success: true, verified: true, amuleId: created.id } : null;
    }
    await this._updateCategoryRaw(catId, { name, color, path });
    return { success: true, verified: true };
  }

  async renameCategory({ id, oldName, newName, path, color } = {}) {
    if (!this.client || !newName) return null;
    let catId = id;
    if (catId == null && oldName) {
      const cats = await this.client.getCategories();
      catId = cats.find(c => c.name.toLowerCase() === String(oldName).toLowerCase())?.id;
    }
    if (catId == null) return null;
    await this._updateCategoryRaw(catId, { name: newName, color, path });
    return { success: true };
  }

  // CategoryManager keys off `amuleId` to record the per-instance category id;
  // return the Rucio id under that name so later edits can target it.
  async ensureCategoryExists({ name, path, color } = {}) {
    const id = await this._resolveOrCreateCategoryId(name, { color, path });
    return id != null ? { name, amuleId: id } : null;
  }

  async ensureCategoriesBatch(categories = []) {
    const out = [];
    for (const cat of categories) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const id = await this._resolveOrCreateCategoryId(cat.name, { color: cat.color, path: cat.path });
        if (id != null) out.push({ name: cat.name, amuleId: id });
      } catch (err) {
        this.warn(`Failed to ensure category "${cat.name}": ${err.message}`);
      }
    }
    return out;
  }

  // ── Category sync on (re)connect ─────────────────────────────────────

  // Two-way category reconciliation, run once per connection. server.js skips
  // any manager without this method, so without it Rucio's categories are
  // never imported and the per-instance sync toggle has nothing to act on.
  // The second argument ({ qbittorrentAPI }) is unused here. Mirrors the other
  // managers (delugeManager is the closest template).
  async onConnectSync(categoryManager) {
    if (!this.client) return;

    let rucioCats;
    try {
      rucioCats = await this.client.getCategories();
    } catch (err) {
      this.error(`Failed to fetch categories for sync: ${logger.errorDetail(err)}`);
      return;
    }

    // Phase 1 — import the daemon's categories into the app (gated by sync-out).
    // Only name + colour cross over; Rucio's download dirs live on the daemon
    // host (a different filesystem), so paths are deliberately not imported.
    let createdInApp = 0;
    if (this.isCategorySyncOut()) {
      for (const cat of (rucioCats || [])) {
        const name = cat?.name;
        if (!name || name === 'Default') continue;
        if (categoryManager.getByName(name)) {
          // Already known — record this instance as another contributor so the
          // category stays live (and isn't propagated as app-owned; see #85).
          categoryManager.addSource(name, this.instanceId);
          continue;
        }
        categoryManager.importCategory({
          source: this.instanceId,
          name,
          color: cat.color || undefined,
          comment: 'Auto-created from Rucio'
        });
        createdInApp++;
      }
      if (createdInApp > 0) await categoryManager.save();
    }

    // Phase 2 — push the app's categories to the daemon (gated by sync-in).
    if (this.isCategorySyncIn()) {
      const existing = new Set((rucioCats || []).map(c => c.name?.toLowerCase()));
      for (const [name, cat] of categoryManager.getCategoriesSnapshot().entries()) {
        if (name === 'Default' || existing.has(name.toLowerCase())) continue;
        try {
          // eslint-disable-next-line no-await-in-loop
          await this._createCategoryRaw({ name, color: cat.color, path: cat.path });
          this.log(`Pushed category "${name}" to Rucio`);
        } catch (err) {
          this.error(`Failed to push category "${name}" to Rucio: ${logger.errorDetail(err)}`);
        }
      }
    }

    // Propagate any newly imported categories to the other clients (sync-out).
    if (this.isCategorySyncOut()) {
      await categoryManager.propagateToOtherClients(this.instanceId);
    }
  }

  // ── Shutdown ─────────────────────────────────────────────────────────

  async shutdown() {
    this.log('Shutting down...');
    this.clearReconnect();
    let waited = 0;
    while (this.connectionInProgress && waited < 50) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise(r => setTimeout(r, 100));
      waited++;
    }
    if (this.client) {
      try {
        await this.client.disconnect();
      } catch (err) {
        this.error('Error during shutdown:', logger.errorDetail(err));
      }
      this.client = null;
    }
  }
}

module.exports = { RucioManager };
