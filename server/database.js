const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { daysToMs } = require('./lib/timeRange');
const clientMeta = require('./lib/clientMeta');
const logger = require('./lib/logger');

// ============================================================================
// GENERATED SQL FRAGMENTS (from clientMeta)
// Built once at require time — new client types auto-participate in all queries
// ============================================================================

const metricsConfig = clientMeta.getMetricsConfig();
const networkTypes = clientMeta.getNetworkTypes();

// networkType → [{ type, prefix, networkType }]
const typesByNetwork = {};
for (const nt of networkTypes) typesByNetwork[nt] = [];
for (const mc of metricsConfig) typesByNetwork[mc.networkType].push(mc);

// --- Instance metrics table (getAggregatedInstanceMetrics) ---
// Speed subquery: SUM speeds across instances per timestamp, then AVG per bucket
const _instanceInnerCols = metricsConfig.flatMap(({ type }) => [
  `SUM(CASE WHEN client_type = '${type}' THEN upload_speed ELSE 0 END) as ${type}_up`,
  `SUM(CASE WHEN client_type = '${type}' THEN download_speed ELSE 0 END) as ${type}_down`
]).join(',\n          ');

const _instanceOuterAvgCols = metricsConfig.flatMap(({ type }) => [
  `AVG(${type}_up) as avg_${type}_upload_speed`,
  `AVG(${type}_down) as avg_${type}_download_speed`
]).join(',\n        ');

// Delta subquery: compute MAX-MIN per instance per bucket, then SUM by client_type.
// This avoids cross-instance cumulative counter corruption when instances go offline.
const _instanceDeltaCols = metricsConfig.flatMap(({ type }) => [
  `SUM(CASE WHEN client_type = '${type}' THEN inst_up_delta ELSE 0 END) as ${type}_uploaded_delta`,
  `SUM(CASE WHEN client_type = '${type}' THEN inst_down_delta ELSE 0 END) as ${type}_downloaded_delta`
]).join(',\n        ');

// --- Peak speed fragments ---
const _instancePeakInnerCols = metricsConfig.flatMap(({ type }) => [
  `SUM(CASE WHEN client_type = '${type}' THEN upload_speed ELSE 0 END) as ${type}_up`,
  `SUM(CASE WHEN client_type = '${type}' THEN download_speed ELSE 0 END) as ${type}_down`
]).join(',\n          ');

const _instanceAllUpSum = metricsConfig.map(({ type }) => `${type}_up`).join(' + ');
const _instanceAllDownSum = metricsConfig.map(({ type }) => `${type}_down`).join(' + ');

