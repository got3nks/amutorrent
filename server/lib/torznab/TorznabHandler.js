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

// aMule's SearchList.cpp:104 rejects a parsed expression when
// AND + OR + NOT operators > 10. The parser inserts an implicit AND
// between adjacent space-separated words (Parser.y and_strings rule),
// so N words → N-1 implicit ANDs. 11 words is the largest count that
// still passes (10 ANDs). Cap conservatively at 11 so free-text queries
// from *arr apps (Medusa etc. often pass series + full episode title)
// don't trip "Search expression is too complex" and return 0 results.
// If additional filters (type/size/extension) are ever added upstream
// they auto-append operators; reserve headroom then.
const MAX_AMULE_QUERY_WORDS = 11;

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
   * Cap a query at `MAX_AMULE_QUERY_WORDS - reserved` words to stay within
   * aMule's boolean-operator budget (SearchList.cpp:104 rejects >10 ops; the
   * parser inserts one AND per adjacent-word pair). Truncates from the right
   * — series names typically come first in *arr queries, episode titles last.
   * Logs a warning whenever it fires so users can correlate "0 results" with
   * an over-long query.
   *
   * @param {string} query
   * @param {number} reserved - words we'll append after (e.g. 1 for " S01E05")
   * @returns {string}
   */
  _capQueryWords(query, reserved = 0) {
    if (!query) return query;
    const maxWords = MAX_AMULE_QUERY_WORDS - reserved;
    const words = query.split(/\s+/).filter(Boolean);
    if (words.length <= maxWords) return query;
    const capped = words.slice(0, maxWords).join(' ');
    logger.warn(`[Torznab] Query capped to ${maxWords} words to stay under aMule's 10-operator limit: "${query}" → "${capped}"`);
    return capped;
  }

  /**
   * Build TV search queries with format variations.
   *
   * Returns primary format variations (SxxExx, 1x01, and absolute-style "01"
   * for ED2K releases named e.g. "Show 01 - Title") plus a `fallbackQuery`
   * (bare series name) that handleSearch retries with when all primaries
   * return 0. The absolute-style variation catches a common French/documentary
   * naming convention where episodes are numbered without any prefix.
   */
  buildTVSearchQueries(query, season, ep) {
    const normalizedQuery = this.stripYear(query);
    // Reserve 1 word for the format token we append; without the reserve we'd
    // ship 12+ tokens for "long series name S01E05" and trip the operator cap.
    const cappedBase = this._capQueryWords(normalizedQuery, 1);
    const seasonNum = parseInt(season, 10);

    const primaryQueries = [];
    if (ep) {
      const episodeNum = parseInt(ep, 10);
      const paddedEp = episodeNum.toString().padStart(2, '0');
      const paddedSeason = seasonNum.toString().padStart(2, '0');
      primaryQueries.push(`${cappedBase} ${seasonNum}x${paddedEp}`);
      primaryQueries.push(`${cappedBase} S${paddedSeason}E${paddedEp}`);
      // Absolute-style: "Show 01" — common on ED2K for French / documentary /
      // some anime releases. Cheap to add; dedup by hash handles collisions.
      primaryQueries.push(`${cappedBase} ${paddedEp}`);
    } else {
      const paddedSeason = seasonNum.toString().padStart(2, '0');
      primaryQueries.push(`${cappedBase} ${seasonNum}x`);
      primaryQueries.push(`${cappedBase} S${paddedSeason}`);
    }

    logger.log(`[Torznab] TV search: ${primaryQueries.length} primary variations + fallback on the bare series name`);
    return { primaryQueries, fallbackQuery: cappedBase, normalizedQuery: cappedBase };
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
    let primaryQueries = [];
    let fallbackQuery = null;
    let normalizedQuery = q;

    if (t === 'tvsearch' && season) {
      const result = this.buildTVSearchQueries(q, season, ep);
      primaryQueries = result.primaryQueries;
      fallbackQuery = result.fallbackQuery;
      normalizedQuery = result.normalizedQuery;
    } else {
      // Non-tvsearch: still cap the free-text query so long *arr queries
      // (Medusa passes series + full episode title as `q`) don't trip
      // aMule's "too complex" rejection.
      const capped = this._capQueryWords(q, 0);
      primaryQueries.push(capped);
      normalizedQuery = capped;
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

      const runQuery = async (searchQuery, label) => {
        logger.log(`[Torznab] Searching aMule for: "${searchQuery}"${label ? ` (${label})` : ''}`);
        const result = await this.rateLimitedSearch(() =>
          amuleClient.searchAndWaitResults(searchQuery, 'global', '')
        );
        const resultCount = (result.results || []).length;
        logger.log(`[Torznab] Query "${searchQuery}" returned ${resultCount} results`);
        (result.results || []).forEach(file => {
          if (!seenHashes.has(file.fileHash)) {
            seenHashes.add(file.fileHash);
            allResults.push(file);
          }
        });
      };

      for (const searchQuery of primaryQueries) {
        await runQuery(searchQuery);
      }

      // Fallback: if season/episode variants returned nothing, retry with the
      // bare series name. Catches releases that don't include SxxExx or a
      // matching absolute-episode token in the file name at all.
      if (allResults.length === 0 && fallbackQuery && !primaryQueries.includes(fallbackQuery)) {
        logger.log(`[Torznab] All ${primaryQueries.length} primary variants returned 0; retrying with bare series name`);
        await runQuery(fallbackQuery, 'fallback');
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
