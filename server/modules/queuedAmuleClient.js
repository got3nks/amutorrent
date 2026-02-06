/**
 * QueuedAmuleClient - Wrapper class for amule-ec-node that automatically manages request queuing
 * This eliminates the need to manually call enqueueAmuleCall throughout the codebase
 *
 * Also intercepts download/delete operations for history tracking
 */

const AmuleClient = require('amule-ec-node');
const config = require('./config');
const logger = require('../lib/logger');

class QueuedAmuleClient {
  constructor(host, port, password, options = {}) {
    this.client = new AmuleClient(host, port, password, options);
    this.requestQueue = Promise.resolve();
    this.pendingRequests = 0;
    this.connectionLost = false;
    this.errorHandler = null;

    // Download history tracking
    this.downloadHistoryDB = null;

    // Callback for getting file info (needed for history)
    this.getFileInfoCallback = null;

    // Cache for EC_TAG_PARTFILE_SOURCE_NAMES data (keyed by file hash)
    this.sourceNamesCache = new Map();

    // Add error handling for the underlying protocol to prevent crashes
    this.setupErrorHandlers();

    // Methods that trigger history tracking
    const downloadMethods = ['downloadSearchResult', 'addEd2kLink'];
    const deleteMethods = ['cancelDownload'];

    // Create a proxy to handle all method calls automatically
    return new Proxy(this, {
      get(target, prop) {
        // Handle our own methods
        if (prop in target && typeof target[prop] === 'function') {
          return target[prop].bind(target);
        }

        // Handle client methods with special handling
        if (target.client && typeof target.client[prop] === 'function') {
          return (...args) => {
            if (prop === 'getDownloadQueue') {
              return target.getDownloadQueueWithCache(...args);
            }
            // Intercept download methods for history tracking
            if (downloadMethods.includes(prop)) {
              return target.interceptDownload(prop, args);
            }
            // Intercept delete methods for history tracking
            if (deleteMethods.includes(prop)) {
              return target.interceptDelete(prop, args);
            }
            return target.queueRequest(() => target.client[prop](...args), prop);
          };
        }

        // Handle properties
        return target.client ? target.client[prop] : undefined;
      }
    });
  }

  /**
   * Setup error handlers to prevent unhandled errors from crashing the server
   */
  setupErrorHandlers() {
    try {
      // Access the underlying ECProtocol session if available
      // AmuleClient uses 'session' not 'protocol'
      if (this.client && this.client.session) {
        const session = this.client.session;

        // Add error event listener
        if (session.socket) {
          session.socket.on('error', (err) => {
            logger.error('[QueuedAmuleClient] Socket error:', err.message);
            this.connectionLost = true;
            if (this.errorHandler) {
              this.errorHandler(err);
            }
          });

          session.socket.on('close', () => {
            this.connectionLost = true;
          });
        }
      }
    } catch (err) {
      // Ignore setup errors - this is defensive programming
      logger.warn('[QueuedAmuleClient] Could not setup error handlers:', err.message);
    }
  }

  /**
   * Set external error handler
   */
  onError(handler) {
    this.errorHandler = handler;
  }

  // Internal queue management
  queueRequest(fn, methodName) {
    const previous = this.requestQueue;
    this.pendingRequests++;

    const current = previous
      .then(() => fn())
      .catch(err => {
        logger.warn(`QueuedAmuleClient request failed (${methodName}):`, err.message);
        return null;
      })
      .finally(() => {
        this.pendingRequests--;
      });

    this.requestQueue = current.then(() => {}, () => {});
    return current;
  }

  // Connection methods - NOT queued as they establish the connection itself
  async connect() {
    try {
      this.connectionLost = false;
      const result = await this.client.connect();
      // Setup error handlers after successful connection
      this.setupErrorHandlers();
      return result;
    } catch (err) {
      this.connectionLost = true;
      throw err;
    }
  }

  async disconnect() {
    try {
      if (this.client && typeof this.client.close === 'function') {
        // AmuleClient uses close() not disconnect()
        return await this.client.close();
      }
    } catch (err) {
      // Ignore disconnect errors
      logger.warn('[QueuedAmuleClient] Disconnect error:', err.message);
    }
  }

