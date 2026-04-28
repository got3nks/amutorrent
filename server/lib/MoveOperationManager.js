/**
 * MoveOperationManager - Manages file move operations for download clients
 *
 * Supports rtorrent, qBittorrent, and aMule clients.
 *
 * Handles the complete move workflow:
 * 1. Close/pause download (release file handles)
 * 2. Move files (rename if same filesystem, copy if cross-filesystem)
 * 3. Verify file sizes match
 * 4. Update client's directory setting
 * 5. Cleanup source files (if copy was used)
 * 6. Resume download
 *
 * Notes:
 * - rtorrent: Can have single or multi-file torrents (directories)
 * - qBittorrent: Can have single or multi-file torrents (directories)
 * - aMule: Always single files (no directory support)
 *
 * Supports recovery on restart and error handling.
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const MoveOperationsDB = require('./MoveOperationsDB');
const BaseModule = require('./BaseModule');
const logger = require('./logger');

const { itemKey } = require('./itemKey');
const clientMeta = require('./clientMeta');
const registry = require('./ClientRegistry');
const categoryManager = require('./CategoryManager');
const eventScriptingManager = require('./EventScriptingManager');

class MoveOperationManager extends BaseModule {
  constructor() {
    super();
    this.db = null;

    // Processing state
    this.isProcessing = false;
    this.activeOperations = new Map(); // hash -> operation (for status injection)
    this.cleanupInterval = null;
  }

  /**
   * Initialize the move operation manager database (synchronous)
   * Call recoverOperations() separately after clients are connected
   * @param {string} dbPath - Path to the database file
   */
  initDB(dbPath) {
    this.db = new MoveOperationsDB(dbPath);

    // Start cleanup interval (every 30 minutes)
    this.cleanupInterval = setInterval(() => {
      this.db.cleanup();
    }, 30 * 60 * 1000);

    this.log('📦 Move operation manager database initialized');
  }

  /**
   * Queue a move operation
   * @param {Object} options - Move options
   * @param {string} options.hash - Download hash
   * @param {string} options.name - Download name
   * @param {string} options.instanceId - Client instance identifier
   * @param {string} options.clientType - Client type ('rtorrent', 'qbittorrent', or 'amule')
   * @param {string} options.sourcePathRemote - Source directory (remote path as client sees it)
   * @param {string} options.destPathLocal - Destination directory (LOCAL path where app can access)
   * @param {string} options.destPathRemote - Destination directory (remote path for client)
   * @param {number} options.totalSize - Total size in bytes
   * @param {boolean} options.isMultiFile - Whether multi-file (always false for aMule)
   * @param {string} options.categoryName - Category name (for setting priority after move)
   * @returns {Object} Created operation
   */
  async queueMove({ hash, name, instanceId, clientType = 'rtorrent', sourcePathRemote, destPathLocal, destPathRemote, totalSize, isMultiFile, categoryName }) {
    if (!this.db) {
      throw new Error('Move operation manager not initialized');
    }

    // Only clients with multiFile capability can have multi-file downloads
    const actualIsMultiFile = clientMeta.hasCapability(clientType, 'multiFile') ? isMultiFile : false;

    // Translate source path from remote (client view) to local (app view)
    // Destination local path is already provided by caller from pathMappings
    const localSourcePath = categoryManager.translatePath(sourcePathRemote, clientType, instanceId);

    // If no explicit remote dest path, fall back to local (same filesystem, no Docker)
    const remoteDestPath = destPathRemote || destPathLocal;

    const operation = this.db.addOperation({
      hash,
      instanceId,
      name,
      clientType,
      sourcePath: localSourcePath,         // Local path for file operations
      destPath: destPathLocal,             // Local path for file operations
      remoteSourcePath: sourcePathRemote,  // Remote path (original client path)
      remoteDestPath: remoteDestPath,      // Remote path for client directory update
      totalSize,
      isMultiFile: actualIsMultiFile,
      categoryName
    });

    // Add to active operations for status injection (compound key)
    this.activeOperations.set(itemKey(instanceId, hash), operation);

    // Trigger queue processing
    this.processQueue();

    return operation;
  }

  /**
   * Get all active operations (for status injection)
   * @returns {Map} Map of hash -> operation
   */
  getActiveOperations() {
    return this.activeOperations;
  }

  /**
   * Process the operation queue (one at a time to avoid disk thrashing)
   */
  async processQueue() {
    if (this.isProcessing) {
      return; // Already processing
    }

    // Get next pending operation
    const pending = this.db.getByStatus('pending');
    if (pending.length === 0) {
      return;
    }

    this.isProcessing = true;
    const operation = pending[0];

    try {
      await this.executeMove(operation);
    } catch {
      // Error already logged in executeMove() with full context
    } finally {
      this.isProcessing = false;

      // Check for more operations
      const remaining = this.db.getByStatus('pending');
      if (remaining.length > 0) {
        // Small delay before processing next
        setTimeout(() => this.processQueue(), 1000);
      }
    }
  }

  /**
   * Execute a single move operation
   * @param {Object} operation - Operation record from database
   */
  async executeMove(operation) {
    const { hash, instanceId, name, clientType = 'rtorrent', sourcePath, destPath, remoteSourcePath, remoteDestPath, isMultiFile, categoryName } = operation;
    const clientDestPath = remoteDestPath || destPath;
    const key = itemKey(instanceId, hash);

    this.log(`📦 Moving: ${name} -> ${clientDestPath}`);

    try {
      // Update status to moving
      this.db.updateStatus(hash, instanceId, 'moving');
      this.updateActiveOperation(hash, instanceId);

      // Clients with native move API (qBittorrent, Deluge, Transmission) handle pause/move/resume internally
      if (clientMeta.hasCapability(clientType, 'nativeMove')) {
        await this.executeNativeMove(operation);
      } else {
        // rtorrent/aMule: Manual file move
        await this.executeManualMove(operation);
      }

      // Mark completed
      this.db.updateStatus(hash, instanceId, 'completed');
      this.activeOperations.delete(key);

      // Emit fileMoved event
      eventScriptingManager.emit('fileMoved', {
        hash: hash.toLowerCase(),
        instanceId: instanceId || null,
        filename: name,
        clientType: clientType || 'unknown',
        category: categoryName || null,
        sourcePath: remoteSourcePath || sourcePath,
        destPath: clientDestPath
      });

      // Notify success
      this.broadcastSuccess(`Moved "${name}" to ${clientDestPath}`);

      // Trigger batch update for UI refresh
      await this.triggerBatchUpdate();

      this.log(`✅ Move completed: ${name}`);

    } catch (err) {
      this.error(`❌ Move failed for ${name}: ${err.message}`);

      // Update status to failed
      this.db.updateStatus(hash, instanceId, 'failed', err.message);
      this.updateActiveOperation(hash, instanceId);

      // Try to resume download at original location (skip for clients with native move - they handle this)
      if (!clientMeta.hasCapability(clientType, 'nativeMove')) {
        try {
          await this.resumeDownload(operation);
          this.log(`🔄 Resumed download at original location: ${name}`);
        } catch (startErr) {
          this.warn(`⚠️ Failed to resume download: ${startErr.message}`);
        }

        // Cleanup any partial destination files
        await this.cleanupPartialDest(operation);
      }

      // Notify error
      this.broadcastError(`Failed to move "${name}": ${err.message}`);

      // Remove from active operations
      this.activeOperations.delete(key);

      // Trigger batch update for UI refresh
      await this.triggerBatchUpdate();

      throw err;
    }
  }

  /**
   * Execute move using the client's native move API
   * Used by clients with nativeMove capability (qBittorrent, Deluge, Transmission)
   * @param {Object} operation - Operation record
   */
  async executeNativeMove(operation) {
    const { hash, instanceId, name, clientType, remoteDestPath, destPath } = operation;
    const clientDestPath = remoteDestPath || destPath;

    const manager = this._getManagerForOp(operation);

    this.log(`📦 Using ${clientType} native move for: ${name}`);

    // Client's native API expects the parent directory, not the file/folder path
    await manager.updateDirectory(hash, clientDestPath);

    // Wait for client to complete the move
    // Timeout scales with file size assuming ~25 MB/s (5200 RPM HDD under concurrent I/O)
    // with 50% margin + 30s overhead for client internal processing
    const totalSize = operation.totalSize || 0;
    const estimatedSeconds = Math.ceil(totalSize / (25 * 1024 * 1024));
    const maxAttempts = Math.max(60, Math.ceil((estimatedSeconds * 1.5 + 30) / 30) * 30);
    const pollInterval = 1000;
    let attempts = 0;

    while (attempts < maxAttempts) {
      await this.sleep(pollInterval);
      attempts++;

      try {
        const torrents = await manager.getTorrents();
        const torrent = torrents.find(t => t.hash.toLowerCase() === hash.toLowerCase());

        if (!torrent) {
          throw new Error('Torrent not found after move');
        }

        // Check if move is complete (state is not 'moving')
        if (torrent.state !== 'moving') {
          // Verify the new path matches
          const newPath = torrent.save_path || torrent.content_path;
          if (newPath && newPath.includes(clientDestPath.split('/').pop())) {
            this.log(`📦 Native move completed: ${name} -> ${newPath}`);
            return;
          }
          // Path updated, move complete
          this.log(`📦 Native move completed: ${name}`);
          return;
        }

        // Still moving, update progress
        this.db.updateStatus(hash, instanceId, 'moving');
        this.updateActiveOperation(hash, instanceId);
      } catch (pollErr) {
        this.warn(`⚠️ Error polling move status: ${pollErr.message}`);
      }
    }

    throw new Error(`Move timed out after ${maxAttempts}s waiting for ${clientType}`);
  }

  /**
   * Execute manual file move (for rtorrent/aMule)
   * @param {Object} operation - Operation record
   */
  async executeManualMove(operation) {
    const { hash, instanceId, name, clientType, sourcePath, remoteDestPath, destPath, isMultiFile } = operation;
    const clientDestPath = remoteDestPath || destPath;

    // Step 1: Pause/close the download to release file handles
    await this.pauseDownload(operation);

    // Small delay to ensure files are released
    await this.sleep(500);

    // Step 2: Measure actual source size on disk (for incomplete downloads, this may differ from totalSize)
    let actualSourceSize;
    if (isMultiFile) {
      actualSourceSize = await this.getDirectorySize(sourcePath);
    } else {
      const sourceFilePath = path.join(sourcePath, name);
      const stats = await fs.stat(sourceFilePath);
      actualSourceSize = stats.size;
    }

    // Step 3: Move files (returns true if rename was used, false if copy was used)
    let usedRename;
    if (isMultiFile) {
      usedRename = await this.moveDirectory(operation);
    } else {
      usedRename = await this.moveSingleFile(operation);
    }

    // Step 4: Verify (compare against actual source size, not totalSize)
    this.db.updateStatus(hash, instanceId, 'verifying');
    this.updateActiveOperation(hash, instanceId);
    await this.verifyMove(operation, actualSourceSize);

    // Step 4: Update client's directory setting (use remote path)
    await this.updateClientDirectory(operation, clientDestPath);

    // Step 5: Cleanup source (skip if rename was used - source already moved)
    if (!usedRename) {
      await this.cleanupSource(operation);
    }

    // Step 6: Resume download
    await this.resumeDownload(operation);

    // Step 7: Refresh shared files if the client requires it after move (e.g. aMule)
    if (clientMeta.hasCapability(clientType, 'refreshSharedAfterMove')) {
      try {
        const manager = this._getManagerForOp(operation);
        await manager.refreshSharedFiles();
        await this.sleep(500); // Give aMule time to process
      } catch (err) {
        this.warn(`⚠️ Failed to refresh aMule shared files: ${err.message}`);
      }
    }
  }

  /**
   * Get the correct manager for a move operation via registry.
   * @param {Object} operation - Operation record (with instanceId, clientType)
   * @returns {Object} Manager instance
   * @throws {Error} If manager not found or not connected
   */
  _getManagerForOp(operation) {
    const manager = registry.get(operation.instanceId);
    if (!manager || !manager.isConnected()) {
      throw new Error(`${operation.clientType} instance "${operation.instanceId || 'default'}" not connected`);
    }
    return manager;
  }

  /**
   * Pause/close a download to release file handles
   * Skipped for clients that don't need it (e.g. aMule shared files)
   * @param {Object} operation - Operation record
   */
  async pauseDownload(operation) {
    if (!clientMeta.hasCapability(operation.clientType, 'pauseBeforeMove')) return;
    const manager = this._getManagerForOp(operation);
    await manager.stop(operation.hash);
  }

  /**
   * Resume a download after move
   * Skipped for clients that don't need it (e.g. aMule shared files)
   * @param {Object} operation - Operation record
   */
  async resumeDownload(operation) {
    if (!clientMeta.hasCapability(operation.clientType, 'pauseBeforeMove')) return;
    const manager = this._getManagerForOp(operation);
    await manager.resume(operation.hash);
  }

  /**
   * Update client's directory setting for a download
   * Each manager handles its own client API (no-op for aMule)
   * @param {Object} operation - Operation record
   * @param {string} newPath - New directory path
   */
  async updateClientDirectory(operation, newPath) {
    const manager = this._getManagerForOp(operation);
    await manager.updateDirectory(operation.hash, newPath);
  }

  /**
   * Move a single file torrent
   * @param {Object} operation - Operation record
   * @returns {boolean} True if rename was used (source already moved), false if copy was used
   */
  async moveSingleFile(operation) {
    const { hash, instanceId, name, sourcePath, destPath, totalSize } = operation;

    // For single-file torrents:
    // - sourcePath is the torrent's DIRECTORY (e.g., /home/.../temp)
    // - name is the torrent/file name (e.g., movie.mkv)
    // - The actual file is at sourcePath/name
    const sourceFilePath = path.join(sourcePath, name);
    const destFilePath = path.join(destPath, name);

    // Ensure destination directory exists
    await fs.mkdir(destPath, { recursive: true });

    // Try rename first (instant, same filesystem)
    // Falls back to copy if cross-filesystem (EXDEV error)
    const usedCopy = await this.moveOrCopyFile(sourceFilePath, destFilePath, operation, 0);

    // Update progress to 100% if rename was used (no progress events)
    if (!usedCopy) {
      this.db.updateProgress(hash, instanceId, totalSize);
      this.updateActiveOperation(hash, instanceId);
    }

    return !usedCopy; // Return true if rename was used
  }

  /**
   * Move a multi-file torrent directory
   * @param {Object} operation - Operation record
   * @returns {boolean} True if rename was used for entire directory, false if copy was used
   */
  async moveDirectory(operation) {
    const { hash, instanceId, name, sourcePath, destPath, totalSize } = operation;

    // Destination is category path + torrent name (preserve the directory name)
    const destDir = path.join(destPath, name);

    // Ensure parent directory exists
    await fs.mkdir(destPath, { recursive: true });

    // Try to rename the entire directory first (instant, same filesystem)
    try {
      await fs.rename(sourcePath, destDir);
      // Update progress to 100%
      this.db.update(hash, instanceId, { bytesMoved: totalSize, filesTotal: 1, filesMoved: 1 });
      this.updateActiveOperation(hash, instanceId);
      return true; // Rename was used - source directory no longer exists
    } catch (err) {
      if (err.code !== 'EXDEV') {
        throw err; // Re-throw if not cross-device error
      }
      // Cross-filesystem move - fall back to copy
      this.warn(`⚠️ Directory rename failed (${err.code}: ${err.message}), falling back to copy: ${name}`);
    }

    // Fall back to file-by-file copy for cross-filesystem moves
    const files = await this.listFilesRecursive(sourcePath);
    this.db.update(hash, instanceId, { filesTotal: files.length });
    this.updateActiveOperation(hash, instanceId);

    let totalBytesMoved = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const relPath = path.relative(sourcePath, file.path);
      const destFile = path.join(destDir, relPath);

      // Update current file being moved
      this.db.update(hash, instanceId, { currentFile: relPath, filesMoved: i });
      this.updateActiveOperation(hash, instanceId);

      // Ensure destination directory exists
      await fs.mkdir(path.dirname(destFile), { recursive: true });

      // Try rename, fall back to copy (for cross-fs, rename per-file will also fail)
      const usedCopy = await this.moveOrCopyFile(file.path, destFile, operation, totalBytesMoved);

      totalBytesMoved += file.size;
      if (!usedCopy) {
        // Update progress since rename doesn't emit events
        this.db.updateProgress(hash, instanceId, totalBytesMoved);
        this.updateActiveOperation(hash, instanceId);
      }
    }

    // Final update
    this.db.update(hash, instanceId, { filesMoved: files.length, bytesMoved: totalBytesMoved });
    this.updateActiveOperation(hash, instanceId);

    return false; // Copy was used - source files need cleanup
  }

  /**
   * Move or copy a file (tries rename first, falls back to copy)
   * @param {string} src - Source file path
   * @param {string} dest - Destination file path
   * @param {Object} operation - Operation record (for hash/instanceId progress updates)
   * @param {number} baseBytes - Bytes already moved (for progress)
   * @returns {boolean} True if copy was used, false if rename was used
   */
  async moveOrCopyFile(src, dest, operation, baseBytes) {
    try {
      // Try rename first (instant, same filesystem)
      await fs.rename(src, dest);
      return false; // Rename was used
    } catch (err) {
      if (err.code !== 'EXDEV') {
        throw err; // Re-throw if not cross-device error
      }
      // Fall back to copy for cross-filesystem
      this.warn(`⚠️ File rename failed (${err.code}: ${err.message}), falling back to copy: ${path.basename(src)}`);
      await this.copyFileWithProgress(src, dest, operation, baseBytes);
      return true; // Copy was used
    }
  }

  /**
   * List all files in a directory recursively
   * @param {string} dir - Directory path
   * @returns {Array} Array of { path, size } objects
   */
  async listFilesRecursive(dir) {
    const files = [];

    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        const subFiles = await this.listFilesRecursive(fullPath);
        files.push(...subFiles);
      } else if (entry.isFile()) {
        const stats = await fs.stat(fullPath);
        files.push({ path: fullPath, size: stats.size });
      }
    }

    return files;
  }

  /**
   * Copy a file with progress tracking
   * @param {string} src - Source file path
   * @param {string} dest - Destination file path
   * @param {Object} operation - Operation record (for hash/instanceId progress updates)
   * @param {number} baseBytes - Bytes already moved (for multi-file)
   * @returns {number} Total bytes moved including this file
   */
  async copyFileWithProgress(src, dest, operation, baseBytes) {
    const { hash, instanceId } = operation;
    return new Promise((resolve, reject) => {
      const readStream = fsSync.createReadStream(src);
      const writeStream = fsSync.createWriteStream(dest);

      let bytesCopied = 0;
      let lastUpdate = Date.now();

      readStream.on('data', (chunk) => {
        bytesCopied += chunk.length;

        // Throttle DB updates to every 500ms
        const now = Date.now();
        if (now - lastUpdate > 500) {
          this.db.updateProgress(hash, instanceId, baseBytes + bytesCopied);
          this.updateActiveOperation(hash, instanceId);
          lastUpdate = now;
        }
      });

      readStream.on('error', (err) => {
        writeStream.destroy();
        reject(err);
      });

      writeStream.on('error', (err) => {
        readStream.destroy();
        reject(err);
      });

      writeStream.on('finish', () => {
        resolve(baseBytes + bytesCopied);
      });

      readStream.pipe(writeStream);
    });
  }

  /**
   * Verify that move completed successfully by comparing sizes
   * @param {Object} operation - Operation record
   * @param {number} expectedSize - Actual source size measured before move (handles incomplete downloads)
   */
  async verifyMove(operation, expectedSize) {
    const { name, destPath, isMultiFile } = operation;

    if (isMultiFile) {
      // For directories, check total size (destPath + name = actual directory)
      const destDir = path.join(destPath, name);
      const destSize = await this.getDirectorySize(destDir);
      if (destSize !== expectedSize) {
        throw new Error(`Size mismatch: expected ${expectedSize}, got ${destSize}`);
      }
    } else {
      // For single file: sourcePath is directory, name is the filename
      const destFilePath = path.join(destPath, name);

      const stats = await fs.stat(destFilePath);
      if (stats.size !== expectedSize) {
        throw new Error(`Size mismatch: expected ${expectedSize}, got ${stats.size}`);
      }
    }
  }

  /**
   * Get total size of a directory
   * @param {string} dir - Directory path
   * @returns {number} Total size in bytes
   */
  async getDirectorySize(dir) {
    let totalSize = 0;

    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        totalSize += await this.getDirectorySize(fullPath);
      } else if (entry.isFile()) {
        const stats = await fs.stat(fullPath);
        totalSize += stats.size;
      }
    }

    return totalSize;
  }

  /**
   * Cleanup source files after successful move
   * @param {Object} operation - Operation record
   */
  async cleanupSource(operation) {
    const { name, sourcePath, isMultiFile } = operation;

    try {
      if (isMultiFile) {
        await fs.rm(sourcePath, { recursive: true, force: true });
      } else {
        // For single file: sourcePath is directory, name is the filename
        const sourceFilePath = path.join(sourcePath, name);
        await fs.unlink(sourceFilePath);
      }
    } catch (err) {
      // Log but don't fail - files might be in use
      this.warn(`⚠️ Could not cleanup source: ${err.message}`);
    }
  }

  /**
   * Cleanup partial destination files after failed move
   * @param {Object} operation - Operation record
   */
  async cleanupPartialDest(operation) {
    const { name, destPath, isMultiFile } = operation;

    try {
      if (isMultiFile) {
        // Check if dest directory was created and is empty or partial (destPath + name)
        const destDir = path.join(destPath, name);
        const stats = await fs.stat(destDir).catch(() => null);
        if (stats?.isDirectory()) {
          await fs.rm(destDir, { recursive: true, force: true });
          this.log(`🧹 Cleaned up partial destination: ${destDir}`);
        }
      } else {
        // Remove partial file: name is the filename
        const destFilePath = path.join(destPath, name);
        await fs.unlink(destFilePath).catch(() => {});
      }
    } catch (err) {
      this.warn(`⚠️ Could not cleanup partial destination: ${err.message}`);
    }
  }

  /**
   * Recover interrupted operations on startup
   * Should be called after clients are connected (from initializeServices)
   */
  async recoverOperations() {
    const active = this.db.getActive();

    if (active.length === 0) {
      this.log('📦 No interrupted move operations to recover');
      // Still start queue processing for any new operations
      this.processQueue();
      return;
    }

    this.log(`📦 Found ${active.length} interrupted move operation(s)`);

    for (const op of active) {
      const clientType = op.clientType || 'rtorrent';

      if (op.status === 'pending') {
        // Pending operations can be re-queued (compound key)
        this.activeOperations.set(itemKey(op.instanceId, op.hash), op);
        this.log(`📦 Re-queued pending operation: ${op.name} (${clientType})`);
      } else if (op.status === 'moving' || op.status === 'verifying') {
        // Interrupted mid-move - mark as failed and cleanup
        this.log(`📦 Marking interrupted operation as failed: ${op.name} (${clientType})`);
        this.db.updateStatus(op.hash, op.instanceId, 'failed', 'Operation interrupted by restart');
        await this.cleanupPartialDest(op);

        // Try to resume download at original location
        try {
          await this.resumeDownload(op);
        } catch (err) {
          this.warn(`⚠️ Could not resume download: ${err.message}`);
        }
      }
    }

    // Start processing queue for any re-queued pending operations
    this.processQueue();
  }

  /**
   * Update active operation cache from database
   * @param {string} hash - Torrent hash
   * @param {string} instanceId - Instance ID
   */
  updateActiveOperation(hash, instanceId) {
    const op = this.db.getByHash(hash, instanceId);
    if (op) {
      this.activeOperations.set(itemKey(instanceId, hash), op);
    }
  }

  /**
   * Broadcast success message to all clients
   * @param {string} message - Success message
   */
  broadcastSuccess(message) {
    if (this.broadcast) {
      this.broadcast({ type: 'success', message });
    }
  }

  /**
   * Broadcast error message to all clients
   * @param {string} message - Error message
   */
  broadcastError(message) {
    if (this.broadcast) {
      this.broadcast({ type: 'error', message });
    }
  }

  /**
   * Trigger batch update for UI refresh
   */
  async triggerBatchUpdate() {
    try {
      if (this.broadcast) {
        // Lazy require to avoid circular dependency (DataFetchService imports MoveOperationManager)
        const dataFetchService = require('./DataFetchService');
        const batchData = await dataFetchService.getBatchData();
        this.broadcast({ type: 'batch-update', data: { items: batchData.items } }, {
          transform: (msg, user) => {
            const items = msg.data.items || [];
            if (!user || user.isAdmin || user.capabilities?.includes('view_all_downloads')) {
              // Annotate items with ownership flag for frontend mutation gating
              if (!user?.userId || !this.userManager || user?.isAdmin) {
                return { ...msg, data: { ...msg.data, items: items.map(i => ({ ...i, ownedByMe: true })) } };
              }
              const ownedKeys = this.userManager.getOwnedKeys(user.userId);
              return { ...msg, data: { ...msg.data, items: items.map(i => ({ ...i, ownedByMe: ownedKeys.has(itemKey(i.instanceId, i.hash)) })) } };
            }
            // Ownership-filtered — all surviving items are owned
            if (!user.userId || !this.userManager) return msg;
            const ownedKeys = this.userManager.getOwnedKeys(user.userId);
            return {
              ...msg,
              data: {
                ...msg.data,
                items: items.filter(item => ownedKeys.has(itemKey(item.instanceId, item.hash))).map(i => ({ ...i, ownedByMe: true }))
              }
            };
          }
        });
      }
    } catch (err) {
      this.warn(`⚠️ Could not trigger batch update: ${err.message}`);
    }
  }

  /**
   * Sleep helper
   * @param {number} ms - Milliseconds to sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Shutdown the manager
   */
  async shutdown() {
    this.log('📦 Shutting down move operation manager...');

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    if (this.db) {
      this.db.close();
      this.db = null;
    }

    this.log('📦 Move operation manager shutdown complete');
  }
}

module.exports = new MoveOperationManager();
