/**
 * Path Utilities
 * Shared helpers for checking path existence and permissions
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const logger = require('./logger');

// Lazy-loaded to avoid circular dependency (CategoryManager -> configTester -> pathUtils)
let categoryManager = null;
const getCategoryManager = () => {
  if (!categoryManager) {
    categoryManager = require('./CategoryManager');
  }
  return categoryManager;
};

/**
 * Check path permissions result type
 * @typedef {Object} PathCheckResult
 * @property {boolean} exists - Whether the path exists
 * @property {boolean} readable - Whether the path is readable
 * @property {boolean} writable - Whether the path is writable
 * @property {boolean} isDirectory - Whether the path is a directory
 * @property {boolean} isFile - Whether the path is a file
 * @property {string|null} error - Error message if any
 * @property {string} errorCode - Error code ('ok', 'not_found', 'not_readable', 'not_writable', 'not_directory', 'error')
 */

/**
 * Check path existence and permissions
 * @param {string} targetPath - Path to check
 * @param {Object} options - Options
 * @param {boolean} options.requireRead - Require read permission (default: true)
 * @param {boolean} options.requireWrite - Require write permission (default: false)
 * @param {boolean} options.requireDirectory - Require path to be a directory (default: false)
 * @param {boolean} options.testWrite - Actually test write by creating a temp file (default: false)
 * @returns {Promise<PathCheckResult>}
 */
async function checkPathPermissions(targetPath, options = {}) {
  const {
    requireRead = true,
    requireWrite = false,
    requireDirectory = false,
    testWrite = false
  } = options;

  const result = {
    exists: false,
    readable: false,
    writable: false,
    isDirectory: false,
    isFile: false,
    error: null,
    errorCode: 'ok'
  };

  if (!targetPath) {
    result.error = 'No path provided';
    result.errorCode = 'no_path';
    return result;
  }

  try {
    const resolvedPath = path.resolve(targetPath);

    // Check if path exists and get stats
    try {
      const stats = await fs.stat(resolvedPath);
      result.exists = true;
      result.isDirectory = stats.isDirectory();
      result.isFile = stats.isFile();

      if (requireDirectory && !result.isDirectory) {
        result.error = 'Path exists but is not a directory';
        result.errorCode = 'not_directory';
        return result;
      }
    } catch (err) {
      if (err.code === 'ENOENT') {
        result.error = 'Path not found';
        result.errorCode = 'not_found';
      } else {
        result.error = `Cannot access path: ${err.message}`;
        result.errorCode = 'error';
      }
      return result;
    }

    // Check read permission
    if (requireRead) {
      try {
        await fs.access(resolvedPath, fsSync.constants.R_OK);
        result.readable = true;
      } catch (err) {
        result.error = 'Path is not readable';
        result.errorCode = 'not_readable';
        return result;
      }
    }

    // Check write permission
    if (requireWrite) {
      try {
        await fs.access(resolvedPath, fsSync.constants.W_OK);
        result.writable = true;

        // Optionally test actual write capability
        if (testWrite && result.isDirectory) {
          const testFileName = `.test-write-${Date.now()}`;
          const testFilePath = path.join(resolvedPath, testFileName);
          try {
            await fs.writeFile(testFilePath, 'test', 'utf8');
            await fs.unlink(testFilePath);
          } catch (writeErr) {
            result.writable = false;
            const stats = await fs.stat(resolvedPath);
            const mode = '0' + (stats.mode & 0o777).toString(8);
            result.error = `Write test failed: ${writeErr.code || writeErr.message} (uid=${process.getuid()}, gid=${process.getgid()}, dir owned by ${stats.uid}:${stats.gid}, mode=${mode})`;
            result.errorCode = 'not_writable';
            return result;
          }
        }
      } catch (err) {
        // fs.access(W_OK) failed - get stat details for diagnostics
        try {
          const stats = await fs.stat(resolvedPath);
          const mode = '0' + (stats.mode & 0o777).toString(8);
          result.error = `Not writable: ${err.code || err.message} (uid=${process.getuid()}, gid=${process.getgid()}, dir owned by ${stats.uid}:${stats.gid}, mode=${mode})`;
        } catch {
          result.error = `Not writable: ${err.code || err.message}`;
        }
        result.errorCode = 'not_writable';
        return result;
      }
    }

    return result;
  } catch (err) {
    result.error = `Error checking path: ${err.message}`;
    result.errorCode = 'error';
    return result;
  }
}

/**
 * Check if a path exists and is accessible for reading
 * @param {string} targetPath - Path to check
 * @returns {Promise<PathCheckResult>}
 */
async function checkPathReadable(targetPath) {
  return checkPathPermissions(targetPath, { requireRead: true, requireWrite: false });
}

