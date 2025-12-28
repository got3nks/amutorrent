/**
 * WebSocket Handlers Module
 * Handles all WebSocket message handlers and real-time updates
 */

const BaseModule = require('../lib/BaseModule');

class WebSocketHandlers extends BaseModule {
  constructor() {
    super();
  }

  // Create client-specific logger
  createClientLog(ws, username, nickname, clientIp) {
    return (...args) => {
      const logParts = [];
      args.forEach(arg => {
        if (arg instanceof Error) {
          // Special handling for Error objects
          const errorString = `${arg.name}: ${arg.message}\n${arg.stack}`;
          logParts.push(errorString);
        } else if (typeof arg === 'object' && arg !== null) {
          // Full object as JSON
          try {
            logParts.push(JSON.stringify(arg));
          } catch {
            logParts.push('[Circular]');
          }
        } else {
          logParts.push(String(arg));
        }
      });
      const logMessage = `[${clientIp}(${username}, ${nickname})] ${logParts.join(' ')}`;
      // Use the main logger which will add timestamp and write to both console and file
      this.log && this.log(logMessage);
    };
  }

  // Create context object with all client-specific utilities
  createContext(ws, username, nickname, clientIp) {
    return {
      log: this.createClientLog(ws, username, nickname, clientIp),
      send: (data) => ws.send(JSON.stringify(data)),
      clientInfo: { username, nickname, clientIp },
      broadcast: this.broadcast,
      amuleManager: this.amuleManager
    };
  }

  // Handle WebSocket connection
  handleConnection(ws, req) {
    const username = req.headers['remote-user'] || 'unknown';
    const nickname = req.headers['remote-name'] || 'unknown';
    const clientIp = req.socket.remoteAddress || req.connection.remoteAddress;
    const geoData = this.geoIPManager.getGeoIPData(clientIp);
    const locationInfo = this.geoIPManager.formatLocationInfo(geoData);

    const context = this.createContext(ws, username, nickname, clientIp);

    context.log(`New WebSocket connection from ${clientIp}${locationInfo}`);
    context.send({ type: 'connected', message: 'Connected to aMule Controller' });
    context.send({ type: 'search-lock', locked: this.amuleManager.isSearchInProgress() });

    ws.on('message', async message => {
      await this.handleMessage(message, context);
    });

    ws.on('close', () => context.log(`WebSocket connection closed from ${clientIp}`));
    ws.on('error', (err) => context.log('WebSocket error:', err));
  }

  // Handle WebSocket messages
  async handleMessage(message, context) {
    try {
      const data = JSON.parse(message);
      context.log(`Received action: ${data.action}`, data);

      if (!this.amuleManager.isConnected()) {
        await this.amuleManager.initClient();
      }

      switch (data.action) {
        case 'search': await this.handleSearch(data, context); break;
        case 'getPreviousSearchResults': await this.handleGetPreviousSearchResults(context); break;
        case 'getDownloads': await this.handleGetDownloads(context); break;
        case 'getShared': await this.handleGetShared(context); break;
        case 'getServersList': await this.handleGetServersList(context); break;
        case 'serverDoAction': await this.handleServerDoAction(data, context); break;
        case 'getStats': await this.handleGetStats(context); break;
        case 'getStatsTree': await this.handleGetStatsTree(context); break;
        case 'getServerInfo': await this.handleGetServerInfo(context); break;
        case 'getLog': await this.handleGetLog(context); break;
        case 'getUploadingQueue': await this.handleGetUploads(context); break;
        case 'download': await this.handleDownload(data, context); break;
        case 'delete': await this.handleDelete(data, context); break;
        case 'addEd2kLinks': await this.handleAddEd2kLinks(data, context); break;
        case 'getCategories': await this.handleGetCategories(context); break;
        case 'createCategory': await this.handleCreateCategory(data, context); break;
        case 'updateCategory': await this.handleUpdateCategory(data, context); break;
        case 'deleteCategory': await this.handleDeleteCategory(data, context); break;
        case 'setFileCategory': await this.handleSetFileCategory(data, context); break;
        case 'pauseDownload': await this.handlePauseDownload(data, context); break;
        case 'resumeDownload': await this.handleResumeDownload(data, context); break;
        default:
          context.send({ type: 'error', message: `Unknown action: ${data.action}` });
      }
    } catch (err) {
      context.log('Error processing message:', err);
      context.send({ type: 'error', message: err.message });
    }
  }

