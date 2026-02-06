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
  const progress = download.progress ? Math.round(download.progress * 100) : 0;

  return {
    clientType: 'rtorrent',
    hash: download.hash,
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
    startedTime: download.startedTime || null
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

module.exports = {
  normalizeAmuleDownload,
  normalizeAmuleSharedFile,
  normalizeAmuleUpload,
  normalizeRtorrentDownload,
  extractRtorrentUploads,
  extractTrackerDomain
};
