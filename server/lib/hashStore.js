const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

/**
 * HashStore - Persistent storage for hash mappings between ED2K and magnet links
 *
 * This SQLite database stores bidirectional mappings to allow Sonarr/Radarr
 * to reference downloads using magnet hashes while aMule uses ED2K hashes.
 *
 * Pattern: Follows the same approach as database.js for consistency
 */
class HashStore {
  constructor(dbPath) {
    try {
      // Ensure database directory exists
      const dbDir = path.dirname(dbPath);
      if (!fs.existsSync(dbDir)) {
        console.log(`Creating database directory: ${dbDir}`);
        fs.mkdirSync(dbDir, { recursive: true });
      }

      // Verify directory is writable
      fs.accessSync(dbDir, fs.constants.W_OK);

      // Create database with explicit options
      // fileMustExist: false allows SQLite to create the file if it doesn't exist
      this.db = new Database(dbPath, { fileMustExist: false });
      this.db.pragma('journal_mode = WAL'); // Better concurrency
      this.initSchema();

      console.log(`Hash store initialized successfully at: ${dbPath}`);
    } catch (error) {
      console.error(`Failed to initialize hash store at ${dbPath}:`, error);
      throw new Error(`Hash store initialization failed: ${error.message}. Check directory permissions for: ${path.dirname(dbPath)}`);
    }
  }

  /**
   * Initialize database schema
   */
  initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS hash_mappings (
        ed2k_hash TEXT PRIMARY KEY,
        magnet_hash TEXT NOT NULL,
        file_name TEXT,
        category TEXT,
        added_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_magnet_hash ON hash_mappings(magnet_hash);
    `);
  }

  /**
   * Store a hash mapping
   * @param {string} ed2kHash - ED2K hash (lowercase)
   * @param {string} magnetHash - Magnet hash (lowercase)
   * @param {object} metadata - Optional metadata { fileName, category, addedAt }
   */
  setMapping(ed2kHash, magnetHash, metadata = {}) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO hash_mappings
      (ed2k_hash, magnet_hash, file_name, category, added_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      ed2kHash.toLowerCase(),
      magnetHash.toLowerCase(),
      metadata.fileName || null,
      metadata.category || null,
      metadata.addedAt || Date.now()
    );
  }

  /**
   * Get magnet hash from ED2K hash
   * @param {string} ed2kHash - ED2K hash
   * @returns {string|null} Magnet hash or null if not found
   */
  getMagnetHash(ed2kHash) {
    const stmt = this.db.prepare('SELECT magnet_hash FROM hash_mappings WHERE ed2k_hash = ?');
    const result = stmt.get(ed2kHash.toLowerCase());
    return result ? result.magnet_hash : null;
  }

  /**
   * Get ED2K hash from magnet hash
   * @param {string} magnetHash - Magnet hash
   * @returns {string|null} ED2K hash or null if not found
   */
  getEd2kHash(magnetHash) {
    const stmt = this.db.prepare('SELECT ed2k_hash FROM hash_mappings WHERE magnet_hash = ?');
    const result = stmt.get(magnetHash.toLowerCase());
    return result ? result.ed2k_hash : null;
  }

  /**
   * Get full mapping information
   * @param {string} ed2kHash - ED2K hash
   * @returns {object|null} Full mapping object or null if not found
   */
  getMapping(ed2kHash) {
    const stmt = this.db.prepare('SELECT * FROM hash_mappings WHERE ed2k_hash = ?');
    return stmt.get(ed2kHash.toLowerCase());
  }

  /**
   * Remove a mapping
   * @param {string} ed2kHash - ED2K hash
   */
  removeMapping(ed2kHash) {
    const stmt = this.db.prepare('DELETE FROM hash_mappings WHERE ed2k_hash = ?');
    stmt.run(ed2kHash.toLowerCase());
  }

  /**
   * Get all mappings (for debugging)
   * @returns {Array} All hash mappings
   */
  getAllMappings() {
    const stmt = this.db.prepare('SELECT * FROM hash_mappings ORDER BY added_at DESC');
    return stmt.all();
  }

  /**
   * Cleanup old mappings (optional maintenance)
   * @param {number} retentionDays - Number of days to retain mappings
   * @returns {number} Number of deleted records
   */
  cleanupOldMappings(retentionDays = 90) {
    const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
    const stmt = this.db.prepare('DELETE FROM hash_mappings WHERE added_at < ?');
    const result = stmt.run(cutoffTime);
    return result.changes;
  }

  /**
   * Close the database connection
   */
  close() {
    this.db.close();
  }
}

module.exports = HashStore;
