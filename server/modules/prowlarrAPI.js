/**
 * Prowlarr API Module
 * Provides REST endpoints for Prowlarr torrent searches
 */

const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const BaseModule = require('../lib/BaseModule');
const config = require('./config');
const ProwlarrHandler = require('../lib/prowlarr/ProwlarrHandler');
const response = require('../lib/responseFormatter');
const { requireCapability } = require('../middleware/capabilities');

// Client registry - replaces direct singleton manager imports
const registry = require('../lib/ClientRegistry');
const categoryManager = require('../lib/CategoryManager');

class ProwlarrAPI extends BaseModule {
  constructor() {
    super();
    this.handler = null;
    // Cache for last search results
    this.cachedResults = [];
    this.cachedQuery = '';
    this.cachedTimestamp = 0;
  }

  /**
   * Get cached search results with metadata
   * @returns {Object} { results, query, timestamp }
   */
  getCachedResults() {
    return {
      results: this.cachedResults,
      query: this.cachedQuery,
      timestamp: this.cachedTimestamp
    };
  }

  /**
   * Initialize the Prowlarr handler with current config
   */
  initHandler() {
    const prowlarrConfig = config.getConfig()?.integrations?.prowlarr;
    if (prowlarrConfig?.enabled && prowlarrConfig.url && prowlarrConfig.apiKey) {
      this.handler = new ProwlarrHandler();
      this.handler.configure({
        url: prowlarrConfig.url,
        apiKey: prowlarrConfig.apiKey
      });
      return true;
    }
    return false;
  }

  /**
   * GET /api/prowlarr/status
   * Returns Prowlarr configuration status
   */
  async getStatus(req, res) {
    const prowlarrConfig = config.getConfig()?.integrations?.prowlarr;
    const enabled = prowlarrConfig?.enabled || false;

    res.json({
      enabled,
      configured: enabled && prowlarrConfig?.url && prowlarrConfig?.apiKey
    });
  }

  /**
   * GET /api/prowlarr/indexers
   * Returns list of configured indexers
   */
  async getIndexers(req, res) {
    try {
      if (!this.initHandler()) {
        return response.badRequest(res, 'Prowlarr is not configured');
      }

      const indexers = await this.handler.getIndexers();

      res.json({
        success: true,
        indexers: indexers.map(i => ({
          id: i.id,
          name: i.name,
          protocol: i.protocol,
          enabled: i.enable,
          categories: i.capabilities?.categories || []
        }))
      });
    } catch (err) {
      this.error('❌ Error fetching indexers:', err.message);
      response.serverError(res, 'Failed to fetch indexers: ' + err.message);
    }
  }

  /**
   * POST /api/prowlarr/search
   * Search for torrents via Prowlarr
   * Body: { query, categories?, indexerIds?, limit? }
   */
  async search(req, res) {
    try {
      if (!this.initHandler()) {
        return response.badRequest(res, 'Prowlarr is not configured');
      }

      const { query, categories, indexerIds, limit } = req.body;

      if (!query || !query.trim()) {
        return response.badRequest(res, 'Search query is required');
      }

      this.log(`🔍 Prowlarr search: "${query}"`);

      const rawResults = await this.handler.search(query, {
        categories,
        indexerIds,
        limit: limit || 100
      });

      // Transform results to unified format (sourceCount = seeders for sorting compatibility)
      const results = rawResults.map(r => {
        // Fallback: check if guid contains a magnet link when magnetUrl is missing
        let magnetUrl = r.magnetUrl;
        if (!magnetUrl && !r.downloadUrl && r.guid && r.guid.startsWith('magnet:')) {
          magnetUrl = r.guid;
        }

        // Warn if no download URL found
        if (!r.downloadUrl && !magnetUrl) {
          this.warn(`⚠️ No download URL for "${r.title}" from ${r.indexer}`);
        }

        return {
          fileHash: r.guid || r.downloadUrl || magnetUrl,
          fileName: r.title,
          fileSize: r.size,
          sourceCount: r.seeders || 0,
          leechers: r.leechers || 0,
          downloadUrl: r.downloadUrl,
          magnetUrl,
          indexer: r.indexer,
          publishDate: r.publishDate,
          categories: r.categories,
          isProwlarr: true
        };
      });

      // Cache transformed results for getPreviousSearchResults
      this.cachedResults = results;
      this.cachedQuery = query;
      this.cachedTimestamp = Date.now();

      this.log(`✅ Found ${results.length} results (cached)`);

      res.json({
        success: true,
        query,
        results
      });
    } catch (err) {
      this.error('❌ Search error:', err.message);
      response.serverError(res, 'Search failed: ' + err.message);
    }
  }

