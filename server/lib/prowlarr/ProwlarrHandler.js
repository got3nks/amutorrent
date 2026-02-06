/**
 * ProwlarrHandler - Prowlarr API integration
 *
 * Provides torrent search capabilities via Prowlarr indexer manager
 * Used for searching BitTorrent content through configured indexers
 */

const logger = require('../logger');

class ProwlarrHandler {
  constructor(options = {}) {
    this.baseUrl = options.url || '';
    this.apiKey = options.apiKey || '';
  }

  /**
   * Configure the handler with URL and API key
   * @param {Object} options - Configuration options
   */
  configure(options) {
    if (options.url) this.baseUrl = options.url.replace(/\/$/, ''); // Remove trailing slash
    if (options.apiKey) this.apiKey = options.apiKey;
  }

  /**
   * Check if Prowlarr is configured
   * @returns {boolean}
   */
  isConfigured() {
    return !!(this.baseUrl && this.apiKey);
  }

  /**
   * Make API request to Prowlarr
   * @param {string} endpoint - API endpoint
   * @param {Object} options - Fetch options
   * @returns {Promise<any>}
   */
  async request(endpoint, options = {}) {
    if (!this.isConfigured()) {
      throw new Error('Prowlarr is not configured');
    }

    const url = `${this.baseUrl}/api/v1${endpoint}`;
    const headers = {
      'X-Api-Key': this.apiKey,
      'Content-Type': 'application/json',
      ...options.headers
    };

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Prowlarr API error: ${response.status} ${response.statusText} - ${text}`);
    }

    return response.json();
  }

  /**
   * Test connection to Prowlarr
   * @returns {Promise<{success: boolean, version?: string, error?: string}>}
   */
  async testConnection() {
    try {
      const status = await this.request('/system/status');
      return {
        success: true,
        version: status.version || 'unknown'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message || 'Connection failed'
      };
    }
  }

  /**
   * Get list of configured indexers
   * @returns {Promise<Array>}
   */
  async getIndexers() {
    return this.request('/indexer');
  }

  /**
   * Search for torrents across all indexers
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @param {number[]} [options.categories] - Category IDs to search
   * @param {number[]} [options.indexerIds] - Specific indexer IDs to search
   * @param {number} [options.limit] - Max results per indexer
   * @returns {Promise<Array>} Search results
   */
  async search(query, options = {}) {
    if (!query || !query.trim()) {
      return [];
    }

    const params = new URLSearchParams();
    params.append('query', query.trim());

    // Add categories if specified
    if (options.categories && options.categories.length > 0) {
      options.categories.forEach(cat => params.append('categories', cat));
    }

    // Add indexer IDs if specified
    if (options.indexerIds && options.indexerIds.length > 0) {
      options.indexerIds.forEach(id => params.append('indexerIds', id));
    }

    // Add limit if specified
    if (options.limit) {
      params.append('limit', options.limit);
    }

    logger.log(`[Prowlarr] Searching for: "${query}"`);

    const results = await this.request(`/search?${params.toString()}`);

    logger.log(`[Prowlarr] Found ${results.length} results`);

    return this.normalizeResults(results);
  }

  /**
   * Normalize Prowlarr results to a common format
   * @param {Array} results - Raw Prowlarr results
   * @returns {Array} Normalized results
   */
  normalizeResults(results) {
    return results.map(result => {
      // Extract info hash from magnet link if available
      let infoHash = null;
      if (result.downloadUrl && result.downloadUrl.startsWith('magnet:')) {
        const match = result.downloadUrl.match(/urn:btih:([a-fA-F0-9]{40})/i);
        if (match) {
          infoHash = match[1].toUpperCase();
        }
      }

      return {
        // Identifier
        guid: result.guid,
        infoHash,

        // Basic info
        title: result.title,
        fileName: result.title,
        size: result.size || 0,
        fileSize: result.size || 0,

        // URLs
        downloadUrl: result.downloadUrl,
        magnetUrl: result.downloadUrl?.startsWith('magnet:') ? result.downloadUrl : null,
        infoUrl: result.infoUrl,

        // Stats
        seeders: result.seeders || 0,
        leechers: result.leechers || 0,
        peers: (result.seeders || 0) + (result.leechers || 0),

        // Metadata
        indexer: result.indexer,
        indexerId: result.indexerId,
        categories: result.categories || [],
        publishDate: result.publishDate,

        // Protocol (torrent or usenet)
        protocol: result.protocol || 'torrent',

        // Source marker
        source: 'prowlarr',
        clientType: 'torrent'
      };
    });
  }

  /**
   * Get download URL or magnet link for a result
   * @param {string} guid - Result GUID
   * @returns {Promise<string>} Download URL
   */
  async getDownloadUrl(guid) {
    // For most results, the downloadUrl is already in the search results
    // This method can be extended to fetch the actual torrent file if needed
    return guid;
  }
}

module.exports = ProwlarrHandler;
