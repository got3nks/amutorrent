/**
 * Favicon API
 *
 * GET /api/favicon/tracker/:host
 *   Returns a cached favicon image for the given tracker host, fetching from
 *   the host on first request and falling back to the last known blob on
 *   refresh failure. Returns 404 when no favicon has ever been retrieved.
 */

'use strict';

const express = require('express');
const config = require('./config');
const { FaviconCache, isValidHost } = require('../lib/faviconCache');

let cache = null;

function getCache() {
  if (!cache) cache = new FaviconCache(config.dataDir);
  return cache;
}

function registerRoutes(app) {
  const router = express.Router();

  router.get('/tracker/:host', async (req, res) => {
    const host = (req.params.host || '').toLowerCase();
    if (!isValidHost(host)) {
      return res.status(400).json({ error: 'Invalid host' });
    }

    const entry = await getCache().get(host);
    if (!entry) {
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.status(404).end();
    }

    res.setHeader('Content-Type', entry.contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('X-Favicon-Status', entry.status);
    res.send(entry.buffer);
  });

  app.use('/api/favicon', router);
}

module.exports = { registerRoutes };
