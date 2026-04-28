/**
 * BaseModule - Base class for server modules with dependency injection
 *
 * Provides common dependency injection setters to reduce boilerplate across modules.
 * All modules can extend this class to automatically get standard setters.
 *
 * Download client managers should extend BaseClientManager instead, which adds
 * client lifecycle, history tracking, reconnection, and tracker cache.
 *
 * Logging:
 *   `this.log()` / `this.info()` / `this.warn()` / `this.error()` / `this.debug()`
 *   are level-aware shortcuts that tag every record with the module's
 *   `logSource()` (defaults to `instanceId` if present, else the constructor
 *   name). Subclasses can override `logSource()` to pick a friendlier label.
 */
const logger = require('./logger');

class BaseModule {
  constructor() {
    this.broadcast = null;
    this.metricsDB = null;
    this.downloadHistoryDB = null;
    this.wss = null;
    this.userManager = null;

    // Bind level-aware loggers that tag every record with this module's
    // source. Use methods (not arrows) so subclasses can override `logSource()`
    // and have new instances pick that up automatically.
    this.log = (...args) => logger.logFor(this.logSource(), ...args);
    this.info = (...args) => logger.infoFor(this.logSource(), ...args);
    this.warn = (...args) => logger.warnFor(this.logSource(), ...args);
    this.error = (...args) => logger.errorFor(this.logSource(), ...args);
    this.debug = (...args) => logger.debugFor(this.logSource(), ...args);
  }

  /**
   * Source label used for every log record from this module.
   * Subclasses (notably client managers with `instanceId`) override or
   * extend this — default behaviour is "instanceId if set, else class name".
   * @returns {string}
   */
  logSource() {
    return this.instanceId || this.constructor.name;
  }

  /**
   * Set broadcast function
   * @param {Function} broadcastFn - WebSocket broadcast function
   */
  setBroadcast(broadcastFn) {
    this.broadcast = broadcastFn;
  }

  /**
   * Set metrics database instance
   * @param {Object} db - Metrics database instance
   */
  setMetricsDB(db) {
    this.metricsDB = db;
  }

  /**
   * Set download history database instance
   * @param {Object} db - Download history database instance
   */
  setDownloadHistoryDB(db) {
    this.downloadHistoryDB = db;
  }

  /**
   * Set WebSocket server instance
   * @param {Object} wss - WebSocket server instance
   */
  setWebSocketServer(wss) {
    this.wss = wss;
  }

  /**
   * Set hash store instance
   * @param {Object} hashStore - Hash store instance
   */
  setHashStore(hashStore) {
    this.hashStore = hashStore;
  }

  /**
   * Set user manager instance
   * @param {Object} userManager - UserManager instance
   */
  setUserManager(userManager) {
    this.userManager = userManager;
  }

  /**
   * Inject multiple dependencies at once
   * Only sets dependencies that exist in the provided object and have a matching setter
   * @param {Object} deps - Object containing dependencies to inject
   * @example
   * module.inject({ metricsDB, broadcast, wss });
   */
  inject(deps) {
    const setterMap = {
      broadcast: 'setBroadcast',
      metricsDB: 'setMetricsDB',
      downloadHistoryDB: 'setDownloadHistoryDB',
      wss: 'setWebSocketServer',
      hashStore: 'setHashStore',
      userManager: 'setUserManager'
    };

    for (const [key, setter] of Object.entries(setterMap)) {
      if (deps[key] !== undefined && typeof this[setter] === 'function') {
        this[setter](deps[key]);
      }
    }
  }

}

module.exports = BaseModule;
