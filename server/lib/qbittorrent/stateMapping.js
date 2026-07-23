/**
 * State Mapping - Convert aMule download states to qBittorrent states
 *
 * aMule uses EC protocol status codes, qBittorrent uses string states.
 * This module maps between the two for Sonarr/Radarr compatibility.
 *
 * qBittorrent States:
 * - allocating, downloading, metaDL, pausedDL, queuedDL, stalledDL,
 *   checkingDL, forcedDL, uploading, pausedUP, queuedUP, stalledUP,
 *   checkingUP, forcedUP, queuedForChecking, checkingResumeData, moving, unknown
 */

/**
 * Map aMule status codes to qBittorrent states
 * Note: These are approximations based on aMule EC protocol
 */
const STATE_MAP = {
  0: 'pausedDL',       // paused
  1: 'queuedDL',       // waiting/queued
  2: 'downloading',    // downloading
  3: 'stalledUP',      // completed but hash-checking
  4: 'uploading',      // seeding
  5: 'error',          // corrupted/error
  6: 'stalledDL',      // stalled download
  7: 'metaDL',         // metadata fetching
  8: 'checkingDL',     // checking
  default: 'downloading'
};

/**
 * Calculate ETA in seconds
 * @param {number} total - Total size
 * @param {number} completed - Completed size
 * @param {number} speed - Current download speed
 * @returns {number} ETA in seconds (capped at 8640000 for >100 days)
 */
function calculateEta(total, completed, speed) {
  if (speed === 0 || total <= completed) {
    return 8640000; // ~100 days (qBittorrent uses this for "infinite")
  }
  return Math.floor((total - completed) / speed);
}

/**
 * Determine qBittorrent state from download metrics.
 *
 * Once a download reaches 100%, return `pausedUP` rather than `uploading`.
 * Sonarr/Radarr trigger their post-import cleanup loop on `pausedUP` (or
 * historically `completedUP`) — they treat `uploading` as "still seeding,
 * don't touch", which is why aMule downloads were lingering forever and
 * filling disk in the *arr workflow. aMule doesn't have a user-controlled
 * "stop seeding" state anyway: completed files are simply available in the
 * shared list for peers that ask, with no per-file lifecycle. Reporting
 * `pausedUP` at 100% maps that reality onto the qBit-compat semantics
 * Sonarr/Radarr expect, so the import-then-cleanup loop fires.
 */
function determineState(progress, speed, sourceCount) {
  if (progress >= 1.0) return 'pausedUP';
  if (speed > 0) return 'downloading';
  if (sourceCount === 0) return 'stalledDL';
  if (sourceCount > 0) return 'queuedDL';
  return 'pausedDL';
}

/**
 * Convert aMule download to qBittorrent torrent info
 *
 * Expects an enriched download object with:
 * - Standard aMule EC_TAG_* fields OR normalized fields (fileName, fileHash, etc.)
 *
 * @param {object} download - Enriched download object
 * @returns {object} qBittorrent-compatible torrent object
 */
