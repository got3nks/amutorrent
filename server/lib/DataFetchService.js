/**
 * DataFetchService - Centralized data fetching, normalization, and enrichment
 *
 * This service encapsulates all logic for fetching data from aMule and rtorrent,
 * normalizing it to a common format, and enriching it with GeoIP/hostname data.
 *
 * Both webSocketHandlers and autoRefreshManager use this service to avoid
 * code duplication and ensure consistent data handling.
 */

const BaseModule = require('./BaseModule');
const {
  normalizeAmuleDownload,
  normalizeAmuleSharedFile,
  normalizeAmuleUpload,
  normalizeRtorrentDownload,
  extractRtorrentUploads
} = require('./downloadNormalizer');
const { assembleUnifiedItems } = require('./unifiedItemBuilder');
const moveOperationManager = require('./MoveOperationManager');

// Singleton managers - imported directly instead of injected
const amuleManager = require('../modules/amuleManager');
const rtorrentManager = require('../modules/rtorrentManager');
const geoIPManager = require('../modules/geoIPManager');
const categoryManager = require('./CategoryManager');
const hostnameResolver = require('./hostnameResolver');

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
      if (item.activeUploads.length > 0) {
        item.activeUploads = this._enrichPeers(item.activeUploads);
      }
      if (item.peersDetailed.length > 0) {
        item.peersDetailed = this._enrichPeers(item.peersDetailed);
      }
    }

    // Enrich with addedAt timestamp from download history database
    // rtorrent items may already have addedAt from creationDate, but aMule items won't
    this._enrichWithTimestamps(items);
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
      const historyEntry = this.downloadHistoryDB.getByHash(item.hash);
      if (historyEntry && historyEntry.started_at) {
        item.addedAt = new Date(historyEntry.started_at);
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
      const moveOp = activeOps.get(item.hash);
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
  // AMULE PROCESSING
  // ============================================================================

  /**
   * Normalize raw aMule uploads data structure.
   * Handles EC protocol quirks: EC_TAG_CLIENT wrapper, single-object responses.
   * @param {*} uploadsData - Raw uploads data from aMule
   * @returns {Array} Normalized uploads array
   */
  _normalizeAmuleUploads(uploadsData) {
    if (!uploadsData) {
      return [];
    }

    // Extract EC_TAG_CLIENT if present (aMule specific)
    let uploads = uploadsData.EC_TAG_CLIENT || uploadsData;

    // Normalize to array (aMule can return single object)
    if (Array.isArray(uploads)) {
      // Already an array
    } else if (uploads && typeof uploads === 'object') {
      uploads = [uploads];
    } else {
      uploads = [];
    }

    if (uploads.length === 0) {
      return uploads;
    }

    // Normalize EC_TAG_* fields to clean names
    return uploads.map(normalizeAmuleUpload);
  }

  /**
   * Process all raw aMule data into normalized downloads, shared files, and uploads.
   * Handles the bidirectional data flow between uploads and shared files:
   *   uploads → shared files: per-file upload speed and peer list
   *   shared files → uploads: category, size, hash
   *
   * @param {Array} rawDownloads - Raw downloads from aMule
   * @param {*} rawUploads - Raw uploads data from aMule (EC_TAG_CLIENT wrapper)
   * @param {Array} rawSharedFiles - Raw shared files from aMule
   * @param {Array} categories - Categories for name lookup and path-based derivation
   * @returns {Object} { downloads, sharedFiles, uploads }
   */
  _processAmuleData(rawDownloads, rawUploads, rawSharedFiles, categories = []) {
    // ── Normalize downloads ──────────────────────────────────────────────
    const downloads = (rawDownloads || []).map(d => normalizeAmuleDownload(d, categories));

    // ── Normalize uploads (unwrap EC protocol quirks) ────────────────────
    let uploads = this._normalizeAmuleUploads(rawUploads);

    // ── Aggregate upload speed by file name (for shared file assembly) ───
    const speedByFile = new Map();

    for (const upload of uploads) {
      const fileName = upload.fileName || '';
      if (!fileName) continue;

      const speed = upload.uploadRate || 0;
      if (speed > 0) {
        speedByFile.set(fileName, (speedByFile.get(fileName) || 0) + speed);
      }
    }

    // ── Normalize shared files (attach aggregated upload speed) ──────────
    const sharedFiles = (rawSharedFiles || []).map(f => {
      const normalized = normalizeAmuleSharedFile(f, categories);
      return {
        ...normalized,
        uploadSpeed: speedByFile.get(normalized.name) || 0
      };
    });

    // ── Enrich uploads with category/size/hash from shared files ─────────
    if (sharedFiles.length > 0 && uploads.length > 0) {
      const sharedByName = new Map();
      for (const sf of sharedFiles) {
        if (sf.name) {
          sharedByName.set(sf.name, sf);
        }
      }

      if (sharedByName.size > 0) {
        uploads = uploads.map(upload => {
          const sf = sharedByName.get(upload.fileName);
          if (sf) {
            return {
              ...upload,
              category: sf.category,
              fileSize: sf.size,
              sharedFileHash: sf.hash
            };
          }
          return upload;
        });
      }
    }

    return { downloads, sharedFiles, uploads };
  }

  // ============================================================================
  // RTORRENT PROCESSING
  // ============================================================================

  /**
   * Process raw rtorrent downloads into all derived data
   * Normalizes each item ONCE, then derives uploads and labels
   * @param {Array} rawDownloads - Raw downloads from rtorrent
   * @returns {Object} { downloads, uploads, labels }
   */
  _processRtorrentData(rawDownloads) {
    if (!rawDownloads || rawDownloads.length === 0) {
      return { downloads: [], uploads: [], labels: [] };
    }

    // Normalize all downloads
    const downloads = rawDownloads.map(d => normalizeRtorrentDownload(d));

    // Extract uploads (peers with active upload) from raw data
    const uploads = extractRtorrentUploads(rawDownloads);

    // Extract unique labels
    const labelsSet = new Set();
    rawDownloads.forEach(d => {
      if (d.label) labelsSet.add(d.label);
    });
    const labels = Array.from(labelsSet).sort();

    return { downloads, uploads, labels };
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Get all data for batch update (downloads, shared, uploads, categories)
   * Optimized to minimize API calls - fetches each source only once
   * @returns {Promise<Object>} Batch data object
   */
  async getBatchData() {
    let allDownloads = [];
    let allShared = [];
    let allUploads = [];
    let categories = [];
    let clientDefaultPaths = { amule: null, rtorrent: null };
    let hasPathWarnings = false;

    // Get unified categories from CategoryManager if available
    if (categoryManager) {
      const frontendData = categoryManager.getAllForFrontend();
      categories = frontendData.categories;
      clientDefaultPaths = frontendData.clientDefaultPaths;
      hasPathWarnings = frontendData.hasPathWarnings || false;
    }

    // Fetch all aMule data if connected
    if (amuleManager && amuleManager.isConnected()) {
      let rawDownloads = [], rawUploads = null, rawSharedFiles = [];

      // Use unified categories for normalization (convert frontend format to normalizer format)
      const categoriesForNormalizer = categories.map(c => ({
        id: c.id,
        title: c.title,
        color: c.color,
        path: c.path,
        comment: c.comment,
        priority: c.priority
      }));

      try {
        rawDownloads = await amuleManager.getClient().getDownloadQueue();
      } catch (err) {
        this.log('Error fetching aMule downloads:', err.message);
      }

      try {
        rawUploads = await amuleManager.getClient().getUploadingQueue();
      } catch (err) {
        this.log('Error fetching aMule uploads:', err.message);
      }

      try {
        rawSharedFiles = await amuleManager.getClient().getSharedFiles();
      } catch (err) {
        this.log('Error fetching aMule shared files:', err.message);
      }

      const amuleData = this._processAmuleData(rawDownloads, rawUploads, rawSharedFiles, categoriesForNormalizer);
      allDownloads = allDownloads.concat(amuleData.downloads);
      allShared = allShared.concat(amuleData.sharedFiles);
      allUploads = allUploads.concat(amuleData.uploads);
    }

    // Fetch all rtorrent data if connected (SINGLE fetch, reused for all)
    if (rtorrentManager && rtorrentManager.isConnected()) {
      try {
        const rawDownloads = await rtorrentManager.getDownloads();
        const rtorrentData = this._processRtorrentData(rawDownloads);

        allDownloads = allDownloads.concat(rtorrentData.downloads);
        allShared = allShared.concat(rtorrentData.downloads);
        allUploads = allUploads.concat(rtorrentData.uploads);
      } catch (err) {
        this.log('Error fetching rtorrent data:', err.message);
      }
    }

    // Build unified items from the normalized arrays
    const items = assembleUnifiedItems(allDownloads, allShared, allUploads, categoryManager);

    // Enrich all peer arrays with GeoIP and hostname data (single pass, both clients)
    this._enrichItems(items);

    // Inject move operation status into items
    this._injectMoveStatus(items);

    const result = {
      items,
      categories,
      clientDefaultPaths,
      hasPathWarnings,
      // Return filtered data for history status computation (internal use only)
      _amuleDownloads: allDownloads.filter(d => d.clientType === 'amule'),
      _amuleSharedFiles: allShared.filter(f => f.clientType === 'amule'),
      _rtorrentDownloads: allShared.filter(f => f.clientType === 'rtorrent')
    };

    // Cache the result for history API and other consumers
    this._cachedBatchData = result;
    this._cacheTimestamp = Date.now();

    return result;
  }
}

module.exports = new DataFetchService();
