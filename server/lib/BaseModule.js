/**
 * BaseModule - Base class for server modules with dependency injection
 *
 * Provides common dependency injection setters to reduce boilerplate across modules.
 * All modules can extend this class to automatically get standard setters.
 */
class BaseModule {
  constructor() {
    this.log = null;
    this.broadcast = null;
    this.amuleManager = null;
    this.geoIPManager = null;
    this.metricsDB = null;
    this.wss = null;
  }

  /**
   * Set logger function
   * @param {Function} logger - Logging function
   */
  setLogger(logger) {
    this.log = logger;
  }

  /**
   * Set broadcast function
   * @param {Function} broadcastFn - WebSocket broadcast function
   */
  setBroadcast(broadcastFn) {
    this.broadcast = broadcastFn;
  }

  /**
   * Set aMule manager instance
   * @param {Object} amuleManager - aMule manager instance
   */
  setAmuleManager(amuleManager) {
    this.amuleManager = amuleManager;
  }

  /**
   * Set GeoIP manager instance
   * @param {Object} geoIPManager - GeoIP manager instance
   */
  setGeoIPManager(geoIPManager) {
    this.geoIPManager = geoIPManager;
  }

  /**
   * Set metrics database instance
   * @param {Object} db - Metrics database instance
   */
  setMetricsDB(db) {
    this.metricsDB = db;
  }

  /**
   * Set WebSocket server instance
   * @param {Object} wss - WebSocket server instance
   */
  setWebSocketServer(wss) {
    this.wss = wss;
  }
}

module.exports = BaseModule;