function convertToQBittorrentInfo(download) {
  // Extract fields (support both EC_TAG_* and normalized names).
  // Number()-coerce numeric fields at the boundary: EC_TAG_* values from
  // amule-ec-node may arrive as BigInt-safe strings, and any client-side
  // stringification upstream would leak into the JSON output otherwise.
  // Real qBittorrent returns numbers here; strict consumers (Medusa, #72)
  // crash on strings.
  const sizeTotal = Number(download.EC_TAG_PARTFILE_SIZE_FULL || download.fileSize || 0) || 0;
  const sizeCompleted = Number(download.EC_TAG_PARTFILE_SIZE_DONE || download.fileSizeDownloaded || 0) || 0;
  const speed = Number(download.EC_TAG_PARTFILE_SPEED || download.speed || 0) || 0;
  const uploadTotal = Number(download.uploadTotal || 0) || 0;
  const uploadSpeed = Number(download.uploadSpeed || 0) || 0;
  const ratio = Number(download.ratio || 0) || 0;
  const fileName = download.EC_TAG_PARTFILE_NAME || download.fileName || 'Unknown';
  const priority = download.EC_TAG_PARTFILE_PRIO || download.priority || 1;
  const sourceCount = download.EC_TAG_PARTFILE_SOURCE_COUNT || download.sourceCount || 0;

  // Calculated values
  const progress = sizeTotal > 0 ? sizeCompleted / sizeTotal : 0;
  const state = determineState(progress, speed, sourceCount);
  const eta = calculateEta(sizeTotal, sizeCompleted, speed);

  // Use enriched fields or fall back to raw data
  const hash = download.magnetHash || download.fileHash || download.EC_TAG_PARTFILE_HASH || 'unknown';
  const categoryName = download.categoryName || '';
  const categoryPath = download.categoryPath || '';

  const now = Math.floor(Date.now() / 1000);

  return {
    added_on: now,
    amount_left: sizeTotal - sizeCompleted,
    auto_tmm: true,
    availability: 0,
    category: categoryName,
    comment: '',
    completed: sizeCompleted,
    completion_on: progress >= 1 ? now : -1,
    content_path: categoryPath ? `${categoryPath}/${fileName}` : fileName,
    dl_limit: 0,
    dlspeed: speed,
    download_path: categoryPath,
    downloaded: sizeCompleted,
    downloaded_session: sizeCompleted,
    eta,
    f_l_piece_prio: false,
    force_start: false,
    has_metadata: true,
    hash,
    inactive_seeding_time_limit: -2,
    infohash_v1: hash,
    infohash_v2: '',
    last_activity: now,
    magnet_uri: '',
    max_inactive_seeding_time: -1,
    max_ratio: -1,
    max_seeding_time: -1,
    name: fileName,
    num_complete: sourceCount,
    num_incomplete: 0,
    num_leechs: 0,
    num_seeds: sourceCount,
    popularity: 0,
    priority,
    private: false,
    progress,
    ratio,
    // ratio_limit: 0 ⇒ Radarr's HasReachedSeedLimit always passes, unblocking *arr cleanup at pausedUP. aMule has no per-file seed goal anyway.
    ratio_limit: 0,
    reannounce: 0,
    root_path: '',
    save_path: categoryPath,
    seeding_time: 0,
    seeding_time_limit: -2,
    seen_complete: -1,
    seq_dl: false,
    size: sizeTotal,
    state,
    super_seeding: false,
    tags: '',
    time_active: 0,
    total_size: sizeTotal,
    tracker: '',
    trackers_count: 0,
    up_limit: 0,
    uploaded: uploadTotal,
    uploaded_session: uploadTotal,
    upspeed: uploadSpeed
  };
}

/**
 * Convert qBittorrent torrent info to generic properties format.
 * Used by GET /api/v2/torrents/properties for LazyLibrarian and other clients
 * that verify adds via properties rather than torrents/info.
 *
 * @param {object} info - Output of convertToQBittorrentInfo()
 * @returns {object} qBittorrent properties response
 */
function convertToQBittorrentProperties(info) {
  return {
    save_path: info.save_path || '',
    creation_date: info.added_on || -1,
    piece_size: -1,
    comment: info.comment || '',
    total_wasted: 0,
    total_uploaded: info.uploaded || 0,
    total_uploaded_session: info.uploaded_session || 0,
    total_downloaded: info.downloaded || 0,
    total_downloaded_session: info.downloaded_session || 0,
    up_limit: info.up_limit ?? -1,
    dl_limit: info.dl_limit ?? -1,
    time_elapsed: info.time_active || 0,
    seeding_time: info.seeding_time || 0,
    nb_connections: -1,
    nb_connections_limit: -1,
    share_ratio: info.ratio || 0,
    addition_date: info.added_on || -1,
    completion_date: info.completion_on > 0 ? info.completion_on : -1,
    created_by: '',
    dl_speed_avg: info.dlspeed || 0,
    dl_speed: info.dlspeed || 0,
    eta: info.eta ?? 8640000,
    last_seen: info.seen_complete > 0 ? info.seen_complete : -1,
    peers: info.num_leechs || 0,
    peers_total: info.num_incomplete || 0,
    pieces_have: -1,
    pieces_num: -1,
    reannounce: info.reannounce || 0,
    seeds: info.num_seeds || 0,
    seeds_total: info.num_complete || 0,
    total_size: info.total_size || info.size || 0,
    up_speed_avg: info.upspeed || 0,
    up_speed: info.upspeed || 0,
    isPrivate: !!info.private
  };
}

/**
 * Convert qBittorrent torrent info to per-file list format.
 * ED2K downloads are single-file; index 0 represents the whole transfer.
 *
 * @param {object} info - Output of convertToQBittorrentInfo()
 * @returns {Array<object>} qBittorrent torrents/files response
 */
function convertToQBittorrentFiles(info) {
  const progress = info.progress ?? 0;
  const fileName = info.name || 'Unknown';
  const baseName = fileName.split(/[/\\]/).pop() || fileName;

  return [{
    index: 0,
    name: baseName,
    size: info.size || info.total_size || 0,
    progress,
    priority: info.priority ?? 1,
    is_seed: progress >= 1.0,
    piece_range: [0, 0],
    availability: info.availability ?? 0
  }];
}

module.exports = {
  convertToQBittorrentInfo,
  convertToQBittorrentProperties,
  convertToQBittorrentFiles,
  STATE_MAP
};
