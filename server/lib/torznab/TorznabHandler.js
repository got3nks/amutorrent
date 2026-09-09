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

// Torznab is a synchronous HTTP search. *arr clients often time out at ~30s,
// while aMule has one search slot and each network can take far longer.
// `both` (Global then Kad, always) is what missed those clients: the first
// network could already have the file, and the second still ran (#89).
// Default is fallback-on-empty with Global first — the only order we have
// timings for. Kad-first is available for operators who want to spare ED2K
// servers; it is not the default without a Kad-vs-Global benchmark.
const DEFAULT_NETWORK_STRATEGY = 'global-first';
const NETWORK_STRATEGIES = {
  'global-first': { first: 'global', second: 'kad', alwaysSecond: false },
  'kad-first': { first: 'kad', second: 'global', alwaysSecond: false },
  'global-only': { first: 'global', second: null, alwaysSecond: false },
  'kad-only': { first: 'kad', second: null, alwaysSecond: false },
  'both': { first: 'global', second: 'kad', alwaysSecond: true }
};

class TorznabHandler {
  constructor() {
    // Dependencies
    this.getAmuleClient = null;
    this.getAmuleManager = null;

    // Rate limiting state
    this.searchDelayMs = parseInt(process.env.ED2K_SEARCH_DELAY_MS || '10000', 10);
    // Poll-loop timings, matching what searchAndWaitResults() used so search
    // behaviour is unchanged; only the connection-holding differs.
    this.searchSettleMs = parseInt(process.env.ED2K_SEARCH_SETTLE_MS || '5000', 10);
    this.searchPollMs = parseInt(process.env.ED2K_SEARCH_POLL_MS || '1000', 10);
    this.searchTimeoutMs = parseInt(process.env.ED2K_SEARCH_TIMEOUT_MS || '120000', 10);
    // How long a request waits for the ed2k search slot before giving up.
    // Distinct queries still serialize on aMule's single search slot.
    this.searchLockWaitMs = parseInt(process.env.ED2K_SEARCH_LOCK_WAIT_MS || '180000', 10);
    this.searchNetworkStrategy = process.env.ED2K_SEARCH_NETWORK_STRATEGY || DEFAULT_NETWORK_STRATEGY;
    this.lastSearchTime = 0;

    // Cache state
    this.cacheTtlMs = parseInt(process.env.ED2K_CACHE_TTL_MS || '600000', 10);
    this.searchCache = new Map();
    this.inFlightSearches = new Map();   // cacheKey -> Promise<results>, see _searchOrJoinInFlight

    // Expired entries used to be dropped only when the same key was asked for
    // again, so a backlog of distinct queries held every result set it ever
    // produced. Sweep on a timer instead, unref'd so it never keeps the
    // process alive on its own.
    this.cacheSweepTimer = setInterval(() => this.sweepCache(), this.cacheTtlMs);
    this.cacheSweepTimer.unref?.();

    // Bind handler method
    this.handleRequest = this.handleRequest.bind(this);
  }

  /**
   * Set dependencies
   */
  setDependencies({ getAmuleClient, getAmuleManager }) {
    this.getAmuleClient = getAmuleClient;
    this.getAmuleManager = getAmuleManager;
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

  /**
   * Drop every cache entry past its TTL.
   *
   * @returns {number} how many were removed
   */
  sweepCache() {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this.searchCache) {
      if (now - entry.timestamp > this.cacheTtlMs) {
        this.searchCache.delete(key);
        removed++;
      }
    }
    if (removed > 0) {
      logger.log(`[Torznab] Cache sweep dropped ${removed} expired ${removed === 1 ? 'entry' : 'entries'} (${this.searchCache.size} left)`);
    }
    return removed;
  }

