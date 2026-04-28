/**
 * TorznabHandler - Torznab indexer API implementation
 *
 * Provides Sonarr/Radarr compatible Torznab endpoints by translating
 * search requests to aMule ED2K network searches.
 *
 * Features:
 * - Rate limiting to avoid ED2K server flood protection
 * - Result caching for Sonarr pagination support
 * - TV search format variations (S01E01, 1x01)
 */

const logger = require('../logger');
const { generateCapabilities } = require('./capabilities');
const { convertToTorznabFeed } = require('./search');

class TorznabHandler {
  constructor() {
    // Dependencies
    this.getAmuleClient = null;

    // Rate limiting state
    this.searchDelayMs = parseInt(process.env.ED2K_SEARCH_DELAY_MS || '10000', 10);
    this.lastSearchTime = 0;

    // Cache state
    this.cacheTtlMs = parseInt(process.env.ED2K_CACHE_TTL_MS || '600000', 10);
    this.searchCache = new Map();

    // Bind handler method
    this.handleRequest = this.handleRequest.bind(this);
  }

  /**
   * Set dependencies
   */
  setDependencies({ getAmuleClient }) {
    this.getAmuleClient = getAmuleClient;
  }

  // ============================================================================
  // CACHE MANAGEMENT
  // ============================================================================

  getCacheKey(t, q, season, ep) {
    const parts = [t, q || ''];
    if (season) parts.push(season);
    if (ep) parts.push(ep);
    return parts.join(':');
  }

  getCachedResults(cacheKey) {
    const cached = this.searchCache.get(cacheKey);
    if (!cached) return null;

    const age = Date.now() - cached.timestamp;
    if (age > this.cacheTtlMs) {
      logger.log(`[Torznab] Cache expired for key: ${cacheKey} (age: ${Math.round(age / 1000)}s)`);
      this.searchCache.delete(cacheKey);
      return null;
    }

    logger.log(`[Torznab] Cache hit for key: ${cacheKey} (${cached.results.length} results, age: ${Math.round(age / 1000)}s)`);
    return cached.results;
  }

  setCachedResults(cacheKey, results) {
    this.searchCache.set(cacheKey, {
      results,
      timestamp: Date.now()
    });
    logger.log(`[Torznab] Cached ${results.length} results for key: ${cacheKey}`);
  }

  // ============================================================================
  // QUERY HELPERS
  // ============================================================================

