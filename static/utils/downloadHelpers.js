/**
 * Download Helpers
 *
 * Shared helper functions for download/file status and formatting
 * Used by DownloadsView, SharedView, UploadsView, and other views
 */

import { CLIENT_SOFTWARE_LABELS } from './constants.js';
import { generateMagnetLink } from './formatters.js';

/**
 * Check if a download item is paused
 * Unified items always have string status
 * @param {Object} item - Download item
 * @returns {boolean} True if paused
 */
export const isItemPaused = (item) => {
  return item.status === 'paused';
};

/**
 * Check if a download item is stopped (closed)
 * @param {Object} item - Download item
 * @returns {boolean} True if stopped
 */
export const isItemStopped = (item) => {
  return item.status === 'stopped' || item.status === 'completed';
};

/**
 * Check if a download item is hash checking
 * @param {Object} item - Download item
 * @returns {boolean} True if hash checking
 */
export const isItemChecking = (item) => {
  return item.status === 'checking';
};

/**
 * Check if a download item is queued for hash checking
 * @param {Object} item - Download item
 * @returns {boolean} True if queued for hash check
 */
export const isItemHashingQueued = (item) => {
  return item.status === 'hashing-queued';
};

/**
 * Check if a download item is moving to a new location
 * @param {Object} item - Download item
 * @returns {boolean} True if moving
 */
export const isItemMoving = (item) => {
  return item.status === 'moving';
};

/**
 * Check if a download item has an error message
 * @param {Object} item - Download item
 * @returns {boolean} True if has error
 */
export const isItemError = (item) => {
  return item.message && item.message.length > 0;
};

/**
 * Check if a download item is actively downloading
 * Unified items always have string status
 * @param {Object} item - Download item
 * @returns {boolean} True if downloading
 */
export const isItemDownloading = (item) => {
  return item.status === 'downloading' || item.status === 'active';
};

/**
 * Centralized status display styles for all status keys.
 * Used by getItemStatusInfo and directly by views (e.g. SharedView) for
 * consistent icon/color rendering across the app.
 */
export const STATUS_DISPLAY_MAP = {
  seeding: { icon: 'arrowUp', iconClass: 'text-green-500 dark:text-green-400', label: 'Seeding', labelClass: 'text-green-600 dark:text-green-400' },
  downloading: { icon: 'arrowDown', iconClass: 'text-blue-500 dark:text-blue-400', label: 'Downloading', labelClass: 'text-blue-600 dark:text-blue-400' },
  stalled: { icon: 'alertTriangle', iconClass: 'text-amber-500 dark:text-amber-400', label: 'Stalled', labelClass: 'text-amber-600 dark:text-amber-400' },
  sharing: { icon: 'arrowUp', iconClass: 'text-green-500 dark:text-green-400', label: 'Seeding', labelClass: 'text-green-600 dark:text-green-400' },
  active: { icon: 'play', iconClass: 'text-green-500 dark:text-green-400', label: null, labelClass: null },
  paused: { icon: 'pause', iconClass: 'text-orange-500 dark:text-orange-400', label: 'Paused', labelClass: 'text-gray-400' },
  stopped: { icon: 'stop', iconClass: 'text-gray-400 dark:text-gray-500', label: 'Stopped', labelClass: 'text-gray-400 dark:text-gray-500' },
  checking: { icon: 'refresh', iconClass: 'text-cyan-500 dark:text-cyan-400 animate-spin', label: 'Checking', labelClass: 'text-cyan-600 dark:text-cyan-400' },
  'hashing-queued': { icon: 'refresh', iconClass: 'text-cyan-500 dark:text-cyan-400', label: 'Queued', labelClass: 'text-cyan-600 dark:text-cyan-400' },
  moving: { icon: 'loader', iconClass: 'text-purple-500 dark:text-purple-400 animate-spin', label: 'Moving', labelClass: 'text-purple-600 dark:text-purple-400' },
  error: { icon: 'alertCircle', iconClass: 'text-red-500 dark:text-red-400', label: 'Error', labelClass: 'text-red-600 dark:text-red-400' },
  // History statuses
  completed: { icon: 'check', iconClass: 'text-green-500 dark:text-green-400', label: 'Completed', labelClass: 'text-green-600 dark:text-green-400' },
  missing: { icon: 'alertTriangle', iconClass: 'text-amber-500 dark:text-amber-400', label: 'Missing', labelClass: 'text-amber-600 dark:text-amber-400' },
  deleted: { icon: 'trash', iconClass: 'text-red-500 dark:text-red-400', label: 'Deleted', labelClass: 'text-red-600 dark:text-red-400' }
};