  /** Stop the sweep timer. For tests and shutdown. */
  stopCacheSweep() {
    if (this.cacheSweepTimer) {
      clearInterval(this.cacheSweepTimer);
      this.cacheSweepTimer = null;
    }
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
  /**
   * Remove the characters aMule's search grammar treats as structure.
   *
   * Parentheses and double quotes are not keyword characters (Scanner.l:45,
   * keywordchar = `[^ "()]`), so aMule can never have indexed them and they
   * cannot match anything. Left in an anchor they are read as grammar: a
   * series named "Example Show (US)" builds `Example Show (US) AND (...)`,
   * and the grammar has no production for a parenthesised group sitting next
   * to a string, so the daemon rejects the whole search with "syntax error"
   * and the show is unsearchable. Verified against a live core.
   *
   * Stripping rather than quoting: a quoted anchor is matched as a substring,
   * so `"Example Show (US)"` would demand a literal "(us)" in the filename,
   * which releases never have. Dropping the parentheses leaves the words
   * AND-ed, which is what the release name actually contains.
   *
   * @param {string} query
   * @returns {string}
   */
  stripSearchSyntax(query) {
    if (!query) return query;

    const stripped = query.replace(/[()"]/g, ' ').replace(/\s+/g, ' ').trim();
    if (stripped !== query) {
      logger.log(`[Torznab] Removed search-grammar characters: "${query}" -> "${stripped}"`);
    }
    return stripped;
  }

  stripYear(query) {
    if (!query) return query;

    const stripped = query
      .replace(/[\[\(]?\b(19|20)\d{2}\b[\]\)]?/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // A title that is nothing but a year ("2012") would leave no anchor, and
    // "AND (...)" with no left operand is a syntax error. Keep the year in
    // that case: a broad anchor beats a rejected search.
    if (!stripped) return query;

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
   *   with ep: S01E05, 1x05, 01x05, 1x5, and 05 for multi-word titles only
   *   without ep: S01, 1x
   *
   * The bare episode number ("Show 05", catching "Show 01 - Title" naming) is
   * withheld from single-word titles. Anchored on a single common word it
   * matches almost anything containing that word and a two-digit number, and
   * the noise buries the real results - a one-word title that is also an
   * ordinary English word is the worst case (#91). A multi-word title is
   * selective enough for the anchor to carry it.
   */
  buildTVSearchQueries(query, season, ep) {
    const normalizedQuery = this.stripYear(query);
    const seasonNum = parseInt(season, 10);
    const titleWords = normalizedQuery.trim() ? normalizedQuery.trim().split(/\s+/).length : 0;

    const alternatives = [];
    if (ep) {
      const episodeNum = parseInt(ep, 10);
      const paddedEp = episodeNum.toString().padStart(2, '0');
      const paddedSeason = seasonNum.toString().padStart(2, '0');
      alternatives.push(`S${paddedSeason}E${paddedEp}`);
      alternatives.push(`${seasonNum}x${paddedEp}`);
      // Padded-season form: "01x05" as well as "1x05". Uncommon but cheap, and
      // it is a real naming style (#91).
      if (paddedSeason !== String(seasonNum)) {
        alternatives.push(`${paddedSeason}x${paddedEp}`);
      }
      // Unpadded episode: "1x5" as well as "1x05". aMule matches search terms
      // as substrings (Entry.cpp), so "1x05" cannot reach a file named "1x5",
      // and the bare "05" below does not either. Only differs under episode 10.
      if (paddedEp !== String(episodeNum)) {
        alternatives.push(`${seasonNum}x${episodeNum}`);
      }
      if (titleWords >= 2) {
        alternatives.push(paddedEp);   // absolute-style: "Show 05"
      } else {
        logger.log(`[Torznab] Skipping absolute-style episode for the single-word title "${normalizedQuery}" - too broad`);
      }
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

  isClientGone(req) {
    return Boolean(req && (req.aborted || req.destroyed || req.socket?.destroyed));
  }

  async _waitUnlessGone(req, ms) {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      if (this.isClientGone(req)) return;
      await new Promise(resolve => setTimeout(resolve, Math.min(50, until - Date.now())));
    }
  }

  resolveNetworkStrategy() {
    const raw = String(this.searchNetworkStrategy || DEFAULT_NETWORK_STRATEGY)
      .toLowerCase()
      .trim();
    const spec = NETWORK_STRATEGIES[raw];
    if (spec) {
      return { name: raw, ...spec };
    }
    logger.warn(
      `[Torznab] Unknown ED2K_SEARCH_NETWORK_STRATEGY "${this.searchNetworkStrategy}", using ${DEFAULT_NETWORK_STRATEGY}`
    );
    return { name: DEFAULT_NETWORK_STRATEGY, ...NETWORK_STRATEGIES[DEFAULT_NETWORK_STRATEGY] };
  }

  /**
   * Run one aMule search without monopolising the EC connection.
   *
   * searchAndWaitResults() is a single call that sleeps 5s and then polls every
   * second for up to two minutes. aMuTorrent serialises every EC operation onto
   * one connection, so that call held the connection for its whole duration -
   * mostly doing nothing - and starved the periodic data sync and the
   * download-add path behind it. Adds exceeded Medusa's fixed 60s timeout and
   * the sync's own warnings climbed past nine minutes (#88, #89).
   *
   * Driving the loop here means each EC round-trip is queued individually and
   * the connection is free between polls. The cost is that the accidental
   * serialisation the blocking call provided is gone, so this takes the search
   * lock explicitly: aMule keeps one ed2k search slot, and a second
   * EC_OP_SEARCH_START would discard the first search's results.
   *
   * @param {Object} amuleClient
   * @param {string} query
   * @param {string} network - 'global' or 'kad'
   * @param {Object} [req] - HTTP request; used only to stop waiting if the client left
   * @returns {Promise<Object>} Same shape as searchAndWaitResults()
   * @private
   */
  async _searchWithoutBlockingEC(amuleClient, query, network, req) {
    const manager = this.getAmuleManager?.();

    // Unreachable in normal operation: the client is derived from this same
    // manager, and handleSearch has already returned an empty feed if there is
    // no client. Fail loudly rather than quietly reverting to the blocking
    // search, which would restore the starvation this exists to prevent.
    if (!manager?.withSearchLock) {
      throw new Error('Torznab search needs the aMule manager for the search lock, but none was injected');
    }

    return manager.withSearchLock(async () => {
      if (this.isClientGone(req)) {
        logger.log(`[Torznab] HTTP client gone before ${network} search start; skipping`);
        return { resultsLength: 0, totalLength: 0, results: [] };
      }

      const started = await amuleClient.startSearch(query, network, '');
      if (started && started.started === false) {
        // The query goes in the log too. A refusal is almost always about the
        // query text - aMule's parser rejects characters it treats as grammar,
        // and its reply names the fault without saying what it was parsing.
        // The reason can be multi-line; keep it on one line.
        const reason = (started.message || 'no reason given').split('\n').map(l => l.trim()).filter(Boolean).join(' | ');
        logger.warn(`[Torznab] aMule refused the ${network} search: ${reason} - query was: "${query}"`);
        return { resultsLength: 0, totalLength: 0, results: [] };
      }

      // aMule needs a moment before its progress figure means anything.
      await this._waitUnlessGone(req, this.searchSettleMs);
      if (this.isClientGone(req)) {
        logger.log(`[Torznab] HTTP client gone during ${network} settle; collecting partial results`);
        return amuleClient.getSearchResults({ groupByHash: true });
      }

      const deadline = Date.now() + this.searchTimeoutMs;
      while (Date.now() < deadline) {
        // EC cannot cancel a search already running in aMule. Stop waiting
        // for it so the lock is released, then collect whatever is there.
        if (this.isClientGone(req)) {
          logger.log(`[Torznab] HTTP client gone during ${network} search; collecting partial results`);
          break;
        }
        const status = await amuleClient.getSearchProgress();
        if (status?.complete) break;
        await this._waitUnlessGone(req, this.searchPollMs);
      }

      // Read results even on timeout: a slow search still has partial results,
      // and returning them beats returning nothing.
      return amuleClient.getSearchResults({ groupByHash: true });
    }, { timeoutMs: this.searchLockWaitMs });
  }

  async rateLimitedSearch(searchFn, { network, req } = {}) {
    // ED2K servers flood-protect; Kad is DHT and does not need the gap.
    // Skipping it on Kad is what lets a Global miss still return inside a
    // 30s *arr timeout (#89).
    if (network !== 'kad') {
      const now = Date.now();
      const timeSinceLastSearch = now - this.lastSearchTime;

      if (timeSinceLastSearch < this.searchDelayMs) {
        const waitTime = this.searchDelayMs - timeSinceLastSearch;
        logger.log(`[Torznab] Rate limiting: waiting ${waitTime}ms before next search`);
        const until = Date.now() + waitTime;
        while (Date.now() < until) {
          if (this.isClientGone(req)) {
            logger.log('[Torznab] HTTP client gone during rate-limit wait; not starting search');
            return { resultsLength: 0, totalLength: 0, results: [] };
          }
          await this._waitUnlessGone(req, Math.min(50, until - Date.now()));
        }
      }
    }

    try {
      return await searchFn();
    } finally {
      this.lastSearchTime = Date.now();
    }
  }

  /**
   * Run one search for `cacheKey`, or attach to the one already running.
   *
   * The completed-search cache only helps a repeat that arrives after the
   * first one finished. A search takes up to two minutes per network, and an
   * *arr backlog re-asks for the same episode well inside that window: every
   * duplicate missed the cache, queued on the search lock, and ran the whole
   * search again once it got there. Five requests for one query meant ten
   * aMule searches, and the ones at the back of the queue timed out waiting
   * for a lock they did not need (#89).
   *
   * Keyed on the same cacheKey as the result cache: `offset`, `limit` and
   * `cat` are applied to the returned array afterwards, so subscribers can
   * share one search the same way repeat requests already share one cache
   * entry.
   *
   * @param {Object} amuleClient
   * @param {Object} params - { cacheKey, primaryQuery, fallbackQuery, req }
   * @returns {Promise<Array>} merged results
   * @private
   */
  _searchOrJoinInFlight(amuleClient, params) {
    const running = this.inFlightSearches.get(params.cacheKey);
    if (running) {
      logger.log(`[Torznab] Joining the search already running for key: ${params.cacheKey}`);
      return running;
    }

    // Cleared however it ends, so a failed search does not poison the key.
    const search = this._runSearch(amuleClient, params)
      .finally(() => this.inFlightSearches.delete(params.cacheKey));

    this.inFlightSearches.set(params.cacheKey, search);
    return search;
  }

  /**
   * Search aMule according to ED2K_SEARCH_NETWORK_STRATEGY.
   *
   * Default `global-first`: run Global, return immediately if it found
   * anything, otherwise Kad. That matches the 3.9.3 timing where Global
   * already had a result in ~7s while waiting for Kad still missed a 30s
   * Torznab client (#89). `kad-first` is the inverse fallback and is not
   * the default: without a Kad-vs-Global benchmark it can invert the
   * timeout (Kad 30–60s while Global would have answered in seconds).
   * `both` is the old sequential merge; keep it for operators who want
   * the union and can wait. Torznab does not carry a reliable
   * manual/backlog/daily flag, so this is operator config, not caller
   * detection.
   *
   * @private
   */
  async _runSearch(amuleClient, { cacheKey, primaryQuery, fallbackQuery, req }) {
    const strategy = this.resolveNetworkStrategy();
    logger.log(`[Torznab] Cache miss, searching aMule (${strategy.name}) for key: ${cacheKey}`);

    const allResults = [];
    const seenHashes = new Map();   // hash → the result we kept, for name merging

    const runQueryOnNetwork = async (searchQuery, network, label) => {
      if (this.isClientGone(req)) {
        logger.log(`[Torznab] HTTP client gone; not starting ${network} search`);
        return;
      }
      logger.log(`[Torznab] Searching aMule ${network} for: "${searchQuery}"${label ? ` (${label})` : ''}`);
      // groupByHash: one hash can be published under several filenames and
      // the extra ones are often the better-parsed release names (#82).
      const result = await this.rateLimitedSearch(
        () => this._searchWithoutBlockingEC(amuleClient, searchQuery, network, req),
        { network, req }
      );
      const resultCount = (result.results || []).length;
      logger.log(`[Torznab] ${network} query returned ${resultCount} results (${result.totalLength ?? resultCount} incl. alternate names)`);
      (result.results || []).forEach(file => {
        const seen = seenHashes.get(file.fileHash);
        if (!seen) {
          seenHashes.set(file.fileHash, file);
          allResults.push(file);
          return;
        }
        // Same hash from the other network: keep the union of the names
        // rather than dropping the duplicate outright, since ED2K and Kad
        // can each know names the other does not.
        const known = new Set([seen.fileName, ...(seen.children || []).map(c => c.fileName)]);
        for (const alt of [file, ...(file.children || [])]) {
          if (alt.fileName && !known.has(alt.fileName)) {
            known.add(alt.fileName);
            (seen.children || (seen.children = [])).push(alt);
          }
        }
      });
    };

    await runQueryOnNetwork(primaryQuery, strategy.first);

    if (strategy.second) {
      const needSecond = strategy.alwaysSecond || allResults.length === 0;
      if (!needSecond) {
        logger.log(`[Torznab] ${strategy.first} returned ${allResults.length} result(s); skipping ${strategy.second}`);
      } else if (this.isClientGone(req)) {
        logger.log(`[Torznab] HTTP client gone; not starting ${strategy.second}`);
      } else {
        await runQueryOnNetwork(primaryQuery, strategy.second);
      }
    }

    // Bare-title fallback disabled — primary filters are permissive enough.
    // Kept in the return shape for easy re-enable if a class of releases
    // surfaces that needs it.
    void fallbackQuery;

    logger.log(`[Torznab] Total unique results after merging: ${allResults.length}`);
    this.setCachedResults(cacheKey, allResults);

    return allResults;
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
      if (t === 'search' || t === 'tvsearch' || t === 'movie' || t === 'music') {
        return await this.handleSearch(req, res);
      }

      // Unknown function type
      res.status(400).send('Invalid t parameter (expected: caps, search, tvsearch, movie, or music)');
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
    const { season, ep, tvdbid, rid, imdbid, artist, album } = req.query;

    logger.log(`[Torznab] Search request: t=${t}, q=${q || '(empty)'}, season=${season || 'none'}, ep=${ep || 'none'}, offset=${offset}, limit=${limit}, cat=${cat || 'none'}`);

    // Check if this is a real search or just validation
    const hasSearchParams = q || season || ep || tvdbid || rid || imdbid || artist || album;

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

    // Lidarr searches by artist and album rather than free text, so build the
    // query from them. Combined, because either alone is too broad on ED2K:
    // an artist name returns their whole discography plus unrelated files.
    let effectiveQuery = q;
    if (!effectiveQuery && (artist || album)) {
      effectiveQuery = [artist, album].filter(Boolean).join(' ').trim();
      logger.log(`[Torznab] Built music query from artist/album: "${effectiveQuery}"`);
    }
    effectiveQuery = this.stripSearchSyntax(effectiveQuery);

    // Has params but no text query - can't search ED2K
    if (!effectiveQuery) {
      logger.warn('[Torznab] Search has metadata params but no text query - cannot search ED2K without query text');
      const emptyFeed = convertToTorznabFeed([], 'no-query', cat);
      res.set('Content-Type', 'application/xml');
      return res.send(emptyFeed);
    }

    const amuleClient = this.getAmuleClient?.();
    if (!amuleClient) {
      logger.log('[Torznab] aMule not connected, returning empty feed');
      const emptyFeed = convertToTorznabFeed([], effectiveQuery, cat);
      res.set('Content-Type', 'application/xml');
      return res.send(emptyFeed);
    }

    // Build search queries. New shape: one anchored OR-group per network
    // (was N separate queries for tvsearch). See buildTVSearchQueries /
    // _buildAnchoredQuery for the operator-budget reasoning.
    let primaryQuery;
    let fallbackQuery = null;
    let normalizedQuery = effectiveQuery;

    if (t === 'tvsearch' && season) {
      const result = this.buildTVSearchQueries(effectiveQuery, season, ep);
      primaryQuery = result.primaryQuery;
      fallbackQuery = result.fallbackQuery;
      normalizedQuery = result.normalizedQuery;
    } else {
      // Non-tvsearch: cap the free-text query so long *arr queries
      // (Medusa passes series + full episode title as `q`) don't trip
      // aMule's "too complex" rejection.
      primaryQuery = this._capQueryWords(effectiveQuery, 0);
      normalizedQuery = primaryQuery;
    }

    // Create cache key
    const cacheKey = this.getCacheKey(t, normalizedQuery, season, ep);

    // Check cache
    let allResults = this.getCachedResults(cacheKey);
    if (!allResults) {
      allResults = await this._searchOrJoinInFlight(amuleClient, {
        cacheKey,
        primaryQuery,
        fallbackQuery,
        req
      });
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
