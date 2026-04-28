/**
 * DataFetchService - Centralized data assembly and enrichment
 *
 * Fetches data from all connected client managers via their unified fetchData()
 * interface, assembles unified items, and enriches with GeoIP/hostname data.
 *
 * Both webSocketHandlers and autoRefreshManager use this service to avoid
 * code duplication and ensure consistent data handling.
 */

const BaseModule = require('./BaseModule');
const { assembleUnifiedItems } = require('./unifiedItemBuilder');
const { itemKey } = require('./itemKey');
const moveOperationManager = require('./MoveOperationManager');
const config = require('../modules/config');
const clientMeta = require('./clientMeta');

// Client registry - replaces direct singleton manager imports
const registry = require('./ClientRegistry');
const geoIPManager = require('../modules/geoIPManager');
const categoryManager = require('./CategoryManager');
const hostnameResolver = require('./hostnameResolver');

// Demo mode generator (lazy-loaded)
let demoGenerator = null;

class DataFetchService extends BaseModule {
  constructor() {
    super();
    // Cache for last fetched batch data (used by history API to avoid redundant fetches)
    this._cachedBatchData = null;
    this._cacheTimestamp = 0;
  }

  /**
   * Get cached batch data if available and fresh
   * @param {number} maxAge - Maximum cache age in ms (default 5000ms)
   * @returns {Object|null} Cached data or null if stale/missing
   */
  getCachedBatchData(maxAge = 5000) {
    if (!this._cachedBatchData) return null;
    if (Date.now() - this._cacheTimestamp > maxAge) return null;
    return this._cachedBatchData;
  }

  // ============================================================================
  // ENRICHMENT
  // ============================================================================

  /**
   * Enrich peers array with GeoIP and hostname data
   * @param {Array} peers - Array of objects with an `address` field
   * @returns {Array} Enriched peers array
   */
  _enrichPeers(peers) {
    if (!Array.isArray(peers) || peers.length === 0) {
      return peers;
    }

    let enrichedPeers = peers;

    if (geoIPManager) {
      enrichedPeers = geoIPManager.enrichPeersWithGeo(enrichedPeers);
    }

    if (hostnameResolver) {
      enrichedPeers = hostnameResolver.enrichPeersWithHostnames(enrichedPeers);
    }

    return enrichedPeers;
  }

  /**
   * Enrich all unified items' peer arrays with GeoIP and hostname data.
   * Also enriches items with addedAt timestamp from database if not already set.
   * Called once after assembleUnifiedItems, so enrichment is centralized
   * regardless of which client the data came from.
   * @param {Array} items - Array of unified items
   */
  _enrichItems(items) {
    for (const item of items) {
      if (item.peers.length > 0) {
        item.peers = this._enrichPeers(item.peers);
      }
    }

    // Enrich with addedAt timestamp from download history database
    // rtorrent items may already have addedAt from creationDate, but aMule items won't
    this._enrichWithTimestamps(items);

    // Enrich unresolved magnet names (e.g., HASH.meta) with names from history
    this._enrichWithHistoryName(items);
  }

  /**
   * Enrich items with addedAt timestamp from download history database
   * For items without addedAt (aMule, or rtorrent with null creationDate),
   * look up the started_at timestamp from our history database
   * @param {Array} items - Array of unified items
   */
  _enrichWithTimestamps(items) {
    if (!this.downloadHistoryDB) {
      return;
    }

    for (const item of items) {
      // Skip if item already has addedAt (rtorrent with valid creationDate)
      if (item.addedAt) {
        continue;
      }

      // Look up from history database
      const historyEntry = this.downloadHistoryDB.getByHash(item.hash, item.instanceId);
      if (historyEntry && historyEntry.started_at) {
        item.addedAt = new Date(historyEntry.started_at);
      }
    }
  }

  /**
   * Enrich items with names from history when the client reports an unresolved name.
   * rTorrent shows the info hash with .meta suffix for magnets until metadata resolves.
   * @param {Array} items - Array of unified items
   */
  _enrichWithHistoryName(items) {
    if (!this.downloadHistoryDB) return;

    for (const item of items) {
      if (!item.name) continue;

      // Always set nameResolving explicitly (not undefined) because
      // JSON.stringify drops undefined values, preventing the delta
      // engine from clearing the flag on the frontend.
      if (/^[a-fA-F0-9]{40}\.meta$/.test(item.name)) {
        const historyEntry = this.downloadHistoryDB.getByHash(item.hash, item.instanceId);
        if (historyEntry?.filename && historyEntry.filename !== 'Unknown' && historyEntry.filename !== 'Magnet download') {
          item.name = historyEntry.filename;
          item.nameResolving = true;
        } else {
          item.nameResolving = false;
        }
      } else {
        item.nameResolving = false;
      }
    }
  }

