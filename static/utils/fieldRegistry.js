/**
 * Field Registry — Declarative metadata for field formatting and categorization
 *
 * All per-client field metadata lives here as plain data structures.
 * Adding a new client requires only adding entries — no branching logic.
 */

// ─── Field Labels ────────────────────────────────────────────────────────────
// Flat map of raw key → human label. Key names are unique across clients.

export const FIELD_LABELS = {
  // rtorrent fields (camelCase)
  'clientType': 'Client',
  'hash': 'Info Hash',
  'name': 'Name',
  'size': 'Size',
  'completedBytes': 'Downloaded',
  'progress': 'Progress',
  'downloadSpeed': 'Download Speed',
  'uploadSpeed': 'Upload Speed',
  'downloadTotal': 'Total Downloaded',
  'uploadTotal': 'Total Uploaded',
  'status': 'Status',
  'state': 'State',
  'isActive': 'Active',
  'isComplete': 'Complete',
  'isOpen': 'Open',
  'isHashing': 'Hashing',
  'ratio': 'Ratio',
  'label': 'Label',
  'directory': 'Directory',
  'basePath': 'Base Path',
  'addedTime': 'Added',
  'completedTime': 'Completed',
  'seedingTime': 'Seeding Time',
  'peers': 'Connected Peers',
  'peersTotal': 'Total Peers',
  'seeds': 'Connected Seeds',
  'seedsTotal': 'Total Seeds',
  'chunkSize': 'Chunk Size',
  'chunksCompleted': 'Chunks Completed',
  'chunksTotal': 'Total Chunks',
  'priority': 'Priority',
  'isPrivate': 'Private Torrent',
  'isMultiFile': 'Multi-File',
  'creationDate': 'Creation Date',
  'startedTime': 'Started',
  'finishedTime': 'Finished',
  // qBittorrent fields (snake_case)
  'added_on': 'Added',
  'amount_left': 'Remaining',
  'auto_tmm': 'Auto Torrent Management',
  'availability': 'Availability',
  'category': 'Category',
  'comment': 'Comment',
  'completed': 'Downloaded',
  'completion_on': 'Completed',
  'content_path': 'Content Path',
  'dl_limit': 'Download Limit',
  'dlspeed': 'Download Speed',
  'download_path': 'Download Path',
  'downloaded': 'Downloaded (Raw)',
  'downloaded_session': 'Downloaded (Session)',
  'eta': 'ETA',
  'f_l_piece_prio': 'First/Last Piece Priority',
  'force_start': 'Force Start',
  'has_metadata': 'Has Metadata',
  'infohash_v1': 'Info Hash (v1)',
  'infohash_v2': 'Info Hash (v2)',
  'inactive_seeding_time_limit': 'Inactive Seeding Limit',
  'last_activity': 'Last Activity',
  'magnet_uri': 'Magnet URI',
  'max_inactive_seeding_time': 'Max Inactive Seeding',
  'max_ratio': 'Max Ratio',
  'max_seeding_time': 'Max Seeding Time',
  'num_complete': 'Complete Seeds',
  'num_incomplete': 'Incomplete Peers',
  'num_leechs': 'Leechers',
  'num_seeds': 'Seeds',
  'popularity': 'Popularity',
  'private': 'Private',
  'ratio_limit': 'Ratio Limit',
  'reannounce': 'Reannounce In',
  'root_path': 'Root Path',
  'save_path': 'Save Path',
  'seeding_time': 'Seeding Time',
  'seeding_time_limit': 'Seeding Time Limit',
  'seen_complete': 'Last Seen Complete',
  'seq_dl': 'Sequential Download',
  'super_seeding': 'Super Seeding',
  'tags': 'Tags',
  'time_active': 'Time Active',
  'total_size': 'Total Size',
  'tracker': 'Tracker',
  'trackers_count': 'Trackers Count',
  'up_limit': 'Upload Limit',
  'uploaded': 'Uploaded',
  'uploaded_session': 'Uploaded (Session)',
  'upspeed': 'Upload Speed',
  // Transmission fields (camelCase, unique to Transmission)
  'hashString': 'Info Hash',
  'totalSize': 'Total Size',
  'downloadDir': 'Download Directory',
  'downloadedEver': 'Downloaded',
  'uploadedEver': 'Uploaded',
  'rateDownload': 'Download Speed',
  'rateUpload': 'Upload Speed',
  'uploadRatio': 'Upload Ratio',
  'percentDone': 'Progress',
  'leftUntilDone': 'Remaining',
  'sizeWhenDone': 'Size When Done',
  'metadataPercentComplete': 'Metadata',
  'activityDate': 'Last Activity',
  'addedDate': 'Added',
  'doneDate': 'Completed',
  'startDate': 'Started',
  'dateCreated': 'Torrent Created',
  'peersConnected': 'Connected Peers',
  'isFinished': 'Finished',
  'isStalled': 'Stalled',
  'bandwidthPriority': 'Priority',
  'pieceCount': 'Piece Count',
  'pieceSize': 'Piece Size',
  'errorString': 'Error',
  // Deluge fields (snake_case, only those not already covered above)
  'active_time': 'Active Time',
  'all_time_download': 'Downloaded (All Time)',
  'completed_time': 'Completed',
  'download_payload_rate': 'Download Speed',
  'is_finished': 'Finished',
  'move_completed_path': 'Move Completed Path',
  'move_on_completed': 'Move On Completed',
  'move_on_completed_path': 'Move Path',
  'num_files': 'Number of Files',
  'num_peers': 'Peers',
  'total_done': 'Downloaded',
  'total_payload_download': 'Downloaded (Session)',
  'total_payload_upload': 'Uploaded (Session)',
  'total_peers': 'Total Peers',
  'total_seeds': 'Total Seeds',
  'total_uploaded': 'Uploaded (All Time)',
  'total_wanted': 'Wanted',
  'time_added': 'Added',
  'tracker_host': 'Tracker',
  'upload_payload_rate': 'Upload Speed',
  // Known file (shared/upload) fields
  'EC_TAG_KNOWNFILE_REQ_COUNT': 'Requests (Session)',
  'EC_TAG_KNOWNFILE_REQ_COUNT_ALL': 'Requests (Total)',
  'EC_TAG_KNOWNFILE_ACCEPT_COUNT': 'Accepted Requests (Session)',
  'EC_TAG_KNOWNFILE_ACCEPT_COUNT_ALL': 'Accepted Requests (Total)',
  'EC_TAG_KNOWNFILE_XFERRED': 'Uploaded (Session)',
  'EC_TAG_KNOWNFILE_XFERRED_ALL': 'Uploaded (Total)',
  'EC_TAG_KNOWNFILE_AICH_MASTERHASH': 'AICH Master Hash',
  'EC_TAG_KNOWNFILE_PRIO': 'Upload Priority',
  'EC_TAG_KNOWNFILE_COMPLETE_SOURCES_LOW': 'Complete Sources (Low Estimate)',
  'EC_TAG_KNOWNFILE_COMPLETE_SOURCES_HIGH': 'Complete Sources (High Estimate)',
  'EC_TAG_KNOWNFILE_COMPLETE_SOURCES': 'Complete Sources',
  'EC_TAG_KNOWNFILE_ON_QUEUE': 'Clients in Queue',
  'EC_TAG_KNOWNFILE_FILENAME': 'File Path',
  // Canonical fields (normalized from EC_TAG_KNOWNFILE_COMMENT / _RATING)
  'comment': 'Comment',
  'rating': 'Rating',
  // Part file (download) fields
  'EC_TAG_PARTFILE_NAME': 'File Name',
  'EC_TAG_PARTFILE_HASH': 'ED2K Hash',
  'EC_TAG_PARTFILE_SIZE_FULL': 'Total Size',
  'EC_TAG_PARTFILE_SIZE_XFER': 'Transferred (Raw)',
  'EC_TAG_PARTFILE_SIZE_DONE': 'Verified & Written',
  'EC_TAG_PARTFILE_STATUS': 'Download Status',
  'EC_TAG_PARTFILE_STOPPED': 'Stopped by User',
  'EC_TAG_PARTFILE_SOURCE_COUNT': 'Total Sources',
  'EC_TAG_PARTFILE_SOURCE_COUNT_NOT_CURRENT': 'Sources Not Connected',
  'EC_TAG_PARTFILE_SOURCE_COUNT_XFER': 'Sources Uploading',
  'EC_TAG_PARTFILE_SOURCE_COUNT_A4AF': 'A4AF Sources',
  'EC_TAG_PARTFILE_SPEED': 'Current Speed',
  'EC_TAG_PARTFILE_PRIO': 'Download Priority',
  'EC_TAG_PARTFILE_CAT': 'Category',
  'EC_TAG_PARTFILE_SHARED': 'Shared',
  'EC_TAG_PARTFILE_LAST_SEEN_COMP': 'Last Complete Source Seen',
  'EC_TAG_PARTFILE_LAST_RECV': 'Last Data Received',
  'EC_TAG_PARTFILE_DOWNLOAD_ACTIVE': 'Active Download Time',
  'EC_TAG_PARTFILE_AVAILABLE_PARTS': 'Available Parts',
  'EC_TAG_PARTFILE_HASHED_PART_COUNT': 'Verified Parts',
  'EC_TAG_PARTFILE_LOST_CORRUPTION': 'Lost to Corruption',
  'EC_TAG_PARTFILE_GAINED_COMPRESSION': 'Saved by Compression',
  'EC_TAG_PARTFILE_SAVED_ICH': 'Saved by ICH',
  'EC_TAG_PARTFILE_A4AFAUTO': 'Auto A4AF Swapping',
  'EC_TAG_PARTFILE_PARTMETID': 'Part.met ID',
  'EC_TAG_PARTFILE_SOURCE_NAMES': 'Source Reported Filename',
  'EC_TAG_PARTFILE_COMMENTS': 'File Comments'
};

