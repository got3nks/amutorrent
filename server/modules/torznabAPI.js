/**
 * Torznab API Module
 * Provides Torznab indexer API for aMule integration with *arr apps
 */

const express = require('express');
const BaseModule = require('../lib/BaseModule');
const { createTorznabHandler } = require('../lib/torznab');

class TorznabAPI extends BaseModule {
  constructor() {
    super();
    this.amuleManager = null;
    this.handler = null;
  }

  /**
   * Set aMule manager dependency
   */
  setAmuleManager(manager) {
    this.amuleManager = manager;
    // Create handler with amuleManager client getter
    this.handler = createTorznabHandler(() => this.amuleManager.getClient());
  }

  /**
   * GET /indexer/amule/api
   * Torznab API endpoint for *arr apps
   */
  handleRequest(req, res) {
    if (!this.handler) {
      return res.status(500).json({
        error: 'Torznab handler not initialized'
      });
    }

    this.handler(req, res);
  }

  /**
   * Register all Torznab API routes
   */
  registerRoutes(app) {
    // Torznab indexer API
    app.get('/indexer/amule/api', this.handleRequest.bind(this));

    if (this.log) {
      this.log('🔌 Torznab API routes registered');
    }
  }
}

module.exports = new TorznabAPI();
