/**
 * Shared Directory Management API (Experimental)
 *
 * Manages aMule's shareddir.dat file — the list of directories aMule shares.
 * Provides CRUD for root directories with automatic subdirectory expansion.
 */

const express = require('express');
const fs = require('fs').promises;
const { execFile } = require('child_process');
const response = require('../lib/responseFormatter');
const logger = require('../lib/logger');
const { requireAdmin } = require('../middleware/capabilities');
const config = require('./config');
const registry = require('../lib/ClientRegistry');

class SharedDirAPI {

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Get the sharedDirDatPath for an aMule instance.
   * @param {string} instanceId
   * @returns {{ path: string|null, manager: Object|null }}
   */
  _resolve(instanceId) {
    if (!instanceId) return { path: null, manager: null, roots: [] };
    const mgr = registry.get(instanceId);
    if (!mgr) return { path: null, manager: null, roots: [] };
    const clientConfig = config.getClientConfig(instanceId);
    return {
      path: clientConfig?.sharedDirDatPath || null,
      manager: mgr,
      roots: Array.isArray(clientConfig?.sharedDirRoots) ? clientConfig.sharedDirRoots : []
    };
  }

  /**
   * Persist sharedDirRoots to config.json for an instance.
   */
  async _saveRoots(instanceId, roots) {
    const clientConfigs = config.getClientConfigs();
    const entry = clientConfigs.find(c => c.id === instanceId);
    if (entry) entry.sharedDirRoots = roots;
    if (Array.isArray(config.runtimeConfig.clients)) {
      const runtimeEntry = config.runtimeConfig.clients.find(c => c.id === instanceId);
      if (runtimeEntry) runtimeEntry.sharedDirRoots = roots;
    }
    await config._persistRuntimeConfig(`📂 Saved ${roots.length} shared dir root(s) for ${instanceId}`);
  }

  /**
   * Expand roots to full directory list, write to shareddir.dat, and reload aMule.
   * Used by save endpoint, rescan, periodic reload, and onConnect sync.
   * @param {string} datPath - Path to shareddir.dat
   * @param {string[]} roots - Root directories (from config)
   * @param {Object} [manager] - aMule manager (for reload)
   * @returns {Promise<{totalDirs: number, added: number, removed: number, inaccessibleRoots: string[]}>}
   */
  async expandAndWrite(datPath, roots, manager) {
    // Read existing file for diff + preserving inaccessible paths
    let existingRaw = [];
    try {
      const content = await fs.readFile(datPath, 'utf-8');
      existingRaw = this._parseLines(content);
    } catch {}

    const allDirs = new Set();
    const inaccessibleRoots = [];
    for (const dir of roots) {
      try {
        const subdirs = await this._findSubdirs(dir);
        subdirs.forEach(d => allDirs.add(d));
      } catch {
        inaccessibleRoots.push(dir);
      }
    }

    // Preserve original paths under inaccessible roots
    for (const root of inaccessibleRoots) {
      for (const p of existingRaw) {
        if (p === root || p.startsWith(root + '/')) {
          allDirs.add(p);
        }
      }
    }

    const sorted = [...allDirs].sort();
    const added = sorted.filter(d => !existingRaw.includes(d)).length;
    const removed = existingRaw.filter(d => !allDirs.has(d)).length;

    if (sorted.length > 0 && (added > 0 || removed > 0 || existingRaw.length === 0)) {
      try {
        await this._writeFile(datPath, sorted.join('\n') + '\n');
        logger.log(`📂 shareddir.dat updated: ${roots.length} root(s), ${sorted.length} total (${added} added, ${removed} removed)`);
      } catch (err) {
        logger.warn(`⚠️  Failed to write shareddir.dat: ${err.message}`);
        throw err;
      }
    }

    // Reload aMule
    if (manager) {
      try {
        await manager.refreshSharedFiles();
      } catch (err) {
        logger.warn(`⚠️  Shared files reload failed: ${err.message}`);
      }
    }

    return { totalDirs: sorted.length, added, removed, inaccessibleRoots };
  }