const _instancePeakNtCols = networkTypes.flatMap(nt => {
  const upExpr = typesByNetwork[nt].map(({ type }) => `${type}_up`).join(' + ');
  const downExpr = typesByNetwork[nt].map(({ type }) => `${type}_down`).join(' + ');
  return [
    `MAX(${upExpr}) as ${nt}_peak_upload_speed`,
    `MAX(${downExpr}) as ${nt}_peak_download_speed`
  ];
}).join(',\n        ');

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
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS instance_metrics (
        timestamp INTEGER NOT NULL,
        instance_id TEXT NOT NULL,
        client_type TEXT NOT NULL,
        upload_speed INTEGER DEFAULT 0,
        download_speed INTEGER DEFAULT 0,
        total_uploaded INTEGER DEFAULT 0,
        total_downloaded INTEGER DEFAULT 0,
        PRIMARY KEY (timestamp, instance_id)
      );
      CREATE INDEX IF NOT EXISTS idx_instance_metrics_type ON instance_metrics(timestamp, client_type);
    `);

    const initMetadata = this.db.prepare(
      'INSERT OR IGNORE INTO metadata (key, value) VALUES (?, ?)'
    );
    // Fresh databases start at latest version (skip legacy migrations)
    initMetadata.run('schema_version', '7');

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

    // Migration to v4: Add qBittorrent columns
    if (currentVersion < 4) {
      logger.log('📊 Metrics: Migrating schema to v4 (adding qBittorrent support)...');

      const columns = this.db.prepare("PRAGMA table_info(metrics)").all();
      const columnNames = columns.map(c => c.name);

      // Add qBittorrent columns if they don't exist
      if (!columnNames.includes('qb_upload_speed')) {
        this.db.exec("ALTER TABLE metrics ADD COLUMN qb_upload_speed INTEGER DEFAULT 0");
      }
      if (!columnNames.includes('qb_download_speed')) {
        this.db.exec("ALTER TABLE metrics ADD COLUMN qb_download_speed INTEGER DEFAULT 0");
      }
      if (!columnNames.includes('qb_total_uploaded')) {
        this.db.exec("ALTER TABLE metrics ADD COLUMN qb_total_uploaded INTEGER DEFAULT 0");
      }
      if (!columnNames.includes('qb_total_downloaded')) {
        this.db.exec("ALTER TABLE metrics ADD COLUMN qb_total_downloaded INTEGER DEFAULT 0");
      }

      // Legacy metadata keys (no longer used - qBittorrent now uses all-time totals from /sync/maindata)
      const initMetadata = this.db.prepare(
        'INSERT OR IGNORE INTO metadata (key, value) VALUES (?, ?)'
      );
      initMetadata.run('qb_last_session_uploaded', '0');
      initMetadata.run('qb_last_session_downloaded', '0');
      initMetadata.run('qb_accumulated_uploaded', '0');
      initMetadata.run('qb_accumulated_downloaded', '0');

      this.db.prepare('UPDATE metadata SET value = ? WHERE key = ?').run('4', 'schema_version');
      logger.log('📊 Metrics: Schema migrated to v4');
    }

    // Migration to v5: Add per-instance metrics table
    if (currentVersion < 5) {
      logger.log('📊 Metrics: Migrating schema to v5 (adding per-instance metrics)...');

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS instance_metrics (
          timestamp INTEGER NOT NULL,
          instance_id TEXT NOT NULL,
          client_type TEXT NOT NULL,
          upload_speed INTEGER DEFAULT 0,
          download_speed INTEGER DEFAULT 0,
          total_uploaded INTEGER DEFAULT 0,
          total_downloaded INTEGER DEFAULT 0,
          PRIMARY KEY (timestamp, instance_id)
        );
        CREATE INDEX IF NOT EXISTS idx_instance_metrics_type ON instance_metrics(timestamp, client_type);
      `);

      this.db.prepare('UPDATE metadata SET value = ? WHERE key = ?').run('5', 'schema_version');
      logger.log('📊 Metrics: Schema migrated to v5');
    }

    // Migration to v6: Rename bare aMule columns to am_ prefix for uniformity
    if (currentVersion < 6) {
      logger.log('📊 Metrics: Migrating schema to v6 (renaming aMule columns to am_ prefix)...');

      const columns = this.db.prepare("PRAGMA table_info(metrics)").all();
      const columnNames = columns.map(c => c.name);

      // Rename columns if old bare names still exist
      if (columnNames.includes('upload_speed')) {
        this.db.exec("ALTER TABLE metrics RENAME COLUMN upload_speed TO am_upload_speed");
        this.db.exec("ALTER TABLE metrics RENAME COLUMN download_speed TO am_download_speed");
        this.db.exec("ALTER TABLE metrics RENAME COLUMN total_uploaded TO am_total_uploaded");
        this.db.exec("ALTER TABLE metrics RENAME COLUMN total_downloaded TO am_total_downloaded");
      }

      // Rename metadata keys
      this.db.exec("UPDATE metadata SET key = 'am_last_total_uploaded' WHERE key = 'last_total_uploaded'");
      this.db.exec("UPDATE metadata SET key = 'am_last_total_downloaded' WHERE key = 'last_total_downloaded'");

      this.db.prepare('UPDATE metadata SET value = ? WHERE key = ?').run('6', 'schema_version');
      logger.log('📊 Metrics: Schema migrated to v6');
    }

    // Migration to v7: Migrate legacy metrics → instance_metrics, then drop old table
    if (currentVersion < 7) {
      logger.log('📊 Metrics: Migrating schema to v7 (migrating legacy metrics to instance format)...');

      // Check if legacy metrics table exists and has data to migrate
      const legacyTable = this.db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='metrics'"
      ).get();

      if (legacyTable) {
        // After v6, the metrics table has am_*, rt_*, qb_* column prefixes.
        // Migrate each client type into instance_metrics using client_type as
        // placeholder instance_id. adoptLegacyMetrics() replaces these with real
        // instance IDs once the ClientRegistry is populated at startup.
        const legacyMappings = [
          { clientType: 'amule',       prefix: 'am_' },
          { clientType: 'rtorrent',    prefix: 'rt_' },
          { clientType: 'qbittorrent', prefix: 'qb_' }
        ];

        let totalMigrated = 0;
        for (const { clientType, prefix } of legacyMappings) {
          const result = this.db.prepare(`
            INSERT OR IGNORE INTO instance_metrics
              (timestamp, instance_id, client_type, upload_speed, download_speed, total_uploaded, total_downloaded)
            SELECT timestamp, ?, ?,
                   ${prefix}upload_speed, ${prefix}download_speed,
                   ${prefix}total_uploaded, ${prefix}total_downloaded
            FROM metrics
            WHERE ${prefix}upload_speed > 0 OR ${prefix}download_speed > 0
               OR ${prefix}total_uploaded > 0 OR ${prefix}total_downloaded > 0
          `).run(clientType, clientType);
          totalMigrated += result.changes;
          if (result.changes > 0) {
            logger.log(`📊 Metrics: Migrated ${result.changes} rows for ${clientType}`);
          }
        }
        logger.log(`📊 Metrics: Migrated ${totalMigrated} total rows from legacy metrics table`);
      }

      this.db.exec("DROP TABLE IF EXISTS metrics");
      this.db.exec("DROP INDEX IF EXISTS idx_metrics_timestamp");

      // Remove dead metadata keys from legacy aggregated tracking
      // Note: rt_pid, rt_accumulated_*, rt_last_session_* are preserved here
      // and migrated to per-instance keys in adoptLegacyMetrics()
      const deadKeys = [
        'am_last_total_uploaded', 'am_last_total_downloaded',
        'rt_last_total_uploaded', 'rt_last_total_downloaded',
        'qb_last_session_uploaded', 'qb_last_session_downloaded',
        'qb_accumulated_uploaded', 'qb_accumulated_downloaded'
      ];
      const deleteMetadata = this.db.prepare('DELETE FROM metadata WHERE key = ?');
      for (const key of deadKeys) deleteMetadata.run(key);

      this.db.prepare('UPDATE metadata SET value = ? WHERE key = ?').run('7', 'schema_version');
      logger.log('📊 Metrics: Schema migrated to v7');
    }

  }

  /**
   * Insert per-instance metrics into the instance_metrics table.
   * Handles PID-based restart detection for rtorrent instances (namespaced by instanceId).
   *
   * @param {number} timestamp - Timestamp in milliseconds
   * @param {Array<object>} entries - Array of { instanceId, clientType, uploadSpeed, downloadSpeed, uploadTotal, downloadTotal, pid? }
   * @returns {Array<object>} Entries with restart-adjusted totals
   */
  insertInstanceMetrics(timestamp, entries) {
    if (!entries || entries.length === 0) return [];

    const getMetadata = this.db.prepare('SELECT value FROM metadata WHERE key = ?');
    const upsertMetadata = this.db.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)');
    const insertRow = this.db.prepare(`
      INSERT OR REPLACE INTO instance_metrics (timestamp, instance_id, client_type, upload_speed, download_speed, total_uploaded, total_downloaded)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const adjusted = [];

    for (const entry of entries) {
      const uploadSpeed = parseInt(entry.uploadSpeed, 10) || 0;
      const downloadSpeed = parseInt(entry.downloadSpeed, 10) || 0;
      let totalUploaded = parseInt(entry.uploadTotal, 10) || 0;
      let totalDownloaded = parseInt(entry.downloadTotal, 10) || 0;

      // PID-based restart detection for clients that report PID
      if (clientMeta.hasCapability(entry.clientType, 'tracksPid') && entry.pid) {
        const prefix = entry.instanceId;
        const rtPid = parseInt(entry.pid, 10) || 0;
        const rtSessionUp = totalUploaded;
        const rtSessionDown = totalDownloaded;

        const lastPid = parseInt(getMetadata.get(`${prefix}:pid`)?.value || '0');
        let accUp = parseInt(getMetadata.get(`${prefix}:accumulated_uploaded`)?.value || '0');
        let accDown = parseInt(getMetadata.get(`${prefix}:accumulated_downloaded`)?.value || '0');
        const lastSessionUp = parseInt(getMetadata.get(`${prefix}:last_session_uploaded`)?.value || '0');
        const lastSessionDown = parseInt(getMetadata.get(`${prefix}:last_session_downloaded`)?.value || '0');

        if (lastPid > 0 && rtPid !== lastPid) {
          accUp += lastSessionUp;
          accDown += lastSessionDown;
          logger.log(`📊 ${entry.instanceId} restart detected (PID: ${lastPid} → ${rtPid})`);
          logger.log(`📊 ${entry.instanceId} accumulated offsets: upload=${accUp}, download=${accDown}`);
        }

        totalUploaded = rtSessionUp + accUp;
        totalDownloaded = rtSessionDown + accDown;

        upsertMetadata.run(`${prefix}:pid`, rtPid.toString());
        upsertMetadata.run(`${prefix}:last_session_uploaded`, rtSessionUp.toString());
        upsertMetadata.run(`${prefix}:last_session_downloaded`, rtSessionDown.toString());
        upsertMetadata.run(`${prefix}:accumulated_uploaded`, accUp.toString());
        upsertMetadata.run(`${prefix}:accumulated_downloaded`, accDown.toString());
      }
      // Value-based restart detection for clients with session-only counters and no
      // stable PID (e.g. Deluge). Counter is monotonic within a single run, so
      // current < previous ⇒ restart. Strict-less-than means we miss restarts where
      // the new session reaches lastSessionUp before the next sample, but that's
      // the inherent ceiling of value-based detection vs PID detection.
      else if (clientMeta.hasCapability(entry.clientType, 'tracksCounterReset')) {
        const prefix = entry.instanceId;
        const sessionUp = totalUploaded;
        const sessionDown = totalDownloaded;

        let accUp = parseInt(getMetadata.get(`${prefix}:accumulated_uploaded`)?.value || '0');
        let accDown = parseInt(getMetadata.get(`${prefix}:accumulated_downloaded`)?.value || '0');
        const lastSessionUp = parseInt(getMetadata.get(`${prefix}:last_session_uploaded`)?.value || '0');
        const lastSessionDown = parseInt(getMetadata.get(`${prefix}:last_session_downloaded`)?.value || '0');

        if (sessionUp < lastSessionUp || sessionDown < lastSessionDown) {
          accUp += lastSessionUp;
          accDown += lastSessionDown;
          logger.log(`📊 ${entry.instanceId} restart detected (counter reset): up ${lastSessionUp}→${sessionUp}, down ${lastSessionDown}→${sessionDown}`);
          logger.log(`📊 ${entry.instanceId} accumulated offsets: upload=${accUp}, download=${accDown}`);
        }

        totalUploaded = sessionUp + accUp;
        totalDownloaded = sessionDown + accDown;

        upsertMetadata.run(`${prefix}:last_session_uploaded`, sessionUp.toString());
        upsertMetadata.run(`${prefix}:last_session_downloaded`, sessionDown.toString());
        upsertMetadata.run(`${prefix}:accumulated_uploaded`, accUp.toString());
        upsertMetadata.run(`${prefix}:accumulated_downloaded`, accDown.toString());
      }

      insertRow.run(timestamp, entry.instanceId, entry.clientType,
        uploadSpeed, downloadSpeed, totalUploaded, totalDownloaded);

      adjusted.push({
        instanceId: entry.instanceId,
        clientType: entry.clientType,
        uploadSpeed,
        downloadSpeed,
        uploadTotal: totalUploaded,
        downloadTotal: totalDownloaded
      });
    }

    return adjusted;
  }

  /**
   * Get aggregated instance metrics within a time range, optionally filtered by instance IDs.
   * Two-level aggregation: inner query sums speeds by client_type per timestamp,
   * outer query buckets and averages/deltas.
   * SQL columns generated from clientMeta
   * @param {number} startTime - Start timestamp in milliseconds
   * @param {number} endTime - End timestamp in milliseconds
   * @param {number} bucketSize - Bucket size in milliseconds
   * @param {string[]|null} instanceIds - Array of instance IDs to include, or null for all
   * @returns {array} Array of aggregated metric records
   */
  getAggregatedInstanceMetrics(startTime, endTime, bucketSize, instanceIds) {
    const idFilter = instanceIds
      ? 'AND instance_id IN (SELECT value FROM json_each(?))'
      : '';
    const idParams = instanceIds ? [JSON.stringify(instanceIds)] : [];

    const query = this.db.prepare(`
      SELECT speed.*, delta.*
      FROM (
        SELECT
          (CAST(ts / ? AS INTEGER)) * ? as bucket,
          ${_instanceOuterAvgCols}
        FROM (
          SELECT
            timestamp as ts,
            ${_instanceInnerCols}
          FROM instance_metrics
          WHERE timestamp BETWEEN ? AND ?
            ${idFilter}
          GROUP BY timestamp
        )
        GROUP BY CAST(ts / ? AS INTEGER)
      ) speed
      INNER JOIN (
        SELECT
          bucket as delta_bucket,
          ${_instanceDeltaCols}
        FROM (
          SELECT
            (CAST(timestamp / ? AS INTEGER)) * ? as bucket,
            client_type,
            CASE WHEN MIN(total_uploaded) = 0 THEN 0
                 ELSE MAX(total_uploaded) - MIN(total_uploaded) END as inst_up_delta,
            CASE WHEN MIN(total_downloaded) = 0 THEN 0
                 ELSE MAX(total_downloaded) - MIN(total_downloaded) END as inst_down_delta
          FROM instance_metrics
          WHERE timestamp BETWEEN ? AND ?
            ${idFilter}
          GROUP BY (CAST(timestamp / ? AS INTEGER)), instance_id
        )
        GROUP BY bucket
      ) delta ON speed.bucket = delta.delta_bucket
      ORDER BY speed.bucket ASC
    `);
    return query.all(
      bucketSize, bucketSize, startTime, endTime, ...idParams, bucketSize,
      bucketSize, bucketSize, startTime, endTime, ...idParams, bucketSize
    );
  }

  /**
   * Get first/last totals from instance_metrics, optionally filtered by instance IDs.
   * Uses JS aggregation of per-instance deltas grouped by networkType.
   * @param {number} startTime - Start timestamp in milliseconds
   * @param {number} endTime - End timestamp in milliseconds
   * @param {string[]|null} instanceIds - Array of instance IDs to include, or null for all
   * @returns {object} { firstTimestamp, lastTimestamp, ed2k: {up,down}, bittorrent: {up,down} }
   */
  getInstanceTotals(startTime, endTime, instanceIds) {
    const idFilter = instanceIds
      ? 'AND instance_id IN (SELECT value FROM json_each(?))'
      : '';
    const idParams = instanceIds ? [JSON.stringify(instanceIds)] : [];

    // Get first metric per instance
    const firstQuery = this.db.prepare(`
      SELECT im.instance_id, im.client_type, im.total_uploaded, im.total_downloaded, im.timestamp
      FROM instance_metrics im
      INNER JOIN (
        SELECT instance_id, MIN(timestamp) as min_ts
        FROM instance_metrics
        WHERE timestamp BETWEEN ? AND ?
          ${idFilter}
        GROUP BY instance_id
      ) f ON im.instance_id = f.instance_id AND im.timestamp = f.min_ts
    `);
    const firstRows = firstQuery.all(startTime, endTime, ...idParams);

    // Get last metric per instance
    const lastQuery = this.db.prepare(`
      SELECT im.instance_id, im.client_type, im.total_uploaded, im.total_downloaded, im.timestamp
      FROM instance_metrics im
      INNER JOIN (
        SELECT instance_id, MAX(timestamp) as max_ts
        FROM instance_metrics
        WHERE timestamp BETWEEN ? AND ?
          ${idFilter}
        GROUP BY instance_id
      ) l ON im.instance_id = l.instance_id AND im.timestamp = l.max_ts
    `);
    const lastRows = lastQuery.all(startTime, endTime, ...idParams);

    // Build lookup: instanceId → { clientType, first, last }
    const byInstance = {};
    for (const row of firstRows) {
      byInstance[row.instance_id] = { clientType: row.client_type, first: row };
    }
    for (const row of lastRows) {
      if (byInstance[row.instance_id]) {
        byInstance[row.instance_id].last = row;
      }
    }

    // Aggregate deltas by networkType
    const result = { firstTimestamp: null, lastTimestamp: null };
    for (const nt of networkTypes) result[nt] = { up: 0, down: 0 };

    for (const { clientType, first, last } of Object.values(byInstance)) {
      if (!first || !last) continue;
      if (result.firstTimestamp === null || first.timestamp < result.firstTimestamp) {
        result.firstTimestamp = first.timestamp;
      }
      if (result.lastTimestamp === null || last.timestamp > result.lastTimestamp) {
        result.lastTimestamp = last.timestamp;
      }
      const nt = clientMeta.getNetworkType(clientType);
      result[nt].up += Math.max(0, (last.total_uploaded || 0) - (first.total_uploaded || 0));
      result[nt].down += Math.max(0, (last.total_downloaded || 0) - (first.total_downloaded || 0));
    }

    return result;
  }

  /**
   * Get peak speeds from instance_metrics, optionally filtered by instance IDs.
   * Subquery sums speeds by client_type per timestamp, outer query takes MAX.
   * SQL columns generated from clientMeta
   * @param {number} startTime - Start timestamp in milliseconds
   * @param {number} endTime - End timestamp in milliseconds
   * @param {string[]|null} instanceIds - Array of instance IDs to include, or null for all
   * @returns {object} { peakUploadSpeed, peakDownloadSpeed, ed2k: {...}, bittorrent: {...} }
   */
  getInstancePeakSpeeds(startTime, endTime, instanceIds) {
    if (instanceIds) {
      const idsJson = JSON.stringify(instanceIds);
      const query = this.db.prepare(`
        SELECT
          MAX(${_instanceAllUpSum}) as peak_upload_speed,
          MAX(${_instanceAllDownSum}) as peak_download_speed,
          ${_instancePeakNtCols}
        FROM (
          SELECT
            ${_instancePeakInnerCols}
          FROM instance_metrics
          WHERE timestamp BETWEEN ? AND ?
            AND instance_id IN (SELECT value FROM json_each(?))
          GROUP BY timestamp
        )
      `);
      const result = query.get(startTime, endTime, idsJson);
      return this._buildPeakResult(result);
    }
    const query = this.db.prepare(`
      SELECT
        MAX(${_instanceAllUpSum}) as peak_upload_speed,
        MAX(${_instanceAllDownSum}) as peak_download_speed,
        ${_instancePeakNtCols}
      FROM (
        SELECT
          ${_instancePeakInnerCols}
        FROM instance_metrics
        WHERE timestamp BETWEEN ? AND ?
        GROUP BY timestamp
      )
    `);
    const result = query.get(startTime, endTime);
    return this._buildPeakResult(result);
  }

  /**
   * Build peak result object from SQL row with networkType-keyed sub-objects.
   * @param {object|undefined} result - Raw SQL row
   * @returns {object} { peakUploadSpeed, peakDownloadSpeed, [networkType]: { peakUploadSpeed, peakDownloadSpeed } }
   * @private
   */
  _buildPeakResult(result) {
    const peaks = {
      peakUploadSpeed: result?.peak_upload_speed || 0,
      peakDownloadSpeed: result?.peak_download_speed || 0
    };
    for (const nt of networkTypes) {
      peaks[nt] = {
        peakUploadSpeed: result?.[`${nt}_peak_upload_speed`] || 0,
        peakDownloadSpeed: result?.[`${nt}_peak_download_speed`] || 0
      };
    }
    return peaks;
  }

  /**
   * Adopt legacy metrics entries by assigning real instance IDs.
   * Called after ClientRegistry is populated (from server.js reinitializeClients).
   * For each registered instance, claims rows where instance_id still equals the client_type placeholder.
   * First instance of each type adopts all legacy rows for that type.
   *
   * @param {Array<{instanceId: string, clientType: string}>} instances - Registered instances
   */
  adoptLegacyMetrics(instances) {
    const adoptedTypes = new Set();
    const stmt = this.db.prepare(`
      UPDATE instance_metrics
      SET instance_id = ?
      WHERE client_type = ? AND instance_id = ?
    `);
    const getMetadata = this.db.prepare('SELECT value FROM metadata WHERE key = ?');
    const upsertMetadata = this.db.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)');
    const deleteMetadata = this.db.prepare('DELETE FROM metadata WHERE key = ?');

    for (const { instanceId, clientType } of instances) {
      if (adoptedTypes.has(clientType)) continue;
      adoptedTypes.add(clientType);

      const result = stmt.run(instanceId, clientType, clientType);
      if (result.changes > 0) {
        logger.log(`📊 Metrics: Adopted ${result.changes} legacy ${clientType} entries → ${instanceId}`);
      }

      // Migrate legacy PID-tracking metadata to per-instance keys
      if (clientMeta.hasCapability(clientType, 'tracksPid')) {
        const prefix = clientMeta.get(clientType).metricsPrefix;
        const legacyKeys = ['pid', 'accumulated_uploaded', 'accumulated_downloaded',
          'last_session_uploaded', 'last_session_downloaded'];
        let migrated = 0;
        for (const suffix of legacyKeys) {
          const oldKey = `${prefix}${suffix}`;
          const newKey = `${instanceId}:${suffix}`;
          const row = getMetadata.get(oldKey);
          if (row && !getMetadata.get(newKey)) {
            upsertMetadata.run(newKey, row.value);
            migrated++;
          }
          deleteMetadata.run(oldKey);
        }
        if (migrated > 0) {
          logger.log(`📊 Metrics: Migrated ${migrated} legacy metadata keys for ${clientType} → ${instanceId}`);
        }
      }
    }
  }

  /**
   * Clean up old data based on retention period
   * @param {number} retentionDays - Number of days to retain
   * @returns {number} Number of records deleted
   */
  cleanupOldData(retentionDays = 365) {
    const cutoffTime = Date.now() - daysToMs(retentionDays);
    const stmt = this.db.prepare('DELETE FROM instance_metrics WHERE timestamp < ?');
    return stmt.run(cutoffTime).changes;
  }

  /**
   * Close database connection
   */
  close() {
    this.db.close();
  }
}

module.exports = MetricsDB;