/**
 * Human-readable labels for each status key.
 * Derived from STATUS_DISPLAY_MAP; fills in 'Active' for the active key (which has null label).
 * Used by views that need status labels for filters or display (e.g. SharedView status options).
 */
export const STATUS_LABELS = Object.fromEntries(
  Object.entries(STATUS_DISPLAY_MAP).map(([key, val]) => [key, val.label || 'Active'])
);

/**
 * Get consolidated status display info for an item
 * Returns icon props, label, and colors for consistent rendering across views
 * @param {Object} item - Download/shared file item
 * @returns {Object} { key, icon, iconClass, label, labelClass }
 */
export const getItemStatusInfo = (item) => {
  let key;
  if (isItemError(item)) key = 'error';
  else if (isItemMoving(item)) key = 'moving';
  else if (isItemChecking(item)) key = 'checking';
  else if (isItemHashingQueued(item)) key = 'hashing-queued';
  else if (isItemStopped(item)) key = 'stopped';
  else if (isItemPaused(item)) key = 'paused';
  else {
    // Granular active status detection
    const dlSpeed = item.downloadSpeed || 0;
    const ulSpeed = item.uploadSpeed || 0;
    const progress = item.progress || 0;
    const connectedSources = item.sources?.connected || 0;

    if (item.seeding || progress >= 100) {
      key = 'seeding';
    } else if (item.downloading && dlSpeed > 0) {
      key = 'downloading';
    } else if (item.downloading && dlSpeed === 0 && connectedSources === 0) {
      key = 'stalled';
    } else {
      key = 'active';
    }
  }
  return { key, ...STATUS_DISPLAY_MAP[key] };
};

/**
 * Get progress bar background color class based on status key
 * @param {string} statusKey - Status key from getItemStatusInfo
 * @returns {string} Tailwind bg color class
 */
export const getStatusBarColor = (statusKey) => {
  switch (statusKey) {
    case 'downloading': return 'bg-gradient-to-r from-green-500 to-green-300';
    case 'seeding': return 'bg-gradient-to-r from-green-700 to-green-500';
    case 'stalled': return 'bg-gradient-to-r from-amber-600 to-amber-400';
    case 'paused': return 'bg-gradient-to-r from-gray-500 to-gray-400';
    case 'stopped': return 'bg-gradient-to-r from-gray-500 to-gray-400';
    case 'checking': return 'bg-gradient-to-r from-cyan-600 to-cyan-400';
    case 'hashing-queued': return 'bg-gradient-to-r from-cyan-500 to-cyan-300';
    case 'moving': return 'bg-gradient-to-r from-purple-600 to-purple-400';
    case 'error': return 'bg-gradient-to-r from-red-600 to-red-400';
    default: return 'bg-gradient-to-r from-green-600 to-green-400'; // active fallback
  }
};

/**
 * Check if a status key represents an active (non-paused/stopped) state
 * @param {string} key - Status key
 * @returns {boolean} True if active-type status
 */
export const isActiveStatus = (key) => {
  return key === 'active' || key === 'downloading' || key === 'seeding' || key === 'stalled';
};

/**
 * Format source count display with detailed breakdown
 * Handles both aMule and rtorrent formats via unified sources object
 * @param {Object} item - Download item with sources object
 * @returns {string} Formatted source display (readable format)
 */
