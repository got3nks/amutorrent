/**
 * Configuration Module
 * Handles configuration loading, saving, validation, and provides simple access
 * to configuration values throughout the application
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const BaseModule = require('../lib/BaseModule');
const { validatePassword } = require('../lib/passwordValidator');
const { hashPassword } = require('../lib/authUtils');

// ============================================================================
// APP CONSTANTS
// ============================================================================

const AUTO_REFRESH_INTERVAL = 3000;  // 3 seconds
const COMMAND_TIMEOUT_MS = 300000;   // 5 minutes
const CLEANUP_DAYS = 30;             // Keep metrics for 30 days
const CLEANUP_HOUR = 3;              // Run cleanup at 3 AM

// ============================================================================
// ENVIRONMENT VARIABLE MAPPINGS
// ============================================================================

/**
 * Central mapping of environment variables to config paths
 * Format: { envVar: { path, type, enablesIntegration } }
 */
const ENV_VAR_MAP = {
  PORT: { path: 'server.port', type: 'int' },
  BIND_ADDRESS: { path: 'server.host', type: 'string' },
  WEB_AUTH_ENABLED: { path: 'server.auth.enabled', type: 'boolean' },
  WEB_AUTH_PASSWORD: { path: 'server.auth.password', type: 'string' },
  AMULE_ENABLED: { path: 'amule.enabled', type: 'boolean' },
  AMULE_HOST: { path: 'amule.host', type: 'string' },
  AMULE_PORT: { path: 'amule.port', type: 'int' },
  AMULE_PASSWORD: { path: 'amule.password', type: 'string' },
  AMULE_SHARED_FILES_RELOAD_INTERVAL_HOURS: { path: 'amule.sharedFilesReloadIntervalHours', type: 'int' },
  RTORRENT_ENABLED: { path: 'rtorrent.enabled', type: 'boolean' },
  RTORRENT_HOST: { path: 'rtorrent.host', type: 'string' },
  RTORRENT_PORT: { path: 'rtorrent.port', type: 'int' },
  RTORRENT_PATH: { path: 'rtorrent.path', type: 'string' },
  RTORRENT_USERNAME: { path: 'rtorrent.username', type: 'string' },
  RTORRENT_PASSWORD: { path: 'rtorrent.password', type: 'string' },
  QBITTORRENT_ENABLED: { path: 'qbittorrent.enabled', type: 'boolean' },
  QBITTORRENT_HOST: { path: 'qbittorrent.host', type: 'string' },
  QBITTORRENT_PORT: { path: 'qbittorrent.port', type: 'int' },
  QBITTORRENT_USERNAME: { path: 'qbittorrent.username', type: 'string' },
  QBITTORRENT_PASSWORD: { path: 'qbittorrent.password', type: 'string' },
  QBITTORRENT_USE_SSL: { path: 'qbittorrent.useSsl', type: 'boolean' },
  SONARR_URL: { path: 'integrations.sonarr.url', type: 'string', enablesIntegration: 'integrations.sonarr.enabled' },
  SONARR_API_KEY: { path: 'integrations.sonarr.apiKey', type: 'string' },
  SONARR_SEARCH_INTERVAL_HOURS: { path: 'integrations.sonarr.searchIntervalHours', type: 'int' },
  RADARR_URL: { path: 'integrations.radarr.url', type: 'string', enablesIntegration: 'integrations.radarr.enabled' },
  RADARR_API_KEY: { path: 'integrations.radarr.apiKey', type: 'string' },
  RADARR_SEARCH_INTERVAL_HOURS: { path: 'integrations.radarr.searchIntervalHours', type: 'int' },
  PROWLARR_URL: { path: 'integrations.prowlarr.url', type: 'string', enablesIntegration: 'integrations.prowlarr.enabled' },
  PROWLARR_API_KEY: { path: 'integrations.prowlarr.apiKey', type: 'string' }
};

/**
 * Paths to sensitive fields that should be masked
 */
const SENSITIVE_PATHS = [
  'server.auth.password',
  'amule.password',
  'rtorrent.password',
  'qbittorrent.password',
  'integrations.sonarr.apiKey',
  'integrations.radarr.apiKey',
  'integrations.prowlarr.apiKey'
];

