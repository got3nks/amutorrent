/**
 * Configuration API Module
 * Provides REST endpoints for configuration management
 */

const express = require('express');
const BaseModule = require('../lib/BaseModule');
const configManager = require('./configManager');
const configTester = require('../lib/configTester');

class ConfigAPI extends BaseModule {
  constructor() {
    super();
    this.configManager = configManager;
    this.amuleManager = null;
    this.configModule = null;
    this.initializeServices = null;
  }

  /**
   * Set dependencies
   */
  setAmuleManager(manager) {
    this.amuleManager = manager;
  }

  setConfigModule(module) {
    this.configModule = module;
  }

  setInitializeServices(fn) {
    this.initializeServices = fn;
  }

  /**
   * GET /api/config/status
   * Returns first-run status and Docker detection
   */
  async getStatus(req, res) {
    try {
      const firstRun = await this.configManager.isFirstRun();
      res.json({
        firstRun,
        isDocker: this.configManager.isDocker
      });
    } catch (err) {
      this.log('❌ Error checking config status:', err.message);
      res.status(500).json({
        error: 'Failed to check configuration status',
        details: err.message
      });
    }
  }

  /**
   * GET /api/config/current
   * Returns current configuration (passwords masked)
   */
  async getCurrent(req, res) {
    try {
      const config = this.configManager.getMaskedConfig();

      if (!config) {
        return res.status(404).json({
          error: 'No configuration loaded'
        });
      }

      // Add metadata about which values come from environment
      const withEnvInfo = {
        ...config,
        _meta: {
          fromEnv: {
            port: this.configManager.isFromEnv('server.port'),
            amuleHost: this.configManager.isFromEnv('amule.host'),
            amulePort: this.configManager.isFromEnv('amule.port'),
            amulePassword: this.configManager.isFromEnv('amule.password'),
            sonarrUrl: this.configManager.isFromEnv('integrations.sonarr.url'),
            sonarrApiKey: this.configManager.isFromEnv('integrations.sonarr.apiKey'),
            sonarrSearchInterval: this.configManager.isFromEnv('integrations.sonarr.searchIntervalHours'),
            radarrUrl: this.configManager.isFromEnv('integrations.radarr.url'),
            radarrApiKey: this.configManager.isFromEnv('integrations.radarr.apiKey'),
            radarrSearchInterval: this.configManager.isFromEnv('integrations.radarr.searchIntervalHours')
          }
        }
      };

      res.json(withEnvInfo);
    } catch (err) {
      this.log('❌ Error getting current config:', err.message);
      res.status(500).json({
        error: 'Failed to get current configuration',
        details: err.message
      });
    }
  }

  /**
   * GET /api/config/defaults
   * Returns default configuration with environment variable overrides
   */
  async getDefaults(req, res) {
    try {
      const envConfig = this.configManager.getConfigFromEnv();
      res.json(envConfig);
    } catch (err) {
      this.log('❌ Error getting defaults:', err.message);
      res.status(500).json({
        error: 'Failed to get default configuration',
        details: err.message
      });
    }
  }