  /**
   * Wrapper for getDownloadQueue that caches EC_TAG_PARTFILE_SOURCE_NAMES data
   * aMule sends incremental updates with _value as index. We need to merge updates.
   * This method maintains a complete cache and merges incremental changes.
   */
  async getDownloadQueueWithCache(...args) {
    return this.queueRequest(async () => {
      const result = await this.client.getDownloadQueue(...args);

      if (!result || !Array.isArray(result)) {
        return result;
      }

      // Process each file in the download queue
      result.forEach(file => {
        const fileHash = file?.raw?.EC_TAG_PARTFILE_HASH;
        if (!fileHash) return;

        const newSourceNames = file.raw?.EC_TAG_PARTFILE_SOURCE_NAMES;

        if (newSourceNames) {
          // Get existing cached data
          const cached = this.sourceNamesCache.get(fileHash);

          // Merge new data with cached data
          const merged = this.mergeSourceNames(cached, newSourceNames);

          // Update cache and file data
          this.sourceNamesCache.set(fileHash, merged);
          file.raw.EC_TAG_PARTFILE_SOURCE_NAMES = merged;
        } else if (this.sourceNamesCache.has(fileHash)) {
          // No SOURCE_NAMES in response, restore from cache
          file.raw.EC_TAG_PARTFILE_SOURCE_NAMES = this.sourceNamesCache.get(fileHash);
        }
      });

      return result;
    }, 'getDownloadQueue');
  }

  /**
   * Merge SOURCE_NAMES data based on _value index
   * @param {Object} cached - Cached SOURCE_NAMES structure
   * @param {Object} incoming - New SOURCE_NAMES data from aMule
   * @returns {Object} Merged SOURCE_NAMES structure
   */
  mergeSourceNames(cached, incoming) {
    // Extract the inner data
    const cachedInner = cached?.EC_TAG_PARTFILE_SOURCE_NAMES;
    const incomingInner = incoming?.EC_TAG_PARTFILE_SOURCE_NAMES;

    if (!incomingInner) {
      return cached || incoming;
    }

    // Convert to arrays for processing
    const cachedArray = Array.isArray(cachedInner) ? cachedInner : (cachedInner ? [cachedInner] : []);
    const incomingArray = Array.isArray(incomingInner) ? incomingInner : [incomingInner];

    // Create a map of cached items by _value
    const mergedMap = new Map();
    cachedArray.forEach(item => {
      if (item._value !== undefined) {
        mergedMap.set(item._value, item);
      }
    });

    // Merge incoming items
    incomingArray.forEach(item => {
      if (item._value !== undefined) {
        const existing = mergedMap.get(item._value);
        if (existing) {
          // Update existing entry - merge properties
          mergedMap.set(item._value, { ...existing, ...item });
        } else {
          // Add new entry
          mergedMap.set(item._value, item);
        }
      }
    });

    // Convert back to array and sort by _value
    const mergedArray = Array.from(mergedMap.values()).sort((a, b) => a._value - b._value);

    // Return in the same structure format
    return {
      EC_TAG_PARTFILE_SOURCE_NAMES: mergedArray.length === 1 ? mergedArray[0] : mergedArray
    };
  }

  // Status methods - not queued as they're synchronous checks
  isConnected() {
    // AmuleClient doesn't have isConnected() method
    // Check if session exists and socket is not destroyed
    if (!this.client || !this.client.session) {
      return false;
    }
    return this.client.session.socket && !this.client.session.socket.destroyed;
  }

  getQueueStatus() {
    return {
      pendingRequests: this.pendingRequests,
      queueLength: this.pendingRequests
    };
  }

  // ============================================================================
  // DOWNLOAD HISTORY TRACKING
  // ============================================================================

  /**
   * Set download history database for tracking
   * @param {DownloadHistory} historyDB - DownloadHistory database instance
   */
  setDownloadHistoryDB(historyDB) {
    this.downloadHistoryDB = historyDB;
  }

  /**
   * Check if history tracking is enabled (reads from config)
   * @returns {boolean}
   */
  isHistoryEnabled() {
    return config.getConfig()?.history?.enabled !== false;
  }