  /**
   * Rewrite a Prowlarr download URL to use the configured Prowlarr host
   * Prowlarr returns URLs with its internal hostname (often localhost),
   * which won't work if this server is running in a different container/environment
   * @param {string} url - Original download URL from Prowlarr
   * @returns {string} Rewritten URL using configured Prowlarr host
   */
  rewriteProwlarrUrl(url) {
    const prowlarrUrl = config.PROWLARR_URL;
    if (!prowlarrUrl) return url;

    try {
      const originalUrl = new URL(url);
      const configuredUrl = new URL(prowlarrUrl);

      // Replace the host/port with the configured Prowlarr URL's host/port
      originalUrl.protocol = configuredUrl.protocol;
      originalUrl.hostname = configuredUrl.hostname;
      originalUrl.port = configuredUrl.port;

      return originalUrl.toString();
    } catch (err) {
      this.warn(`⚠️ Failed to rewrite URL: ${err.message}`);
      return url;
    }
  }

  /**
   * Download a torrent file from URL to a temporary location
   * @param {string} url - URL to download
   * @returns {Promise<string>} Path to downloaded file
   */
  async downloadTorrentFile(url) {
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `torrent_${Date.now()}.torrent`);

    // Rewrite URL to use configured Prowlarr host
    const rewrittenUrl = this.rewriteProwlarrUrl(url);
    if (rewrittenUrl !== url) {
      this.log(`🔄 Rewrote URL: ${url.substring(0, 40)}... → ${rewrittenUrl.substring(0, 40)}...`);
    }