export const formatSourceDisplay = (item, compact = false) => {
  // rtorrent: "X peers (Y seeds)" or compact "X (Y seeds)"
  if (item.client === 'rtorrent') {
    const sources = item.sources || {};
    const connected = sources.connected || 0;
    const seeders = sources.seeders || 0;
    return compact
      ? `${connected} (${seeders} seeds)`
      : `${connected} peers (${seeders} seeds)`;
  }

  // aMule source breakdown
  const sources = item.sources || {};
  const total = sources.total || 0;
  const connected = sources.connected || 0;
  const notCurrent = sources.notCurrent || 0;
  const a4af = sources.a4af || 0;
  const current = notCurrent ? total - notCurrent : total;

  let display;
  if (compact) {
    // Desktop: compact format without "sources" word
    display = notCurrent > 0
      ? `${current}/${total} (${connected} active)`
      : `${current} (${connected} active)`;
    if (a4af > 0) {
      display += ` + ${a4af} A4AF`;
    }
  } else {
    // Mobile: full format with "sources" word
    display = notCurrent > 0
      ? `${current}/${total} sources (${connected} active)`
      : `${current} sources (${connected} active)`;
    if (a4af > 0) {
      display += ` + ${a4af} A4AF`;
    }
  }

  return display;
};

/**
 * Get unique rtorrent labels from a list of downloads
 * @param {Array} downloads - Array of download items
 * @returns {Array} Sorted array of unique labels
 */
export const extractRtorrentLabels = (downloads) => {
  const labels = new Set();
  downloads.forEach(d => {
    if (d.client === 'rtorrent' && d.category && d.category !== '(none)') {
      labels.add(d.category);
    }
  });
  return Array.from(labels).sort();
};

/**
 * Check if downloads include rtorrent items
 * @param {Array} downloads - Array of download items
 * @returns {boolean} True if any rtorrent downloads exist
 */
export const hasRtorrentItems = (downloads) => {
  return downloads.some(d => d.client === 'rtorrent');
};

/**
 * Check if downloads include aMule items
 * @param {Array} downloads - Array of download items
 * @returns {boolean} True if any aMule downloads exist
 */
export const hasAmuleItems = (downloads) => {
  return downloads.some(d => d.client === 'amule' || !d.client);
};

/**
 * Filter downloads by client type
 * @param {Array} downloads - Array of download items
 * @param {string} clientFilter - 'all', 'amule', or 'rtorrent'
 * @returns {Array} Filtered downloads
 */
export const filterByClient = (downloads, clientFilter) => {
  if (clientFilter === 'all') return downloads;
  return downloads.filter(download => download.client === clientFilter);
};

/**
 * Filter downloads by unified category filter
 * @param {Array} downloads - Array of download items
 * @param {string} unifiedFilter - 'all' or 'category:Name'
 * @returns {Array} Filtered downloads
 */
export const filterByUnifiedFilter = (downloads, unifiedFilter) => {
  if (unifiedFilter === 'all') return downloads;

  // Unified format: category:Name
  if (unifiedFilter.startsWith('category:')) {
    const categoryName = unifiedFilter.slice(9);
    return downloads.filter(download => download.category === categoryName);
  }

  return downloads;
};

/**
 * Get selected client types from a selection
 * @param {Set} selectedFiles - Set of selected file hashes
 * @param {Array} downloads - Array of download items
 * @returns {Set} Set of client types in selection ('amule', 'rtorrent')
 */
export const getSelectedClientTypes = (selectedFiles, downloads) => {
  const types = new Set();
  downloads.forEach(d => {
    if (selectedFiles.has(d.hash)) {
      types.add(d.client || 'amule');
    }
  });
  return types;
};

/**
 * Get client software name from ID or string
 * For rtorrent, softwareId is -1 and we use software string directly
 * @param {Object} item - Upload or peer item with client software info
 * @returns {string} Client software name
 */
export const getClientSoftware = (item) => {
  // For rtorrent peers, use the client string directly (it contains full client name + version)
  if (item.client === 'rtorrent' || item.softwareId === -1) {
    return item.software || 'Unknown';
  }
  // For aMule, use the numeric software ID lookup
  return CLIENT_SOFTWARE_LABELS[item.softwareId] || 'Unknown';
};

/**
 * Get IP address string from a peer/upload item
 * @param {Object} item - Upload or peer item with address field
 * @returns {string} IP address string
 */
export const getIpString = (item) => {
  return item.address || 'Unknown';
};

/**
 * Get export link for any download/shared file
 * Returns magnet link for rtorrent, ED2K link for aMule
 * @param {Object} item - Download or shared file item
 * @returns {string|null} Export link or null if not available
 */
