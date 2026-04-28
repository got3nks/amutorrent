/**
 * Metrics API Module
 * Handles historical metrics endpoints
 */

const BaseModule = require('../lib/BaseModule');
const timeRange = require('../lib/timeRange');
const response = require('../lib/responseFormatter');
const clientMeta = require('../lib/clientMeta');
const registry = require('../lib/ClientRegistry');
const { requireCapability } = require('../middleware/capabilities');

const VALID_RANGES = ['24h', '7d', '30d'];

class MetricsAPI extends BaseModule {
  constructor() {
    super();
  }

  /**
   * Check if the client has disconnected (e.g. AbortController).
   * @param {object} req - Express request
   * @returns {boolean} true if aborted (caller should return early)
   * @private
   */
  _isAborted(req) {
    if (!req.socket.destroyed) return false;
    this.log(`📊 Metrics request aborted by client: ${req.path}`);
    return true;
  }

  /**
   * Yield to the event loop so pending I/O callbacks (e.g. socket close) can be processed.
   * Synchronous better-sqlite3 queries block the event loop, preventing Node.js from
   * detecting client disconnections. Calling this between queries lets the socket
   * teardown event fire, making _isAborted() checks effective.
   * @returns {Promise<void>}
   * @private
   */
  _tick() {
    return new Promise(resolve => setImmediate(resolve));
  }

  /**
   * Parse instanceIds query param into an array or null
   * @param {object} req - Express request
   * @returns {string[]|null}
   * @private
   */
  _parseInstanceIds(req) {
    const raw = req.query.instanceIds;
    if (raw) return raw.split(',').filter(Boolean);
    // Default to enabled instances only — excludes disabled clients
    const ids = registry.getEnabled().map(m => m.instanceId);
    return ids.length > 0 ? ids : null;
  }

  /**
   * Format raw metrics to API response format.
   * Loops over clientMeta.getMetricsConfig() — new client types auto-participate.
   * @param {Array<object>} metrics - Raw metric records from database
   * @returns {Array<object>} Formatted records with per-networkType and combined speeds/deltas
   * @private
   */
  _formatMetrics(metrics) {
    const mc = clientMeta.getMetricsConfig();
    const nts = clientMeta.getNetworkTypes();

    return metrics.map(m => {
      const ntUp = {}, ntDown = {}, ntUpDelta = {}, ntDownDelta = {};
      for (const nt of nts) { ntUp[nt] = 0; ntDown[nt] = 0; ntUpDelta[nt] = 0; ntDownDelta[nt] = 0; }

      for (const { type, networkType } of mc) {
        ntUp[networkType] += m[`avg_${type}_upload_speed`] || 0;
        ntDown[networkType] += m[`avg_${type}_download_speed`] || 0;
        ntUpDelta[networkType] += m[`${type}_uploaded_delta`] || 0;
        ntDownDelta[networkType] += m[`${type}_downloaded_delta`] || 0;
      }

      const result = { timestamp: m.bucket };
      let totalUp = 0, totalDown = 0, totalUpDelta = 0, totalDownDelta = 0;
      for (const nt of nts) {
        totalUp += ntUp[nt];
        totalDown += ntDown[nt];
        totalUpDelta += ntUpDelta[nt];
        totalDownDelta += ntDownDelta[nt];
        result[`${nt}UploadSpeed`] = Math.round(ntUp[nt]);
        result[`${nt}DownloadSpeed`] = Math.round(ntDown[nt]);
        result[`${nt}UploadedDelta`] = ntUpDelta[nt];
        result[`${nt}DownloadedDelta`] = ntDownDelta[nt];
      }
      result.uploadSpeed = Math.round(totalUp);
      result.downloadSpeed = Math.round(totalDown);
      result.uploadedDelta = totalUpDelta;
      result.downloadedDelta = totalDownDelta;
      return result;
    });
  }

  /**
   * Get metrics data for a given time range and bucket size
   * @param {string} range - Time range label (e.g. '24h', '7d', '30d')
   * @param {number} startTime - Start timestamp in milliseconds
   * @param {number} endTime - End timestamp in milliseconds
   * @param {number} bucketSize - Bucket size in milliseconds
   * @param {string[]|null} instanceIds - Instance IDs to include, or null for all
   * @returns {object} { range, data: Array }
   * @private
   */
  _getMetricsData(range, startTime, endTime, bucketSize, instanceIds) {
    const metrics = this.metricsDB.getAggregatedInstanceMetrics(startTime, endTime, bucketSize, instanceIds);
    return { range, data: this._formatMetrics(metrics) };
  }

  /**
   * Build stats response from per-networkType totals and peaks.
   * @param {string} range - Time range label
   * @param {object} ntTotals - Per-networkType totals { ed2k: {up,down}, bittorrent: {up,down} }
   * @param {number} timeRangeSeconds - Duration of the time range in seconds
   * @param {object} peaks - Peak speeds from getInstancePeakSpeeds()
   * @returns {object} Stats response with per-networkType and combined stats
   * @private
   */
  _buildStatsResponse(range, ntTotals, timeRangeSeconds, peaks) {
    const nts = clientMeta.getNetworkTypes();
    const result = { range };
    let totalUp = 0, totalDown = 0;

    for (const nt of nts) {
      const t = ntTotals[nt] || { up: 0, down: 0 };
      totalUp += t.up;
      totalDown += t.down;
      result[nt] = {
        totalUploaded: t.up,
        totalDownloaded: t.down,
        avgUploadSpeed: Math.round(timeRangeSeconds > 0 ? t.up / timeRangeSeconds : 0),
        avgDownloadSpeed: Math.round(timeRangeSeconds > 0 ? t.down / timeRangeSeconds : 0),
        peakUploadSpeed: Math.round(peaks[nt]?.peakUploadSpeed || 0),
        peakDownloadSpeed: Math.round(peaks[nt]?.peakDownloadSpeed || 0)
      };
    }

    result.totalUploaded = totalUp;
    result.totalDownloaded = totalDown;
    result.avgUploadSpeed = Math.round(timeRangeSeconds > 0 ? totalUp / timeRangeSeconds : 0);
    result.avgDownloadSpeed = Math.round(timeRangeSeconds > 0 ? totalDown / timeRangeSeconds : 0);
    result.peakUploadSpeed = Math.round(peaks.peakUploadSpeed);
    result.peakDownloadSpeed = Math.round(peaks.peakDownloadSpeed);
    return result;
  }

