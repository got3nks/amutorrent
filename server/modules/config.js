/**
 * Configuration Module
 * Handles configuration loading, saving, validation, and provides simple access
 * to configuration values throughout the application
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const BaseModule = require('../lib/BaseModule');
const clientMeta = require('../lib/clientMeta');
const instanceId = require('../lib/instanceId');

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
  WEB_AUTH_ADMIN_USERNAME: { path: 'server.auth.adminUsername', type: 'string' },
  TRUSTED_PROXY_ENABLED: { path: 'server.auth.trustedProxy.enabled', type: 'boolean' },
  TRUSTED_PROXY_USERNAME_HEADER: { path: 'server.auth.trustedProxy.usernameHeader', type: 'string' },
  TRUSTED_PROXY_AUTO_PROVISION: { path: 'server.auth.trustedProxy.autoProvision', type: 'boolean' },
  TRUSTED_PROXY_IPS: { path: 'server.auth.trustedProxy.trustedProxyIPs', type: 'csv' },
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
  'integrations.sonarr.apiKey',
  'integrations.radarr.apiKey',
  'integrations.prowlarr.apiKey'
];

/**
 * Environment variables that contain sensitive data (derived from ENV_VAR_MAP + SENSITIVE_PATHS).
 * These always override config.json and are never saved to file.
 */
const SENSITIVE_ENV_VARS = Object.entries(ENV_VAR_MAP)
  .filter(([, { path }]) => SENSITIVE_PATHS.includes(path))
  .map(([envVar]) => envVar);

/**
 * Env var prefix for each client type (e.g., amule → AMULE).
 * Used by _applyFlatEnvToClients to fill env-sourced client entries.
 */
const CLIENT_ENV_PREFIX = {
  amule: 'AMULE',
  rtorrent: 'RTORRENT',
  qbittorrent: 'QBITTORRENT',
  deluge: 'DELUGE',
  transmission: 'TRANSMISSION'
};

/**
 * Per-client-type field definitions for environment variables.
 * Maps env var suffix → { field (config field name), type, sensitive }.
 *
 * Format: QBITTORRENT_HOST=192.168.1.10, AMULE_PASSWORD=secret
 * Env vars bootstrap the first instance of each client type (source: 'env').
 */
const CLIENT_ENV_FIELDS = {
  amule: {
    ENABLED: { field: 'enabled', type: 'boolean' },
    HOST: { field: 'host', type: 'string' },
    PORT: { field: 'port', type: 'int' },
    PASSWORD: { field: 'password', type: 'string', sensitive: true },
    SHARED_FILES_RELOAD_INTERVAL_HOURS: { field: 'sharedFilesReloadIntervalHours', type: 'int' },
    ID: { field: 'id', type: 'string' },
    NAME: { field: 'name', type: 'string' }
  },
  rtorrent: {
    ENABLED: { field: 'enabled', type: 'boolean' },
    HOST: { field: 'host', type: 'string' },
    PORT: { field: 'port', type: 'int' },
    PATH: { field: 'path', type: 'string' },
    USERNAME: { field: 'username', type: 'string' },
    PASSWORD: { field: 'password', type: 'string', sensitive: true },
    USE_SSL: { field: 'useSsl', type: 'boolean' },
    ID: { field: 'id', type: 'string' },
    NAME: { field: 'name', type: 'string' }
  },
  qbittorrent: {
    ENABLED: { field: 'enabled', type: 'boolean' },
    HOST: { field: 'host', type: 'string' },
    PORT: { field: 'port', type: 'int' },
    USERNAME: { field: 'username', type: 'string' },
    PASSWORD: { field: 'password', type: 'string', sensitive: true },
    USE_SSL: { field: 'useSsl', type: 'boolean' },
    ID: { field: 'id', type: 'string' },
    NAME: { field: 'name', type: 'string' }
  },
  deluge: {
    ENABLED: { field: 'enabled', type: 'boolean' },
    HOST: { field: 'host', type: 'string' },
    PORT: { field: 'port', type: 'int' },
    PASSWORD: { field: 'password', type: 'string', sensitive: true },
    USE_SSL: { field: 'useSsl', type: 'boolean' },
    ID: { field: 'id', type: 'string' },
    NAME: { field: 'name', type: 'string' }
  },
  transmission: {
    ENABLED: { field: 'enabled', type: 'boolean' },
    HOST: { field: 'host', type: 'string' },
    PORT: { field: 'port', type: 'int' },
    USERNAME: { field: 'username', type: 'string' },
    PASSWORD: { field: 'password', type: 'string', sensitive: true },
    USE_SSL: { field: 'useSsl', type: 'boolean' },
    PATH: { field: 'path', type: 'string' },
    ID: { field: 'id', type: 'string' },
    NAME: { field: 'name', type: 'string' }
  }
};

