/**
 * Unified Item Builder
 *
 * Assembles a single unified items array from the separate downloads, shared,
 * and uploads arrays produced by the normalization pipeline.
 *
 * Each item represents a single file/torrent identified by its hash. View
 * membership (downloads, shared, uploads) is expressed as boolean flags and
 * nested data rather than separate arrays.
 */

const clientMeta = require('./clientMeta');
const { itemKey } = require('./itemKey');

// ============================================================================
// STATUS MAPPING
// ============================================================================

/**
 * Resolve the unified status string from a normalized item
 */
function resolveStatus(item) {
  const clientType = item.clientType;
  const field = clientMeta.get(clientType).statusField;
  const map = clientMeta.getStatusMap(clientType);
  return map[item[field]] || 'active';
}

// ============================================================================
// MAGNET LINK GENERATION (server-side, mirrors frontend's formatters.js)
// ============================================================================

function generateMagnetLink(item) {
  const hash = item.hash;
  if (!hash) return null;
  const name = item.name;
  let link = `magnet:?xt=urn:btih:${hash}`;
  if (name) link += `&dn=${encodeURIComponent(name)}`;
  const trackers = item.trackers || [];
  for (const tracker of trackers) {
    link += `&tr=${encodeURIComponent(tracker)}`;
  }
  return link;
}

// ============================================================================
// BASE ITEM FACTORY
// ============================================================================

// Fields common to all clients
const COMMON_DEFAULTS = {
  downloading: false,
  shared: false,
  complete: false,
  seeding: false,
  size: 0,
  sizeDownloaded: 0,
  progress: 0,
  downloadSpeed: 0,
  uploadSpeed: 0,
  status: 'active',
  category: 'Default',
  categoryId: null,
  sources: { total: 0, connected: 0, seeders: 0, a4af: 0, notCurrent: 0 },
  peers: [],
  uploadTotal: 0,
  ratio: 0,
  eta: null,  // ETA in seconds (null = complete or no speed, calculated server-side)
  instanceId: null,
  raw: {}
};

/**
 * Create a blank unified item with all fields initialized to defaults.
 * Only includes fields relevant to the given client.
 */
function createBaseItem(hash, client) {
  const defaults = clientMeta.getDefaults(client);
  return {
    hash,
    name: '',
    client,
    networkType: clientMeta.getNetworkType(client),
    ...COMMON_DEFAULTS,
    // Deep-copy mutable common fields to avoid shared-reference bugs
    sources: { ...COMMON_DEFAULTS.sources },
    peers: [],
    raw: {},
    ...defaults,
    // Deep-copy mutable array fields from defaults
    ...(defaults.trackers ? { trackers: [], trackersDetailed: [] } : {})
  };
}

// ============================================================================
// MERGE FUNCTIONS — apply client data onto a unified item
// ============================================================================

/**
 * Apply download data (from the normalized downloads array) onto a unified item
 */