  /**
   * Parse shareddir.dat contents into an array of paths.
   * @param {string} content - File contents
   * @returns {string[]} Non-empty trimmed lines
   */
  _parseLines(content) {
    return content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  }

  /**
   * Compute root directories from a full list of paths.
   * Roots are paths that are not subdirectories of any other path in the list.
   * @param {string[]} paths - Sorted array of paths
   * @returns {string[]} Root directories only
   */
  _computeRoots(paths) {
    const sorted = [...paths].sort();
    const roots = [];
    let lastRoot = null;
    for (const p of sorted) {
      if (!lastRoot || !p.startsWith(lastRoot + '/')) {
        roots.push(p);
        lastRoot = p;
      }
    }
    return roots;
  }

  /**
   * Run `find <dir> -type d` to enumerate all subdirectories.
   * @param {string} dir - Root directory
   * @returns {Promise<string[]>} All directories (including root)
   */
  _findSubdirs(dir) {
    return new Promise((resolve, reject) => {
      execFile('find', [dir, '-type', 'd'], { timeout: 30000 }, (err, stdout) => {
        if (err) {
          reject(new Error(`Failed to scan ${dir}: ${err.message}`));
          return;
        }
        const dirs = stdout.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        resolve(dirs);
      });
    });
  }

  /**
   * Check if a file exists.
   * @param {string} filePath
   * @returns {Promise<boolean>}
   */
  async _fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if the current process can chmod a file (same UID as file owner).
   * aMule sets shareddir.dat to 444 — chmod is the only way to write it.
   * @param {string} filePath
   * @returns {Promise<boolean>}
   */
  async _canWrite(filePath) {
    try {
      const stat = await fs.stat(filePath);
      // File is already writable by owner
      if (stat.mode & 0o200) return true;
      // File is read-only — can we chmod it? Only if we own it.
      return process.getuid() === stat.uid;
    } catch {
      return false;
    }
  }

  /**
   * Write file content, handling aMule's read-only shareddir.dat (444 perms).
   * aMule sets shareddir.dat to read-only — both containers must run with the
   * same UID so we can chmod before writing.
   */
  async _writeFile(filePath, content) {
    try {
      await fs.writeFile(filePath, content, 'utf-8');
      return;
    } catch (err) {
      if (err.code !== 'EACCES') throw err;
    }
    // File is read-only (aMule sets 444) — chmod writable, write, restore
    try {
      logger.log(`📂 File is read-only, attempting chmod on ${filePath}...`);
      await fs.chmod(filePath, 0o644);
      await fs.writeFile(filePath, content, 'utf-8');
      logger.log(`📂 Write successful after chmod`);
    } catch (err) {
      logger.error(`❌ chmod+write failed: ${err.code} ${err.message}`);
      throw new Error(`Permission denied (${err.code}). aMule sets shareddir.dat to read-only — both containers must use the same UID (e.g. PUID=1000).`);
    }
  }

  /**
   * Rescan and rewrite shareddir.dat using roots from config.
   * Called by amuleManager during periodic auto-reload and onConnect sync.
   * @param {string} instanceId - aMule instance ID
   * @returns {Promise<{added: number, removed: number}>}
   */
  async rescanAndWrite(instanceId) {
    const { path: datPath, manager, roots } = this._resolve(instanceId);
    if (!datPath || roots.length === 0) return { added: 0, removed: 0 };

    try {
      const result = await this.expandAndWrite(datPath, roots, manager);
      return { added: result.added, removed: result.removed };
    } catch {
      return { added: 0, removed: 0 };
    }
  }

  // ---------------------------------------------------------------------------
  // Endpoints
  // ---------------------------------------------------------------------------

