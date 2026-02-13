/**
 * Download Normalizer
 * Shared utility functions for normalizing download data from different clients
 */

const { ipToString, getClientSoftwareName } = require('./networkUtils');

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Derive category from file path by matching against category paths
 * @param {string} filePath - Full file path
 * @param {Array} categories - Array of category objects with id, path, and title
 * @returns {Object} { id: number, name: string } - Category ID and name (0/'Default' if no match)
 */
function deriveCategoryFromPath(filePath, categories) {
  if (!filePath || !categories || categories.length === 0) {
    return { id: 0, name: 'Default' };
  }

  // Normalize path separators
  const normalizedFilePath = filePath.replace(/\\/g, '/');

  // Find the category with the longest matching path (most specific match)
  let bestMatch = { id: 0, name: 'Default', pathLength: 0 };

  for (const category of categories) {
    if (!category.path || category.id === 0) continue;

    const normalizedCategoryPath = category.path.replace(/\\/g, '/');
    // Ensure category path ends with / for proper prefix matching
    const categoryPathWithSlash = normalizedCategoryPath.endsWith('/')
      ? normalizedCategoryPath
      : normalizedCategoryPath + '/';

    // Check if file path starts with category path
    if (normalizedFilePath.startsWith(categoryPathWithSlash) ||
        normalizedFilePath.startsWith(normalizedCategoryPath)) {
      // Prefer longer (more specific) paths
      if (normalizedCategoryPath.length > bestMatch.pathLength) {
        bestMatch = { id: category.id, name: category.title || 'Unknown', pathLength: normalizedCategoryPath.length };
      }
    }
  }

  return { id: bestMatch.id, name: bestMatch.name };
}

/**
 * Extract domain from tracker URL (removes subdomains, keeps main domain + TLD)
 * @param {Array} trackers - Array of tracker URLs
 * @returns {string} Domain of first tracker, or empty string
 */
function extractTrackerDomain(trackers) {
  const primaryTracker = (trackers && trackers[0]) || '';
  if (!primaryTracker) return '';
  const match = primaryTracker.match(/^(?:https?|udp):\/\/([^:/]+)/i);
  if (!match) return '';

  const fullDomain = match[1];
  // Remove subdomains: keep only last two parts (domain.tld)
  // Handle special cases like .co.uk by checking common two-part TLDs
  const parts = fullDomain.split('.');
  if (parts.length <= 2) return fullDomain;

  // Common two-part TLDs (and public suffix domains like eu.org)
  const twoPartTLDs = ['co.uk', 'com.au', 'co.nz', 'co.jp', 'com.br', 'co.in', 'org.uk', 'me.uk', 'eu.org', 'de.com', 'us.com'];
  const lastTwo = parts.slice(-2).join('.');
  if (twoPartTLDs.includes(lastTwo)) {
    return parts.slice(-3).join('.');
  }
  return parts.slice(-2).join('.');
}

// ============================================================================
// AMULE NORMALIZERS
// ============================================================================

/**
 * Normalize aMule download to unified format
 * @param {Object} download - aMule download object (from amule-ec-node library)
 * @param {Array} categories - Optional array of categories for category name lookup
 * @returns {Object} Normalized download
 */
function normalizeAmuleDownload(download, categories = []) {
  // Look up category name from ID (check multiple possible field locations)
  const catId = download.category ?? download.EC_TAG_PARTFILE_CAT ?? download.raw?.EC_TAG_PARTFILE_CAT ?? 0;
  const cat = categories.find(c => c.id === catId);
  const categoryName = catId === 0 ? 'Default' : (cat?.title || 'Unknown');

  return {
    ...download,
    clientType: 'amule',
    // Canonical field names (renamed from library names)
    hash: download.fileHash,
    name: download.fileName,
    size: download.fileSize,
    downloaded: download.fileSizeDownloaded,
    category: catId,
    categoryName,
    ed2kLink: download.EC_TAG_PARTFILE_ED2K_LINK || download.raw?.EC_TAG_PARTFILE_ED2K_LINK || null,
    // Explicit pass-through of library-mapped fields used by the builder
    progress: download.progress || 0,
    speed: download.speed || 0,
    status: download.status,
    priority: download.priority ?? null,
    sourceCount: download.sourceCount || 0,
    sourceCountXfer: download.sourceCountXfer || 0,
    sourceCountA4AF: download.sourceCountA4AF || 0,
    sourceCountNotCurrent: download.sourceCountNotCurrent || 0,
    partStatus: download.partStatus || null,
    gapStatus: download.gapStatus || null,
    reqStatus: download.reqStatus || null,
    lastSeenComplete: download.lastSeenComplete || 0,
  };
}

