/**
 * aMule Client Management Module
 * Handles aMule connection, reconnection, and request queuing
 */

const QueuedAmuleClient = require('./queuedAmuleClient');
const config = require('./config');
const BaseModule = require('../lib/BaseModule');

class AmuleManager extends BaseModule {
  constructor() {
    super();
    this.client = null;
    this.reconnectInterval = null;
    this.searchInProgress = false;
    this.connectionInProgress = false; // Prevent concurrent connection attempts
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
        console.error('⚠️  ECProtocol error caught (prevented crash):', err.message);
        console.error('Stack:', err.stack);

        // Mark client as disconnected
        if (this.client) {
          this.client = null;
        }

        // Trigger reconnection if not already scheduled
        if (!this.reconnectInterval) {
          console.log('🔄 Will retry connection every 10 seconds...');
          this.reconnectInterval = setInterval(async () => {
            console.log('🔄 Attempting to reconnect to aMule...');
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
        console.error('❌ Uncaught exception:', err);
        console.error(err.stack);
        process.exit(1);
      }
    });
  }

  // Initialize aMule client
  async initClient() {
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
      this.log('✅ Connected to aMule successfully');

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
    const connected = await this.initClient();
    if (!connected && !this.reconnectInterval) {
      this.log('🔄 Will retry connection every 10 seconds...');
      this.reconnectInterval = setInterval(async () => {
        this.log('🔄 Attempting to reconnect to aMule...');
        await this.initClient();
      }, 10000);
    }
  }

  // Get current client
  getClient() {
    return this.client;
  }

  // Check if client is connected
  isConnected() {
    return !!this.client;
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

  // Graceful shutdown
  async shutdown() {
    this.log('🛑 Shutting down aMule connection...');

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