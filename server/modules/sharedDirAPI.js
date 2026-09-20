/**
 * Shared Directory Management API
 *
 * Reads and writes aMule's shared-folder configuration over the EC protocol
 * (EC_OP_GET/SET_SHARED_DIRS, amule-org/amule#530).
 *
 * This replaces an earlier approach that wrote shareddir.dat on disk, which
 * needed filesystem access to aMule's config directory, a bind mount, a chmod
 * (aMule writes the file 0444) and a `find -type d` shell-out to expand
 * subdirectories. aMule now does the subtree expansion itself via a per-root
 * recursive flag, validates the paths, and persists them.
 *
 * The daemon advertises support as EC_TAG_CAN_SHAREDDIRS_CONFIG on its AUTH_OK
 * reply. Cores without it cannot be configured this way at all: the opcode
 * would fall through to the tail of aMule's ProcessRequest2, which hits wxFAIL
 * and aborts a debug build. So every route checks the capability first and the
 * client library refuses to send without it.
 */

const express = require('express');
const response = require('../lib/responseFormatter');
const logger = require('../lib/logger');
const { requireAdmin } = require('../middleware/capabilities');
const registry = require('../lib/ClientRegistry');

const CAPABILITY = 'EC_TAG_CAN_SHAREDDIRS_CONFIG';

class SharedDirAPI {

  /**
   * Resolve an instance to a connected aMule manager.
   * @param {string} instanceId
   * @returns {{manager: Object|null, error: string|null}}
   */
  _resolve(instanceId) {
    if (!instanceId) return { manager: null, error: 'instanceId is required' };
    const manager = registry.get(instanceId);
    if (!manager) return { manager: null, error: `Unknown instance "${instanceId}"` };
    if (manager.clientType !== 'amule') return { manager: null, error: 'Shared folders are an aMule feature' };
    if (!manager.isConnected()) return { manager: null, error: 'aMule is not connected' };
    return { manager, error: null };
  }

  /**
   * Whether this instance's daemon can be configured over EC.
   * @param {Object} manager
   * @returns {boolean}
   */
  _isSupported(manager) {
    return manager.client?.hasCapability?.(CAPABILITY) === true;
  }

  /**
   * Shape returned when the daemon is too old, so the UI can explain precisely
   * what is missing rather than saying "update aMule" and leaving the user to
   * guess. Deliberately not an error: nothing failed, the feature just is not
   * there.
   * @returns {Object}
   */
  _unsupportedPayload() {
    return {
      supported: false,
      capability: CAPABILITY,
      dirs: [],
      reason: 'This aMule build does not support configuring shared folders over the EC protocol.'
    };
  }

  /**
   * GET /api/amule/shared-dirs?instanceId=...
   * Current shared folders, or supported:false when the daemon predates #530.
   */
  async get(req, res) {
    const { manager, error } = this._resolve(req.query.instanceId);
    if (error) return response.badRequest(res, error);

    if (!this._isSupported(manager)) {
      return response.success(res, this._unsupportedPayload());
    }

    try {
      const dirs = await manager.getSharedDirs();
      return response.success(res, { supported: true, capability: CAPABILITY, dirs });
    } catch (err) {
      logger.error('[SharedDirs] Failed to read shared folders:', err.message);
      return response.serverError(res, `Failed to read shared folders: ${err.message}`);
    }
  }

  /**
   * PUT /api/amule/shared-dirs
   * Body: { instanceId, dirs: [{ path, recursive }] }
   *
   * Replaces the whole configuration - aMule has no add or remove operation,
   * so the caller sends the complete list every time.
   */
  async save(req, res) {
    const { instanceId, dirs } = req.body || {};
    const { manager, error } = this._resolve(instanceId);
    if (error) return response.badRequest(res, error);

    if (!this._isSupported(manager)) {
      return response.badRequest(res, this._unsupportedPayload().reason);
    }

    if (!Array.isArray(dirs)) {
      return response.badRequest(res, 'dirs must be an array');
    }
    // Sending [] is how aMule is told to share nothing, so it has to be an
    // explicit act rather than something a malformed request can trigger.
    if (dirs.length === 0 && req.body?.confirmUnshareAll !== true) {
      return response.badRequest(res,
        'Refusing to clear every shared folder; resend with confirmUnshareAll to unshare everything');
    }

    const normalized = [];
    for (const entry of dirs) {
      const path = typeof entry === 'string' ? entry : entry?.path;
      if (typeof path !== 'string' || path.trim() === '') {
        return response.badRequest(res, 'Every shared folder needs a non-empty path');
      }
      normalized.push({ path: path.trim(), recursive: entry?.recursive === true });
    }

    try {
      const result = await manager.setSharedDirs(normalized);
      const rejected = result?.rejected || [];
      // Partial application is normal: aMule applies every path that validated
      // and reports the others individually, so a non-empty `rejected` does not
      // mean the edit was discarded.
      const applied = normalized.length - rejected.length;
      logger.log(`📂 [SharedDirs] ${instanceId}: applied ${applied}/${normalized.length} folder(s)`
        + (rejected.length ? `, rejected ${rejected.length}` : ''));

      return response.success(res, {
        supported: true,
        applied,
        total: normalized.length,
        rejected,
        // aMule persists synchronously but defers the rescan to its next tick,
        // so the shared-file list will not reflect this immediately.
        rescanPending: true
      });
    } catch (err) {
      logger.error('[SharedDirs] Failed to save shared folders:', err.message);
      return response.serverError(res, `Failed to save shared folders: ${err.message}`);
    }
  }

  /**
   * POST /api/amule/shared-dirs/reload
   * Ask aMule to rescan its shared folders. Works on any core - this is the
   * long-standing reload, not part of #530.
   */
  async reload(req, res) {
    const { manager, error } = this._resolve(req.body?.instanceId);
    if (error) return response.badRequest(res, error);

    try {
      await manager.refreshSharedFiles();
      return response.success(res, { reloaded: true });
    } catch (err) {
      logger.error('[SharedDirs] Reload failed:', err.message);
      return response.serverError(res, `Reload failed: ${err.message}`);
    }
  }

  registerRoutes(app) {
    const router = express.Router();
    router.use(express.json());
    router.use(requireAdmin);

    router.get('/', this.get.bind(this));
    router.put('/', this.save.bind(this));
    router.post('/reload', this.reload.bind(this));

    app.use('/api/amule/shared-dirs', router);
    logger.log('📂 Shared Directory API routes registered');
  }
}

module.exports = new SharedDirAPI();
