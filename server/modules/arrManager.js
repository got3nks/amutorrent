/**
 * Radarr/Sonarr Integration Module
 * Handles automatic search triggers for Radarr and Sonarr
 */

const config = require('./config');
const BaseModule = require('../lib/BaseModule');
const fs = require('fs').promises;
const path = require('path');

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

  // Search for a specific episode in Sonarr
  async searchEpisode(episodeId) {
    try {
      const result = await this.fetchJson(`${config.SONARR_URL}/api/v3/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': config.SONARR_API_KEY
        },
        body: JSON.stringify({
          name: 'EpisodeSearch',
          episodeIds: [episodeId]
        })
      });
      this.log(`  🔍 Episode search triggered (Command ID: ${result.id}), waiting for completion...`);

      // Wait for the search command to complete
      await this.waitForCommandCompletion('sonarr', result.id);
      this.log(`  ✅ Episode search completed (Command ID: ${result.id})`);
    } catch (err) {
      this.log(`  ❌ Failed to search episode ${episodeId}:`, err.message);
    }
  }

  // Search for a specific movie in Radarr
  async searchMovie(movieId) {
    try {
      const result = await this.fetchJson(`${config.RADARR_URL}/api/v3/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': config.RADARR_API_KEY
        },
        body: JSON.stringify({
          name: 'MoviesSearch',
          movieIds: [movieId]
        })
      });
      this.log(`  🔍 Movie search triggered (Command ID: ${result.id}), waiting for completion...`);

      // Wait for the search command to complete
      await this.waitForCommandCompletion('radarr', result.id);
      this.log(`  ✅ Movie search completed (Command ID: ${result.id})`);
    } catch (err) {
      this.log(`  ❌ Failed to search movie ${movieId}:`, err.message);
    }
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

  // Helper function to poll command status with timeout
  async waitForCommandCompletion(service, commandId, timeoutMs = config.COMMAND_TIMEOUT_MS) {
    const pollInterval = 5000; // 5 seconds
    const startTime = Date.now();
    const url = service === 'radarr' ? config.RADARR_URL : config.SONARR_URL;
    const apiKey = service === 'radarr' ? config.RADARR_API_KEY : config.SONARR_API_KEY;

    while (true) {
      // Check timeout
      if (Date.now() - startTime > timeoutMs) {
        this.log('⏱️ Command did not complete within timeout, proceeding anyway...');
        return;
      }

      const statusResp = await fetch(`${url}/api/v3/command/${commandId}`, {
        headers: { 'X-Api-Key': apiKey }
      });
      const statusData = await statusResp.json();

      // Command state is in `state`
      const state = statusData.state || statusData.status || '';
      if (state === 'completed') return;
      if (state === 'failed') throw new Error(`${service} command failed`);

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }

  // Trigger Radarr to search for missing movies
  async triggerRadarrMissingSearch() {
    if (!config.RADARR_URL || !config.RADARR_API_KEY) {
      this.log('⚠️  Radarr URL or API key not configured, skipping automatic search');
      return;
    }

    // Wait for search lock to be available
    const maxWaitTime = 30 * 60 * 1000; // 30 minutes
    const pollInterval = 10000; // 10 seconds
    const startTime = Date.now();

    while (!this.amuleManager.acquireSearchLock()) {
      if (Date.now() - startTime > maxWaitTime) {
        this.log('⚠️  Timeout waiting for search lock, skipping Radarr automatic search');
        return;
      }
      this.log('⏳ Search already in progress, waiting for lock to be freed...');
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    this.amuleManager.searchInProgress = true;
    this.broadcast({ type: 'search-lock', locked: true });
    this.log('🔒 Search lock acquired for Radarr automatic search');

    try {
      this.log('🔄 Triggering Radarr RefreshMovie...');

      // 1️⃣ Trigger RefreshMovie
      const refreshResult = await this.fetchJson(`${config.RADARR_URL}/api/v3/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': config.RADARR_API_KEY
        },
        body: JSON.stringify({ name: 'RefreshMovie' })
      });

      if(DEBUG) this.log(`⏳ RefreshMovie triggered (Command ID: ${refreshResult.id}), waiting for completion...`);

      // Wait until RefreshMovie completes
      await this.waitForCommandCompletion('radarr', refreshResult.id);
      this.log('✅ RefreshMovie completed');

      // 2️⃣ Fetch all movies
      if(DEBUG) this.log('🎬 Fetching all movies...');
      const movies = await this.fetchJson(`${config.RADARR_URL}/api/v3/movie`, {
        headers: { 'X-Api-Key': config.RADARR_API_KEY }
      });
      if(DEBUG) this.log(`📊 Found ${movies.length} movies`);

      // 3️⃣ Cache quality profiles for performance
      if(DEBUG) this.log('⚙️  Fetching quality profiles...');
      const qualityProfiles = await this.fetchJson(`${config.RADARR_URL}/api/v3/qualityprofile`, {
        headers: { 'X-Api-Key': config.RADARR_API_KEY }
      });
      const profilesMap = new Map(qualityProfiles.map(p => [p.id, p]));
      if (DEBUG) this.log(`🔧 Loaded ${qualityProfiles.length} quality profiles`);

      // 4️⃣ Fetch download queue to skip movies already downloading
      if(DEBUG) this.log('📥 Fetching download queue...');
      const queue = await this.fetchJson(`${config.RADARR_URL}/api/v3/queue?includeUnknownMovieItems=false`, {
        headers: { 'X-Api-Key': config.RADARR_API_KEY }
      });
      const queuedMovieIds = new Set();
      if (queue.records) {
        for (const record of queue.records) {
          if (record.movieId) {
            queuedMovieIds.add(record.movieId);
          }
        }
      }
      if(DEBUG) this.log(`📊 Found ${queuedMovieIds.size} movies in download queue`);

      // 5️⃣ Process each movie
      const moviesToSearch = [];

      for (const movie of movies) {
        if (!movie.monitored) {
          if (DEBUG) this.log(`⏭️  Skipping unmonitored movie: ${movie.title}`);
          continue;
        }

        if (DEBUG) this.log(`🎬 Processing movie: ${movie.title} (${movie.year})`);

        const qualityProfile = profilesMap.get(movie.qualityProfileId);
        if (!qualityProfile) {
          this.log(`⚠️  Could not find quality profile for ${movie.title}`);
          continue;
        }

        // The cutoff is an ID, we need to look it up in the quality items
        const cutoffId = qualityProfile.cutoff;
        let cutoffQualityId = null;

        // Find the quality or group that matches the cutoff ID
        // If it's a group, we need to find the FIRST quality in that group
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

        if (DEBUG) {
          const cutoffName = cutoffQualityId ? `ID ${cutoffQualityId}` : 'N/A';
          this.log(`  Quality profile: ${qualityProfile.name}, Cutoff: ${cutoffName}`);
        }

        // Skip if movie is already in download queue
        if (queuedMovieIds.has(movie.id)) {
          if (DEBUG) this.log(`  📥 ALREADY IN QUEUE - Skipping`);
          continue;
        }

        // Skip if movie hasn't been released yet
        // Check digital release, physical release, or in cinemas date
        const now = new Date();
        let isReleased = false;
        let releaseDate = null;

        if (movie.digitalRelease) {
          const digitalDate = new Date(movie.digitalRelease);
          if (digitalDate <= now) {
            isReleased = true;
          } else {
            releaseDate = digitalDate;
          }
        }

        if (!isReleased && movie.physicalRelease) {
          const physicalDate = new Date(movie.physicalRelease);
          if (physicalDate <= now) {
            isReleased = true;
          } else if (!releaseDate || physicalDate < releaseDate) {
            releaseDate = physicalDate;
          }
        }

        /*
        if (!isReleased && movie.inCinemas) {
          const cinemasDate = new Date(movie.inCinemas);
          if (cinemasDate <= now) {
            isReleased = true;
          } else if (!releaseDate || cinemasDate < releaseDate) {
            releaseDate = cinemasDate;
          }
        }
        */

        if (!isReleased) {
          if (DEBUG) {
            const dateStr = releaseDate ? releaseDate.toISOString().split('T')[0] : 'unknown';
            this.log(`  ⏰ NOT RELEASED YET (${dateStr}) - Skipping`);
          }
          continue;
        }

        // Case 1: Movie is missing
        if (!movie.hasFile) {
          if (DEBUG) this.log(`  🔍 MISSING - Would search`);
          moviesToSearch.push({
            title: movie.title,
            year: movie.year,
            movieId: movie.id,
            reason: 'missing'
          });
          continue;
        }

        // Case 2: Movie has file, check quality
        if (movie.movieFile && cutoffQualityId) {
          const fileQuality = movie.movieFile.quality?.quality?.name;
          const fileQualityId = movie.movieFile.quality?.quality?.id;

          // Build a quality ranking based on the profile's items order
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

          const fileQualityIndex = qualityRanking.findIndex(q => q.id === fileQualityId);
          const cutoffQualityIndex = qualityRanking.findIndex(q => q.id === cutoffQualityId);

          // Find cutoff quality name for display
          const cutoffQualityObj = qualityRanking.find(q => q.id === cutoffQualityId);
          const cutoffQualityName = cutoffQualityObj ? cutoffQualityObj.name : 'Unknown';

          if (fileQualityIndex !== -1 && cutoffQualityIndex !== -1 && fileQualityIndex < cutoffQualityIndex) {
            if (DEBUG) {
              this.log(`  📈 UPGRADE NEEDED - Current: ${fileQuality} (index ${fileQualityIndex}), Cutoff: ${cutoffQualityName} (index ${cutoffQualityIndex}) - Would search`);
            }
            moviesToSearch.push({
              title: movie.title,
              year: movie.year,
              movieId: movie.id,
              reason: `upgrade (${fileQuality} → ${cutoffQualityName})`
            });
          } else {
            if (DEBUG) {
              this.log(`  ✅ OK - Quality: ${fileQuality} (index ${fileQualityIndex}), Cutoff: ${cutoffQualityName} (index ${cutoffQualityIndex})`);
            }
          }
        }
      }

      // 6️⃣ Summary
      if(DEBUG) this.log(`📋 Summary: Found ${moviesToSearch.length} movies that need searching`);

      if (moviesToSearch.length > 0) {
        this.log('🎯 Movies to search:');
        for (const mv of moviesToSearch) {
          this.log(`  • ${mv.title} (${mv.year}) [${mv.reason}]`);
        }

        for (const mv of moviesToSearch) {
          await this.searchMovie(mv.movieId);
        }
      } else {
        this.log('✅ All monitored movies are either present or meet quality requirements');
      }

      // Update last successful search time
      await this.updateLastSearchCompleted('radarr');
      if(DEBUG) this.log('💾 Updated last Radarr search completion time');

    } catch (err) {
      this.log('❌ Error during Radarr refresh/missing search:', err.message);
    } finally {
      this.amuleManager.releaseSearchLock();
      this.broadcast({ type: 'search-lock', locked: false });
      this.log('🔓 Search lock released after Radarr automatic search');
    }
  }

  // Trigger Sonarr to search for missing episodes
  async triggerSonarrMissingSearch() {
    if (!config.SONARR_URL || !config.SONARR_API_KEY) {
      this.log('⚠️  Sonarr URL or API key not configured, skipping automatic search');
      return;
    }

    // Wait for search lock to be available
    const maxWaitTime = 30 * 60 * 1000; // 30 minutes
    const pollInterval = 10000; // 10 seconds
    const startTime = Date.now();

    while (!this.amuleManager.acquireSearchLock()) {
      if (Date.now() - startTime > maxWaitTime) {
        this.log('⚠️  Timeout waiting for search lock, skipping Sonarr automatic search');
        return;
      }
      this.log('⏳ Search already in progress, waiting for lock to be freed...');
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    this.amuleManager.searchInProgress = true;
    this.broadcast({ type: 'search-lock', locked: true });
    this.log('🔒 Search lock acquired for Sonarr automatic search');

    try {
      this.log('🔄 Triggering Sonarr RefreshSeries...');

      // 1️⃣ Trigger RefreshSeries
      const refreshResult = await this.fetchJson(`${config.SONARR_URL}/api/v3/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': config.SONARR_API_KEY
        },
        body: JSON.stringify({ name: 'RefreshSeries' })
      });

      if(DEBUG) this.log(`⏳ RefreshSeries triggered (Command ID: ${refreshResult.id}), waiting for completion...`);

      // Wait until RefreshSeries completes
      await this.waitForCommandCompletion('sonarr', refreshResult.id);
      this.log('✅ RefreshSeries completed');

      // 2️⃣ Fetch all series
      if(DEBUG) this.log('📚 Fetching all series...');
      const series = await this.fetchJson(`${config.SONARR_URL}/api/v3/series`, {
        headers: { 'X-Api-Key': config.SONARR_API_KEY }
      });
      if(DEBUG) this.log(`📊 Found ${series.length} series`);

      // 3️⃣ Cache quality profiles for performance
      if(DEBUG) this.log('⚙️  Fetching quality profiles...');
      const qualityProfiles = await this.fetchJson(`${config.SONARR_URL}/api/v3/qualityprofile`, {
        headers: { 'X-Api-Key': config.SONARR_API_KEY }
      });
      const profilesMap = new Map(qualityProfiles.map(p => [p.id, p]));
      if (DEBUG) this.log(`🔧 Loaded ${qualityProfiles.length} quality profiles`);

      // 4️⃣ Fetch download queue to skip episodes already downloading
      if(DEBUG) this.log('📥 Fetching download queue...');
      const queue = await this.fetchJson(`${config.SONARR_URL}/api/v3/queue?includeUnknownSeriesItems=false`, {
        headers: { 'X-Api-Key': config.SONARR_API_KEY }
      });
      const queuedEpisodeIds = new Set();
      if (queue.records) {
        for (const record of queue.records) {
          if (record.episodeId) {
            queuedEpisodeIds.add(record.episodeId);
          }
        }
      }
      if(DEBUG) this.log(`📊 Found ${queuedEpisodeIds.size} episodes in download queue`);

      // 4️⃣ Process each series
      const episodesToSearch = [];

      for (const show of series) {
        if (!show.monitored) {
          if (DEBUG) this.log(`⏭️  Skipping unmonitored series: ${show.title}`);
          continue;
        }

        if (DEBUG) this.log(`📺 Processing series: ${show.title} (ID: ${show.id})`);

        // Get episodes for this series
        const episodes = await this.fetchJson(
          `${config.SONARR_URL}/api/v3/episode?seriesId=${show.id}`,
          { headers: { 'X-Api-Key': config.SONARR_API_KEY } }
        );

        const qualityProfile = profilesMap.get(show.qualityProfileId);
        if (!qualityProfile) {
          this.log(`⚠️  Could not find quality profile for ${show.title}`);
          continue;
        }

        // The cutoff is an ID, we need to look it up in the quality items
        const cutoffId = qualityProfile.cutoff;
        let cutoffQualityId = null;

        // Find the quality or group that matches the cutoff ID
        // If it's a group, we need to find the FIRST quality in that group
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

        if (DEBUG) {
          const cutoffName = cutoffQualityId ? `ID ${cutoffQualityId}` : 'N/A';
          this.log(`  Quality profile: ${qualityProfile.name}, Cutoff: ${cutoffName}`);
        }

        // Process each episode
        for (const episode of episodes) {
          // Skip if not monitored
          if (!episode.monitored) continue;

          const episodeLabel = `S${String(episode.seasonNumber).padStart(2, '0')}E${String(episode.episodeNumber).padStart(2, '0')}`;

          // Skip if episode hasn't aired yet
          if (episode.airDateUtc) {
            const airDate = new Date(episode.airDateUtc);
            const now = new Date();
            if (airDate > now) {
              if (DEBUG) this.log(`  ⏰ ${episodeLabel} - NOT AIRED YET (${airDate.toISOString().split('T')[0]}) - Skipping`);
              continue;
            }
          }

          // Skip if episode is already in download queue
          if (queuedEpisodeIds.has(episode.id)) {
            if (DEBUG) this.log(`  📥 ${episodeLabel} - ALREADY IN QUEUE - Skipping`);
            continue;
          }

          // Case 1: Episode is missing
          if (!episode.hasFile) {
            if (DEBUG) this.log(`  🔍 ${episodeLabel} - MISSING - Would search`);
            episodesToSearch.push({
              seriesTitle: show.title,
              episodeId: episode.id,
              label: episodeLabel,
              reason: 'missing'
            });
            continue;
          }

          // Case 2: Episode has file, check quality
          if (episode.episodeFile && cutoffQualityId) {
            const fileQuality = episode.episodeFile.quality?.quality?.name;
            const fileQualityId = episode.episodeFile.quality?.quality?.id;

            // Build a quality ranking based on the profile's items order
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

            const fileQualityIndex = qualityRanking.findIndex(q => q.id === fileQualityId);
            const cutoffQualityIndex = qualityRanking.findIndex(q => q.id === cutoffQualityId);

            // Find cutoff quality name for display
            const cutoffQualityObj = qualityRanking.find(q => q.id === cutoffQualityId);
            const cutoffQualityName = cutoffQualityObj ? cutoffQualityObj.name : 'Unknown';

            if (fileQualityIndex !== -1 && cutoffQualityIndex !== -1 && fileQualityIndex < cutoffQualityIndex) {
              if (DEBUG) {
                this.log(`  📈 ${episodeLabel} - UPGRADE NEEDED - Current: ${fileQuality} (index ${fileQualityIndex}), Cutoff: ${cutoffQualityName} (index ${cutoffQualityIndex}) - Would search`);
              }
              episodesToSearch.push({
                seriesTitle: show.title,
                episodeId: episode.id,
                label: episodeLabel,
                reason: `upgrade (${fileQuality} → ${cutoffQualityName})`
              });
            } else {
              if (DEBUG) {
                this.log(`  ✅ ${episodeLabel} - OK - Quality: ${fileQuality} (index ${fileQualityIndex}), Cutoff: ${cutoffQualityName} (index ${cutoffQualityIndex})`);
              }
            }
          }
        }
      }

      // 5️⃣ Summary
      if(DEBUG) this.log(`📋 Summary: Found ${episodesToSearch.length} episodes that need searching`);

      if (episodesToSearch.length > 0) {
        this.log('🎯 Episodes to search:');
        for (const ep of episodesToSearch) {
          this.log(`  • ${ep.seriesTitle} - ${ep.label} [${ep.reason}]`);
        }

        for (const ep of episodesToSearch) {
           await this.searchEpisode(ep.episodeId);
        }
      } else {
        this.log('✅ All monitored episodes are either present or meet quality requirements');
      }

      // Update last successful search time
      await this.updateLastSearchCompleted('sonarr');
      this.log('💾 Updated last Sonarr search completion time');

    } catch (err) {
      this.log('❌ Error during Sonarr refresh/missing search:', err.message);
    } finally {
      this.amuleManager.releaseSearchLock();
      this.broadcast({ type: 'search-lock', locked: false });
      this.log('🔓 Search lock released after Sonarr automatic search');
    }
  }

  // Check if a search should be triggered based on last completion time
  async checkAndTriggerSearch(service) {
    const state = await this.readState();
    const intervalMs = service === 'sonarr'
      ? config.SONARR_SEARCH_INTERVAL_HOURS * 60 * 60 * 1000
      : config.RADARR_SEARCH_INTERVAL_HOURS * 60 * 60 * 1000;

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
      const hoursOverdue = Math.floor((timeSinceLastRun - intervalMs) / (60 * 60 * 1000));
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

      // Then check every 10 minutes if we need to trigger a search
      setInterval(() => this.checkAndTriggerSearch('sonarr'), 10 * 60 * 1000);
    } else {
      this.log('ℹ️  Sonarr automatic search scheduling disabled (set SONARR_SEARCH_INTERVAL_HOURS > 0 to enable)');
    }

    // Schedule Radarr searches if configured
    if (config.RADARR_SEARCH_INTERVAL_HOURS > 0) {
      this.log(`⏰ Scheduling Radarr automatic searches every ${config.RADARR_SEARCH_INTERVAL_HOURS} hour(s)`);

      // Check immediately on startup
      this.checkAndTriggerSearch('radarr');

      // Then check every 10 minutes if we need to trigger a search
      setInterval(() => this.checkAndTriggerSearch('radarr'), 10 * 60 * 1000);
    } else {
      this.log('ℹ️  Radarr automatic search scheduling disabled (set RADARR_SEARCH_INTERVAL_HOURS > 0 to enable)');
    }
  }
}

module.exports = new ArrManager();