  /**
   * POST /api/config/test
   * Test configuration components
   * Body: { amule?, directories?, sonarr?, radarr? }
   * Note: If passwords are missing, use current config values
   */
  async testConfig(req, res) {
    try {
      const { amule, directories, sonarr, radarr } = req.body;
      const results = {};
      const currentConfig = this.configManager.getConfig();

      // Test aMule connection if provided
      if (amule) {
        // Use current password if not provided (masked in UI)
        const password = amule.password || currentConfig.amule.password;
        this.log(`🧪 Testing aMule connection to ${amule.host}:${amule.port}...`);
        results.amule = await configTester.testAmuleConnection(
          amule.host,
          amule.port,
          password
        );
        this.log(`aMule test result: ${results.amule.success ? '✅' : '❌'}`);
      }

      // Test directories if provided
      if (directories) {
        results.directories = {};

        if (directories.data) {
          this.log(`🧪 Testing data directory: ${directories.data}`);
          results.directories.data = await configTester.testDirectoryAccess(directories.data);
          this.log(`Data directory test: ${results.directories.data.success ? '✅' : '❌'}`);
        }

        if (directories.logs) {
          this.log(`🧪 Testing logs directory: ${directories.logs}`);
          results.directories.logs = await configTester.testDirectoryAccess(directories.logs);
          this.log(`Logs directory test: ${results.directories.logs.success ? '✅' : '❌'}`);
        }

        if (directories.geoip) {
          this.log(`🧪 Testing GeoIP database availability: ${directories.geoip}`);
          results.directories.geoip = await configTester.testGeoIPDatabase(directories.geoip);
          this.log(`GeoIP database test: ${results.directories.geoip.available ? '✅ Available' : '⚠️  Not available (optional)'}`);
        }
      }

      // Test Sonarr if provided and enabled
      if (sonarr && sonarr.enabled) {
        // Use current API key if not provided (masked in UI)
        const apiKey = sonarr.apiKey || currentConfig.integrations.sonarr.apiKey;
        this.log(`🧪 Testing Sonarr API at ${sonarr.url}...`);
        results.sonarr = await configTester.testSonarrAPI(
          sonarr.url,
          apiKey
        );
        this.log(`Sonarr test result: ${results.sonarr.success ? '✅' : '❌'}`);
      }

      // Test Radarr if provided and enabled
      if (radarr && radarr.enabled) {
        // Use current API key if not provided (masked in UI)
        const apiKey = radarr.apiKey || currentConfig.integrations.radarr.apiKey;
        this.log(`🧪 Testing Radarr API at ${radarr.url}...`);
        results.radarr = await configTester.testRadarrAPI(
          radarr.url,
          apiKey
        );
        this.log(`Radarr test result: ${results.radarr.success ? '✅' : '❌'}`);
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
      res.status(500).json({
        error: 'Failed to test configuration',
        details: err.message
      });
    }
  }

  /**
   * POST /api/config/save
   * Save configuration
   * Body: complete configuration object
   */
  async saveConfig(req, res) {
    try {
      const config = req.body;

      this.log('💾 Saving configuration...');

      // Merge with current config to fill in missing passwords
      const currentConfig = this.configManager.getConfig();
      if (currentConfig) {
        // If passwords are missing (not sent from UI), use current values
        if (!config.amule?.password && currentConfig.amule?.password) {
          config.amule.password = currentConfig.amule.password;
        }
        if (!config.integrations?.sonarr?.apiKey && currentConfig.integrations?.sonarr?.apiKey) {
          config.integrations.sonarr.apiKey = currentConfig.integrations.sonarr.apiKey;
        }
        if (!config.integrations?.radarr?.apiKey && currentConfig.integrations?.radarr?.apiKey) {
          config.integrations.radarr.apiKey = currentConfig.integrations.radarr.apiKey;
        }
      }

      // Validate configuration
      const validation = this.configManager.validateConfig(config);
      if (!validation.valid) {
        this.log('❌ Configuration validation failed:', validation.errors.join(', '));
        return res.status(400).json({
          success: false,
          error: 'Invalid configuration',
          errors: validation.errors
        });
      }

      // Check if this was first run BEFORE marking as completed
      const wasFirstRun = await this.configManager.isFirstRun();

      // Mark as completed (important for first-run)
      config.firstRunCompleted = true;

      // Save configuration
      await this.configManager.saveConfig(config);

      this.log('✅ Configuration saved successfully');

      // Update config module with new configuration
      if (this.configModule) {
        this.configModule.updateFromConfigManager(this.configManager);
        this.log('🔄 Configuration module updated');
      }

      // Initialize services or restart aMule connection based on context
      if (wasFirstRun && this.initializeServices) {
        // This is completing first-run setup - initialize all services now
        this.log('🎯 First-run setup completed, initializing all services...');
        try {
          await this.initializeServices();
        } catch (err) {
          this.log('⚠️  Service initialization failed:', err.message);
          // Don't fail the save if initialization fails - user can restart server
        }
      } else if (this.amuleManager && !wasFirstRun) {
        // Settings changed after initial setup - reconnect aMule immediately
        this.log('🔄 Reconnecting to aMule with new settings...');
        try {
          await this.amuleManager.shutdown();
          await this.amuleManager.startConnection();
          this.log('✅ aMule reconnected successfully');
        } catch (err) {
          this.log('⚠️  aMule reconnection failed:', err.message);
          // Don't fail the save if reconnection fails
        }
      }

      res.json({
        success: true,
        message: 'Configuration saved successfully.' + (wasFirstRun ? ' Services initialized.' : ' aMule connection updated.')
      });
    } catch (err) {
      this.log('❌ Error saving config:', err.message);
      res.status(500).json({
        success: false,
        error: 'Failed to save configuration',
        details: err.message
      });
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

    // POST /api/config/test - Test configuration components
    router.post('/test', this.testConfig.bind(this));

    // POST /api/config/save - Save configuration
    router.post('/save', this.saveConfig.bind(this));

    // Mount router
    app.use('/api/config', router);

    this.log('📡 Configuration API routes registered');
  }
}

module.exports = new ConfigAPI();
