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
const { formatDuration } = require('../lib/timeRange');
const dataFetchService = require('../lib/DataFetchService');
const DeltaEngine = require('../lib/DeltaEngine');
const registry = require('../lib/ClientRegistry');
const HealthTracker = require('../lib/HealthTracker');
const eventScriptingManager = require('../lib/EventScriptingManager');
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
    this._deltaEngine = new DeltaEngine();
    this._healthTracker = new HealthTracker();
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

          // Skip empty stats (client unresponsive) — don't record zero metrics
          if (!stats || Object.keys(stats).length === 0) continue;

          instanceStats.push({
            instanceId: manager.instanceId,
            clientType: manager.clientType,
            manager,
            stats,
            metrics: manager.extractMetrics(stats)
          });
        } catch (err) {
          this.warn(`⚠️  Error fetching ${manager.instanceId} stats:`, logger.errorDetail(err));
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
          this.warn('⚠️  Error saving metrics:', logger.errorDetail(err));
        }
      }

      // Health check: detect connection state transitions for all enabled instances
      this._checkClientHealth();

      // Only fetch batch data if there are WebSocket clients or history update is due
      const now = Date.now();
      const historyEnabled = this.downloadHistoryDB && config.getConfig()?.history?.enabled;
      const historyDue = historyEnabled && now - this._lastHistoryUpdate >= HISTORY_UPDATE_INTERVAL;
      const hasWsClients = this.wss.clients.size > 0;

      if (!hasWsClients && !historyDue) {
        // Nothing to do — skip data fetching entirely
        return;
      }

      const batchStart = Date.now();
      const batchData = await dataFetchService.getBatchData();
      const batchMs = Date.now() - batchStart;
      if (batchMs > 15000) {
        this.warn(`⚠️  getBatchData() took ${(batchMs / 1000).toFixed(1)}s — data fetch cycle is slow`);
      }

      // Update history status from live data (throttled to reduce SQLite writes)
      if (historyDue) {
        this.updateHistoryStatus(batchData);
        this._lastHistoryUpdate = now;
      }

      // ── Build stats (always — needed for cache and broadcast) ──────────
      const combinedStats = {};
      combinedStats.prowlarrEnabled = config.getConfig()?.integrations?.prowlarr?.enabled === true;

      combinedStats.instanceSpeeds = {};
      for (const { instanceId, metrics } of instanceStats) {
        combinedStats.instanceSpeeds[instanceId] = {
          uploadSpeed: metrics.uploadSpeed,
          downloadSpeed: metrics.downloadSpeed
        };
      }

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

      try {
        combinedStats.diskSpace = await getDiskSpace(config.getDataDir());
      } catch (err) {
        this.warn('⚠️  Error getting disk space:', logger.errorDetail(err));
      }
      try {
        combinedStats.cpuUsage = await getCpuUsage();
      } catch (err) {
        this.warn('⚠️  Error getting CPU usage:', logger.errorDetail(err));
      }

      // ── Strip and cache (always — serves both REST API and new WS clients) ─
      const strippedItems = batchData.items.map(({ raw, trackersDetailed, ...rest }) => rest);

      const fullData = { stats: combinedStats, items: strippedItems };
      if (batchData.categories?.length > 0) fullData.categories = batchData.categories;
      if (batchData.clientDefaultPaths) fullData.clientDefaultPaths = batchData.clientDefaultPaths;
      if (batchData.hasPathWarnings !== undefined) fullData.hasPathWarnings = batchData.hasPathWarnings;

      // ── Delta engine + broadcast (only when WS clients connected) ─────
      if (hasWsClients) {
        const delta = this._deltaEngine.computeDelta(strippedItems);
        const useDelta = !this._deltaEngine.shouldFallback(delta, strippedItems.length);

        const metaDelta = this._deltaEngine.computeMetaDelta({
          categories: batchData.categories || [],
          clientDefaultPaths: batchData.clientDefaultPaths || {},
          hasPathWarnings: batchData.hasPathWarnings
        });

        fullData.seq = delta.seq;

        if (useDelta) {
          const deltaData = { stats: combinedStats, delta };
          if (metaDelta) Object.assign(deltaData, metaDelta);
          this.broadcast({ type: 'batch-update', data: deltaData }, {
            transform: (msg, user) => this._transformDeltaForUser(msg, user)
          });
        } else {
          this.broadcast({ type: 'batch-update', data: fullData }, {
            transform: (msg, user) => this._transformSnapshotForUser(msg, user)
          });
        }
      }

      // Always update cache (REST API + new WS client initial data)
      this._cachedBatchUpdate = { type: 'batch-update', data: fullData };

    } catch (err) {
      // Client disconnected during stats fetch - will retry on next interval
      this.warn('⚠️  Could not fetch stats:', logger.errorDetail(err));
    } finally {
      this.refreshInterval = setTimeout(() => this.autoRefreshLoop(), config.AUTO_REFRESH_INTERVAL);
    }
  }

  /**
   * Strip gapStatus/reqStatus from an item if client is not subscribed to segmentData
   */
  _stripSegmentFields(item) {
    const { gapStatus, reqStatus, ...rest } = item;
    return rest;
  }

  /**
   * Transform a full snapshot message for a specific user (ownership + subscription filtering)
   */
  _transformSnapshotForUser(msg, user) {
    const items = msg.data.items || [];
    const stripSegments = !user?.subscriptions?.has('segmentData');
    const mapItem = (i, owned) => {
      const item = { ...i, ownedByMe: owned };
      return stripSegments ? this._stripSegmentFields(item) : item;
    };

    if (!user || user.isAdmin || user.capabilities?.includes('view_all_downloads')) {
      if (!user?.userId || !this.userManager || user?.isAdmin) {
        return { ...msg, data: { ...msg.data, items: items.map(i => mapItem(i, true)) } };
      }
      const ownedKeys = this.userManager.getOwnedKeys(user.userId);
      return { ...msg, data: { ...msg.data, items: items.map(i => mapItem(i, ownedKeys.has(itemKey(i.instanceId, i.hash)))) } };
    }
    if (!user.userId || !this.userManager) return msg;
    const ownedKeys = this.userManager.getOwnedKeys(user.userId);
    return {
      ...msg,
      data: {
        ...msg.data,
        items: items.filter(item => ownedKeys.has(itemKey(item.instanceId, item.hash))).map(i => mapItem(i, true))
      }
    };
  }

  /**
   * Transform a delta message for a specific user (ownership + subscription filtering)
   */
  _transformDeltaForUser(msg, user) {
    const delta = msg.data.delta;
    if (!delta) return msg;

    const stripSegments = !user?.subscriptions?.has('segmentData');
    const mapItem = (i, owned) => {
      const item = { ...i, ownedByMe: owned };
      return stripSegments ? this._stripSegmentFields(item) : item;
    };

    if (!user || user.isAdmin || user.capabilities?.includes('view_all_downloads')) {
      // Admin/view-all: annotate ownedByMe on added + changed items
      if (!user?.userId || !this.userManager || user?.isAdmin) {
        return {
          ...msg,
          data: {
            ...msg.data,
            delta: {
              ...delta,
              added: delta.added.map(i => mapItem(i, true)),
              changed: delta.changed.map(i => mapItem(i, true))
            }
          }
        };
      }
      const ownedKeys = this.userManager.getOwnedKeys(user.userId);
      return {
        ...msg,
        data: {
          ...msg.data,
          delta: {
            ...delta,
            added: delta.added.map(i => mapItem(i, ownedKeys.has(itemKey(i.instanceId, i.hash)))),
            changed: delta.changed.map(i => mapItem(i, ownedKeys.has(itemKey(i.instanceId, i.hash))))
          }
        }
      };
    }

    // Non-admin without view_all: filter to owned items only
    if (!user.userId || !this.userManager) return msg;
    const ownedKeys = this.userManager.getOwnedKeys(user.userId);
    const isOwned = (item) => ownedKeys.has(itemKey(item.instanceId, item.hash));

    return {
      ...msg,
      data: {
        ...msg.data,
        delta: {
          ...delta,
          added: delta.added.filter(isOwned).map(i => mapItem(i, true)),
          removed: delta.removed.filter(key => {
            // Only send removal if the item was previously visible to this user
            // We can't know for sure here, but the frontend handles unknown removals gracefully
            return true;
          }),
          changed: delta.changed.filter(isOwned).map(i => mapItem(i, true))
        }
      }
    };
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
    this._deltaEngine.reset();
    this._healthTracker.reset();
  }

  /**
   * Check all enabled client instances for health state transitions.
   * Emits clientAvailable/clientUnavailable events on state changes.
   */
  _checkClientHealth() {
    registry.forEach((manager, instanceId, clientType) => {
      if (!manager.isEnabled()) return;

      const connected = manager.isConnected();
      const error = manager.lastError || null;
      const transition = this._healthTracker.update(instanceId, connected, error);

      if (!transition) return;

      const isRecovery = transition.event === 'clientAvailable';
      const eventData = {
        clientType,
        instanceId,
        instanceName: manager.displayName,
        status: isRecovery ? 'available' : 'unavailable',
        previousStatus: isRecovery ? 'unavailable' : 'available',
        error: transition.error || null,
        timestamp: new Date().toISOString()
      };

      // Add downtime duration for recovery events
      if (isRecovery && transition.downtimeSince) {
        eventData.downtimeDuration = Date.now() - transition.downtimeSince;
      }

      // Log the transition
      if (isRecovery) {
        const dur = eventData.downtimeDuration ? ` (was offline for ${formatDuration(eventData.downtimeDuration)})` : '';
        this.log(`🟢 ${manager.displayName} is back online${dur}`);
      } else {
        this.warn(`🔴 ${manager.displayName} is unreachable: ${error || 'unknown reason'}`);
      }

      // Emit event (scripts + notifications with flood prevention handled by EventScriptingManager)
      eventScriptingManager.emit(transition.event, eventData);
    });
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

        // Mark active/completed directly from progress for ALL clients.
        // (Previously aMule relied on shared files for completion, but with
        // incremental EC updates, completed downloads stay in the downloads
        // list at 100% and never appear as new shared files in getUpdate().)
        if (d.progress >= 100) {
          completedKeys.add(key);
        } else {
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
      // (Also serves as a fallback — downloads at 100% are already in completedKeys
      // from the loop above, but shared-only files without a downloads entry are caught here.)
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
      this.warn('⚠️  Error updating history status:', logger.errorDetail(err));
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
        this.warn('⚠️  Error cleaning up metrics:', logger.errorDetail(err));
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
        this.warn('⚠️  Error cleaning up history:', logger.errorDetail(err));
      }
    }
  }
}

module.exports = new AutoRefreshManager();
