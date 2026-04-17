/**
 * Favicon Cache
 *
 * Fetches and caches favicons for tracker domains.
 *
 * - Persistent: blobs + metadata sidecar stored under `<dataDir>/favicons/`.
 * - TTL: re-fetch after `ttlMs`; on failure, keep serving the stale blob.
 * - Negative cache: absent/failed lookups remembered for `negativeTtlMs` to
 *   avoid hammering a host that has no favicon.
 * - Single-flight: one in-flight fetch per host at a time.
 * - Size cap: blobs above `maxBytes` are rejected.
 *
 * Fetch strategy (in order, first success wins):
 *   1. https://<host>/favicon.ico
 *   2. Parse https://<host>/ HTML for <link rel="icon"> / "shortcut icon"
 *   3. http://<host>/favicon.ico
 */

'use strict';

const fs = require('fs/promises');
const path = require('path');
const logger = require('./logger');

const DEFAULT_OPTIONS = {
  ttlMs: 24 * 60 * 60 * 1000,        // 24 hours
  negativeTtlMs: 6 * 60 * 60 * 1000, // 6 hours
  maxBytes: 1024 * 1024,             // 1 MB
  fetchTimeoutMs: 8000,
  userAgent: 'aMuTorrent/1.0 (favicon fetcher)'
};

// Accept common icon mime types; anything else is treated as invalid.
const IMAGE_CONTENT_TYPES = new Set([
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'image/ico',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/svg+xml',
  'image/webp'
]);

const HOST_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

function isValidHost(host) {
  return typeof host === 'string' && host.length > 0 && host.length < 256 && HOST_REGEX.test(host);
}

function normalizeContentType(ct) {
  if (!ct) return 'image/x-icon';
  const base = ct.split(';')[0].trim().toLowerCase();
  return IMAGE_CONTENT_TYPES.has(base) ? base : null;
}

class FaviconCache {
  constructor(dataDir, options = {}) {
    this.dir = path.join(dataDir, 'favicons');
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this._inflight = new Map();
    this._ready = this._ensureDir();
  }

  async _ensureDir() {
    await fs.mkdir(this.dir, { recursive: true });
  }

  _blobPath(host) {
    return path.join(this.dir, `${host}.blob`);
  }

  _metaPath(host) {
    return path.join(this.dir, `${host}.meta.json`);
  }

