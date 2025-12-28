const { generateCapabilities } = require('./capabilities');
const { convertToTorznabFeed } = require('./search');

/**
 * Create Torznab API handler
 *
 * Handles all Torznab indexer requests:
 * - t=caps: Capabilities query
 * - t=search: General search
 * - t=tvsearch: TV-specific search
 * - t=movie: Movie-specific search
 *
 * Rate limiting: Implements delay between ED2K searches to avoid server flood protection
 * Caching: Caches search results to handle Sonarr's pagination (offset/limit)
 *
 * @param {function} getAmuleClient - Function that returns current aMule client instance
 * @returns {function} Express route handler
 */
function createTorznabHandler(getAmuleClient) {
  // Rate limiting: delay between searches to avoid ED2K server flood protection
  const SEARCH_DELAY_MS = parseInt(process.env.ED2K_SEARCH_DELAY_MS || '10000', 10); // 10 seconds default
  let lastSearchTime = 0;

  // Search results cache: prevents duplicate searches when Sonarr uses pagination
  const CACHE_TTL_MS = parseInt(process.env.ED2K_CACHE_TTL_MS || '600000', 10); // 10 minutes default
  const searchCache = new Map();

  function getCacheKey(t, q, season, ep) {
    const parts = [t, q || ''];
    if (season) parts.push(season);
    if (ep) parts.push(ep);
    return parts.join(':');
  }

  function getCachedResults(cacheKey) {
    const cached = searchCache.get(cacheKey);
    if (!cached) return null;

    const age = Date.now() - cached.timestamp;
    if (age > CACHE_TTL_MS) {
      console.log(`[Torznab] Cache expired for key: ${cacheKey} (age: ${Math.round(age / 1000)}s)`);
      searchCache.delete(cacheKey);
      return null;
    }

    console.log(`[Torznab] Cache hit for key: ${cacheKey} (${cached.results.length} results, age: ${Math.round(age / 1000)}s)`);
    return cached.results;
  }

  function setCachedResults(cacheKey, results) {
    searchCache.set(cacheKey, {
      results,
      timestamp: Date.now()
    });
    console.log(`[Torznab] Cached ${results.length} results for key: ${cacheKey}`);
  }

  /**
   * Strip year (YYYY format) from search query
   * Examples: "Breaking Bad 2008" -> "Breaking Bad", "Show (2020)" -> "Show"
   */
  function stripYear(query) {
    if (!query) return query;

    // Remove 4-digit years (optionally in parentheses or brackets)
    // Matches: "2008", "(2008)", "[2008]", " 2008", etc.
    const stripped = query
      .replace(/[\[\(]?\b(19|20)\d{2}\b[\]\)]?/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (stripped !== query) {
      console.log(`[Torznab] Stripped year from query: "${query}" -> "${stripped}"`);
    }

    return stripped;
  }

  async function rateLimitedSearch(searchFn) {
    const now = Date.now();
    const timeSinceLastSearch = now - lastSearchTime;

    if (timeSinceLastSearch < SEARCH_DELAY_MS) {
      const waitTime = SEARCH_DELAY_MS - timeSinceLastSearch;
      console.log(`[Torznab] Rate limiting: waiting ${waitTime}ms before next search`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    try {
      return await searchFn();
    } finally {
      // Update timestamp after search completes to ensure proper delay between searches
      lastSearchTime = Date.now();
    }
  }

  return async (req, res) => {
    const { t, q, limit = 100, offset = 0 } = req.query;

    try {
      // Capabilities endpoint
      if (t === 'caps') {
        const xml = generateCapabilities();
        res.set('Content-Type', 'application/xml');
        return res.send(xml);
      }

      // Search endpoints (search, tvsearch, movie all use same logic)
      if (t === 'search' || t === 'tvsearch' || t === 'movie') {
        // Log the search request
        const { season, ep, tvdbid, rid, imdbid } = req.query;
        console.log(`[Torznab] Search request: t=${t}, q=${q || '(empty)'}, season=${season || 'none'}, ep=${ep || 'none'}, offset=${offset}, limit=${limit}, cat=${req.query.cat || 'none'}`);

        // Check if this is a real search or just validation
        const hasSearchParams = q || season || ep || tvdbid || rid || imdbid;

        // If no search parameters at all, return sample result for indexer validation
        // Sonarr/Radarr require at least one result to save the indexer
        if (!hasSearchParams) {
          console.log('[Torznab] No search parameters, returning sample result for validation');
          const sampleResult = [{
            fileName: 'Sample.Test.File.mkv',
            fileHash: 'A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4',
            fileSize: 1073741824, // 1 GB
            sourceCount: 10,
            category: '5040' // TV/SD category - matches Sonarr's test categories
          }];
          const testFeed = convertToTorznabFeed(sampleResult, 'test');
          res.set('Content-Type', 'application/xml');
          return res.send(testFeed);
        }

        // If we have search params but no text query, we can't search ED2K
        // ED2K requires a text query, it doesn't support searching by metadata alone
        if (!q) {
          console.log('[Torznab] Search has metadata params but no text query - cannot search ED2K without query text');
          const emptyFeed = convertToTorznabFeed([], 'no-query');
          res.set('Content-Type', 'application/xml');
          return res.send(emptyFeed);
        }

        const amuleClient = getAmuleClient();
        if (!amuleClient) {
          console.log('[Torznab] aMule not connected, returning empty feed');
          // Return empty feed if aMule not connected
          const emptyFeed = convertToTorznabFeed([], q);
          res.set('Content-Type', 'application/xml');
          return res.send(emptyFeed);
        }

        // Build search queries and determine cache key based on actual queries sent to aMule
        const searchQueries = [];
        let normalizedQuery = q; // Query used for cache key (after processing)

        if (t === 'tvsearch' && season && ep) {
          // Parse season and episode numbers
          const seasonNum = parseInt(season, 10);
          const episodeNum = parseInt(ep, 10);

          // Strip year from query before adding format variations
          normalizedQuery = stripYear(q);

          // Generate different format variations
          const formats = [
              `${seasonNum}x${episodeNum.toString().padStart(2, '0')}`, // 1x01
              `S${seasonNum.toString().padStart(2, '0')}E${episodeNum.toString().padStart(2, '0')}`, // S01E01
          ];

          // Create search queries combining show name with each format
          formats.forEach(format => {
            searchQueries.push(`${normalizedQuery} ${format}`);
          });

          console.log(`[Torznab] TV search: Will search for ${searchQueries.length} format variations`);
        } else if(t === 'tvsearch' && season) {
            // Parse season
            const seasonNum = parseInt(season, 10);

            // Strip year from query before adding format variations
            normalizedQuery = stripYear(q);

            // Generate different format variations
            const formats = [
                `${seasonNum}x`, // 1x
                `S${seasonNum.toString().padStart(2, '0')}`, // S01
            ];

            // Create search queries combining show name with each format
            formats.forEach(format => {
                searchQueries.push(`${normalizedQuery} ${format}`);
            });

            console.log(`[Torznab] TV search: Will search for ${searchQueries.length} format variations`);
        } else {
          // Regular search or movie search - just use the query as-is
          searchQueries.push(q);
        }

        // Create cache key based on normalized query (after year stripping)
        const cacheKey = getCacheKey(t, normalizedQuery, season, ep);

        // Check cache first
        let allResults = getCachedResults(cacheKey);

        // If not in cache, perform the search
        if (!allResults) {
          console.log(`[Torznab] Cache miss, performing ED2K search for key: ${cacheKey}`);

          // Perform multiple aMule searches and merge results
          allResults = [];
          const seenHashes = new Set();

          for (const searchQuery of searchQueries) {
            console.log(`[Torznab] Searching aMule for: "${searchQuery}"`);

            // Apply rate limiting to avoid ED2K server flood protection
            const result = await rateLimitedSearch(() =>
              amuleClient.searchAndWaitResults(searchQuery, 'global', '')
            );

            const resultCount = (result.results || []).length;
            console.log(`[Torznab] Query "${searchQuery}" returned ${resultCount} results`);

            // Add unique results only (deduplicate by file hash)
            (result.results || []).forEach(file => {
              if (!seenHashes.has(file.fileHash)) {
                seenHashes.add(file.fileHash);
                allResults.push(file);
              }
            });
          }

          console.log(`[Torznab] Total unique results after merging: ${allResults.length}`);

          // Cache the results for future pagination requests
          setCachedResults(cacheKey, allResults);
        }

        // Apply pagination (offset/limit)
        const offsetNum = parseInt(offset, 10) || 0;
        const limitNum = parseInt(limit, 10) || 100;
        const paginatedResults = allResults.slice(offsetNum, offsetNum + limitNum);

        console.log(`[Torznab] Returning ${paginatedResults.length} results (offset: ${offsetNum}, limit: ${limitNum}, total: ${allResults.length})`);

        // Convert results to Torznab feed
        const xml = convertToTorznabFeed(paginatedResults, q);
        res.set('Content-Type', 'application/xml');
        return res.send(xml);
      }

      // Unknown function type
      res.status(400).send('Invalid t parameter (expected: caps, search, tvsearch, or movie)');
    } catch (error) {
      console.error('Torznab error:', error);

      // Return empty feed on error to avoid breaking Sonarr/Radarr
      const emptyFeed = convertToTorznabFeed([], q || '');
      res.set('Content-Type', 'application/xml');
      res.status(500).send(emptyFeed);
    }
  };
}

module.exports = { createTorznabHandler };