  /**
   * Inject move operation status into matching items
   * Overrides status to 'moving' and adds progress information
   * @param {Array} items - Array of unified items
   */
  _injectMoveStatus(items) {
    const activeOps = moveOperationManager.getActiveOperations();
    if (!activeOps || activeOps.size === 0) {
      return;
    }

    for (const item of items) {
      const moveOp = activeOps.get(itemKey(item.instanceId, item.hash));
      if (moveOp) {
        // Override status to 'moving'
        item.status = 'moving';

        // Add move progress information
        item.moveProgress = moveOp.totalSize > 0
          ? Math.round((moveOp.bytesMoved / moveOp.totalSize) * 100)
          : 0;
        item.moveStatus = moveOp.status; // 'pending', 'moving', 'verifying'
        item.moveError = moveOp.errorMessage || null;

        // For multi-file, include file progress
        if (moveOp.isMultiFile) {
          item.moveFilesTotal = moveOp.filesTotal;
          item.moveFilesMoved = moveOp.filesMoved;
          item.moveCurrentFile = moveOp.currentFile;
        }
      }
    }
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Look up a single item's detail fields (raw, trackersDetailed) from cache
   * Used by API endpoints to serve modal-only data stripped from broadcasts
   * @param {string} hash - Item hash
   * @param {string} instanceId - Instance ID
   * @returns {{ raw: Object, trackersDetailed: Array }|null}
   */
  getItemDetail(hash, instanceId) {
    const cached = this.getCachedBatchData();
    if (!cached?.items) return null;
    const h = hash.toLowerCase();
    const item = cached.items.find(i =>
      i.hash?.toLowerCase() === h &&
      (!instanceId || i.instanceId === instanceId)
    );
    if (!item) return null;
    return {
      raw: item.raw || {},
      trackersDetailed: item.trackersDetailed || []
    };
  }

  /**
   * Get all data for batch update (downloads, shared, uploads, categories)
   * Fetches from all connected clients via their unified fetchData() interface
   * @returns {Promise<Object>} Batch data object
   */
  async getBatchData() {
    // Demo mode - return generated fake data
    if (config.DEMO_MODE) {
      if (!demoGenerator) {
        const DemoDataGenerator = require('./DemoDataGenerator');
        demoGenerator = new DemoDataGenerator();
      }
      const demoData = demoGenerator.getBatchData();

      // Cache for consistency with normal mode
      this._cachedBatchData = demoData;
      this._cacheTimestamp = Date.now();

      return demoData;
    }

    let allDownloads = [];
    let allShared = [];
    let categories = [];
    let clientDefaultPaths = {};
    let hasPathWarnings = false;

    // Get unified categories from CategoryManager if available
    if (categoryManager) {
      const frontendData = categoryManager.getAllForFrontend();
      categories = frontendData.categories;
      clientDefaultPaths = frontendData.clientDefaultPaths;
      hasPathWarnings = frontendData.hasPathWarnings || false;
    }

    // Use unified categories for normalization (convert frontend format to normalizer format)
    const categoriesForNormalizer = categories.map(c => ({
      id: c.id,
      title: c.title,
      color: c.color,
      path: c.path,
      comment: c.comment,
      priority: c.priority
    }));

    // Fetch data from all connected clients via unified fetchData() interface.
    // On fetch failure, fall back to the manager's last successful frame so
    // a single cycle tripping (EC timeout, transient I/O error) doesn't wipe
    // the UI. The connection health itself is tracked by the manager — this
    // layer only cares about preserving what the user last saw.
    for (const manager of registry.getConnected()) {
      try {
        const fetchStart = Date.now();
        const data = await manager.fetchData(categoriesForNormalizer);
        const fetchMs = Date.now() - fetchStart;

        // Warn if fetch took unusually long (>10s — EC timeout is 30s)
        if (fetchMs > 10000) {
          this.warn(`⚠️  ${manager.instanceId} fetchData() took ${(fetchMs / 1000).toFixed(1)}s`);
        }

        const dlCount = data.downloads?.length || 0;
        const sharedCount = data.sharedFiles?.length || 0;

        // Detect sudden data drop: previously had items, now returning empty
        const prevDl = manager._lastFetchCounts?.downloads || 0;
        const prevShared = manager._lastFetchCounts?.shared || 0;
        if ((prevDl > 0 && dlCount === 0) || (prevShared > 0 && sharedCount === 0)) {
          this.warn(`⚠️  ${manager.instanceId} returned empty data (downloads: ${prevDl}→${dlCount}, shared: ${prevShared}→${sharedCount}) — client may have lost connection`);
        }
        manager._lastFetchCounts = { downloads: dlCount, shared: sharedCount };
        manager._lastFetchData = data;
        manager._lastFetchFailures = 0;

        allDownloads = allDownloads.concat(data.downloads);
        allShared = allShared.concat(data.sharedFiles);
      } catch (err) {
        manager._lastFetchFailures = (manager._lastFetchFailures || 0) + 1;
        const prev = manager._lastFetchData;
        if (prev) {
          this.warn(`⚠️  ${manager.instanceId} fetchData failed (${manager._lastFetchFailures}×): ${err.message} — reusing last known frame`);
          allDownloads = allDownloads.concat(prev.downloads || []);
          allShared = allShared.concat(prev.sharedFiles || []);
        } else {
          this.error(`❌ ${manager.instanceId} fetchData failed with no cached frame: ${err.message}`);
        }
      }
    }

    // Build unified items from the normalized arrays
    const items = assembleUnifiedItems(allDownloads, allShared, categoryManager);

    // Enrich all peer arrays with GeoIP and hostname data (single pass, all clients)
    this._enrichItems(items);

    // Inject move operation status into items
    this._injectMoveStatus(items);

    // Separate shared files for history: only from clients with separate completion tracking
    // (aMule reports completion via shared files list; torrent clients use progress field)
    const sharedFilesForHistory = allShared.filter(f =>
      clientMeta.hasCapability(f.clientType, 'sharedMeansComplete')
    );

    const result = {
      items,
      categories,
      clientDefaultPaths,
      hasPathWarnings,
      // Unified arrays for history status computation (internal use only)
      _allDownloads: allDownloads,
      _sharedFilesForHistory: sharedFilesForHistory
    };

    // Cache the result for history API and other consumers
    this._cachedBatchData = result;
    this._cacheTimestamp = Date.now();

    return result;
  }
}

module.exports = new DataFetchService();
