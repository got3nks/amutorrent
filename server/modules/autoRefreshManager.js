/**
 * Auto-refresh Module
 * Handles periodic data updates and broadcasting
 */

const config = require('./config');
const BaseModule = require('../lib/BaseModule');

class AutoRefreshManager extends BaseModule {
  constructor() {
    super();
    this.refreshInterval = null;
  }

  // Auto-refresh loop
  async autoRefreshLoop() {
    if (!this.amuleManager || !this.amuleManager.isConnected()) {
      this.refreshInterval = setTimeout(() => this.autoRefreshLoop(), config.AUTO_REFRESH_INTERVAL);
      return;
    }

    try {
      // Get stats and store metrics
      const stats = await this.amuleManager.getClient().getStats();
      if (stats) {
        // Store metrics in database
        try {
          const uploadSpeed = stats.EC_TAG_STATS_UL_SPEED || 0;
          const downloadSpeed = stats.EC_TAG_STATS_DL_SPEED || 0;

          // aMule provides cumulative totals (lifetime stats)
          const totalUploaded = stats.EC_TAG_STATS_TOTAL_SENT_BYTES || null;
          const totalDownloaded = stats.EC_TAG_STATS_TOTAL_RECEIVED_BYTES || null;

          this.metricsDB.insertMetric(uploadSpeed, downloadSpeed, totalUploaded, totalDownloaded);
        } catch (err) {
          this.log('⚠️  Error saving metrics:', err.message);
        }
      }

      // Only update if there is at least one client connected
      if(this.wss.clients.size > 0) {
          if(stats) this.broadcast({ type: 'stats-update', data: stats });

          // Get categories
          const categories = await this.amuleManager.getClient().getCategories();
          if (categories) this.broadcast({ type: 'categories-update', data: categories });

          // Get downloads
          const downloads = await this.amuleManager.getClient().getDownloadQueue();
          if (downloads) this.broadcast({ type: 'downloads-update', data: downloads });

          // Get uploads with GeoIP enrichment
          const uploadsData = await this.amuleManager.getClient().getUploadingQueue();
          const uploads = uploadsData?.EC_TAG_CLIENT || [];
          const enrichedUploads = this.geoIPManager.enrichUploadsWithGeo(uploads);
          this.broadcast({ type: 'uploads-update', data: enrichedUploads });
      }

    } catch (err) {
      // Client disconnected during stats fetch - will retry on next interval
      this.log('⚠️  Could not fetch stats:', err.message);
    } finally {
      this.refreshInterval = setTimeout(() => this.autoRefreshLoop(), config.AUTO_REFRESH_INTERVAL);
    }
  }

  // Start auto-refresh
  start() {
    this.autoRefreshLoop();
  }

  // Stop auto-refresh
  stop() {
    if (this.refreshInterval) {
      clearTimeout(this.refreshInterval);
      this.refreshInterval = null;
    }
  }
}

module.exports = new AutoRefreshManager();