  /**
   * GET /api/amule/shared-dirs?instanceId=...
   * Read current shared directories.
   */
  async get(req, res) {
    try {
      const { instanceId } = req.query;
      const { path: datPath, manager, roots: configRoots } = this._resolve(instanceId);

      if (!manager) {
        return response.notFound(res, 'aMule instance not found');
      }

      if (!datPath) {
        return res.json({ configured: false, path: null, isDocker: config.isDocker });
      }

      const exists = await this._fileExists(datPath);
      const canWrite = exists ? await this._canWrite(datPath) : false;

      // Config roots are authoritative (survive aMule reboots)
      // Also check the dat file for any extra roots not in config (added by aMule directly)
      let datRoots = [];
      if (exists) {
        try {
          const content = await fs.readFile(datPath, 'utf-8');
          const raw = this._parseLines(content);
          datRoots = this._computeRoots(raw);
        } catch {}
      }

      // Merge: config roots + any dat-only roots (not under a config root)
      const roots = [...configRoots];
      for (const dr of datRoots) {
        const coveredByConfig = configRoots.some(cr => dr === cr || dr.startsWith(cr + '/'));
        if (!coveredByConfig) roots.push(dr);
      }
      roots.sort();

      // Check which roots are accessible from this container
      const inaccessibleRoots = [];
      for (const root of roots) {
        try {
          await fs.access(root);
        } catch {
          inaccessibleRoots.push(root);
        }
      }

      res.json({ configured: true, path: datPath, exists, canWrite, roots, inaccessibleRoots, isDocker: config.isDocker });
    } catch (err) {
      logger.error('❌ Error reading shared dirs:', err.message);
      response.serverError(res, 'Failed to read shared directories');
    }
  }

  /**
   * PUT /api/amule/shared-dirs?instanceId=...
   * Save shared directories (auto-expands subdirectories).
   * Body: { directories: string[] }
   */
  async save(req, res) {
    try {
      const { instanceId } = req.query;
      const { directories } = req.body;
      const { path: datPath, manager } = this._resolve(instanceId);

      if (!manager) {
        return response.notFound(res, 'aMule instance not found');
      }
      if (!datPath) {
        return response.badRequest(res, 'sharedDirDatPath not configured for this instance');
      }
      if (!Array.isArray(directories) || directories.length === 0) {
        return response.badRequest(res, 'directories array is required');
      }

      // Persist roots to config.json (survives aMule reboots)
      await this._saveRoots(instanceId, directories);

      // Expand and write to shareddir.dat
      try {
        const result = await this.expandAndWrite(datPath, directories, manager);
        const resp = { success: true, roots: directories.length, totalDirs: result.totalDirs };
        if (result.inaccessibleRoots.length > 0) {
          resp.warnings = result.inaccessibleRoots.map(r => `Cannot scan ${r}`);
        }
        res.json(resp);
      } catch (err) {
        return response.forbidden(res, `Cannot write to shareddir.dat: ${err.message}`);
      }
    } catch (err) {
      logger.error('❌ Error saving shared dirs:', err.message);
      response.serverError(res, 'Failed to save shared directories');
    }
  }

  /**
   * POST /api/amule/shared-dirs/reload?instanceId=...
   * Rescan subdirectories for existing roots and reload aMule.
   */
  async reload(req, res) {
    try {
      const { instanceId } = req.query;
      const { path: datPath, manager, roots } = this._resolve(instanceId);

      if (!manager) {
        return response.notFound(res, 'aMule instance not found');
      }

      if (!datPath || roots.length === 0) {
        // No shareddir.dat or no saved roots — just do a plain reload
        try {
          await manager.refreshSharedFiles();
          return res.json({ success: true, message: 'Shared files reloaded' });
        } catch (err) {
          return response.serverError(res, `Reload failed: ${err.message}`);
        }
      }

      try {
        const result = await this.expandAndWrite(datPath, roots, manager);
        let msg = 'Shared files reloaded.';
        if (result.added > 0 || result.removed > 0) {
          const parts = [];
          if (result.added > 0) parts.push(`${result.added} new`);
          if (result.removed > 0) parts.push(`${result.removed} removed`);
          msg = `Rescanned: ${parts.join(', ')} subdirector${result.added + result.removed === 1 ? 'y' : 'ies'}. Total: ${result.totalDirs} dirs.`;
        }
        const resp = { success: true, roots: roots.length, totalDirs: result.totalDirs, added: result.added, removed: result.removed, message: msg };
        if (result.inaccessibleRoots.length > 0) {
          resp.warnings = result.inaccessibleRoots.map(r => `Cannot scan ${r}`);
        }
        res.json(resp);
      } catch (err) {
        return response.forbidden(res, `Cannot write to shareddir.dat: ${err.message}`);
      }
    } catch (err) {
      logger.error('❌ Error reloading shared dirs:', err.message);
      response.serverError(res, 'Failed to rescan shared directories');
    }
  }

