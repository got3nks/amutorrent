/**
 * Formatting Utilities
 *
 * Pure functions for formatting data values in the UI
 */

/**
 * Format bytes to human-readable string
 * @param {number} bytes - Number of bytes
 * @returns {string} Formatted string (e.g., "1.23 MB")
 */
export const formatBytes = (bytes) => {
  if (bytes == null) return '-';
  if (bytes === 0) return '0 B';
  const kb = 1024;
  const mb = kb * 1024;
  const gb = mb * 1024;

  if (bytes >= gb) return (bytes / gb).toFixed(2) + ' GB';
  if (bytes >= mb) return (bytes / mb).toFixed(2) + ' MB';
  if (bytes >= kb) return (bytes / kb).toFixed(2) + ' KB';
  return bytes + ' B';
};

/**
 * Format speed to human-readable string
 * @param {number} speed - Speed in bytes per second
 * @returns {string} Formatted string (e.g., "1.23 MB/s") or "-" if speed is 0
 */
export const formatSpeed = (speed) => {
  if (speed <= 0) return '-';
  const kb = 1024;
  const mb = kb * 1024;

  if (speed >= mb) return (speed / mb).toFixed(2) + ' MB/s';
  if (speed >= kb) return (speed / kb).toFixed(2) + ' KB/s';
  return speed + ' B/s';
};

/**
 * Format statistics value for display
 * @param {*} value - Value to format (can be object, array, string, number, etc.)
 * @returns {string} Formatted string
 */
export const formatStatsValue = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && value._value !== undefined) {
    return value._value;
  }
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  return String(value);
};

/**
 * Format timestamp to human-readable date and time
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {string} Formatted date and time string
 */
export const formatDateTime = (timestamp) => {
  if (!timestamp) return 'Unknown';
  const date = new Date(timestamp);
  return date.toLocaleString();
};

/**
 * Calculate ETA in seconds for an item
 * @param {Object} item - Download item with size, sizeDownloaded, downloadSpeed
 * @returns {number} ETA in seconds (0 = complete, Infinity = stalled/no speed)
 */
export const getETASeconds = (item) => {
  const remainingBytes = (item.size || 0) - (item.sizeDownloaded || 0);
  if (remainingBytes <= 0) return 0;
  const speed = item.downloadSpeed || 0;
  if (speed <= 0) return Infinity;
  return remainingBytes / speed;
};

/**
 * Format seconds to human-readable ETA string
 * @param {number} totalSeconds - Total seconds remaining
 * @returns {string} Formatted ETA string (e.g., "2h 15m", "3d 4h")
 */
export const formatETASeconds = (totalSeconds) => {
  if (!totalSeconds || totalSeconds <= 0 || !isFinite(totalSeconds)) {
    return '-';
  }

  totalSeconds = Math.floor(totalSeconds);

  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes < 60) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours < 24) {
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;

  if (days < 7) {
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
  }

  const weeks = Math.floor(days / 7);
  const remainingDays = days % 7;

  return remainingDays > 0 ? `${weeks}w ${remainingDays}d` : `${weeks}w`;
};

/**
 * Format ETA based on remaining bytes and current speed
 * @param {number} remainingBytes - Bytes remaining to download
 * @param {number} speedBytesPerSec - Current download speed in bytes/sec
 * @returns {string} Formatted ETA string (e.g., "2h 15m", "3d 4h")
 */
export const formatETA = (remainingBytes, speedBytesPerSec) => {
  if (!speedBytesPerSec || speedBytesPerSec <= 0 || !remainingBytes || remainingBytes <= 0) {
    return '-';
  }
  return formatETASeconds(remainingBytes / speedBytesPerSec);
};

/**
 * Format timestamp to relative time (e.g., "5 minutes ago", "2 days ago")
 * @param {string|number} timestamp - ISO string or Unix timestamp
 * @returns {string} Relative time string
 */