  async _readMeta(host) {
    try {
      const raw = await fs.readFile(this._metaPath(host), 'utf8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async _readBlob(host) {
    try {
      return await fs.readFile(this._blobPath(host));
    } catch {
      return null;
    }
  }

  async _writeEntry(host, contentType, buffer) {
    const meta = {
      host,
      contentType,
      size: buffer.length,
      fetchedAt: Date.now(),
      status: 'ok'
    };
    await fs.writeFile(this._blobPath(host), buffer);
    await fs.writeFile(this._metaPath(host), JSON.stringify(meta, null, 2));
    return meta;
  }

  async _writeNegative(host) {
    const meta = { host, fetchedAt: Date.now(), status: 'missing' };
    await fs.writeFile(this._metaPath(host), JSON.stringify(meta, null, 2));
    // Keep any existing blob so we can still serve the last known image.
    return meta;
  }

  /**
   * Get a favicon for the given host. Returns `{ buffer, contentType, status }`
   * or `null` if no favicon is available and none has ever been cached.
   */
  async get(host) {
    if (!isValidHost(host)) return null;
    await this._ready;

    const meta = await this._readMeta(host);
    const now = Date.now();

    // Fresh positive cache hit → serve immediately
    if (meta?.status === 'ok' && meta.contentType && (now - meta.fetchedAt) < this.options.ttlMs) {
      const buffer = await this._readBlob(host);
      if (buffer) return { buffer, contentType: meta.contentType, status: 'fresh' };
    }

    // Fresh negative cache hit → skip the network and fall back to the blob if any
    if (meta?.status === 'missing' && (now - meta.fetchedAt) < this.options.negativeTtlMs) {
      const buffer = await this._readBlob(host);
      if (buffer && meta.contentType) {
        return { buffer, contentType: meta.contentType, status: 'stale' };
      }
      return null;
    }

    // Deduplicate concurrent refreshes for the same host
    if (this._inflight.has(host)) {
      return this._inflight.get(host);
    }

    const promise = this._refresh(host, meta).finally(() => this._inflight.delete(host));
    this._inflight.set(host, promise);
    return promise;
  }

  async _refresh(host, prevMeta) {
    try {
      const fetched = await this._fetchFavicon(host);
      if (fetched) {
        await this._writeEntry(host, fetched.contentType, fetched.buffer);
        return { buffer: fetched.buffer, contentType: fetched.contentType, status: 'fresh' };
      }
      // No favicon found — record a negative hit but keep any previous blob
      await this._writeNegative(host);
      if (prevMeta?.status === 'ok' && prevMeta.contentType) {
        const buffer = await this._readBlob(host);
        if (buffer) return { buffer, contentType: prevMeta.contentType, status: 'stale' };
      }
      return null;
    } catch (err) {
      // Network / I/O error — preserve the previous blob if any
      logger.log(`[favicon] fetch error for ${host}:`, err.message);
      if (prevMeta?.status === 'ok' && prevMeta.contentType) {
        const buffer = await this._readBlob(host);
        if (buffer) return { buffer, contentType: prevMeta.contentType, status: 'stale' };
      }
      return null;
    }
  }

  async _fetchFavicon(host) {
    // 1. Direct /favicon.ico
    const direct = await this._tryFetchImage(`https://${host}/favicon.ico`);
    if (direct) return direct;

    // 2. Parse root HTML for <link rel="icon" ...>
    const linked = await this._tryParseFromRoot(host);
    if (linked) return linked;

    // 3. HTTP fallback for hosts without TLS
    const httpDirect = await this._tryFetchImage(`http://${host}/favicon.ico`);
    if (httpDirect) return httpDirect;

    return null;
  }

  async _tryFetchImage(url) {
    const res = await this._fetchWithTimeout(url, { redirect: 'follow' });
    if (!res || !res.ok) return null;

    const contentType = normalizeContentType(res.headers.get('content-type'));
    if (!contentType) return null;

    const reader = res.body?.getReader?.();
    const buffer = reader
      ? await this._readStreamBounded(reader)
      : Buffer.from(await res.arrayBuffer());

    if (!buffer || buffer.length === 0 || buffer.length > this.options.maxBytes) return null;
    return { buffer, contentType };
  }

  async _tryParseFromRoot(host) {
    const res = await this._fetchWithTimeout(`https://${host}/`, { redirect: 'follow' });
    if (!res || !res.ok) return null;

    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('text/html')) return null;

    // Read at most 64 KB of HTML — the <head> is near the top
    const reader = res.body?.getReader?.();
    const htmlBuffer = reader
      ? await this._readStreamBounded(reader, 64 * 1024)
      : Buffer.from(await res.arrayBuffer());
    if (!htmlBuffer) return null;

    const html = htmlBuffer.toString('utf8');
    const iconHref = this._findIconHref(html);
    if (!iconHref) return null;

    const iconUrl = new URL(iconHref, `https://${host}/`).toString();
    return this._tryFetchImage(iconUrl);
  }

  _findIconHref(html) {
    // Match <link rel="...icon..." href="...">
    const linkRe = /<link\b[^>]*>/gi;
    const matches = html.match(linkRe) || [];
    let best = null;
    let bestScore = -1;

    for (const tag of matches) {
      const relMatch = tag.match(/\brel\s*=\s*(['"])([^'"]+)\1/i);
      if (!relMatch) continue;
      const rel = relMatch[2].toLowerCase();
      if (!rel.includes('icon')) continue;

      const hrefMatch = tag.match(/\bhref\s*=\s*(['"])([^'"]+)\1/i);
      if (!hrefMatch) continue;

      // Prefer apple-touch-icon (high-res) > icon > shortcut icon
      let score = 1;
      if (rel.includes('apple-touch-icon')) score = 3;
      else if (rel === 'icon') score = 2;

      if (score > bestScore) {
        best = hrefMatch[2];
        bestScore = score;
      }
    }
    return best;
  }

  async _fetchWithTimeout(url, init = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.fetchTimeoutMs);
    try {
      return await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          'User-Agent': this.options.userAgent,
          'Accept': 'image/*, text/html;q=0.5',
          ...(init.headers || {})
        }
      });
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async _readStreamBounded(reader, limit = this.options.maxBytes) {
    const chunks = [];
    let total = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > limit) {
        try { await reader.cancel(); } catch {}
        return null;
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks.map(c => Buffer.from(c)), total);
  }
}

module.exports = { FaviconCache, isValidHost };
