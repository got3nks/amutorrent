/**
 * How often and how much the server refreshes from download clients, and
 * whether anyone is reading the result.
 *
 * Settings come from the environment and are read once at startup. A bad
 * value falls back to the default with a warning rather than stopping the
 * server.
 */

const logger = require('./logger');

/**
 * Read a millisecond interval from the environment.
 * @param {string} name - Variable name
 * @param {number} fallback - Default when unset or invalid
 * @param {number} min - Smallest accepted value
 * @param {Object} [env] - Environment to read, for tests
 * @returns {number}
 */
function readIntervalMs(name, fallback, min, env = process.env) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min) {
    logger.warn(`⚠️  ${name}="${raw}" is not a whole number of milliseconds of at least ${min}; using ${fallback}`);
    return fallback;
  }
  return n;
}

/**
 * Read one of a fixed set of values from the environment, case-insensitively.
 * @param {string} name - Variable name
 * @param {string[]} choices - Accepted values, lowercase
 * @param {string} fallback - Default when unset or invalid
 * @param {Object} [env] - Environment to read, for tests
 * @returns {string}
 */
function readChoice(name, choices, fallback, env = process.env) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = String(raw).trim().toLowerCase();
  if (!choices.includes(value)) {
    logger.warn(`⚠️  ${name}="${raw}" is not one of ${choices.join(', ')}; using ${fallback}`);
    return fallback;
  }
  return value;
}

// How often the item lists (downloads, shared files, uploads) are fetched.
// Stats, speed metrics and connection health keep their own 3s cycle.
const DATA_REFRESH_INTERVAL = readIntervalMs('DATA_REFRESH_INTERVAL_MS', 3000, 1000);

// Pause between the end of one tracker/peer scan and the start of the next.
const TRACKER_REFRESH_INTERVAL = readIntervalMs('TRACKER_REFRESH_INTERVAL_MS', 10000, 1000);

// 'all' scans every torrent each pass; 'active' scans only those transferring,
// connected to peers, or downloading, and fetches the rest when opened.
const TRACKER_REFRESH_SCOPE = readChoice('TRACKER_REFRESH_SCOPE', ['all', 'active'], 'all');

/**
 * How old cached item data may be and still count as current: one data
 * refresh period plus margin. Exactly 5s with the defaults.
 */
const DATA_MAX_AGE = Math.max(DATA_REFRESH_INTERVAL, 3000) + 2000;

// An API client counts as reading for this long after its last request, so a
// poller keeps the cache warm between polls.
const API_DEMAND_WINDOW = Math.max(60000, 2 * DATA_REFRESH_INTERVAL);

let lastApiRead = 0;

/** Record that an HTTP API client read client data. */
function markApiRead() {
  lastApiRead = Date.now();
}

/**
 * Is anyone reading client data: a connected browser, or an API client
 * recently? Without a WebSocket server to ask, assume yes rather than starve
 * a reader we cannot see.
 * @param {Object} [wss] - WebSocket server
 * @returns {boolean}
 */
function hasDemand(wss) {
  if (!wss) return true;
  if (wss.clients.size > 0) return true;
  return Date.now() - lastApiRead < API_DEMAND_WINDOW;
}

/** For tests: forget any recorded API read. */
function resetDemand() {
  lastApiRead = 0;
}

module.exports = {
  readIntervalMs,
  readChoice,
  DATA_REFRESH_INTERVAL,
  TRACKER_REFRESH_INTERVAL,
  TRACKER_REFRESH_SCOPE,
  DATA_MAX_AGE,
  API_DEMAND_WINDOW,
  markApiRead,
  hasDemand,
  resetDemand
};