/**
 * Normalize aMule shared file to unified format
 * Ensures consistent field names for sorting/filtering
 * @param {Object} file - aMule shared file object (from amule-ec-node library)
 * @param {Array} categories - Optional array of categories for path-based category derivation
 * @returns {Object} Normalized shared file
 */
function normalizeAmuleSharedFile(file, categories = []) {
  // Get file path - the field is named 'path' in the aMule client response (amule-ec-node)
  const filePath = file.path || '';
  const { id: category, name: categoryName } = deriveCategoryFromPath(filePath, categories);

  return {
    ...file,
    clientType: 'amule',
    // Canonical field names (renamed from library names)
    hash: file.fileHash,
    name: file.fileName,
    size: file.fileSize,
    uploadSpeed: 0,
    // Derived category from file path
    category,
    categoryName,
    // Map EC_TAG fields to canonical names
    priority: file.priority ?? file.EC_TAG_KNOWNFILE_PRIO ?? file.raw?.EC_TAG_KNOWNFILE_PRIO ?? null,
    ed2kLink: file.EC_TAG_PARTFILE_ED2K_LINK || file.raw?.EC_TAG_PARTFILE_ED2K_LINK || null,
    // Explicit pass-through of library-mapped fields used by the builder
    transferredTotal: file.transferredTotal || 0,
    transferred: file.transferred ?? null,
    acceptedCount: file.acceptedCount ?? null,
    acceptedCountTotal: file.acceptedCountTotal ?? null,
  };
}

/**
 * Normalize a raw aMule upload record (EC_TAG_CLIENT_* fields) to clean names.
 * Called before GeoIP/hostname enrichment so all upload records share
 * the same field names regardless of client.
 * @param {Object} upload - Raw aMule upload object
 * @returns {Object} Normalized upload entry
 */
function normalizeAmuleUpload(upload) {
  return {
    clientType: 'amule',
    id: upload.EC_TAG_CLIENT_HASH || '',
    fileName: upload.EC_TAG_PARTFILE_NAME || '',
    fileSize: upload.EC_TAG_PARTFILE_SIZE_FULL || 0,
    address: upload.EC_TAG_CLIENT_USER_IP_STR || ipToString(upload.EC_TAG_CLIENT_USER_IP) || '',
    port: upload.EC_TAG_CLIENT_USER_PORT || 0,
    software: getClientSoftwareName(upload),
    softwareId: upload.EC_TAG_CLIENT_SOFTWARE ?? null,
    uploadRate: upload.EC_TAG_CLIENT_UP_SPEED || 0,
    downloadRate: 0,
    uploadTotal: upload.EC_TAG_CLIENT_UPLOAD_TOTAL || 0,
    uploadSession: upload.EC_TAG_CLIENT_UPLOAD_SESSION ?? null,
    completedPercent: null,
    isEncrypted: false,
    isIncoming: false
  };
}

// ============================================================================
// RTORRENT NORMALIZERS
// ============================================================================

/**
 * Normalize rtorrent download to unified format
 * @param {Object} download - rtorrent download object
 * @returns {Object} Normalized download
 */
function normalizeRtorrentDownload(download) {
  const trackers = download.trackers || [];
  const trackerDomain = extractTrackerDomain(trackers);
  const progress = download.progress ? parseFloat((download.progress * 100).toFixed(2)) : 0;

  return {
    clientType: 'rtorrent',
    hash: download.hash.toLowerCase(),
    name: download.name,
    size: download.size,
    downloaded: download.completedBytes,
    progress,
    speed: download.downloadSpeed || 0,
    uploadSpeed: download.uploadSpeed || 0,
    statusText: download.status,

    // rtorrent-specific fields
    priority: download.priority,  // 0=off, 1=low, 2=normal, 3=high
    ratio: download.ratio,
    category: download.label || '', // Alias for consistency with qBittorrent
    label: download.label,
    directory: download.directory,
    peers: download.peers,
    isComplete: download.isComplete,
    isActive: download.isActive,
    isMultiFile: download.isMultiFile || false,
    uploadTotal: download.uploadTotal || 0,
    trackers,
    trackersDetailed: download.trackersDetailed || [],
    trackerDomain,
    peersDetailed: download.peersDetailed || [],
    message: download.message || '',

    raw: { clientType: 'rtorrent', ...download },

    // Timestamps
    creationDate: download.creationDate || null,
    startedTime: download.startedTime || null,
    finishedTime: download.finishedTime || null
  };
}

/**
 * Normalize rtorrent peer to upload entry format
 * @param {Object} peer - rtorrent peer object (from peersDetailed)
 * @param {Object} download - Parent download object (for file info)
 * @returns {Object} Normalized upload entry
 */