export const formatTimeAgo = (timestamp) => {
  if (!timestamp) return '-';

  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return '-';

  const now = Date.now();
  const diffMs = now - date.getTime();

  // Handle future dates
  if (diffMs < 0) return 'just now';

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (seconds < 60) return seconds <= 1 ? '1 second ago' : `${seconds} seconds ago`;
  if (minutes < 60) return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  if (days < 7) return days === 1 ? '1 day ago' : `${days} days ago`;
  if (days < 30) return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
  if (days < 365) return months === 1 ? '1 month ago' : `${months} months ago`;
  return years === 1 ? '1 year ago' : `${years} years ago`;
};

/**
 * Format last seen complete date, handling "Never" case
 * @param {number} timestamp - Unix timestamp in seconds
 * @returns {string} Formatted date string or "Never"
 */
export const formatLastSeenComplete = (timestamp) => {
  // Handle null, undefined, or 0 (never seen)
  if (!timestamp || timestamp === 0) return 'Never';

  // Convert Unix timestamp (seconds) to JavaScript Date (milliseconds)
  const date = new Date(timestamp * 1000);

  if (isNaN(date.getTime())) return 'Never';

  // Format as "dd-mm-yyyy hh:mm:ss"
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${dd}-${mm}-${yyyy} ${hours}:${minutes}:${seconds}`;
};

/**
 * Get color class based on time difference from now
 * @param {number} timestamp - Unix timestamp in seconds
 * @returns {string} Tailwind color class
 */
export const getTimeBasedColor = (timestamp) => {
  // Handle null, undefined, or 0 (never seen)
  if (!timestamp || timestamp === 0) return 'text-red-600 dark:text-red-400';

  // Convert Unix timestamp (seconds) to JavaScript Date (milliseconds)
  const date = new Date(timestamp * 1000);

  if (isNaN(date.getTime())) return 'text-gray-100';

  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = diffHours / 24;

  if (diffHours < 24) {
    return 'text-green-600 dark:text-green-400';
  } else if (diffDays < 7) {
    return 'text-yellow-600 dark:text-yellow-400';
  } else {
    return 'text-red-600 dark:text-red-400';
  }
};

/**
 * Convert IP address from integer to dotted quad string
 * aMule sends IPs as little-endian 32-bit integers
 * @param {number} ip - IP as integer
 * @returns {string} Formatted IP address (e.g., "192.168.1.1") or "N/A" if invalid
 */
export const ipToString = (ip) => {
  if (!ip) return 'N/A';
  return [
    ip & 0xFF,
    (ip >>> 8) & 0xFF,
    (ip >>> 16) & 0xFF,
    (ip >>> 24) & 0xFF
  ].join('.');
};

/**
 * Format ratio value (uploaded / downloaded or uploaded / size)
 * @param {number|null|undefined} ratio - Ratio value, or null/undefined
 * @returns {string} Formatted ratio string (e.g., "1.23") or "-" if invalid
 */
export const formatRatio = (ratio) => {
  if (ratio === null || ratio === undefined) return '-';
  if (ratio === 0) return '0.00';
  return ratio.toFixed(2);
};

/**
 * Calculate and format ratio from item data
 * Uses item.ratio if available, otherwise calculates from uploadTotal / size
 * @param {Object} item - Item with ratio, uploadTotal, and/or size fields
 * @returns {string} Formatted ratio string
 */
export const calculateRatio = (item) => {
  if (!item) return '-';
  // Use ratio field if available (e.g., from rtorrent or history)
  if (item.ratio !== undefined && item.ratio !== null) {
    return formatRatio(item.ratio);
  }
  // Calculate from uploaded / size for shared files
  if (item.size && item.size > 0 && item.uploadTotal !== undefined) {
    return formatRatio(item.uploadTotal / item.size);
  }
  return '-';
};

/**
 * Generate magnet link from rtorrent download info
 * @param {Object} item - Download item with hash, name, and optionally trackers
 * @returns {string|null} Magnet URI or null if no hash
 */
export const generateMagnetLink = (item) => {
  if (!item || !item.hash) return null;
  const encodedName = encodeURIComponent(item.name || 'Unknown');
  let magnetLink = `magnet:?xt=urn:btih:${item.hash}&dn=${encodedName}`;

  // Add tracker URLs if available
  if (item.trackers && Array.isArray(item.trackers)) {
    item.trackers.forEach(tracker => {
      magnetLink += `&tr=${encodeURIComponent(tracker)}`;
    });
  }

  return magnetLink;
};
