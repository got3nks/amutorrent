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
const { canonicaliseQuery: canonicalise, adaptQueryForKad } = require('../searchQuery');

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
    this.getAmuleManager = null;

    // Rate limiting state
    // 5s is the floor of the range INTEGRATIONS.md recommends, and what
    // CONFIGURATION.md and .env.example already documented as the default while
    // the code used 10s. Kad does not pay this gap (see rateLimitedSearch), so
    // it now bounds ED2K searches only.
    this.searchDelayMs = parseInt(process.env.ED2K_SEARCH_DELAY_MS || '5000', 10);
    // Poll-loop timings, matching what searchAndWaitResults() used so search
    // behaviour is unchanged; only the connection-holding differs.
    this.searchSettleMs = parseInt(process.env.ED2K_SEARCH_SETTLE_MS || '5000', 10);
    this.searchPollMs = parseInt(process.env.ED2K_SEARCH_POLL_MS || '1000', 10);
    this.searchTimeoutMs = parseInt(process.env.ED2K_SEARCH_TIMEOUT_MS || '120000', 10);
    // How long a request waits for the ed2k search slot before giving up. Two
    // searches run per request (global + kad), so a queue of *arr searches can
    // legitimately wait a while before its turn.
    this.searchLockWaitMs = parseInt(process.env.ED2K_SEARCH_LOCK_WAIT_MS || '180000', 10);
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
  /**
   * Canonicalise the query text so it can match what publishers indexed.
   *
   * Automated queries only - see searchQuery.js for why the apostrophe rewrite
   * does not run on searches the user typed.
   *
   * @param {string} query
   * @returns {string}
   */
  canonicaliseQuery(query) {
    const out = canonicalise(query);
    if (out !== query) {
      logger.log(`[Torznab] Canonicalised query: "${query}" -> "${out}"`);
    }
    return out;
  }

  /**
   * Rewrite a query for Kad, which resolves it differently from an ED2K server.
   *
   * Kad hashes ONE keyword to choose the node that answers - words.front(), the
   * first token of at least 3 bytes - and evaluates the rest as substring
   * filters on that node. The two halves want opposite treatment:
   *
   *   - The key must be a word a publisher actually indexed, so the first word
   *     is never stemmed. If it carries a diacritic the key only reaches
   *     publishers who used our exact encoding, so a plain word is promoted
   *     ahead of it when a good one exists. The words are AND-ed, so reordering
   *     cannot change what matches, only which node is asked.
   *   - Later words are filters, where a stem widens the match to every
   *     encoding.
   *
   * Selectivity matters for the promoted word: Kad returns a bounded set per
   * keyword, so promoting a common short word would ask a huge node and could
   * crowd the wanted file out. Longest wins, stop-words never do.
   *
   * ED2K needs none of this. Its server intersects tokens, so order is
   * meaningless, and prefixes match nothing there.
   *
   * @param {string} query - already canonicalised
   * @returns {string}
   */
  adaptQueryForKad(query) {
    return adaptQueryForKad(query, { log: m => logger.log(`[Torznab] ${m}`) });
  }

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
   * overflow (base + K − 1 > 10 → B > 11 − K). The quotes never leave the
   * client. `"` is grammar rather than a keyword character (Scanner.l:45,
   * keywordchar = `[^ "()]`), so a quoted base and a bare one put identical
   * bytes on the wire - measured against eserver 17.15. Quoting buys operator
   * budget and nothing else; it cannot change the match set, and the server
   * splits the string into the same words either way. Punctuation is free for
   * the same reason, so we count whitespace tokens only.
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
   * @returns {Promise<Object>} Same shape as searchAndWaitResults()
   * @private
   */
  async _searchWithoutBlockingEC(amuleClient, query, network) {
    const manager = this.getAmuleManager?.();

    // Unreachable in normal operation: the client is derived from this same
    // manager, and handleSearch has already returned an empty feed if there is
    // no client. Fail loudly rather than quietly reverting to the blocking
    // search, which would restore the starvation this exists to prevent.
    if (!manager?.withSearchLock) {
      throw new Error('Torznab search needs the aMule manager for the search lock, but none was injected');
    }

    return manager.withSearchLock(async () => {
      const started = await amuleClient.startSearch(query, network, '');
      if (started && started.started === false) {
        // The query goes in the log too. A refusal is almost always about the
        // query text - aMule's parser rejects characters it treats as grammar,
        // and its reply names the fault without saying what it was parsing.
        // The reason can be multi-line; keep it on one line.
        const reason = (started.message || 'no reason given').split('\n').map(l => l.trim()).filter(Boolean).join(' | ');
        logger.warn(`[Torznab] aMule refused the ${network} search: ${reason} - query was: "${query}"`);
        // Nothing ran, so this is not an answer about the query and must not
        // be cached as one.
        return { resultsLength: 0, totalLength: 0, results: [], completed: false };
      }

      // Whether the settle is needed at all is a property of the core, and the
      // first poll reveals it.
      //
      // A core from 3.1 reports EC_TAG_SEARCH_LIFECYCLE_STATE, which says
      // plainly whether THIS search is running or finished, so it can be
      // trusted from the first reading and no settle is needed.
      //
      // Older cores have only the overloaded progress figure, and it carries
      // the PREVIOUS search's value for a moment: measured on a 3.0.1 core, a
      // global search still reported 100 at 0.0s and 0.5s, with the real sweep
      // only starting near 1.0s at 8%. Reading it in that window says
      // "complete" with zero results - and since the completion flag decides
      // whether the answer is cached, that empty answer would be served for
      // the whole TTL. Hence the wait, and hence its size: the stale window
      // ran to ~0.7s, so a second of margin is not enough.
      const first = await amuleClient.getSearchProgress();
      const hasLifecycle = first?.lifecycleState !== null && first?.lifecycleState !== undefined;
      let completed = Boolean(hasLifecycle && first.complete);
      if (!hasLifecycle) {
        await new Promise(resolve => setTimeout(resolve, this.searchSettleMs));
      }

      const deadline = Date.now() + this.searchTimeoutMs;
      while (!completed && Date.now() < deadline) {
        const status = await amuleClient.getSearchProgress();
        if (status?.complete) { completed = true; break; }
        await new Promise(resolve => setTimeout(resolve, this.searchPollMs));
      }

      // Read results even on timeout: a slow search still has partial results,
      // and returning them beats returning nothing. `completed` records whether
      // aMule itself declared the search finished, which is what decides
      // whether the answer may be cached.
      const results = await amuleClient.getSearchResults({ groupByHash: true });
      if (!completed) {
        logger.log(`[Torznab] ${network} search hit its ${this.searchTimeoutMs}ms timeout; partial results will not be cached`);
      }
      return { ...results, completed };
    }, { timeoutMs: this.searchLockWaitMs });
  }

  /**
   * Space out ED2K searches, and only ED2K searches.
   *
   * The gap exists for ED2K server flood protection. Kad is a DHT and has no
   * such limit, so a Kad search neither waits for the gap nor stamps the clock.
   * Stamping it would simply move the delay onto the next ED2K search instead
   * of removing it (#89).
   *
   * @param {Function} searchFn
   * @param {string} network - 'global', 'local' or 'kad'
   */
  async rateLimitedSearch(searchFn, network) {
    const isEd2k = network !== 'kad';

    if (isEd2k) {
      const timeSinceLastSearch = Date.now() - this.lastSearchTime;
      if (timeSinceLastSearch < this.searchDelayMs) {
        const waitTime = this.searchDelayMs - timeSinceLastSearch;
        logger.log(`[Torznab] Rate limiting: waiting ${waitTime}ms before the next ED2K search`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    try {
      return await searchFn();
    } finally {
      if (isEd2k) this.lastSearchTime = Date.now();
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
   * @param {Object} params - { cacheKey, primaryQuery, fallbackQuery }
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
   * Search both aMule networks and merge the results.
   *
   * ED2K = server-indexed; Kad = DHT-indexed. They cover disjoint file sets in
   * practice, so querying both broadens hits meaningfully. Sequential through
   * the existing rate limiter - the 10s spacing exists to avoid ED2K server
   * flood protection; Kad does not need it but sequential keeps total time
   * bounded and code simple.
   *
   * @private
   */
  async _runSearch(amuleClient, { cacheKey, primaryQuery, fallbackQuery }) {
    logger.log(`[Torznab] Cache miss, searching aMule (ED2K + Kad) for key: ${cacheKey}`);

    const allResults = [];
    const seenHashes = new Map();   // hash → the result we kept, for name merging
    let incomplete = false;         // any leg cut short => the answer is not cacheable

    const runQueryOnNetwork = async (searchQuery, network, label) => {
      logger.log(`[Torznab] Searching aMule ${network} for: "${searchQuery}"${label ? ` (${label})` : ''}`);
      // groupByHash: one hash can be published under several filenames and
      // the extra ones are often the better-parsed release names (#82).
      // Kad resolves a query differently from an ED2K server, so it gets its
      // own text. See adaptQueryForKad.
      const networkQuery = network === 'kad' ? this.adaptQueryForKad(searchQuery) : searchQuery;
      const result = await this.rateLimitedSearch(
        () => this._searchWithoutBlockingEC(amuleClient, networkQuery, network),
        network
      );
      if (!result.completed) incomplete = true;
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
    this._cacheIfComplete(cacheKey, allResults, incomplete);

    return allResults;
  }

  /**
   * Cache an answer only when it is one.
   *
   * Gating on the result count would be wrong in both directions. A query with
   * genuinely no matches is a real answer worth keeping, and re-running it for
   * the whole TTL is waste. What must not be cached is a search that was cut
   * short - a timeout, or a query aMule refused - because its emptiness says
   * nothing about the query, and caching it would serve that non-answer to
   * every later request for ten minutes (#89).
   *
   * @param {string} cacheKey
   * @param {Array} results
   * @param {boolean} incomplete - did any leg fail to finish
   * @returns {boolean} whether it was cached
   */
  _cacheIfComplete(cacheKey, results, incomplete) {
    if (incomplete) {
      logger.log(`[Torznab] Not caching ${cacheKey}: a search was cut short rather than finishing`);
      return false;
    }
    this.setCachedResults(cacheKey, results);
    return true;
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
    effectiveQuery = this.canonicaliseQuery(this.stripSearchSyntax(effectiveQuery));

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
      allResults = await this._searchOrJoinInFlight(amuleClient, { cacheKey, primaryQuery, fallbackQuery });
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