  // Handler implementations
  async handleSearch(data, context) {
    if (!context.amuleManager.acquireSearchLock()) {
      context.send({ type: 'error', message: 'Another search is running' });
      return;
    }

    context.broadcast({ type: 'search-lock', locked: true });

    try {
      const result = await context.amuleManager.getClient().searchAndWaitResults(data.query, data.type, data.extension);
      context.broadcast({ type: 'search-results', data: result.results || [] });
      context.log(`Search completed: ${result.resultsLength || 0} results found`);
    } catch (err) {
      context.log('Search error:', err);
      context.send({ type: 'error', message: 'Search failed: ' + err.message });
    } finally {
      context.amuleManager.releaseSearchLock();
      context.broadcast({ type: 'search-lock', locked: false });
    }
  }

  async handleGetPreviousSearchResults(context) {
    try {
      const result = await context.amuleManager.getClient().getSearchResults();
      context.send({ type: 'previous-search-results', data: result.results || [] });
      context.log(`Previous search results fetched: ${result.resultsLength || 0} cached results`);
    } catch (err) {
      context.log('Get previous search results error:', err);
      context.send({ type: 'previous-search-results', data: [] });
    }
  }

  async handleGetDownloads(context) {
    try {
        const downloads = await context.amuleManager.getClient().getDownloadQueue();
      context.send({ type: 'downloads-update', data: downloads });
      context.log(`Downloads fetched: ${downloads.length} files`);
    } catch (err) {
      context.log('Get downloads error:', err);
      context.send({ type: 'error', message: 'Failed to fetch downloads: ' + err.message });
    }
  }

  async handleGetShared(context) {
    try {
      const shared = await context.amuleManager.getClient().getSharedFiles();
      context.send({ type: 'shared-update', data: shared });
      context.log(`Shared files fetched: ${shared.length} files`);
    } catch (err) {
      context.log('Get shared error:', err);
      context.send({ type: 'error', message: 'Failed to fetch shared files: ' + err.message });
    }
  }

  async handleGetServersList(context) {
    try {
      const servers = await context.amuleManager.getClient().getServerList();
      context.send({ type: 'servers-update', data: servers });
      context.log('Servers list fetched successfully');
    } catch (err) {
      context.log('Get servers list error:', err);
      context.send({ type: 'error', message: 'Failed to fetch servers list: ' + err.message });
    }
  }

  async handleServerDoAction(data, context) {
    try {
      const { ip, port, serverAction } = data;
      if (!ip || !port || !serverAction) {
        throw new Error('Missing required parameters: ip, port, or serverAction');
      }

      let success;
      
      switch (serverAction) {
        case 'connect':
          success = await context.amuleManager.getClient().connectServer(ip, port);
          break;
        case 'disconnect':
          success = await context.amuleManager.getClient().disconnectServer(ip, port);
          break;
        case 'remove':
          success = await context.amuleManager.getClient().removeServer(ip, port);
          break;
        default:
          throw new Error(`Unknown action: ${serverAction}`);
      }

      context.send({ type: 'server-action', data: success });
      context.log(`Action ${serverAction} on server ${ip}:${port} ${success ? 'completed successfully' : 'failed'}`);
    } catch (err) {
      context.log('Server action error:', err);
      context.send({ type: 'error', message: `Failed to perform action on server: ${err.message}` });
    }
  }

  async handleGetStats(context) {
    try {
      const client = context.amuleManager.getClient();
      if (!client) {
        context.send({ type: 'error', message: 'aMule client not connected. Please complete setup first.' });
        return;
      }
      const stats = await client.getStats();
      context.send({ type: 'stats-update', data: stats });
      context.log('Stats fetched successfully');
    } catch (err) {
      context.log('Get stats error:', err);
      context.send({ type: 'error', message: 'Failed to fetch stats: ' + err.message });
    }
  }

  async handleGetStatsTree(context) {
    try {
      const client = context.amuleManager.getClient();
      if (!client) {
        context.send({ type: 'error', message: 'aMule client not connected. Please complete setup first.' });
        return;
      }
      const statsTree = await client.getStatsTree();
      context.send({ type: 'stats-tree-update', data: statsTree });
      context.log('Stats tree fetched successfully');
    } catch (err) {
      context.log('Get stats tree error:', err);
      context.send({ type: 'error', message: 'Failed to fetch stats tree: ' + err.message });
    }
  }

  async handleGetServerInfo(context) {
    try {
      const serverInfo = await context.amuleManager.getClient().getServerInfo();
      context.send({ type: 'server-info-update', data: serverInfo });
      context.log('Server info fetched successfully');
    } catch (err) {
      context.log('Get server info error:', err);
      context.send({ type: 'error', message: 'Failed to fetch server info: ' + err.message });
    }
  }

