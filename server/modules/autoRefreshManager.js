/**
 * Auto-refresh Module
 * Handles periodic data updates and broadcasting
 * Also handles download completion detection for history tracking
 * Supports both aMule and rtorrent clients
 */

const config = require('./config');
const BaseModule = require('../lib/BaseModule');
const { getDiskSpace } = require('../lib/diskSpace');
const { getCpuUsage } = require('../lib/cpuUsage');
const dataFetchService = require('../lib/DataFetchService');
const { extractTrackerDomain } = require('../lib/downloadNormalizer');

// Singleton managers - imported directly instead of injected
const amuleManager = require('./amuleManager');
const rtorrentManager = require('./rtorrentManager');

// How often to update download history status (in milliseconds)
const HISTORY_UPDATE_INTERVAL = 30000; // 30 seconds

class AutoRefreshManager extends BaseModule {
  constructor() {
    super();
    this.refreshInterval = null;
    this.cleanupTimeout = null;
    this._cachedBatchUpdate = null;
    this._lastHistoryUpdate = 0; // Timestamp of last history update
  }

  /**
   * Get the last cached batch update
   * Used to send initial data to newly connected WebSocket clients
   * @returns {Object|null} The last batch update or null if none available
   */
  getCachedBatchUpdate() {
    return this._cachedBatchUpdate;
  }

  // Auto-refresh loop
  async autoRefreshLoop() {
    const amuleConnected = amuleManager && amuleManager.isConnected();
    const rtorrentConnected = rtorrentManager && rtorrentManager.isConnected();

    // If neither client is connected, wait and retry
    if (!amuleConnected && !rtorrentConnected) {
      this.refreshInterval = setTimeout(() => this.autoRefreshLoop(), config.AUTO_REFRESH_INTERVAL);
      return;
    }

    try {
      let stats = null;
      let rtorrentStats = null;

      // Get aMule stats if connected
      if (amuleConnected) {
        stats = await amuleManager.getClient().getStats();
      }

      // Get rtorrent stats if connected
      if (rtorrentConnected) {
        try {
          rtorrentStats = await rtorrentManager.getGlobalStats();
        } catch (err) {
          this.log('⚠️  Error fetching rtorrent stats:', err.message);
        }
      }

      // Store metrics in database (both aMule and rtorrent)
      if (stats || rtorrentStats) {
        try {
          const uploadSpeed = stats?.EC_TAG_STATS_UL_SPEED || 0;
          const downloadSpeed = stats?.EC_TAG_STATS_DL_SPEED || 0;

          // aMule provides cumulative totals (lifetime stats)
          const totalUploaded = stats?.EC_TAG_STATS_TOTAL_SENT_BYTES || null;
          const totalDownloaded = stats?.EC_TAG_STATS_TOTAL_RECEIVED_BYTES || null;

          // Format rtorrent stats for metrics DB
          const rtMetrics = rtorrentStats ? {
            uploadSpeed: rtorrentStats.uploadSpeed || 0,
            downloadSpeed: rtorrentStats.downloadSpeed || 0,
            uploadTotal: rtorrentStats.uploadTotal || 0,
            downloadTotal: rtorrentStats.downloadTotal || 0,
            pid: rtorrentStats.pid || 0  // For restart detection (PID changes on restart)
          } : null;

          this.metricsDB.insertMetric(uploadSpeed, downloadSpeed, totalUploaded, totalDownloaded, rtMetrics);
        } catch (err) {
          this.log('⚠️  Error saving metrics:', err.message);
        }
      }

      // Fetch all data using DataFetchService (downloads, shared, uploads, labels, categories)
      // Always fetch - needed for history updates even without WebSocket clients
      const batchData = await dataFetchService.getBatchData();

      // Update history status from live data (throttled to reduce SQLite writes)
      // This runs regardless of WebSocket clients - history should always be tracked
      const now = Date.now();
      if (now - this._lastHistoryUpdate >= HISTORY_UPDATE_INTERVAL) {
        this.updateHistoryStatus(batchData);
        this._lastHistoryUpdate = now;
      }

      // Only build and broadcast updates if there are WebSocket clients connected
      if (this.wss.clients.size > 0) {
        // Build batch update object - only include successful fetches
        const batchUpdate = {};

        // Combine stats from both clients
        const combinedStats = stats || {};
        if (rtorrentStats) {
          combinedStats.rtorrent = {
            connected: true,
            downloadSpeed: rtorrentStats.downloadSpeed || 0,
            uploadSpeed: rtorrentStats.uploadSpeed || 0,
            downloadTotal: rtorrentStats.downloadTotal || 0,
            uploadTotal: rtorrentStats.uploadTotal || 0,
            portOpen: rtorrentStats.portOpen || false,
            listenPort: rtorrentStats.listenPort || 0
          };
        } else if (rtorrentConnected) {
          combinedStats.rtorrent = { connected: true };
        }

        // Add connection status
        combinedStats.clients = {
          amule: amuleConnected,
          rtorrent: rtorrentConnected
        };

        // Add config-level enabled status (for UI visibility decisions)
        combinedStats.clientsEnabled = {
          amule: config.AMULE_ENABLED,
          rtorrent: config.RTORRENT_ENABLED,
          prowlarr: config.getConfig()?.integrations?.prowlarr?.enabled === true
        };

        // Add disk space and CPU usage information to stats
        try {
          const dataDir = config.DATA_DIR || './server/data';
          combinedStats.diskSpace = await getDiskSpace(dataDir);
        } catch (err) {
          this.log('⚠️  Error getting disk space:', err.message);
        }
        try {
          combinedStats.cpuUsage = await getCpuUsage();
        } catch (err) {
          this.log('⚠️  Error getting CPU usage:', err.message);
        }
        batchUpdate.stats = combinedStats;

        // Always include unified items so frontend can mark them as loaded
        // (empty array = "no data" vs missing key = "not yet fetched")
        batchUpdate.items = batchData.items;

        // Include unified categories (managed by CategoryManager)
        if (batchData.categories && batchData.categories.length > 0) {
          batchUpdate.categories = batchData.categories;
        }

        // Include client default paths for Default category display
        if (batchData.clientDefaultPaths) {
          batchUpdate.clientDefaultPaths = batchData.clientDefaultPaths;
        }

        // Include category path warnings flag
        if (batchData.hasPathWarnings !== undefined) {
          batchUpdate.hasPathWarnings = batchData.hasPathWarnings;
        }

        // Cache and send batch update (only if we have data)
        if (Object.keys(batchUpdate).length > 0) {
          this._cachedBatchUpdate = batchUpdate;
          this.broadcast({ type: 'batch-update', data: batchUpdate });
        }
      }

    } catch (err) {
      // Client disconnected during stats fetch - will retry on next interval
      this.log('⚠️  Could not fetch stats:', err.message);
    } finally {
      this.refreshInterval = setTimeout(() => this.autoRefreshLoop(), config.AUTO_REFRESH_INTERVAL);
    }
  }

