/**
 * Radarr/Sonarr Integration Module
 * Handles automatic search triggers for Radarr and Sonarr
 */

const config = require('./config');
const BaseModule = require('../lib/BaseModule');
const fs = require('fs').promises;
const path = require('path');
const { hoursToMs, minutesToMs, MS_PER_HOUR } = require('../lib/timeRange');

// Singleton managers - imported directly instead of injected
const amuleManager = require('./amuleManager');

// Debug mode - set to true to see detailed search decisions
const DEBUG = true;

class ArrManager extends BaseModule {
  constructor() {
    super();
    this.stateFilePath = path.join(config.getDataDir(), 'arr-state.json');
  }

  // Read state from JSON file
  async readState() {
    try {
      const data = await fs.readFile(this.stateFilePath, 'utf8');
      return JSON.parse(data);
    } catch (err) {
      // File doesn't exist or is invalid, return default state
      return {
        lastSonarrSearchCompleted: null,
        lastRadarrSearchCompleted: null
      };
    }
  }

  // Write state to JSON file
  async writeState(state) {
    try {
      await fs.writeFile(this.stateFilePath, JSON.stringify(state, null, 2), 'utf8');
    } catch (err) {
      this.log('❌ Error writing state file:', err.message);
    }
  }

  // Update last search completion time for a service
  async updateLastSearchCompleted(service) {
    const state = await this.readState();
    if (service === 'sonarr') {
      state.lastSonarrSearchCompleted = new Date().toISOString();
    } else if (service === 'radarr') {
      state.lastRadarrSearchCompleted = new Date().toISOString();
    }
    await this.writeState(state);
  }

