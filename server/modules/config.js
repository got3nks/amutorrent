/**
 * Configuration Module
 * Centralizes all environment variables and configuration settings
 * Integrates with ConfigManager for runtime configuration support
 */

const path = require('path');

// Runtime configuration values (can be updated from ConfigManager)
let runtimeConfig = {
  PORT: parseInt(process.env.PORT || '4000', 10),
  AMULE_HOST: process.env.AMULE_HOST || '127.0.0.1',
  AMULE_PORT: parseInt(process.env.AMULE_PORT || '4712', 10),
  AMULE_PASSWORD: process.env.AMULE_PASSWORD || 'admin',
  SONARR_URL: process.env.SONARR_URL || null,
  SONARR_API_KEY: process.env.SONARR_API_KEY || null,
  SONARR_SEARCH_INTERVAL_HOURS: parseInt(process.env.SONARR_SEARCH_INTERVAL_HOURS || '0', 10),
  RADARR_URL: process.env.RADARR_URL || null,
  RADARR_API_KEY: process.env.RADARR_API_KEY || null,
  RADARR_SEARCH_INTERVAL_HOURS: parseInt(process.env.RADARR_SEARCH_INTERVAL_HOURS || '0', 10)
};

// Path configuration (updated from ConfigManager if available)
let pathConfig = {
  dataDir: path.join(__dirname, '..', 'data'),
  logsDir: path.join(__dirname, '..', 'logs'),
  geoipDir: null // Will be set based on dataDir
};

// Initialize geoipDir
pathConfig.geoipDir = path.join(pathConfig.dataDir, 'geoip');

// Paths
const getAppRoot = () => path.resolve(process.cwd());
const getLogDir = () => pathConfig.logsDir;
const getDataDir = () => pathConfig.dataDir;
const getGeoIPDir = () => pathConfig.geoipDir;

// Database paths
const getMetricsDbPath = () => path.join(getDataDir(), 'metrics.db');
const getHashDbPath = () => path.join(getDataDir(), 'hashes.db');
const getGeoIPCityDbPath = () => path.join(getGeoIPDir(), 'GeoLite2-City.mmdb');
const getGeoIPCountryDbPath = () => path.join(getGeoIPDir(), 'GeoLite2-Country.mmdb');

// Auto-refresh intervals
const AUTO_REFRESH_INTERVAL = 3000; // 3 seconds

// Command timeouts
const COMMAND_TIMEOUT_MS = 300000; // 5 minutes

// Cleanup settings
const CLEANUP_DAYS = 30;
const CLEANUP_HOUR = 3; // 3 AM

/**
 * Update configuration from ConfigManager
 * Called by server.js after loading runtime configuration
 */
function updateFromConfigManager(configManagerInstance) {
  const cfg = configManagerInstance.getConfig();
  if (!cfg) return;

  // Update runtime config
  runtimeConfig.PORT = cfg.server.port;
  runtimeConfig.AMULE_HOST = cfg.amule.host;
  runtimeConfig.AMULE_PORT = cfg.amule.port;
  runtimeConfig.AMULE_PASSWORD = cfg.amule.password;

  // Update Sonarr
  if (cfg.integrations.sonarr.enabled) {
    runtimeConfig.SONARR_URL = cfg.integrations.sonarr.url;
    runtimeConfig.SONARR_API_KEY = cfg.integrations.sonarr.apiKey;
    runtimeConfig.SONARR_SEARCH_INTERVAL_HOURS = cfg.integrations.sonarr.searchIntervalHours;
  } else {
    runtimeConfig.SONARR_URL = null;
    runtimeConfig.SONARR_API_KEY = null;
    runtimeConfig.SONARR_SEARCH_INTERVAL_HOURS = 0;
  }

  // Update Radarr
  if (cfg.integrations.radarr.enabled) {
    runtimeConfig.RADARR_URL = cfg.integrations.radarr.url;
    runtimeConfig.RADARR_API_KEY = cfg.integrations.radarr.apiKey;
    runtimeConfig.RADARR_SEARCH_INTERVAL_HOURS = cfg.integrations.radarr.searchIntervalHours;
  } else {
    runtimeConfig.RADARR_URL = null;
    runtimeConfig.RADARR_API_KEY = null;
    runtimeConfig.RADARR_SEARCH_INTERVAL_HOURS = 0;
  }

  // Update paths
  if (cfg.directories) {
    const dataDir = path.resolve(cfg.directories.data);
    const logsDir = path.resolve(cfg.directories.logs);
    const geoipDir = path.resolve(cfg.directories.geoip);

    pathConfig.dataDir = dataDir;
    pathConfig.logsDir = logsDir;
    pathConfig.geoipDir = geoipDir;
  }
}

module.exports = {
  // Server
  get PORT() { return runtimeConfig.PORT; },

  // aMule
  get AMULE_HOST() { return runtimeConfig.AMULE_HOST; },
  get AMULE_PORT() { return runtimeConfig.AMULE_PORT; },
  get AMULE_PASSWORD() { return runtimeConfig.AMULE_PASSWORD; },

  // Sonarr
  get SONARR_URL() { return runtimeConfig.SONARR_URL; },
  get SONARR_API_KEY() { return runtimeConfig.SONARR_API_KEY; },
  get SONARR_SEARCH_INTERVAL_HOURS() { return runtimeConfig.SONARR_SEARCH_INTERVAL_HOURS; },

  // Radarr
  get RADARR_URL() { return runtimeConfig.RADARR_URL; },
  get RADARR_API_KEY() { return runtimeConfig.RADARR_API_KEY; },
  get RADARR_SEARCH_INTERVAL_HOURS() { return runtimeConfig.RADARR_SEARCH_INTERVAL_HOURS; },

  // Paths
  getAppRoot,
  getLogDir,
  getDataDir,
  getGeoIPDir,
  getMetricsDbPath,
  getHashDbPath,
  getGeoIPCityDbPath,
  getGeoIPCountryDbPath,

  // Intervals and timeouts
  AUTO_REFRESH_INTERVAL,
  COMMAND_TIMEOUT_MS,
  CLEANUP_DAYS,
  CLEANUP_HOUR,

  // Configuration management
  updateFromConfigManager
};