  // Start auto-refresh and scheduled cleanup
  start() {
    this.autoRefreshLoop();
    this.scheduleCleanup();
  }

  // Stop auto-refresh and cleanup
  stop() {
    if (this.refreshInterval) {
      clearTimeout(this.refreshInterval);
      this.refreshInterval = null;
    }
    if (this.cleanupTimeout) {
      clearTimeout(this.cleanupTimeout);
      this.cleanupTimeout = null;
    }
  }

  /**
   * Update history status from live data
   * Called every refresh cycle to keep history status in sync with actual downloads
   * Also detects externally added downloads (added outside the web UI)
   * @param {Object} batchData - Data from dataFetchService.getBatchData()
   */
  updateHistoryStatus(batchData) {
    if (!this.downloadHistoryDB || !config.getConfig()?.history?.enabled) {
      return;
    }

    try {
      const activeHashes = new Set();
      const completedHashes = new Set();
      const metadataMap = new Map();

      // Get known hashes from database to detect external additions
      const knownHashes = this.downloadHistoryDB.getKnownHashes();

      // Process aMule data
      const amuleDownloads = batchData._amuleDownloads || [];
      const amuleSharedFiles = batchData._amuleSharedFiles || [];

      // aMule: downloads with progress < 100 are active
      // Note: aMule doesn't have trackers, but we can track uploaded and derive ratio
      for (const d of amuleDownloads) {
        const hash = d.hash?.toLowerCase();
        if (!hash) continue;

        // Detect external additions (not in database)
        if (!knownHashes.has(hash)) {
          this.downloadHistoryDB.addExternalDownload(hash, d.name, d.size, 'amule');
          knownHashes.add(hash); // Add to known set to avoid duplicate detection
        }

        if (d.progress < 100) {
          activeHashes.add(hash);
        }
        // Store metadata for potential updates
        const downloaded = d.downloaded || 0;
        const uploaded = d.transferredTotal || d.transferred || 0;
        const ratio = downloaded > 0 ? uploaded / downloaded : 0;

        metadataMap.set(hash, {
          size: d.size,
          name: d.name,
          downloaded,
          uploaded,
          ratio,
          clientType: 'amule'
          // No trackerDomain for aMule
        });
      }

      // aMule: shared files are completed only if not still downloading
      // (aMule shows files in shared list while still in progress)
      for (const f of amuleSharedFiles) {
        const hash = f.hash?.toLowerCase();
        if (!hash) continue;
        // Only mark as completed if not already marked as active (still downloading)
        if (!activeHashes.has(hash)) {
          completedHashes.add(hash);
        }
        // Update or merge metadata
        const existing = metadataMap.get(hash) || {};
        const uploaded = f.transferredTotal || f.transferred || existing.uploaded || 0;
        const size = f.size || existing.size || 0;
        const ratio = size > 0 ? uploaded / size : 0;

        metadataMap.set(hash, {
          ...existing,
          size,
          name: f.name || existing.name,
          uploaded,
          ratio,
          clientType: 'amule'
          // No trackerDomain for aMule
        });
      }

      // Process rtorrent data
      const rtorrentDownloads = batchData._rtorrentDownloads || [];

      for (const d of rtorrentDownloads) {
        const hash = d.hash?.toLowerCase();
        if (!hash) continue;

        // Detect external additions (not in database) - only for incomplete downloads
        if (!knownHashes.has(hash) && d.progress < 100) {
          this.downloadHistoryDB.addExternalDownload(hash, d.name, d.size, 'rtorrent');
          knownHashes.add(hash); // Add to known set to avoid duplicate detection
        }

        if (d.progress >= 100) {
          completedHashes.add(hash);
        } else {
          activeHashes.add(hash);
        }

        // Extract primary tracker domain (with subdomain removal)
        const trackerDomain = extractTrackerDomain(d.trackers);

        // Store metadata for potential updates (including transfer stats)
        metadataMap.set(hash, {
          size: d.size,
          name: d.name,
          downloaded: d.downloaded || 0,
          uploaded: d.uploadTotal || 0,
          ratio: d.ratio || 0,
          trackerDomain,
          clientType: 'rtorrent'
        });
      }

      // Batch update the database
      this.downloadHistoryDB.batchUpdateFromLiveData(activeHashes, completedHashes, metadataMap);
    } catch (err) {
      this.log('⚠️  Error updating history status:', err.message);
    }
  }

