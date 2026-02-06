/**
 * History API Module
 * Provides endpoints for download history management
 * Status is maintained by background task in autoRefreshManager
 * Live data (speeds, ratios) enriched from DataFetchService cache
 */

const BaseModule = require('../lib/BaseModule');
const config = require('./config');
const dataFetchService = require('../lib/DataFetchService');

// Fields that require live data for sorting (not reliably in DB for inactive items)
// All transfer stats (downloaded, uploaded, ratio, speeds) are enriched from live data when available
const LIVE_DATA_SORT_FIELDS = ['downloadSpeed', 'uploadSpeed'];

// Map frontend field names to DB column names
const FIELD_TO_DB_COLUMN = {
  addedAt: 'started_at',
  completedAt: 'completed_at',
  name: 'filename'
};

class HistoryAPI extends BaseModule {
  /**
   * Enrich history entries with live data from unified items cache
   * @param {Array} entries - History entries from database
   * @param {Object} cachedData - Cached batch data from DataFetchService (contains unified items)
   * @returns {Array} Enriched entries
   */
  enrichEntriesWithLiveData(entries, cachedData) {
    // Build lookup map from unified items (single pass, O(n))
    const itemsByHash = new Map();
    if (cachedData?.items) {
      for (const item of cachedData.items) {
        if (item.hash) itemsByHash.set(item.hash.toLowerCase(), item);
      }
    }

    return entries.map(entry => {
      const hash = entry.hash?.toLowerCase();

      // Normalize DB column names to API names
      const normalized = {
        ...entry,
        clientType: entry.client_type || 'amule',
        client: entry.client_type || 'amule',
        trackerDomain: entry.tracker_domain || null,
        tracker: entry.tracker_domain || null,
        name: entry.filename,
        addedAt: entry.started_at,
        completedAt: entry.completed_at
      };

      // Look up live data from unified items
      const liveItem = hash ? itemsByHash.get(hash) : null;

      if (liveItem) {
        // Enrich with live data (real-time values)
        return {
          ...normalized,
          downloadSpeed: liveItem.downloadSpeed || 0,
          uploadSpeed: liveItem.uploadSpeed || 0,
          downloaded: liveItem.sizeDownloaded ?? entry.downloaded ?? 0,
          uploaded: liveItem.uploadTotal ?? entry.uploaded ?? 0,
          ratio: liveItem.ratio ?? entry.ratio ?? 0,
          category: liveItem.category || null,
          categoryId: liveItem.categoryId ?? null,
          size: entry.size || liveItem.size,
          name: liveItem.name || entry.filename,
          tracker: liveItem.tracker || entry.tracker_domain || null,
          trackerDomain: liveItem.tracker || entry.tracker_domain || null
        };
      }

      // No live data - use DB values, speeds are null (not currently active)
      return {
        ...normalized,
        downloadSpeed: null,
        uploadSpeed: null,
        category: null,
        categoryId: null
      };
    });
  }

