/**
 * QBittorrentHandler - qBittorrent WebUI API v2 implementation
 *
 * Provides Sonarr/Radarr compatible endpoints by translating
 * qBittorrent API calls to aMule operations.
 *
 * Consolidates auth, torrents, and categories handling into a single class.
 */

const logger = require('../logger');
const response = require('../responseFormatter');
const { minutesToMs } = require('../timeRange');
const { verifyPassword } = require('../authUtils');
const { convertToQBittorrentInfo } = require('./stateMapping');
const { convertMagnetToEd2k } = require('../linkConverter');
const { itemKey } = require('../itemKey');
const preferences = require('./preferences.json');

class QBittorrentHandler {
  constructor() {
    // Dependencies (set via setDependencies)
    this.getAmuleClient = null;
    this.getAmuleInstanceId = null;
    this.hashStore = null;
    this.config = null;
    this.isFirstRun = async () => false;

    // Category cache state
    this.categoriesCache = [];
    this.categorySyncInProgress = null;
    this.categoryCacheInitialized = false;
    this.categoryInitPromise = null;

    // Bind methods to preserve 'this' context in route handlers
    this.login = this.login.bind(this);
    this.logout = this.logout.bind(this);
    this.getVersion = this.getVersion.bind(this);
    this.getWebApiVersion = this.getWebApiVersion.bind(this);
    this.getPreferences = this.getPreferences.bind(this);
    this.getTorrentsInfo = this.getTorrentsInfo.bind(this);
    this.addTorrent = this.addTorrent.bind(this);
    this.deleteTorrent = this.deleteTorrent.bind(this);
    this.pauseTorrent = this.pauseTorrent.bind(this);
    this.resumeTorrent = this.resumeTorrent.bind(this);
    this.getCategories = this.getCategories.bind(this);
    this.createCategory = this.createCategory.bind(this);
  }

  /**
   * Set all dependencies at once
   */
  setDependencies({ getAmuleClient, getAmuleInstanceId, hashStore, config, registry, isFirstRun, userManager }) {
    this.getAmuleClient = getAmuleClient;
    this.getAmuleInstanceId = getAmuleInstanceId;
    this.hashStore = hashStore;
    this.config = config;
    this.registry = registry;
    this.userManager = userManager;
    if (isFirstRun) this.isFirstRun = isFirstRun;

    // Start category initialization and periodic refresh
    this.initCategories();
  }

  // ============================================================================
  // APP INFO ENDPOINTS
  // ============================================================================

  getVersion(req, res) {
    res.send('v5.1.4');
  }

  getWebApiVersion(req, res) {
    res.send('2.11.4');
  }

  getPreferences(req, res) {
    res.json(preferences);
  }

  // ============================================================================
  // AUTH ENDPOINTS
  // ============================================================================

  /**
   * POST /api/v2/auth/login
   * Verifies credentials against users.db (username + password or API key)
   */
  async login(req, res) {
    const authEnabled = this.config.getAuthEnabled();

    if (!authEnabled) {
      return res.send('Ok.');
    }

    const { username, password } = req.body;

    if (!password) {
      logger.warn('[qBittorrent] Login failed: no password provided');
      return res.send('Fails.');
    }

    try {
      if (!this.userManager) {
        logger.error('[qBittorrent] Login failed: userManager not available');
        return res.send('Fails.');
      }

      // Try username + password login
      if (username) {
        const user = this.userManager.getUserByUsername(username);
        if (user && !user.disabled && user.is_admin && user.password_hash) {
          const isValid = await verifyPassword(password, user.password_hash);
          if (isValid) {
            logger.log(`[qBittorrent] Login OK: user "${username}" via password`);
            return res.send('Ok.');
          }
        }
      }

      // Try API key as password
      const user = this.userManager.getUserByApiKey(password);
      if (user && !user.disabled && user.is_admin) {
        if (username && user.username !== username) {
          logger.warn(`[qBittorrent] Login failed: API key belongs to "${user.username}", not "${username}"`);
          return res.send('Fails.');
        }
        logger.log(`[qBittorrent] Login OK: user "${user.username}" via API key`);
        return res.send('Ok.');
      }

      logger.warn(`[qBittorrent] Login failed: invalid credentials for "${username || 'unknown'}"`);
      res.send('Fails.');
    } catch (err) {
      logger.error('[qBittorrent] Auth error:', err);
      res.send('Fails.');
    }
  }

