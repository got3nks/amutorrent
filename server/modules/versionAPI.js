/**
 * Version API Module
 * Provides version information endpoint
 */

const BaseModule = require('../lib/BaseModule');
const versionManager = require('../lib/versionManager');
const config = require('./config');

class VersionAPI extends BaseModule {
  constructor() {
    super();
  }

  /**
   * GET /api/version
   * Returns version info, changelog, and update status
   */
  async getVersionInfo(req, res) {
    try {
      const versionInfo = await versionManager.getVersionInfo();
      const lastSeenVersion = config.getLastSeenVersion();

      res.json({
        ...versionInfo,
        lastSeenVersion
      });
    } catch (err) {
      this.error('Error fetching version info:', err.message);
      res.status(500).json({
        error: 'Failed to fetch version info',
        version: versionManager.getVersion()
      });
    }
  }

  /**
   * POST /api/version/seen
   * Marks the current version as seen by the user
   */
  async markVersionSeen(req, res) {
    try {
      const currentVersion = versionManager.getVersion();
      await config.setLastSeenVersion(currentVersion);

      res.json({
        success: true,
        lastSeenVersion: currentVersion
      });
    } catch (err) {
      this.error('Error marking version as seen:', err.message);
      res.status(500).json({
        error: 'Failed to mark version as seen'
      });
    }
  }

  /**
   * Register routes
   * Note: GET /api/version is public (no auth required)
   * POST /api/version/seen should be registered after auth middleware
   */
  registerRoutes(app) {
    app.get('/api/version', (req, res) => this.getVersionInfo(req, res));
  }

  /**
   * Register protected routes (after auth middleware)
   */
  registerProtectedRoutes(app) {
    app.post('/api/version/seen', (req, res) => this.markVersionSeen(req, res));
  }
}

module.exports = new VersionAPI();