  /**
   * Generic search function for Sonarr/Radarr content
   * @param {string} service - 'sonarr' or 'radarr'
   * @param {number} contentId - Episode or Movie ID
   * @param {string} contentType - 'episode' or 'movie'
   */
  async searchContent(service, contentId, contentType) {
    const config_map = {
      sonarr: { url: config.SONARR_URL, apiKey: config.SONARR_API_KEY, command: 'EpisodeSearch', idKey: 'episodeIds' },
      radarr: { url: config.RADARR_URL, apiKey: config.RADARR_API_KEY, command: 'MoviesSearch', idKey: 'movieIds' }
    };

    const cfg = config_map[service];
    if (!cfg) {
      this.log(`❌ Unknown service: ${service}`);
      return;
    }

    try {
      const result = await this.fetchJson(`${cfg.url}/api/v3/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': cfg.apiKey
        },
        body: JSON.stringify({
          name: cfg.command,
          [cfg.idKey]: [contentId]
        })
      });
      this.log(`  🔍 ${contentType} search triggered (Command ID: ${result.id}), waiting for completion...`);

      await this.waitForCommandCompletion(service, result.id);
      this.log(`  ✅ ${contentType} search completed (Command ID: ${result.id})`);
    } catch (err) {
      this.log(`  ❌ Failed to search ${contentType} ${contentId}:`, err.message);
    }
  }

  // Search for a specific episode in Sonarr
  async searchEpisode(episodeId) {
    return this.searchContent('sonarr', episodeId, 'Episode');
  }

  // Search for a specific movie in Radarr
  async searchMovie(movieId) {
    return this.searchContent('radarr', movieId, 'Movie');
  }

  // Helper: fetch JSON with error handling
  async fetchJson(url, options = {}) {
        const resp = await fetch(url, options);
        if (!resp.ok) {
            const text = await resp.text();
            throw new Error(`HTTP ${resp.status} ${resp.statusText}: ${text}`);
        }
        return resp.json();
    }

  /**
   * Get service configuration by name
   */
  getServiceConfig(service) {
    const configs = {
      sonarr: {
        url: config.SONARR_URL,
        apiKey: config.SONARR_API_KEY,
        searchInterval: config.SONARR_SEARCH_INTERVAL_HOURS
      },
      radarr: {
        url: config.RADARR_URL,
        apiKey: config.RADARR_API_KEY,
        searchInterval: config.RADARR_SEARCH_INTERVAL_HOURS
      }
    };
    return configs[service];
  }

  // Helper function to poll command status with timeout
  async waitForCommandCompletion(service, commandId, timeoutMs = config.COMMAND_TIMEOUT_MS) {
    const pollInterval = 5000; // 5 seconds
    const startTime = Date.now();
    const cfg = this.getServiceConfig(service);

    while (true) {
      // Check timeout
      if (Date.now() - startTime > timeoutMs) {
        this.log('⏱️ Command did not complete within timeout, proceeding anyway...');
        return;
      }

      const statusResp = await fetch(`${cfg.url}/api/v3/command/${commandId}`, {
        headers: { 'X-Api-Key': cfg.apiKey }
      });
      const statusData = await statusResp.json();

      // Command state is in `state`
      const state = statusData.state || statusData.status || '';
      if (state === 'completed') return;
      if (state === 'failed') throw new Error(`${service} command failed`);

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }

  /**
   * Build quality ranking from quality profile
   */
  buildQualityRanking(qualityProfile) {
    const qualityRanking = [];
    for (const item of qualityProfile.items) {
      if (item.quality) {
        qualityRanking.push({ id: item.quality.id, name: item.quality.name });
      } else if (item.items) {
        // It's a group, add all items in the group
        for (const subItem of item.items) {
          if (subItem.quality) {
            qualityRanking.push({ id: subItem.quality.id, name: subItem.quality.name });
          }
        }
      }
    }
    return qualityRanking;
  }

  /**
   * Get cutoff quality ID from profile
   */
  getCutoffQualityId(qualityProfile) {
    const cutoffId = qualityProfile.cutoff;
    let cutoffQualityId = null;

    for (const item of qualityProfile.items) {
      if (item.quality && item.quality.id === cutoffId) {
        cutoffQualityId = item.quality.id;
        break;
      }
      if (item.id === cutoffId && item.items) {
        // It's a group, use the first quality in the group
        if (item.items.length > 0 && item.items[0].quality) {
          cutoffQualityId = item.items[0].quality.id;
        }
        break;
      }
    }

    return cutoffQualityId;
  }

  /**
   * Check if content needs quality upgrade
   */
  needsQualityUpgrade(fileQualityId, cutoffQualityId, qualityRanking) {
    const fileQualityIndex = qualityRanking.findIndex(q => q.id === fileQualityId);
    const cutoffQualityIndex = qualityRanking.findIndex(q => q.id === cutoffQualityId);

    return fileQualityIndex !== -1 && cutoffQualityIndex !== -1 && fileQualityIndex < cutoffQualityIndex;
  }

  /**
   * Acquire search lock with timeout
   */
  async acquireSearchLockWithTimeout(service) {
    const maxWaitTime = minutesToMs(10);
    const pollInterval = 10000; // 10 seconds
    const startTime = Date.now();

    while (!amuleManager.acquireSearchLock()) {
      if (Date.now() - startTime > maxWaitTime) {
        this.log(`⚠️  Timeout waiting for search lock, skipping ${service} automatic search`);
        return false;
      }
      this.log('⏳ Search already in progress, waiting for lock to be freed...');
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    amuleManager.searchInProgress = true;
    this.broadcast({ type: 'search-lock', locked: true });
    this.log(`🔒 Search lock acquired for ${service} automatic search`);
    return true;
  }

  /**
   * Release search lock
   */
  releaseSearchLock(service) {
    amuleManager.releaseSearchLock();
    this.broadcast({ type: 'search-lock', locked: false });
    this.log(`🔓 Search lock released after ${service} automatic search`);
  }

  /**
   * Check if content has been released
   * For movies: checks digital/physical release dates
   * For episodes: checks air date
   */
  isContentReleased(content, serviceType) {
    const now = new Date();

    if (serviceType === 'movie') {
      let isReleased = false;
      if (content.digitalRelease && new Date(content.digitalRelease) <= now) {
        isReleased = true;
      }
      if (!isReleased && content.physicalRelease && new Date(content.physicalRelease) <= now) {
        isReleased = true;
      }
      return { isReleased, releaseDate: content.digitalRelease || content.physicalRelease };
    } else {
      // episode
      if (content.airDateUtc) {
        const airDate = new Date(content.airDateUtc);
        return { isReleased: airDate <= now, releaseDate: content.airDateUtc };
      }
      return { isReleased: false, releaseDate: null };
    }
  }

  /**
   * Generic function to trigger missing/upgrade search for Sonarr or Radarr
   * @param {string} service - 'sonarr' or 'radarr'
   */
  async triggerMissingSearch(service) {
    const serviceConfig = {
      sonarr: {
        refreshCommand: 'RefreshSeries',
        contentEndpoint: 'series',
        episodeEndpoint: 'episode',
        queueParam: 'includeUnknownSeriesItems=false',
        queueIdKey: 'episodeId',
        contentType: 'episode',
        contentLabel: 'series',
        itemLabel: 'episodes',
        getContentId: (item) => item.id,
        getItemsForContent: async (cfg, content) => {
          return this.fetchJson(`${cfg.url}/api/v3/episode?seriesId=${content.id}`, {
            headers: { 'X-Api-Key': cfg.apiKey }
          });
        },
        formatItemLabel: (item) => `S${String(item.seasonNumber).padStart(2, '0')}E${String(item.episodeNumber).padStart(2, '0')}`,
        searchFunction: (id) => this.searchEpisode(id)
      },
      radarr: {
        refreshCommand: 'RefreshMovie',
        contentEndpoint: 'movie',
        episodeEndpoint: null,
        queueParam: 'includeUnknownMovieItems=false',
        queueIdKey: 'movieId',
        contentType: 'movie',
        contentLabel: 'movies',
        itemLabel: 'movies',
        getContentId: (item) => item.id,
        getItemsForContent: async (cfg, content) => [content], // Movies don't have sub-items
        formatItemLabel: (item) => `${item.title} (${item.year})`,
        searchFunction: (id) => this.searchMovie(id)
      }
    };

    const svcCfg = serviceConfig[service];
    const cfg = this.getServiceConfig(service);

    if (!cfg.url || !cfg.apiKey) {
      this.log(`⚠️  ${service} URL or API key not configured, skipping automatic search`);
      return;
    }

    // Acquire search lock
    if (!await this.acquireSearchLockWithTimeout(service)) {
      return;
    }

    try {
      this.log(`🔄 Triggering ${service} ${svcCfg.refreshCommand}...`);

      // 1️⃣ Trigger Refresh
      const refreshResult = await this.fetchJson(`${cfg.url}/api/v3/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': cfg.apiKey
        },
        body: JSON.stringify({ name: svcCfg.refreshCommand })
      });

