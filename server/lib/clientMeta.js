/**
 * Client Meta Configuration
 *
 * Single source of truth for client-type properties and capabilities.
 *
 * This module is purely static — it describes what each client type IS
 * and what it CAN DO. Runtime dispatch (which manager instance to call)
 * is handled by ClientRegistry (separate module, future step).
 */

'use strict';

// ============================================================================
// CLIENT TYPE DEFINITIONS
// ============================================================================

const CLIENT_TYPES = {
  amule: {
    networkType: 'ed2k',
    displayName: 'aMule',
    metricsPrefix: 'am_',        // am_upload_speed, am_total_uploaded
    hashLength: 32,
    statusField: 'status',        // resolveStatus reads numeric `status`
    statusMap: {
      7: 'paused'
      // all other codes → 'active'
    },
    connectionDefaults: {
      host: '', port: 4712, password: '', sharedDirDatPath: ''
    },
    defaults: {
      downloadPriority: null,
      uploadPriority: null,
      uploadSession: null,
      requestsAccepted: null,
      requestsAcceptedTotal: null,
      partStatus: null,
      gapStatus: null,
      reqStatus: null,
      lastSeenComplete: 0,
      ed2kLink: null,
      addedAt: null
    },
    capabilities: {
      nativeMove: false,           // no built-in move API
      categoryChangeAutoMoves: true, // active downloads auto-move to new category path on category change
      multiFile: false,            // aMule files are always single-file
      sharedFiles: true,           // has a shared file concept
      sharedMeansComplete: true,   // shared file = 100% complete
      removeSharedMustDeleteFiles: true, // removing a shared file requires deleting it from disk (can't just "unshare")
      moveSharedForCategoryChange: true, // shared files must be physically moved for category change (no API to recategorize in-place)
      refreshSharedAfterMove: true,  // needs refreshSharedFiles() after move
      moveActiveDownloads: false,  // active downloads use temp files managed by aMule — can't be relocated
      pauseBeforeMove: false,      // no file handle release needed
      trackers: false,             // ed2k has no tracker concept
      search: true,                // ed2k search supported
      cancelDeletesFiles: true,    // cancelDownload() cleans up .part temp file
      apiDeletesFiles: false,      // no API-level delete-with-files flag
      refreshSharedAfterDelete: true, // needs refreshSharedFiles() after shared file deletion
      categories: true,            // supports named categories
      logs: true,                  // has fetchable log output
      renameFile: true,            // can rename downloads and shared files
      fileRatingComment: true,     // can set a per-file rating + comment (shared files only in aMule)
      customSavePath: false        // ed2k uses category paths only
    }
  },
  rtorrent: {
    networkType: 'bittorrent',
    displayName: 'rTorrent',
    metricsPrefix: 'rt_',        // rt_upload_speed, rt_total_uploaded
    hashLength: 40,
    statusField: 'statusText',    // resolveStatus reads string `statusText`
    statusMap: {
      'downloading': 'active',
      'seeding':     'seeding',
      'paused':      'paused',
      'stopped':     'stopped',
      'completed':   'completed',
      'checking':    'checking',
      'hashing-queued': 'hashing-queued',
      'moving':      'moving',
      'unknown':     'active'
    },
    connectionDefaults: {
      host: '', port: 8000, mode: 'http', path: '/RPC2', socketPath: '', username: '', password: '', useSsl: false
    },
    defaults: {
      downloadPriority: null,
      tracker: null,
      trackers: [],
      trackersDetailed: [],
      message: null,
      magnetLink: null,
      directory: null,
      multiFile: false,
      addedAt: null
    },
    capabilities: {
      nativeMove: false,           // no built-in move API
      categoryChangeAutoMoves: false,
      stopReplacesPause: false,    // has separate Pause and Stop actions
      multiFile: true,             // torrents can be multi-file
      sharedFiles: false,          // no separate shared file list
      sharedMeansComplete: false,
      removeSharedMustDeleteFiles: false,
      moveSharedForCategoryChange: false,
      refreshSharedAfterMove: false,
      moveActiveDownloads: true,   // can relocate active downloads
      pauseBeforeMove: true,       // must close/stop before file move
      trackers: true,              // has tracker info
      search: false,               // no search API
      cancelDeletesFiles: false,   // removeDownload() only removes from client
      apiDeletesFiles: false,      // no API-level delete-with-files flag
      refreshSharedAfterDelete: false,
      categories: false,           // uses labels, not named categories
      tracksPid: true,             // reports PID for restart detection
      logs: false,                 // no fetchable log API
      fileRatingComment: false,
      customSavePath: true         // can set download directory per torrent
    },
    seedingStatuses: ['seeding'],
    // Maps unified category priority → rTorrent priority
    // Unified: 0=Normal, 1=High, 2=Low, 3=Auto
    // rTorrent: 0=Off, 1=Low, 2=Normal, 3=High
    priorityMap: { 0: 2, 1: 3, 2: 1, 3: 2, default: 2 }
  },
  qbittorrent: {
    networkType: 'bittorrent',
    displayName: 'qBittorrent',
    metricsPrefix: 'qb_',        // qb_upload_speed, qb_total_uploaded
    hashLength: 40,
    statusField: 'statusText',    // resolveStatus reads string `statusText`
    statusMap: {
      'downloading':       'active',
      'stalledDL':         'active',
      'metaDL':            'active',
      'allocating':        'active',
      'queuedDL':          'active',
      'forcedDL':          'active',
      'uploading':         'seeding',
      'stalledUP':         'seeding',
      'queuedUP':          'seeding',
      'forcedUP':          'seeding',
      'pausedDL':          'stopped',    // qBittorrent <5.0 (no separate pause/stop)
      'pausedUP':          'stopped',    // qBittorrent <5.0 (no separate pause/stop)
      'stoppedDL':         'stopped',    // qBittorrent 5.0+
      'stoppedUP':         'stopped',    // qBittorrent 5.0+
      'checkingDL':        'checking',
      'checkingUP':        'checking',
      'checkingResumeData': 'checking',
      'moving':            'moving',
      'error':             'error',
      'missingFiles':      'error',
      'unknown':           'stopped'
    },
    connectionDefaults: {
      host: '', port: 8080, username: 'admin', password: '', useSsl: false
    },
    defaults: {
      downloadPriority: null,
      tracker: null,
      trackers: [],
      trackersDetailed: [],
      message: null,
      magnetLink: null,
      directory: null,
      multiFile: false,
      addedAt: null
    },
    capabilities: {
      nativeMove: true,            // has built-in move API
      categoryChangeAutoMoves: false,
      stopReplacesPause: true,     // Stop replaces Pause in UI (qBittorrent v5+)
      multiFile: true,             // torrents can be multi-file
      sharedFiles: false,          // no separate shared file list
      sharedMeansComplete: false,
      removeSharedMustDeleteFiles: false,
      moveSharedForCategoryChange: false,
      refreshSharedAfterMove: false,
      moveActiveDownloads: true,   // can relocate active downloads
      pauseBeforeMove: true,       // should pause before manual move
      trackers: true,              // has tracker info
      search: false,               // no search API (Prowlarr handles this)
      cancelDeletesFiles: false,
      apiDeletesFiles: true,       // removeDownload(hash, deleteFiles) handles it
      refreshSharedAfterDelete: false,
      categories: true,            // supports named categories
      logs: true,                  // has fetchable log output
      fileRatingComment: false,
      customSavePath: true         // can set download directory per torrent
    },
    seedingStatuses: ['uploading', 'stalledUP', 'queuedUP', 'forcedUP']
  },
  deluge: {
    networkType: 'bittorrent',
    displayName: 'Deluge',
    metricsPrefix: 'de_',          // de_upload_speed, de_total_uploaded
    hashLength: 40,
    statusField: 'statusText',      // resolveStatus reads string `statusText`
    statusMap: {
      'Downloading':  'active',
      'Seeding':      'seeding',
      'Paused':       'stopped',     // Deluge has no separate pause/stop
      'Checking':     'checking',
      'Queued':       'active',
      'Error':        'error',
      'Moving':       'moving'
    },
    connectionDefaults: {
      host: '', port: 8112, password: '', useSsl: false
    },
    defaults: {
      downloadPriority: null,
      tracker: null,
      trackers: [],
      trackersDetailed: [],
      message: null,
      magnetLink: null,
      directory: null,
      multiFile: false,
      addedAt: null
    },
    capabilities: {
      nativeMove: true,            // has built-in move_storage API
      categoryChangeAutoMoves: false,
      stopReplacesPause: true,     // Deluge only has pause/resume (no separate stop)
      multiFile: true,             // torrents can be multi-file
      sharedFiles: false,          // no separate shared file list
      sharedMeansComplete: false,
      removeSharedMustDeleteFiles: false,
      moveSharedForCategoryChange: false,
      refreshSharedAfterMove: false,
      moveActiveDownloads: true,   // can relocate active downloads
      pauseBeforeMove: false,      // Deluge handles move internally
      trackers: true,              // has tracker info
      search: false,               // no search API
      cancelDeletesFiles: false,
      apiDeletesFiles: true,       // removeTorrent(hash, removeData) handles it
      refreshSharedAfterDelete: false,
      categories: false,           // uses labels via Label plugin, not named categories
      logs: false,                 // no fetchable log API
      fileRatingComment: false,
      customSavePath: true         // can set download directory per torrent
    },
    seedingStatuses: ['Seeding']
  },
  transmission: {
    networkType: 'bittorrent',
    displayName: 'Transmission',
    metricsPrefix: 'tr_',           // tr_upload_speed, tr_total_uploaded
    hashLength: 40,
    statusField: 'statusText',       // resolveStatus reads string `statusText`
    statusMap: {
      'Paused':           'stopped',      // Transmission has no separate pause/stop
      'Check Pending':    'checking',
      'Checking':         'checking',
      'Download Pending': 'active',
      'Downloading':      'active',
      'Seed Pending':     'seeding',
      'Seeding':          'seeding'
    },
    connectionDefaults: {
      host: '', port: 9091, path: '/transmission/rpc', username: '', password: '', useSsl: false
    },
    defaults: {
      downloadPriority: null,
      tracker: null,
      trackers: [],
      trackersDetailed: [],
      message: null,
      magnetLink: null,
      directory: null,
      multiFile: false,
      addedAt: null
    },
    capabilities: {
      nativeMove: true,              // torrent-set-location
      categoryChangeAutoMoves: false,
      stopReplacesPause: true,       // Only has start/stop
      multiFile: true,               // torrents can be multi-file
      sharedFiles: false,            // no separate shared file list
      sharedMeansComplete: false,
      removeSharedMustDeleteFiles: false,
      moveSharedForCategoryChange: false,
      refreshSharedAfterMove: false,
      moveActiveDownloads: true,     // can relocate active downloads
      pauseBeforeMove: false,        // Transmission handles move internally
      trackers: true,                // has tracker info
      search: false,                 // no search API
      cancelDeletesFiles: false,
      apiDeletesFiles: true,         // torrent-remove with delete-local-data
      refreshSharedAfterDelete: false,
      categories: false,             // uses labels, not named categories
      logs: false,                   // no fetchable log API
      fileRatingComment: false,
      customSavePath: true           // can set download directory per torrent
    },
    seedingStatuses: ['Seeding', 'Seed Pending']
  }
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get the full meta object for a client type.
 * @param {string} type - Client type key (e.g. 'amule', 'rtorrent', 'qbittorrent')
 * @returns {Object} Full meta object
 * @throws {Error} If type is unknown
 */
function get(type) {
  const meta = CLIENT_TYPES[type];
  if (!meta) {
    throw new Error(`Unknown client type: "${type}". Valid types: ${getAllTypes().join(', ')}`);
  }
  return meta;
}

/**
 * Get the network type for a client type.
 * @param {string} type - Client type key
 * @returns {'ed2k'|'bittorrent'}
 */
function getNetworkType(type) {
  return get(type).networkType;
}

/**
 * Check if a client type is a BitTorrent client.
 * @param {string} type - Client type key
 * @returns {boolean}
 */
function isBittorrent(type) {
  return CLIENT_TYPES[type]?.networkType === 'bittorrent';
}

/**
 * Check if a client type is an ed2k client.
 * @param {string} type - Client type key
 * @returns {boolean}
 */
function isEd2k(type) {
  return CLIENT_TYPES[type]?.networkType === 'ed2k';
}

/**
 * Get all client type keys that belong to a given network type.
 * @param {string} networkType - 'ed2k' or 'bittorrent'
 * @returns {string[]} Array of client type keys
 */
function getByNetworkType(networkType) {
  return Object.entries(CLIENT_TYPES)
    .filter(([, meta]) => meta.networkType === networkType)
    .map(([type]) => type);
}

/**
 * Get all known client type keys.
 * @returns {string[]}
 */
function getAllTypes() {
  return Object.keys(CLIENT_TYPES);
}

/**
 * Check if a client type has a specific capability.
 * @param {string} type - Client type key
 * @param {string} capability - Capability name
 * @returns {boolean}
 */
function hasCapability(type, capability) {
  const meta = CLIENT_TYPES[type];
  if (!meta) return false;
  return meta.capabilities[capability] === true;
}

/**
 * Get the status map for a client type.
 * @param {string} type - Client type key
 * @returns {Object} Status map (client status → unified status)
 */
function getStatusMap(type) {
  return get(type).statusMap;
}

/**
 * Get the default fields for a client type.
 * @param {string} type - Client type key
 * @returns {Object} Default field values
 */
function getDefaults(type) {
  return get(type).defaults;
}

/**
 * Get the default connection settings for a client type.
 * @param {string} type - Client type key
 * @returns {Object} Default connection values (host, port, etc.)
 */
function getConnectionDefaults(type) {
  return get(type).connectionDefaults;
}

/**
 * Get the display name for a client type.
 * @param {string} type - Client type key
 * @returns {string}
 */
function getDisplayName(type) {
  return get(type).displayName;
}

/**
 * Map a unified category priority to the client's native priority value.
 * Returns undefined if the client type has no priorityMap (doesn't use priorities).
 * @param {string} type - Client type key
 * @param {number} priority - Unified priority (0=Normal, 1=High, 2=Low, 3=Auto)
 * @returns {number|undefined}
 */
function mapPriority(type, priority) {
  const pm = CLIENT_TYPES[type]?.priorityMap;
  if (!pm) return undefined;
  return pm[priority] !== undefined ? pm[priority] : pm.default;
}

/**
 * Get metrics configuration for all client types.
 * Used by database.js for SQL generation and metricsAPI.js for response building.
 * @returns {Array<{type: string, prefix: string, networkType: string}>}
 */
function getMetricsConfig() {
  return Object.entries(CLIENT_TYPES).map(([type, meta]) => ({
    type,
    prefix: meta.metricsPrefix,
    networkType: meta.networkType
  }));
}

/**
 * Get unique network types in stable insertion order.
 * @returns {string[]} e.g. ['ed2k', 'bittorrent']
 */
function getNetworkTypes() {
  const seen = new Set();
  const result = [];
  for (const meta of Object.values(CLIENT_TYPES)) {
    if (!seen.has(meta.networkType)) {
      seen.add(meta.networkType);
      result.push(meta.networkType);
    }
  }
  return result;
}

module.exports = {
  CLIENT_TYPES,
  get,
  getNetworkType,
  isBittorrent,
  isEd2k,
  getByNetworkType,
  getAllTypes,
  hasCapability,
  getStatusMap,
  getDefaults,
  getConnectionDefaults,
  getDisplayName,
  mapPriority,
  getMetricsConfig,
  getNetworkTypes
};
