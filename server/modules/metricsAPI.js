/**
 * Metrics API Module
 * Handles historical metrics endpoints
 */

const config = require('./config');
const BaseModule = require('../lib/BaseModule');

class MetricsAPI extends BaseModule {
  constructor() {
    super();
  }

  // GET /api/metrics/history
  getHistory(req, res) {
    try {
      const { range = '24h' } = req.query;
      const now = Date.now();
      let startTime, bucketSize;

      switch (range) {
        case '24h':
          startTime = now - (24 * 60 * 60 * 1000);
          bucketSize = 15 * 60 * 1000; // 15-minute buckets
          break;
        case '7d':
          startTime = now - (7 * 24 * 60 * 60 * 1000);
          bucketSize = 2 * 60 * 60 * 1000; // 2-hour buckets
          break;
        case '30d':
          startTime = now - (30 * 24 * 60 * 60 * 1000);
          bucketSize = 6 * 60 * 60 * 1000; // 6-hour buckets
          break;
        default:
          return res.status(400).json({ error: 'Invalid range. Use 24h, 7d, or 30d' });
      }

      const metrics = this.metricsDB.getAggregatedMetrics(startTime, now, bucketSize);
      res.json({
        range,
        data: metrics.map(m => ({
          timestamp: m.bucket,
          uploadSpeed: Math.round(m.avg_upload_speed || 0),
          downloadSpeed: Math.round(m.avg_download_speed || 0),
          uploadedDelta: m.uploaded_delta || 0,
          downloadedDelta: m.downloaded_delta || 0
        }))
      });
    } catch (err) {
      this.log('⚠️  Error fetching metrics:', err);
      res.status(500).json({ error: 'Failed to fetch metrics' });
    }
  }

  // GET /api/metrics/speed-history
  getSpeedHistory(req, res) {
    try {
      const { range = '24h' } = req.query;
      const now = Date.now();
      let startTime, bucketSize;

      switch (range) {
        case '24h':
          startTime = now - (24 * 60 * 60 * 1000);
          bucketSize = 15 * 1000; // 15-second buckets
          break;
        case '7d':
          startTime = now - (7 * 24 * 60 * 60 * 1000);
          bucketSize = 15 * 60 * 1000; // 15-minute buckets
          break;
        case '30d':
          startTime = now - (30 * 24 * 60 * 60 * 1000);
          bucketSize = 60 * 60 * 1000; // 1-hour buckets
          break;
        default:
          return res.status(400).json({ error: 'Invalid range. Use 24h, 7d, or 30d' });
      }

      // For 7d and 30d, use aggregated data
      const metrics = this.metricsDB.getAggregatedMetrics(startTime, now, bucketSize);
      res.json({
        range,
        data: metrics.map(m => ({
          timestamp: m.bucket,
          uploadSpeed: Math.round(m.avg_upload_speed || 0),
          downloadSpeed: Math.round(m.avg_download_speed || 0)
        }))
      });
    } catch (err) {
      this.log('⚠️  Error fetching speed metrics:', err);
      res.status(500).json({ error: 'Failed to fetch speed metrics' });
    }
  }

  // GET /api/metrics/stats
  getStats(req, res) {
    try {
      const { range = '24h' } = req.query;
      const now = Date.now();
      let startTime, bucketSize;

      switch (range) {
        case '24h':
          startTime = now - (24 * 60 * 60 * 1000);
          bucketSize = 15 * 60 * 1000; // 15-minute buckets
          break;
        case '7d':
          startTime = now - (7 * 24 * 60 * 60 * 1000);
          bucketSize = 2 * 60 * 60 * 1000; // 2-hour buckets
          break;
        case '30d':
          startTime = now - (30 * 24 * 60 * 60 * 1000);
          bucketSize = 6 * 60 * 60 * 1000; // 6-hour buckets
          break;
        default:
          return res.status(400).json({ error: 'Invalid range' });
      }

      // Get first and last records to calculate total transferred
      const firstMetric = this.metricsDB.getFirstMetric(startTime, now);
      const lastMetric = this.metricsDB.getLastMetric(startTime, now);

      if (!firstMetric || !lastMetric) {
        return res.json({
          range,
          totalUploaded: 0,
          totalDownloaded: 0,
          avgUploadSpeed: 0,
          avgDownloadSpeed: 0,
          peakUploadSpeed: 0,
          peakDownloadSpeed: 0
        });
      }

      // Calculate totals from first and last records
      const totalUploaded = lastMetric.total_uploaded - firstMetric.total_uploaded;
      const totalDownloaded = lastMetric.total_downloaded - firstMetric.total_downloaded;

      // Calculate true average speeds: total bytes / time period in seconds
      const timeRangeSeconds = (lastMetric.timestamp - firstMetric.timestamp) / 1000;
      const avgUploadSpeed = timeRangeSeconds > 0 ? totalUploaded / timeRangeSeconds : 0;
      const avgDownloadSpeed = timeRangeSeconds > 0 ? totalDownloaded / timeRangeSeconds : 0;

      // Get peak speeds from raw data (not from aggregated buckets)
      const peaks = this.metricsDB.getPeakSpeeds(startTime, now);
      const peakUploadSpeed = peaks.peakUploadSpeed;
      const peakDownloadSpeed = peaks.peakDownloadSpeed;

      res.json({
        range,
        totalUploaded,
        totalDownloaded,
        avgUploadSpeed: Math.round(avgUploadSpeed),
        avgDownloadSpeed: Math.round(avgDownloadSpeed),
        peakUploadSpeed: Math.round(peakUploadSpeed),
        peakDownloadSpeed: Math.round(peakDownloadSpeed)
      });
    } catch (err) {
      this.log('⚠️  Error fetching stats:', err);
      res.status(500).json({ error: 'Failed to fetch stats' });
    }
  }

  // Register all metrics routes
  registerRoutes(app) {
    app.get('/api/metrics/history', (req, res) => this.getHistory(req, res));
    app.get('/api/metrics/speed-history', (req, res) => this.getSpeedHistory(req, res));
    app.get('/api/metrics/stats', (req, res) => this.getStats(req, res));
  }
}

module.exports = new MetricsAPI();