/**
 * aMule Client Management Module
 * Handles aMule connection, reconnection, and request queuing
 */

const QueuedAmuleClient = require('./queuedAmuleClient');
const config = require('./config');
const BaseClientManager = require('../lib/BaseClientManager');
const logger = require('../lib/logger');
const { parseEd2kLink } = require('../lib/torrentUtils');
const {
  normalizeAmuleDownload,
  normalizeAmuleSharedFile,
  normalizeAmuleUpload,
  normalizeAmuleDownloadSource
} = require('../lib/downloadNormalizer');

class AmuleManager extends BaseClientManager {
  constructor() {
    super();
    this.sharedFilesReloadInterval = null;  // Timer for automatic shared files reload
    this.searchInProgress = false;
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
          this._setConnectionError(err);
          this.client = null;
        }

        // Trigger reconnection if not already scheduled
        this.scheduleReconnect(10000);

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

  /**
   * Initialize aMule client connection.
   * Creates a QueuedAmuleClient, connects, and sets up error/reconnection handlers.
   * @returns {Promise<boolean>} True if connection succeeded
   */
  async initClient() {
    // Check if aMule is enabled
    if (!this._clientConfig || !this._clientConfig.enabled) {
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
          this.log('⚠️  Error disconnecting old client:', logger.errorDetail(err));
        }
        this.client = null;
      }

      this.log(`🔌 Creating new aMule client (${this._clientConfig.host}:${this._clientConfig.port})...`);
      const newClient = new QueuedAmuleClient(this._clientConfig.host, this._clientConfig.port, this._clientConfig.password, {
        requestTimeout: 60000 // 60s — large shared file lists (3000+) can take >30s for aMule to respond
      });

      // Set up error handler for the client
      newClient.onError((err) => {
        this.log('❌ aMule client error:', logger.errorDetail(err));
        // Only set client to null if this is still the active client
        if (this.client === newClient) {
          this._setConnectionError(err);
          this.client = null;
          this.scheduleReconnect(10000);
        }
      });

      await newClient.connect();

      // Only set as active client if connection succeeded
      this.client = newClient;
      this._clearConnectionError();

      this.log('✅ Connected to aMule successfully');

      // Notify listeners (e.g. qBittorrent API category sync)
      this._onConnectCallbacks.forEach(cb => cb());

      // Start shared files auto-reload scheduler
      this.startSharedFilesReloadScheduler();

      // Stop reconnection attempts
      this.clearReconnect();

