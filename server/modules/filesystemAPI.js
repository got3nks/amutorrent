/**
 * Filesystem API Module
 * Provides directory browsing functionality for path selection
 */

const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const BaseModule = require('../lib/BaseModule');
const response = require('../lib/responseFormatter');

class FilesystemAPI extends BaseModule {
  constructor() {
    super();
    // Configurable excluded paths (system directories to hide)
    this.excludedPaths = [
      '/proc', '/sys', '/dev', '/run', '/boot',
      '/etc', '/var/run', '/var/lock',
      '/root', '/lost+found'
    ];
  }

  /**
   * POST /api/filesystem/browse
   * List directories in a given path
   * Body: { path: string }
   */
  async browse(req, res) {
    try {
      const { path: dirPath, includeFiles } = req.body;

      if (!dirPath || typeof dirPath !== 'string') {
        return response.badRequest(res, 'Path is required');
      }

      const normalizedPath = path.resolve(dirPath.trim());

      // Check if path is excluded
      if (this.excludedPaths.some(exc => normalizedPath === exc || normalizedPath.startsWith(exc + '/'))) {
        return response.forbidden(res, 'Access to this path is restricted');
      }

      // Check if path exists and is readable
      try {
        const stats = await fs.stat(normalizedPath);
        if (!stats.isDirectory()) {
          return response.badRequest(res, 'Path is not a directory');
        }
      } catch (err) {
        if (err.code === 'ENOENT') {
          return response.notFound(res, 'Directory not found');
        }
        if (err.code === 'EACCES') {
          return response.forbidden(res, 'Permission denied');
        }
        throw err;
      }

      // Read directory contents
      const entries = await fs.readdir(normalizedPath, { withFileTypes: true });

      // Filter to directories only, exclude hidden and system dirs
      const directories = entries
        .filter(entry => {
          if (!entry.isDirectory()) return false;
          if (entry.name.startsWith('.')) return false;
          const fullPath = path.join(normalizedPath, entry.name);
          return !this.excludedPaths.some(exc => fullPath === exc);
        })
        .map(entry => entry.name)
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

      // Optionally collect regular files
      let files;
      if (includeFiles) {
        files = entries
          .filter(entry => {
            if (!entry.isFile()) return false;
            if (entry.name.startsWith('.')) return false;
            return true;
          })
          .map(entry => entry.name)
          .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
      }

      // Get parent path (null if at root)
      const parentPath = normalizedPath === '/' ? null : path.dirname(normalizedPath);

      const result = {
        path: normalizedPath,
        parent: parentPath,
        directories
      };

      if (includeFiles) {
        result.files = files;
      }

      res.json(result);
    } catch (err) {
      this.log('❌ Error browsing directory:', err.message);
      response.serverError(res, 'Failed to browse directory');
    }
  }

  registerRoutes(app) {
    const router = express.Router();
    router.use(express.json());

    router.post('/browse', this.browse.bind(this));

    app.use('/api/filesystem', router);
    this.log('📂 Filesystem API routes registered');
  }
}

module.exports = new FilesystemAPI();
