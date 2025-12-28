/**
 * Configuration Manager Module
 * Handles configuration loading, saving, and validation with support for
 * environment variables, config file, and hardcoded defaults
 */

const fs = require('fs').promises;
const path = require('path');
const BaseModule = require('../lib/BaseModule');

class ConfigManager extends BaseModule {
  constructor() {
    super();
    // Config file path will be set after data directory is determined
    this.configFilePath = null;
    this.runtimeConfig = null;
    this.fileConfig = null; // Store loaded file config to track what comes from file vs env
    this.isDocker = process.env.RUNNING_IN_DOCKER === 'true';
    this.dataDir = path.join(__dirname, '..', 'data');
  }

  /**
   * Get hardcoded default configuration
   */
  getDefaults() {
    return {
      version: '1.0',
      firstRunCompleted: false,
      server: {
        port: 4000
      },
      amule: {
        host: '127.0.0.1',
        port: 4712,
        password: 'admin'
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
        }
      }
    };
  }

  /**
   * Load configuration from environment variables
   */
  getConfigFromEnv() {
    const config = this.getDefaults();

    // Server
    if (process.env.PORT) {
      config.server.port = parseInt(process.env.PORT, 10);
    }

    // aMule
    if (process.env.AMULE_HOST) {
      config.amule.host = process.env.AMULE_HOST;
    }
    if (process.env.AMULE_PORT) {
      config.amule.port = parseInt(process.env.AMULE_PORT, 10);
    }
    if (process.env.AMULE_PASSWORD) {
      config.amule.password = process.env.AMULE_PASSWORD;
    }

    // Sonarr
    if (process.env.SONARR_URL) {
      config.integrations.sonarr.enabled = true;
      config.integrations.sonarr.url = process.env.SONARR_URL;
    }
    if (process.env.SONARR_API_KEY) {
      config.integrations.sonarr.apiKey = process.env.SONARR_API_KEY;
    }
    if (process.env.SONARR_SEARCH_INTERVAL_HOURS) {
      config.integrations.sonarr.searchIntervalHours = parseInt(process.env.SONARR_SEARCH_INTERVAL_HOURS, 10);
    }

    // Radarr
    if (process.env.RADARR_URL) {
      config.integrations.radarr.enabled = true;
      config.integrations.radarr.url = process.env.RADARR_URL;
    }
    if (process.env.RADARR_API_KEY) {
      config.integrations.radarr.apiKey = process.env.RADARR_API_KEY;
    }
    if (process.env.RADARR_SEARCH_INTERVAL_HOURS) {
      config.integrations.radarr.searchIntervalHours = parseInt(process.env.RADARR_SEARCH_INTERVAL_HOURS, 10);
    }

    return config;
  }

  /**
   * Load configuration file
   */
  async loadConfigFile() {
    if (!this.configFilePath) {
      // Set config file path
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
   * Merge configurations with precedence: config.json > env > defaults
   * User-saved configuration (config.json) has highest priority
   */
  mergeConfig(fileConfig, envConfig, defaults) {
    const merged = JSON.parse(JSON.stringify(defaults));

    // First, apply environment variables as fallback
    if (envConfig.server.port !== defaults.server.port) {
      merged.server.port = envConfig.server.port;
    }
    if (envConfig.amule.host !== defaults.amule.host) {
      merged.amule.host = envConfig.amule.host;
    }
    if (envConfig.amule.port !== defaults.amule.port) {
      merged.amule.port = envConfig.amule.port;
    }
    if (process.env.AMULE_PASSWORD) {
      merged.amule.password = process.env.AMULE_PASSWORD;
    }

    // Sonarr env vars
    if (process.env.SONARR_URL) {
      merged.integrations.sonarr.enabled = true;
      merged.integrations.sonarr.url = process.env.SONARR_URL;
    }
    if (process.env.SONARR_API_KEY) {
      merged.integrations.sonarr.apiKey = process.env.SONARR_API_KEY;
    }
    if (process.env.SONARR_SEARCH_INTERVAL_HOURS) {
      merged.integrations.sonarr.searchIntervalHours = parseInt(process.env.SONARR_SEARCH_INTERVAL_HOURS, 10);
    }

    // Radarr env vars
    if (process.env.RADARR_URL) {
      merged.integrations.radarr.enabled = true;
      merged.integrations.radarr.url = process.env.RADARR_URL;
    }
    if (process.env.RADARR_API_KEY) {
      merged.integrations.radarr.apiKey = process.env.RADARR_API_KEY;
    }
    if (process.env.RADARR_SEARCH_INTERVAL_HOURS) {
      merged.integrations.radarr.searchIntervalHours = parseInt(process.env.RADARR_SEARCH_INTERVAL_HOURS, 10);
    }

    // Then, override with config file (highest priority)
    if (fileConfig) {
      // Server
      if (fileConfig.server?.port !== undefined) {
        merged.server.port = fileConfig.server.port;
      }

      // aMule
      if (fileConfig.amule?.host !== undefined) {
        merged.amule.host = fileConfig.amule.host;
      }
      if (fileConfig.amule?.port !== undefined) {
        merged.amule.port = fileConfig.amule.port;
      }
      if (fileConfig.amule?.password !== undefined) {
        merged.amule.password = fileConfig.amule.password;
      }

      // Directories
      if (fileConfig.directories?.data !== undefined) {
        merged.directories.data = fileConfig.directories.data;
      }
      if (fileConfig.directories?.logs !== undefined) {
        merged.directories.logs = fileConfig.directories.logs;
      }
      if (fileConfig.directories?.geoip !== undefined) {
        merged.directories.geoip = fileConfig.directories.geoip;
      }

      // Sonarr
      if (fileConfig.integrations?.sonarr) {
        merged.integrations.sonarr = { ...merged.integrations.sonarr, ...fileConfig.integrations.sonarr };
      }

      // Radarr
      if (fileConfig.integrations?.radarr) {
        merged.integrations.radarr = { ...merged.integrations.radarr, ...fileConfig.integrations.radarr };
      }

      // First run flag
      if (typeof fileConfig.firstRunCompleted === 'boolean') {
        merged.firstRunCompleted = fileConfig.firstRunCompleted;
      }
    }

    return merged;
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

  /**
   * Validate configuration
   */
  validateConfig(config) {
    const errors = [];

    // Validate server port
    if (!config.server?.port || config.server.port < 1 || config.server.port > 65535) {
      errors.push('Invalid server port (must be between 1 and 65535)');
    }

    // Validate aMule connection
    if (!config.amule?.host) {
      errors.push('aMule host is required');
    }
    if (!config.amule?.port || config.amule.port < 1 || config.amule.port > 65535) {
      errors.push('Invalid aMule port (must be between 1 and 65535)');
    }
    if (!config.amule?.password) {
      errors.push('aMule password is required');
    }

    // Validate directories
    if (!config.directories?.data) {
      errors.push('Data directory is required');
    }
    if (!config.directories?.logs) {
      errors.push('Logs directory is required');
    }
    // GeoIP directory is optional - no validation error if missing

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

    return {
      valid: errors.length === 0,
      errors
    };
  }

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

      // Don't save passwords if they come from environment variables (security)
      const configToSave = JSON.parse(JSON.stringify(config));
      if (process.env.AMULE_PASSWORD) {
        delete configToSave.amule.password;
      }
      if (process.env.SONARR_API_KEY) {
        delete configToSave.integrations.sonarr.apiKey;
      }
      if (process.env.RADARR_API_KEY) {
        delete configToSave.integrations.radarr.apiKey;
      }

      // Write to file
      await fs.writeFile(
        this.configFilePath,
        JSON.stringify(configToSave, null, 2),
        'utf8'
      );

      // Update runtime config
      this.runtimeConfig = config;

      // Update fileConfig to reflect what's now in the file
      // This ensures isFromEnv() checks are accurate after save
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

  /**
   * Get current configuration (with passwords masked for security)
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

    const masked = JSON.parse(JSON.stringify(this.runtimeConfig));

    // Mask passwords
    if (masked.amule?.password) {
      masked.amule.password = '********';
    }
    if (masked.integrations?.sonarr?.apiKey) {
      masked.integrations.sonarr.apiKey = '********';
    }
    if (masked.integrations?.radarr?.apiKey) {
      masked.integrations.radarr.apiKey = '********';
    }

    return masked;
  }

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
   * Check if a value comes from environment variable
   * Returns true only if:
   * 1. Environment variable exists
   * 2. AND the value is NOT overridden in config.json
   */
  isFromEnv(path) {
    const envVars = {
      'server.port': 'PORT',
      'amule.host': 'AMULE_HOST',
      'amule.port': 'AMULE_PORT',
      'amule.password': 'AMULE_PASSWORD',
      'integrations.sonarr.url': 'SONARR_URL',
      'integrations.sonarr.apiKey': 'SONARR_API_KEY',
      'integrations.sonarr.searchIntervalHours': 'SONARR_SEARCH_INTERVAL_HOURS',
      'integrations.radarr.url': 'RADARR_URL',
      'integrations.radarr.apiKey': 'RADARR_API_KEY',
      'integrations.radarr.searchIntervalHours': 'RADARR_SEARCH_INTERVAL_HOURS'
    };

    const envVar = envVars[path];

    // If no environment variable exists for this path, it's not from env
    if (!envVar || typeof process.env[envVar] === 'undefined') {
      return false;
    }

    // If no config file exists, and env var exists, it's from env
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
}

module.exports = new ConfigManager();