      return true;
    } catch (err) {
      this.log('❌ Failed to connect to aMule:', logger.errorDetail(err));
      this._setConnectionError(err);
      this.client = null;
      return false;
    } finally {
      this.connectionInProgress = false;
    }
  }

  // Start connection and auto-reconnect
  async startConnection() {
    // Don't start if not enabled
    if (!this._clientConfig || !this._clientConfig.enabled) {
      this.log('ℹ️  aMule integration is disabled, skipping connection');
      return;
    }

    const connected = await this.initClient();
    if (!connected) {
      this.scheduleReconnect(10000);
    }
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

    const intervalHours = this._clientConfig?.sharedFilesReloadIntervalHours ?? 0;

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
      // If shared dir roots are configured, rescan subdirectories before reloading
      if (this._clientConfig?.sharedDirDatPath && this._clientConfig?.sharedDirRoots?.length > 0) {
        this.log('📂 Auto-rescanning shared directories...');
        const sharedDirAPI = require('./sharedDirAPI');
        await sharedDirAPI.rescanAndWrite(this.instanceId);
      }

      this.log('📂 Auto-reloading shared files...');
      await this.client.refreshSharedFiles();
      this.log('✅ Shared files auto-reload completed');
    } catch (err) {
      this.log('❌ Shared files auto-reload failed:', logger.errorDetail(err));
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

  /**
   * Refresh the shared files list in aMule
   */
  async refreshSharedFiles() {
    if (!this.client) {
      throw new Error('aMule not connected');
    }
    await this.client.refreshSharedFiles();
  }

  // ============================================================================
  // UNIFIED DATA FETCHING (same interface as all managers)
  // ============================================================================

  /**
   * Fetch and normalize all data from aMule.
   * Uses a single getUpdate() call for downloads, shared files, and uploading clients.
   * @param {Array} categories - Categories for normalizer (path-based derivation)
   * @returns {Promise<Object>} { downloads, sharedFiles, uploads }
   */
  async fetchData(categories = []) {
    if (!this.client) {
      return { downloads: [], sharedFiles: [] };
    }

    let updateData = null;

    try {
      updateData = await this.client.getUpdate();
    } catch (err) {
      this.log('❌ Error fetching update:', err.message);
    }

    if (!updateData) {
      this.log('⚠️  getUpdate() returned no data — aMule may be unresponsive');
    }

    const rawDownloads = updateData?.downloads || [];
    const rawSharedFiles = updateData?.sharedFiles || [];
    const rawClients = updateData?.clients || [];

    // ── Normalize downloads ──────────────────────────────────────────────
    const categoryManager = require('../lib/CategoryManager');
    const resolveCategoryName = (catId) => categoryManager.getCategoryNameByAmuleId(this.instanceId, catId);
    const downloads = rawDownloads.map(d => normalizeAmuleDownload(d, resolveCategoryName));

    // ── Derive uploading clients (for speed aggregation + peer embedding) ─
    // US_NONE = 8 — filter out clients that aren't uploading
    const uploadingClients = rawClients.filter(c =>
      c.uploadState !== undefined && c.uploadState !== 8 && c.ip
    );

    // ── Aggregate upload speed by file name (for shared file assembly) ───
    const speedByFile = new Map();
    for (const client of uploadingClients) {
      const fileName = client.transferFileName || '';
      if (!fileName) continue;
      const speed = client.upSpeed || 0;
      if (speed > 0) {
        speedByFile.set(fileName, (speedByFile.get(fileName) || 0) + speed);
      }
    }

    // ── Normalize shared files (attach aggregated upload speed) ──────────
    const sharedFiles = rawSharedFiles.map(f => {
      const normalized = normalizeAmuleSharedFile(f, categories);
      return {
        ...normalized,
        uploadSpeed: speedByFile.get(normalized.name) || 0
      };
    });

    // ED2K chunk size — one "part" in aMule parlance. See aMule's
    // src/include/protocol/ed2k/Constants.h: `const uint64 PARTSIZE = 9728000ull;`
    const ED2K_PARTSIZE = 9728000;
    // Count set bits in a bit-packed buffer (LSB-first per byte, matching
    // aMule's BitVector layout — bit 0 of byte 0 is part 0, etc.).
    const countSetBits = (buf, totalParts) => {
      if (!buf || !buf.length) return 0;
      let count = 0;
      const limit = Math.min(totalParts, buf.length * 8);
      for (let i = 0; i < limit; i++) {
        if (buf[i >> 3] & (1 << (i & 7))) count++;
      }
      return count;
    };
    // Map a raw part count → 0–100 completion for a peer on a file of the
    // given size. Returns null when we don't have enough data to compute it.
    const computePeerPercent = (partsHeld, fileSize) => {
      if (partsHeld == null || !fileSize || fileSize <= 0) return null;
      const totalParts = Math.ceil(fileSize / ED2K_PARTSIZE);
      if (totalParts <= 0) return null;
      return Math.min(100, Math.round((partsHeld * 100) / totalParts));
    };
    // Resolve the numerator for a peer on a file of `fileSize`:
    //   - Download sources: aMule's `availableParts` is the canonical count.
    //   - Upload peers: `availableParts` is always 0 because aMule computes it
    //     from the download-side bitmap. Instead count set bits in the
    //     peer-reported `uploadPartStatus` bitmap (requires amule-ec-node
    //     df97f5e or later parsing EC_TAG_CLIENT_UPLOAD_PART_STATUS).
    const peerPartsHeld = (client, fileSize) => {
      if (client.uploadPartStatus && client.uploadPartStatus.length) {
        const totalParts = Math.ceil((fileSize || 0) / ED2K_PARTSIZE);
        return countSetBits(client.uploadPartStatus, totalParts);
      }
      return client.availableParts ?? null;
    };

    // ── Embed upload peers into their shared file objects ─────────────────
    // Link via ECID — mirrors download-source logic and avoids fragile name
    // matching (aMule emits the upload filename via GetPrintable() which can
    // diverge from the canonical KNOWNFILE name after mojibake correction).
    const sharedByEcid = new Map();
    for (const sf of sharedFiles) {
      if (sf.ecid != null) sharedByEcid.set(sf.ecid, sf);
    }
    for (const client of uploadingClients) {
      if (client.uploadFileEcid == null) continue;
      const sf = sharedByEcid.get(client.uploadFileEcid);
      if (!sf) continue;
      const normalized = normalizeAmuleUpload(client);
      normalized.completedPercent = computePeerPercent(peerPartsHeld(client, sf.size), sf.size);
      if (!sf.peers) sf.peers = [];
      sf.peers.push(normalized);
    }

    // ── Embed download sources into their download objects ────────────────
    // Link clients to downloads via requestFileEcid → download ecid
    const downloadsByEcid = new Map(rawDownloads.map((d, i) => [d.ecid, downloads[i]]));
    for (const client of rawClients) {
      if (!client.requestFileEcid || !client.ip) continue;
      const download = downloadsByEcid.get(client.requestFileEcid);
      if (!download) continue;
      const normalized = normalizeAmuleDownloadSource(client);
      normalized.completedPercent = computePeerPercent(peerPartsHeld(client, download.size), download.size);
      if (!download.peers) download.peers = [];
      download.peers.push(normalized);
    }

    // Stamp instanceId on all normalized items
    const instanceId = this.instanceId;
    downloads.forEach(d => { d.instanceId = instanceId; });
    sharedFiles.forEach(f => { f.instanceId = instanceId; });

    return { downloads, sharedFiles };
  }

  // ============================================================================
  // UNIFIED STATS & NETWORK STATUS (same interface as all managers)
  // ============================================================================

  /**
   * Get raw stats from aMule
   * @returns {Promise<Object>} Raw EC protocol stats
   */
  async getStats() {
    if (!this.client) {
      return {};
    }
    try {
      const stats = await this.client.getStats();
      return stats || {};
    } catch (err) {
      this.log('❌ Error fetching aMule stats:', logger.errorDetail(err));
      return {};
    }
  }

  /**
   * Extract normalized metrics from raw aMule stats
   * @param {Object} rawStats - Raw EC protocol stats
   * @returns {Object} { uploadSpeed, downloadSpeed, uploadTotal, downloadTotal }
   */
  extractMetrics(rawStats) {
    return {
      uploadSpeed: rawStats.EC_TAG_STATS_UL_SPEED || 0,
      downloadSpeed: rawStats.EC_TAG_STATS_DL_SPEED || 0,
      uploadTotal: rawStats.EC_TAG_STATS_TOTAL_SENT_BYTES || 0,
      downloadTotal: rawStats.EC_TAG_STATS_TOTAL_RECEIVED_BYTES || 0
    };
  }

  /**
   * Compute network status from raw aMule stats
   * @param {Object} rawStats - Raw EC protocol stats
   * @returns {Object} { ed2k: { status, text, connected, serverName, serverPing }, kad: { status, text, connected } }
   */
  getNetworkStatus(rawStats) {
    // ED2K status
    const connState = rawStats.EC_TAG_CONNSTATE || {};
    const server = connState.EC_TAG_SERVER || {};
    const ed2kConnected = server?.EC_TAG_SERVER_PING > 0;
    const clientId = connState.EC_TAG_CLIENT_ID;
    const isHighId = clientId && clientId > 16777216;

    const ed2k = ed2kConnected
      ? { status: isHighId ? 'green' : 'yellow', text: isHighId ? 'High ID' : 'Low ID',
          connected: true, serverName: server.EC_TAG_SERVER_NAME || null, serverPing: server.EC_TAG_SERVER_PING || null, serverAddress: server._value || null }
      : { status: 'red', text: 'Disconnected', connected: false, serverName: null, serverPing: null, serverAddress: null };

    // KAD status
    const kadFirewalledValue = rawStats.EC_TAG_STATS_KAD_FIREWALLED_UDP;
    const kadConnected = kadFirewalledValue !== undefined && kadFirewalledValue !== null;
    const kadFirewalled = kadFirewalledValue === 1;

    const kad = kadConnected
      ? { status: kadFirewalled ? 'yellow' : 'green', text: kadFirewalled ? 'Firewalled' : 'OK', connected: true }
      : { status: 'red', text: 'Disconnected', connected: false };

    return { ed2k, kad };
  }

  /**
   * Extract normalized history metadata from a raw aMule download or shared file item
   * @param {Object} item - Raw aMule download/shared file data
   * @returns {Object} Normalized metadata for history DB
   */
  extractHistoryMetadata(item) {
    const downloaded = item.downloaded || 0;
    const uploaded = item.transferredTotal || item.transferred || 0;
    const size = item.size || 0;
    // For shared files (no progress field), downloaded = size
    const isSharedFile = item.progress === undefined;
    const effectiveDownloaded = isSharedFile ? size : downloaded;
    const ratio = effectiveDownloaded > 0 ? uploaded / effectiveDownloaded : 0;
    // aMule's path is the directory containing the file — only useful if absolute
    const directory = item.path && item.path.startsWith('/') ? item.path : null;

    return {
      hash: item.hash?.toLowerCase(),
      instanceId: item.instanceId,
      size,
      name: item.name,
      downloaded: effectiveDownloaded,
      uploaded,
      ratio,
      trackerDomain: null,
      directory,
      multiFile: false,
      category: null // filled from unified items categoryByKey lookup
    };
  }

  // ============================================================================
  // UNIFIED DOWNLOAD CONTROL (same interface as all managers)
  // ============================================================================

  /**
   * Pause a download
   * @param {string} hash - File hash
   */
  async pause(hash) {
    if (!this.client) {
      throw new Error('aMule not connected');
    }
    return await this.client.pauseDownload(hash);
  }

  /**
   * Resume a download
   * @param {string} hash - File hash
   */
  async resume(hash) {
    if (!this.client) {
      throw new Error('aMule not connected');
    }
    return await this.client.resumeDownload(hash);
  }

  /**
   * Hard stop a download (aMule: same as pause, no separate hard-stop concept)
   * @param {string} hash - File hash
   */
  async stop(hash) {
    return await this.pause(hash);
  }

  /**
   * Rename a file (download or shared)
   * @param {string} hash - File hash
   * @param {string} newName - New file name
   * @returns {Object} { success, error? }
   */
  async renameFile(hash, newName) {
    if (!this.client) {
      throw new Error('aMule not connected');
    }
    return await this.client.renameFile(hash, newName);
  }

  /**
   * Set rating and comment on a shared file.
   * aMule's EC handler writes both fields together — missing tags are treated
   * as "clear". Callers must supply current values for any field to preserve.
   * @param {string} hash - File hash
   * @param {string} comment - Comment text (empty string clears)
   * @param {number} rating - Rating 0–5 (0 = not rated)
   * @returns {Promise<{success: boolean}>}
   */
  async setFileRatingComment(hash, comment, rating) {
    if (!this.client) {
      throw new Error('aMule not connected');
    }
    const success = await this.client.setFileRatingComment(hash, comment, rating);
    return { success };
  }

  /**
   * Update download directory (no-op for aMule — directory managed via categories)
   * @param {string} _hash - File hash (unused)
   * @param {string} _path - New directory path (unused)
   */
  async updateDirectory(_hash, _path) {
    // aMule manages directories automatically via categories
  }

  // ============================================================================
  // DOWNLOAD OPERATIONS
  // ============================================================================

  /**
   * Download a search result by hash
   * @param {string} fileHash - File hash
   * @param {number} categoryId - aMule category ID (0 = default)
   * @param {string|null} username - Username for history tracking
   * @param {Function|null} fileInfoCallback - async (hash) => { filename, size } for history
   * @returns {Promise<boolean>} Success
   */
  async addSearchResult(fileHash, categoryId = 0, username = null, fileInfoCallback = null) {
    if (!this.client) {
      throw new Error('aMule not connected');
    }

    const success = await this.client.downloadSearchResult(fileHash, categoryId);

    // Track in history
    if (success) {
      let filename = 'Unknown';
      let size = null;
      if (fileInfoCallback) {
        try {
          const info = await fileInfoCallback(fileHash);
          filename = info?.filename || 'Unknown';
          size = info?.size || null;
        } catch { /* use defaults */ }
      }
      const categoryName = this._resolveCategoryName(categoryId);
      this.trackDownload(fileHash, filename, size, username, categoryName);
    }

    return success;
  }

  /**
   * Add an ED2K link
   * @param {string} link - ED2K link
   * @param {number} categoryId - aMule category ID (0 = default)
   * @param {string|null} username - Username for history tracking
   * @returns {Promise<boolean>} Success
   */
  async addEd2kLink(link, categoryId = 0, username = null) {
    if (!this.client) {
      throw new Error('aMule not connected');
    }

    const success = await this.client.addEd2kLink(link, categoryId);

    // Track in history
    if (success) {
      const parsed = parseEd2kLink(link);
      const categoryName = this._resolveCategoryName(categoryId);
      this.trackDownload(
        parsed.hash, parsed.filename || 'Unknown', parsed.size, username, categoryName
      );
    }

    return success;
  }

  /**
   * Cancel/remove an active download
   * @param {string} fileHash - File hash
   * @returns {Promise<boolean>} Success
   */
  async cancelDownload(fileHash) {
    if (!this.client) {
      throw new Error('aMule not connected');
    }

    const success = await this.client.cancelDownload(fileHash);
    this.trackDeletion(fileHash);
    return success;
  }

  /**
   * Delete an item (active download or shared file)
   * For active downloads: cancels via EC protocol (aMule cleans up .part temp file)
   * For shared files: returns path for caller to delete from disk (no client interaction needed)
   * @param {string} hash - File hash
   * @param {Object} options - { deleteFiles, isShared, filePath }
   * @returns {Promise<Object>} { success, pathsToDelete?, error? }
   */
  async deleteItem(hash, { deleteFiles, isShared, filePath } = {}) {
    if (isShared) {
      // Shared file deletion — filesystem operation only, no client connection needed
      if (!deleteFiles) {
        return { success: false, error: 'Shared files can only be removed by deleting the file' };
      }
      if (!filePath) {
        return { success: false, error: 'File path required for shared file deletion' };
      }
      this.trackDeletion(hash);
      return { success: true, pathsToDelete: [filePath] };
    }

    // Active download — cancelDownload handles .part cleanup + history tracking
    const result = await this.cancelDownload(hash);
    return result
      ? { success: true, pathsToDelete: [] }
      : { success: false, error: 'aMule rejected the cancel request' };
  }

  /**
   * Set category for a download (unified interface)
   * Resolves category name to aMule's internal amuleId, creating if needed.
   * @param {string} hash - File hash
   * @param {Object} options - { categoryName }
   * @returns {Promise<Object>} { success, error? }
   */
  async setCategoryOrLabel(hash, { categoryName } = {}) {
    if (!this.client) {
      throw new Error('aMule not connected');
    }
    const amuleId = await this.ensureAmuleCategoryId(categoryName);
    if (amuleId === null) {
      return { success: false, error: 'Could not resolve aMule category ID' };
    }
    const success = await this.client.setFileCategory(hash, amuleId);
    return success
      ? { success: true }
      : { success: false, error: 'aMule rejected the category change' };
  }

  /**
   * Resolve category name to aMule category ID, creating in aMule if needed.
   * Uses this manager's own client connection (no registry lookup).
   * @param {string} categoryName - Category name
   * @returns {Promise<number|null>} amuleId or null on failure
   */
  async ensureAmuleCategoryId(categoryName) {
    const categoryManager = require('../lib/CategoryManager');
    const { hexColorToAmule } = require('../lib/CategoryManager');
    const category = categoryManager.getByName(categoryName);
    if (!category) {
      throw new Error(`Category "${categoryName}" not found`);
    }

    // Already has amuleId for this instance
    const existingId = category.amuleIds?.[this.instanceId];
    if (existingId != null) {
      return existingId;
    }

    if (!this.client) return null;

    try {
      const result = await this.ensureCategoryExists({
        name: category.name, path: category.path || '',
        comment: category.comment || '',
        color: hexColorToAmule(category.color), priority: category.priority || 0
      });
      if (result?.amuleId != null) {
        categoryManager.linkAmuleId(category.name, this.instanceId, result.amuleId);
        await categoryManager.save();
        return result.amuleId;
      }
    } catch (err) {
      this.log(`⚠️ Failed to ensure aMule category "${categoryName}": ${err.message}`);
    }
    return null;
  }

  // ============================================================================
  // CATEGORY CRUD (options-object pattern)
  // ============================================================================

  /**
   * Get categories from aMule
   * @returns {Promise<Array|null>} Array of { id, title, path, comment, color, priority }, or null if not connected
   */
  async getCategories() {
    if (!this.client) return null;
    return await this.client.getCategories();
  }

  /**
   * Create a category in aMule
   * @param {Object} opts - { name, path, comment, color, priority }
   * @returns {Promise<Object>} { success, categoryId }
   */
  async createCategory({ name, path = '', comment = '', color = 0xCCCCCC, priority = 0 } = {}) {
    if (!this.client) throw new Error('aMule not connected');
    const result = await this.client.createCategory(name, path, comment, color, priority);
    // aMule EC protocol returns EC_OP_NOOP with no ID — discover it via re-fetch
    if (result.success && result.categoryId == null) {
      const cats = await this.getCategories();
      const created = cats?.find(c => c.title === name);
      if (created?.id != null) result.categoryId = created.id;
    }
    return result;
  }

  /**
   * Edit/update a category in aMule with read-back verification.
   * @param {Object} opts - { id, name, path, defaultPath, comment, color, priority }
   * @returns {Promise<Object>} { success, verified, mismatches }
   */
  async editCategory({ id, name, path = '', defaultPath = '', comment = '', color = 0xCCCCCC, priority = 0 } = {}) {
    if (!this.client) throw new Error('aMule not connected');
    if (id == null) return { success: false, verified: false, mismatches: ['No aMule category ID'] };

    // aMule doesn't accept empty path — use default directory
    const effectivePath = path || defaultPath || '';

    try {
      await this.client.updateCategory(id, name, effectivePath, comment, color, priority);
      this.log(`📤 Updated category "${name}" in aMule (ID: ${id}, path: "${effectivePath}")`);

      // Verify by reading back
      const amuleCategories = await this.getCategories();
      const savedCat = amuleCategories?.find(c => c.id === id);

      if (!savedCat) {
        this.log(`⚠️ Verify: Category with ID ${id} not found after update`);
        return { success: true, verified: false, mismatches: ['Category not found after update'] };
      }

      const mismatches = [];
      if (savedCat.title !== name) mismatches.push(`title: expected "${name}", got "${savedCat.title}"`);
      if ((savedCat.path || '') !== effectivePath) mismatches.push(`path: expected "${effectivePath}", got "${savedCat.path || ''}"`);
      if ((savedCat.comment || '') !== comment) mismatches.push(`comment: expected "${comment}", got "${savedCat.comment || ''}"`);
      if ((savedCat.color ?? 0xCCCCCC) !== color) mismatches.push(`color: expected ${color.toString(16)}, got ${(savedCat.color ?? 0xCCCCCC).toString(16)}`);
      if ((savedCat.priority ?? 0) !== priority) mismatches.push(`priority: expected ${priority}, got ${savedCat.priority ?? 0}`);

      if (mismatches.length > 0) {
        this.log(`⚠️ Verify: Category "${name}" mismatches: ${mismatches.join(', ')}`);
        return { success: true, verified: false, mismatches };
      }

      this.log(`✅ Verify: Category "${name}" saved correctly in aMule`);
      return { success: true, verified: true, mismatches: [] };
    } catch (err) {
      this.log(`⚠️ Failed to update category in aMule: ${err.message}`);
      return { success: false, verified: false, mismatches: [err.message] };
    }
  }

  /**
   * Delete a category from aMule
   * @param {Object} opts - { id }
   */
  async deleteCategory({ id } = {}) {
    if (!this.client) throw new Error('aMule not connected');
    if (id == null) return;
    await this.client.deleteCategory(id);
  }

  /**
   * Rename a category in aMule — delegates to editCategory with new title.
   * @param {Object} opts - { id, newName, path, defaultPath, comment, color, priority }
   * @returns {Promise<Object>} { success, verified, mismatches }
   */
  async renameCategory({ id, newName, path = '', defaultPath = '', comment = '', color = 0xCCCCCC, priority = 0 } = {}) {
    return await this.editCategory({ id, name: newName, path, defaultPath, comment, color, priority });
  }

  /**
   * Ensure a category exists in aMule (find existing by name or create).
   * @param {Object} opts - { name, path, color, comment, priority }
   * @returns {Promise<Object>} { amuleId } or { amuleId: null } on failure
   */
  async ensureCategoryExists({ name, path = '', color = 0xCCCCCC, comment = '', priority = 0 } = {}) {
    if (!this.client) throw new Error('aMule not connected');

    try {
      const amuleCategories = await this.getCategories();
      const existing = amuleCategories?.find(c => c.title === name);

      if (existing && existing.id != null) {
        this.log(`🔗 Linked to existing aMule category "${name}" (ID: ${existing.id})`);
        return { amuleId: existing.id };
      }

      const result = await this.createCategory({ name, path, comment, color, priority });
      if (result.success && result.categoryId != null) {
        this.log(`📤 Created category "${name}" in aMule (ID: ${result.categoryId})`);
        return { amuleId: result.categoryId };
      }
      if (result.success) {
        this.log(`⚠️ Category "${name}" created in aMule but ID not found`);
      }
    } catch (err) {
      this.log(`⚠️ Failed to ensure category in aMule: ${err.message}`);
    }
    return { amuleId: null };
  }

  /**
   * Ensure multiple categories exist in aMule (batch-aware: fetches existing list once).
   * @param {Array<Object>} categories - Array of { name, path, color, comment, priority }
   * @returns {Promise<Array<Object>>} Results per created/linked category: [{ name, amuleId }]
   */
  async ensureCategoriesBatch(categories) {
    if (!this.client || !categories?.length) return [];

    const results = [];
    try {
      const amuleCategories = await this.getCategories();
      const existingByName = new Map((amuleCategories || []).map(c => [c.title, c]));

      for (const cat of categories) {
        const existing = existingByName.get(cat.name);
        if (existing && existing.id != null) {
          results.push({ name: cat.name, amuleId: existing.id });
          continue;
        }

        try {
          const result = await this.createCategory(cat);
          if (result.success && result.categoryId != null) {
            results.push({ name: cat.name, amuleId: result.categoryId });
            this.log(`📤 Propagated category "${cat.name}" to aMule (ID: ${result.categoryId})`);
          }
        } catch (err) {
          this.log(`⚠️ Failed to propagate "${cat.name}" to aMule: ${err.message}`);
        }
      }
    } catch (err) {
      this.log(`⚠️ Failed to fetch aMule categories for batch propagation: ${err.message}`);
    }
    return results;
  }

  // ============================================================================
  // EC PROTOCOL WRAPPERS (thin pass-through to this.client)
  // ============================================================================

  /**
   * Run a search and wait for results
   * @param {string} query - Search query
   * @param {string} type - Search type (e.g. 'global')
   * @param {string} extension - File extension filter
   * @returns {Promise<Object>} { results, resultsLength }
   */
  async search(query, type, extension) {
    if (!this.client) throw new Error('aMule not connected');
    return await this.client.searchAndWaitResults(query, type, extension);
  }

  /**
   * Get cached search results
   * @returns {Promise<Object>} { results }
   */
  async getSearchResults() {
    if (!this.client) throw new Error('aMule not connected');
    return await this.client.getSearchResults();
  }

  /**
   * Get the ED2K server list
   * @returns {Promise<Array>} Array of server objects
   */
  async getServerList() {
    if (!this.client) throw new Error('aMule not connected');
    return await this.client.getServerList();
  }

  /**
   * Connect to an ED2K server
   * @param {string} ip - Server IP
   * @param {number} port - Server port
   * @returns {Promise<boolean>} Success
   */
  async connectServer(ip, port) {
    if (!this.client) throw new Error('aMule not connected');
    return await this.client.connectServer(ip, port);
  }

  /**
   * Disconnect from an ED2K server
   * @param {string} ip - Server IP
   * @param {number} port - Server port
   * @returns {Promise<boolean>} Success
   */
  async disconnectServer(ip, port) {
    if (!this.client) throw new Error('aMule not connected');
    return await this.client.disconnectServer(ip, port);
  }

  /**
   * Remove an ED2K server
   * @param {string} ip - Server IP
   * @param {number} port - Server port
   * @returns {Promise<boolean>} Success
   */
  async removeServer(ip, port) {
    if (!this.client) throw new Error('aMule not connected');
    return await this.client.removeServer(ip, port);
  }

  /**
   * Get the aMule statistics tree
   * @returns {Promise<Object>} Stats tree data
   */
  async getStatsTree() {
    if (!this.client) throw new Error('aMule not connected');
    return await this.client.getStatsTree();
  }

  /**
   * Get ED2K server info text
   * @returns {Promise<string>} Server info
   */
  async getServerInfo() {
    if (!this.client) throw new Error('aMule not connected');
    return await this.client.getServerInfo();
  }

  /**
   * Get aMule log
   * @returns {Promise<string>} Log text
   */
  async getLog() {
    if (!this.client) throw new Error('aMule not connected');
    return await this.client.getLog();
  }

  /**
   * Resolve aMule category ID to category name for history tracking
   * @param {number} categoryId - aMule category ID
   * @returns {string|null} Category name or null
   * @private
   */
  _resolveCategoryName(categoryId) {
    if (categoryId <= 0) return null;
    try {
      // Lazy require to avoid circular dependency (CategoryManager requires amuleManager)
      return require('../lib/CategoryManager').getCategoryNameByAmuleId(this.instanceId, categoryId);
    } catch {
      return null;
    }
  }

  /**
   * Perform category sync when this aMule instance connects.
   * Imports aMule categories into app, pushes app categories to aMule,
   * and pushes app-wins updates back to aMule.
   * @param {Object} categoryManager - CategoryManager instance
   * @param {Object} deps - { qbittorrentAPI }
   */
  async onConnectSync(categoryManager, { qbittorrentAPI } = {}) {
    // Sync qBittorrent categories first (so aMule import sees them)
    if (qbittorrentAPI?.handler?.syncCategories) {
      try {
        await qbittorrentAPI.handler.syncCategories();
      } catch (err) {
        this.log(`⚠️ Failed to sync qBittorrent categories on connect: ${err.message}`);
      }
    }

    const amuleCategories = await this.getCategories();
    if (!amuleCategories) return;

    const { amuleColorToHex, hexColorToAmule } = require('../lib/CategoryManager');

    // Set default path from aMule's Default category (id 0)
    const defaultCat = amuleCategories.find(c => c.id === 0);
    if (defaultCat?.path) {
      categoryManager.setClientDefaultPath(this.instanceId, defaultCat.path);
    }

    const snapshot = categoryManager.getCategoriesSnapshot();
    let imported = 0, updated = 0, linked = 0;
    const toUpdateInAmule = [];

    // Phase 1: Compare aMule categories against app state
    for (const amuleCat of amuleCategories) {
      const amuleId = amuleCat.id;
      const amuleTitle = amuleCat.title || 'Untitled';

      // aMule ID 0 is always the built-in default — map to our "Default" regardless of aMule's name
      if (amuleId === 0) {
        const existingLink = snapshot.getByAmuleId(this.instanceId, 0);
        if (!existingLink || existingLink.name === 'Default') {
          // Not linked yet, or already correct
          if (!existingLink) {
            categoryManager.linkAmuleId('Default', this.instanceId, 0);
            linked++;
          }
        } else {
          // Linked to wrong category (e.g., "all" from old sync) — migrate to "Default"
          this.log(`🔄 Migrating aMule default category link from "${existingLink.name}" to "Default"`);
          delete existingLink.amuleIds[this.instanceId];
          categoryManager.linkAmuleId('Default', this.instanceId, 0);
          linked++;
        }
        continue;
      }

      let appCat = snapshot.getByAmuleId(this.instanceId, amuleId);
      if (appCat) {
        // Category exists — check if params differ (app wins)
        const appColor = hexColorToAmule(appCat.color);
        const amuleColor = amuleCat.color ?? 0xCCCCCC;
        const amuleDefaultPath = categoryManager.getClientDefaultPath(this.instanceId) || '';
        const appEffectivePath = appCat.path || amuleDefaultPath;
        const amulePath = amuleCat.path || '';

        const diffs = [];
        if (appCat.name !== amuleTitle) diffs.push(`title: "${amuleTitle}" → "${appCat.name}"`);
        if (appColor !== amuleColor) diffs.push(`color: ${amuleColor.toString(16)} → ${appColor.toString(16)}`);
        if (appEffectivePath !== amulePath) diffs.push(`path: "${amulePath}" → "${appEffectivePath}"`);
        if ((appCat.comment || '') !== (amuleCat.comment || '')) diffs.push(`comment`);
        if ((appCat.priority ?? 0) !== (amuleCat.priority ?? 0)) diffs.push(`priority`);

        if (diffs.length > 0) {
          toUpdateInAmule.push({
            id: amuleId, name: appCat.name, path: appEffectivePath,
            comment: appCat.comment || '', color: appColor, priority: appCat.priority ?? 0
          });
          updated++;
          this.log(`🔄 Category "${appCat.name}" differs from aMule: ${diffs.join(', ')}`);
        }
      } else {
        appCat = snapshot.getByName(amuleTitle);
        if (appCat) {
          // Only link if this instance doesn't already have a link for this category
          // (e.g., "Default" is already linked to ID 0 — don't overwrite with a duplicate)
          if (appCat.amuleIds?.[this.instanceId] == null) {
            categoryManager.linkAmuleId(amuleTitle, this.instanceId, amuleId);
            linked++;
          }
        } else {
          categoryManager.importCategory({
            name: amuleTitle, color: amuleColorToHex(amuleCat.color),
            path: amuleCat.path || null, comment: amuleCat.comment || 'Imported from aMule',
            priority: amuleCat.priority ?? 0, amuleIds: { [this.instanceId]: amuleId }
          });
          imported++;
        }
      }
    }

    if (imported > 0 || linked > 0) await categoryManager.save();

    // Phase 2: Push app-only categories (no amuleId for this instance) to this aMule instance
    let pushed = 0;
    for (const unlinkedCat of categoryManager.getCategoriesSnapshot().getUnlinkedFor(this.instanceId)) {
      try {
        const result = await this.createCategory({
          name: unlinkedCat.name, path: unlinkedCat.path || '',
          comment: unlinkedCat.comment || '',
          color: hexColorToAmule(unlinkedCat.color), priority: unlinkedCat.priority || 0
        });
        if (result.success && result.categoryId != null) {
          categoryManager.linkAmuleId(unlinkedCat.name, this.instanceId, result.categoryId);
          pushed++;
          this.log(`📤 Pushed category "${unlinkedCat.name}" to aMule (ID: ${result.categoryId})`);
        }
      } catch (err) {
        this.log(`⚠️ Failed to push category "${unlinkedCat.name}" to aMule: ${err.message}`);
      }
    }
    if (pushed > 0) await categoryManager.save();

    // Phase 3: Push app-wins updates back to aMule
    for (const catUpdate of toUpdateInAmule) {
      await this.editCategory(catUpdate);
    }

    this.log(`📊 aMule sync complete: ${imported} imported, ${updated} to update, ${linked} linked, ${pushed} pushed`);

    // Propagate all app categories to other connected clients that may not have them
    await categoryManager.propagateToOtherClients(this.instanceId);
    await categoryManager.validateAllPaths();
  }

  // Graceful shutdown
  async shutdown() {
    this.log('🛑 Shutting down aMule connection...');

    // Stop shared files auto-reload scheduler
    this.stopSharedFilesReloadScheduler();

    // Stop reconnection attempts
    this.clearReconnect();

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
        this.log('⚠️  Error during aMule client shutdown:', logger.errorDetail(err));
      }
      this.client = null;
    }

    this.connectionInProgress = false;
    this.log('✅ aMule connection shutdown complete');
  }
}

module.exports = { AmuleManager };