  /**
   * Schedule daily cleanup at configured hour (default 3 AM)
   * Handles both metrics DB and download history cleanup
   */
  scheduleCleanup() {
    const now = new Date();
    const nextCleanup = new Date(now);
    nextCleanup.setHours(config.CLEANUP_HOUR, 0, 0, 0);

    // If cleanup time has passed today, schedule for tomorrow
    if (nextCleanup <= now) {
      nextCleanup.setDate(nextCleanup.getDate() + 1);
    }

    const msUntilCleanup = nextCleanup - now;

    this.cleanupTimeout = setTimeout(() => {
      this.runCleanup();
      this.scheduleCleanup(); // Schedule next cleanup
    }, msUntilCleanup);

    this.log(`⏰ Scheduled next cleanup at ${nextCleanup.toISOString()}`);
  }

  /**
   * Run cleanup for all databases (metrics and history)
   */
  runCleanup() {
    // Cleanup metrics DB
    if (this.metricsDB) {
      try {
        const deleted = this.metricsDB.cleanupOldData(config.CLEANUP_DAYS);
        this.log(`🧹 Cleaned up ${deleted} old metrics records (older than ${config.CLEANUP_DAYS} days)`);
      } catch (err) {
        this.log('⚠️  Error cleaning up metrics:', err.message);
      }
    }

    // Cleanup download history
    if (this.downloadHistoryDB) {
      try {
        const retentionDays = config.getConfig()?.history?.retentionDays || 0;
        if (retentionDays > 0) {
          const deleted = this.downloadHistoryDB.cleanup(retentionDays);
          if (deleted > 0) {
            this.log(`🧹 Cleaned up ${deleted} old history entries (older than ${retentionDays} days)`);
          }
        }
      } catch (err) {
        this.log('⚠️  Error cleaning up history:', err.message);
      }
    }
  }
}

module.exports = new AutoRefreshManager();
