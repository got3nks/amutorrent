const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { daysToMs } = require('./lib/timeRange');
const logger = require('./lib/logger');

/**
 * MetricsDB - SQLite database for storing historical metrics
 * Tracks upload/download speeds and cumulative data transferred
 */
class MetricsDB {
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

      // Create database with explicit options
      // fileMustExist: false allows SQLite to create the file if it doesn't exist
      this.db = new Database(dbPath, { fileMustExist: false });
      this.db.pragma('journal_mode = WAL'); // Better concurrency
      this.initSchema();

      logger.log(`📊 Metrics database initialized: ${dbPath}`);
    } catch (error) {
      logger.error(`Failed to initialize database at ${dbPath}:`, error);
      throw new Error(`Database initialization failed: ${error.message}. Check directory permissions for: ${path.dirname(dbPath)}`);
    }
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

    // Run migrations for rtorrent support
    this.migrateSchema();
  }

  /**
   * Run schema migrations
   */
  migrateSchema() {
    logger.log('📊 Running schema migrations...');
    const getVersion = this.db.prepare('SELECT value FROM metadata WHERE key = ?');
    const versionRow = getVersion.get('schema_version');
    const currentVersion = versionRow ? parseInt(versionRow.value) : 1;
    logger.log(`📊 Current schema version: ${currentVersion}`);

    // Migration to v2: Add rtorrent columns
    if (currentVersion < 2) {
      logger.log('📊 Metrics: Migrating schema to v2 (adding rtorrent support)...');

      const columns = this.db.prepare("PRAGMA table_info(metrics)").all();
      const columnNames = columns.map(c => c.name);

      // Add rtorrent columns if they don't exist
      if (!columnNames.includes('rt_upload_speed')) {
        this.db.exec("ALTER TABLE metrics ADD COLUMN rt_upload_speed INTEGER DEFAULT 0");
      }
      if (!columnNames.includes('rt_download_speed')) {
        this.db.exec("ALTER TABLE metrics ADD COLUMN rt_download_speed INTEGER DEFAULT 0");
      }
      if (!columnNames.includes('rt_total_uploaded')) {
        this.db.exec("ALTER TABLE metrics ADD COLUMN rt_total_uploaded INTEGER DEFAULT 0");
      }
      if (!columnNames.includes('rt_total_downloaded')) {
        this.db.exec("ALTER TABLE metrics ADD COLUMN rt_total_downloaded INTEGER DEFAULT 0");
      }

      // Initialize rtorrent metadata
      const initMetadata = this.db.prepare(
        'INSERT OR IGNORE INTO metadata (key, value) VALUES (?, ?)'
      );
      initMetadata.run('rt_last_total_uploaded', '0');
      initMetadata.run('rt_last_total_downloaded', '0');

      // Update schema version
      this.db.prepare('UPDATE metadata SET value = ? WHERE key = ?').run('2', 'schema_version');
      logger.log('📊 Metrics: Schema migrated to v2');
    }

    // Migration to v3: Add PID tracking for rtorrent restart detection
    if (currentVersion < 3) {
      logger.log('📊 Metrics: Migrating schema to v3 (adding restart detection)...');

      const initMetadata = this.db.prepare(
        'INSERT OR IGNORE INTO metadata (key, value) VALUES (?, ?)'
      );
      // Track rtorrent's PID to detect restarts reliably
      // When PID changes, rtorrent has restarted and counters have reset
      initMetadata.run('rt_pid', '0');
      // Track accumulated offsets from previous rtorrent sessions
      initMetadata.run('rt_accumulated_uploaded', '0');
      initMetadata.run('rt_accumulated_downloaded', '0');
      // Track the last session totals (to accumulate on restart)
      initMetadata.run('rt_last_session_uploaded', '0');
      initMetadata.run('rt_last_session_downloaded', '0');

      this.db.prepare('UPDATE metadata SET value = ? WHERE key = ?').run('3', 'schema_version');
      logger.log('📊 Metrics: Schema migrated to v3');
    }

  }

  /**
   * Insert a new metric record
   * @param {number} uploadSpeed - aMule upload speed in bytes/sec
   * @param {number} downloadSpeed - aMule download speed in bytes/sec
   * @param {number|null} totalUploaded - Optional: actual total uploaded (if available from aMule)
   * @param {number|null} totalDownloaded - Optional: actual total downloaded (if available from aMule)
   * @param {object|null} rtorrentStats - Optional: rtorrent stats { uploadSpeed, downloadSpeed, uploadTotal, downloadTotal }
   * @returns {object} Inserted metric data
   */
  insertMetric(uploadSpeed, downloadSpeed, totalUploaded = null, totalDownloaded = null, rtorrentStats = null) {
    const timestamp = Date.now();

    // Get last totals from metadata
    const getMetadata = this.db.prepare('SELECT value FROM metadata WHERE key = ?');
    const lastUploaded = parseInt(getMetadata.get('last_total_uploaded')?.value || '0');
    const lastDownloaded = parseInt(getMetadata.get('last_total_downloaded')?.value || '0');

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

    // Handle rtorrent stats with restart detection using PID
    let rtUploadSpeed = 0, rtDownloadSpeed = 0, rtTotalUploaded = 0, rtTotalDownloaded = 0;

    if (rtorrentStats) {
      rtUploadSpeed = parseInt(rtorrentStats.uploadSpeed, 10) || 0;
      rtDownloadSpeed = parseInt(rtorrentStats.downloadSpeed, 10) || 0;

      // Get current session values from rtorrent (ensure numeric to avoid string concatenation)
      const rtSessionUp = parseInt(rtorrentStats.uploadTotal, 10) || 0;
      const rtSessionDown = parseInt(rtorrentStats.downloadTotal, 10) || 0;
      const rtPid = parseInt(rtorrentStats.pid, 10) || 0;

      // Get stored values for restart detection
      const lastPid = parseInt(getMetadata.get('rt_pid')?.value || '0');
      let rtAccumulatedUp = parseInt(getMetadata.get('rt_accumulated_uploaded')?.value || '0');
      let rtAccumulatedDown = parseInt(getMetadata.get('rt_accumulated_downloaded')?.value || '0');
      const rtLastSessionUp = parseInt(getMetadata.get('rt_last_session_uploaded')?.value || '0');
      const rtLastSessionDown = parseInt(getMetadata.get('rt_last_session_downloaded')?.value || '0');

      // Detect rtorrent restart by comparing PID
      // If PID changed, rtorrent has restarted and counters have reset
      if (lastPid > 0 && rtPid !== lastPid) {
        // Restart detected - accumulate the previous session's totals
        rtAccumulatedUp += rtLastSessionUp;
        rtAccumulatedDown += rtLastSessionDown;
        logger.log(`📊 rtorrent restart detected (PID changed: ${lastPid} → ${rtPid})`);
        logger.log(`📊 Accumulated offsets: upload=${rtAccumulatedUp}, download=${rtAccumulatedDown}`);
      }

      // Calculate the adjusted totals (current session + accumulated from previous sessions)
      // These values are monotonically increasing across restarts
      rtTotalUploaded = rtSessionUp + rtAccumulatedUp;
      rtTotalDownloaded = rtSessionDown + rtAccumulatedDown;

      // Update metadata
      const updateMeta = this.db.prepare('UPDATE metadata SET value = ? WHERE key = ?');
      updateMeta.run(rtPid.toString(), 'rt_pid');
      updateMeta.run(rtSessionUp.toString(), 'rt_last_session_uploaded');
      updateMeta.run(rtSessionDown.toString(), 'rt_last_session_downloaded');
      updateMeta.run(rtAccumulatedUp.toString(), 'rt_accumulated_uploaded');
      updateMeta.run(rtAccumulatedDown.toString(), 'rt_accumulated_downloaded');
      // Keep backwards compatibility with existing metadata key
      updateMeta.run(rtTotalUploaded.toString(), 'rt_last_total_uploaded');
      updateMeta.run(rtTotalDownloaded.toString(), 'rt_last_total_downloaded');
    }

    // Insert metric with both aMule and rtorrent data
    const insert = this.db.prepare(`
      INSERT INTO metrics (timestamp, upload_speed, download_speed, total_uploaded, total_downloaded,
                          rt_upload_speed, rt_download_speed, rt_total_uploaded, rt_total_downloaded)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insert.run(timestamp, uploadSpeed, downloadSpeed, newTotalUploaded, newTotalDownloaded,
               rtUploadSpeed, rtDownloadSpeed, rtTotalUploaded, rtTotalDownloaded);

    // Update aMule metadata with new totals
    const updateMeta = this.db.prepare('UPDATE metadata SET value = ? WHERE key = ?');
    updateMeta.run(newTotalUploaded.toString(), 'last_total_uploaded');
    updateMeta.run(newTotalDownloaded.toString(), 'last_total_downloaded');

    return {
      timestamp,
      uploadSpeed,
      downloadSpeed,
      totalUploaded: newTotalUploaded,
      totalDownloaded: newTotalDownloaded,
      rtUploadSpeed,
      rtDownloadSpeed,
      rtTotalUploaded,
      rtTotalDownloaded
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
   * Includes per-client (aMule and rTorrent) data
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
        AVG(rt_upload_speed) as avg_rt_upload_speed,
        AVG(rt_download_speed) as avg_rt_download_speed,
        CASE WHEN MIN(total_uploaded) = 0 THEN 0 ELSE MAX(total_uploaded) - MIN(total_uploaded) END as uploaded_delta,
        CASE WHEN MIN(total_downloaded) = 0 THEN 0 ELSE MAX(total_downloaded) - MIN(total_downloaded) END as downloaded_delta,
        CASE WHEN MIN(rt_total_uploaded) = 0 THEN 0 ELSE MAX(rt_total_uploaded) - MIN(rt_total_uploaded) END as rt_uploaded_delta,
        CASE WHEN MIN(rt_total_downloaded) = 0 THEN 0 ELSE MAX(rt_total_downloaded) - MIN(rt_total_downloaded) END as rt_downloaded_delta
      FROM metrics
      WHERE timestamp BETWEEN ? AND ?
      GROUP BY CAST(timestamp / ? AS INTEGER)
      ORDER BY bucket ASC
    `);
    return query.all(bucketSize, bucketSize, startTime, endTime, bucketSize);
  }

  /**
   * Get the first metric record in a time range
   * @param {number} startTime - Start timestamp in milliseconds
   * @param {number} endTime - End timestamp in milliseconds
   * @returns {object|null} First metric record or null
   */
  getFirstMetric(startTime, endTime) {
    const query = this.db.prepare(`
      SELECT * FROM metrics
      WHERE timestamp >= ?
      ORDER BY timestamp ASC
      LIMIT 1
    `);
    return query.get(startTime);
  }

  /**
   * Get the last metric record in a time range
   * @param {number} startTime - Start timestamp in milliseconds
   * @param {number} endTime - End timestamp in milliseconds
   * @returns {object|null} Last metric record or null
   */
  getLastMetric(startTime, endTime) {
    const query = this.db.prepare(`
      SELECT * FROM metrics
      WHERE timestamp <= ?
      ORDER BY timestamp DESC
      LIMIT 1
    `);
    return query.get(endTime);
  }

  /**
   * Get peak speeds within a time range from raw data
   * Returns combined peaks (aMule + rtorrent) and per-client peaks
   * @param {number} startTime - Start timestamp in milliseconds
   * @param {number} endTime - End timestamp in milliseconds
   * @returns {object} Object with combined and per-client peak speeds
   */
  getPeakSpeeds(startTime, endTime) {
    const query = this.db.prepare(`
      SELECT
        MAX(upload_speed + rt_upload_speed) as peak_upload_speed,
        MAX(download_speed + rt_download_speed) as peak_download_speed,
        MAX(upload_speed) as amule_peak_upload_speed,
        MAX(download_speed) as amule_peak_download_speed,
        MAX(rt_upload_speed) as rt_peak_upload_speed,
        MAX(rt_download_speed) as rt_peak_download_speed
      FROM metrics
      WHERE timestamp BETWEEN ? AND ?
    `);
    const result = query.get(startTime, endTime);
    return {
      peakUploadSpeed: result?.peak_upload_speed || 0,
      peakDownloadSpeed: result?.peak_download_speed || 0,
      amule: {
        peakUploadSpeed: result?.amule_peak_upload_speed || 0,
        peakDownloadSpeed: result?.amule_peak_download_speed || 0
      },
      rtorrent: {
        peakUploadSpeed: result?.rt_peak_upload_speed || 0,
        peakDownloadSpeed: result?.rt_peak_download_speed || 0
      }
    };
  }

  /**
   * Clean up old data based on retention period
   * @param {number} retentionDays - Number of days to retain
   * @returns {number} Number of records deleted
   */
  cleanupOldData(retentionDays = 365) {
    const cutoffTime = Date.now() - daysToMs(retentionDays);
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
