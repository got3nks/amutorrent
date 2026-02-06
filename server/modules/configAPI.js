/**
 * Configuration API Module
 * Provides REST endpoints for configuration management
 */

const express = require('express');
const path = require('path');
const BaseModule = require('../lib/BaseModule');
const config = require('./config');
const configTester = require('../lib/configTester');
const response = require('../lib/responseFormatter');
const eventScriptingManager = require('../lib/EventScriptingManager');

// Singleton managers - imported directly instead of injected
const amuleManager = require('./amuleManager');
const rtorrentManager = require('./rtorrentManager');

class ConfigAPI extends BaseModule {
  constructor() {
    super();
    this.initializeServices = null;
  }

  setInitializeServices(fn) {
    this.initializeServices = fn;
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  /**
   * Build the _meta.fromEnv object for API responses
   * For getDefaults: checks environment variables directly
   * For getCurrent: uses config.isFromEnv() to check if value is from env and not overridden
   */
  buildFromEnvMeta(useConfigCheck = false) {
    if (useConfigCheck) {
      // For getCurrent - check if values come from env and are not overridden
      return {
        port: config.isFromEnv('server.port'),
        amuleEnabled: config.isFromEnv('amule.enabled'),
        amuleHost: config.isFromEnv('amule.host'),
        amulePort: config.isFromEnv('amule.port'),
        amuleSharedFilesReloadInterval: config.isFromEnv('amule.sharedFilesReloadIntervalHours'),
        serverAuthEnabled: config.isFromEnv('server.auth.enabled'),
        serverAuthPassword: config.isFromEnv('server.auth.password'),
        amulePassword: config.isFromEnv('amule.password'),
        rtorrentEnabled: config.isFromEnv('rtorrent.enabled'),
        rtorrentHost: config.isFromEnv('rtorrent.host'),
        rtorrentPort: config.isFromEnv('rtorrent.port'),
        rtorrentPath: config.isFromEnv('rtorrent.path'),
        rtorrentUsername: config.isFromEnv('rtorrent.username'),
        rtorrentPassword: config.isFromEnv('rtorrent.password'),
        sonarrUrl: config.isFromEnv('integrations.sonarr.url'),
        sonarrApiKey: config.isFromEnv('integrations.sonarr.apiKey'),
        sonarrSearchInterval: config.isFromEnv('integrations.sonarr.searchIntervalHours'),
        radarrUrl: config.isFromEnv('integrations.radarr.url'),
        radarrApiKey: config.isFromEnv('integrations.radarr.apiKey'),
        radarrSearchInterval: config.isFromEnv('integrations.radarr.searchIntervalHours'),
        prowlarrUrl: config.isFromEnv('integrations.prowlarr.url'),
        prowlarrApiKey: config.isFromEnv('integrations.prowlarr.apiKey')
      };
    } else {
      // For getDefaults - check environment variables directly
      return {
        port: !!process.env.PORT,
        amuleEnabled: process.env.AMULE_ENABLED !== undefined,
        amuleHost: !!process.env.AMULE_HOST,
        amulePort: !!process.env.AMULE_PORT,
        amuleSharedFilesReloadInterval: !!process.env.AMULE_SHARED_FILES_RELOAD_INTERVAL_HOURS,
        serverAuthEnabled: process.env.WEB_AUTH_ENABLED !== undefined,
        serverAuthPassword: !!process.env.WEB_AUTH_PASSWORD,
        amulePassword: !!process.env.AMULE_PASSWORD,
        rtorrentEnabled: process.env.RTORRENT_ENABLED !== undefined,
        rtorrentHost: !!process.env.RTORRENT_HOST,
        rtorrentPort: !!process.env.RTORRENT_PORT,
        rtorrentPath: !!process.env.RTORRENT_PATH,
        rtorrentUsername: !!process.env.RTORRENT_USERNAME,
        rtorrentPassword: !!process.env.RTORRENT_PASSWORD,
        sonarrUrl: !!process.env.SONARR_URL,
        sonarrApiKey: !!process.env.SONARR_API_KEY,
        sonarrSearchInterval: !!process.env.SONARR_SEARCH_INTERVAL_HOURS,
        radarrUrl: !!process.env.RADARR_URL,
        radarrApiKey: !!process.env.RADARR_API_KEY,
        radarrSearchInterval: !!process.env.RADARR_SEARCH_INTERVAL_HOURS,
        prowlarrUrl: !!process.env.PROWLARR_URL,
        prowlarrApiKey: !!process.env.PROWLARR_API_KEY
      };
    }
  }

  /**
   * Merge missing passwords from current config into new config
   * Handles the case where UI sends masked passwords ('********')
   */
  mergeMissingPasswords(newConfig, currentConfig) {
    if (!currentConfig) return;

    const passwordPaths = [
      { new: 'server.auth.password', current: 'server.auth.password' },
      { new: 'amule.password', current: 'amule.password' },
      { new: 'rtorrent.password', current: 'rtorrent.password' },
      { new: 'integrations.sonarr.apiKey', current: 'integrations.sonarr.apiKey' },
      { new: 'integrations.radarr.apiKey', current: 'integrations.radarr.apiKey' },
      { new: 'integrations.prowlarr.apiKey', current: 'integrations.prowlarr.apiKey' }
    ];

    for (const { new: newPath, current: currentPath } of passwordPaths) {
      const newValue = config.getValueByPath(newConfig, newPath);
      const currentValue = config.getValueByPath(currentConfig, currentPath);

      // If password is missing or masked, use current value
      if ((!newValue || newValue === '********') && currentValue) {
        config.setValueByPath(newConfig, newPath, currentValue);
      }
    }
  }

  /**
   * Log test result with emoji
   */
  logTestResult(name, result) {
    const success = result.success || result.available;
    const emoji = success ? '✅' : '❌';
    this.log(`${name} test: ${emoji}${result.warning ? ' ⚠️  ' + result.warning : ''}`);
  }

  // ==========================================================================
  // API ENDPOINTS
  // ==========================================================================

  /**
   * GET /api/config/status
   * Returns first-run status and Docker detection
   */
  async getStatus(req, res) {
    try {
      const firstRun = await config.isFirstRun();
      res.json({
        firstRun,
        isDocker: config.isDocker
      });
    } catch (err) {
      this.log('❌ Error checking config status:', err.message);
      response.serverError(res, 'Failed to check configuration status');
    }
  }

  /**
   * GET /api/config/current
   * Returns current configuration (passwords masked)
   */
  async getCurrent(req, res) {
    try {
      const currentConfig = config.getMaskedConfig();

      if (!currentConfig) {
        return response.notFound(res, 'No configuration loaded');
      }

      res.json({
        ...currentConfig,
        _meta: { fromEnv: this.buildFromEnvMeta(true) }
      });
    } catch (err) {
      this.log('❌ Error getting current config:', err.message);
      response.serverError(res, 'Failed to get current configuration');
    }
  }

  /**
   * GET /api/config/defaults
   * Returns default configuration with environment variable overrides
   */
  async getDefaults(req, res) {
    try {
      const envConfig = config.getConfigFromEnv();

      res.json({
        ...envConfig,
        _meta: { fromEnv: this.buildFromEnvMeta(false) }
      });
    } catch (err) {
      this.log('❌ Error getting defaults:', err.message);
      response.serverError(res, 'Failed to get default configuration');
    }
  }

  /**
   * POST /api/config/check-path
   * Check if a directory exists and has read+write permissions
   * Body: { path: string }
   * Returns: { exists: boolean, readable: boolean, writable: boolean, error?: string }
   */
  async checkPath(req, res) {
    try {
      const { path: dirPath } = req.body;

      if (!dirPath || typeof dirPath !== 'string') {
        return response.badRequest(res, 'Path is required');
      }

      const normalizedPath = path.normalize(dirPath.trim());

      // Use configTester with checkOnly option to avoid creating directories
      const testResult = await configTester.testDirectoryAccess(normalizedPath, { checkOnly: true });

      res.json({
        path: normalizedPath,
        exists: testResult.exists,
        readable: testResult.readable,
        writable: testResult.writable,
        error: testResult.error,
        isDocker: config.isDocker
      });
    } catch (err) {
      this.log('❌ Error checking path:', err.message);
      response.serverError(res, 'Failed to check path');
    }
  }

  /**
   * POST /api/config/test
   * Test configuration components
   * Body: { amule?, rtorrent?, directories?, sonarr?, radarr?, prowlarr? }
   * Note: If passwords are missing, use current config values
   */
  async testConfig(req, res) {
    try {
      const { amule, rtorrent, directories, sonarr, radarr, prowlarr } = req.body;
      const results = {};
      const currentConfig = config.getConfig();

      // Test aMule connection if provided and enabled
      if (amule && amule.enabled !== false) {
        const password = amule.password || currentConfig.amule.password;
        this.log(`🧪 Testing aMule connection to ${amule.host}:${amule.port}...`);
        results.amule = await configTester.testAmuleConnection(amule.host, amule.port, password);
        this.logTestResult('aMule connection', results.amule);
      }

      // Test rtorrent connection if provided and enabled
      if (rtorrent && rtorrent.enabled) {
        const password = rtorrent.password || currentConfig.rtorrent?.password;
        this.log(`🧪 Testing rtorrent connection to ${rtorrent.host}:${rtorrent.port}${rtorrent.path || '/RPC2'}...`);
        results.rtorrent = await configTester.testRtorrentConnection(
          rtorrent.host,
          rtorrent.port,
          rtorrent.path,
          rtorrent.username,
          password
        );
        this.logTestResult('rtorrent connection', results.rtorrent);
      }

      // Test directories if provided
      if (directories) {
        results.directories = {};

        if (directories.data) {
          this.log(`🧪 Testing data directory: ${directories.data}`);
          results.directories.data = await configTester.testDirectoryAccess(directories.data);
          this.logTestResult('Data directory', results.directories.data);
        }

        if (directories.logs) {
          this.log(`🧪 Testing logs directory: ${directories.logs}`);
          results.directories.logs = await configTester.testDirectoryAccess(directories.logs);
          this.logTestResult('Logs directory', results.directories.logs);
        }

        if (directories.geoip) {
          this.log(`🧪 Testing GeoIP database: ${directories.geoip}`);
          results.directories.geoip = await configTester.testGeoIPDatabase(directories.geoip);
          this.logTestResult('GeoIP database', results.directories.geoip);
        }
      }

      // Test Sonarr if provided and enabled
      if (sonarr && sonarr.enabled) {
        const apiKey = sonarr.apiKey || currentConfig.integrations.sonarr.apiKey;
        this.log(`🧪 Testing Sonarr API at ${sonarr.url}...`);
        results.sonarr = await configTester.testSonarrAPI(sonarr.url, apiKey);
        this.logTestResult('Sonarr API', results.sonarr);
      }

      // Test Radarr if provided and enabled
      if (radarr && radarr.enabled) {
        const apiKey = radarr.apiKey || currentConfig.integrations.radarr.apiKey;
        this.log(`🧪 Testing Radarr API at ${radarr.url}...`);
        results.radarr = await configTester.testRadarrAPI(radarr.url, apiKey);
        this.logTestResult('Radarr API', results.radarr);
      }

      // Test Prowlarr if provided and enabled
      if (prowlarr && prowlarr.enabled) {
        const apiKey = prowlarr.apiKey || currentConfig.integrations?.prowlarr?.apiKey;
        this.log(`🧪 Testing Prowlarr API at ${prowlarr.url}...`);
        results.prowlarr = await configTester.testProwlarrAPI(prowlarr.url, apiKey);
        this.logTestResult('Prowlarr API', results.prowlarr);
      }

      // Test event scripting if provided and enabled
      const { eventScripting } = req.body;
      if (eventScripting && eventScripting.enabled && eventScripting.scriptPath) {
        this.log(`🧪 Testing event script: ${eventScripting.scriptPath}...`);
        results.eventScripting = await eventScriptingManager.testScriptPath(eventScripting.scriptPath);
        this.logTestResult('Event script', results.eventScripting);
      }

      // Determine overall success
      const allPassed = Object.values(results).every(result => {
        if (typeof result === 'object' && result !== null) {
          if ('success' in result) {
            return result.success;
          }
          // For nested objects like directories
          return Object.values(result).every(subResult => subResult.success);
        }
        return true;
      });

      res.json({
        success: allPassed,
        results
      });
    } catch (err) {
      this.log('❌ Error testing config:', err.message);
      response.serverError(res, 'Failed to test configuration');
    }
  }

  /**
   * POST /api/config/test-script
   * Test if a script path is valid and executable
   * Body: { scriptPath: string }
   */
  async testScript(req, res) {
    try {
      const { scriptPath } = req.body;

      if (!scriptPath || typeof scriptPath !== 'string') {
        return response.badRequest(res, 'Script path is required');
      }

      this.log(`🧪 Testing event script: ${scriptPath}...`);
      const result = await eventScriptingManager.testScriptPath(scriptPath.trim());
      this.logTestResult('Event script', result);

      res.json(result);
    } catch (err) {
      this.log('❌ Error testing script:', err.message);
      response.serverError(res, 'Failed to test script');
    }
  }

  /**
   * POST /api/config/save
   * Save configuration
   * Body: complete configuration object
   */
  async saveConfig(req, res) {
    try {
      const newConfig = req.body;

      this.log('💾 Saving configuration...');

      // Merge with current config to fill in missing passwords
      this.mergeMissingPasswords(newConfig, config.getConfig());

      // Preserve lastSeenVersion (not sent from frontend)
      const currentLastSeenVersion = config.getLastSeenVersion();
      if (currentLastSeenVersion) {
        newConfig.lastSeenVersion = currentLastSeenVersion;
      }

      // Validate configuration
      const validation = config.validateConfig(newConfig);
      if (!validation.valid) {
        this.log('❌ Configuration validation failed:', validation.errors.join(', '));
        return response.badRequest(res, 'Invalid configuration: ' + validation.errors.join(', '));
      }

      // Check if this was first run BEFORE marking as completed
      const wasFirstRun = await config.isFirstRun();

      // Mark as completed (important for first-run)
      newConfig.firstRunCompleted = true;

      // Save configuration
      await config.saveConfig(newConfig);

      this.log('✅ Configuration saved successfully');

      // Shutdown any existing connections before reinitializing
      if (amuleManager) {
        this.log('🔄 Closing existing aMule connection...');
        try {
          await amuleManager.shutdown();
        } catch (err) {
          this.log('⚠️  Error shutting down aMule connection:', err.message);
        }
      }

      if (rtorrentManager) {
        this.log('🔄 Closing existing rtorrent connection...');
        try {
          await rtorrentManager.shutdown();
        } catch (err) {
          this.log('⚠️  Error shutting down rtorrent connection:', err.message);
        }
      }

      // Initialize services or restart connections based on context
      if (wasFirstRun && this.initializeServices) {
        // This is completing first-run setup - initialize all services now
        this.log('🎯 First-run setup completed, initializing all services...');
        try {
          await this.initializeServices();
        } catch (err) {
          this.log('⚠️  Service initialization failed:', err.message);
          // Don't fail the save if initialization fails - user can restart server
        }
      } else {
        // Settings changed after initial setup - reconnect clients
        if (amuleManager) {
          this.log('🔄 Connecting to aMule with new settings...');
          try {
            await amuleManager.startConnection();
            this.log('✅ aMule reconnected successfully');
          } catch (err) {
            this.log('⚠️  aMule reconnection failed:', err.message);
          }
        }

        if (rtorrentManager) {
          this.log('🔄 Connecting to rtorrent with new settings...');
          try {
            await rtorrentManager.startConnection();
            this.log('✅ rtorrent reconnected successfully');
          } catch (err) {
            this.log('⚠️  rtorrent reconnection failed:', err.message);
          }
        }
      }

      response.success(res, {
        message: 'Configuration saved successfully.' + (wasFirstRun ? ' Services initialized.' : ' aMule connection updated.')
      });
    } catch (err) {
      this.log('❌ Error saving config:', err.message);
      response.serverError(res, 'Failed to save configuration');
    }
  }

  /**
   * Register all configuration API routes
   */
  registerRoutes(app) {
    const router = express.Router();

    // All routes use JSON
    router.use(express.json());

    // GET /api/config/status - Check first-run status
    router.get('/status', this.getStatus.bind(this));

    // GET /api/config/current - Get current configuration (masked)
    router.get('/current', this.getCurrent.bind(this));

    // GET /api/config/defaults - Get default configuration with env overrides
    router.get('/defaults', this.getDefaults.bind(this));

    // POST /api/config/check-path - Check directory permissions
    router.post('/check-path', this.checkPath.bind(this));

    // POST /api/config/test - Test configuration components
    router.post('/test', this.testConfig.bind(this));

    // POST /api/config/test-script - Test script path
    router.post('/test-script', this.testScript.bind(this));

    // POST /api/config/save - Save configuration
    router.post('/save', this.saveConfig.bind(this));

    // Mount router
    app.use('/api/config', router);

    this.log('📡 Configuration API routes registered');
  }
}

module.exports = new ConfigAPI();