  /**
   * Set callback to get file info for downloads
   * Used to get filename/size when downloading search results
   * @param {function} callback - async function(hash) => { filename, size }
   */
  setFileInfoCallback(callback) {
    this.getFileInfoCallback = callback;
  }

  /**
   * Intercept download methods to track in history
   * @param {string} method - Method name
   * @param {Array} args - Method arguments [hash/link, categoryId, username?]
   */
  async interceptDownload(method, args) {
    // Extract username (3rd arg) - not passed to aMule client
    const username = args[2] || null;
    const clientArgs = args.slice(0, 2); // Only pass hash/link and categoryId to aMule

    // Execute the actual download request
    // Use direct execution with try/catch to know if it succeeded
    // (queueRequest swallows errors and returns null, so we can't distinguish success from failure)
    const previous = this.requestQueue;
    this.pendingRequests++;

    let result = null;
    let success = false;

    try {
      await previous; // Wait for queue
      result = await this.client[method](...clientArgs);
      success = true;
    } catch (err) {
      logger.warn(`QueuedAmuleClient ${method} failed:`, err.message);
      // Don't rethrow - maintain backward compatibility (return null on error)
    } finally {
      this.pendingRequests--;
      // Update queue to resolve
      this.requestQueue = Promise.resolve();
    }

    // Track download in history only on success
    if (success && this.isHistoryEnabled() && this.downloadHistoryDB) {
      try {
        await this.trackDownloadStart(method, args, username);
      } catch (err) {
        logger.warn('[QueuedAmuleClient] Failed to track download:', err.message);
      }
    }

    return result;
  }

  /**
   * Track a download start in history
   * @param {string} method - Method name
   * @param {Array} args - Method arguments
   * @param {string|null} username - Username to associate with the download
   */
  async trackDownloadStart(method, args, username) {
    let hash, filename, size;

    if (method === 'downloadSearchResult') {
      // args: [fileHash, categoryId, username?]
      hash = args[0];
      // Try to get file info from callback
      if (this.getFileInfoCallback) {
        try {
          const info = await this.getFileInfoCallback(hash);
          filename = info?.filename || 'Unknown';
          size = info?.size || null;
        } catch {
          filename = 'Unknown';
        }
      } else {
        filename = 'Unknown';
      }
    } else if (method === 'addEd2kLink') {
      // args: [ed2kLink, categoryId, username?]
      const link = args[0];
      // Parse ed2k link to extract hash, filename, size
      const parsed = this.parseEd2kLink(link);
      hash = parsed.hash;
      filename = parsed.filename || 'Unknown';
      size = parsed.size || null;
    }

    if (hash) {
      this.downloadHistoryDB.addDownload(hash, filename, size, username, 'amule');
    } else {
      logger.warn(`[QueuedAmuleClient] No hash found for ${method}, cannot track in history`);
    }
  }

  /**
   * Intercept delete methods to track in history
   * @param {string} method - Method name
   * @param {Array} args - Method arguments
   */
  async interceptDelete(method, args) {
    // Execute the actual delete request
    const result = await this.queueRequest(
      () => this.client[method](...args),
      method
    );

    // Track deletion regardless of result (user intended to delete)
    if (this.isHistoryEnabled() && this.downloadHistoryDB) {
      try {
        // args: [fileHash]
        const hash = args[0];
        if (hash) {
          this.downloadHistoryDB.markDeleted(hash);
        }
      } catch (err) {
        logger.warn('[QueuedAmuleClient] Failed to track deletion:', err.message);
      }
    }

    return result;
  }

  /**
   * Parse ed2k link to extract hash, filename, and size
   * Format: ed2k://|file|filename|size|hash|/
   * @param {string} link - ED2K link
   * @returns {object} { hash, filename, size }
   */
  parseEd2kLink(link) {
    try {
      const match = link.match(/ed2k:\/\/\|file\|([^|]+)\|(\d+)\|([a-fA-F0-9]{32})\|/);
      if (match) {
        return {
          filename: decodeURIComponent(match[1]),
          size: parseInt(match[2], 10),
          hash: match[3].toLowerCase()
        };
      }
    } catch (err) {
      logger.warn('[QueuedAmuleClient] Failed to parse ed2k link:', err.message);
    }
    return { hash: null, filename: null, size: null };
  }
}

module.exports = QueuedAmuleClient;