// ─── Field Types ─────────────────────────────────────────────────────────────
// Flat map of key → format type. Drives TYPE_RENDERERS dispatch in fieldFormatters.

export const FIELD_TYPES = {
  // bytes
  'EC_TAG_PARTFILE_SIZE_FULL': 'bytes',
  'EC_TAG_PARTFILE_SIZE_XFER': 'bytes',
  'EC_TAG_PARTFILE_SIZE_DONE': 'bytes',
  'EC_TAG_PARTFILE_LOST_CORRUPTION': 'bytes',
  'EC_TAG_PARTFILE_GAINED_COMPRESSION': 'bytes',
  'EC_TAG_PARTFILE_SAVED_ICH': 'bytes',
  'EC_TAG_KNOWNFILE_XFERRED': 'bytes',
  'EC_TAG_KNOWNFILE_XFERRED_ALL': 'bytes',
  'size': 'bytes',
  'completedBytes': 'bytes',
  'downloadTotal': 'bytes',
  'uploadTotal': 'bytes',
  'chunkSize': 'bytes',
  'amount_left': 'bytes',
  'completed': 'bytes',
  'downloaded': 'bytes',
  'downloaded_session': 'bytes',
  'uploaded': 'bytes',
  'uploaded_session': 'bytes',
  'total_size': 'bytes',
  'total_done': 'bytes',
  'total_wanted': 'bytes',
  'all_time_download': 'bytes',
  'total_payload_download': 'bytes',
  'total_payload_upload': 'bytes',
  'total_uploaded': 'bytes',
  'totalSize': 'bytes',
  'downloadedEver': 'bytes',
  'uploadedEver': 'bytes',
  'leftUntilDone': 'bytes',
  'sizeWhenDone': 'bytes',
  'pieceSize': 'bytes',
  // speed
  'EC_TAG_PARTFILE_SPEED': 'speed',
  'downloadSpeed': 'speed',
  'uploadSpeed': 'speed',
  'dlspeed': 'speed',
  'upspeed': 'speed',
  'download_payload_rate': 'speed',
  'upload_payload_rate': 'speed',
  'rateDownload': 'speed',
  'rateUpload': 'speed',
  // timestamp
  'EC_TAG_PARTFILE_LAST_SEEN_COMP': 'timestamp_amule',
  'EC_TAG_PARTFILE_LAST_RECV': 'timestamp_amule',
  'creationDate': 'timestamp_rtorrent',
  'addedTime': 'timestamp_rtorrent',
  'completedTime': 'timestamp_rtorrent',
  'startedTime': 'timestamp_rtorrent',
  'finishedTime': 'timestamp_rtorrent',
  'added_on': 'timestamp',
  'completion_on': 'timestamp',
  'last_activity': 'timestamp',
  'seen_complete': 'timestamp',
  'time_added': 'timestamp',
  'completed_time': 'timestamp',
  'activityDate': 'timestamp_transmission',
  'addedDate': 'timestamp_transmission',
  'doneDate': 'timestamp_transmission',
  'startDate': 'timestamp_transmission',
  'dateCreated': 'timestamp_transmission',
  // duration
  'EC_TAG_PARTFILE_DOWNLOAD_ACTIVE': 'duration_verbose',
  'seedingTime': 'duration',
  'eta': 'duration_infinity',
  'seeding_time': 'duration_infinity',
  'time_active': 'duration_infinity',
  'reannounce': 'duration_infinity',
  'active_time': 'duration',
  // boolean
  'EC_TAG_PARTFILE_SHARED': 'boolean',
  'isActive': 'boolean',
  'isComplete': 'boolean',
  'isOpen': 'boolean',
  'isHashing': 'boolean',
  'isPrivate': 'boolean',
  'isMultiFile': 'boolean',
  'auto_tmm': 'boolean',
  'f_l_piece_prio': 'boolean',
  'force_start': 'boolean',
  'has_metadata': 'boolean',
  'private': 'boolean',
  'seq_dl': 'boolean',
  'super_seeding': 'boolean',
  'is_finished': 'boolean',
  'paused': 'boolean',
  'move_on_completed': 'boolean',
  'isFinished': 'boolean',
  'isStalled': 'boolean',
  // ratio
  'ratio': 'ratio',
  'uploadRatio': 'ratio',
  // percent
  'percentDone': 'percent',
  'metadataPercentComplete': 'percent',
  // hash
  'hash': 'hash',
  'EC_TAG_PARTFILE_HASH': 'hash',
  'EC_TAG_KNOWNFILE_AICH_MASTERHASH': 'hash',
  'infohash_v1': 'hash',
  'infohash_v2': 'hash',
  'hashString': 'hash',
  // decimal3
  'availability': 'decimal3',
  'popularity': 'decimal3',
};

