/**
 * Basic Routes Module
 * Handles health check and static file serving
 */

const express = require('express');
const path = require('path');
const config = require('./config');
const BaseModule = require('../lib/BaseModule');
const { getClientIP } = require('../lib/authUtils');

// Client registry - replaces direct singleton manager imports
const registry = require('../lib/ClientRegistry');
const geoIPManager = require('./geoIPManager');

class BasicRoutes extends BaseModule {
  constructor() {
    super();
  }

  /**
   * Health check endpoint.
   * Returns server status and per-instance client connection status.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @returns {void} JSON response: { status: 'ok', clients: { [instanceId]: { type, connected } }, connections, geoip }
   */
  healthCheck(req, res) {
    // Build per-instance connection status
    const clients = {};
    registry.forEach((manager, instanceId) => {
      clients[instanceId] = {
        type: manager.clientType,
        connected: !!manager.isConnected()
      };
    });

    res.json({
      status: 'ok',
      clients,
      connections: this.wss.clients.size,
      geoip: {
        cityLoaded: !!geoIPManager.cityReader,
        countryLoaded: !!geoIPManager.countryReader
      }
    });
  }

  // Request logging middleware
  requestLogger(req, res, next) {
    const userAgent = req.get('User-Agent') || 'Unknown';
    const clientIp = getClientIP(req);
    const geoData = geoIPManager.getGeoIPData(clientIp);
    const locationInfo = geoIPManager.formatLocationInfo(geoData);

    // Every HTTP request — including page loads, static assets, and API
    // polls — fires this once. INFO is too loud for that cadence; promote
    // the log level back up to `debug` while still keeping the data shape
    // useful for offline grep when investigating a specific request.
    this.debug(`[HTTP] ${req.method} ${req.url} from ${clientIp}${locationInfo} (${userAgent})`);

    if (Object.keys(req.query).length > 0) {
      this.debug(`[HTTP] Query params: ${JSON.stringify(req.query)}`);
    }
    if (req.method === 'POST' && req.body && Object.keys(req.body).length > 0) {
      this.debug(`[HTTP] Body params: ${JSON.stringify(req.body)}`);
    }
    next();
  }

  // Register public routes (before authentication)
  registerPublicRoutes(app) {
    // Request logging middleware
    app.use((req, res, next) => this.requestLogger(req, res, next));

    // Serve static files with smart caching:
    // - Images: long cache (1 week)
    // - JS/CSS: no-cache but with ETag for validation
    // - HTML: no-cache
    const appRoot = config.getAppRoot();
    const staticOptions = {
      etag: true,
      lastModified: true,
      setHeaders: (res, filePath) => {
        const ext = path.extname(filePath).toLowerCase();
        // Images: cache for 1 week
        if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp'].includes(ext)) {
          res.setHeader('Cache-Control', 'public, max-age=604800'); // 1 week
        }
        // JS/CSS: validate with server on each request (ETag)
        else if (['.js', '.css', '.map'].includes(ext)) {
          res.setHeader('Cache-Control', 'no-cache');
        }
        // HTML and others: no cache
        else {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
      }
    };
    app.use(express.static(appRoot, staticOptions));
    app.use('/static', express.static(path.join(appRoot, 'static'), staticOptions));

    // Health check (public)
    app.get('/health', (req, res) => this.healthCheck(req, res));

    // Login page (public)
    app.get('/login', (req, res) => {
      res.sendFile(path.join(appRoot, 'static', 'index.html'));
    });
  }

  // Register protected routes (after authentication)
  registerRoutes(app) {
    const appRoot = config.getAppRoot();

    // Home page (protected)
    app.get('/', (req, res) => {
      res.sendFile(path.join(appRoot, 'static', 'index.html'));
    });
  }
}

module.exports = new BasicRoutes();