  /**
   * POST /api/v2/auth/logout
   */
  logout(req, res) {
    res.send('Ok.');
  }

  // ============================================================================
  // CATEGORY MANAGEMENT
  // ============================================================================

  /**
   * Initialize categories on startup
   * Initial sync is triggered by amuleManager.onConnect callback (see server.js)
   */
  initCategories() {
    if (this.registry && this.registry.getByType('amule').length === 0) {
      // aMule not configured: mark as initialized (no categories to load)
      this.categoryCacheInitialized = true;
    }

    // Periodic refresh (every 5 minutes)
    setInterval(() => {
      if (this.registry && this.registry.getByType('amule').length === 0) return;
      this.syncCategories().catch(err => {
        logger.error('[qBittorrent] Failed to refresh category mappings:', err);
      });
    }, minutesToMs(5));
  }

  /**
   * Sync category mappings from aMule
   */
  async syncCategories() {
    if (this.categorySyncInProgress) {
      await this.categorySyncInProgress;
      return;
    }

    const amuleClient = this.getAmuleClient?.();
    if (!amuleClient) return;

    this.categorySyncInProgress = (async () => {
      try {
        this.categoriesCache = await amuleClient.getCategories();

        if (!this.categoryCacheInitialized) {
          this.categoryCacheInitialized = true;
          if (this.categoryInitPromise) {
            this.categoryInitPromise.resolve();
          }
        }
      } catch (error) {
        logger.error('[qBittorrent] Failed to sync category mappings:', error);
      } finally {
        this.categorySyncInProgress = null;
      }
    })();

    await this.categorySyncInProgress;
  }

  /**
   * Wait for categories to be initialized
   * Resolved by syncCategories() when called from amuleManager.onConnect callback
   */
  async waitForCategoryInit() {
    const firstRun = await this.isFirstRun();
    if (firstRun) return;

    if (this.categoryCacheInitialized) return;

    if (!this.categoryInitPromise) {
      let resolve;
      const promise = new Promise(r => { resolve = r; });
      this.categoryInitPromise = { promise, resolve };

      // Safety timeout: don't block requests forever if aMule never connects
      setTimeout(() => {
        if (!this.categoryCacheInitialized) {
          logger.warn('[qBittorrent] Category initialization timeout, aMule may not be available');
          this.categoryCacheInitialized = true;
          this.categoryInitPromise.resolve();
        }
      }, 60000);
    }

    await this.categoryInitPromise.promise;
  }

  /**
   * Get category by property (id, title, or path)
   */
  async getCategoryBy(property, value) {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    await this.waitForCategoryInit();
    return this.categoriesCache.find(cat => cat[property] === value) || null;
  }

  async getCategoryById(categoryId) {
    return this.getCategoryBy('id', categoryId);
  }

  async getCategoryByName(categoryName) {
    return this.getCategoryBy('title', categoryName);
  }

  async getCategoryByPath(categoryPath) {
    return this.getCategoryBy('path', categoryPath);
  }

  /**
   * GET /api/v2/torrents/categories
   */
  async getCategories(req, res) {
    try {
      const amuleClient = this.getAmuleClient?.();
      if (!amuleClient) {
        return response.serviceUnavailable(res, 'aMule not connected');
      }

      await this.syncCategories();

      const qbCategories = {};
      this.categoriesCache.forEach(cat => {
        qbCategories[cat.title] = {
          name: cat.title,
          savePath: cat.path
        };
      });

      res.json(qbCategories);
    } catch (error) {
      logger.error('[qBittorrent] Get categories error:', error);
      return response.serverError(res, 'Failed to get categories');
    }
  }