      if (DEBUG) this.log(`⏳ ${svcCfg.refreshCommand} triggered (Command ID: ${refreshResult.id}), waiting for completion...`);
      await this.waitForCommandCompletion(service, refreshResult.id);
      this.log(`✅ ${svcCfg.refreshCommand} completed`);

      // 2️⃣ Fetch content, quality profiles, and queue in parallel (they're independent)
      if (DEBUG) this.log(`📚 Fetching ${svcCfg.contentLabel}, quality profiles, and queue in parallel...`);

      const [allContent, qualityProfiles, queue] = await Promise.all([
        // Fetch all content
        this.fetchJson(`${cfg.url}/api/v3/${svcCfg.contentEndpoint}`, {
          headers: { 'X-Api-Key': cfg.apiKey }
        }),
        // Fetch quality profiles
        this.fetchJson(`${cfg.url}/api/v3/qualityprofile`, {
          headers: { 'X-Api-Key': cfg.apiKey }
        }),
        // Fetch download queue
        this.fetchJson(`${cfg.url}/api/v3/queue?${svcCfg.queueParam}`, {
          headers: { 'X-Api-Key': cfg.apiKey }
        })
      ]);

      if (DEBUG) this.log(`📊 Found ${allContent.length} ${svcCfg.contentLabel}`);

      const profilesMap = new Map(qualityProfiles.map(p => [p.id, p]));
      if (DEBUG) this.log(`🔧 Loaded ${qualityProfiles.length} quality profiles`);

      const queuedIds = new Set();
      if (queue.records) {
        for (const record of queue.records) {
          if (record[svcCfg.queueIdKey]) {
            queuedIds.add(record[svcCfg.queueIdKey]);
          }
        }
      }
      if (DEBUG) this.log(`📊 Found ${queuedIds.size} ${svcCfg.itemLabel} in download queue`);

      // 5️⃣ Process each piece of content
      const itemsToSearch = [];

