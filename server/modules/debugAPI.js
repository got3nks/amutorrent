/**
 * Debug API Module
 * Provides memory diagnostics and heap snapshot endpoints.
 * Only registered when NODE_INSPECT=true environment variable is set.
 */

const v8 = require('v8');
const fs = require('fs');
const path = require('path');
const express = require('express');
const BaseModule = require('../lib/BaseModule');
const { requireAdmin } = require('../middleware/capabilities');

class DebugAPI extends BaseModule {
  /**
   * GET /api/debug/memory
   * Returns process memory usage summary
   */
  getMemory(_req, res) {
    const mem = process.memoryUsage();
    const format = (bytes) => (bytes / 1024 / 1024).toFixed(1) + ' MB';
    res.json({
      rss: format(mem.rss),
      heapUsed: format(mem.heapUsed),
      heapTotal: format(mem.heapTotal),
      external: format(mem.external),
      arrayBuffers: format(mem.arrayBuffers),
    });
  }

  /**
   * GET /api/debug/heapsnapshot
   * Writes a V8 heap snapshot and returns it as a downloadable file
   */
  getHeapSnapshot(_req, res) {
    const filename = `heap-${Date.now()}.heapsnapshot`;
    const filepath = path.join('/tmp', filename);

    try {
      v8.writeHeapSnapshot(filepath);
      res.download(filepath, filename, () => {
        // Clean up temp file after download
        fs.unlink(filepath, () => {});
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to create heap snapshot: ' + err.message });
    }
  }

  registerRoutes(app) {
    const router = express.Router();
    router.use(requireAdmin);
    router.get('/memory', this.getMemory.bind(this));
    router.get('/heapsnapshot', this.getHeapSnapshot.bind(this));
    app.use('/api/debug', router);
    this.log('🔍 Debug API enabled (NODE_INSPECT=true)');
  }
}

module.exports = new DebugAPI();
