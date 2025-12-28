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
 * Calculate dynamic font size based on filename length for mobile view
 * @param {string} filename - File name
 * @returns {string} Font size in pixels (e.g., "14px")
 */
export const getDynamicFontSize = (filename) => {
  if(!filename) return '14px';
  const length = filename.length;
  if (length < 70) return '14px';      // text-sm - short filenames
  if (length < 100) return '13px';     // slightly smaller - medium filenames
  if (length < 130) return '12px';     // smaller - long filenames
  return '11px';                       // smallest - very long filenames
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
