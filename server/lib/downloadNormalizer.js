/**
 * Download Normalizer
 * Shared utility functions for normalizing download data from different clients
 */

const { getClientSoftwareName, CLIENT_SOFTWARE_LABELS } = require('./networkUtils');

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Flatten [{start, end}, ...] range pairs to [s1, e1, s2, e2, ...] flat array.
 * Reduces JSON payload ~56% for gapStatus/reqStatus fields.
 * @param {Array<{start: number, end: number}>|null} ranges
 * @returns {number[]|null}
 */
function flattenRangePairs(ranges) {
  if (!ranges || !Array.isArray(ranges) || ranges.length === 0) return null;
  const flat = new Array(ranges.length * 2);
  for (let i = 0; i < ranges.length; i++) {
    flat[i * 2] = ranges[i].start;
    flat[i * 2 + 1] = ranges[i].end;
  }
  return flat;
}

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

  for (let i = 0; i < categories.length; i++) {
    const category = categories[i];
    if (!category.path || i === 0) continue; // Skip Default (index 0) and empty paths

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
        bestMatch = { id: i, name: category.title || 'Unknown', pathLength: normalizedCategoryPath.length };
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
 * @param {Function} resolveCategoryName - (catId) => category name string
 * @returns {Object} Normalized download
 */
function normalizeAmuleDownload(download, resolveCategoryName = () => 'Default') {
  // Look up category name from ID (check multiple possible field locations)
  const catId = download.category ?? download.EC_TAG_PARTFILE_CAT ?? download.raw?.EC_TAG_PARTFILE_CAT ?? 0;
  const categoryName = resolveCategoryName(catId);

  return {
    ...download,
    clientType: 'amule',
    // Canonical field names (renamed from library names)
    hash: download.fileHash,
    name: download.fileName,
    rawName: download.rawFileName,
    size: download.fileSize,
    downloaded: download.fileSizeDownloaded,
    category: catId,
    categoryName,
    ed2kLink: download.ed2kLink || download.EC_TAG_PARTFILE_ED2K_LINK || download.raw?.EC_TAG_PARTFILE_ED2K_LINK || null,
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
    gapStatus: flattenRangePairs(download.gapStatus),
    reqStatus: flattenRangePairs(download.reqStatus),
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
    rawName: file.rawFileName,
    size: file.fileSize,
    uploadSpeed: 0,
    // Derived category from file path
    category,
    categoryName,
    // Map EC_TAG fields to canonical names
    priority: file.priority ?? file.EC_TAG_KNOWNFILE_PRIO ?? file.raw?.EC_TAG_KNOWNFILE_PRIO ?? null,
    ed2kLink: file.ed2kLink || file.EC_TAG_PARTFILE_ED2K_LINK || file.raw?.EC_TAG_PARTFILE_ED2K_LINK || null,
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
function _resolveClientSoftware(client) {
  const softwareId = client.software ?? null;
  const baseName = (softwareId !== null && CLIENT_SOFTWARE_LABELS[softwareId]) || 'Unknown';
  const version = client.softwareVersion;
  const software = version && version !== 'Unknown' ? `${baseName} ${version}` : baseName;
  return { software, softwareId };
}

function normalizeAmuleUpload(client) {
  // Accepts parsed client objects from getUpdate().clients
  const { software, softwareId } = _resolveClientSoftware(client);

  return {
    role: 'upload',
    clientType: 'amule',
    id: client.userHash || '',
    userName: client.userName || '',
    fileName: client.transferFileName || '',
    fileSize: 0,
    address: client.ip || '',
    port: client.port || 0,
    software,
    softwareId,
    uploadRate: client.upSpeed || 0,
    downloadRate: client.downSpeed || 0,
    uploadTotal: client.uploadTotal || 0,
    uploadSession: client.uploadSession ?? null,
    uploadState: client.uploadState,
    sourceFrom: client.sourceFrom,
    completedPercent: null,
    isEncrypted: client.obfuscation > 0,
    isIncoming: false
  };
}

/**
 * Normalize an aMule download source (peer we download from).
 * @param {Object} client - Parsed client object from getUpdate().clients
 * @returns {Object} Normalized download source entry
 */
function normalizeAmuleDownloadSource(client) {
  const { software, softwareId } = _resolveClientSoftware(client);

  return {
    role: 'download',
    clientType: 'amule',
    id: client.userHash || '',
    userName: client.userName || '',
    fileName: client.remoteFilename || '',
    address: client.ip || '',
    port: client.port || 0,
    software,
    softwareId,
    downloadRate: client.downSpeed || 0,
    uploadRate: client.upSpeed || 0,
    downloadTotal: client.downloadTotal || 0,
    downloadState: client.downloadState,
    sourceFrom: client.sourceFrom,
    remoteQueueRank: client.remoteQueueRank ?? null,
    isEncrypted: client.obfuscation > 0,
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
    peerCounts: download.peers,
    isComplete: download.isComplete,
    isActive: download.isActive,
    isMultiFile: download.isMultiFile || false,
    uploadTotal: download.uploadTotal || 0,
    trackers,
    trackersDetailed: download.trackersDetailed || [],
    trackerDomain,
    peersDetailed: (download.peersDetailed || []).map(p => ({ ...p, role: 'peer' })),
    message: download.message || '',

    raw: { clientType: 'rtorrent', ...download },

    // Timestamps
    creationDate: download.creationDate || null,
    startedTime: download.startedTime || null,
    finishedTime: download.finishedTime || null
  };
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
    peerCounts: {
      total: (torrent.num_leechs || 0) + (torrent.num_seeds || 0),
      connected: (torrent.num_leechs || 0) + (torrent.num_seeds || 0),
      seeders: torrent.num_seeds || 0
    },
    peersDetailed: (torrent.peersDetailed || []).map(p => ({ ...p, role: 'peer' })),

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


// ============================================================================
// DELUGE NORMALIZERS
// ============================================================================

/**
 * Extract tracker URLs from Deluge tracker list
 * @param {Array} trackers - Array of tracker objects from Deluge (each has { url, tier })
 * @returns {Array<string>} Tracker URLs
 */
function extractDelugeTrackerUrls(trackers) {
  if (!Array.isArray(trackers)) return [];
  return trackers
    .map(t => t.url || t)
    .filter(url => typeof url === 'string' && url.length > 0);
}

/**
 * Normalize Deluge torrent to unified format
 * @param {string} hash - Torrent hash
 * @param {Object} torrent - Deluge torrent status object (from web.update_ui)
 * @returns {Object} Normalized download
 */
function normalizeDelugeDownload(hash, torrent) {
  const progress = parseFloat((torrent.progress || 0).toFixed(2));
  const trackerUrls = extractDelugeTrackerUrls(torrent.trackers);
  const trackerDomain = torrent.tracker_host || extractTrackerDomain(trackerUrls);
  const isMultiFile = (torrent.num_files || 0) > 1;

  return {
    clientType: 'deluge',
    hash: hash.toLowerCase(),
    name: torrent.name || '',
    size: torrent.total_size || torrent.total_wanted || 0,
    downloaded: torrent.total_done || 0,
    progress,
    speed: torrent.download_payload_rate || 0,
    uploadSpeed: torrent.upload_payload_rate || 0,
    statusText: torrent.state || 'Unknown',

    // BitTorrent fields
    ratio: torrent.ratio || 0,
    category: torrent.label || '',
    label: torrent.label || '',
    directory: torrent.save_path || '',
    uploadTotal: torrent.total_uploaded || 0,
    isComplete: progress >= 100,
    isActive: ['Downloading', 'Seeding'].includes(torrent.state),
    isMultiFile,
    message: torrent.state === 'Error' ? (torrent.message || 'Error') : '',

    // Peers
    peerCounts: {
      total: (torrent.num_peers || 0) + (torrent.num_seeds || 0),
      connected: (torrent.num_peers || 0) + (torrent.num_seeds || 0),
      seeders: torrent.num_seeds || 0
    },
    peersDetailed: (torrent.peersDetailed || []).map(p => ({ ...p, role: 'peer' })),

    // Trackers
    trackers: trackerUrls,
    trackersDetailed: torrent.trackersDetailed || [],
    trackerDomain,

    // Timestamps
    creationDate: torrent.time_added ? new Date(torrent.time_added * 1000) : null,
    startedTime: torrent.time_added ? new Date(torrent.time_added * 1000) : null,
    finishedTime: torrent.completed_time > 0 ? new Date(torrent.completed_time * 1000) : null,

    // Priority
    priority: 2, // Normal

    raw: { clientType: 'deluge', hash, ...torrent }
  };
}


// ============================================================================
// TRANSMISSION NORMALIZERS
// ============================================================================

/**
 * Transmission torrent status codes → human-readable strings
 */
const TRANSMISSION_STATUS = {
  0: 'Paused',
  1: 'Check Pending',
  2: 'Checking',
  3: 'Download Pending',
  4: 'Downloading',
  5: 'Seed Pending',
  6: 'Seeding'
};

/**
 * Map Transmission bandwidthPriority to unified priority
 * Transmission: -1=Low, 0=Normal, 1=High
 * Unified: 1=Low, 2=Normal, 3=High
 */
function mapTransmissionPriority(bandwidthPriority) {
  if (bandwidthPriority === -1) return 1;
  if (bandwidthPriority === 1) return 3;
  return 2; // 0 or anything else → Normal
}

/**
 * Normalize Transmission torrent to unified format
 * @param {Object} torrent - Transmission torrent object (from torrent-get)
 * @returns {Object} Normalized download
 */
function normalizeTransmissionDownload(torrent) {
  const hash = (torrent.hashString || '').toLowerCase();
  const progress = parseFloat(((torrent.percentDone || 0) * 100).toFixed(2));
  const statusText = TRANSMISSION_STATUS[torrent.status] || 'Unknown';
  const rawTrackers = torrent.trackers || [];
  const trackerUrls = rawTrackers.map(t => typeof t === 'string' ? t : t.announce).filter(Boolean);
  const trackerDomain = extractTrackerDomain(trackerUrls);
  const files = torrent.files || [];
  const isMultiFile = files.length > 1;
  const label = (torrent.labels && torrent.labels[0]) || '';

  return {
    clientType: 'transmission',
    hash,
    name: torrent.name || '',
    size: torrent.totalSize || 0,
    downloaded: torrent.downloadedEver || 0,
    progress,
    speed: torrent.rateDownload || 0,
    uploadSpeed: torrent.rateUpload || 0,
    statusText,

    // BitTorrent fields
    ratio: torrent.uploadRatio >= 0 ? torrent.uploadRatio : 0,
    category: label,
    label,
    directory: torrent.downloadDir || '',
    uploadTotal: torrent.uploadedEver || 0,
    isComplete: torrent.percentDone >= 1.0,
    isActive: torrent.status === 4 || torrent.status === 6,
    isMultiFile,
    message: torrent.error > 0 ? (torrent.errorString || 'Error') : '',

    // Peers
    peerCounts: {
      total: torrent.peersConnected || 0,
      connected: torrent.peersConnected || 0,
      seeders: 0
    },
    peersDetailed: (torrent.peersDetailed || []).map(p => ({ ...p, role: 'peer' })),

    // Trackers
    trackers: trackerUrls,
    trackersDetailed: torrent.trackersDetailed || [],
    trackerDomain,

    // Timestamps
    creationDate: torrent.addedDate > 0 ? new Date(torrent.addedDate * 1000) : null,
    startedTime: torrent.startDate > 0 ? new Date(torrent.startDate * 1000) : null,
    finishedTime: torrent.doneDate > 0 ? new Date(torrent.doneDate * 1000) : null,

    // Priority
    priority: mapTransmissionPriority(torrent.bandwidthPriority),

    raw: { clientType: 'transmission', ...torrent }
  };
}

module.exports = {
  normalizeAmuleDownload,
  normalizeAmuleSharedFile,
  normalizeAmuleUpload,
  normalizeAmuleDownloadSource,
  normalizeRtorrentDownload,
  normalizeQBittorrentDownload,
  normalizeDelugeDownload,
  normalizeTransmissionDownload,
  extractTrackerDomain
};