function applyDownloadData(item, download, categoryManager = null) {
  item.name = download.name || item.name;
  item.rawName = download.rawName || item.rawName;
  item.size = download.size || item.size;
  item.sizeDownloaded = download.downloaded || item.sizeDownloaded;
  item.progress = download.progress ?? (item.size > 0 ? Math.round((item.sizeDownloaded / item.size) * 100) : 0);
  item.downloadSpeed = download.speed || item.downloadSpeed;
  item.downloading = item.progress < 100;
  item.complete = item.progress >= 100;
  item.status = resolveStatus(download);

  // ETA calculation (in seconds)
  // null = complete or no speed (stalled)
  if (item.complete) {
    item.eta = null;
  } else if (item.downloadSpeed > 0) {
    const remainingBytes = item.size - item.sizeDownloaded;
    item.eta = remainingBytes > 0 ? remainingBytes / item.downloadSpeed : null;
  } else {
    item.eta = null;
  }

  if (clientMeta.isEd2k(download.clientType)) {
    // Organization
    item.categoryId = download.category ?? item.categoryId;
    item.category = download.categoryName || item.category;

    // Sources
    item.sources = {
      total: download.sourceCount || 0,
      connected: download.sourceCountXfer || 0,
      seeders: 0,
      a4af: download.sourceCountA4AF || 0,
      notCurrent: download.sourceCountNotCurrent || 0
    };

    // Priority
    item.downloadPriority = download.priority ?? item.downloadPriority;

    // Visualization
    item.partStatus = download.partStatus || item.partStatus;
    item.gapStatus = download.gapStatus || item.gapStatus;
    item.reqStatus = download.reqStatus || item.reqStatus;
    item.lastSeenComplete = download.lastSeenComplete || item.lastSeenComplete;

    // Shared flag — download is also being shared (seeding while downloading)
    if (download.isShared) {
      item.shared = true;
    }

    // aMule partfiles don't carry a directory — derive it from the category's
    // configured path so the Download Path column has something to show for
    // in-progress downloads. The Default category typically has no explicit
    // path, so fall back to the client's reported default download directory.
    // Shared/completed files override this later via applySharedData, which
    // sets item.filePath from the real on-disk location.
    if (categoryManager) {
      const cat = item.category ? categoryManager.getByName(item.category) : null;
      const derived = cat?.path
        || (item.instanceId && categoryManager.getClientDefaultPath?.(item.instanceId))
        || null;
      if (derived) {
        item.directory = derived;
      }
    }

    // Links
    item.ed2kLink = download.ed2kLink || item.ed2kLink;
  } else if (clientMeta.isBittorrent(download.clientType)) {
    // BitTorrent clients (rtorrent, qbittorrent) — all items are always shared/seeding
    item.shared = true;

    // Determine seeding status from clientMeta
    const seedingStatuses = clientMeta.get(download.clientType).seedingStatuses;
    item.seeding = seedingStatuses ? seedingStatuses.includes(download.statusText) : false;

    // Map label/category to unified category name (empty/none -> Default)
    const label = download.label || download.category;
    item.category = (!label || label === '(none)') ? 'Default' : label;
    item.uploadSpeed = download.uploadSpeed || item.uploadSpeed;

    // Sources
    const peerCounts = download.peerCounts || {};
    item.sources = {
      total: peerCounts.total || 0,
      connected: peerCounts.connected || 0,
      seeders: peerCounts.seeders || 0,
      a4af: 0
    };

    // Tracker
    item.tracker = download.trackerDomain || item.tracker;
    item.trackers = download.trackers || item.trackers;
    item.trackersDetailed = download.trackersDetailed || item.trackersDetailed;
    item.message = download.message || item.message;

    // Transfer stats
    item.uploadTotal = download.uploadTotal || item.uploadTotal;
    item.ratio = download.ratio || item.ratio;

    // Client-specific fields
    item.downloadPriority = download.priority ?? item.downloadPriority;
    item.directory = download.directory || item.directory;
    item.multiFile = download.isMultiFile || item.multiFile;

    // Copy BitTorrent peers from peersDetailed (role-stamped in normalizer)
    if (download.peersDetailed) {
      for (const peer of download.peersDetailed) {
        item.peers.push(buildPeer(peer));
      }
    }

    // Links
    item.magnetLink = generateMagnetLink(download);

    // Timestamps - use startedTime (when torrent was first started)
    // Treat 0 as null (0 = epoch time 1970, not a real timestamp)
    item.addedAt = download.startedTime && download.startedTime > 0 ? download.startedTime : null;
  }

  // Copy embedded peers array (aMule download sources, or any client that embeds peers)
  if (Array.isArray(download.peers)) {
    for (const peer of download.peers) {
      item.peers.push(buildPeer(peer));
    }
  }

  // Raw data — preserve the full original object for detail modals
  item.raw = download.raw || download;
}

/**
 * Apply shared file data (from the normalized sharedFiles array) onto a unified item
 * Merges — does not overwrite download data that may already be present
 */
function applySharedData(item, sharedFile) {
  item.shared = true;
  item.name = item.name || sharedFile.name || '';
  item.rawName = item.rawName || sharedFile.rawName;
  item.size = item.size || sharedFile.size || 0;

  // Upload speed from aggregated aMule uploads or rtorrent stats
  if (sharedFile.uploadSpeed > 0) {
    item.uploadSpeed = sharedFile.uploadSpeed;
  }

  if (clientMeta.isEd2k(sharedFile.clientType)) {
    // aMule shared files are completed downloads - mark them as such
    // (unless already set by applyDownloadData for files still downloading)
    if (!item.downloading) {
      item.progress = 100;
      item.complete = true;
      item.seeding = true;
      item.sizeDownloaded = item.size;
    }
    // Organization — shared file may have path-derived category
    // Only update category if item doesn't already have one (from download data)
    // or if shared file has a non-default category (path-based match)
    if (sharedFile.category !== undefined && (item.categoryId == null || sharedFile.category > 0)) {
      item.categoryId = sharedFile.category;
      item.category = sharedFile.categoryName || item.category;
    }

    // Transfer stats (from aMule shared file metadata)
    item.uploadTotal = sharedFile.transferredTotal || item.uploadTotal;
    item.uploadSession = sharedFile.transferred ?? item.uploadSession;
    item.requestsAccepted = sharedFile.acceptedCount ?? item.requestsAccepted;
    item.requestsAcceptedTotal = sharedFile.acceptedCountTotal ?? item.requestsAcceptedTotal;

    // Ratio (aMule doesn't provide one — calculate from uploadTotal / size)
    if (item.size > 0 && item.uploadTotal > 0) {
      item.ratio = item.uploadTotal / item.size;
    }

    // Upload priority
    item.uploadPriority = sharedFile.priority ?? item.uploadPriority;

    // User-supplied metadata (aMule stores a comment + rating per shared file)
    item.comment = sharedFile.comment ?? item.comment ?? '';
    item.rating = sharedFile.rating ?? item.rating ?? 0;

    // Links
    item.ed2kLink = sharedFile.ed2kLink || item.ed2kLink;

    // Store file path for aMule shared files (needed for delete permission checks)
    if (sharedFile.path) {
      item.filePath = sharedFile.path;
    }

    // Raw data: merge shared file's EC_TAG fields into item.raw
    // For files that are both downloading and shared, this adds KNOWNFILE fields
    // (upload stats, upload priority) alongside the existing PARTFILE fields
    // (download stats, download priority), so the info modal has the complete picture.
    if (Object.keys(item.raw).length === 0) {
      // No download raw data — use shared file as base
      item.raw = sharedFile;
    } else {
      // Download raw data exists — merge in missing EC_TAG keys from shared
      // (aMule normalizer spreads raw EC_TAG fields onto the normalized object)
      for (const [key, value] of Object.entries(sharedFile)) {
        if (key.startsWith('EC_TAG_') && !(key in item.raw)) {
          item.raw[key] = value;
        }
      }
    }
  }

  // Copy embedded peers from shared files (aMule upload peers)
  if (Array.isArray(sharedFile.peers)) {
    for (const peer of sharedFile.peers) {
      item.peers.push(buildPeer(peer));
    }
  }
  // For rtorrent, shared data was already applied via applyDownloadData
  // (rtorrent items are always shared — the downloads array IS the shared array)
}

