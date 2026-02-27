/**
 * Configuration API Module
 * Provides REST endpoints for configuration management
 */

const express = require('express');
const os = require('os');
const path = require('path');
const BaseModule = require('../lib/BaseModule');
const config = require('./config');
const configTester = require('../lib/configTester');
const response = require('../lib/responseFormatter');
const eventScriptingManager = require('../lib/EventScriptingManager');
const { requireCapability, requireAdmin } = require('../middleware/capabilities');

// Client registry - replaces direct singleton manager imports
const registry = require('../lib/ClientRegistry');

class ConfigAPI extends BaseModule {
  constructor() {
    super();
    this.initializeServices = null;
    this.reinitializeClients = null;
  }

  setInitializeServices(fn) {
    this.initializeServices = fn;
  }

  setReinitializeClients(fn) {
    this.reinitializeClients = fn;
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  /**
   * Build the _meta.fromEnv object for API responses
   * For getDefaults: checks environment variables directly
   * For getCurrent: uses config.isFromEnv() to check if value is from env and not overridden
   */
  buildFromEnvMeta() {
    // Uses config.isFromEnv() which handles flat client env vars (AMULE_PASSWORD)
    // plus server/integration vars from ENV_VAR_MAP
    return {
      host: config.isFromEnv('server.host'),
      port: config.isFromEnv('server.port'),
      serverAuthEnabled: config.isFromEnv('server.auth.enabled'),
      serverAuthPassword: config.isFromEnv('server.auth.password'),
      serverAuthAdminUsername: config.isFromEnv('server.auth.adminUsername'),
      amuleEnabled: config.isFromEnv('amule.enabled'),
      amuleHost: config.isFromEnv('amule.host'),
      amulePort: config.isFromEnv('amule.port'),
      amulePassword: config.isFromEnv('amule.password'),
      amuleSharedFilesReloadInterval: config.isFromEnv('amule.sharedFilesReloadIntervalHours'),
      rtorrentEnabled: config.isFromEnv('rtorrent.enabled'),
      rtorrentHost: config.isFromEnv('rtorrent.host'),
      rtorrentPort: config.isFromEnv('rtorrent.port'),
      rtorrentPath: config.isFromEnv('rtorrent.path'),
      rtorrentUsername: config.isFromEnv('rtorrent.username'),
      rtorrentPassword: config.isFromEnv('rtorrent.password'),
      qbittorrentEnabled: config.isFromEnv('qbittorrent.enabled'),
      qbittorrentHost: config.isFromEnv('qbittorrent.host'),
      qbittorrentPort: config.isFromEnv('qbittorrent.port'),
      qbittorrentUsername: config.isFromEnv('qbittorrent.username'),
      qbittorrentPassword: config.isFromEnv('qbittorrent.password'),
      qbittorrentUseSsl: config.isFromEnv('qbittorrent.useSsl'),
      delugeEnabled: config.isFromEnv('deluge.enabled'),
      delugeHost: config.isFromEnv('deluge.host'),
      delugePort: config.isFromEnv('deluge.port'),
      delugePassword: config.isFromEnv('deluge.password'),
      delugeUseSsl: config.isFromEnv('deluge.useSsl'),
      transmissionEnabled: config.isFromEnv('transmission.enabled'),
      transmissionHost: config.isFromEnv('transmission.host'),
      transmissionPort: config.isFromEnv('transmission.port'),
      transmissionUsername: config.isFromEnv('transmission.username'),
      transmissionPassword: config.isFromEnv('transmission.password'),
      transmissionUseSsl: config.isFromEnv('transmission.useSsl'),
      transmissionPath: config.isFromEnv('transmission.path'),
      sonarrUrl: config.isFromEnv('integrations.sonarr.url'),
      sonarrApiKey: config.isFromEnv('integrations.sonarr.apiKey'),
      sonarrSearchInterval: config.isFromEnv('integrations.sonarr.searchIntervalHours'),
      radarrUrl: config.isFromEnv('integrations.radarr.url'),
      radarrApiKey: config.isFromEnv('integrations.radarr.apiKey'),
      radarrSearchInterval: config.isFromEnv('integrations.radarr.searchIntervalHours'),
      prowlarrUrl: config.isFromEnv('integrations.prowlarr.url'),
      prowlarrApiKey: config.isFromEnv('integrations.prowlarr.apiKey')
    };
  }

  /**
   * Merge missing passwords from current config into new config
   * Handles the case where UI sends masked passwords ('********')
   */
  mergeMissingPasswords(newConfig, currentConfig) {
    if (!currentConfig) return;

    const passwordPaths = [
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

    // Merge masked passwords in clients array
    if (Array.isArray(newConfig.clients) && Array.isArray(currentConfig.clients)) {
      const indexedFields = config.getClientEnvFields();
      for (const newEntry of newConfig.clients) {
        // Match by id, or by type+host+port for new entries without id
        const currentEntry = currentConfig.clients.find(c => c.id && c.id === newEntry.id)
          || currentConfig.clients.find(c => c.type === newEntry.type && c.host === newEntry.host && c.port === newEntry.port);
        if (!currentEntry) continue;
        const fields = indexedFields?.[newEntry.type];
        if (!fields) continue;
        for (const def of Object.values(fields)) {
          if (def.sensitive && (!newEntry[def.field] || newEntry[def.field] === '********') && currentEntry[def.field]) {
            newEntry[def.field] = currentEntry[def.field];
          }
        }
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
   * GET /api/config/interfaces
   * Returns available network interfaces for bind address selection
   */
  async getInterfaces(req, res) {
    try {
      const interfaces = os.networkInterfaces();
      const result = [
        { value: '0.0.0.0', label: 'All Interfaces (0.0.0.0)' }
      ];

      for (const [name, addrs] of Object.entries(interfaces)) {
        for (const addr of addrs) {
          if (addr.family === 'IPv4' && !addr.internal) {
            result.push({ value: addr.address, label: `${name} (${addr.address})` });
          }
        }
      }

      // Add loopback last
      result.push({ value: '127.0.0.1', label: 'Loopback (127.0.0.1)' });

      res.json(result);
    } catch (err) {
      this.log('❌ Error getting network interfaces:', err.message);
      response.serverError(res, 'Failed to get network interfaces');
    }
  }

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

      // Annotate each client entry with per-instance _fromEnv metadata
      if (Array.isArray(currentConfig.clients)) {
        config.annotateClientsFromEnv(currentConfig.clients);
      }

      res.json({
        ...currentConfig,
        _meta: { fromEnv: this.buildFromEnvMeta() }
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
        _meta: { fromEnv: this.buildFromEnvMeta() }
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
        const password = amule.password || (amule.instanceId ? config.getClientConfig(amule.instanceId)?.password : null);
        this.log(`🧪 Testing aMule connection to ${amule.host}:${amule.port}...`);
        results.amule = await configTester.testAmuleConnection(amule.host, amule.port, password);
        this.logTestResult('aMule connection', results.amule);
      }

      // Test rtorrent connection if provided and enabled
      if (rtorrent && rtorrent.enabled) {
        const password = rtorrent.password || (rtorrent.instanceId ? config.getClientConfig(rtorrent.instanceId)?.password : null);
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

      // Test qBittorrent connection if provided and enabled
      const { qbittorrent } = req.body;
      if (qbittorrent && qbittorrent.enabled) {
        const password = qbittorrent.password || (qbittorrent.instanceId ? config.getClientConfig(qbittorrent.instanceId)?.password : null);
        this.log(`🧪 Testing qBittorrent connection to ${qbittorrent.host}:${qbittorrent.port}...`);
        results.qbittorrent = await configTester.testQbittorrentConnection(
          qbittorrent.host,
          qbittorrent.port,
          qbittorrent.username,
          password,
          qbittorrent.useSsl
        );
        this.logTestResult('qBittorrent connection', results.qbittorrent);
      }

      // Test Deluge connection if provided and enabled
      const { deluge } = req.body;
      if (deluge && deluge.enabled) {
        const password = deluge.password || (deluge.instanceId ? config.getClientConfig(deluge.instanceId)?.password : null);
        this.log(`🧪 Testing Deluge connection to ${deluge.host}:${deluge.port}...`);
        results.deluge = await configTester.testDelugeConnection(deluge.host, deluge.port, password, deluge.useSsl);
        this.logTestResult('Deluge connection', results.deluge);
      }

      // Test Transmission connection if provided and enabled
      const { transmission } = req.body;
      if (transmission && transmission.enabled) {
        const password = transmission.password || (transmission.instanceId ? config.getClientConfig(transmission.instanceId)?.password : null);
        const username = transmission.username || (transmission.instanceId ? config.getClientConfig(transmission.instanceId)?.username : null);
        this.log(`🧪 Testing Transmission connection to ${transmission.host}:${transmission.port}...`);
        results.transmission = await configTester.testTransmissionConnection(transmission.host, transmission.port, username, password, transmission.useSsl, transmission.path);
        this.logTestResult('Transmission connection', results.transmission);
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

      // Prevent enabling auth without at least one admin account
      const enablingAuth = newConfig.server?.auth?.enabled === true;
      if (enablingAuth && this.userManager) {
        const admins = this.userManager.listUsers().filter(u => u.isAdmin && !u.disabled);
        if (admins.length === 0) {
          this.log('❌ Cannot enable authentication: no admin accounts exist');
          return response.badRequest(res, 'Cannot enable authentication without an admin account. Create at least one admin user in the User Management section first.');
        }
      }

      // Check if this was first run BEFORE marking as completed
      const wasFirstRun = await config.isFirstRun();

      // Mark as completed (important for first-run)
      newConfig.firstRunCompleted = true;

      // Save configuration
      await config.saveConfig(newConfig);

      this.log('✅ Configuration saved successfully');

      // Shutdown all existing connections before reinitializing
      for (const mgr of registry.getAll()) {
        this.log(`🔄 Closing existing ${mgr.displayName} connection (${mgr.instanceId})...`);
        try {
          await mgr.shutdown();
        } catch (err) {
          this.log(`⚠️  Error shutting down ${mgr.instanceId}:`, err.message);
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
      } else if (this.reinitializeClients) {
        // Settings changed — reinitialize all client connections
        // (handles add/remove/change of instances)
        try {
          await this.reinitializeClients();
          this.log('✅ Client connections reinitialized successfully');
        } catch (err) {
          this.log('⚠️  Client reinitialization failed:', err.message);
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

    // Read-only config routes — admin only (settings is not a capability, it's admin-only)
    router.get('/current', requireAdmin, this.getCurrent.bind(this));
    router.get('/defaults', requireAdmin, this.getDefaults.bind(this));

    // Admin-only config routes
    router.get('/interfaces', requireAdmin, this.getInterfaces.bind(this));
    router.get('/status', requireAdmin, this.getStatus.bind(this));
    router.post('/check-path', requireAdmin, this.checkPath.bind(this));
    router.post('/test', requireAdmin, this.testConfig.bind(this));
    router.post('/test-script', requireAdmin, this.testScript.bind(this));
    router.post('/save', requireAdmin, this.saveConfig.bind(this));

    // Mount router
    app.use('/api/config', router);

    this.log('📡 Configuration API routes registered');
  }
}

module.exports = new ConfigAPI();
