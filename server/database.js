const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

/**
 * MetricsDB - SQLite database for storing historical metrics
 * Tracks upload/download speeds and cumulative data transferred
 */
class MetricsDB {
  constructor(dbPath) {
    // Ensure database directory exists
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL'); // Better concurrency
    this.initSchema();
  }

  /**
   * Initialize database schema
   */
  initSchema() {
    // Create tables if they don't exist
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        upload_speed INTEGER NOT NULL,
        download_speed INTEGER NOT NULL,
        total_uploaded INTEGER DEFAULT 0,
        total_downloaded INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp);

      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    // Initialize metadata with default values
    const initMetadata = this.db.prepare(
      'INSERT OR IGNORE INTO metadata (key, value) VALUES (?, ?)'
    );
    initMetadata.run('last_total_uploaded', '0');
    initMetadata.run('last_total_downloaded', '0');
    initMetadata.run('schema_version', '1');
  }

  /**
   * Insert a new metric record
   * @param {number} uploadSpeed - Upload speed in bytes/sec
   * @param {number} downloadSpeed - Download speed in bytes/sec
   * @param {number|null} totalUploaded - Optional: actual total uploaded (if available from aMule)
   * @param {number|null} totalDownloaded - Optional: actual total downloaded (if available from aMule)
   * @returns {object} Inserted metric data
   */
  insertMetric(uploadSpeed, downloadSpeed, totalUploaded = null, totalDownloaded = null) {
    const timestamp = Date.now();

    // Get last totals from metadata
    const getMetadata = this.db.prepare('SELECT value FROM metadata WHERE key = ?');
    const lastUploaded = parseInt(getMetadata.get('last_total_uploaded').value);
    const lastDownloaded = parseInt(getMetadata.get('last_total_downloaded').value);

    // If totals are provided by aMule, use them directly
    // Otherwise, calculate based on speed (speed in bytes/sec * 3 seconds)
    let newTotalUploaded, newTotalDownloaded;

    if (totalUploaded !== null && totalDownloaded !== null) {
      // Use aMule's provided totals
      newTotalUploaded = totalUploaded;
      newTotalDownloaded = totalDownloaded;
    } else {
      // Calculate from speed (fallback)
      const uploadDelta = uploadSpeed * 3;
      const downloadDelta = downloadSpeed * 3;
      newTotalUploaded = lastUploaded + uploadDelta;
      newTotalDownloaded = lastDownloaded + downloadDelta;
    }

    // Insert metric
    const insert = this.db.prepare(
      'INSERT INTO metrics (timestamp, upload_speed, download_speed, total_uploaded, total_downloaded) VALUES (?, ?, ?, ?, ?)'
    );
    insert.run(timestamp, uploadSpeed, downloadSpeed, newTotalUploaded, newTotalDownloaded);

    // Update metadata with new totals
    const updateMeta = this.db.prepare('UPDATE metadata SET value = ? WHERE key = ?');
    updateMeta.run(newTotalUploaded.toString(), 'last_total_uploaded');
    updateMeta.run(newTotalDownloaded.toString(), 'last_total_downloaded');

    return {
      timestamp,
      uploadSpeed,
      downloadSpeed,
      totalUploaded: newTotalUploaded,
      totalDownloaded: newTotalDownloaded
    };
  }

  /**
   * Get raw metrics within a time range
   * @param {number} startTime - Start timestamp in milliseconds
   * @param {number} endTime - End timestamp in milliseconds
   * @param {number} limit - Maximum number of records to return
   * @returns {array} Array of metric records
   */
  getMetrics(startTime, endTime, limit = 10000) {
    const query = this.db.prepare(`
      SELECT * FROM metrics
      WHERE timestamp BETWEEN ? AND ?
      ORDER BY timestamp ASC
      LIMIT ?
    `);
    return query.all(startTime, endTime, limit);
  }

  /**
   * Get aggregated metrics within a time range
   * Aggregates data into time buckets for efficient charting
   * @param {number} startTime - Start timestamp in milliseconds
   * @param {number} endTime - End timestamp in milliseconds
   * @param {number} bucketSize - Bucket size in milliseconds
   * @returns {array} Array of aggregated metric records
   */
  getAggregatedMetrics(startTime, endTime, bucketSize) {
    const query = this.db.prepare(`
      SELECT
        (CAST(timestamp / ? AS INTEGER)) * ? as bucket,
        AVG(upload_speed) as avg_upload_speed,
        AVG(download_speed) as avg_download_speed,
        MAX(total_uploaded) - MIN(total_uploaded) as uploaded_delta,
        MAX(total_downloaded) - MIN(total_downloaded) as downloaded_delta
      FROM metrics
      WHERE timestamp BETWEEN ? AND ?
      GROUP BY CAST(timestamp / ? AS INTEGER)
      ORDER BY bucket ASC
    `);
    return query.all(bucketSize, bucketSize, startTime, endTime, bucketSize);
  }

  /**
   * Clean up old data based on retention period
   * @param {number} retentionDays - Number of days to retain
   * @returns {number} Number of records deleted
   */
  cleanupOldData(retentionDays = 365) {
    const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
    const deleteStmt = this.db.prepare('DELETE FROM metrics WHERE timestamp < ?');
    const result = deleteStmt.run(cutoffTime);
    return result.changes;
  }

  /**
   * Get total count of metrics records
   * @returns {number} Total count
   */
  getMetricsCount() {
    const query = this.db.prepare('SELECT COUNT(*) as count FROM metrics');
    return query.get().count;
  }

  /**
   * Close database connection
   */
  close() {
    this.db.close();
  }
}

module.exports = MetricsDB;
