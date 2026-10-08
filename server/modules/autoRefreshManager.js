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
const { DATA_REFRESH_INTERVAL, DATA_MAX_AGE, hasDemand, markApiRead } = require('../lib/refreshPolicy');

// How often to update download history status (in milliseconds)
const HISTORY_UPDATE_INTERVAL = 30000; // 30 seconds

class AutoRefreshManager extends BaseModule {
  constructor() {
    super();
    this.refreshInterval = null;
    this.cleanupTimeout = null;
    this._cachedBatchUpdate = null;
    this._cachedAt = 0;
    this._lastHistoryUpdate = 0; // Timestamp of last history update
    this._lastBatchData = null;  // Item lists reused between data refreshes
    this._lastDataFetch = 0;
    this._cycleInFlight = null;
    this._stopped = true;
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

  /**
   * The cached batch update for an HTTP API reader, refreshed first if it is
   * older than one data refresh period.
   *
   * With no browser connected the loop only refreshes the cache when history
   * is due, so an API poller used to get data up to 30s old, or none newer than
   * the last browser session with history off. Reading also counts as demand,
   * which keeps the loop refreshing while the poller is active.
   * @returns {Promise<Object|null>}
   */
  async getFreshBatchUpdate() {
    markApiRead();
    if (this._cachedBatchUpdate && Date.now() - this._cachedAt <= DATA_MAX_AGE) {
      return this._cachedBatchUpdate;
    }
    const askedAt = Date.now();
    this.markDataStale();
    await this._runCycleOnce();
    // A cycle already in flight may have decided before we asked; run one more.
    if (this._cachedAt < askedAt) await this._runCycleOnce();
    return this._cachedBatchUpdate;
  }

  /**
   * Fetch item lists on the next cycle instead of waiting out the data
   * interval: after an action changes something, or a browser connects.
   */
  markDataStale() {
    this._lastDataFetch = 0;
  }

  // Auto-refresh loop
  async autoRefreshLoop() {
    try {
      await this._runCycleOnce();
    } finally {
      // stop() during a cycle must not be undone by its finally.
      if (!this._stopped) {
        this.refreshInterval = setTimeout(() => this.autoRefreshLoop(), config.AUTO_REFRESH_INTERVAL);
      }
    }
  }

  /** Run one cycle, or join the one in flight. */
  _runCycleOnce() {
    if (!this._cycleInFlight) {
      this._cycleInFlight = this._runCycle().finally(() => { this._cycleInFlight = null; });
    }
    return this._cycleInFlight;
  }

  /**
   * One refresh cycle. Stats, speed metrics and health run every cycle; the
   * item lists only when DATA_REFRESH_INTERVAL has passed, someone is reading,
   * or history needs them.
   */
  async _runCycle() {
    const connectedManagers = registry.getConnected();
    if (connectedManagers.length === 0) return;

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

      // Fetch item lists only if someone is reading them or history is due.
      // History never runs more often than the data refresh: a long interval
      // is meant to stop the fetching, not move it to the history timer.
      const now = Date.now();
      const historyEnabled = this.downloadHistoryDB && config.getConfig()?.history?.enabled;
      const historyInterval = Math.max(HISTORY_UPDATE_INTERVAL, DATA_REFRESH_INTERVAL);
      const historyDue = historyEnabled && now - this._lastHistoryUpdate >= historyInterval;
      const hasWsClients = this.wss.clients.size > 0;
      const demand = hasDemand(this.wss);

      if (!demand && !historyDue) {
        return;
      }

      // With someone reading, lists are fetched on their own interval anyway, so
      // history waits for the next fetch instead of forcing an extra one.
      const dataDue = !this._lastBatchData || now - this._lastDataFetch >= DATA_REFRESH_INTERVAL;
      const fetchNow = dataDue || (historyDue && !demand);
      let batchData;
      if (fetchNow) {
        const batchStart = Date.now();
        batchData = await dataFetchService.getBatchData();
        const batchMs = Date.now() - batchStart;
        if (batchMs > 15000) {
          this.warn(`⚠️  getBatchData() took ${(batchMs / 1000).toFixed(1)}s — data fetch cycle is slow`);
        }
        this._lastBatchData = batchData;
        this._lastDataFetch = now;
      } else {
        // Not due: reuse the item lists. The delta below comes out empty, and
        // the fresh stats still reach the browser this cycle.
        batchData = this._lastBatchData;
      }

      // Update history status from live data (throttled to reduce SQLite writes)
      if (historyDue && fetchNow) {
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
          // Runtime capability, unlike the static clientMeta ones above: it
          // depends on how old the connected daemon is, so the UI can hide the
          // shared-folder editor rather than let a request fail (#530).
          sharedDirsConfig: typeof mgr.supportsSharedDirsConfig === 'function'
            ? mgr.supportsSharedDirsConfig()
            : false,
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
      this._cachedAt = Date.now();

    } catch (err) {
      // Client disconnected during stats fetch - will retry on next interval
      this.warn('⚠️  Could not fetch stats:', logger.errorDetail(err));
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
    this._stopped = false;
    if (DATA_REFRESH_INTERVAL !== config.AUTO_REFRESH_INTERVAL) {
      this.log(`ℹ️  Item lists refresh every ${DATA_REFRESH_INTERVAL / 1000}s; stats every ${config.AUTO_REFRESH_INTERVAL / 1000}s`);
    }
    this.autoRefreshLoop();
    this.scheduleCleanup();
  }

  // Stop auto-refresh and cleanup
  stop() {
    this._stopped = true;
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
        if (!knownKeys.has(key) && !d.isComplete) {
          this.downloadHistoryDB.addExternalDownload(meta.hash, meta.name, meta.size, manager.clientType, categoryByKey.get(key) || meta.category || null, meta.instanceId);
          knownKeys.add(key);
        }

        // Use the per-client authoritative completion flag set in each normalizer
        // (bytes-equality for aMule, d.complete= for rTorrent, raw progress fraction
        // for qBittorrent/Deluge/Transmission) — never re-derive from the rounded
        // display progress, which can fire 0.005% early on big files and oscillate
        // around 100, repeatedly flipping completed↔downloading and re-emitting
        // downloadFinished notifications.
        if (d.isComplete) {
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