      for (const content of allContent) {
        if (!content.monitored) {
          if (DEBUG) this.log(`⏭️  Skipping unmonitored ${svcCfg.contentType}: ${content.title}`);
          continue;
        }

        if (DEBUG) this.log(`📺 Processing ${svcCfg.contentType}: ${content.title}`);

        const qualityProfile = profilesMap.get(content.qualityProfileId);
        if (!qualityProfile) {
          this.log(`⚠️  Could not find quality profile for ${content.title}`);
          continue;
        }

        const cutoffQualityId = this.getCutoffQualityId(qualityProfile);
        if (DEBUG) {
          const cutoffName = cutoffQualityId ? `ID ${cutoffQualityId}` : 'N/A';
          this.log(`  Quality profile: ${qualityProfile.name}, Cutoff: ${cutoffName}`);
        }

        // Get items for this content (episodes for series, or the movie itself)
        const items = await svcCfg.getItemsForContent(cfg, content);

        for (const item of items) {
          // For series, check if episode is monitored
          if (svcCfg.contentType === 'episode' && !item.monitored) {
            continue;
          }

          const itemLabel = svcCfg.formatItemLabel(item);
          const itemId = svcCfg.getContentId(item);

          // Check if already in queue
          if (queuedIds.has(itemId)) {
            if (DEBUG) this.log(`  📥 ${itemLabel} - ALREADY IN QUEUE - Skipping`);
            continue;
          }

          // Check if released
          const { isReleased, releaseDate } = this.isContentReleased(item, svcCfg.contentType);
          if (!isReleased) {
            if (DEBUG) {
              const dateStr = releaseDate ? new Date(releaseDate).toISOString().split('T')[0] : 'unknown';
              this.log(`  ⏰ ${itemLabel} - NOT RELEASED YET (${dateStr}) - Skipping`);
            }
            continue;
          }

          // Case 1: Missing file
          if (!item.hasFile) {
            if (DEBUG) this.log(`  🔍 ${itemLabel} - MISSING - Would search`);
            itemsToSearch.push({
              title: content.title,
              year: content.year,
              itemId: itemId,
              label: itemLabel,
              reason: 'missing'
            });
            continue;
          }

          // Case 2: Check quality upgrade
          const fileObj = svcCfg.contentType === 'episode' ? item.episodeFile : item.movieFile;
          if (fileObj && cutoffQualityId) {
            const fileQuality = fileObj.quality?.quality?.name;
            const fileQualityId = fileObj.quality?.quality?.id;

            const qualityRanking = this.buildQualityRanking(qualityProfile);

            if (this.needsQualityUpgrade(fileQualityId, cutoffQualityId, qualityRanking)) {
              const cutoffQualityObj = qualityRanking.find(q => q.id === cutoffQualityId);
              const cutoffQualityName = cutoffQualityObj ? cutoffQualityObj.name : 'Unknown';
              const fileQualityIndex = qualityRanking.findIndex(q => q.id === fileQualityId);
              const cutoffQualityIndex = qualityRanking.findIndex(q => q.id === cutoffQualityId);

              if (DEBUG) {
                this.log(`  📈 ${itemLabel} - UPGRADE NEEDED - Current: ${fileQuality} (index ${fileQualityIndex}), Cutoff: ${cutoffQualityName} (index ${cutoffQualityIndex}) - Would search`);
              }
              itemsToSearch.push({
                title: content.title,
                year: content.year,
                itemId: itemId,
                label: itemLabel,
                reason: `upgrade (${fileQuality} → ${cutoffQualityName})`
              });
            } else if (DEBUG) {
              const cutoffQualityObj = qualityRanking.find(q => q.id === cutoffQualityId);
              const cutoffQualityName = cutoffQualityObj ? cutoffQualityObj.name : 'Unknown';
              const fileQualityIndex = qualityRanking.findIndex(q => q.id === fileQualityId);
              const cutoffQualityIndex = qualityRanking.findIndex(q => q.id === cutoffQualityId);
              this.log(`  ✅ ${itemLabel} - OK - Quality: ${fileQuality} (index ${fileQualityIndex}), Cutoff: ${cutoffQualityName} (index ${cutoffQualityIndex})`);
            }
          }
        }
      }

      // 6️⃣ Summary and search
      if (DEBUG) this.log(`📋 Summary: Found ${itemsToSearch.length} ${svcCfg.itemLabel} that need searching`);