/**
 * Precomputed host/port env var suffixes per client type.
 * Avoids repeated Object.entries().find() in _applyFlatEnvToClients.
 */
const CLIENT_ENV_HOST_PORT = {};
for (const [type, fields] of Object.entries(CLIENT_ENV_FIELDS)) {
  const host = Object.entries(fields).find(([, d]) => d.field === 'host');
  const port = Object.entries(fields).find(([, d]) => d.field === 'port');
  CLIENT_ENV_HOST_PORT[type] = {
    hostSuffix: host ? host[0] : null,
    portSuffix: port ? port[0] : null,
  };
}

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
    this._cachedClients = null;
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
   * Check if an environment variable is meaningfully set (not undefined or empty string)
   */
  hasEnvValue(envVar) {
    const val = process.env[envVar];
    return val !== undefined && val.trim() !== '';
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
      case 'csv':
        return value ? value.split(',').map(s => s.trim()).filter(Boolean) : [];
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
      if (this.hasEnvValue(envVar)) {
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
    // Auto-detect: mark entries as env-sourced if any field value matches an env var.
    // Done on the original config (before deep copy) so the marker propagates to
    // runtimeConfig, not just the saved file. Handles cases where the frontend
    // didn't set source:'env' (e.g. wizard with only AMULE_PASSWORD from env).
    this._detectEnvSourcedClients(config);

    const cleaned = JSON.parse(JSON.stringify(config));

    // Only remove sensitive fields that come from environment variables
    for (const [envVar, { path }] of Object.entries(ENV_VAR_MAP)) {
      if (this.hasEnvValue(envVar) && SENSITIVE_ENV_VARS.includes(envVar)) {
        this.deleteValueByPath(cleaned, path);
      }
    }

    // For env-sourced clients, strip connection fields that match the env value.
    // If the user overrode a field (value differs from env), keep it so config.json wins.
    // Identity/preference fields (id, name, enabled) are always kept.
    if (Array.isArray(cleaned.clients)) {
      const KEEP_FIELDS = new Set(['id', 'name', 'enabled']);
      for (const entry of cleaned.clients) {
        if (entry.source !== 'env') continue;
        const prefix = CLIENT_ENV_PREFIX[entry.type];
        const fields = CLIENT_ENV_FIELDS[entry.type];
        if (!prefix || !fields) continue;
        for (const [suffix, def] of Object.entries(fields)) {
          if (KEEP_FIELDS.has(def.field)) continue;
          const envVar = `${prefix}_${suffix}`;
          if (!this.hasEnvValue(envVar)) continue;
          const envValue = this.parseEnvValue(process.env[envVar], def.type);
          // Only strip if value matches env (no user override)
          if (entry[def.field] === envValue) {
            delete entry[def.field];
          }
        }
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

    // Mask sensitive fields in clients array
    if (Array.isArray(masked.clients)) {
      for (const entry of masked.clients) {
        const fields = CLIENT_ENV_FIELDS[entry.type];
        if (!fields) continue;
        for (const def of Object.values(fields)) {
          if (def.sensitive && entry[def.field]) {
            entry[def.field] = '********';
          }
        }
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
          sessionSecret: '',    // Generated on first run
          adminUsername: '',    // Admin username for migration (default: 'admin')
          trustedProxy: {
            enabled: false,
            usernameHeader: '',        // e.g. 'X-Remote-User'
            autoProvision: false,      // auto-create users from proxy header
            trustedProxyIPs: []        // empty = default private/local IPs; set to restrict further
            // defaultCapabilities: derived at runtime from ALL_CAPABILITIES
          }
        }
      },
      clients: [],
      directories: {
        data: 'server/data',
        logs: 'server/logs',
        geoip: 'server/data/geoip'
      },
      integrations: {
        amuleInstanceId: null,  // null = auto (first connected aMule instance)
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
        retentionDays: 30       // 0 = never delete, positive number = days to keep
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
   * Check if a flat env var exists for a given client type (e.g., AMULE_HOST).
   * @param {string} type - Client type ('amule', 'rtorrent', 'qbittorrent')
   * @returns {boolean} True if at least one flat env var exists for this type
   * @private
   */
  _hasEnvVarsForType(type) {
    const prefix = CLIENT_ENV_PREFIX[type];
    const fields = CLIENT_ENV_FIELDS[type];
    if (!prefix || !fields) return false;
    for (const suffix of Object.keys(fields)) {
      if (this.hasEnvValue(`${prefix}_${suffix}`)) return true;
    }
    return false;
  }

  /**
   * Mark client entries as source:'env' if any field value matches an env var.
   * Mutates the config object in-place so the marker propagates to runtimeConfig.
   * @param {object} config - Config object (mutated)
   * @private
   */
  _detectEnvSourcedClients(config) {
    if (!Array.isArray(config.clients)) return;
    for (const entry of config.clients) {
      if (entry.source === 'env') continue;
      const prefix = CLIENT_ENV_PREFIX[entry.type];
      const fields = CLIENT_ENV_FIELDS[entry.type];
      if (!prefix || !fields) continue;
      for (const [suffix, def] of Object.entries(fields)) {
        const envVar = `${prefix}_${suffix}`;
        if (!this.hasEnvValue(envVar)) continue;
        if (entry[def.field] === this.parseEnvValue(process.env[envVar], def.type)) {
          entry.source = 'env';
          break;
        }
      }
    }
  }

  /**
   * Load configuration from environment variables.
   * Returns defaults merged with env vars, including flat client sections
   * (amule, rtorrent, qbittorrent) for the SetupWizard's form fields.
   */
  getConfigFromEnv() {
    const config = this.getDefaults();
    this.applyEnvVars(config);

    // Build flat client sections from CLIENT_ENV_FIELDS for wizard consumption.
    // The wizard uses config.amule.host, config.rtorrent.port, etc.
    for (const type of clientMeta.getAllTypes()) {
      const prefix = CLIENT_ENV_PREFIX[type];
      const fields = CLIENT_ENV_FIELDS[type];
      if (!prefix || !fields) continue;

      const section = { enabled: false };
      for (const [suffix, def] of Object.entries(fields)) {
        const envVar = `${prefix}_${suffix}`;
        if (this.hasEnvValue(envVar)) {
          section[def.field] = this.parseEnvValue(process.env[envVar], def.type);
        }
      }
      config[type] = section;
    }

    return config;
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

  /**
   * Persist runtimeConfig to config.json (strips env-sensitive fields).
   * Updates this.fileConfig to match the written file.
   * @param {string} logMessage - Success message to log
   * @private
   */
  async _persistRuntimeConfig(logMessage) {
    try {
      const configToSave = this.removeEnvVars(this.runtimeConfig);
      await fs.writeFile(this.configFilePath, JSON.stringify(configToSave, null, 2), 'utf8');
      this.fileConfig = configToSave;
      if (this.log) this.log(logMessage);
    } catch (err) {
      if (this.log) this.log(`⚠️  Failed to write config.json: ${err.message}`);
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
  mergeConfig(fileConfig, defaults) {
    const merged = JSON.parse(JSON.stringify(defaults));

    if (fileConfig) {
      this.deepMerge(merged, fileConfig);
    }

    // Apply env vars in one pass with sensitivity awareness:
    // - Sensitive (passwords/keys): env always wins over config.json
    // - Non-sensitive: env fills gaps only (config.json wins when present)
    for (const [envVar, { path, type, enablesIntegration }] of Object.entries(ENV_VAR_MAP)) {
      if (!this.hasEnvValue(envVar)) continue;
      const isSensitive = SENSITIVE_ENV_VARS.includes(envVar);
      const fileValue = fileConfig ? this.getValueByPath(fileConfig, path) : undefined;
      if (isSensitive || fileValue === undefined) {
        this.setValueByPath(merged, path, this.parseEnvValue(process.env[envVar], type));
      }
      if (enablesIntegration) {
        // Only auto-enable if config.json doesn't explicitly set the enabled flag
        const fileEnabled = fileConfig ? this.getValueByPath(fileConfig, enablesIntegration) : undefined;
        if (fileEnabled === undefined) {
          this.setValueByPath(merged, enablesIntegration, true);
        }
      }
    }

    // Apply flat env vars to env-sourced client entries (e.g., AMULE_PASSWORD fills
    // the env-imported amule entry's password). Also creates new entries if env vars
    // define a client type not yet in the array.
    if (Array.isArray(merged.clients)) {
      this._applyFlatEnvToClients(merged.clients);
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
    this._cachedClients = null;
    const defaults = this.getDefaults();
    const fileConfig = await this.loadConfigFile();

    // Migrate history.usernameHeader → auth.trustedProxy
    let needsSave = false;
    if (fileConfig?.history?.usernameHeader) {
      if (!fileConfig.server) fileConfig.server = {};
      if (!fileConfig.server.auth) fileConfig.server.auth = {};
      if (!fileConfig.server.auth.trustedProxy) fileConfig.server.auth.trustedProxy = {};
      fileConfig.server.auth.trustedProxy.usernameHeader = fileConfig.history.usernameHeader;
      fileConfig.server.auth.trustedProxy.enabled = true;
      delete fileConfig.history.usernameHeader;
      needsSave = true;
    }

    // Store fileConfig for isFromEnv checks and auto-persist comparison.
    // Deep-copy so mergeConfig (which mutates arrays in-place) can't alter the original.
    this.fileConfig = fileConfig ? JSON.parse(JSON.stringify(fileConfig)) : null;

    this.runtimeConfig = this.mergeConfig(fileConfig, defaults);

    if (this.log) {
      if (fileConfig) {
        this.log('📄 Loaded configuration from file with environment overrides');
      } else {
        this.log('🔧 No configuration file found, using environment variables and defaults');
      }
      const envClients = (this.runtimeConfig.clients || []).filter(c => c.source === 'env');
      if (envClients.length > 0) {
        this.log(`🔗 ${envClients.length} client instance(s) imported from environment variables`);
      }
    }

    // Persist history.usernameHeader → trustedProxy migration
    if (needsSave && fileConfig) {
      await this._persistRuntimeConfig('🔄 Migrated config.json: history.usernameHeader → server.auth.trustedProxy');
    }

    // Auto-migrate: if file config has flat client sections but no clients array,
    // build the array and write it back
    if (fileConfig && !Array.isArray(fileConfig.clients)) {
      const clients = this._buildClientsFromFlat(this.runtimeConfig);
      if (clients.length > 0) {
        this.runtimeConfig.clients = clients;
        await this._persistRuntimeConfig(`🔄 Migrated config.json: added clients array (${clients.length} instance(s))`);
      }
    }

    // Auto-persist env-imported clients: if _applyFlatEnvToClients created new entries
    // that aren't in config.json yet, write them so they survive config edits.
    // Compare against this.fileConfig (deep copy) since mergeConfig mutates the local fileConfig.
    if (this.fileConfig) {
      const fileClients = Array.isArray(this.fileConfig.clients) ? this.fileConfig.clients : [];
      const fileEnvTypes = new Set(
        fileClients.filter(c => c.source === 'env').map(c => c.type)
      );
      const newEnvClients = (this.runtimeConfig.clients || []).filter(
        c => c.source === 'env' && !fileEnvTypes.has(c.type)
      );
      if (newEnvClients.length > 0) {
        await this._persistRuntimeConfig(`💾 Persisted ${newEnvClients.length} new env-imported client(s) to config.json`);
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

    // At least one download client must be enabled
    const hasEnabledClient = Array.isArray(config.clients) && config.clients.some(c => c.enabled !== false);
    if (!hasEnabledClient) {
      errors.push('At least one download client (aMule, rTorrent, or qBittorrent) must be enabled');
    }

    // Validate clients array entries
    if (Array.isArray(config.clients)) {
      for (const [i, entry] of config.clients.entries()) {
        const label = entry.name || `${entry.type} #${i + 1}`;
        if (entry.enabled === false) continue;
        if (!entry.host) errors.push(`${label}: host is required`);
        if (!entry.port || entry.port < 1 || entry.port > 65535) {
          errors.push(`${label}: invalid port`);
        }
        if (entry.type === 'amule' && !entry.password) {
          // Skip if password comes from env (stripped by removeEnvVars, refilled at runtime)
          if (entry.source !== 'env' || !this.hasEnvValue(`${CLIENT_ENV_PREFIX.amule}_PASSWORD`)) {
            errors.push(`${label}: password is required`);
          }
        }
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

    // Validate clients array for duplicate instance IDs (same type+host+port)
    if (Array.isArray(config.clients)) {
      const seen = new Map(); // id → entry name/label
      for (const entry of config.clients) {
        if (!entry.type || !entry.host || !entry.port) continue;
        const id = entry.id || instanceId.generateId(entry.type, entry.host, entry.port);
        if (seen.has(id)) {
          errors.push(`Duplicate client configuration: "${entry.name || entry.type}" conflicts with "${seen.get(id)}" (same type+host+port → id "${id}")`);
        } else {
          seen.set(id, entry.name || `${entry.type}@${entry.host}:${entry.port}`);
        }
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
  async saveConfig(inputConfig) {
    try {
      const config = JSON.parse(JSON.stringify(inputConfig));
      this._cachedClients = null;

      // Normalize clients array (generate missing id/name/color fields)
      if (Array.isArray(config.clients)) {
        config.clients = this._normalizeClientsArray(config.clients);
      }

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
  // MULTI-INSTANCE CLIENT CONFIG
  // ==========================================================================

  /**
   * Get normalized array of client configurations.
   * Supports both new `clients` array format and legacy flat sections.
   * @returns {Array} Array of client config objects with unified shape:
   *   { id, type, name, color, enabled, ...typeSpecificFields }
   */
  getClientConfigs() {
    if (!this.runtimeConfig) return [];
    if (this._cachedClients) return this._cachedClients;

    if (Array.isArray(this.runtimeConfig.clients)) {
      this._cachedClients = this._normalizeClientsArray(this.runtimeConfig.clients);
      return this._cachedClients;
    }

    return [];
  }

  /**
   * Get a single client config by instance ID.
   * @param {string} instanceId - The instance ID (e.g. 'amule-127.0.0.1-4712')
   * @returns {Object|null} Client config or null if not found
   */
  getClientConfig(instanceId) {
    return this.getClientConfigs().find(c => c.id === instanceId) || null;
  }

  /**
   * Get client environment field definitions (for password merging etc.)
   * @returns {Object} Map of type → { suffix → { field, type, sensitive } }
   */
  getClientEnvFields() {
    return CLIENT_ENV_FIELDS;
  }

  /**
   * Build clients array from legacy flat config sections.
   * @param {Object} config - Runtime config object
   * @returns {Array} Array of client config objects
   * @private
   */
  _buildClientsFromFlat(config) {
    const clients = [];
    for (const type of clientMeta.getAllTypes()) {
      const section = config[type];
      if (!section) continue;

      const { enabled, ...typeFields } = section;

      // Fill in missing fields from flat environment variables
      // (e.g., AMULE_PASSWORD env var when config.json only has host/port)
      const prefix = CLIENT_ENV_PREFIX[type];
      if (prefix) {
        const fields = CLIENT_ENV_FIELDS[type];
        for (const [suffix, def] of Object.entries(fields)) {
          const envVar = `${prefix}_${suffix}`;
          if (typeFields[def.field] === undefined && this.hasEnvValue(envVar)) {
            typeFields[def.field] = this.parseEnvValue(process.env[envVar], def.type);
          }
        }
      }

      // Mark as env-sourced if any env var contributed to this entry
      const isFromEnv = this._hasEnvVarsForType(type);
      const generatedId = instanceId.generateId(type, typeFields.host || section.host, typeFields.port || section.port);

      clients.push({
        id: generatedId,
        type,
        name: isFromEnv ? `${clientMeta.getDisplayName(type)} (env)` : clientMeta.getDisplayName(type),
        color: null,
        enabled: enabled !== false,
        ...(isFromEnv ? { source: 'env' } : {}),
        ...typeFields
      });
    }
    return clients;
  }

  /**
   * Apply flat environment variables to the clients array.
   *
   * For each client type with flat env vars set:
   * 1. Find the entry marked `source: 'env'` — fill in fields (sensitive always from env,
   *    non-sensitive only if missing from config.json)
   * 2. If no `source: 'env'` entry exists but env vars define a viable client (host+port),
   *    create a new entry with `source: 'env'`
   *
   * @param {Array} clients - Clients array to mutate (entries may be added)
   * @private
   */
  _applyFlatEnvToClients(clients) {
    for (const type of clientMeta.getAllTypes()) {
      if (!this._hasEnvVarsForType(type)) continue;

      const prefix = CLIENT_ENV_PREFIX[type];
      const fields = CLIENT_ENV_FIELDS[type];
      if (!prefix || !fields) continue;

      // Find ALL existing env-sourced entries for this type
      let entries = clients.filter(c => c.type === type && c.source === 'env');

      if (entries.length === 0) {
        // No env-sourced entry — create one if env vars define at least host
        const { hostSuffix, portSuffix } = CLIENT_ENV_HOST_PORT[type];
        const hostEnvVar = `${prefix}_${hostSuffix}`;
        if (!hostSuffix || !this.hasEnvValue(hostEnvVar)) continue; // No host in env — skip this type
        const envHost = process.env[hostEnvVar];

        const envPort = portSuffix && this.hasEnvValue(`${prefix}_${portSuffix}`) ? process.env[`${prefix}_${portSuffix}`] : undefined;
        const entry = {
          type,
          source: 'env',
          id: instanceId.generateId(type, envHost, envPort || 0),
          name: `${clientMeta.getDisplayName(type)} (env)`,
          color: null,
          enabled: true
        };
        clients.push(entry);
        entries = [entry];
      }

      // Fill fields from env vars for each env-sourced entry
      for (const entry of entries) {
        for (const [suffix, def] of Object.entries(fields)) {
          const envVar = `${prefix}_${suffix}`;
          if (!this.hasEnvValue(envVar)) continue;
          const envValue = this.parseEnvValue(process.env[envVar], def.type);

          if (def.sensitive) {
            // Sensitive fields: env always wins
            entry[def.field] = envValue;
          } else if (entry[def.field] === undefined) {
            // Non-sensitive fields: env fills gaps only (config.json wins)
            entry[def.field] = envValue;
          }
        }
      }
    }
  }

  /**
   * Normalize a clients array from config.json.
   * Validates types, generates missing IDs, fills in defaults.
   * @param {Array} clients - Raw clients array from config
   * @returns {Array} Normalized array of client config objects
   * @private
   */
  _normalizeClientsArray(clients) {
    const allTypes = clientMeta.getAllTypes();
    return clients
      .filter(entry => {
        if (!entry.type || !allTypes.includes(entry.type)) {
          if (this.log) {
            this.log(`⚠️  Skipping client entry with invalid type: "${entry.type}"`);
          }
          return false;
        }
        return true;
      })
      .map(entry => {
        const { id, type, name, color, enabled, source, ...rest } = entry;
        let resolvedId = instanceId.resolveId(entry);
        const validation = instanceId.validateId(resolvedId);
        if (!validation.valid) {
          if (this.log) {
            this.log(`⚠️  ${validation.error}, falling back to generated ID`);
          }
          resolvedId = instanceId.generateId(type, rest.host, rest.port);
        }
        // Strip legacy env- prefix from env-sourced clients
        if (source === 'env' && resolvedId.startsWith('env-')) {
          resolvedId = resolvedId.slice(4);
        }
        const result = {
          id: resolvedId,
          type,
          name: name ?? (source === 'env' ? `${clientMeta.getDisplayName(type)} (env)` : clientMeta.getDisplayName(type)),
          color: color ?? null,
          enabled: enabled !== false,
          ...rest
        };
        if (source) result.source = source;
        return result;
      });
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

    if (envVar && this.hasEnvValue(envVar)) {
      // For sensitive fields, env always wins - return true if env var exists
      if (SENSITIVE_ENV_VARS.includes(envVar)) {
        return true;
      }

      // For non-sensitive fields, check if config.json overrides it
      if (!this.fileConfig) {
        return true;
      }
      const fileValue = this.getValueByPath(this.fileConfig, path);
      return fileValue === undefined;
    }

    // Check client field paths (e.g., 'amule.password' → AMULE_PASSWORD or AMULE_1_PASSWORD)
    const dotIdx = path.indexOf('.');
    if (dotIdx > 0) {
      const type = path.substring(0, dotIdx);
      const field = path.substring(dotIdx + 1);
      const prefix = CLIENT_ENV_PREFIX[type];
      const fields = CLIENT_ENV_FIELDS[type];
      if (prefix && fields) {
        for (const [suffix, def] of Object.entries(fields)) {
          if (def.field !== field) continue;

          // Check flat env var (e.g., AMULE_PASSWORD)
          const flatEnvVar = `${prefix}_${suffix}`;
          if (this.hasEnvValue(flatEnvVar)) {
            // "From env" only if config.json doesn't have this field for this client
            if (!this.fileConfig) return true;
            if (!Array.isArray(this.fileConfig.clients)) return true;
            const fileEntry = this.fileConfig.clients.find(c => c.type === type && c.source === 'env');
            return !fileEntry || fileEntry[def.field] === undefined;
          }

          break;
        }
      }
    }

    return false;
  }

  /**
   * Annotate client entries with per-instance _fromEnv metadata.
   * For each env-sourced client, marks which fields come from environment
   * variables vs config.json overrides, using the client's own fileConfig entry.
   */
  annotateClientsFromEnv(clients) {
    if (!Array.isArray(clients)) return;
    for (const client of clients) {
      if (client.source !== 'env') continue;
      const prefix = CLIENT_ENV_PREFIX[client.type];
      const fields = CLIENT_ENV_FIELDS[client.type];
      if (!prefix || !fields) continue;
      // Find THIS client's entry in fileConfig by id (not by type)
      const fileEntry = this.fileConfig?.clients?.find(c => c.id === client.id);
      const fromEnv = {};
      for (const [suffix, def] of Object.entries(fields)) {
        const envVar = `${prefix}_${suffix}`;
        if (!this.hasEnvValue(envVar)) {
          fromEnv[def.field] = false;
          continue;
        }
        // Sensitive fields from env always win
        if (def.sensitive) {
          fromEnv[def.field] = true;
          continue;
        }
        // "From env" if fileConfig doesn't have this field for this specific instance
        fromEnv[def.field] = !fileEntry || fileEntry[def.field] === undefined;
      }
      client._fromEnv = fromEnv;
    }
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

  /**
   * Ensure a session secret exists at runtime.
   * If none is configured, generate a cryptographically secure random secret.
   * This prevents falling back to a hardcoded string.
   * @returns {string} The session secret (existing or newly generated)
   */
  ensureSessionSecret() {
    let secret = this.getSessionSecret();
    if (!secret) {
      secret = crypto.randomBytes(32).toString('hex');
      if (!this.runtimeConfig.server) this.runtimeConfig.server = {};
      if (!this.runtimeConfig.server.auth) this.runtimeConfig.server.auth = {};
      this.runtimeConfig.server.auth.sessionSecret = secret;
      if (this.log) {
        this.log('⚠️  No session secret configured — generated random secret for this session');
      }
    }
    return secret;
  }

  getTrustedProxyConfig() {
    return this.runtimeConfig?.server?.auth?.trustedProxy || {};
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
    return this.runtimeConfig?.directories?.data
      ? path.resolve(this.runtimeConfig.directories.data)
      : path.join(__dirname, '..', 'data');
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

  getUserDbPath() {
    return path.join(this.getDataDir(), 'users.db');
  }

  getGeoIPCityDbPath() {
    return path.join(this.getGeoIPDir(), 'GeoLite2-City.mmdb');
  }

  getGeoIPCountryDbPath() {
    return path.join(this.getGeoIPDir(), 'GeoLite2-Country.mmdb');
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
