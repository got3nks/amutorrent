const { convertToQBittorrentInfo } = require('./stateMapping');
const { convertMagnetToEd2k } = require('../linkConverter');

/**
 * Torrent Management Handlers - Core qBittorrent API implementation
 *
 * Provides endpoints for:
 * - Listing torrents (downloads)
 * - Adding torrents via magnet links
 * - Deleting torrents
 * - Pausing/resuming torrents (limited support)
 */

/**
 * Extract file name from magnet link
 * @param {string} magnetLink - Magnet link
 * @returns {string} File name
 */
function extractFileName(magnetLink) {
  const match = magnetLink.match(/dn=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : 'Unknown';
}

/**
 * Create torrent management handlers
 * @param {function} getAmuleClient - Function that returns current aMule client instance
 * @param {object} hashStore - HashStore instance for hash mappings
 * @param {function} getCategoryById - Get category by ID
 * @param {function} getCategoryByName - Get category by name
 * @param {function} getCategoryByPath - Get category by path
 * @returns {object} Handler functions
 */
function createTorrentsHandler(getAmuleClient, hashStore, getCategoryById, getCategoryByName, getCategoryByPath) {
  /**
   * GET /api/v2/torrents/info - List all torrents
   *
   * Sonarr/Radarr poll this endpoint to monitor download progress
   */
  async function getTorrentsInfo(req, res) {
    try {
      const { category } = req.query;
      const amuleClient = getAmuleClient();

      if (!amuleClient) {
        return res.status(503).json({ error: 'aMule not connected' });
      }

      // Fetch download queue from aMule
      let downloads = await amuleClient.getDownloadQueue();
      // Also fetch shared files, completed files will only appear here
      let shared = await amuleClient.getSharedFiles();

      // Map shared files and lookup categories by path
      shared = await Promise.all(shared.map(async file => {
        const categoryObj = file.path ? await getCategoryByPath(file.path) : null;
        return {
          fileName: file.fileName,
          fileHash: file.fileHash,
          fileSize: String(file.fileSize),
          fileSizeDownloaded: String(file.fileSize),
          progress: '100',
          sourceCount: 0,
          speed: 0,
          priority: file.priority ?? 0,
          category: categoryObj ? categoryObj.id : null
        };
      }));

      downloads = [...downloads, ...shared];

      // Filter by category if requested (async operation)
      if (category) {
        const filteredDownloads = [];
        for (const download of downloads) {
          const categoryObj = await getCategoryById(download.category);
          if (categoryObj && categoryObj.title === category) {
            filteredDownloads.push(download);
          }
        }
        downloads = filteredDownloads;
      }

      // Convert each download to qBittorrent format (async operation)
      const torrents = await Promise.all(
        downloads.map(async download => {
          const ed2kHash = download.fileHash || download.EC_TAG_PARTFILE_HASH;
          const magnetHash = hashStore.getMagnetHash(ed2kHash);
          const torrent = await convertToQBittorrentInfo(download, magnetHash, getCategoryById);
          return torrent;
        })
      );

      res.json(torrents);
    } catch (error) {
      console.error('Get torrents error:', error);
      res.status(500).json({ error: 'Failed to get torrents' });
    }
  }

  /**
   * POST /api/v2/torrents/add - Add torrent via magnet link
   *
   * Sonarr/Radarr call this to add downloads
   * Body: { urls: 'magnet:...', category: '...' }
   */
  async function addTorrent(req, res) {
    try {
      const { urls, category } = req.body;

      if (!urls) {
        return res.status(400).send('Missing urls parameter');
      }

      const amuleClient = getAmuleClient();
      if (!amuleClient) {
        return res.status(503).send('aMule not connected');
      }

      // Split multiple URLs (newline or URL-encoded newline)
      const magnetLinks = urls
        .split(/[\n\r]+/)
        .map(s => s.trim())
        .filter(Boolean);

      const results = [];

      // Get category object by name
      let categoryId = 0;
      if (category) {
        const categoryObj = await getCategoryByName(category);
        if (categoryObj) {
          categoryId = categoryObj.id;
          console.log(`[AddTorrent] Category "${category}" -> ID: ${categoryId}`);
        } else {
          console.log(`[AddTorrent] Category "${category}" not found, using default`);
        }
      }

      // Process each magnet link
      for (const magnetLink of magnetLinks) {
        try {
          console.log('[AddTorrent] Processing magnet link:', magnetLink);

          // Convert magnet to ed2k
          const { ed2kLink, ed2kHash, magnetHash, fileName, fileSize } = convertMagnetToEd2k(magnetLink);
          console.log('[AddTorrent] Converted to ED2K:');
          console.log('  - ED2K Hash:', ed2kHash);
          console.log('  - Magnet Hash:', magnetHash);
          console.log('  - File Name:', fileName);
          console.log('  - File Size:', fileSize);
          console.log('  - ED2K Link:', ed2kLink);
          console.log('  - Category ID:', categoryId);

          // Add to aMule with category
          console.log('[AddTorrent] Calling amuleClient.addEd2kLink...');
          const success = await amuleClient.addEd2kLink(ed2kLink, categoryId);
          console.log('[AddTorrent] amuleClient.addEd2kLink returned:', success);

          if (success) {
            // Store hash mapping for future lookups
            hashStore.setMapping(ed2kHash, magnetHash, {
              fileName: extractFileName(magnetLink),
              category: category || '',
              addedAt: Date.now()
            });

            console.log(`[AddTorrent] ✅ Successfully added download: ${ed2kHash} (magnet: ${magnetHash})`);
          } else {
            console.log(`[AddTorrent] ❌ Failed to add download - amuleClient.addEd2kLink returned false`);
          }

          results.push({ magnetLink, success });
        } catch (error) {
          console.error('[AddTorrent] ❌ Exception while adding torrent:', error);
          console.error('[AddTorrent] Error stack:', error.stack);
          console.error('[AddTorrent] Magnet link that failed:', magnetLink);
          results.push({ magnetLink, success: false, error: error.message });
        }
      }

      // qBittorrent returns 'Ok.' on success
      const allSuccess = results.every(r => r.success);
      res.send(allSuccess ? 'Ok.' : 'Fail.');
    } catch (error) {
      console.error('Add torrent error:', error);
      res.status(500).send('Fail.');
    }
  }

  /**
   * POST /api/v2/torrents/delete - Delete torrent
   *
   * Sonarr/Radarr call this to remove downloads
   * Body: { hashes: 'hash1|hash2|...', deleteFiles: 'true'/'false' }
   */
  async function deleteTorrent(req, res) {
    try {
      const { hashes, deleteFiles = false } = req.body;
      console.log('[DeleteTorrent] Request received:', { hashes, deleteFiles });

      if (!hashes) {
        console.log('[DeleteTorrent] ❌ Missing hashes parameter');
        return res.status(400).send('Missing hashes parameter');
      }

      const amuleClient = getAmuleClient();
      if (!amuleClient) {
        console.log('[DeleteTorrent] ❌ aMule not connected');
        return res.status(503).send('aMule not connected');
      }

      // Split hashes (can be | separated)
      const hashList = hashes.split('|').map(h => h.trim()).filter(Boolean);
      console.log('[DeleteTorrent] Processing', hashList.length, 'hash(es):', hashList);

      for (const hash of hashList) {
        try {
          console.log('[DeleteTorrent] Processing hash:', hash);

          // Look up ed2k hash from magnet hash
          const ed2kHash = hashStore.getEd2kHash(hash);

          if (ed2kHash) {
            console.log('[DeleteTorrent] Found ED2K hash mapping:', ed2kHash);
          } else {
            console.log('[DeleteTorrent] No mapping found, using hash as-is:', hash);
          }

          const finalHash = ed2kHash || hash;

          // Delete from aMule
          console.log('[DeleteTorrent] Calling amuleClient.cancelDownload for:', finalHash);
          const result = await amuleClient.cancelDownload(finalHash);
          console.log('[DeleteTorrent] amuleClient.cancelDownload returned:', result);

          // Remove from hash store
          if (ed2kHash) {
            hashStore.removeMapping(ed2kHash);
            console.log('[DeleteTorrent] Removed hash mapping from store');
          }

          console.log(`[DeleteTorrent] ✅ Successfully deleted download: ${finalHash}`);
        } catch (error) {
          console.error('[DeleteTorrent] ❌ Exception while deleting hash:', hash);
          console.error('[DeleteTorrent] Error:', error);
          console.error('[DeleteTorrent] Error stack:', error.stack);
        }
      }

      res.send('Ok.');
    } catch (error) {
      console.error('[DeleteTorrent] ❌ Unexpected error:', error);
      console.error('[DeleteTorrent] Error stack:', error.stack);
      res.status(500).send('Fail.');
    }
  }

  /**
   * POST /api/v2/torrents/pause - Pause torrents
   *
   * Note: aMule EC protocol has limited pause support
   * We return success but log that it's not fully implemented
   */
  async function pauseTorrent(req, res) {
    console.warn('Pause torrent requested but not fully supported by aMule EC protocol');
    res.send('Ok.');
  }

  /**
   * POST /api/v2/torrents/resume - Resume torrents
   *
   * Note: aMule EC protocol has limited resume support
   * We return success but log that it's not fully implemented
   */
  async function resumeTorrent(req, res) {
    console.warn('Resume torrent requested but not fully supported by aMule EC protocol');
    res.send('Ok.');
  }

  return {
    getTorrentsInfo,
    addTorrent,
    deleteTorrent,
    pauseTorrent,
    resumeTorrent
  };
}

module.exports = { createTorrentsHandler };