// ─── Skip Fields ─────────────────────────────────────────────────────────────
// Keys that formatFieldValue should return null for (rendered separately or redundant).

export const SKIP_FIELDS = new Set([
  'EC_TAG_PARTFILE_ED2K_LINK',
  'EC_TAG_PARTFILE_A4AFAUTO',
  'peers',
  'trackersDetailed',
  'trackers',
  'message',
]);

// ─── Special Formatter Keys ──────────────────────────────────────────────────
// Keys that need custom rendering beyond simple type dispatch.
// Listed here for documentation; actual formatter functions live in fieldFormatters.js.

export const SPECIAL_FORMATTER_KEYS = new Set([
  'EC_TAG_PARTFILE_SOURCE_NAMES',
  'EC_TAG_PARTFILE_A4AF_SOURCES',
  'EC_TAG_PARTFILE_COMMENTS',
  'EC_TAG_KNOWNFILE_PRIO',
  'EC_TAG_PARTFILE_PRIO',
  'EC_TAG_PARTFILE_STATUS',
  'EC_TAG_PARTFILE_CAT',
  'rating',
  'comment',
  'peers',
  'priority',
  'state',
  'status',
  'progress',
  'bandwidthPriority',
  'error',
  'dl_limit',
  'up_limit',
  'max_ratio',
  'ratio_limit',
  'max_seeding_time',
  'seeding_time_limit',
  'inactive_seeding_time_limit',
  'max_inactive_seeding_time',
  'magnet_uri',
]);

