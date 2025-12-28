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
 * Convert aMule download to qBittorrent torrent info
 *
 * aMule download object contains EC_TAG_* fields from the protocol.
 * We map these to qBittorrent's expected torrent info structure.
 *
 * @param {object} amuleDownload - Download object from getDownloadQueue()
 * @param {string} magnetHash - Stored magnet hash mapping (optional)
 * @param {function} getCategoryById - Get category by ID (optional)
 * @returns {object} qBittorrent-compatible torrent object
 */

async function convertToQBittorrentInfo(amuleDownload, magnetHash = null, getCategoryById = null) {
    const sizeTotal = amuleDownload.EC_TAG_PARTFILE_SIZE_FULL || amuleDownload.fileSize || 0;
    const sizeCompleted = amuleDownload.EC_TAG_PARTFILE_SIZE_DONE || amuleDownload.fileSizeDownloaded || 0;
    const progress = sizeTotal > 0 ? sizeCompleted / sizeTotal : 0;
    const speed = amuleDownload.EC_TAG_PARTFILE_SPEED || amuleDownload.speed || 0;
    const fileName = amuleDownload.EC_TAG_PARTFILE_NAME || amuleDownload.fileName || 'Unknown';
    const priority = amuleDownload.EC_TAG_PARTFILE_PRIO || amuleDownload.priority || 1;
    const sourceCount = amuleDownload.EC_TAG_PARTFILE_SOURCE_COUNT || amuleDownload.sourceCount || 0;

    // Convert status code to qBittorrent-like state
    const state = (() => {
        if (progress >= 1.0) return 'uploading';
        if (speed > 0) return 'downloading';
        if (sourceCount === 0) return 'stalledDL';
        if (sourceCount > 0) return 'queuedDL';
        return 'pausedDL';
    })();

    const hash = magnetHash || amuleDownload.fileHash || amuleDownload.EC_TAG_PARTFILE_HASH || 'unknown';
    const categoryId = amuleDownload.category || amuleDownload.EC_TAG_PARTFILE_CAT || 0;
    const categoryObj = getCategoryById ? await getCategoryById(categoryId) : null;
    const categoryName = categoryObj ? categoryObj.title : '';
    const categoryPath = categoryObj ? categoryObj.path : '';

    const eta = calculateEta(sizeTotal, sizeCompleted, speed);

    return {
        added_on: Math.floor(Date.now() / 1000),
        amount_left: sizeTotal - sizeCompleted,
        auto_tmm: true,
        availability: 0,
        category: categoryName,
        comment: '',
        completed: sizeCompleted,
        completion_on: progress >= 1 ? Math.floor(Date.now() / 1000) : -1,
        content_path: `${categoryPath}/${fileName}`,
        dl_limit: 0,
        dlspeed: speed,
        download_path: categoryPath,
        downloaded: sizeCompleted,
        downloaded_session: sizeCompleted,
        eta: eta,
        f_l_piece_prio: false,
        force_start: false,
        has_metadata: true,
        hash: hash,
        inactive_seeding_time_limit: -2,
        infohash_v1: hash,
        infohash_v2: '',
        last_activity: Math.floor(Date.now() / 1000),
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
        priority: priority,
        private: false,
        progress: progress,
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
        state: state,
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