  /**
   * Register API routes
   * @param {Express} app - Express app instance
   */
  registerRoutes(app) {
    // Get history list
    app.get('/api/history', (req, res) => {
      try {
        if (!this.downloadHistoryDB) {
          return res.status(503).json({ error: 'History service not available' });
        }

        // Parse query parameters
        const limit = Math.min(parseInt(req.query.limit) || 50, 500);
        const offset = parseInt(req.query.offset) || 0;
        // Map frontend field names to DB column names
        const rawSortBy = req.query.sortBy || 'addedAt';
        const sortBy = FIELD_TO_DB_COLUMN[rawSortBy] || rawSortBy;
        const sortDir = req.query.sortDir || 'desc';
        const rawSecondarySortBy = req.query.secondarySortBy || '';
        const secondarySortBy = FIELD_TO_DB_COLUMN[rawSecondarySortBy] || rawSecondarySortBy;
        const secondarySortDir = req.query.secondarySortDir || 'asc';
        const search = req.query.search || '';
        const statusFilter = req.query.status || '';
        // Client type filter: comma-separated list (e.g., "amule,rtorrent") or single value
        const clientTypeFilter = req.query.clientType ? req.query.clientType.split(',').map(s => s.trim().toLowerCase()) : [];
        // Tracker filter: comma-separated list (e.g., "tracker1.com,tracker2.org") or single value
        const trackerFilter = req.query.tracker ? req.query.tracker.split(',').map(s => s.trim()) : [];
        // Category filter: category name or ID (from live data enrichment)
        const categoryFilter = req.query.category || '';

        // Get cached live data for enrichment
        const cachedData = dataFetchService.getCachedBatchData();

        // Check if sorting by a live data field (requires JS sorting after enrichment)
        const isLiveDataSort = LIVE_DATA_SORT_FIELDS.includes(sortBy);
        // Client type filter, tracker filter, and category filter require JS filtering
        const needsJsFiltering = statusFilter || isLiveDataSort || clientTypeFilter.length > 0 || trackerFilter.length > 0 || categoryFilter;

        let entries, total;

        if (needsJsFiltering) {
          // When filtering by status OR sorting by live data field, we need to:
          // 1. Fetch all matching entries from DB (with DB-level sorting if not live data sort)
          // 2. Enrich with live data
          // 3. Sort by live data field if needed
          // 4. Apply status filter if needed
          // 5. Paginate in JS
          const dbSortBy = isLiveDataSort ? 'started_at' : sortBy;
          const dbSortDir = isLiveDataSort ? 'desc' : sortDir;
          const allResults = this.downloadHistoryDB.getHistory(0, 0, dbSortBy, dbSortDir, search);

          // Enrich all entries with live data
          let enrichedEntries = this.enrichEntriesWithLiveData(allResults.entries, cachedData);

          // Apply status filter if present
          if (statusFilter) {
            enrichedEntries = enrichedEntries.filter(entry => entry.status === statusFilter);
          }

          // Apply client type filter if present
          if (clientTypeFilter.length > 0) {
            enrichedEntries = enrichedEntries.filter(entry =>
              clientTypeFilter.includes((entry.clientType || 'amule').toLowerCase())
            );
          }

          // Apply tracker filter if present (OR logic - match any selected tracker)
          if (trackerFilter.length > 0) {
            enrichedEntries = enrichedEntries.filter(entry =>
              trackerFilter.includes(entry.trackerDomain)
            );
          }

          // Apply category filter if present (matches category name or "none" for uncategorized)
          if (categoryFilter) {
            if (categoryFilter === 'none') {
              enrichedEntries = enrichedEntries.filter(entry => !entry.category);
            } else {
              enrichedEntries = enrichedEntries.filter(entry => entry.category === categoryFilter);
            }
          }

          // Sort by live data field if needed (with secondary sort support)
          if (isLiveDataSort) {
            const sortMultiplier = sortDir === 'asc' ? 1 : -1;
            const secondaryMultiplier = secondarySortDir === 'asc' ? 1 : -1;
            // Helper to normalize sort values - treat 0, null, undefined as equivalent for speed fields
            const getSortValue = (item, field) => {
              const val = item[field];
              // For speed fields, treat 0 and null/undefined as equivalent (inactive)
              if (LIVE_DATA_SORT_FIELDS.includes(field) && (val == null || val === 0)) {
                return null; // Use null as sentinel for "no value"
              }
              return val ?? null;
            };
            // Compare two values, treating null as smallest (like -Infinity)
            // DESC: high values first, null last
            // ASC: null first, then low to high
            const compareValues = (aVal, bVal, multiplier) => {
              // Both null - equal
              if (aVal === null && bVal === null) return 0;
              // Null is smallest: a=null means a < b
              if (aVal === null) return -multiplier; // ASC: a first (-1), DESC: a last (+1)
              if (bVal === null) return multiplier;  // ASC: b first, a last (+1), DESC: a first (-1)
              // Both strings
              if (typeof aVal === 'string' && typeof bVal === 'string') {
                return multiplier * aVal.localeCompare(bVal);
              }
              // Numeric comparison
              return multiplier * (aVal - bVal);
            };
            enrichedEntries.sort((a, b) => {
              // Primary sort
              const aVal = getSortValue(a, sortBy);
              const bVal = getSortValue(b, sortBy);
              const result = compareValues(aVal, bVal, sortMultiplier);
              // Secondary sort if primary values are equal
              if (result === 0 && secondarySortBy) {
                const aSecondary = getSortValue(a, secondarySortBy);
                const bSecondary = getSortValue(b, secondarySortBy);
                return compareValues(aSecondary, bSecondary, secondaryMultiplier);
              }
              return result;
            });
          }

          total = enrichedEntries.length;
          entries = enrichedEntries.slice(offset, offset + limit);
        } else {
          // No status filter and DB-sortable field - use database pagination directly
          const result = this.downloadHistoryDB.getHistory(limit, offset, sortBy, sortDir, search, secondarySortBy, secondarySortDir);
          entries = result.entries;
          total = result.total;

          // Enrich entries with live data (speeds, ratios, tracker)
          entries = this.enrichEntriesWithLiveData(entries, cachedData);
        }

        // Check if username tracking is configured
        const historyConfig = config.getConfig()?.history || {};
        const trackUsername = !!historyConfig.usernameHeader;

        res.json({
          entries,
          total,
          limit,
          offset,
          trackUsername
        });
      } catch (err) {
        this.log('Error fetching history:', err.message);
        res.status(500).json({ error: 'Failed to fetch history' });
      }
    });

    // Get all history entries (for client-side pagination)
    // Returns up to 10k most recent entries with live data enrichment
    app.get('/api/history/all', (req, res) => {
      try {
        if (!this.downloadHistoryDB) {
          return res.status(503).json({ error: 'History service not available' });
        }

        const LIMIT = 10000;

        // Fetch all entries, sorted by most recent first
        const result = this.downloadHistoryDB.getHistory(LIMIT, 0, 'started_at', 'desc', '');

        // Enrich with live data
        const cachedData = dataFetchService.getCachedBatchData();
        const entries = this.enrichEntriesWithLiveData(result.entries, cachedData);

        // Check if username tracking is configured
        const historyConfig = config.getConfig()?.history || {};
        const trackUsername = !!historyConfig.usernameHeader;

        res.json({
          entries,
          total: result.total,
          trackUsername
        });
      } catch (err) {
        this.log('Error fetching all history:', err.message);
        res.status(500).json({ error: 'Failed to fetch history' });
      }
    });

    // Get history statistics
    app.get('/api/history/stats', (req, res) => {
      try {
        if (!this.downloadHistoryDB) {
          return res.status(503).json({ error: 'History service not available' });
        }

        const stats = this.downloadHistoryDB.getStats();
        res.json(stats);
      } catch (err) {
        this.log('Error fetching history stats:', err.message);
        res.status(500).json({ error: 'Failed to fetch history stats' });
      }
    });

    // Get single history entry by hash
    app.get('/api/history/:hash', (req, res) => {
      try {
        if (!this.downloadHistoryDB) {
          return res.status(503).json({ error: 'History service not available' });
        }

        const hash = req.params.hash.toLowerCase();
        const entry = this.downloadHistoryDB.getByHash(hash);

        if (!entry) {
          return res.status(404).json({ error: 'Entry not found' });
        }

        // Enrich with live data
        const cachedData = dataFetchService.getCachedBatchData();
        const enrichedEntries = this.enrichEntriesWithLiveData([entry], cachedData);

        res.json(enrichedEntries[0]);
      } catch (err) {
        this.log('Error fetching history entry:', err.message);
        res.status(500).json({ error: 'Failed to fetch history entry' });
      }
    });

    // Delete a history entry permanently
    app.delete('/api/history/:hash', (req, res) => {
      try {
        if (!this.downloadHistoryDB) {
          return res.status(503).json({ error: 'History service not available' });
        }

        const hash = req.params.hash.toLowerCase();
        const deleted = this.downloadHistoryDB.removeEntry(hash);

        if (deleted) {
          res.json({ success: true, message: 'Entry deleted' });
        } else {
          res.status(404).json({ error: 'Entry not found' });
        }
      } catch (err) {
        this.log('Error deleting history entry:', err.message);
        res.status(500).json({ error: 'Failed to delete history entry' });
      }
    });

    // Manually trigger cleanup (admin operation)
    app.post('/api/history/cleanup', (req, res) => {
      try {
        if (!this.downloadHistoryDB) {
          return res.status(503).json({ error: 'History service not available' });
        }

        const retentionDays = parseInt(req.body.retentionDays);
        if (isNaN(retentionDays) || retentionDays < 1) {
          return res.status(400).json({ error: 'Invalid retentionDays (must be >= 1)' });
        }

        const deleted = this.downloadHistoryDB.cleanup(retentionDays);
        res.json({ deleted, message: `Cleaned up ${deleted} entries older than ${retentionDays} days` });
      } catch (err) {
        this.log('Error during cleanup:', err.message);
        res.status(500).json({ error: 'Cleanup failed' });
      }
    });

    this.log('📜 History API routes registered');
  }
}

module.exports = new HistoryAPI();
