/**
 * SoulseekTorznabHandler - Torznab indexer for Soulseek (slskd)
 *
 * Provides Sonarr/Radarr compatible Torznab endpoints by translating
 * search requests to slskd Soulseek network searches.
 *
 * Download links use the slskd magnet encoding (ffffffff suffix) so they
 * round-trip cleanly through the qBittorrent-compat API back to slskd.
 */

const logger = require('../logger');
const { generateCapabilities } = require('./capabilities');
const { convertToSoulseekTorznabFeed } = require('./search');

class SoulseekTorznabHandler {
  constructor() {
    this.getSlskdManager = null;

    // Result cache (same TTL logic as TorznabHandler)
    this.cacheTtlMs = parseInt(process.env.SLSKD_CACHE_TTL_MS || '300000', 10);
    this.searchCache = new Map();

    this.handleRequest = this.handleRequest.bind(this);
  }

  setDependencies({ getSlskdManager }) {
    this.getSlskdManager = getSlskdManager || null;
  }

  // ============================================================================
  // CACHE
  // ============================================================================

  _cacheKey(t, q, season, ep) {
    return [t, q || '', season || '', ep || ''].join(':');
  }

  _getCached(key) {
    const cached = this.searchCache.get(key);
    if (!cached) return null;
    if (Date.now() - cached.timestamp > this.cacheTtlMs) {
      this.searchCache.delete(key);
      return null;
    }
    logger.log(`[SoulseekTorznab] Cache hit for key: ${key} (${cached.results.length} results)`);
    return cached.results;
  }

  _setCache(key, results) {
    this.searchCache.set(key, { results, timestamp: Date.now() });
    logger.log(`[SoulseekTorznab] Cached ${results.length} results for key: ${key}`);
  }

  // ============================================================================
  // REQUEST HANDLER
  // ============================================================================

  async handleRequest(req, res) {
    const { t, q, cat = '' } = req.query;

    try {
      if (t === 'caps') {
        const xml = generateCapabilities();
        res.set('Content-Type', 'application/xml');
        return res.send(xml);
      }

      if (t === 'search' || t === 'tvsearch' || t === 'movie') {
        return await this._handleSearch(req, res);
      }

      res.status(400).send('Invalid t parameter (expected: caps, search, tvsearch, or movie)');
    } catch (error) {
      logger.error('[SoulseekTorznab] Error:', error);
      const emptyFeed = convertToSoulseekTorznabFeed([], q || '', cat || '');
      res.set('Content-Type', 'application/xml');
      res.status(500).send(emptyFeed);
    }
  }

  async _handleSearch(req, res) {
    const { t, q, limit = 100, offset = 0, cat = '', season, ep } = req.query;

    logger.log(`[SoulseekTorznab] Search: t=${t}, q=${q || '(empty)'}, season=${season || '-'}, ep=${ep || '-'}, offset=${offset}`);

    // No search params — return a sample result for indexer validation
    const hasSearchParams = q || season || ep;
    if (!hasSearchParams) {
      logger.log('[SoulseekTorznab] No search parameters, returning sample result for validation');
      const sampleResult = [{
        fileName: 'Sample.Test.File.flac',
        fileHash: 'sample|soulseek|/Music/Sample.Test.File.flac|1073741824',
        fileSize: 1073741824,
        sourceCount: 1
      }];
      const xml = convertToSoulseekTorznabFeed(sampleResult, 'test', cat);
      res.set('Content-Type', 'application/xml');
      return res.send(xml);
    }

    if (!q) {
      logger.warn('[SoulseekTorznab] Search has metadata params but no text query');
      const xml = convertToSoulseekTorznabFeed([], 'no-query', cat);
      res.set('Content-Type', 'application/xml');
      return res.send(xml);
    }

    const slskdMgr = this.getSlskdManager?.();
    if (!slskdMgr || !slskdMgr.isConnected?.()) {
      logger.log('[SoulseekTorznab] slskd not connected, returning empty feed');
      const xml = convertToSoulseekTorznabFeed([], q, cat);
      res.set('Content-Type', 'application/xml');
      return res.send(xml);
    }

    // Build search queries (TV episodes get two format variants)
    const searchQueries = this._buildSearchQueries(t, q, season, ep);
    const cacheKey = this._cacheKey(t, q, season, ep);

    let allResults = this._getCached(cacheKey);

    if (!allResults) {
      allResults = [];
      const seenHashes = new Set();

      for (const searchQuery of searchQueries) {
        logger.log(`[SoulseekTorznab] Searching slskd for: "${searchQuery}"`);
        try {
          const { results } = await slskdMgr.search(searchQuery);
          for (const file of (results || [])) {
            if (!seenHashes.has(file.fileHash)) {
              seenHashes.add(file.fileHash);
              allResults.push(file);
            }
          }
        } catch (err) {
          logger.error(`[SoulseekTorznab] Search error for "${searchQuery}":`, err.message);
        }
      }

      logger.log(`[SoulseekTorznab] Total unique results: ${allResults.length}`);
      this._setCache(cacheKey, allResults);
    }

    const offsetNum = parseInt(offset, 10) || 0;
    const limitNum = parseInt(limit, 10) || 100;
    const paginated = allResults.slice(offsetNum, offsetNum + limitNum);

    logger.log(`[SoulseekTorznab] Returning ${paginated.length} results (offset=${offsetNum}, total=${allResults.length})`);

    const xml = convertToSoulseekTorznabFeed(paginated, q, cat);
    res.set('Content-Type', 'application/xml');
    return res.send(xml);
  }

  _buildSearchQueries(t, q, season, ep) {
    if (t !== 'tvsearch' || !season) return [q];

    const seasonNum = parseInt(season, 10);
    const normalizedQuery = q.replace(/[\[\(]?\b(19|20)\d{2}\b[\]\)]?/g, '').replace(/\s+/g, ' ').trim();

    if (ep) {
      const episodeNum = parseInt(ep, 10);
      return [
        `${normalizedQuery} ${seasonNum}x${episodeNum.toString().padStart(2, '0')}`,
        `${normalizedQuery} S${seasonNum.toString().padStart(2, '0')}E${episodeNum.toString().padStart(2, '0')}`
      ];
    }
    return [
      `${normalizedQuery} S${seasonNum.toString().padStart(2, '0')}`,
      `${normalizedQuery} Season ${seasonNum}`
    ];
  }
}

module.exports = SoulseekTorznabHandler;