  async handleGetLog(context) {
    try {
      const log = await context.amuleManager.getClient().getLog();
      context.send({ type: 'log-update', data: log });
      context.log('Log fetched successfully');
    } catch (err) {
      context.log('Get log error:', err);
      context.send({ type: 'error', message: 'Failed to fetch log: ' + err.message });
    }
  }

  async handleGetUploads(context) {
    try {
      const uploadsData = await context.amuleManager.getClient().getUploadingQueue();
      const uploads = (uploadsData?.EC_TAG_CLIENT) || [];
      const enrichedUploads = this.geoIPManager.enrichUploadsWithGeo(uploads);
      context.send({ type: 'uploads-update', data: enrichedUploads });
      context.log(`Uploads fetched: ${uploads.length} active uploads`);
    } catch (err) {
      context.log('Get uploads error:', err);
      context.send({ type: 'error', message: 'Failed to fetch uploads: ' + err.message });
    }
  }

  async handleDownload(data, context) {
    try {
      const categoryId = data.categoryId || 0;
      const success = await context.amuleManager.getClient().downloadSearchResult(data.fileHash, categoryId);
      context.send({ type: 'download-started', success, fileHash: data.fileHash });
      context.log(`Download ${success ? 'started' : 'failed'} for: ${data.fileHash} (category: ${categoryId})`);
    } catch (err) {
      context.log('Download error:', err);
      context.send({ type: 'error', message: 'Failed to start download: ' + err.message });
    }
  }

  async handleDelete(data, context) {
    try {
      const success = await context.amuleManager.getClient().cancelDownload(data.fileHash);
      context.send({ type: 'file-deleted', success, fileHash: data.fileHash });
      context.log(`File ${success ? 'deleted' : 'deletion failed'} for: ${data.fileHash}`);
    } catch (err) {
      context.log('Delete error:', err);
      context.send({ type: 'error', message: 'Failed to delete file: ' + err.message });
    }
  }

  async handleAddEd2kLinks(data, context) {
    try {
      const links = data.links;
      const categoryId = data.categoryId || 0;

      const cleaned = links
        .map(s => String(s).trim())
        .filter(Boolean);

      if (cleaned.length === 0) {
        context.send({ type: 'error', message: 'No ED2K links provided' });
        return;
      }

      const results = [];
      for (const link of cleaned) {
        context.log(`Adding ED2K link: ${link} (category: ${categoryId})`);
        // Process links sequentially using the existing queue to maintain order and avoid saturating aMule
        const success = await context.amuleManager.getClient().addEd2kLink(link, categoryId);
        results.push({ link, success });
      }

      context.send({ type: 'ed2k-added', results });
    } catch (err) {
      context.log('Failed to add ED2K links:', err);
      context.send({ type: 'error', message: `Failed to add ED2K links: ${err.message}` });
    }
  }

  async handleGetCategories(context) {
    try {
      const categories = await context.amuleManager.getClient().getCategories();
      context.send({ type: 'categories-update', data: categories });
      context.log(`Categories fetched: ${categories.length} categories`);
    } catch (err) {
      context.log('Get categories error:', err);
      context.send({
        type: 'error',
        message: 'Failed to fetch categories: ' + err.message
      });
    }
  }

  async handleCreateCategory(data, context) {
    try {
      const { title, path, comment, color, priority } = data;

      if (!title || title.trim() === '') {
        throw new Error('Category title is required');
      }

      const result = await context.amuleManager.getClient().createCategory(
          title.trim(),
          path?.trim() || '',
          comment?.trim() || '',
          color || 0,
          priority || 0
        );

      if (result.success) {
        // Refresh categories list to get updated data
        const categories = await context.amuleManager.getClient().getCategories();
        context.broadcast({ type: 'categories-update', data: categories });

        context.send({
          type: 'category-created',
          success: true,
          categoryId: result.categoryId,
          message: `Category "${title}" created successfully`
        });
        context.log(`Category created: ${title} (ID: ${result.categoryId})`);
      } else {
        throw new Error('aMule rejected category creation');
      }
    } catch (err) {
      context.log('Create category error:', err);
      context.send({
        type: 'error',
        message: 'Failed to create category: ' + err.message
      });
    }
  }