  /**
   * Strip year (YYYY format) from search query
   */
  stripYear(query) {
    if (!query) return query;

    const stripped = query
      .replace(/[\[\(]?\b(19|20)\d{2}\b[\]\)]?/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (stripped !== query) {
      logger.log(`[Torznab] Stripped year from query: "${query}" -> "${stripped}"`);
    }

    return stripped;
  }

  /**
   * Build TV search queries with format variations
   */
  buildTVSearchQueries(query, season, ep) {
    const queries = [];
    const normalizedQuery = this.stripYear(query);
    const seasonNum = parseInt(season, 10);

    if (ep) {
      const episodeNum = parseInt(ep, 10);
      const formats = [
        `${seasonNum}x${episodeNum.toString().padStart(2, '0')}`,
        `S${seasonNum.toString().padStart(2, '0')}E${episodeNum.toString().padStart(2, '0')}`
      ];
      formats.forEach(format => queries.push(`${normalizedQuery} ${format}`));
    } else {
      const formats = [
        `${seasonNum}x`,
        `S${seasonNum.toString().padStart(2, '0')}`
      ];
      formats.forEach(format => queries.push(`${normalizedQuery} ${format}`));
    }

    logger.log(`[Torznab] TV search: Will search for ${queries.length} format variations`);
    return { queries, normalizedQuery };
  }

  // ============================================================================
  // RATE LIMITING
  // ============================================================================

  async rateLimitedSearch(searchFn) {
    const now = Date.now();
    const timeSinceLastSearch = now - this.lastSearchTime;

    if (timeSinceLastSearch < this.searchDelayMs) {
      const waitTime = this.searchDelayMs - timeSinceLastSearch;
      logger.log(`[Torznab] Rate limiting: waiting ${waitTime}ms before next search`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    try {
      return await searchFn();
    } finally {
      this.lastSearchTime = Date.now();
    }
  }

  // ============================================================================
  // REQUEST HANDLER
  // ============================================================================

  /**
   * Main Torznab request handler
   */
  async handleRequest(req, res) {
    const { t, q, limit = 100, offset = 0, cat = '' } = req.query;

    try {
      // Capabilities endpoint
      if (t === 'caps') {
        const xml = generateCapabilities();
        res.set('Content-Type', 'application/xml');
        return res.send(xml);
      }

      // Search endpoints
      if (t === 'search' || t === 'tvsearch' || t === 'movie') {
        return await this.handleSearch(req, res);
      }

      // Unknown function type
      res.status(400).send('Invalid t parameter (expected: caps, search, tvsearch, or movie)');
    } catch (error) {
      logger.error('[Torznab] Error:', error);
      const emptyFeed = convertToTorznabFeed([], q || '', cat || '');
      res.set('Content-Type', 'application/xml');
      res.status(500).send(emptyFeed);
    }
  }

  /**
   * Handle search requests (search, tvsearch, movie)
   */
  async handleSearch(req, res) {
    const { t, q, limit = 100, offset = 0, cat = '' } = req.query;
    const { season, ep, tvdbid, rid, imdbid } = req.query;

    logger.log(`[Torznab] Search request: t=${t}, q=${q || '(empty)'}, season=${season || 'none'}, ep=${ep || 'none'}, offset=${offset}, limit=${limit}, cat=${cat || 'none'}`);

    // Check if this is a real search or just validation
    const hasSearchParams = q || season || ep || tvdbid || rid || imdbid;

    // No search params - return sample result for indexer validation
    if (!hasSearchParams) {
      logger.log('[Torznab] No search parameters, returning sample result for validation');
      const sampleResult = [{
        fileName: 'Sample.Test.File.mkv',
        fileHash: 'A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4',
        fileSize: 1073741824,
        sourceCount: 10,
        category: '5040'
      }];
      const testFeed = convertToTorznabFeed(sampleResult, 'test', cat);
      res.set('Content-Type', 'application/xml');
      return res.send(testFeed);
    }

    // Has params but no text query - can't search ED2K
    if (!q) {
      logger.warn('[Torznab] Search has metadata params but no text query - cannot search ED2K without query text');
      const emptyFeed = convertToTorznabFeed([], 'no-query', cat);
      res.set('Content-Type', 'application/xml');
      return res.send(emptyFeed);
    }

    const amuleClient = this.getAmuleClient?.();
    if (!amuleClient) {
      logger.log('[Torznab] aMule not connected, returning empty feed');
      const emptyFeed = convertToTorznabFeed([], q, cat);
      res.set('Content-Type', 'application/xml');
      return res.send(emptyFeed);
    }

    // Build search queries
    let searchQueries = [];
    let normalizedQuery = q;

    if (t === 'tvsearch' && season) {
      const result = this.buildTVSearchQueries(q, season, ep);
      searchQueries = result.queries;
      normalizedQuery = result.normalizedQuery;
    } else {
      searchQueries.push(q);
    }

    // Create cache key
    const cacheKey = this.getCacheKey(t, normalizedQuery, season, ep);

    // Check cache
    let allResults = this.getCachedResults(cacheKey);

    // Cache miss - perform search
    if (!allResults) {
      logger.log(`[Torznab] Cache miss, performing ED2K search for key: ${cacheKey}`);

      allResults = [];
      const seenHashes = new Set();

      for (const searchQuery of searchQueries) {
        logger.log(`[Torznab] Searching aMule for: "${searchQuery}"`);

        const result = await this.rateLimitedSearch(() =>
          amuleClient.searchAndWaitResults(searchQuery, 'global', '')
        );

        const resultCount = (result.results || []).length;
        logger.log(`[Torznab] Query "${searchQuery}" returned ${resultCount} results`);

        // Deduplicate by hash
        (result.results || []).forEach(file => {
          if (!seenHashes.has(file.fileHash)) {
            seenHashes.add(file.fileHash);
            allResults.push(file);
          }
        });
      }

      logger.log(`[Torznab] Total unique results after merging: ${allResults.length}`);
      this.setCachedResults(cacheKey, allResults);
    }

    // Apply pagination
    const offsetNum = parseInt(offset, 10) || 0;
    const limitNum = parseInt(limit, 10) || 100;
    const paginatedResults = allResults.slice(offsetNum, offsetNum + limitNum);

    logger.log(`[Torznab] Returning ${paginatedResults.length} results (offset: ${offsetNum}, limit: ${limitNum}, total: ${allResults.length})`);

    const xml = convertToTorznabFeed(paginatedResults, q, cat);
    res.set('Content-Type', 'application/xml');
    return res.send(xml);
  }
}

module.exports = TorznabHandler;
