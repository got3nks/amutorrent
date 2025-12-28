/**
 * Basic Routes Module
 * Handles health check and static file serving
 */

const express = require('express');
const path = require('path');
const config = require('./config');
const BaseModule = require('../lib/BaseModule');

class BasicRoutes extends BaseModule {
  constructor() {
    super();
  }

  // Health check endpoint
  healthCheck(req, res) {
    res.json({
      status: 'ok',
      amuleConnected: !!this.amuleManager?.isConnected(),
      connections: this.wss.clients.size,
      geoip: {
        cityLoaded: !!this.geoIPManager.cityReader,
        countryLoaded: !!this.geoIPManager.countryReader
      }
    });
  }

  // Request logging middleware
  requestLogger(req, res, next) {
    const timestamp = new Date().toISOString();
    const userAgent = req.get('User-Agent') || 'Unknown';
    const clientIp = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    const geoData = this.geoIPManager.getGeoIPData(clientIp);
    const locationInfo = this.geoIPManager.formatLocationInfo(geoData);

    this.log(`[HTTP] ${req.method} ${req.url} from ${clientIp}${locationInfo} (${userAgent})`);

    if (Object.keys(req.query).length > 0) {
      this.log(`[HTTP] Query params: ${JSON.stringify(req.query)}`);
    }
    if (req.method === 'POST' && req.body && Object.keys(req.body).length > 0) {
      this.log(`[HTTP] Body params: ${JSON.stringify(req.body)}`);
    }
    next();
  }

  // Register all basic routes
  registerRoutes(app) {
    // Request logging middleware
    app.use((req, res, next) => this.requestLogger(req, res, next));

    // Serve static files
    const appRoot = config.getAppRoot();
    app.use(express.static(appRoot));
    app.use('/static', express.static(path.join(appRoot, 'static')));
    app.get('/', (req, res) => res.sendFile(path.join(appRoot, 'static', 'index.html')));

    // Health check
    app.get('/health', (req, res) => this.healthCheck(req, res));
  }
}

module.exports = new BasicRoutes();