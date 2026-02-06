/**
 * aMule Client Management Module
 * Handles aMule connection, reconnection, and request queuing
 */

const QueuedAmuleClient = require('./queuedAmuleClient');
const config = require('./config');
const BaseModule = require('../lib/BaseModule');
const logger = require('../lib/logger');

class AmuleManager extends BaseModule {
  constructor() {
    super();
    this.client = null;
    this.reconnectInterval = null;
    this.sharedFilesReloadInterval = null;  // Timer for automatic shared files reload
    this.searchInProgress = false;
    this.connectionInProgress = false; // Prevent concurrent connection attempts
    this._onConnectCallbacks = [];
    this.setupGlobalErrorHandlers();
  }

  /**
   * Setup global error handlers to prevent ECProtocol errors from crashing the server
   */
  setupGlobalErrorHandlers() {
    // Catch uncaught exceptions from ECProtocol reconnection failures
    // IMPORTANT: This prevents the server from crashing when aMule disconnects
    const ecProtocolErrorHandler = (err) => {
      // Only handle ECProtocol errors
      if (err.message && err.message.includes('[ECProtocol]')) {
        logger.error('⚠️  ECProtocol error caught (prevented crash):', err.message);
        logger.error('Stack:', err.stack);

        // Mark client as disconnected
        if (this.client) {
          this.client = null;
        }

        // Trigger reconnection if not already scheduled
        if (!this.reconnectInterval) {
          logger.log('🔄 Will retry connection every 10 seconds...');
          this.reconnectInterval = setInterval(async () => {
            logger.log('🔄 Attempting to reconnect to aMule...');
            await this.initClient();
          }, 10000);
        }

        // Return true to indicate we handled this error
        return true;
      }

      // Return false for other errors
      return false;
    };

    // Use uncaughtException but check if we can handle it first
    process.on('uncaughtException', (err) => {
      const handled = ecProtocolErrorHandler(err);
      if (!handled) {
        // For non-ECProtocol errors, log and exit gracefully
        logger.error('❌ Uncaught exception:', err);
        logger.error(err.stack);
        process.exit(1);
      }
    });
  }

  // Initialize aMule client
  async initClient() {
    // Check if aMule is enabled
    const amuleConfig = config.getAmuleConfig();
    if (!amuleConfig || amuleConfig.enabled === false) {
      this.log('ℹ️  aMule integration is disabled, skipping connection');
      return false;
    }

    // Prevent concurrent connection attempts
    if (this.connectionInProgress) {
      this.log('⚠️  Connection attempt already in progress, skipping...');
      return false;
    }

    this.connectionInProgress = true;

    try {
      // IMPORTANT: Always cleanup old client before creating a new one
      if (this.client) {
        this.log('🔄 Cleaning up old aMule client...');
        try {
          if (typeof this.client.disconnect === 'function') {
            // QueuedAmuleClient has disconnect() which internally calls close()
            await this.client.disconnect();
          }
        } catch (err) {
          // Ignore disconnect errors
          this.log('⚠️  Error disconnecting old client:', err.message);
        }
        this.client = null;
      }

      this.log(`🔌 Creating new aMule client (${config.AMULE_HOST}:${config.AMULE_PORT})...`);
      const newClient = new QueuedAmuleClient(config.AMULE_HOST, config.AMULE_PORT, config.AMULE_PASSWORD);

      // Set up error handler for the client
      newClient.onError((err) => {
        this.log('❌ aMule client error:', err.message);
        // Only set client to null if this is still the active client
        if (this.client === newClient) {
          this.client = null;
          // Trigger reconnection if not already scheduled
          if (!this.reconnectInterval) {
            this.log('🔄 Will retry connection every 10 seconds...');
            this.reconnectInterval = setInterval(async () => {
              this.log('🔄 Attempting to reconnect to aMule...');
              await this.initClient();
            }, 10000);
          }
        }
      });

      await newClient.connect();

      // Only set as active client if connection succeeded
      this.client = newClient;

      // Setup download history tracking on the new client
      if (this.downloadHistoryDB) {
        this.client.setDownloadHistoryDB(this.downloadHistoryDB);
        const historyEnabled = config.getConfig()?.history?.enabled !== false;
        this.log(`📜 Download history tracking ${historyEnabled ? 'enabled' : 'disabled'} on new client`);
      }

      this.log('✅ Connected to aMule successfully');

      // Notify listeners (e.g. qBittorrent API category sync)
      this._onConnectCallbacks.forEach(cb => cb());

      // Start shared files auto-reload scheduler
      this.startSharedFilesReloadScheduler();

      // Stop reconnection attempts
      if (this.reconnectInterval) {
        clearInterval(this.reconnectInterval);
        this.reconnectInterval = null;
      }

      return true;
    } catch (err) {
      this.log('❌ Failed to connect to aMule:', err.message);
      this.client = null;
      return false;
    } finally {
      this.connectionInProgress = false;
    }
  }