/**
 * Environment variables that contain sensitive data
 * These always override config.json and are never saved to file
 */
const SENSITIVE_ENV_VARS = [
  'WEB_AUTH_PASSWORD',
  'AMULE_PASSWORD',
  'RTORRENT_PASSWORD',
  'QBITTORRENT_PASSWORD',
  'SONARR_API_KEY',
  'RADARR_API_KEY',
  'PROWLARR_API_KEY'
];

// ============================================================================
// CONFIGURATION MANAGER CLASS
// ============================================================================

class Config extends BaseModule {
  constructor() {
    super();
    this.configFilePath = null;
    this.runtimeConfig = null;
    this.fileConfig = null; // Store loaded file config to track what comes from file vs env
    this.isDocker = process.env.RUNNING_IN_DOCKER === 'true';
    this.dataDir = path.join(__dirname, '..', 'data');
  }

  // ==========================================================================
  // UTILITY METHODS FOR CONFIG PATHS
  // ==========================================================================

  /**
   * Get value from object using dot notation path
   */
  getValueByPath(obj, path) {
    if (!obj) return undefined;
    const keys = path.split('.');
    let value = obj;
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return undefined;
      }
    }
    return value;
  }

  /**
   * Set value in object using dot notation path
   */
  setValueByPath(obj, path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    let target = obj;

    for (const key of keys) {
      if (!target[key] || typeof target[key] !== 'object') {
        target[key] = {};
      }
      target = target[key];
    }

    target[lastKey] = value;
  }

  /**
   * Delete value from object using dot notation path
   */
  deleteValueByPath(obj, path) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    let target = obj;

    for (const key of keys) {
      if (!target[key] || typeof target[key] !== 'object') {
        return;
      }
      target = target[key];
    }

    delete target[lastKey];
  }

  /**
   * Parse environment variable value based on type
   */
  parseEnvValue(value, type) {
    switch (type) {
      case 'int':
        return parseInt(value, 10);
      case 'boolean':
        return value === 'true';
      case 'string':
      default:
        return value;
    }
  }

  /**
   * Apply environment variables to a config object using ENV_VAR_MAP
   */
  applyEnvVars(config) {
    for (const [envVar, { path, type, enablesIntegration }] of Object.entries(ENV_VAR_MAP)) {
      if (process.env[envVar] !== undefined) {
        const value = this.parseEnvValue(process.env[envVar], type);
        this.setValueByPath(config, path, value);

        // Enable integration if this env var enables it
        if (enablesIntegration) {
          this.setValueByPath(config, enablesIntegration, true);
        }
      }
    }
    return config;
  }

  /**
   * Remove environment-based SENSITIVE values from config (for saving)
   * Only removes passwords/API keys from env, allowing other settings to be saved
   */
  removeEnvVars(config) {
    const cleaned = JSON.parse(JSON.stringify(config));

    // Only remove sensitive fields that come from environment variables
    for (const [envVar, { path }] of Object.entries(ENV_VAR_MAP)) {
      if (process.env[envVar] !== undefined && SENSITIVE_ENV_VARS.includes(envVar)) {
        this.deleteValueByPath(cleaned, path);
      }
    }

    return cleaned;
  }

  /**
   * Mask sensitive fields in config
   */
  maskSensitiveFields(config) {
    const masked = JSON.parse(JSON.stringify(config));

    for (const path of SENSITIVE_PATHS) {
      const value = this.getValueByPath(masked, path);
      if (value) {
        this.setValueByPath(masked, path, '********');
      }
    }

    return masked;
  }

  // ==========================================================================
  // DEFAULTS & ENVIRONMENT LOADING
  // ==========================================================================

  /**
   * Get hardcoded default configuration
   */
  getDefaults() {
    return {
      version: '1.0',
      // Note: demoMode is env-only (DEMO_MODE=true), not persisted to config.json
      firstRunCompleted: false,
      lastSeenVersion: null,  // Tracks which version changelog the user has seen
      server: {
        host: '0.0.0.0',
        port: 4000,
        auth: {
          enabled: false,       // Authentication disabled by default for backward compatibility
          password: '',         // Bcrypt hashed password
          sessionSecret: ''     // Generated on first run
        }
      },
      amule: {
        enabled: true,
        host: '127.0.0.1',
        port: 4712,
        password: 'admin',
        sharedFilesReloadIntervalHours: 3  // 0 = disabled, otherwise hours between auto-reloads
      },
      rtorrent: {
        enabled: false,
        host: '127.0.0.1',
        port: 8000,
        path: '/RPC2',
        username: '',
        password: ''
      },
      qbittorrent: {
        enabled: false,
        host: '127.0.0.1',
        port: 8080,
        username: 'admin',
        password: '',
        useSsl: false
      },
      directories: {
        data: 'server/data',
        logs: 'server/logs',
        geoip: 'server/data/geoip'
      },
      integrations: {
        sonarr: {
          enabled: false,
          url: '',
          apiKey: '',
          searchIntervalHours: 6
        },
        radarr: {
          enabled: false,
          url: '',
          apiKey: '',
          searchIntervalHours: 6
        },
        prowlarr: {
          enabled: false,
          url: '',
          apiKey: ''
        }
      },
      history: {
        enabled: true,
        retentionDays: 30,       // 0 = never delete, positive number = days to keep
        usernameHeader: ''      // HTTP header for username (e.g., 'X-Remote-User' for Authelia)
      },
      eventScripting: {
        enabled: false,
        scriptPath: 'scripts/custom.sh',  // Path to custom user script (for power users)
        events: {
          downloadAdded: true,
          downloadFinished: true,
          categoryChanged: true,
          fileMoved: true,
          fileDeleted: true
        },
        timeout: 30000           // Script execution timeout in milliseconds
      }
    };
  }

  /**
   * Load configuration from environment variables
   */
  getConfigFromEnv() {
    const config = this.getDefaults();
    return this.applyEnvVars(config);
  }

  // ==========================================================================
  // FILE OPERATIONS
  // ==========================================================================

  /**
   * Load configuration file
   */
  async loadConfigFile() {
    if (!this.configFilePath) {
      await this.ensureDataDirectory();
      this.configFilePath = path.join(this.dataDir, 'config.json');
    }

    try {
      const data = await fs.readFile(this.configFilePath, 'utf8');
      return JSON.parse(data);
    } catch (err) {
      if (err.code === 'ENOENT') {
        // File doesn't exist - this is expected on first run
        return null;
      }
      // File exists but is corrupted
      if (this.log) {
        this.log('⚠️  Config file exists but is invalid, falling back to environment variables');
      }
      return null;
    }
  }

  /**
   * Ensure data directory exists
   */
  async ensureDataDirectory() {
    try {
      await fs.access(this.dataDir);
    } catch (err) {
      await fs.mkdir(this.dataDir, { recursive: true });
    }
  }

  // ==========================================================================
  // CONFIG MERGING & LOADING
  // ==========================================================================

  /**
   * Merge configurations with precedence:
   * - Sensitive fields (passwords/keys): env > config.json > defaults
   * - Non-sensitive fields: config.json > env > defaults
   */
  mergeConfig(fileConfig, envConfig, defaults) {
    // Start with defaults
    const merged = JSON.parse(JSON.stringify(defaults));

    // Apply environment variables
    this.applyEnvVars(merged);

    // Override with config file (highest priority for non-sensitive fields)
    if (fileConfig) {
      // Deep merge file config into merged config
      this.deepMerge(merged, fileConfig);
    }

    // Re-apply sensitive environment variables to ensure they always win
    for (const [envVar, { path, type }] of Object.entries(ENV_VAR_MAP)) {
      if (process.env[envVar] !== undefined && SENSITIVE_ENV_VARS.includes(envVar)) {
        const value = this.parseEnvValue(process.env[envVar], type);
        this.setValueByPath(merged, path, value);
      }
    }

    return merged;
  }

  /**
   * Deep merge source into target (mutates target)
   * Handles nested objects and arrays
   */
  deepMerge(target, source) {
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        // Nested object - recurse
        if (!target[key]) {
          target[key] = {};
        }
        this.deepMerge(target[key], source[key]);
      } else {
        // Primitive or array - direct assignment
        target[key] = source[key];
      }
    }
    return target;
  }

  /**
   * Load complete configuration with precedence handling
   */
  async loadConfig() {
    const defaults = this.getDefaults();
    const envConfig = this.getConfigFromEnv();
    const fileConfig = await this.loadConfigFile();

    // Store fileConfig for isFromEnv checks
    this.fileConfig = fileConfig;

    this.runtimeConfig = this.mergeConfig(fileConfig, envConfig, defaults);

    if (this.log) {
      if (fileConfig) {
        this.log('📄 Loaded configuration from file with environment overrides');
      } else {
        this.log('🔧 No configuration file found, using environment variables and defaults');
      }
    }

    return this.runtimeConfig;
  }

  // ==========================================================================
  // VALIDATION
  // ==========================================================================

  /**
   * Validate configuration
   */
  validateConfig(config) {
    const errors = [];

    // Validate server port
    if (!config.server?.port || config.server.port < 1 || config.server.port > 65535) {
      errors.push('Invalid server port (must be between 1 and 65535)');
    }

    // Validate auth password if auth is enabled
    if (config.server?.auth?.enabled) {
      if (!config.server.auth.password) {
        errors.push('Authentication password is required when authentication is enabled');
      } else {
        // Only validate if password is not already hashed (hashed passwords start with $2b$)
        if (!config.server.auth.password.startsWith('$2b$')) {
          const passwordValidation = validatePassword(config.server.auth.password);
          if (!passwordValidation.valid) {
            errors.push(...passwordValidation.errors);
          }
        }
      }
    }

    // At least one download client must be enabled
    const amuleEnabled = config.amule?.enabled !== false; // Default true for backward compatibility
    const rtorrentEnabled = config.rtorrent?.enabled || false;
    const qbittorrentEnabled = config.qbittorrent?.enabled || false;
    if (!amuleEnabled && !rtorrentEnabled && !qbittorrentEnabled) {
      errors.push('At least one download client (aMule, rTorrent, or qBittorrent) must be enabled');
    }

    // Validate aMule connection (only if enabled)
    if (amuleEnabled) {
      if (!config.amule?.host) {
        errors.push('aMule host is required');
      }
      if (!config.amule?.port || config.amule.port < 1 || config.amule.port > 65535) {
        errors.push('Invalid aMule port (must be between 1 and 65535)');
      }
      if (!config.amule?.password) {
        errors.push('aMule password is required');
      }
    }

    // Validate directories
    if (!config.directories?.data) {
      errors.push('Data directory is required');
    }
    if (!config.directories?.logs) {
      errors.push('Logs directory is required');
    }

    // Validate Sonarr if enabled
    if (config.integrations?.sonarr?.enabled) {
      if (!config.integrations.sonarr.url) {
        errors.push('Sonarr URL is required when Sonarr is enabled');
      }
      if (!config.integrations.sonarr.apiKey) {
        errors.push('Sonarr API key is required when Sonarr is enabled');
      }
    }

    // Validate Radarr if enabled
    if (config.integrations?.radarr?.enabled) {
      if (!config.integrations.radarr.url) {
        errors.push('Radarr URL is required when Radarr is enabled');
      }
      if (!config.integrations.radarr.apiKey) {
        errors.push('Radarr API key is required when Radarr is enabled');
      }
    }

    // Validate Prowlarr if enabled
    if (config.integrations?.prowlarr?.enabled) {
      if (!config.integrations.prowlarr.url) {
        errors.push('Prowlarr URL is required when Prowlarr is enabled');
      }
      if (!config.integrations.prowlarr.apiKey) {
        errors.push('Prowlarr API key is required when Prowlarr is enabled');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  // ==========================================================================
  // SAVING
  // ==========================================================================

  /**
   * Save configuration to file
   */
  async saveConfig(config) {
    try {
      // Validate first
      const validation = this.validateConfig(config);
      if (!validation.valid) {
        throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
      }

      // Ensure data directory exists
      await this.ensureDataDirectory();

      // Set config file path if not set
      if (!this.configFilePath) {
        this.configFilePath = path.join(this.dataDir, 'config.json');
      }

      // Generate session secret if not set
      if (!config.server.auth.sessionSecret) {
        config.server.auth.sessionSecret = crypto.randomBytes(32).toString('hex');
      }

      // Hash auth password if not already hashed
      if (config.server.auth.enabled && config.server.auth.password && !config.server.auth.password.startsWith('$2b$')) {
        config.server.auth.password = await hashPassword(config.server.auth.password);
      }

      // Don't save sensitive values (passwords/keys) that come from environment variables
      // Non-sensitive values (like enabled flags) CAN be saved to override env vars
      const configToSave = this.removeEnvVars(config);

      // Write to file
      await fs.writeFile(
        this.configFilePath,
        JSON.stringify(configToSave, null, 2),
        'utf8'
      );

      // Update runtime config (merge with defaults so sections not managed by
      // the frontend — like history — keep their default values)
      const defaults = this.getDefaults();
      const merged = JSON.parse(JSON.stringify(defaults));
      this.deepMerge(merged, config);
      this.runtimeConfig = merged;

      // Update fileConfig to reflect what's now in the file
      this.fileConfig = configToSave;

      if (this.log) {
        this.log('💾 Configuration saved successfully');
      }

      return { success: true };
    } catch (err) {
      if (this.log) {
        this.log('❌ Failed to save configuration:', err.message);
      }
      throw err;
    }
  }

  // ==========================================================================
  // CONFIGURATION ACCESS
  // ==========================================================================

  /**
   * Get current configuration
   */
  getConfig() {
    return this.runtimeConfig;
  }

  /**
   * Get current configuration with passwords masked
   */
  getMaskedConfig() {
    if (!this.runtimeConfig) {
      return null;
    }

    return this.maskSensitiveFields(this.runtimeConfig);
  }

  // ==========================================================================
  // FIRST RUN
  // ==========================================================================

  /**
   * Check if this is the first run (no config file or firstRunCompleted is false)
   */
  async isFirstRun() {
    // If SKIP_SETUP_WIZARD env var is set, never show wizard
    if (process.env.SKIP_SETUP_WIZARD === 'true') {
      return false;
    }

    const fileConfig = await this.loadConfigFile();

    // No config file = first run
    if (!fileConfig) {
      return true;
    }

    // Config file exists but firstRunCompleted is false or missing
    return !fileConfig.firstRunCompleted;
  }

  /**
   * Mark setup as complete
   */
  async markSetupComplete() {
    if (!this.runtimeConfig) {
      throw new Error('No runtime configuration loaded');
    }

    this.runtimeConfig.firstRunCompleted = true;
    await this.saveConfig(this.runtimeConfig);
  }

  // ==========================================================================
  // VERSION TRACKING
  // ==========================================================================

  /**
   * Get the last version the user has seen
   */
  getLastSeenVersion() {
    return this.runtimeConfig?.lastSeenVersion || null;
  }

  /**
   * Mark a version as seen by the user
   */
  async setLastSeenVersion(version) {
    if (!this.runtimeConfig) {
      throw new Error('No runtime configuration loaded');
    }

    this.runtimeConfig.lastSeenVersion = version;
    await this.saveConfig(this.runtimeConfig);
  }

  // ==========================================================================
  // UTILITY METHODS
  // ==========================================================================

  /**
   * Check if a value comes from environment variable
   * For sensitive fields: returns true if env var exists (env always wins)
   * For non-sensitive fields: returns true only if env var exists AND value is NOT in config.json
   */
  isFromEnv(path) {
    // Find the environment variable for this path
    const envVar = Object.entries(ENV_VAR_MAP).find(([, config]) => config.path === path)?.[0];

    // If no environment variable exists for this path, it's not from env
    if (!envVar || process.env[envVar] === undefined) {
      return false;
    }

    // For sensitive fields, env always wins - return true if env var exists
    if (SENSITIVE_ENV_VARS.includes(envVar)) {
      return true;
    }

    // For non-sensitive fields, check if config.json overrides it
    if (!this.fileConfig) {
      return true;
    }

    // Check if this value exists in the config file
    const fileValue = this.getValueByPath(this.fileConfig, path);

    // If the value is defined in config.json, it's NOT from env (config.json takes precedence)
    if (fileValue !== undefined) {
      return false;
    }

    // Environment variable exists and is not overridden by config.json
    return true;
  }

  // ==========================================================================
  // SIMPLE ACCESSORS (for backward compatibility and convenience)
  // ==========================================================================

  get DEMO_MODE() {
    return process.env.DEMO_MODE === 'true';
  }

  get PORT() {
    return this.runtimeConfig?.server?.port || 4000;
  }

  get HOST() {
    const host = this.runtimeConfig?.server?.host || '::';
    // 0.0.0.0 (IPv4-only) breaks healthchecks that resolve localhost to ::1
    // Use :: (dual-stack) for the "all interfaces" case
    return host === '0.0.0.0' ? '::' : host;
  }

  get AMULE_ENABLED() {
    return this.runtimeConfig?.amule?.enabled !== false; // Default true for backward compatibility
  }

  get AMULE_HOST() {
    return this.runtimeConfig?.amule?.host || '127.0.0.1';
  }

  get AMULE_PORT() {
    return this.runtimeConfig?.amule?.port || 4712;
  }

  get AMULE_PASSWORD() {
    return this.runtimeConfig?.amule?.password || 'admin';
  }

  get AMULE_SHARED_FILES_RELOAD_INTERVAL_HOURS() {
    // Return interval only if aMule is enabled, otherwise 0 (disabled)
    return this.runtimeConfig?.amule?.enabled !== false
      ? (this.runtimeConfig?.amule?.sharedFilesReloadIntervalHours ?? 3)
      : 0;
  }

  get SONARR_URL() {
    return this.runtimeConfig?.integrations?.sonarr?.enabled
      ? this.runtimeConfig.integrations.sonarr.url
      : null;
  }

  get SONARR_API_KEY() {
    return this.runtimeConfig?.integrations?.sonarr?.enabled
      ? this.runtimeConfig.integrations.sonarr.apiKey
      : null;
  }

  get SONARR_SEARCH_INTERVAL_HOURS() {
    return this.runtimeConfig?.integrations?.sonarr?.enabled
      ? this.runtimeConfig.integrations.sonarr.searchIntervalHours
      : 0;
  }

  get RADARR_URL() {
    return this.runtimeConfig?.integrations?.radarr?.enabled
      ? this.runtimeConfig.integrations.radarr.url
      : null;
  }

  get RADARR_API_KEY() {
    return this.runtimeConfig?.integrations?.radarr?.enabled
      ? this.runtimeConfig.integrations.radarr.apiKey
      : null;
  }

  get RADARR_SEARCH_INTERVAL_HOURS() {
    return this.runtimeConfig?.integrations?.radarr?.enabled
      ? this.runtimeConfig.integrations.radarr.searchIntervalHours
      : 0;
  }

  get PROWLARR_URL() {
    return this.runtimeConfig?.integrations?.prowlarr?.enabled
      ? this.runtimeConfig.integrations.prowlarr.url
      : null;
  }

  get PROWLARR_API_KEY() {
    return this.runtimeConfig?.integrations?.prowlarr?.enabled
      ? this.runtimeConfig.integrations.prowlarr.apiKey
      : null;
  }

  get DATA_DIR() {
    return this.runtimeConfig?.directories?.data
      ? path.resolve(this.runtimeConfig.directories.data)
      : path.join(__dirname, '..', 'data');
  }

  // ==========================================================================
  // AUTH ACCESSORS
  // ==========================================================================

  getAuthEnabled() {
    return this.runtimeConfig?.server?.auth?.enabled || false;
  }

  getAuthPassword() {
    return this.runtimeConfig?.server?.auth?.password || '';
  }

  getSessionSecret() {
    return this.runtimeConfig?.server?.auth?.sessionSecret || '';
  }

  // ==========================================================================
  // PATH HELPERS
  // ==========================================================================

  getAppRoot() {
    return path.resolve(process.cwd());
  }

  getLogDir() {
    return this.runtimeConfig?.directories?.logs
      ? path.resolve(this.runtimeConfig.directories.logs)
      : path.join(__dirname, '..', 'logs');
  }

  getDataDir() {
    return this.DATA_DIR;
  }

  getGeoIPDir() {
    return this.runtimeConfig?.directories?.geoip
      ? path.resolve(this.runtimeConfig.directories.geoip)
      : path.join(this.getDataDir(), 'geoip');
  }

  getMetricsDbPath() {
    return path.join(this.getDataDir(), 'metrics.db');
  }

  getHashDbPath() {
    return path.join(this.getDataDir(), 'hashes.db');
  }

  getHistoryDbPath() {
    return path.join(this.getDataDir(), 'history.db');
  }

  getMoveOpsDbPath() {
    return path.join(this.getDataDir(), 'move_ops.db');
  }

  getGeoIPCityDbPath() {
    return path.join(this.getGeoIPDir(), 'GeoLite2-City.mmdb');
  }

  getGeoIPCountryDbPath() {
    return path.join(this.getGeoIPDir(), 'GeoLite2-Country.mmdb');
  }

  // ==========================================================================
  // AMULE ACCESSORS
  // ==========================================================================

  /**
   * Get aMule configuration
   * @returns {Object|null} aMule config or null if not configured
   */
  getAmuleConfig() {
    return this.runtimeConfig?.amule || null;
  }

  // ==========================================================================
  // RTORRENT ACCESSORS
  // ==========================================================================

  /**
   * Get rtorrent configuration
   * @returns {Object|null} rtorrent config or null if not configured
   */
  getRtorrentConfig() {
    return this.runtimeConfig?.rtorrent || null;
  }

  // ==========================================================================
  // QBITTORRENT ACCESSORS
  // ==========================================================================

  /**
   * Get qBittorrent configuration
   * @returns {Object|null} qBittorrent config or null if not configured
   */
  getQbittorrentConfig() {
    return this.runtimeConfig?.qbittorrent || null;
  }

  get QBITTORRENT_ENABLED() {
    return this.runtimeConfig?.qbittorrent?.enabled || false;
  }

  get QBITTORRENT_HOST() {
    return this.runtimeConfig?.qbittorrent?.host || '';
  }

  get QBITTORRENT_PORT() {
    return this.runtimeConfig?.qbittorrent?.port || 8080;
  }

  get QBITTORRENT_USERNAME() {
    return this.runtimeConfig?.qbittorrent?.username || 'admin';
  }

  get QBITTORRENT_PASSWORD() {
    return this.runtimeConfig?.qbittorrent?.password || '';
  }

  get QBITTORRENT_USE_SSL() {
    return this.runtimeConfig?.qbittorrent?.useSsl || false;
  }

  get RTORRENT_ENABLED() {
    return this.runtimeConfig?.rtorrent?.enabled || false;
  }

  get RTORRENT_HOST() {
    return this.runtimeConfig?.rtorrent?.host || '';
  }

  get RTORRENT_PORT() {
    return this.runtimeConfig?.rtorrent?.port || 8000;
  }

  get RTORRENT_PATH() {
    return this.runtimeConfig?.rtorrent?.path || '/RPC2';
  }

  get RTORRENT_USERNAME() {
    return this.runtimeConfig?.rtorrent?.username || '';
  }

  get RTORRENT_PASSWORD() {
    return this.runtimeConfig?.rtorrent?.password || '';
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

const configInstance = new Config();

// Export the instance with all methods and properties
module.exports = configInstance;

// Also export constants
module.exports.AUTO_REFRESH_INTERVAL = AUTO_REFRESH_INTERVAL;
module.exports.COMMAND_TIMEOUT_MS = COMMAND_TIMEOUT_MS;
module.exports.CLEANUP_DAYS = CLEANUP_DAYS;
module.exports.CLEANUP_HOUR = CLEANUP_HOUR;