/**
 * Check if a path exists and is accessible for reading and writing
 * @param {string} targetPath - Path to check
 * @returns {Promise<PathCheckResult>}
 */
async function checkPathWritable(targetPath) {
  return checkPathPermissions(targetPath, { requireRead: true, requireWrite: true });
}

/**
 * Check if a directory exists and is accessible for reading and writing
 * @param {string} targetPath - Path to check
 * @param {boolean} testWrite - Actually test write capability (default: false)
 * @returns {Promise<PathCheckResult>}
 */
async function checkDirectoryAccess(targetPath, testWrite = false) {
  return checkPathPermissions(targetPath, {
    requireRead: true,
    requireWrite: true,
    requireDirectory: true,
    testWrite
  });
}

/**
 * Resolve the file/directory path for an item (download or shared file)
 * Handles aMule, rTorrent, and qBittorrent items, single and multi-file
 * @param {Object} item - Cached item from dataFetchService
 * @returns {Object|null} Path info or null if path cannot be resolved
 * @returns {string} .localPath - Translated path (what app sees)
 * @returns {string} .remotePath - Original path (what client sees)
 * @returns {string} .clientType - Client type ('amule', 'rtorrent', or 'qbittorrent')
 * @returns {boolean} .isMultiFile - Whether this is a multi-file item
 * @returns {string} .baseDir - The directory portion (for destination comparison)
 */
function resolveItemPath(item) {
  if (!item || !item.name) {
    logger.debug(`[📦 resolveItemPath] no item or name provided`);
    return null;
  }

  const clientType = item.client || 'amule';
  const isAmuleShared = clientType === 'amule' && item.shared && !item.downloading;

  // Get base directory - aMule shared files use filePath, others use directory
  const baseDir = isAmuleShared ? item.filePath : item.directory;

  if (!baseDir) {
    logger.debug(`[📦 resolveItemPath] no baseDir for ${item.name} (${clientType})`);
    return null;
  }

  // For single files, join with filename
  // aMule is always single file, rTorrent/qBittorrent depend on multiFile flag
  const isMultiFile = (clientType === 'rtorrent' || clientType === 'qbittorrent') && item.multiFile;
  const remotePath = isMultiFile ? baseDir : path.join(baseDir, item.name);

  // Translate path using category mappings
  const localPath = getCategoryManager().translatePath(remotePath, clientType);

  logger.log(`[📦 resolveItemPath] ${clientType} "${item.name}" -> local: ${localPath}, remote: ${remotePath}`);

  return {
    localPath,      // Translated path (what app sees)
    remotePath,     // Original path (what client sees)
    clientType,
    isMultiFile,
    baseDir         // The directory portion (for destination comparison)
  };
}

/**
 * Resolve destination paths for a category and client type
 * Handles path mappings, Default category fallback, and client defaults
 * @param {Object} category - Target category object
 * @param {string} clientType - Client type ('amule', 'rtorrent', or 'qbittorrent')
 * @returns {Object} Destination paths
 * @returns {string|null} .localPath - Local path (what app sees)
 * @returns {string|null} .remotePath - Remote path (what client sees)
 */
function resolveCategoryDestPaths(category, clientType) {
  const categoryName = category?.name || category?.title || 'unknown';

  // In Docker: pathMappings[clientType] = local path (app sees), path = remote path (client sees)
  // Native: no pathMappings, path is used by both app and client
  // If category has no path, clients use Default category's path
  let localPath = category?.pathMappings?.[clientType] || category?.path || null;
  let remotePath = category?.path || null;
  let usedFallback = false;

  // Fall back to Default category for missing paths (check each independently)
  if (!localPath || !remotePath) {
    const defaultCat = getCategoryManager().getByName('Default');
    const clientDefaults = getCategoryManager().getClientDefaultPaths();
    if (defaultCat) {
      if (!localPath) {
        localPath = defaultCat.pathMappings?.[clientType] || clientDefaults?.[clientType] || null;
        usedFallback = true;
      }
      if (!remotePath) {
        // Default category's path is null - use client's reported default directory
        remotePath = defaultCat.path || clientDefaults?.[clientType] || null;
        usedFallback = true;
      }
    }
  }
  // Final fallback if remote path is still missing (native setup without Default)
  remotePath = remotePath || localPath;

  logger.log(`[📦 resolveCategoryDestPaths]: category "${categoryName}" (${clientType})${usedFallback ? ' [fallback]' : ''} -> local: ${localPath}, remote: ${remotePath}`);

  return { localPath, remotePath };
}

module.exports = {
  checkPathPermissions,
  checkPathReadable,
  checkPathWritable,
  checkDirectoryAccess,
  resolveItemPath,
  resolveCategoryDestPaths
};
