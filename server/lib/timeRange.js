/**
 * Time Range Utilities
 * Shared time range calculations for metrics and scheduling
 */

// Time constants (in milliseconds)
const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/**
 * Predefined time range configurations
 * Each range has a duration and bucket size for aggregation
 */
const TIME_RANGES = {
  '24h': {
    duration: 24 * MS_PER_HOUR,
    bucketSize: 15 * MS_PER_MINUTE,       // 15-minute buckets (96 points)
    speedBucketSize: 30 * MS_PER_SECOND   // 30-second buckets for speed history (2,880 points)
  },
  '7d': {
    duration: 7 * MS_PER_DAY,
    bucketSize: 2 * MS_PER_HOUR,          // 2-hour buckets (84 points)
    speedBucketSize: 15 * MS_PER_MINUTE   // 15-minute buckets for speed history
  },
  '30d': {
    duration: 30 * MS_PER_DAY,
    bucketSize: 6 * MS_PER_HOUR,          // 6-hour buckets (120 points)
    speedBucketSize: MS_PER_HOUR          // 1-hour buckets for speed history
  }
};

/**
 * Valid range values for validation
 */
const VALID_RANGES = Object.keys(TIME_RANGES);

/**
 * Parse and validate a time range string
 * @param {string} range - Time range string ('24h', '7d', '30d')
 * @returns {{startTime: number, endTime: number, bucketSize: number, speedBucketSize: number}|null}
 *          Time range config or null if invalid
 */
function parseTimeRange(range) {
  const config = TIME_RANGES[range];
  if (!config) {
    return null;
  }

  const now = Date.now();
  return {
    startTime: now - config.duration,
    endTime: now,
    bucketSize: config.bucketSize,
    speedBucketSize: config.speedBucketSize
  };
}

/**
 * Check if a time range is valid
 * @param {string} range - Time range string
 * @returns {boolean} True if valid
 */
function isValidRange(range) {
  return VALID_RANGES.includes(range);
}

/**
 * Get time range configuration
 * @param {string} range - Time range string
 * @returns {object|null} Time range config or null if invalid
 */
function getRangeConfig(range) {
  return TIME_RANGES[range] || null;
}

/**
 * Format duration in milliseconds to human-readable string
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Human-readable duration (e.g., "2h 30m")
 */
function formatDuration(ms) {
  if (ms < MS_PER_MINUTE) {
    return `${Math.round(ms / MS_PER_SECOND)}s`;
  }
  if (ms < MS_PER_HOUR) {
    const minutes = Math.floor(ms / MS_PER_MINUTE);
    const seconds = Math.round((ms % MS_PER_MINUTE) / MS_PER_SECOND);
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
  if (ms < MS_PER_DAY) {
    const hours = Math.floor(ms / MS_PER_HOUR);
    const minutes = Math.round((ms % MS_PER_HOUR) / MS_PER_MINUTE);
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  const days = Math.floor(ms / MS_PER_DAY);
  const hours = Math.round((ms % MS_PER_DAY) / MS_PER_HOUR);
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
}

/**
 * Calculate interval in milliseconds from minutes
 * @param {number} minutes - Number of minutes
 * @returns {number} Milliseconds
 */
function minutesToMs(minutes) {
  return minutes * MS_PER_MINUTE;
}

/**
 * Calculate interval in milliseconds from hours
 * @param {number} hours - Number of hours
 * @returns {number} Milliseconds
 */
function hoursToMs(hours) {
  return hours * MS_PER_HOUR;
}

/**
 * Calculate interval in milliseconds from days
 * @param {number} days - Number of days
 * @returns {number} Milliseconds
 */
function daysToMs(days) {
  return days * MS_PER_DAY;
}

module.exports = {
  // Constants
  MS_PER_SECOND,
  MS_PER_MINUTE,
  MS_PER_HOUR,
  MS_PER_DAY,
  VALID_RANGES,
  TIME_RANGES,
  // Functions
  parseTimeRange,
  isValidRange,
  getRangeConfig,
  formatDuration,
  minutesToMs,
  hoursToMs,
  daysToMs
};
