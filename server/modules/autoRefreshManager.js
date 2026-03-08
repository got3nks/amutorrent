/**
 * Auto-refresh Module
 * Handles periodic data updates and broadcasting
 * Also handles download completion detection for history tracking
 * Supports all client types via ClientRegistry
 */

const config = require('./config');
const logger = require('../lib/logger');
const BaseModule = require('../lib/BaseModule');
const { getDiskSpace } = require('../lib/diskSpace');
const { getCpuUsage } = require('../lib/cpuUsage');
const dataFetchService = require('../lib/DataFetchService');
const registry = require('../lib/ClientRegistry');
const clientMeta = require('../lib/clientMeta');
const { itemKey } = require('../lib/itemKey');

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
    const connectedManagers = registry.getConnected();

    // If no client is connected, wait and retry
    if (connectedManagers.length === 0) {
      this.refreshInterval = setTimeout(() => this.autoRefreshLoop(), config.AUTO_REFRESH_INTERVAL);
      return;
    }

    try {
      // Collect stats and metrics from all connected instances
      const instanceStats = []; // { instanceId, clientType, manager, stats, metrics }

      for (const manager of connectedManagers) {
        try {
          const stats = await manager.getStats();

          instanceStats.push({
            instanceId: manager.instanceId,
            clientType: manager.clientType,
            manager,
            stats,
            metrics: manager.extractMetrics(stats)
          });
        } catch (err) {
          this.log(`⚠️  Error fetching ${manager.instanceId} stats:`, logger.errorDetail(err));
        }
      }

      // Store per-instance metrics in database
      if (instanceStats.length > 0) {
        try {
          const timestamp = Date.now();
          const entries = instanceStats.map(({ instanceId, clientType, metrics }) => ({
            instanceId,
            clientType,
            ...metrics
          }));
          this.metricsDB.insertInstanceMetrics(timestamp, entries);
        } catch (err) {
          this.log('⚠️  Error saving metrics:', logger.errorDetail(err));
        }
      }

      // Only fetch batch data if there are WebSocket clients or history update is due
      const now = Date.now();
      const historyEnabled = this.downloadHistoryDB && config.getConfig()?.history?.enabled;
      const historyDue = historyEnabled && now - this._lastHistoryUpdate >= HISTORY_UPDATE_INTERVAL;
      const hasWsClients = this.wss.clients.size > 0;

      if (!hasWsClients && !historyDue) {
        // Nothing to do — skip data fetching entirely
        return;
      }

      const batchData = await dataFetchService.getBatchData();

      // Update history status from live data (throttled to reduce SQLite writes)
      if (historyDue) {
        this.updateHistoryStatus(batchData);
        this._lastHistoryUpdate = now;
      }

      // Only build and broadcast updates if there are WebSocket clients connected
      if (hasWsClients) {
        const batchUpdate = {};

        const combinedStats = {};

        // Prowlarr enabled status (integration config, not a client instance)
        combinedStats.prowlarrEnabled = config.getConfig()?.integrations?.prowlarr?.enabled === true;

        // Per-instance speeds (changes every cycle → LiveDataContext via dataStats)
        combinedStats.instanceSpeeds = {};
        for (const { instanceId, metrics } of instanceStats) {
          combinedStats.instanceSpeeds[instanceId] = {
            uploadSpeed: metrics.uploadSpeed,
            downloadSpeed: metrics.downloadSpeed
          };
        }

        // Per-instance metadata for frontend (visual identity + network status)
        // Build instanceId → stats lookup for networkStatus computation
        const statsByInstance = {};
        for (const { instanceId, manager, stats: instStats } of instanceStats) {
          statsByInstance[instanceId] = { manager, stats: instStats };
        }

        combinedStats.instances = {};
        let instanceOrder = 0;
        registry.forEach((mgr, instanceId, ct) => {
          const instData = statsByInstance[instanceId];
          combinedStats.instances[instanceId] = {
            order: instanceOrder++,
            type: ct,
            networkType: clientMeta.getNetworkType(ct),
            name: mgr.displayName,
            connected: !!mgr.isConnected(),
            color: mgr._clientConfig?.color || null,
            capabilities: clientMeta.get(ct).capabilities,
            networkStatus: instData ? instData.manager.getNetworkStatus(instData.stats) : null,
            error: mgr.lastError || null,
            errorTime: mgr.lastErrorTime || null
          };
        });

        // Add disk space and CPU usage information to stats
        try {
          const dataDir = config.getDataDir();
          combinedStats.diskSpace = await getDiskSpace(dataDir);
        } catch (err) {
          this.log('⚠️  Error getting disk space:', logger.errorDetail(err));
        }
        try {
          combinedStats.cpuUsage = await getCpuUsage();
        } catch (err) {
          this.log('⚠️  Error getting CPU usage:', logger.errorDetail(err));
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
          this.broadcast({ type: 'batch-update', data: batchUpdate }, {
            transform: (msg, user) => {
              const items = msg.data.items || [];
              if (!user || user.isAdmin || user.capabilities?.includes('view_all_downloads')) {
                // Annotate items with ownership flag for frontend mutation gating
                if (!user?.userId || !this.userManager || user?.isAdmin) {
                  // Auth disabled / admin / no userId — owns everything
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
      }

    } catch (err) {
      // Client disconnected during stats fetch - will retry on next interval
      this.log('⚠️  Could not fetch stats:', logger.errorDetail(err));
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
      const activeKeys = new Set();      // compound keys (instanceId:hash)
      const completedKeys = new Set();   // compound keys (instanceId:hash)
      const metadataMap = new Map();     // compound key → metadata (includes hash, instanceId)

      // Get known compound keys from database to detect external additions
      const knownKeys = this.downloadHistoryDB.getKnownKeys();

      // Build compoundKey→category lookup from unified items (works for all clients)
      const categoryByKey = new Map();
      for (const item of (batchData.items || [])) {
        if (item.hash && item.category) {
          categoryByKey.set(itemKey(item.instanceId, item.hash), item.category);
        }
      }

      // Process all downloads (unified loop — all client types)
      for (const d of (batchData._allDownloads || [])) {
        const manager = registry.get(d.instanceId);
        if (!manager) continue;
        const meta = manager.extractHistoryMetadata(d);
        if (!meta.hash) continue;
        const key = itemKey(meta.instanceId, meta.hash);

        // Detect external additions (not in database) - only for incomplete downloads
        if (!knownKeys.has(key) && d.progress < 100) {
          this.downloadHistoryDB.addExternalDownload(meta.hash, meta.name, meta.size, manager.clientType, categoryByKey.get(key) || meta.category || null, meta.instanceId);
          knownKeys.add(key);
        }

        // Clients with sharedMeansComplete (aMule): only mark active from downloads list
        // (completion comes from shared files loop below)
        // Other clients: mark active/completed directly from progress
        const separateCompletion = clientMeta.hasCapability(manager.clientType, 'sharedMeansComplete');
        if (d.progress >= 100 && !separateCompletion) {
          completedKeys.add(key);
        } else if (d.progress < 100) {
          activeKeys.add(key);
        }

        metadataMap.set(key, {
          ...meta,
          category: categoryByKey.get(key) || meta.category || null,
          clientType: manager.clientType
        });
      }

      // Process shared files for completion (only clients with separate shared files)
      // These mark items as completed if not still downloading
      for (const f of (batchData._sharedFilesForHistory || [])) {
        const manager = registry.get(f.instanceId);
        if (!manager) continue;
        const meta = manager.extractHistoryMetadata(f);
        if (!meta.hash) continue;
        const key = itemKey(meta.instanceId, meta.hash);

        if (!activeKeys.has(key)) {
          completedKeys.add(key);
        }

        // Merge with existing download metadata (upload bytes may be on either record)
        const existing = metadataMap.get(key) || {};
        const mergedUploaded = meta.uploaded || existing.uploaded || 0;
        const mergedDownloaded = meta.downloaded; // shared file = complete, downloaded equals size
        const mergedRatio = mergedDownloaded > 0 ? mergedUploaded / mergedDownloaded : 0;

        metadataMap.set(key, {
          ...existing,
          ...meta,
          name: meta.name || existing.name,
          uploaded: mergedUploaded,
          ratio: mergedRatio,
          category: categoryByKey.get(key) || existing.category || null,
          clientType: manager.clientType
        });
      }

      // Batch update the database
      this.downloadHistoryDB.batchUpdateFromLiveData(activeKeys, completedKeys, metadataMap);
    } catch (err) {
      this.log('⚠️  Error updating history status:', logger.errorDetail(err));
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
        this.log('⚠️  Error cleaning up metrics:', logger.errorDetail(err));
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
        this.log('⚠️  Error cleaning up history:', logger.errorDetail(err));
      }
    }
  }
}

module.exports = new AutoRefreshManager();