export const getExportLink = (item) => {
  if (item.client === 'rtorrent') {
    return generateMagnetLink(item);
  }
  // aMule: use unified ed2kLink field
  return item.ed2kLink || null;
};

/**
 * Get export link label based on client type
 * @param {Object} item - Download or shared file item
 * @returns {string} Label for the export link
 */
export const getExportLinkLabel = (item) => {
  return item.client === 'rtorrent' ? 'Magnet Link' : 'ED2K Link';
};

/**
 * Extract unique tracker domains from a list of items
 * @param {Array} items - Array of download/shared items with tracker field
 * @returns {Array} Sorted array of unique tracker domains
 */
export const extractUniqueTrackers = (items) => {
  const trackers = new Set();
  items.forEach(item => {
    if (item.tracker) {
      trackers.add(item.tracker);
    }
  });
  return Array.from(trackers).sort();
};

/**
 * Filter items by tracker domain
 * @param {Array} items - Array of items with tracker field
 * @param {string} trackerFilter - Tracker domain to filter by, or 'all'/'none'
 * @returns {Array} Filtered items
 */
export const filterByTracker = (items, trackerFilter) => {
  if (!trackerFilter || trackerFilter === 'all') return items;
  if (trackerFilter === 'none') {
    return items.filter(item => !item.tracker);
  }
  return items.filter(item => item.tracker === trackerFilter);
};

/**
 * Build tracker filter options for dropdown
 * @param {Array} trackers - Array of unique tracker domains
 * @param {boolean} includeNoTracker - Whether to include "No tracker" option (default: false)
 * @returns {Array} Array of options with { value, label }
 */
export const buildTrackerFilterOptions = (trackers, includeNoTracker = false) => {
  const options = [{ value: 'all', label: 'All Trackers' }];
  if (includeNoTracker) {
    options.push({ value: 'none', label: '(no tracker)' });
  }
  trackers.forEach(tracker => {
    options.push({ value: tracker, label: tracker });
  });
  return options;
};

/**
 * Build unified filter options for category dropdown
 * Categories are now unified - same categories apply to both aMule and rtorrent
 * @param {Object} config - Configuration object
 * @param {Array} config.categories - Unified categories array (from CategoryManager)
 * @returns {Array} Array of options with { value, label }
 */
export const buildUnifiedFilterOptions = ({ categories = [] }) => {
  const options = [{ value: 'all', label: 'All Categories' }];

  // Sort categories: Default first, then alphabetically
  const sortedCategories = [...categories].sort((a, b) => {
    const nameA = a.name || a.title || '';
    const nameB = b.name || b.title || '';
    if (nameA === 'Default') return -1;
    if (nameB === 'Default') return 1;
    return nameA.localeCompare(nameB);
  });

  // Add unified categories (no ED2K/BT prefix needed anymore)
  sortedCategories.forEach(cat => {
    const name = cat.name || cat.title || 'Untitled';
    options.push({
      value: `category:${name}`,
      label: name
    });
  });

  return options;
};

/**
 * Build category filter options for table column header dropdown
 * Wraps buildUnifiedFilterOptions with 'Category' label for the all option
 * @param {Object} config
 * @param {Array} config.categories - Unified categories array
 * @returns {Array} Array of options with { value, label }
 */
export const buildCategoryColumnFilterOptions = ({ categories = [] }) => {
  return [
    { value: 'all', label: 'Category' },
    ...buildUnifiedFilterOptions({ categories })
      .filter(opt => opt.value !== 'all')
  ];
};

/**
 * Format title count display - shows "total" or "filtered/total"
 * Used in view headers for consistent count display
 * @param {number} filtered - Current filtered count
 * @param {number} total - Total count
 * @returns {string} Formatted count string
 */
export const formatTitleCount = (filtered, total) => {
  return filtered === total ? `${total}` : `${filtered}/${total}`;
};

/**
 * Get color class for rtorrent seeder count
 * 0 seeds = red, 1 seed = yellow, 2+ seeds = green
 * @param {number} seeders - Number of seeders
 * @returns {string} Tailwind color class
 */
export const getSeederColorClass = (seeders) => {
  if (seeders === 0) return 'text-red-600 dark:text-red-400';
  if (seeders === 1) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-green-600 dark:text-green-400';
};