// ─── Field Categories ────────────────────────────────────────────────────────
// Per-client map of key → category name.

export const FIELD_CATEGORIES = {
  amule: {
    // File Identification
    'EC_TAG_PARTFILE_NAME': 'File Identification',
    'EC_TAG_PARTFILE_HASH': 'File Identification',
    'EC_TAG_PARTFILE_SIZE_FULL': 'File Identification',
    'EC_TAG_KNOWNFILE_FILENAME': 'File Identification',
    'EC_TAG_KNOWNFILE_AICH_MASTERHASH': 'File Identification',
    'EC_TAG_PARTFILE_COMMENTS': 'File Identification',
    // State & Progress
    'EC_TAG_PARTFILE_STATUS': 'State & Progress',
    'EC_TAG_PARTFILE_SHARED': 'State & Progress',
    // Download Statistics
    'EC_TAG_PARTFILE_SIZE_XFER': 'Download Statistics',
    'EC_TAG_PARTFILE_SIZE_DONE': 'Download Statistics',
    'EC_TAG_PARTFILE_SPEED': 'Download Statistics',
    'EC_TAG_PARTFILE_AVAILABLE_PARTS': 'Download Statistics',
    'EC_TAG_PARTFILE_HASHED_PART_COUNT': 'Download Statistics',
    // Priority & Category
    'EC_TAG_KNOWNFILE_PRIO': 'Priority & Category',
    'EC_TAG_PARTFILE_PRIO': 'Priority & Category',
    'EC_TAG_PARTFILE_CAT': 'Priority & Category',
    // Upload Statistics
    'EC_TAG_KNOWNFILE_REQ_COUNT': 'Upload Statistics',
    'EC_TAG_KNOWNFILE_REQ_COUNT_ALL': 'Upload Statistics',
    'EC_TAG_KNOWNFILE_ACCEPT_COUNT': 'Upload Statistics',
    'EC_TAG_KNOWNFILE_ACCEPT_COUNT_ALL': 'Upload Statistics',
    'EC_TAG_KNOWNFILE_XFERRED': 'Upload Statistics',
    'EC_TAG_KNOWNFILE_XFERRED_ALL': 'Upload Statistics',
    'EC_TAG_KNOWNFILE_ON_QUEUE': 'Upload Statistics',
    'rating': 'File Identification',
    'comment': 'File Identification',
    // Source Information
    'EC_TAG_PARTFILE_SOURCE_COUNT': 'Source Information',
    'EC_TAG_PARTFILE_SOURCE_COUNT_NOT_CURRENT': 'Source Information',
    'EC_TAG_PARTFILE_SOURCE_COUNT_XFER': 'Source Information',
    'EC_TAG_PARTFILE_SOURCE_COUNT_A4AF': 'Source Information',
    'EC_TAG_PARTFILE_SOURCE_NAMES': 'Source Information',
    'EC_TAG_PARTFILE_A4AF_SOURCES': 'Source Information',
    'EC_TAG_KNOWNFILE_COMPLETE_SOURCES_LOW': 'Source Information',
    'EC_TAG_KNOWNFILE_COMPLETE_SOURCES_HIGH': 'Source Information',
    'EC_TAG_KNOWNFILE_COMPLETE_SOURCES': 'Source Information',
    // Timing & Activity
    'EC_TAG_PARTFILE_LAST_SEEN_COMP': 'Timing & Activity',
    'EC_TAG_PARTFILE_LAST_RECV': 'Timing & Activity',
    'EC_TAG_PARTFILE_DOWNLOAD_ACTIVE': 'Timing & Activity',
    // Data Integrity & Optimization
    'EC_TAG_PARTFILE_LOST_CORRUPTION': 'Data Integrity & Optimization',
    'EC_TAG_PARTFILE_GAINED_COMPRESSION': 'Data Integrity & Optimization',
    'EC_TAG_PARTFILE_SAVED_ICH': 'Data Integrity & Optimization',
  },
  rtorrent: {
    // File Identification
    'hash': 'File Identification',
    'name': 'File Identification',
    'size': 'File Identification',
    'directory': 'File Identification',
    'basePath': 'File Identification',
    'isPrivate': 'File Identification',
    'isMultiFile': 'File Identification',
    // State & Progress
    'status': 'State & Progress',
    'state': 'State & Progress',
    'isActive': 'State & Progress',
    'isComplete': 'State & Progress',
    'isOpen': 'State & Progress',
    'isHashing': 'State & Progress',
    'progress': 'State & Progress',
    // Download Statistics
    'completedBytes': 'Download Statistics',
    'downloadSpeed': 'Download Statistics',
    'downloadTotal': 'Download Statistics',
    'chunksCompleted': 'Download Statistics',
    'chunksTotal': 'Download Statistics',
    // Upload Statistics
    'uploadSpeed': 'Upload Statistics',
    'uploadTotal': 'Upload Statistics',
    'ratio': 'Upload Statistics',
    // Priority & Category
    'priority': 'Priority & Category',
    'label': 'Priority & Category',
    // Timing & Activity
    'addedTime': 'Timing & Activity',
    'completedTime': 'Timing & Activity',
    'creationDate': 'Timing & Activity',
    'startedTime': 'Timing & Activity',
    'finishedTime': 'Timing & Activity',
    'seedingTime': 'Timing & Activity',
    // Source Information
    'peers': 'Source Information',
    'peersTotal': 'Source Information',
    'seeds': 'Source Information',
    'seedsTotal': 'Source Information',
    // Data Integrity & Optimization
    'chunkSize': 'Data Integrity & Optimization',
  },
  qbittorrent: {
    // File Identification
    'hash': 'File Identification',
    'infohash_v1': 'File Identification',
    'infohash_v2': 'File Identification',
    'name': 'File Identification',
    'size': 'File Identification',
    'total_size': 'File Identification',
    'save_path': 'File Identification',
    'content_path': 'File Identification',
    'root_path': 'File Identification',
    'download_path': 'File Identification',
    'private': 'File Identification',
    'comment': 'File Identification',
    'tags': 'File Identification',
    // State & Progress
    'state': 'State & Progress',
    'progress': 'State & Progress',
    'amount_left': 'State & Progress',
    'completed': 'State & Progress',
    'eta': 'State & Progress',
    'availability': 'State & Progress',
    'has_metadata': 'State & Progress',
    'force_start': 'State & Progress',
    'auto_tmm': 'State & Progress',
    'seq_dl': 'State & Progress',
    'f_l_piece_prio': 'State & Progress',
    // Download Statistics
    'downloaded': 'Download Statistics',
    'downloaded_session': 'Download Statistics',
    'dlspeed': 'Download Statistics',
    'dl_limit': 'Download Statistics',
    // Upload Statistics
    'uploaded': 'Upload Statistics',
    'uploaded_session': 'Upload Statistics',
    'upspeed': 'Upload Statistics',
    'up_limit': 'Upload Statistics',
    'ratio': 'Upload Statistics',
    'max_ratio': 'Upload Statistics',
    'ratio_limit': 'Upload Statistics',
    'super_seeding': 'Upload Statistics',
    // Priority & Category
    'category': 'Priority & Category',
    'priority': 'Priority & Category',
    // Timing & Activity
    'added_on': 'Timing & Activity',
    'completion_on': 'Timing & Activity',
    'last_activity': 'Timing & Activity',
    'seen_complete': 'Timing & Activity',
    'time_active': 'Timing & Activity',
    'seeding_time': 'Timing & Activity',
    'seeding_time_limit': 'Timing & Activity',
    'max_seeding_time': 'Timing & Activity',
    'inactive_seeding_time_limit': 'Timing & Activity',
    'max_inactive_seeding_time': 'Timing & Activity',
    // Source Information
    'num_seeds': 'Source Information',
    'num_leechs': 'Source Information',
    'num_complete': 'Source Information',
    'num_incomplete': 'Source Information',
    'tracker': 'Source Information',
    'trackers_count': 'Source Information',
    'reannounce': 'Source Information',
    'popularity': 'Source Information',
  },
  deluge: {
    // File Identification
    'hash': 'File Identification',
    'name': 'File Identification',
    'total_size': 'File Identification',
    'save_path': 'File Identification',
    'comment': 'File Identification',
    'num_files': 'File Identification',
    'move_completed_path': 'File Identification',
    'move_on_completed': 'File Identification',
    'move_on_completed_path': 'File Identification',
    // State & Progress
    'state': 'State & Progress',
    'total_done': 'State & Progress',
    'total_wanted': 'State & Progress',
    'eta': 'State & Progress',
    'paused': 'State & Progress',
    'is_finished': 'State & Progress',
    // Download Statistics
    'download_payload_rate': 'Download Statistics',
    'total_payload_download': 'Download Statistics',
    'all_time_download': 'Download Statistics',
    // Upload Statistics
    'upload_payload_rate': 'Upload Statistics',
    'total_payload_upload': 'Upload Statistics',
    'total_uploaded': 'Upload Statistics',
    'ratio': 'Upload Statistics',
    // Priority & Category
    'label': 'Priority & Category',
    // Timing & Activity
    'time_added': 'Timing & Activity',
    'completed_time': 'Timing & Activity',
    'active_time': 'Timing & Activity',
    'seeding_time': 'Timing & Activity',
    // Source Information
    'num_seeds': 'Source Information',
    'num_peers': 'Source Information',
    'total_seeds': 'Source Information',
    'total_peers': 'Source Information',
    'tracker_host': 'Source Information',
  },
  transmission: {
    // File Identification
    'hashString': 'File Identification',
    'totalSize': 'File Identification',
    'downloadDir': 'File Identification',
    'isPrivate': 'File Identification',
    'comment': 'File Identification',
    'creator': 'File Identification',
    // State & Progress
    'status': 'State & Progress',
    'leftUntilDone': 'State & Progress',
    'sizeWhenDone': 'State & Progress',
    'eta': 'State & Progress',
    'isFinished': 'State & Progress',
    'isStalled': 'State & Progress',
    'metadataPercentComplete': 'State & Progress',
    'error': 'State & Progress',
    'errorString': 'State & Progress',
    // Download Statistics
    'downloadedEver': 'Download Statistics',
    'rateDownload': 'Download Statistics',
    // Upload Statistics
    'uploadedEver': 'Upload Statistics',
    'rateUpload': 'Upload Statistics',
    'uploadRatio': 'Upload Statistics',
    // Priority & Category
    'bandwidthPriority': 'Priority & Category',
    // Timing & Activity
    'activityDate': 'Timing & Activity',
    'addedDate': 'Timing & Activity',
    'doneDate': 'Timing & Activity',
    'startDate': 'Timing & Activity',
    'dateCreated': 'Timing & Activity',
    // Source Information
    'peersConnected': 'Source Information',
    // Data Integrity & Optimization
    'pieceCount': 'Data Integrity & Optimization',
    'pieceSize': 'Data Integrity & Optimization',
  },
};