      if (itemsToSearch.length > 0) {
        this.log(`🎯 ${svcCfg.itemLabel.charAt(0).toUpperCase() + svcCfg.itemLabel.slice(1)} to search:`);
        for (const item of itemsToSearch) {
          const displayLabel = svcCfg.contentType === 'episode'
            ? `${item.title} - ${item.label}`
            : item.label;
          this.log(`  • ${displayLabel} [${item.reason}]`);
        }

        for (const item of itemsToSearch) {
          await svcCfg.searchFunction(item.itemId);
        }
      } else {
        this.log(`✅ All monitored ${svcCfg.itemLabel} are either present or meet quality requirements`);
      }

      // Update last successful search time
      await this.updateLastSearchCompleted(service);
      if (DEBUG) this.log(`💾 Updated last ${service} search completion time`);

    } catch (err) {
      this.log(`❌ Error during ${service} refresh/missing search:`, err.message);
    } finally {
      this.releaseSearchLock(service);
    }
  }

  // Trigger Radarr to search for missing movies
  async triggerRadarrMissingSearch() {
    return this.triggerMissingSearch('radarr');
  }

  // Trigger Sonarr to search for missing episodes
  async triggerSonarrMissingSearch() {
    return this.triggerMissingSearch('sonarr');
  }

  // Check and trigger search if interval has elapsed
  async checkAndTriggerSearch(service) {
    const state = await this.readState();
    const intervalMs = service === 'sonarr'
      ? hoursToMs(config.SONARR_SEARCH_INTERVAL_HOURS)
      : hoursToMs(config.RADARR_SEARCH_INTERVAL_HOURS);

    if(intervalMs === 0) {
        return;
    }

    const lastCompleted = service === 'sonarr'
      ? state.lastSonarrSearchCompleted
      : state.lastRadarrSearchCompleted;

    const now = Date.now();

    // If never run before, run immediately
    if (!lastCompleted) {
      this.log(`🚀 ${service.charAt(0).toUpperCase() + service.slice(1)} search has never run, triggering now...`);
      if (service === 'sonarr') {
        await this.triggerSonarrMissingSearch();
      } else {
        await this.triggerRadarrMissingSearch();
      }
      return;
    }

    // Check if enough time has elapsed since last completion
    const lastCompletedTime = new Date(lastCompleted).getTime();
    const timeSinceLastRun = now - lastCompletedTime;

    if (timeSinceLastRun >= intervalMs) {
      const hoursOverdue = Math.floor((timeSinceLastRun - intervalMs) / MS_PER_HOUR);
      this.log(`⏰ ${service.charAt(0).toUpperCase() + service.slice(1)} search interval elapsed (${hoursOverdue}h overdue), triggering now...`);
      if (service === 'sonarr') {
        await this.triggerSonarrMissingSearch();
      } else {
        await this.triggerRadarrMissingSearch();
      }
    }
  }

  // Schedule automatic searches
  scheduleAutomaticSearches() {
    // Schedule Sonarr searches if configured
    if (config.SONARR_SEARCH_INTERVAL_HOURS > 0) {
      this.log(`⏰ Scheduling Sonarr automatic searches every ${config.SONARR_SEARCH_INTERVAL_HOURS} hour(s)`);

      // Check immediately on startup
      this.checkAndTriggerSearch('sonarr');
    } else {
      this.log('ℹ️  Sonarr automatic search scheduling disabled (set SONARR_SEARCH_INTERVAL_HOURS > 0 to enable)');
    }

    // Setup automatic searches (user may have enabled it from the settings panel after initialization)
    setInterval(() => this.checkAndTriggerSearch('sonarr'), minutesToMs(10));

    // Schedule Radarr searches if configured
    if (config.RADARR_SEARCH_INTERVAL_HOURS > 0) {
      this.log(`⏰ Scheduling Radarr automatic searches every ${config.RADARR_SEARCH_INTERVAL_HOURS} hour(s)`);

      // Check immediately on startup
      this.checkAndTriggerSearch('radarr');
    } else {
      this.log('ℹ️  Radarr automatic search scheduling disabled (set RADARR_SEARCH_INTERVAL_HOURS > 0 to enable)');
    }

    // Setup automatic searches (user may have enabled it from the settings panel after initialization)
    setInterval(() => this.checkAndTriggerSearch('radarr'), minutesToMs(10));
  }
}

module.exports = new ArrManager();