function normalizeRtorrentPeer(peer, download) {
  const address = peer.address || '';
  const port = peer.port || 0;
  const trackerDomain = extractTrackerDomain(download.trackers);

  return {
    clientType: 'rtorrent',
    id: `${download.hash}-${address}:${port}`,
    fileName: download.name,
    fileSize: download.size,
    address,
    port,
    software: peer.client || 'Unknown',
    softwareId: null,
    uploadRate: peer.uploadRate || 0,
    downloadRate: peer.downloadRate || 0,
    uploadTotal: peer.uploadTotal || 0,
    uploadSession: null,
    completedPercent: peer.completedPercent || 0,
    isEncrypted: peer.isEncrypted || false,
    isIncoming: peer.isIncoming || false,
    downloadHash: download.hash,
    downloadName: download.name,
    label: download.label || null,
    trackerDomain: trackerDomain || null
  };
}

/**
 * Extract active upload entries from rtorrent downloads
 * Only includes peers that are currently receiving data (uploadRate > 0)
 * @param {Array} downloads - Array of raw rtorrent downloads
 * @returns {Array} Array of upload entries
 */
function extractRtorrentUploads(downloads) {
  const uploads = [];

  for (const download of downloads) {
    const peers = download.peersDetailed || [];

    for (const peer of peers) {
      // Only include peers we're actively uploading to
      if (peer.uploadRate > 0) {
        uploads.push(normalizeRtorrentPeer(peer, download));
      }
    }
  }

  return uploads;
}

// ============================================================================
// QBITTORRENT NORMALIZERS
// ============================================================================

/**
 * Find the best tracker from qBittorrent tracker list
 * Picks the working tracker with the most peers (seeds + leeches)
 * @param {Array} trackers - Array of tracker objects from qBittorrent
 * @returns {string|null} Best tracker URL or null
 */
function findBestQBittorrentTracker(trackers) {
  if (!trackers || trackers.length === 0) return null;

  // Filter to working trackers (status 2 = working, 3 = updating)
  // and exclude DHT/PeX/LSD pseudo-trackers
  const workingTrackers = trackers.filter(t =>
    t.url &&
    !t.url.startsWith('** [') && // Exclude DHT, PeX, LSD entries
    (t.status === 2 || t.status === 3)
  );

  if (workingTrackers.length === 0) {
    // Fall back to any tracker with a valid URL
    const validTrackers = trackers.filter(t => t.url && !t.url.startsWith('** ['));
    return validTrackers[0]?.url || null;
  }

  // Sort by total peers (seeds + leeches), pick the one with most
  workingTrackers.sort((a, b) => {
    const aPeers = (a.num_seeds || 0) + (a.num_leeches || 0);
    const bPeers = (b.num_seeds || 0) + (b.num_leeches || 0);
    return bPeers - aPeers;
  });

  return workingTrackers[0]?.url || null;
}

/**
 * Determine if a qBittorrent torrent is multi-file
 * Single-file torrents have content_path ending with a file extension
 * Multi-file torrents have content_path pointing to a folder (no extension)
 * @param {Object} torrent - qBittorrent torrent object
 * @returns {boolean} True if multi-file torrent
 */
function isQBittorrentMultiFile(torrent) {
  const contentPath = torrent.content_path || '';
  const savePath = torrent.save_path || '';

  // If they're the same, it's definitely single-file
  if (contentPath === savePath) return false;

  // Check if content_path looks like a file (has common extension pattern)
  // Single-file: content_path = /downloads/movie.mkv
  // Multi-file: content_path = /downloads/TorrentFolder (no extension)
  const hasFileExtension = /\.[a-z0-9]{2,6}$/i.test(contentPath);

  return !hasFileExtension;
}

/**
 * Get error/status message for qBittorrent torrent
 * @param {Object} torrent - qBittorrent torrent object
 * @returns {string} Error message or empty string
 */
function getQBittorrentMessage(torrent) {
  const state = torrent.state || '';

  // Error states
  if (state === 'error') {
    return 'Error';
  }
  if (state === 'missingFiles') {
    return 'Missing files';
  }

  // No tracker
  if (!torrent.tracker) {
    return 'No tracker';
  }

  return '';
}

/**
 * Normalize qBittorrent torrent to unified format
 * @param {Object} torrent - qBittorrent torrent object from /api/v2/torrents/info
 * @returns {Object} Normalized download
 */