// ─── Categorize Skip ─────────────────────────────────────────────────────────
// Global + per-client skip sets for categorization.

export const CATEGORIZE_SKIP = {
  _global: new Set([
    'clientType', 'files', 'peersDetailed', 'trackersDetailed', 'trackers', 'message',
    'EC_TAG_PARTFILE_ED2K_LINK', 'EC_TAG_PARTFILE_STOPPED',
    'EC_TAG_PARTFILE_A4AFAUTO', 'EC_TAG_PARTFILE_PARTMETID',
    // Superseded by canonical `comment` / `rating` fields (same values, cleaner names)
    'EC_TAG_KNOWNFILE_COMMENT', 'EC_TAG_KNOWNFILE_RATING',
  ]),
  deluge: new Set(['progress']),
  qbittorrent: new Set(['magnet_uri']),
  transmission: new Set(['fileStats', 'id', 'labels', 'name', 'percentDone']),
};

// ─── Categorize Conditional Skip ─────────────────────────────────────────────
// Per-key skip predicates — skip field if predicate returns true.

export const CATEGORIZE_CONDITIONAL_SKIP = {
  'infohash_v2': (v) => !v || v === '',
  'errorString': (v) => !v || v === '',
};

// ─── Category Order ──────────────────────────────────────────────────────────
// Canonical section ordering for the info modal.