  async handleUpdateCategory(data, context) {
    try {
      const { categoryId, title, path, comment, color, priority } = data;

      if (categoryId === undefined || categoryId === null) {
        throw new Error('Category ID is required');
      }

      if (!title || title.trim() === '') {
        throw new Error('Category title is required');
      }

      const success = await context.amuleManager.getClient().updateCategory(
          categoryId,
          title.trim(),
          path?.trim() || '',
          comment?.trim() || '',
          color || 0,
          priority || 0
        );

      if (success) {
        // Refresh categories list
        const categories = await context.amuleManager.getClient().getCategories();
        context.broadcast({ type: 'categories-update', data: categories });

        context.send({
          type: 'category-updated',
          success: true,
          message: `Category "${title}" updated successfully`
        });
        context.log(`Category updated: ${title} (ID: ${categoryId})`);
      } else {
        throw new Error('aMule rejected category update');
      }
    } catch (err) {
      context.log('Update category error:', err);
      context.send({
        type: 'error',
        message: 'Failed to update category: ' + err.message
      });
    }
  }

  async handleDeleteCategory(data, context) {
    try {
      const { categoryId } = data;

      if (categoryId === undefined || categoryId === null) {
        throw new Error('Category ID is required');
      }

      if (categoryId === 0) {
        throw new Error('Cannot delete default category (ID 0)');
      }

      const success = await context.amuleManager.getClient().deleteCategory(categoryId);

      if (success) {
        // Refresh categories list
        const categories = await context.amuleManager.getClient().getCategories();
        context.broadcast({ type: 'categories-update', data: categories });

        context.send({
          type: 'category-deleted',
          success: true,
          message: 'Category deleted successfully'
        });
        context.log(`Category deleted: ID ${categoryId}`);
      } else {
        throw new Error('aMule rejected category deletion');
      }
    } catch (err) {
      context.log('Delete category error:', err);
      context.send({
        type: 'error',
        message: 'Failed to delete category: ' + err.message
      });
    }
  }

  async handleSetFileCategory(data, context) {
    try {
      const { fileHash, categoryId } = data;

      if (!fileHash) {
        throw new Error('File hash is required');
      }

      if (categoryId === undefined || categoryId === null) {
        throw new Error('Category ID is required');
      }

      const success = await context.amuleManager.getClient().setFileCategory(fileHash, categoryId);

      if (success) {
        // Refresh downloads to show updated category
      const downloads = await context.amuleManager.getClient().getDownloadQueue();
        context.broadcast({ type: 'downloads-update', data: downloads });

        context.send({
          type: 'file-category-changed',
          success: true,
          message: 'File category changed successfully'
        });
        context.log(`File category changed: ${fileHash} -> Category ${categoryId}`);
      } else {
        throw new Error('aMule rejected category change');
      }
    } catch (err) {
      context.log('Set file category error:', err);
      context.send({
        type: 'error',
        message: 'Failed to change file category: ' + err.message
      });
    }
  }

  async handlePauseDownload(data, context) {
    try {
      const { fileHash } = data;

      if (!fileHash) {
        throw new Error('File hash is required');
      }

      const success = await context.amuleManager.getClient().pauseDownload(fileHash);

      if (success) {
        // Refresh downloads to show updated status
        const downloads = await context.amuleManager.getClient().getDownloadQueue();
        context.broadcast({ type: 'downloads-update', data: downloads });

        context.send({
          type: 'download-paused',
          success: true,
          message: 'Download paused successfully'
        });
        context.log(`Download paused: ${fileHash}`);
      } else {
        throw new Error('aMule rejected pause request');
      }
    } catch (err) {
      context.log('Pause download error:', err);
      context.send({
        type: 'error',
        message: 'Failed to pause download: ' + err.message
      });
    }
  }

  async handleResumeDownload(data, context) {
    try {
      const { fileHash } = data;

      if (!fileHash) {
        throw new Error('File hash is required');
      }

      const success = await context.amuleManager.getClient().resumeDownload(fileHash);

      if (success) {
        // Refresh downloads to show updated status
        const downloads = await context.amuleManager.getClient().getDownloadQueue();
        context.broadcast({ type: 'downloads-update', data: downloads });

        context.send({
          type: 'download-resumed',
          success: true,
          message: 'Download resumed successfully'
        });
        context.log(`Download resumed: ${fileHash}`);
      } else {
        throw new Error('aMule rejected resume request');
      }
    } catch (err) {
      context.log('Resume download error:', err);
      context.send({
        type: 'error',
        message: 'Failed to resume download: ' + err.message
      });
    }
  }
}

module.exports = new WebSocketHandlers();