  /**
   * PUT /api/amule/shared-dirs/config?instanceId=...
   * Save the sharedDirDatPath for an aMule instance.
   * Body: { sharedDirDatPath: string }
   */
  async saveConfig(req, res) {
    try {
      const { instanceId } = req.query;
      const { sharedDirDatPath } = req.body;

      if (!instanceId) {
        return response.badRequest(res, 'instanceId is required');
      }

      const mgr = registry.get(instanceId);
      if (!mgr) {
        return response.notFound(res, 'aMule instance not found');
      }

      const trimmedPath = (sharedDirDatPath || '').trim();

      // Empty path = clear the config
      if (!trimmedPath) {
        const clientConfigs = config.getClientConfigs();
        const clientEntry = clientConfigs.find(c => c.id === instanceId);
        if (clientEntry) {
          delete clientEntry.sharedDirDatPath;
          delete clientEntry.sharedDirRoots;
        }
        if (Array.isArray(config.runtimeConfig.clients)) {
          const runtimeEntry = config.runtimeConfig.clients.find(c => c.id === instanceId);
          if (runtimeEntry) {
            delete runtimeEntry.sharedDirDatPath;
            delete runtimeEntry.sharedDirRoots;
          }
        }
        await config._persistRuntimeConfig(`📂 Cleared sharedDirDatPath and roots for ${instanceId}`);
        return res.json({ success: true, path: null, exists: false });
      }

      // Validate file exists and is accessible
      try {
        await fs.access(trimmedPath);
      } catch (err) {
        if (err.code === 'ENOENT') {
          return response.badRequest(res, `File not found: ${trimmedPath}`);
        }
        return response.badRequest(res, `Cannot access file: ${err.message}`);
      }

      // Update the client config in runtime + persist
      const clientConfigs = config.getClientConfigs();
      const clientEntry = clientConfigs.find(c => c.id === instanceId);
      if (!clientEntry) {
        return response.notFound(res, 'Client config not found');
      }

      clientEntry.sharedDirDatPath = trimmedPath;

      // Also update the runtime config clients array
      if (Array.isArray(config.runtimeConfig.clients)) {
        const runtimeEntry = config.runtimeConfig.clients.find(c => c.id === instanceId);
        if (runtimeEntry) {
          runtimeEntry.sharedDirDatPath = trimmedPath;
        }
      }

      // Persist to config.json
      await config._persistRuntimeConfig(`📂 Saved sharedDirDatPath for ${instanceId}: ${trimmedPath}`);

      const exists = await this._fileExists(trimmedPath);
      res.json({ success: true, path: trimmedPath, exists });
    } catch (err) {
      logger.error('❌ Error saving shared dir config:', err.message);
      response.serverError(res, 'Failed to save configuration');
    }
  }

  // ---------------------------------------------------------------------------
  // Route registration
  // ---------------------------------------------------------------------------

  registerRoutes(app) {
    const router = express.Router();
    router.use(express.json());
    router.use(requireAdmin);

    router.get('/', this.get.bind(this));
    router.put('/', this.save.bind(this));
    router.post('/reload', this.reload.bind(this));
    router.put('/config', this.saveConfig.bind(this));

    app.use('/api/amule/shared-dirs', router);
    logger.log('📂 Shared Directory API routes registered');
  }
}

module.exports = new SharedDirAPI();