export const CATEGORY_ORDER = [
  'File Identification',
  'Source Information',
  'State & Progress',
  'Download Statistics',
  'Upload Statistics',
  'Timing & Activity',
  'Priority & Category',
  'Data Integrity & Optimization',
  'Uncategorized',
];

// ─── Tracker Configs ─────────────────────────────────────────────────────────
// Per-client tracker normalization config.

export const QBITTORRENT_TRACKER_STATUS = {
  0: { label: 'Disabled', active: false },
  1: { label: 'Not Contacted', active: false },
  2: { label: 'Active', active: true },
  3: { label: 'Updating', active: true },
  4: { label: 'Error', active: false },
};

export const TRACKER_CONFIGS = {
  rtorrent: {
    urlField: 'url',
    seedsField: 'scrapeComplete',
    leechersField: 'scrapeIncomplete',
    downloadedField: 'scrapeDownloaded',
    messageField: 'message',
    getEnabled: (t) => t.enabled,
    getStatusLabel: (t, enabled) => enabled ? 'Active' : 'Disabled',
  },
  qbittorrent: {
    urlField: 'url',
    seedsField: 'num_seeds',
    leechersField: 'num_leeches',
    downloadedField: 'num_downloaded',
    messageField: 'msg',
    getEnabled: (t) => {
      const info = QBITTORRENT_TRACKER_STATUS[t.status];
      return info ? info.active : false;
    },
    getStatusLabel: (t) => {
      const info = QBITTORRENT_TRACKER_STATUS[t.status];
      return info ? info.label : 'Unknown';
    },
  },
  deluge: {
    urlField: 'url',
    seedsField: null,
    leechersField: null,
    downloadedField: null,
    messageField: null,
    getEnabled: () => true,
    getStatusLabel: () => 'Active',
  },
  transmission: {
    urlField: 'announce',
    seedsField: 'seederCount',
    leechersField: 'leecherCount',
    downloadedField: 'downloadCount',
    messageField: 'lastAnnounceResult',
    getEnabled: (t) => t.lastAnnounceSucceeded !== false,
    getStatusLabel: (t) => {
      if (t.lastAnnounceSucceeded === true) return 'Active';
      if (t.hasAnnounced === false) return 'Not Contacted';
      return t.lastAnnounceSucceeded === false ? 'Error' : 'Active';
    },
  },
};