  /**
   * Calculate stats from instance_metrics in time range
   * @param {string} range - Time range label
   * @param {number} startTime - Start timestamp in milliseconds
   * @param {number} endTime - End timestamp in milliseconds
   * @param {string[]|null} instanceIds - Instance IDs to include, or null for all
   * @returns {object|null} Stats response or null if no data
   * @private
   */
  _getStatsData(range, startTime, endTime, instanceIds) {
    const totals = this.metricsDB.getInstanceTotals(startTime, endTime, instanceIds);
    if (!totals.firstTimestamp || !totals.lastTimestamp) return null;

    const timeRangeSeconds = (totals.lastTimestamp - totals.firstTimestamp) / 1000;
    const peaks = this.metricsDB.getInstancePeakSpeeds(startTime, endTime, instanceIds);

    return this._buildStatsResponse(range, totals, timeRangeSeconds, peaks);
  }

  // GET /api/metrics/history - coarser granularity for data transfer charts
  async getHistory(req, res) {
    try {
      const range = this._validateRange(req, res);
      if (!range) return;
      await this._tick();
      if (this._isAborted(req)) return;
      const instanceIds = this._parseInstanceIds(req);
      const { startTime, endTime, bucketSize } = timeRange.parseTimeRange(range);
      const data = this._getMetricsData(range, startTime, endTime, bucketSize, instanceIds);
      if (this._isAborted(req)) return;
      res.json(data);
    } catch (err) {
      this.error('Error fetching metrics:', err);
      response.serverError(res, 'Failed to fetch metrics');
    }
  }

  // GET /api/metrics/speed-history - finer granularity for speed charts
  async getSpeedHistory(req, res) {
    try {
      const range = this._validateRange(req, res);
      if (!range) return;
      await this._tick();
      if (this._isAborted(req)) return;
      const instanceIds = this._parseInstanceIds(req);
      const { startTime, endTime, speedBucketSize } = timeRange.parseTimeRange(range);
      const data = this._getMetricsData(range, startTime, endTime, speedBucketSize, instanceIds);
      if (this._isAborted(req)) return;
      res.json(data);
    } catch (err) {
      this.error('Error fetching speed metrics:', err);
      response.serverError(res, 'Failed to fetch speed metrics');
    }
  }

  // GET /api/metrics/stats - aggregate statistics
  async getStats(req, res) {
    try {
      const range = this._validateRange(req, res);
      if (!range) return;
      await this._tick();
      if (this._isAborted(req)) return;
      const instanceIds = this._parseInstanceIds(req);
      const { startTime, endTime } = timeRange.parseTimeRange(range);
      const data = this._getStatsData(range, startTime, endTime, instanceIds);
      if (this._isAborted(req)) return;
      res.json(data);
    } catch (err) {
      this.error('Error fetching stats:', err);
      response.serverError(res, 'Failed to fetch stats');
    }
  }

  // GET /api/metrics/dashboard - combined endpoint for dashboard views
  async getDashboard(req, res) {
    try {
      const range = this._validateRange(req, res);
      if (!range) return;
      const instanceIds = this._parseInstanceIds(req);
      const { startTime, endTime, bucketSize, speedBucketSize } = timeRange.parseTimeRange(range);

      // Each _get* call runs synchronous SQLite queries that block the event loop.
      // _tick() yields between them so Node.js can process socket close events,
      // making _isAborted() checks effective for client-side AbortController cancellations.
      if (this._isAborted(req)) return;
      const speedData = this._getMetricsData(range, startTime, endTime, speedBucketSize, instanceIds);
      await this._tick();
      if (this._isAborted(req)) return;

      const historicalData = this._getMetricsData(range, startTime, endTime, bucketSize, instanceIds);
      await this._tick();
      if (this._isAborted(req)) return;

      const historicalStats = this._getStatsData(range, startTime, endTime, instanceIds);
      if (this._isAborted(req)) return;

      res.json({ speedData, historicalData, historicalStats });
    } catch (err) {
      this.error('Error fetching dashboard metrics:', err);
      response.serverError(res, 'Failed to fetch dashboard metrics');
    }
  }

  // Validate range query parameter, return badRequest if invalid
  _validateRange(req, res) {
    const range = req.query.range || '24h';
    if (!VALID_RANGES.includes(range)) {
      response.badRequest(res, `range must be one of: ${VALID_RANGES.join(', ')}`);
      return null;
    }
    return range;
  }

  // Register all metrics routes
  registerRoutes(app) {
    const viewStats = requireCapability('view_statistics');
    app.get('/api/metrics/dashboard', viewStats, (req, res) => this.getDashboard(req, res));
    app.get('/api/metrics/history', viewStats, (req, res) => this.getHistory(req, res));
    app.get('/api/metrics/speed-history', viewStats, (req, res) => this.getSpeedHistory(req, res));
    app.get('/api/metrics/stats', viewStats, (req, res) => this.getStats(req, res));
  }
}

module.exports = new MetricsAPI();
