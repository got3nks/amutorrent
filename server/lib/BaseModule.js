/**
 * BaseModule - Base class for server modules with dependency injection
 *
 * Provides common dependency injection setters to reduce boilerplate across modules.
 * All modules can extend this class to automatically get standard setters.
 */
const logger = require('./logger');

class BaseModule {
  constructor() {
    // Use centralized logger singleton
    this.log = logger.log.bind(logger);
    this.broadcast = null;
    this.metricsDB = null;
    this.downloadHistoryDB = null;
    this.wss = null;
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
      hashStore: 'setHashStore'
    };

    for (const [key, setter] of Object.entries(setterMap)) {
      if (deps[key] !== undefined && typeof this[setter] === 'function') {
        this[setter](deps[key]);
      }
    }
  }

}

module.exports = BaseModule;
