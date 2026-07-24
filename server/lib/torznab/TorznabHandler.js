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
    // Lowercase + whitespace-normalize the query — aMule's search is
    // case-insensitive and substring-based (Entry.cpp:231-248: everything
    // gets Find()'d against GetCommonFileNameLowerCase). Case variants
    // of the same title all match the same file set on aMule's side, so
    // they should collapse to the same cache entry on ours instead of
    // triggering separate 30s round-trips. Season/ep are numeric strings
    // from URL params, no normalization needed; `t` is one of a fixed set.
    const normQ = (q || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const parts = [t, normQ];
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
   * Build an anchored boolean query: `<series> AND (alt₁ OR alt₂ OR …)`.
   *
   * Kad requires this shape. Kad hashes ONE keyword and contacts only the
   * node responsible for it; the rest of the expression is evaluated on that
   * node against files indexed under that keyword. A top-level OR of
   * independent keywords silently under-returns (only one keyword's node is
   * contacted). Anchoring on the rare series name pulls records from Kad,
   * then the OR-group filters those results — Kad-safe.
   *
   * Also collapses the fan-out we used to run as multiple sequential queries
   * into one call per network. aMule's parser handles the OR inline.
   *
   * Smart-quoting: quote the series ONLY when the operator budget would
   * overflow (base + K − 1 > 10 → B > 11 − K). Quoted content still
   * substring-AND-matches server-side (Entry.cpp:231-248) — same match set,
   * just 1 token instead of B. Punctuation is free per aMule's client
   * scanner (Scanner.l:45, keywordchar = `[^ "()]`), so we count whitespace
   * tokens only.
   *
   * @param {string} seriesName - bare title (already year-stripped for tvsearch)
   * @param {Array<string>} alternatives - format tokens to OR-group
   * @returns {string} single query string ready to send to aMule
   */
  _buildAnchoredQuery(seriesName, alternatives) {
    const trimmed = String(seriesName || '').trim();
    const K = alternatives.length;
    const tokenCount = trimmed ? trimmed.split(/\s+/).length : 0;
    // Operator budget: (B − 1 implicit ANDs) + 1 explicit AND + (K − 1 ORs) ≤ 10
    // → B + K ≤ 11. Reserve for K alternatives: B ≤ 11 − K.
    const maxBaseTokens = MAX_AMULE_QUERY_WORDS - K;

    let base;
    if (tokenCount > maxBaseTokens) {
      // Would overflow — collapse the multi-word base into a single token
      // via quoting. Strip any embedded quotes to keep the syntax valid.
      const safeInner = trimmed.replace(/"/g, '');
      base = `"${safeInner}"`;
      logger.warn(`[Torznab] Anchor quoted to reclaim operator budget (${tokenCount} > ${maxBaseTokens} tokens): "${trimmed}"`);
    } else {
      base = trimmed;
    }

    if (K === 0) return base;
    if (K === 1) return `${base} AND ${alternatives[0]}`;
    return `${base} AND (${alternatives.join(' OR ')})`;
  }

  /**
   * Build a single TV search query using the anchored OR-group shape.
   *
   * Returns one `primaryQuery` (title + all format variants in one OR group)
   * and one `fallbackQuery` (bare title) that handleSearch retries with when
   * the primary returns 0 across both networks. Replaces the older approach
   * of running the format variants as separate sequential queries — a single
   * call per network now covers all formats, and the shape is Kad-safe.
   *
   * Format variants (all inside one OR):
   *   with ep: S01E05, 1x05, 05 (absolute-style for "Show 01" naming)
   *   without ep: S01, 1x
   */
  buildTVSearchQueries(query, season, ep) {
    const normalizedQuery = this.stripYear(query);
    const seasonNum = parseInt(season, 10);

    const alternatives = [];
    if (ep) {
      const episodeNum = parseInt(ep, 10);
      const paddedEp = episodeNum.toString().padStart(2, '0');
      const paddedSeason = seasonNum.toString().padStart(2, '0');
      alternatives.push(`S${paddedSeason}E${paddedEp}`);
      alternatives.push(`${seasonNum}x${paddedEp}`);
      alternatives.push(paddedEp);   // absolute-style: "Show 05"
    } else {
      const paddedSeason = seasonNum.toString().padStart(2, '0');
      alternatives.push(`S${paddedSeason}`);
      alternatives.push(`${seasonNum}x`);
    }

    const primaryQuery = this._buildAnchoredQuery(normalizedQuery, alternatives);
    const fallbackQuery = this._buildAnchoredQuery(normalizedQuery, []);

    return { primaryQuery, fallbackQuery, normalizedQuery };
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

    // Build search queries. New shape: one anchored OR-group per network
    // (was N separate queries for tvsearch). See buildTVSearchQueries /
    // _buildAnchoredQuery for the operator-budget reasoning.
    let primaryQuery;
    let fallbackQuery = null;
    let normalizedQuery = q;

    if (t === 'tvsearch' && season) {
      const result = this.buildTVSearchQueries(q, season, ep);
      primaryQuery = result.primaryQuery;
      fallbackQuery = result.fallbackQuery;
      normalizedQuery = result.normalizedQuery;
    } else {
      // Non-tvsearch: cap the free-text query so long *arr queries
      // (Medusa passes series + full episode title as `q`) don't trip
      // aMule's "too complex" rejection.
      primaryQuery = this._capQueryWords(q, 0);
      normalizedQuery = primaryQuery;
    }

    // Create cache key
    const cacheKey = this.getCacheKey(t, normalizedQuery, season, ep);

    // Check cache
    let allResults = this.getCachedResults(cacheKey);

    // Cache miss - perform search across BOTH aMule networks (ED2K + Kad).
    // ED2K = server-indexed; Kad = DHT-indexed. They cover disjoint file sets
    // in practice, so querying both broadens hits meaningfully. Sequential
    // through the existing rate limiter — the 10s spacing exists to avoid
    // ED2K server flood protection; Kad doesn't need it but sequential keeps
    // total time bounded and code simple.
    if (!allResults) {
      logger.log(`[Torznab] Cache miss, searching aMule (ED2K + Kad) for key: ${cacheKey}`);

      allResults = [];
      const seenHashes = new Set();

      const runQueryOnNetwork = async (searchQuery, network, label) => {
        logger.log(`[Torznab] Searching aMule ${network} for: "${searchQuery}"${label ? ` (${label})` : ''}`);
        const result = await this.rateLimitedSearch(() =>
          amuleClient.searchAndWaitResults(searchQuery, network, '')
        );
        const resultCount = (result.results || []).length;
        logger.log(`[Torznab] ${network} query returned ${resultCount} results`);
        (result.results || []).forEach(file => {
          if (!seenHashes.has(file.fileHash)) {
            seenHashes.add(file.fileHash);
            allResults.push(file);
          }
        });
      };

      const NETWORKS = ['global', 'kad'];

      // Primary pass across both networks
      for (const network of NETWORKS) {
        await runQueryOnNetwork(primaryQuery, network);
      }

      // Fallback disabled — primary filters are permissive enough. Kept in
      // return shape for easy re-enable if a class of releases surfaces that
      // needs it.
      //
      // if (allResults.length === 0 && fallbackQuery && fallbackQuery !== primaryQuery) {
      //   for (const network of NETWORKS) await runQueryOnNetwork(fallbackQuery, network, 'fallback');
      // }
      void fallbackQuery;

      logger.log(`[Torznab] Total unique results after merging (ED2K + Kad): ${allResults.length}`);
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
