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
const { hashFromLink } = require('../lib/rucio/links');
const { parseEd2kLink } = require('../lib/torrentUtils');

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
  // aMule BGR integer → '#rrggbb' — reuse CategoryManager's converter so the two
  // don't drift (require inline, matching the on-demand lookup below).
  if (typeof color === 'number') {
    return require('../lib/CategoryManager').amuleColorToHex(color);
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
    // Shared files refresh on their own slower cadence (paging a big library is
    // expensive); reused between refreshes. See fetchData. `_invalidateShares()`
    // forces the next poll to refetch after a change (a delete, or a download
    // just completing into a share).
    this._lastSharesFetch = 0;
    this._sharesRefreshIntervalMs = 30000;
    // Completed-download hashes seen last poll, to spot a new completion and
    // refresh shares promptly (a finished download becomes a shared file).
    // null = not seeded yet: the first poll records the set without forcing a
    // share refresh, so a restart doesn't re-fetch shares for already-done items.
    this._completedHashes = null;
    // Daemon category list kept by fetchData and reused by the category helpers
    // (null = not fetched / invalidated after a create/update/delete). Refreshed
    // on a slow cadence like the shared files — not every poll — so a category
    // created/renamed in Rucio's own panel still shows up within the interval,
    // while our own edits invalidate it for an immediate refetch.
    this.lastCategories = null;
    this._lastCategoriesFetch = 0;
    this._categoriesRefreshIntervalMs = 30000;
    // hash (lowercase) → signed integer download id, rebuilt each fetchData.
    this.hashToId = new Map();
    // Search state. Rucio search is async (own id, polled); we mirror aMule's
    // blocking search() surface and keep a hash→download_link map so a result
    // can be queued by hash later. (_searchInProgress is initialised by the base.)
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
      // Drop the cached category list so the first poll after a (re)connect
      // refetches it immediately — categories may have changed while we were
      // disconnected, rather than waiting out the slow refresh interval.
      this.lastCategories = null;
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

  // Search lock (acquire/release/broadcast/isSearchInProgress) lives in
  // BaseClientManager — one search at a time per client, the search box greys
  // while held.

  // ── History ──────────────────────────────────────────────────────────

  // Shape a unified Rucio item (download or shared file) into the history record,
  // using the same single-file, source-based default as aMule. Rucio exposes no
  // per-file uploaded total, so ratio stays 0. (autoRefreshManager calls this on
  // every item with no guard — a manager missing it breaks history for ALL clients.)
  extractHistoryMetadata(item) {
    return this.sourceBasedHistoryMetadata(item, item.uploadTotal || 0);
  }

  // ── Data fetch ───────────────────────────────────────────────────────

  // Fetch every shared file, paging through the daemon's list. Driven by the
  // reported `total`, not by comparing a page to our requested limit: the daemon
  // may cap a page below 1000, so a short page is not necessarily the last.
  // An empty page ends it; the real guard against a daemon that ignores `offset`
  // (and reports no `total`) is stopping as soon as a page repeats the previous
  // one — otherwise the same page would be fetched and duplicated forever.
  async _getAllShares() {
    const limit = 1000; // what we request; the daemon may serve fewer per page
    let offset = 0;
    let total = null;
    let prevSig = null;
    const shares = [];
    const sigOf = (batch) => {
      const id = (s) => s?.root_hash || s?.hash || '';
      return `${batch.length}:${id(batch[0])}:${id(batch[batch.length - 1])}`;
    };
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const page = await this.client.getShares({ limit, offset });
      const batch = page?.shares || [];
      // Only trust a positive reported total; a missing or 0 total means "not
      // reported", so fall through to the empty-page / repeated-page guards below
      // instead of stopping after the first page.
      if (Number.isFinite(page?.total) && page.total > 0) total = page.total;
      if (batch.length === 0) break;
      // Same page as last time → the daemon is ignoring offset; stop before
      // re-adding it (don't push the repeat).
      const sig = sigOf(batch);
      if (sig === prevSig) break;
      prevSig = sig;
      shares.push(...batch);
      offset += batch.length;
      if (total !== null && shares.length >= total) break;
    }
    return { shares };
  }

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

    // Shared files change slowly and paging a large library is expensive (it
    // can be ~20 sequential requests for 20k shares, which every client's
    // refresh waits on), so refresh them on their own slower interval and reuse
    // the cached list between — like aMule's shared-files reload.
    const refreshShares = (Date.now() - this._lastSharesFetch) >= this._sharesRefreshIntervalMs;
    // Reuse the cached category list across polls, refreshing it on the same slow
    // cadence as the shared files (not every poll — that was the waste), and
    // immediately when our own create/update/delete invalidates it to null. The
    // slow refresh also picks up a category created/renamed in Rucio's own panel.
    const refreshCategories = !Array.isArray(this.lastCategories) ||
      (Date.now() - this._lastCategoriesFetch) >= this._categoriesRefreshIntervalMs;

    let rawDownloads, sharesResult, rucioCategories;
    try {
      [rawDownloads, sharesResult, rucioCategories] = await Promise.all([
        this.client.getDownloads(),
        // A failing share page is not a lost connection: keep the last list and
        // retry next poll (via its own catch), rather than dropping the client in
        // the shared Promise.all and failing every Rucio action until it reconnects.
        refreshShares
          ? this._getAllShares().catch((err) => {
              this.warn(`Shared-files refresh failed (keeping last list): ${err.message}`);
              return null;
            })
          : Promise.resolve(null),
        // null (not []) on failure, so we can tell a real empty list from a
        // failed fetch and keep the last known one instead.
        refreshCategories ? this.client.getCategories().catch(() => null) : Promise.resolve(null)
      ]);
    } catch (err) {
      triggerReconnect(err);
      // Reuse the last-known frame so the UI doesn't flash empty during reconnect.
      return { downloads: this.lastDownloads, sharedFiles: this.lastSharedFiles };
    }

    // Keep the daemon's category list so the category helpers can reuse it
    // instead of refetching per call (propagation / batch recategorize). On a
    // failed fetch keep the last known list — caching an empty one would blank
    // every category name this poll and let the next edit wipe match_keywords.
    if (Array.isArray(rucioCategories)) {
      this.lastCategories = rucioCategories;
      this._lastCategoriesFetch = Date.now();
    }
    const categoryList = this.lastCategories || [];

    // Resolve category_id → name from the daemon's own category list.
    const catNameById = new Map(categoryList.map(c => [c.id, c.name]));
    const resolveCategoryName = (id) => (id == null ? 'Default' : (catNameById.get(id) || 'Default'));

    // ── Downloads + hash→id map ──────────────────────────────────────────
    this.hashToId.clear();
    const downloads = [];
    for (const d of rawDownloads) {
      if (d.root_hash) this.hashToId.set(String(d.root_hash).toLowerCase(), d.id);
      downloads.push(normalizeRucioDownload(d, resolveCategoryName));
    }

    // Stamp instanceId on every item so the unified pipeline and batch
    // operations (pause/resume/cancel/delete/category) can resolve this
    // manager from the registry. Without it the UI reports "Client instance
    // not found" on any action.
    const instanceId = this.instanceId;
    downloads.forEach(d => { d.instanceId = instanceId; });

    // ── Shared files (refreshed on the slower interval; reused otherwise) ──
    let sharedFiles;
    if (sharesResult) {
      sharedFiles = (sharesResult.shares || []).map(normalizeRucioSharedFile);
      sharedFiles.forEach(f => { f.instanceId = instanceId; });
      this.lastSharedFiles = sharedFiles;
      this._lastSharesFetch = Date.now();
    } else {
      sharedFiles = this.lastSharedFiles; // already normalised + stamped
    }

    // A download that just completed becomes a shared file; force the next poll
    // to refresh shares instead of waiting out the slow interval. Done after the
    // share section above so it isn't overwritten by this cycle's fetch stamp.
    const completedNow = new Set(
      downloads.filter(d => d.isComplete && d.hash).map(d => String(d.hash).toLowerCase())
    );
    // First poll (nothing seeded yet, _completedHashes null) just records the set:
    // every completed download would otherwise look "new" and force a second full
    // share fetch right after a restart.
    const prevCompleted = this._completedHashes;
    const hasNewCompletion = prevCompleted != null &&
      [...completedNow].some(h => !prevCompleted.has(h));
    this._completedHashes = completedNow;
    if (hasNewCompletion) this._invalidateShares();

    this.lastDownloads = downloads;
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
    // Accept both casings: the daemon serializes most of its API in snake_case
    // ('high_id') but NodeClass currently has no serde rename (→ 'HighId').
    // Matching both keeps this working whichever the connected daemon sends.
    const highId = status.class === 'HighId' || status.class === 'high_id';
    return {
      status: highId ? 'green' : 'yellow',
      text: highId ? 'Connected' : 'Limited',
      connected: true
    };
  }

  // Rucio links are ed2k:// (MD4) or rucio: (BLAKE3) — override the base reader.
  // The unqualified call resolves to the imported helper, not this method.
  hashFromLink(link) {
    return hashFromLink(link);
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
    const h = String(hash).toLowerCase();
    const dl = (this.lastDownloads || []).find(d => String(d.hash).toLowerCase() === h);
    // The daemon only renames a download that's still in progress; a completed
    // download, or a file that was only ever shared, has no renameable entry.
    // The context menu already hides rename for those, but guard here too.
    if (!dl || dl.isComplete) {
      throw new Error('Rucio can only rename a download that is still in progress');
    }
    await this.client.renameDownload(this._idForHash(hash), newName);
    return { success: true };
  }

  // Force the next fetchData to refetch the share list, so a change the cache
  // wouldn't otherwise reflect (a delete, or a download completing into a share)
  // shows up on the next poll instead of after the slow refresh interval.
  _invalidateShares() {
    this._lastSharesFetch = 0;
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
   * The on-disk file is left intact unless `deleteFiles` is set. The path comes
   * from the shared-files list; for a completed download not in that list yet (or
   * never shared) we fall back to the daemon's download detail (`dest_path`), so
   * a disk wipe works for any completed item, not only one currently shared.
   */
  async deleteItem(hash, { deleteFiles } = {}) {
    if (!this.client) throw new Error('Rucio not connected');
    // Capture the client once: a concurrent fetchData reconnect failure can null
    // this.client mid-delete, which would turn a later call into a TypeError
    // (possibly after cancel but before remove, leaving a partial state).
    const client = this.client;
    const h = String(hash).toLowerCase();

    const shared = (this.lastSharedFiles || []).find(f => String(f.hash).toLowerCase() === h);
    // `shared.path` is the containing folder (for resolveItemPath); the real
    // on-disk file path to wipe is the daemon's full path in raw.
    let filePath = shared?.raw?.path || null;

    const id = this.hashToId.get(h);
    const dl = id !== undefined
      ? (this.lastDownloads || []).find(d => String(d.hash).toLowerCase() === h)
      : null;

    // A completed download may not be in the cached share list — ask the daemon
    // for its destination path so "delete with files" actually wipes it. Only for
    // a COMPLETE download: an active one's partial is discarded by cancel below,
    // so there's no separate file for aMuTorrent to delete.
    if (deleteFiles && !filePath && dl?.isComplete) {
      try {
        const detail = await client.getDownload(id);
        filePath = detail?.dest_path || null;
      } catch { /* best-effort; no path means nothing to wipe */ }
    }
    const pathsToDelete = deleteFiles && filePath ? [filePath] : [];

    if (id !== undefined) {
      // Cancel only an active download (cancel discards the partial file); a
      // completed one is just dropped from the list, never cancelled, so the
      // finished file is never touched. Cancel is best-effort — it legitimately
      // no-ops / errors on an already-terminal download — so it stays caught.
      if (!dl?.isComplete) await client.cancelDownload(id).catch(() => {});
      // removeDownload / unshare are the operation itself: let a refusal throw
      // so the caller reports failure instead of a false success + a row that
      // reappears on the next poll.
      await client.removeDownload(id);
      if (shared) {
        await client.unshare(h);
      } else if (dl?.isComplete) {
        // A completed download is seeded (seedsCompletedFiles) even when it isn't
        // in the cached share list yet — a stale/failed share refresh, or a large
        // paged library. Un-share it too, or the daemon keeps seeding and the row
        // reappears pointing at a now-deleted file. Best-effort: it may genuinely
        // not be shared, in which case unshare is a harmless no-op.
        await client.unshare(h).catch(() => {});
      }
    } else {
      await client.unshare(h);
    }
    this._invalidateShares();
    // Lower-cased, to match the add paths (parseEd2kLink/hashFromLink record
    // lowercase hashes) so the history deletion lines up with the recorded item.
    this.trackDeletion(h);
    return { success: true, pathsToDelete };
  }

  async setCategoryOrLabel(hash, { categoryName } = {}) {
    if (!this.client) throw new Error('Rucio not connected');
    const id = this.hashToId.get(String(hash).toLowerCase());
    if (id === undefined) {
      // A file that was only ever shared (never a download) has no download id;
      // the daemon files by category on the download, not the share.
      throw new Error('Rucio can only change the category of a download, not a file that was only ever shared');
    }
    const categoryId = await this.ensureAmuleCategoryId(categoryName);
    await this.client.setDownloadCategory(id, categoryId);
    return { success: true };
  }

  // ── Adding downloads ─────────────────────────────────────────────────

  /**
   * Resolve an aMuTorrent category name to a Rucio category id, creating the
   * category in the daemon if it doesn't exist yet. Returns null for the
   * default/global category. Named to match the contract the search/add
   * handlers call (they were written for aMule). A category created on demand
   * carries over the app category's name, colour and download dir, so it isn't
   * name-only.
   */
  async ensureAmuleCategoryId(categoryName) {
    if (!this.client) throw new Error('Rucio not connected');
    if (!categoryName || categoryName === 'Default') return null;
    // Carry over the colour and download dir from the app's category so a
    // category created on demand (adding/recategorizing) isn't name-only.
    const appCat = require('../lib/CategoryManager').getByName?.(categoryName);
    return this._resolveOrCreateCategoryId(categoryName, { color: appCat?.color, path: appCat?.path });
  }

  // The daemon's category list — reuse the one fetchData keeps (refreshed on a
  // slow cadence) instead of refetching per call. `fresh` forces a fetch;
  // mutations invalidate it (set to null) so the next read is fresh. A fetch here
  // also stamps the poll's refresh timer, so an on-demand fetch doesn't leave
  // fetchData thinking the cache is stale and refetching again right after.
  async _knownCategories({ fresh = false } = {}) {
    if (!fresh && Array.isArray(this.lastCategories)) return this.lastCategories;
    this.lastCategories = (await this.client.getCategories()) || [];
    this._lastCategoriesFetch = Date.now();
    return this.lastCategories;
  }

  // Case-insensitive name → id lookup in a daemon category list. The one place
  // that match lives, so the CRUD helpers below can't spell it differently.
  // Returns the id, or undefined when the name isn't in the list.
  _findCategoryId(cats, name) {
    if (!name) return undefined;
    const lower = String(name).toLowerCase();
    return (cats || []).find(c => c.name?.toLowerCase() === lower)?.id;
  }

  // Find a daemon category by name (case-insensitive), creating it with the
  // given colour/dir if missing. Returns its id, or null for Default/none.
  // `cats` (optional) is a caller-owned list to resolve against and extend —
  // used by ensureCategoriesBatch to resolve a whole set from one fetch.
  async _resolveOrCreateCategoryId(name, { color, path } = {}, cats = null) {
    if (!name || name === 'Default') return null;
    const list = cats || await this._knownCategories();
    let id = this._findCategoryId(list, name);
    if (id == null && !cats) {
      // Missed in the reused list — confirm against a fresh fetch before
      // creating, so a stale cache can't produce a duplicate category.
      id = this._findCategoryId(await this._knownCategories({ fresh: true }), name);
    }
    if (id != null) return id;
    const created = await this._createCategoryRaw({ name, color, path });
    if (created && Array.isArray(cats)) cats.push(created); // keep the batch list current
    return created?.id ?? null;
  }

  // Create with colour + download_dir, retrying without the dir if the daemon
  // rejects it (e.g. the path doesn't exist on the daemon host) so a category
  // is still created rather than failing outright.
  async _createCategoryRaw({ name, color, path }) {
    const body = { name, color: toHexColor(color), download_dir: path || undefined };
    let created;
    try {
      created = await this.client.createCategory(body);
    } catch (err) {
      if (body.download_dir && /HTTP 400/.test(err.message)) {
        this.warn(`Rucio rejected download_dir for category "${name}" (${err.message}); creating without it`);
        created = await this.client.createCategory({ name, color: body.color });
      } else {
        throw err;
      }
    }
    this.lastCategories = null; // the daemon's list changed
    return created;
  }

  async _updateCategoryRaw(id, { name, color, path }) {
    // The daemon's PUT is a full replace, and aMuTorrent manages neither Rucio's
    // keyword auto-filing rules (match_keywords) nor its download dir — the latter
    // lives on the daemon host and onConnectSync imports categories without it.
    // Read both and send them back untouched when we don't have our own, so
    // editing a category's name/colour here can't wipe what the user set in
    // Rucio's own panel. Read FRESH, not from the cache: categories refresh on a
    // slow interval now, so a cached row's match_keywords could be stale and a
    // full-replace PUT would overwrite a change made in the panel since. And we
    // must NOT update at all when the values can't be read — a PUT without
    // match_keywords would silently wipe the rules.
    let cur;
    try {
      cur = (await this._knownCategories({ fresh: true })).find(c => c.id === id);
    } catch (err) {
      throw new Error(`Cannot read Rucio category ${id} before updating it (would wipe its keyword rules): ${err.message}`);
    }
    if (!cur) {
      throw new Error(`Rucio category ${id} not found; refusing to update and wipe its keyword rules`);
    }
    const match_keywords = cur.match_keywords ?? undefined;
    const currentDownloadDir = cur.download_dir ?? undefined;
    // Keep the daemon's dir when we have no path of our own.
    const download_dir = path || currentDownloadDir || undefined;
    const body = { name, color: toHexColor(color), download_dir, match_keywords };
    const update = async (b) => {
      const res = await this.client.updateCategory(id, b);
      this.lastCategories = null; // the daemon's list changed
      return res;
    };
    try {
      return await update(body);
    } catch (err) {
      if (body.download_dir && /HTTP 400/.test(err.message)) {
        this.warn(`Rucio rejected download_dir for category "${name}" (${err.message}); keeping the daemon's`);
        // Our path was rejected (likely doesn't exist on the daemon host) — fall
        // back to the daemon's current dir, never wipe it.
        return await update({ name, color: body.color, download_dir: currentDownloadDir || undefined, match_keywords });
      }
      throw err;
    }
  }

  // categoryId comes from ensureAmuleCategoryId() (or the legacy `?? 0` in the
  // handlers); normalize anything non-positive to null = global category.
  _normalizeCategoryId(categoryId) {
    return categoryId && categoryId > 0 ? categoryId : null;
  }

  // Queue a link with the daemon, routed by scheme: ed2k:// → eMule endpoint,
  // anything else (rucio: magnet) → libp2p endpoint. The one place the scheme
  // routing lives, shared by the three add paths.
  async _addLink(link, { category_id = null } = {}) {
    if (String(link).toLowerCase().startsWith('ed2k://')) {
      await this.client.addEd2k(link, { category_id });
    } else {
      await this.client.addMagnet(link, { category_id });
    }
  }

  // Resolve a daemon category id to its name for history display — aMule records
  // the name, not the id (so history reads "Movies", not "7"). Cached briefly so
  // a batch add doesn't refetch the list per item.
  async _categoryNameById(id) {
    if (id == null) return null;
    try {
      return (await this._knownCategories()).find(c => c.id === id)?.name || null;
    } catch {
      return null;
    }
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
    await this._addLink(link, { category_id });

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
    // groups both under it) — _addLink routes by scheme.
    await this._addLink(link, { category_id });
    // An ed2k link carries the file name and size, like aMule parses — record them
    // so history isn't "Unknown" with no size. A rucio: magnet carries neither, so
    // fall back to just the hash.
    const { hash: ed2kHash, filename, size } = parseEd2kLink(link);
    if (ed2kHash) {
      this.trackDownload(ed2kHash, filename || 'Unknown', size || null, username, null);
    } else {
      const hash = hashFromLink(link);
      if (hash) this.trackDownload(hash, 'Unknown', null, username, null);
    }
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
    await this._addLink(link, { category_id });
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
    // Capture the client once: a failed refresh mid-search can null this.client,
    // and reading it again in the poll loop or the cancel path would throw a
    // TypeError that hides the real error and leaves the daemon search running.
    const client = this.client;
    // NFC-normalise before splitting: a decomposed accent (common from macOS
    // and *arr pastes) looks identical on screen but the eMule/Kad bridge
    // matches nothing with it. Rucio's own network folds accents either way.
    const composed = normaliseQueryForm(String(query || ''));
    if (composed !== query) {
      this.log(`Search query composed to NFC: "${query}" -> "${composed}"`);
    }
    const keywords = composed.trim().split(/\s+/).filter(Boolean);
    if (keywords.length === 0) return { results: [], resultsLength: 0 };

    const { id } = await client.startSearch(keywords, 'both');

    // Poll until done or a ~60s budget elapses (Gossipsub ~30s, Kad2 ~60s).
    const deadline = Date.now() + 62000;
    let detail;
    try {
      /* eslint-disable no-await-in-loop */
      do {
        await new Promise(r => setTimeout(r, 2000));
        detail = await client.getSearch(id);
        // Accept both casings, like the download states: a daemon without the
        // serde rename sends 'Running', which must not end the poll after 2s.
        // `detail?.` guards an empty body (204/null) so it ends the poll cleanly
        // instead of throwing a TypeError that would mask the real state.
      } while (String(detail?.state).toLowerCase() === 'running' && Date.now() < deadline);
      /* eslint-enable no-await-in-loop */
    } catch (err) {
      // A poll failed — cancel the daemon-side search so it doesn't linger.
      await client.cancelSearch(id).catch(() => {});
      throw err;
    }

    // Timed out while still running → cancel so abandoned searches don't pile up
    // on the daemon. (getSearchResults falls back to the cached results map, so
    // cancelling doesn't break the "previous results" panel or batch download.)
    if (String(detail?.state).toLowerCase() === 'running') {
      await client.cancelSearch(id).catch(() => {});
    }

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
  // becomes the parent, and the group's source count is that richest variant's.
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
    for (const r of (detail?.results || [])) {
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
      catId = this._findCategoryId(await this._knownCategories(), name);
    }
    if (catId != null) {
      await this.client.deleteCategory(catId);
      this.lastCategories = null; // the daemon's list changed
    }
  }

  // Update colour/dir (and name) of an existing category. `id` is the daemon
  // category id we returned earlier as `amuleId`; fall back to lookup by name,
  // and create it if it isn't in the daemon yet.
  async editCategory({ id, name, path, color } = {}) {
    if (!this.client || !name) return null;
    let catId = id;
    if (catId == null) {
      catId = this._findCategoryId(await this._knownCategories(), name);
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
      catId = this._findCategoryId(await this._knownCategories(), oldName);
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
    // One fetch for the whole batch; _resolveOrCreateCategoryId resolves against
    // this list and appends the categories it creates, so 30 categories cost one
    // request plus the actual creates, not 30 list fetches.
    const cats = await this._knownCategories({ fresh: true });
    for (const cat of categories) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const id = await this._resolveOrCreateCategoryId(cat.name, { color: cat.color, path: cat.path }, cats);
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
