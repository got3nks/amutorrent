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
  // Extract fields (support both EC_TAG_* and normalized names)
  const sizeTotal = download.EC_TAG_PARTFILE_SIZE_FULL || download.fileSize || 0;
  const sizeCompleted = download.EC_TAG_PARTFILE_SIZE_DONE || download.fileSizeDownloaded || 0;
  const speed = download.EC_TAG_PARTFILE_SPEED || download.speed || 0;
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
    ratio: 0,
    ratio_limit: -2,
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
    uploaded: 0,
    uploaded_session: 0,
    upspeed: 0
  };
}

module.exports = { convertToQBittorrentInfo, STATE_MAP };