    try {
      // Request without following redirects - Prowlarr may redirect to magnet links
      const initialResponse = await fetch(rewrittenUrl, { redirect: 'manual' });
      const location = initialResponse.headers.get('location');

      // Check if it's a redirect to a magnet link
      if (initialResponse.status >= 300 && initialResponse.status < 400 && location) {
        if (location.startsWith('magnet:')) {
          // Return magnet link instead of file path - caller handles this
          return { magnet: location };
        }
        // Follow HTTP redirect
        const redirectResponse = await fetch(location);
        if (!redirectResponse.ok) {
          throw new Error(`HTTP ${redirectResponse.status}: ${redirectResponse.statusText}`);
        }
        const buffer = await redirectResponse.arrayBuffer();
        await fs.writeFile(tempFile, Buffer.from(buffer));
        return tempFile;
      }

      if (!initialResponse.ok) {
        throw new Error(`HTTP ${initialResponse.status}: ${initialResponse.statusText}`);
      }

      const buffer = await initialResponse.arrayBuffer();
      await fs.writeFile(tempFile, Buffer.from(buffer));

      return tempFile;
    } catch (err) {
      // Clean up on error
      try {
        await fs.unlink(tempFile);
      } catch (e) {
        // Ignore cleanup errors
      }
      throw err;
    }
  }

  /**
   * POST /api/prowlarr/add
   * Add a torrent to a BitTorrent client (rTorrent or qBittorrent)
   * Body: { downloadUrl, title?, label?, clientId? }
   */
  async addTorrent(req, res) {
    let tempFile = null;

    try {
      const { downloadUrl, title, label, clientId = 'rtorrent', instanceId } = req.body;

      // Find client manager — prefer specific instance, fall back to first of type
      let clientManager;
      if (instanceId) {
        clientManager = registry.get(instanceId);
      } else {
        clientManager = registry.getByType(clientId).find(m => m.isConnected());
        if (clientManager) this.warn(`⚠️ [ProwlarrAPI.addTorrent] No instanceId provided, falling back to first ${clientId} instance "${clientManager.instanceId}"`);
      }
      if (!clientManager || !clientManager.isConnected()) {
        return response.badRequest(res, `${clientManager?.displayName || clientId} is not connected`);
      }

      if (!downloadUrl) {
        return response.badRequest(res, 'Download URL is required');
      }

      // Get username from session (populated by form login or SSO middleware)
      const username = req.session?.username || null;

      // Look up category path from CategoryManager
      const category = label ? categoryManager.getByName(label) : null;
      const directory = category?.path || null;

      const clientName = clientManager.displayName || clientId;
      this.log(`➕ Adding torrent to ${clientName}: ${title || downloadUrl.substring(0, 50)}...${directory ? ` (path: ${directory})` : ''}${username ? ` (user: ${username})` : ''}`);

      const addOptions = { categoryName: label || '', savePath: directory, start: true, username };

      // Track magnet URI for ownership recording and hash for frontend
      let effectiveMagnet = null;
      let infoHash = null;

      // Check if it's a magnet link
      if (downloadUrl.startsWith('magnet:')) {
        effectiveMagnet = downloadUrl;
        await clientManager.addMagnet(downloadUrl, addOptions);
      } else {
        // It's a torrent file URL - download and add using raw buffer
        this.log(`📥 Downloading torrent file from ${downloadUrl.substring(0, 50)}...`);
        const result = await this.downloadTorrentFile(downloadUrl);

        // Check if Prowlarr redirected to a magnet link
        if (result && typeof result === 'object' && result.magnet) {
          this.log(`🧲 Prowlarr redirected to magnet link`);
          effectiveMagnet = result.magnet;
          await clientManager.addMagnet(result.magnet, addOptions);
        } else {
          tempFile = result;
          const torrentBuffer = await fs.readFile(tempFile);
          await clientManager.addTorrentRaw(torrentBuffer, addOptions);

          // Extract hash from torrent buffer for ownership + frontend tracking
          try {
            const { parseTorrentBuffer } = require('../lib/torrentUtils');
            const { hash } = parseTorrentBuffer(torrentBuffer);
            if (hash) {
              infoHash = hash;
              if (req.session?.userId && this.userManager) {
                const { itemKey } = require('../lib/itemKey');
                this.userManager.recordOwnership(itemKey(clientManager.instanceId, hash), req.session.userId);
              }
            }
          } catch (e) { /* best-effort */ }
        }
      }

      // Extract hash from magnet URI for ownership + frontend tracking
      if (effectiveMagnet) {
        const hashMatch = effectiveMagnet.match(/xt=urn:btih:([a-fA-F0-9]{40})/i);
        if (hashMatch) {
          infoHash = hashMatch[1].toLowerCase();
          if (req.session?.userId && this.userManager) {
            const { itemKey } = require('../lib/itemKey');
            this.userManager.recordOwnership(itemKey(clientManager.instanceId, infoHash), req.session.userId);
          }
        }
      }

      this.log(`✅ Torrent added to ${clientName} successfully`);

      res.json({
        success: true,
        message: `Torrent added to ${clientName}`,
        ...(infoHash && { hash: infoHash })
      });
    } catch (err) {
      this.error('❌ Error adding torrent:', err.message);
      response.serverError(res, 'Failed to add torrent: ' + err.message);
    } finally {
      // Clean up temp file
      if (tempFile) {
        try {
          await fs.unlink(tempFile);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    }
  }

  /**
   * Register all Prowlarr API routes
   */
  registerRoutes(app) {
    const router = express.Router();

    // All routes use JSON
    router.use(express.json());

    // GET /api/prowlarr/status - Get Prowlarr configuration status
    router.get('/status', requireCapability('search'), this.getStatus.bind(this));

    // GET /api/prowlarr/indexers - Get list of indexers
    router.get('/indexers', requireCapability('search'), this.getIndexers.bind(this));

    // POST /api/prowlarr/search - Search for torrents
    router.post('/search', requireCapability('search'), this.search.bind(this));

    // POST /api/prowlarr/add - Add torrent to client
    router.post('/add', requireCapability('add_downloads'), this.addTorrent.bind(this));

    // Mount router
    app.use('/api/prowlarr', router);

    this.log('📡 Prowlarr API routes registered');
  }
}

module.exports = new ProwlarrAPI();
