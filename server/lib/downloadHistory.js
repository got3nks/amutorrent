/**
 * DownloadHistory - Persistent storage for download history tracking
 *
 * Tracks all downloads with their status (downloading, completed, missing, deleted)
 * to provide a history view even after files are moved or deleted.
 *
 * Uses versioned migrations to handle schema upgrades.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const logger = require('./logger');
const eventScriptingManager = require('./EventScriptingManager');

// Current schema version - increment when adding new migrations
const CURRENT_VERSION = 3;

class DownloadHistory {
  constructor(dbPath) {
    try {
      // Ensure database directory exists
      const dbDir = path.dirname(dbPath);
      if (!fs.existsSync(dbDir)) {
        logger.log(`Creating database directory: ${dbDir}`);
        fs.mkdirSync(dbDir, { recursive: true });
      }

      // Verify directory is writable
      fs.accessSync(dbDir, fs.constants.W_OK);

      // Create database
      this.db = new Database(dbPath, { fileMustExist: false });
      this.db.pragma('journal_mode = WAL');
      this.initSchema();

      logger.log(`📜 Download history initialized: ${dbPath} (schema v${this.getVersion()})`);
    } catch (error) {
      logger.error(`Failed to initialize download history at ${dbPath}:`, error);
      throw new Error(`Download history initialization failed: ${error.message}`);
    }
  }

  /**
   * Initialize database schema with versioned migrations
   */
  initSchema() {
    // Create schema_version table if not exists
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        version INTEGER NOT NULL DEFAULT 0
      );
    `);

    // Get current version (or detect from existing database)
    let currentVersion = this.getVersion();

    if (currentVersion === null) {
      // No version record - detect existing state
      currentVersion = this.detectExistingVersion();
      this.setVersion(currentVersion);
      logger.log(`📜 History: Detected existing database at version ${currentVersion}`);
    }

    // Run any pending migrations
    this.runMigrations(currentVersion);
  }

  /**
   * Get current schema version
   * @returns {number|null} Current version or null if not set
   */
  getVersion() {
    try {
      const row = this.db.prepare('SELECT version FROM schema_version WHERE id = 1').get();
      return row ? row.version : null;
    } catch {
      return null;
    }
  }

  /**
   * Set schema version
   * @param {number} version - Version to set
   */
  setVersion(version) {
    this.db.prepare(`
      INSERT INTO schema_version (id, version) VALUES (1, ?)
      ON CONFLICT(id) DO UPDATE SET version = excluded.version
    `).run(version);
  }

  /**
   * Detect version from existing database state (for pre-versioning databases)
   * @returns {number} Detected version
   */
  detectExistingVersion() {
    // Check if download_history table exists
    const tableExists = this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='download_history'"
    ).get();

    if (!tableExists) {
      return 0; // Fresh database
    }

    // Table exists - check for client_type column (added in v1)
    const columns = this.db.prepare("PRAGMA table_info(download_history)").all();
    const hasClientType = columns.some(col => col.name === 'client_type');

    return hasClientType ? 1 : 0;
  }

  /**
   * Run all pending migrations from current version to latest
   * @param {number} fromVersion - Current version
   */
  runMigrations(fromVersion) {
    const migrations = this.getMigrations();

    for (const migration of migrations) {
      if (migration.version > fromVersion) {
        logger.log(`📜 History: Running migration v${fromVersion} → v${migration.version}`);
        try {
          migration.up.call(this);
          this.setVersion(migration.version);
          logger.log(`📜 History: Migration to v${migration.version} completed`);
        } catch (err) {
          logger.error(`📜 History: Migration to v${migration.version} failed:`, err.message);
          throw err;
        }
      }
    }
  }

  /**
   * Define all migrations
   * Each migration has a version number and an up() function
   * @returns {Array} Array of migration objects
   */
  getMigrations() {
    return [
      {
        // Version 1: Initial schema with client_type support
        version: 1,
        up: function() {
          // Create table if not exists (for fresh databases)
          this.db.exec(`
            CREATE TABLE IF NOT EXISTS download_history (
              hash TEXT PRIMARY KEY,
              filename TEXT NOT NULL,
              size INTEGER,
              started_at TEXT NOT NULL,
              completed_at TEXT,
              deleted_at TEXT,
              username TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_started_at ON download_history(started_at);
            CREATE INDEX IF NOT EXISTS idx_completed_at ON download_history(completed_at);
          `);

          // Add client_type column if missing (for existing databases)
          const columns = this.db.prepare("PRAGMA table_info(download_history)").all();
          if (!columns.some(col => col.name === 'client_type')) {
            this.db.exec("ALTER TABLE download_history ADD COLUMN client_type TEXT DEFAULT 'amule'");
          }

          // Create index on client_type
          this.db.exec("CREATE INDEX IF NOT EXISTS idx_client_type ON download_history(client_type);");
        }
      },
      {
        // Version 2: Add status column for pre-computed status
        // Status is now maintained by background task instead of computed on each request
        version: 2,
        up: function() {
          const columns = this.db.prepare("PRAGMA table_info(download_history)").all();

          // Add status column if missing
          if (!columns.some(col => col.name === 'status')) {
            this.db.exec("ALTER TABLE download_history ADD COLUMN status TEXT DEFAULT 'downloading'");
          }

          // Add last_seen_at column to track when entry was last seen in download queue
          if (!columns.some(col => col.name === 'last_seen_at')) {
            this.db.exec("ALTER TABLE download_history ADD COLUMN last_seen_at TEXT");
          }

          // Initialize status for existing entries based on current state
          this.db.exec(`
            UPDATE download_history SET status = 'deleted' WHERE deleted_at IS NOT NULL AND status != 'deleted';
            UPDATE download_history SET status = 'completed' WHERE completed_at IS NOT NULL AND deleted_at IS NULL AND status != 'completed';
            UPDATE download_history SET status = 'downloading' WHERE completed_at IS NULL AND deleted_at IS NULL;
          `);

          // Create index on status for filtering
          this.db.exec("CREATE INDEX IF NOT EXISTS idx_status ON download_history(status);");
        }
      },
      {
        // Version 3: Add transfer stats columns (downloaded, uploaded, ratio, tracker_domain)
        // These are persisted to DB instead of only being enriched from live data
        version: 3,
        up: function() {
          const columns = this.db.prepare("PRAGMA table_info(download_history)").all();

          // Add downloaded column (bytes downloaded)
          if (!columns.some(col => col.name === 'downloaded')) {
            this.db.exec("ALTER TABLE download_history ADD COLUMN downloaded INTEGER DEFAULT 0");
          }

          // Add uploaded column (bytes uploaded)
          if (!columns.some(col => col.name === 'uploaded')) {
            this.db.exec("ALTER TABLE download_history ADD COLUMN uploaded INTEGER DEFAULT 0");
          }

          // Add ratio column
          if (!columns.some(col => col.name === 'ratio')) {
            this.db.exec("ALTER TABLE download_history ADD COLUMN ratio REAL DEFAULT 0");
          }

          // Add tracker_domain column (for rtorrent)
          if (!columns.some(col => col.name === 'tracker_domain')) {
            this.db.exec("ALTER TABLE download_history ADD COLUMN tracker_domain TEXT");
          }
        }
      }
    ];
  }

  /**
   * Add a new download to history
   * @param {string} hash - File hash (ED2K for aMule, info hash for rtorrent)
   * @param {string} filename - File name
   * @param {number} size - File size in bytes
   * @param {string} username - Optional username from proxy auth
   * @param {string} clientType - Client type ('amule' or 'rtorrent')
   * @param {string} category - Optional category name
   */
  addDownload(hash, filename, size, username = null, clientType = 'amule', category = null) {
    const stmt = this.db.prepare(`
      INSERT INTO download_history (hash, filename, size, started_at, username, client_type)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(hash) DO UPDATE SET
        filename = excluded.filename,
        size = excluded.size,
        started_at = excluded.started_at,
        deleted_at = NULL,
        status = 'downloading',
        client_type = excluded.client_type
    `);

    stmt.run(
      hash.toLowerCase(),
      filename,
      size || null,
      new Date().toISOString(),
      username,
      clientType
    );

    logger.log(`📥 History: Added ${clientType} download - ${filename}`);

    // Emit downloadAdded event
    eventScriptingManager.emit('downloadAdded', {
      hash: hash.toLowerCase(),
      filename,
      size: size || null,
      username,
      clientType,
      category: category || null
    });
  }

  /**
   * Mark a download as completed
   * @param {string} hash - ED2K hash
   */
  markCompleted(hash) {
    const stmt = this.db.prepare(`
      UPDATE download_history
      SET completed_at = ?, status = 'completed'
      WHERE hash = ? AND completed_at IS NULL
    `);

    const result = stmt.run(new Date().toISOString(), hash.toLowerCase());

    if (result.changes > 0) {
      logger.log(`✅ History: Marked completed - ${hash}`);
    }
  }

  /**
   * Mark a download as deleted (soft delete)
   * @param {string} hash - ED2K hash
   */
  markDeleted(hash) {
    const stmt = this.db.prepare(`
      UPDATE download_history
      SET deleted_at = ?, status = 'deleted'
      WHERE hash = ? AND deleted_at IS NULL
    `);

    const result = stmt.run(new Date().toISOString(), hash.toLowerCase());

    if (result.changes > 0) {
      logger.log(`🗑️ History: Marked deleted - ${hash}`);
    }
  }

  /**
   * Batch update status for entries seen in current downloads
   * Called by background task to keep status in sync
   * @param {Set<string>} activeHashes - Set of hashes currently downloading
   * @param {Set<string>} completedHashes - Set of hashes that are completed
   * @param {Map<string, Object>} metadataMap - Map of hash to metadata for updates
   *   Each entry can have: size, name, downloaded, uploaded, ratio, trackerDomain
   */
  batchUpdateFromLiveData(activeHashes, completedHashes, metadataMap = new Map()) {
    const now = new Date().toISOString();

    // Update entries that are currently downloading
    if (activeHashes.size > 0) {
      const updateActive = this.db.prepare(`
        UPDATE download_history
        SET status = 'downloading', last_seen_at = ?
        WHERE hash = ? AND status != 'deleted'
      `);

      for (const hash of activeHashes) {
        updateActive.run(now, hash.toLowerCase());

        // Update metadata if available
        const meta = metadataMap.get(hash.toLowerCase());
        if (meta) {
          if (meta.size) this.updateSize(hash, meta.size);
          if (meta.name) this.updateFilename(hash, meta.name);
          this.updateTransferStats(hash, meta);
        }
      }
    }

    // Update entries that completed
    if (completedHashes.size > 0) {
      const updateCompleted = this.db.prepare(`
        UPDATE download_history
        SET status = 'completed', completed_at = COALESCE(completed_at, ?), last_seen_at = ?
        WHERE hash = ? AND status NOT IN ('deleted', 'completed')
      `);

      for (const hash of completedHashes) {
        const result = updateCompleted.run(now, now, hash.toLowerCase());

        // Update metadata if available
        const meta = metadataMap.get(hash.toLowerCase());
        if (meta) {
          if (meta.size) this.updateSize(hash, meta.size);
          if (meta.name) this.updateFilename(hash, meta.name);
          this.updateTransferStats(hash, meta);
        }

        // Emit downloadFinished event only when status actually changed (not already completed)
        if (result.changes > 0) {
          // Get the entry to have complete data for the event
          const entry = this.getByHash(hash);
          if (entry) {
            // Build full path: directory/filename for all clients
            const dir = meta?.directory || null;
            const fullPath = dir ? `${dir.replace(/\/+$/, '')}/${entry.filename}` : null;

            eventScriptingManager.emit('downloadFinished', {
              hash: hash.toLowerCase(),
              filename: entry.filename,
              size: entry.size,
              clientType: meta?.clientType || entry.client_type || 'unknown',
              downloaded: entry.downloaded || 0,
              uploaded: entry.uploaded || 0,
              ratio: Math.round((entry.ratio || 0) * 100) / 100,
              trackerDomain: entry.tracker_domain || null,
              category: meta?.category || null,
              path: fullPath,
              multiFile: meta?.multiFile || false
            });
          }
        }
      }
    }

    // Mark entries as missing if they were downloading but haven't been seen recently
    // (more than 30 seconds since last seen)
    const cutoff = new Date(Date.now() - 30000).toISOString();
    const updateMissing = this.db.prepare(`
      UPDATE download_history
      SET status = 'missing'
      WHERE status = 'downloading'
        AND (last_seen_at IS NULL OR last_seen_at < ?)
    `);
    updateMissing.run(cutoff);
  }

  /**
   * Update transfer statistics for an entry
   * @param {string} hash - File hash
   * @param {Object} stats - Stats object with downloaded, uploaded, ratio, trackerDomain
   */
  updateTransferStats(hash, stats) {
    if (!stats) return;

    const updates = [];
    const params = [];

    // Only update downloaded if it's greater than current (monotonically increasing)
    if (stats.downloaded != null && stats.downloaded > 0) {
      updates.push('downloaded = MAX(COALESCE(downloaded, 0), ?)');
      params.push(stats.downloaded);
    }

    // Only update uploaded if it's greater than current (monotonically increasing)
    if (stats.uploaded != null && stats.uploaded > 0) {
      updates.push('uploaded = MAX(COALESCE(uploaded, 0), ?)');
      params.push(stats.uploaded);
    }

    // Update ratio
    if (stats.ratio != null && stats.ratio > 0) {
      updates.push('ratio = ?');
      params.push(stats.ratio);
    }

    // Update tracker domain (only if not already set)
    if (stats.trackerDomain) {
      updates.push('tracker_domain = COALESCE(tracker_domain, ?)');
      params.push(stats.trackerDomain);
    }

    if (updates.length === 0) return;

    params.push(hash.toLowerCase());
    const stmt = this.db.prepare(`
      UPDATE download_history
      SET ${updates.join(', ')}
      WHERE hash = ?
    `);
    stmt.run(...params);
  }

  /**
   * Update size for an entry (used when size becomes known later, e.g., from magnet)
   * Only updates if new size is larger (to handle magnets that initially report tiny/invalid sizes)
   * Ignores sizes < 1KB as these are likely invalid (unresolved magnets may report 0 or 1 byte)
   * @param {string} hash - File hash
   * @param {number} size - Size in bytes
   */
  updateSize(hash, size) {
    // Ignore invalid sizes (less than 1KB is almost certainly wrong for any real torrent/file)
    if (!size || size < 1024) return;
    const stmt = this.db.prepare(`
      UPDATE download_history
      SET size = ?
      WHERE hash = ? AND (size IS NULL OR size < ?)
    `);
    stmt.run(size, hash.toLowerCase(), size);
  }

  /**
   * Update filename for an entry (used when name becomes known later, e.g., from magnet)
   * @param {string} hash - File hash
   * @param {string} filename - New filename
   */
  updateFilename(hash, filename) {
    if (!filename) return;
    const stmt = this.db.prepare(`
      UPDATE download_history
      SET filename = ?
      WHERE hash = ? AND (filename = 'Unknown' OR filename = 'Magnet download' OR filename = 'Torrent download')
    `);
    const result = stmt.run(filename, hash.toLowerCase());
    if (result.changes > 0) {
      logger.log(`📝 History: Updated filename to "${filename}" for hash ${hash}`);
    }
  }

  /**
   * Remove entry from history permanently (hard delete)
   * @param {string} hash - ED2K hash
   * @returns {boolean} True if entry was deleted
   */
  removeEntry(hash) {
    const stmt = this.db.prepare('DELETE FROM download_history WHERE hash = ?');
    const result = stmt.run(hash.toLowerCase());

    if (result.changes > 0) {
      logger.log(`🗑️ History: Removed entry - ${hash}`);
      return true;
    }
    return false;
  }

  /**
   * Get all pending downloads (started but not completed or deleted)
   * Used for completion detection on startup/refresh
   * @returns {Array} Pending download entries
   */
  getPendingDownloads() {
    const stmt = this.db.prepare(`
      SELECT * FROM download_history
      WHERE completed_at IS NULL AND deleted_at IS NULL
    `);
    return stmt.all();
  }

  /**
   * Get history entry by hash
   * @param {string} hash - ED2K hash
   * @returns {object|null} History entry or null
   */
  getByHash(hash) {
    const stmt = this.db.prepare('SELECT * FROM download_history WHERE hash = ?');
    return stmt.get(hash.toLowerCase());
  }

  /**
   * Get all known hashes from the database
   * Used for detecting externally added downloads
   * @returns {Set<string>} Set of lowercase hashes
   */
  getKnownHashes() {
    const stmt = this.db.prepare('SELECT hash FROM download_history');
    const rows = stmt.all();
    return new Set(rows.map(r => r.hash.toLowerCase()));
  }

  /**
   * Add externally detected download (not added through the web UI)
   * @param {string} hash - File hash
   * @param {string} filename - File name
   * @param {number} size - File size in bytes
   * @param {string} clientType - Client type ('amule' or 'rtorrent')
   * @param {string} category - Optional category name
   */
  addExternalDownload(hash, filename, size, clientType = 'amule', category = null) {
    this.addDownload(hash, filename, size, 'external', clientType, category);
    logger.log(`📥 History: Detected external ${clientType} download - ${filename}`);
  }

  /**
   * Get all history entries with pagination and optional search
   * @param {number} limit - Max entries to return (0 = no limit)
   * @param {number} offset - Offset for pagination
   * @param {string} sortBy - Column to sort by
   * @param {string} sortDir - Sort direction (asc/desc)
   * @param {string} search - Optional search term for filename/hash
   * @param {string} secondarySortBy - Secondary sort column (optional)
   * @param {string} secondarySortDir - Secondary sort direction (optional)
   * @returns {object} { entries, total }
   */
  getHistory(limit = 50, offset = 0, sortBy = 'started_at', sortDir = 'desc', search = '', secondarySortBy = '', secondarySortDir = 'asc') {
    // Validate sort column to prevent SQL injection
    const validColumns = ['filename', 'size', 'started_at', 'completed_at', 'deleted_at', 'username', 'downloaded', 'uploaded', 'ratio', 'tracker_domain'];
    const column = validColumns.includes(sortBy) ? sortBy : 'started_at';
    const direction = sortDir.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    // Validate secondary sort column
    const secondaryColumn = validColumns.includes(secondarySortBy) ? secondarySortBy : '';
    const secondaryDirection = secondarySortDir.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    // Build WHERE clause for search
    let whereClause = '';
    const params = [];

    if (search && search.trim()) {
      const searchTerm = `%${search.trim().toLowerCase()}%`;
      whereClause = 'WHERE (LOWER(filename) LIKE ? OR LOWER(hash) LIKE ? OR LOWER(username) LIKE ? OR LOWER(COALESCE(tracker_domain, \'\')) LIKE ?)';
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // Get total count with search filter
    const countStmt = this.db.prepare(`SELECT COUNT(*) as total FROM download_history ${whereClause}`);
    const { total } = countStmt.get(...params);

    // Build ORDER BY clause
    let orderClause;
    if (column === 'completed_at') {
      // Special case: when sorting by completed_at, add status priority for non-completed items
      const statusOrder = `CASE status WHEN 'downloading' THEN 1 WHEN 'missing' THEN 2 WHEN 'deleted' THEN 3 ELSE 4 END`;
      orderClause = `${column} ${direction}, ${statusOrder}`;
    } else if (secondaryColumn && secondaryColumn !== column) {
      // Add secondary sort if different from primary
      orderClause = `${column} ${direction}, ${secondaryColumn} ${secondaryDirection}`;
    } else {
      orderClause = `${column} ${direction}`;
    }

    // Get entries with pagination
    let query = `
      SELECT * FROM download_history
      ${whereClause}
      ORDER BY ${orderClause}
    `;

    // Add LIMIT/OFFSET only if limit > 0
    if (limit > 0) {
      query += ' LIMIT ? OFFSET ?';
      params.push(limit, offset);
    }

    const stmt = this.db.prepare(query);
    const entries = stmt.all(...params);

    return { entries, total };
  }

  /**
   * Cleanup old entries based on retention policy
   * @param {number} retentionDays - Days to retain (0 = never delete)
   * @returns {number} Number of deleted records
   */
  cleanup(retentionDays) {
    if (retentionDays <= 0) {
      return 0;
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const stmt = this.db.prepare(`
      DELETE FROM download_history
      WHERE started_at < ?
    `);

    const result = stmt.run(cutoffDate.toISOString());

    if (result.changes > 0) {
      logger.log(`🧹 History: Cleaned up ${result.changes} old entries`);
    }

    return result.changes;
  }

  /**
   * Get statistics
   * @returns {object} History statistics
   */
  getStats() {
    const stmt = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN completed_at IS NOT NULL AND deleted_at IS NULL THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) as deleted,
        SUM(CASE WHEN completed_at IS NULL AND deleted_at IS NULL THEN 1 ELSE 0 END) as pending
      FROM download_history
    `);
    return stmt.get();
  }

  /**
   * Close the database connection
   */
  close() {
    this.db.close();
  }
}

module.exports = DownloadHistory;