function normalizeQBittorrentDownload(torrent) {
  const progress = parseFloat(((torrent.progress || 0) * 100).toFixed(2));
  const trackers = torrent.trackersDetailed || [];

  // Find the best tracker (most peers) instead of just using the first one
  const bestTrackerUrl = findBestQBittorrentTracker(trackers);
  const trackerDomain = bestTrackerUrl ? extractTrackerDomain([bestTrackerUrl]) : '';

  // Determine multi-file status first (needed for directory resolution)
  const multiFile = isQBittorrentMultiFile(torrent);

  // Directory resolution:
  // - Multi-file: use content_path (the torrent folder, e.g., /downloads/TorrentName)
  // - Single-file: use save_path (parent directory, joined with filename later)
  const directory = multiFile
    ? (torrent.content_path || torrent.save_path)
    : (torrent.save_path || torrent.content_path);

  return {
    clientType: 'qbittorrent',
    hash: torrent.hash.toLowerCase(),
    name: torrent.name,
    size: torrent.size || torrent.total_size,
    downloaded: torrent.completed || torrent.downloaded,
    progress,
    speed: torrent.dlspeed || 0,
    uploadSpeed: torrent.upspeed || 0,
    statusText: torrent.state,

    // qBittorrent-specific fields
    ratio: torrent.ratio || 0,
    category: torrent.category || '',
    label: torrent.category || '', // Alias for compatibility with rtorrent
    directory,
    uploadTotal: torrent.uploaded || 0,
    isComplete: progress >= 100,
    isActive: ['downloading', 'uploading', 'stalledDL', 'stalledUP', 'forcedDL', 'forcedUP'].includes(torrent.state),
    isMultiFile: multiFile,
    message: getQBittorrentMessage(torrent), // Error message or tracker status

    // Peers
    peers: {
      total: (torrent.num_leechs || 0) + (torrent.num_seeds || 0),
      connected: (torrent.num_leechs || 0) + (torrent.num_seeds || 0),
      seeders: torrent.num_seeds || 0
    },
    peersDetailed: torrent.peersDetailed || [],

    // Trackers
    trackers: trackers.map(t => t.url).filter(Boolean),
    trackersDetailed: trackers,
    trackerDomain,

    // Timestamps
    creationDate: torrent.added_on ? new Date(torrent.added_on * 1000) : null,
    startedTime: torrent.added_on ? new Date(torrent.added_on * 1000) : null,
    finishedTime: torrent.completion_on > 0 ? new Date(torrent.completion_on * 1000) : null,

    // Priority (qBittorrent doesn't have the same priority system, but we can use first/last piece prio)
    priority: 2, // Normal priority

    raw: { clientType: 'qbittorrent', ...torrent }
  };
}

/**
 * Normalize qBittorrent peer to upload entry format
 * Peers are already normalized in qbittorrentManager (downloadRate, uploadRate, etc.)
 * @param {Object} peer - qBittorrent peer object (from peersDetailed, already normalized)
 * @param {Object} torrent - Parent torrent object (for file info)
 * @returns {Object} Normalized upload entry
 */
function normalizeQBittorrentPeer(peer, torrent) {
  const address = peer.address || '';
  const port = peer.port || 0;
  const trackerDomain = extractTrackerDomain(torrent.trackers || []);

  return {
    clientType: 'qbittorrent',
    id: `${torrent.hash}-${address}:${port}`,
    fileName: torrent.name,
    fileSize: torrent.size,
    address,
    port,
    software: peer.client || 'Unknown',
    softwareId: null,
    uploadRate: peer.uploadRate || 0,
    downloadRate: peer.downloadRate || 0,
    uploadTotal: peer.uploadTotal || 0,
    uploadSession: null,
    completedPercent: peer.completedPercent || 0,
    isEncrypted: peer.isEncrypted || false,
    isIncoming: peer.isIncoming || false,
    downloadHash: torrent.hash,
    downloadName: torrent.name,
    label: torrent.category || null,
    trackerDomain: trackerDomain || null
  };
}

/**
 * Extract active upload entries from qBittorrent torrents
 * Only includes peers that are currently receiving data (up_speed > 0)
 * @param {Array} torrents - Array of raw qBittorrent torrents
 * @returns {Array} Array of upload entries
 */
function extractQBittorrentUploads(torrents) {
  const uploads = [];

  for (const torrent of torrents) {
    const peers = torrent.peersDetailed || [];

    for (const peer of peers) {
      // Only include peers we're actively uploading to
      if (peer.uploadRate > 0) {
        uploads.push(normalizeQBittorrentPeer(peer, torrent));
      }
    }
  }

  return uploads;
}

module.exports = {
  normalizeAmuleDownload,
  normalizeAmuleSharedFile,
  normalizeAmuleUpload,
  normalizeRtorrentDownload,
  extractRtorrentUploads,
  normalizeQBittorrentDownload,
  extractQBittorrentUploads,
  extractTrackerDomain
};
