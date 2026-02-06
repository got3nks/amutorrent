/**
 * HostnameResolver - Async hostname resolution with caching
 *
 * Resolves IP addresses to hostnames using reverse DNS lookups.
 * Uses an in-memory LRU cache to avoid repeated lookups.
 */

const dns = require('dns').promises;
const logger = require('./logger');
const { ipToString, isValidIP } = require('./networkUtils');

class HostnameResolver {
  constructor(options = {}) {
    // Configuration
    this.ttl = options.ttl || 60 * 60 * 1000; // 1 hour default
    this.failedTtl = options.failedTtl || 10 * 60 * 1000; // 10 minutes for failed lookups
    this.maxCacheSize = options.maxCacheSize || 5000;
    this.timeout = options.timeout || 3000; // 3 seconds

    // Cache: IP -> { hostname: string|null, resolvedAt: number }
    this.cache = new Map();

    // Set of IPs currently being resolved (to avoid duplicate lookups)
    this.pending = new Set();

    logger.log(`🔍 HostnameResolver initialized (TTL: ${this.ttl / 1000}s, maxCache: ${this.maxCacheSize})`);
  }

  /**
   * Get hostname for an IP address (non-blocking)
   * Returns cached hostname if available, otherwise returns null and triggers background resolution
   * @param {string} ip - IP address to resolve
   * @returns {string|null} - Hostname if cached and valid, null otherwise
   */
  getHostname(ip) {
    if (!ip || !isValidIP(ip)) {
      return null;
    }

    const cached = this.cache.get(ip);
    if (cached) {
      const ttl = cached.hostname ? this.ttl : this.failedTtl;
      if (Date.now() - cached.resolvedAt < ttl) {
        return cached.hostname;
      }
      // Expired - will be refreshed
    }

    // Trigger background resolution if not already pending
    if (!this.pending.has(ip)) {
      this.resolveAsync(ip);
    }

    // Return null for now - hostname will be available on next request
    return cached?.hostname || null;
  }

  /**
   * Resolve hostname asynchronously (background)
   * @param {string} ip - IP address to resolve
   */
  async resolveAsync(ip) {
    if (this.pending.has(ip)) {
      return;
    }

    this.pending.add(ip);

    try {
      const hostname = await this.resolveWithTimeout(ip);
      this.setCached(ip, hostname);
    } catch (err) {
      // Cache failed lookup to avoid retrying
      this.setCached(ip, null);
    } finally {
      this.pending.delete(ip);
    }
  }

  /**
   * Resolve with timeout
   * @param {string} ip - IP address
   * @returns {Promise<string|null>} - Hostname or null
   */
  async resolveWithTimeout(ip) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('DNS lookup timeout'));
      }, this.timeout);

      dns.reverse(ip)
        .then(hostnames => {
          clearTimeout(timer);
          // Return first hostname, clean it up
          if (hostnames && hostnames.length > 0) {
            resolve(hostnames[0]);
          } else {
            resolve(null);
          }
        })
        .catch(err => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  /**
   * Set cached entry with LRU eviction
   * @param {string} ip - IP address
   * @param {string|null} hostname - Resolved hostname or null for failed
   */
  setCached(ip, hostname) {
    // LRU eviction if at max size
    if (this.cache.size >= this.maxCacheSize && !this.cache.has(ip)) {
      // Delete oldest entry (first in Map)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    // Delete and re-add to maintain LRU order
    this.cache.delete(ip);
    this.cache.set(ip, {
      hostname,
      resolvedAt: Date.now()
    });
  }

  /**
   * Enrich an array of peers/uploads with hostnames
   * Reads the `address` string field from each entry
   * @param {Array} peers - Array of peer objects with address field
   * @returns {Array} - Enriched peers with hostname field
   */
  enrichPeersWithHostnames(peers) {
    if (!Array.isArray(peers)) {
      return peers;
    }

    return peers.map(peer => {
      const ip = peer.address;
      if (ip) {
        const hostname = this.getHostname(ip);
        return {
          ...peer,
          hostname: hostname || null
        };
      }
      return peer;
    });
  }

  /**
   * Get cache statistics
   * @returns {object} - Cache stats
   */
  getStats() {
    let resolved = 0;
    let failed = 0;

    for (const entry of this.cache.values()) {
      if (entry.hostname) {
        resolved++;
      } else {
        failed++;
      }
    }

    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      resolved,
      failed,
      pending: this.pending.size
    };
  }

  /**
   * Clear the cache
   */
  clear() {
    this.cache.clear();
    this.pending.clear();
    logger.log('🔍 HostnameResolver cache cleared');
  }
}

// Export singleton instance with default configuration
module.exports = new HostnameResolver({
  ttl: 60 * 60 * 1000,        // 1 hour cache TTL
  failedTtl: 10 * 60 * 1000,  // 10 minutes for failed lookups
  maxCacheSize: 5000,         // Max cached entries
  timeout: 3000               // 3 second DNS timeout
});