  /**
   * POST /api/v2/torrents/createCategory
   */
  async createCategory(req, res) {
    try {
      const { category, savePath } = req.body;

      if (!category) {
        return response.badRequest(res, 'Missing category parameter');
      }

      const amuleClient = this.getAmuleClient?.();
      if (!amuleClient) {
        return response.serviceUnavailable(res, 'aMule not connected');
      }

      const result = await amuleClient.createCategory(
        category,
        savePath || '',
        '',
        0,
        0
      );

      if (result.success && result.categoryId !== null) {
        await this.syncCategories();
        logger.log(`[qBittorrent] Category created: ${category} (ID: ${result.categoryId}) -> ${savePath || 'default path'}`);
        res.send('Ok.');
      } else {
        logger.error(`[qBittorrent] Failed to create category: ${category}`);
        return response.serverError(res, 'Failed to create category');
      }
    } catch (error) {
      logger.error('[qBittorrent] Create category error:', error);
      return response.serverError(res, 'Failed to create category');
    }
  }

  // ============================================================================
  // TORRENT MANAGEMENT
  // ============================================================================

  /**
   * Extract file name from magnet link
   */
  extractFileName(magnetLink) {
    const match = magnetLink.match(/dn=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : 'Unknown';
  }

  /**
   * Enrich download with magnetHash and category info
   */
  async enrichDownload(download) {
    const ed2kHash = download.fileHash || download.EC_TAG_PARTFILE_HASH;
    const categoryId = download.category || download.EC_TAG_PARTFILE_CAT || 0;
    const categoryObj = await this.getCategoryById(categoryId);

    return {
      ...download,
      magnetHash: this.hashStore.getMagnetHash(ed2kHash),
      categoryName: categoryObj?.title || '',
      categoryPath: categoryObj?.path || ''
    };
  }

  /**
   * GET /api/v2/torrents/info
   */
  async getTorrentsInfo(req, res) {
    try {
      const { category } = req.query;

      // Use cached unified items from DataFetchService instead of direct EC calls.
      // Direct getDownloadQueue()/getSharedFiles() calls interfere with aMule's
      // server-side incremental diff state for getUpdate(), causing XOR corruption.
      const dataFetchService = require('../DataFetchService');
      const cached = dataFetchService.getCachedBatchData(10000);
      const items = cached?.items || [];

      // Filter to the target aMule instance
      const targetInstanceId = this.getAmuleInstanceId?.();
      let downloads = items.filter(item => item.client === 'amule' && (!targetInstanceId || item.instanceId === targetInstanceId));

      // Map unified items to the format expected by convertToQBittorrentInfo
      downloads = downloads.map(item => ({
        fileName: item.name,
        fileHash: item.hash,
        fileSize: String(item.size || 0),
        fileSizeDownloaded: String(item.sizeDownloaded || 0),
        progress: String(item.progress || 0),
        sourceCount: item.sources?.connected || 0,
        speed: item.downloadSpeed || 0,
        priority: item.downloadPriority ?? 0,
        category: item.categoryId || null,
        status: item.status,
        uploadSpeed: item.uploadSpeed || 0,
        ratio: item.ratio || 0,
        directory: item.directory || ''
      }));

      // Filter by category if requested
      if (category) {
        const filteredDownloads = [];
        for (const download of downloads) {
          const categoryObj = await this.getCategoryById(download.category);
          if (categoryObj && categoryObj.title === category) {
            filteredDownloads.push(download);
          }
        }
        downloads = filteredDownloads;
      }

      // Enrich and convert to qBittorrent format
      const torrents = await Promise.all(
        downloads.map(async download => {
          const enriched = await this.enrichDownload(download);
          return convertToQBittorrentInfo(enriched);
        })
      );

      res.json(torrents);
    } catch (error) {
      logger.error('[qBittorrent] Get torrents error:', error);
      return response.serverError(res, 'Failed to get torrents');
    }
  }

  /**
   * POST /api/v2/torrents/add
   */
  async addTorrent(req, res) {
    try {
      const { urls, category } = req.body;

      if (!urls) {
        return response.badRequest(res, 'Missing urls parameter');
      }

      const amuleClient = this.getAmuleClient?.();
      if (!amuleClient) {
        return response.serviceUnavailable(res, 'aMule not connected');
      }

      const magnetLinks = urls
        .split(/[\n\r]+/)
        .map(s => s.trim())
        .filter(Boolean);

      const results = [];

      // Get category ID
      let categoryId = 0;
      if (category) {
        const categoryObj = await this.getCategoryByName(category);
        if (categoryObj) {
          categoryId = categoryObj.id;
          logger.log(`[qBittorrent] Category "${category}" -> ID: ${categoryId}`);
        } else {
          logger.log(`[qBittorrent] Category "${category}" not found, using default`);
        }
      }

      for (const magnetLink of magnetLinks) {
        try {
          logger.log('[qBittorrent] Processing magnet link:', magnetLink);

          const { ed2kLink, ed2kHash, magnetHash, fileName, fileSize } = convertMagnetToEd2k(magnetLink);
          logger.log('[qBittorrent] Converted to ED2K:', { ed2kHash, magnetHash, fileName, fileSize });

          const success = await amuleClient.addEd2kLink(ed2kLink, categoryId);
          logger.log('[qBittorrent] addEd2kLink returned:', success);

          if (success) {
            this.hashStore.setMapping(ed2kHash, magnetHash, {
              fileName: this.extractFileName(magnetLink),
              category: category || '',
              addedAt: Date.now()
            });

            // Record ownership for the authenticated API user
            if (req.apiUser?.id && this.userManager) {
              const instanceId = this.getAmuleInstanceId?.();
              if (instanceId) {
                this.userManager.recordOwnership(itemKey(instanceId, ed2kHash), req.apiUser.id);
              }
            }

            logger.log(`[qBittorrent] Successfully added download: ${ed2kHash}`);
          } else {
            logger.log(`[qBittorrent] Failed to add download`);
          }

          results.push({ magnetLink, success });
        } catch (error) {
          logger.error('[qBittorrent] Exception adding torrent:', error);
          results.push({ magnetLink, success: false, error: error.message });
        }
      }

      const allSuccess = results.every(r => r.success);
      res.send(allSuccess ? 'Ok.' : 'Fail.');
    } catch (error) {
      logger.error('[qBittorrent] Add torrent error:', error);
      return response.serverError(res, 'Failed to add torrent');
    }
  }

  /**
   * POST /api/v2/torrents/delete
   */
  async deleteTorrent(req, res) {
    try {
      const { hashes, deleteFiles = false } = req.body;
      logger.log('[qBittorrent] Delete request:', { hashes, deleteFiles });

      if (!hashes) {
        return response.badRequest(res, 'Missing hashes parameter');
      }

      const amuleClient = this.getAmuleClient?.();
      if (!amuleClient) {
        return response.serviceUnavailable(res, 'aMule not connected');
      }

      const hashList = hashes.split('|').map(h => h.trim()).filter(Boolean);
      logger.log('[qBittorrent] Processing', hashList.length, 'hash(es)');

      for (const hash of hashList) {
        try {
          const ed2kHash = this.hashStore.getEd2kHash(hash);
          const finalHash = ed2kHash || hash;

          logger.log('[qBittorrent] Deleting hash:', finalHash);
          await amuleClient.cancelDownload(finalHash);

          if (ed2kHash) {
            this.hashStore.removeMapping(ed2kHash);
          }

          logger.log(`[qBittorrent] Successfully deleted: ${finalHash}`);
        } catch (error) {
          logger.error('[qBittorrent] Exception deleting hash:', hash, error);
        }
      }

      res.send('Ok.');
    } catch (error) {
      logger.error('[qBittorrent] Delete torrent error:', error);
      return response.serverError(res, 'Failed to delete torrent');
    }
  }

  /**
   * POST /api/v2/torrents/pause
   */
  pauseTorrent(req, res) {
    logger.warn('[qBittorrent] Pause not implemented');
    res.send('Ok.');
  }

  /**
   * POST /api/v2/torrents/resume
   */
  resumeTorrent(req, res) {
    logger.warn('[qBittorrent] Resume not implemented');
    res.send('Ok.');
  }
}

module.exports = QBittorrentHandler;
