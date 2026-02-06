/**
 * rtorrent API Module
 * Handles rtorrent-specific API routes
 */

const BaseModule = require('../lib/BaseModule');
const logger = require('../lib/logger');

// Singleton managers - imported directly instead of injected
const rtorrentManager = require('./rtorrentManager');

const log = logger.log.bind(logger);

class RtorrentAPI extends BaseModule {
  constructor() {
    super();
  }

  /**
   * Register API routes
   * @param {Express} app - Express application
   */
  registerRoutes(app) {
    // Get files for a torrent
    app.get('/api/rtorrent/files/:hash', async (req, res) => {
      try {
        const { hash } = req.params;

        if (!rtorrentManager || !rtorrentManager.isConnected()) {
          return res.status(503).json({ error: 'rtorrent not connected' });
        }

        const files = await rtorrentManager.getFiles(hash);
        res.json({ files });
      } catch (err) {
        log('Error fetching torrent files:', err.message);
        res.status(500).json({ error: err.message });
      }
    });
  }
}

module.exports = new RtorrentAPI();