/**
 * Build a unified peer entry from any normalized peer record.
 * Handles all clients and roles (peer/upload/download).
 */
function buildPeer(entry) {
  return {
    role: entry.role || 'peer',
    id: entry.id || `${entry.address || ''}:${entry.port || 0}`,
    userName: entry.userName || '',
    fileName: entry.fileName || '',
    address: entry.address || '',
    port: entry.port || 0,
    software: entry.software || entry.client || 'Unknown',
    softwareId: entry.softwareId ?? null,
    downloadRate: entry.downloadRate || 0,
    uploadRate: entry.uploadRate || 0,
    downloadTotal: entry.downloadTotal || 0,
    uploadTotal: entry.uploadTotal || 0,
    uploadSession: entry.uploadSession ?? null,
    downloadState: entry.downloadState,
    uploadState: entry.uploadState,
    sourceFrom: entry.sourceFrom,
    remoteQueueRank: entry.remoteQueueRank ?? null,
    completedPercent: entry.completedPercent ?? null,
    flags: entry.flags || '',
    isEncrypted: entry.isEncrypted || false,
    isIncoming: entry.isIncoming || false,
    peerDownloadRate: entry.peerDownloadRate ?? null,
    peerDownloadTotal: entry.peerDownloadTotal ?? null,
    geoData: entry.geoData || null,
    hostname: entry.hostname || null
  };
}

// ============================================================================
// MAIN ASSEMBLY FUNCTION
// ============================================================================

/**
 * Assemble unified items from the separate data arrays.
 *
 * Takes the already-normalized downloads and sharedFiles arrays
 * (as produced by the existing DataFetchService pipeline) and merges them
 * into a single items array keyed by file hash.
 *
 * Peers are embedded directly in download/shared file objects by each manager,
 * and copied into item.peers during applyDownloadData/applySharedData.
 *
 * @param {Array} downloads        - Normalized downloads (all clients, with embedded .peers/.peersDetailed)
 * @param {Array} sharedFiles      - Normalized shared files (all clients, with embedded .peers for aMule)
 * @param {Object} categoryManager - Optional CategoryManager instance for name resolution
 * @returns {Array} Array of unified item objects
 */
function assembleUnifiedItems(downloads, sharedFiles, categoryManager = null) {
  const itemsByHash = new Map();

  // Helper: get or create an item by compound key (instanceId:hash)
  const getOrCreate = (hash, client, instanceId) => {
    if (!hash) return null;
    const key = itemKey(instanceId, hash);
    if (!itemsByHash.has(key)) {
      const item = createBaseItem(hash.toLowerCase(), client);
      item.instanceId = instanceId || null;
      itemsByHash.set(key, item);
    }
    return itemsByHash.get(key);
  };

  // ── Step 1: Process downloads (peers copied in applyDownloadData) ──────
  for (const download of (downloads || [])) {
    const item = getOrCreate(download.hash, download.clientType, download.instanceId);
    if (item) applyDownloadData(item, download, categoryManager);
  }

  // ── Step 2: Process shared files (peers copied in applySharedData) ─────
  for (const shared of (sharedFiles || [])) {
    const item = getOrCreate(shared.hash, shared.clientType, shared.instanceId);
    if (item) applySharedData(item, shared);
  }

  return Array.from(itemsByHash.values());
}

module.exports = { assembleUnifiedItems };