  // Start connection and auto-reconnect
  async startConnection() {
    // Don't start if not enabled
    const amuleConfig = config.getAmuleConfig();
    if (!amuleConfig || amuleConfig.enabled === false) {
      this.log('ℹ️  aMule integration is disabled, skipping connection');
      return;
    }

    const connected = await this.initClient();
    if (!connected && !this.reconnectInterval) {
      this.log('🔄 Will retry connection every 10 seconds...');
      this.reconnectInterval = setInterval(async () => {
        // Check if still enabled before retrying
        const currentConfig = config.getAmuleConfig();
        if (!currentConfig || currentConfig.enabled === false) {
          this.log('ℹ️  aMule disabled, stopping reconnection attempts');
          if (this.reconnectInterval) {
            clearInterval(this.reconnectInterval);
            this.reconnectInterval = null;
          }
          return;
        }
        this.log('🔄 Attempting to reconnect to aMule...');
        await this.initClient();
      }, 10000);
    }
  }

  // Get current client
  getClient() {
    return this.client;
  }

  // Check if aMule integration is enabled in config
  isEnabled() {
    const amuleConfig = config.getAmuleConfig();
    return amuleConfig && amuleConfig.enabled !== false;
  }

  // Check if client is connected
  isConnected() {
    return !!this.client;
  }

  // Register a callback to be called when aMule connects
  onConnect(callback) {
    this._onConnectCallbacks.push(callback);
  }

  // Search lock management
  acquireSearchLock() {
    if (this.searchInProgress) {
      return false;
    }
    this.searchInProgress = true;
    return true;
  }

  releaseSearchLock() {
    this.searchInProgress = false;
  }

  isSearchInProgress() {
    return this.searchInProgress;
  }

  // ============================================================================
  // SHARED FILES AUTO-RELOAD SCHEDULER
  // ============================================================================

  /**
   * Start the shared files auto-reload scheduler based on config
   * Called when aMule connects and when configuration changes
   */
  startSharedFilesReloadScheduler() {
    // Stop any existing scheduler first
    this.stopSharedFilesReloadScheduler();

    const intervalHours = config.AMULE_SHARED_FILES_RELOAD_INTERVAL_HOURS;

    // 0 means disabled
    if (!intervalHours || intervalHours <= 0) {
      this.log('ℹ️  Shared files auto-reload is disabled');
      return;
    }

    // Convert hours to milliseconds
    const intervalMs = intervalHours * 60 * 60 * 1000;

    this.log(`📂 Starting shared files auto-reload scheduler (every ${intervalHours} hour${intervalHours > 1 ? 's' : ''})`);

    this.sharedFilesReloadInterval = setInterval(async () => {
      await this.performSharedFilesReload();
    }, intervalMs);
  }

  /**
   * Stop the shared files auto-reload scheduler
   */
  stopSharedFilesReloadScheduler() {
    if (this.sharedFilesReloadInterval) {
      clearInterval(this.sharedFilesReloadInterval);
      this.sharedFilesReloadInterval = null;
      this.log('🛑 Stopped shared files auto-reload scheduler');
    }
  }

  /**
   * Perform the actual shared files reload
   */
  async performSharedFilesReload() {
    if (!this.client) {
      this.log('⚠️  Cannot reload shared files: aMule client not connected');
      return;
    }

    try {
      this.log('📂 Auto-reloading shared files...');
      await this.client.refreshSharedFiles();
      this.log('✅ Shared files auto-reload completed');
    } catch (err) {
      this.log('❌ Shared files auto-reload failed:', err.message);
    }
  }

  /**
   * Reconfigure the scheduler (call when configuration changes)
   */
  reconfigureSharedFilesReloadScheduler() {
    // Only reconfigure if we're connected
    if (this.client) {
      this.startSharedFilesReloadScheduler();
    }
  }

  // Graceful shutdown
  async shutdown() {
    this.log('🛑 Shutting down aMule connection...');

    // Stop shared files auto-reload scheduler
    this.stopSharedFilesReloadScheduler();

    // Stop reconnection attempts
    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval);
      this.reconnectInterval = null;
    }

    // Wait for any ongoing connection attempts to finish
    let waitAttempts = 0;
    while (this.connectionInProgress && waitAttempts < 50) {
      await new Promise(resolve => setTimeout(resolve, 100));
      waitAttempts++;
    }

    // Disconnect client
    if (this.client) {
      try {
        if (typeof this.client.disconnect === 'function') {
          await this.client.disconnect();
        }
      } catch (err) {
        this.log('⚠️  Error during aMule client shutdown:', err.message);
      }
      this.client = null;
    }

    this.connectionInProgress = false;
    this.log('✅ aMule connection shutdown complete');
  }
}

module.exports = new AmuleManager();