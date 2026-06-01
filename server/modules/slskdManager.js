'use strict';

const BaseClientManager = require('../lib/BaseClientManager');
const SlskdClient = require('../lib/slskd/SlskdClient');
const { normalizeSlskdDownload, normalizeSlskdSharedFile } = require('../lib/downloadNormalizer');
const logger = require('../lib/logger');
const eventScriptingManager = require('../lib/EventScriptingManager');

class SlskdManager extends BaseClientManager {
  constructor() {
    super();
    this.clientType = 'slskd';
    this.client = null;
    this.searchInProgress = false;

    this.lastDownloadsById = new Map();
    this.lastSearchResults = [];
    this.lastSearchByKey = new Map();
    this.lastSearchTimestamp = 0;
    this._seenEventIds = new Set();
    this.lastStats = {
      downloadSpeed: 0,
      uploadSpeed: 0,
      totalDownloaded: 0,
      totalUploaded: 0
    };
  }

  async initClient() {
    // Match the same contract used by other managers: read from _clientConfig.
    if (!this._clientConfig || !this._clientConfig.enabled) {
      this.log('  slskd integration is disabled');
      return false;
    }

    if (!this._clientConfig.host) {
      this.log('  slskd host not configured');
      return false;
    }

    this.client = new SlskdClient({
      host: this._clientConfig.host,
      port: this._clientConfig.port,
      path: this._clientConfig.path,
      useSsl: !!this._clientConfig.useSsl,
      apiKey: this._clientConfig.apiKey,
      username: this._clientConfig.username,
      password: this._clientConfig.password
    });

    this._downloadDirectory = this._clientConfig.downloadDirectory || '';

    return true;
  }

  async startConnection() {
    if (!this._clientConfig || !this._clientConfig.enabled) {
      this.log('ℹ️  slskd integration is disabled, skipping connection');
      return;
    }

    try {
      if (!this.client) {
        const ready = await this.initClient();
        if (!ready) {
          return;
        }
      }

      const test = await this.client.testConnection();
      if (!test.success) {
        throw new Error(test.error || 'Failed to connect to slskd');
      }

      this._clearConnectionError();
      this.clearReconnect();
      this.log('Connected to slskd successfully');
      // Notify onConnect listeners (e.g. category sync)
      this._onConnectCallbacks.forEach(cb => cb());
    } catch (err) {
      this.error('❌ Failed to connect to slskd:', logger.errorDetail(err));
      this._setConnectionError(err);
      if (this.client) {
        await this.client.disconnect();
      }
      this.client = null;
      this.scheduleReconnect(30000);
    }
  }

  isConnected() {
    return !!this.client && this.client.isConnected();
  }

  /**
   * Register the slskd download directory with the CategoryManager on connect.
   * Called by server.js via the onConnect/onConnectSync pattern.
   */
  async onConnectSync(categoryManager) {
    if (this._downloadDirectory) {
      categoryManager.setClientDefaultPath(this.instanceId, this._downloadDirectory);
    }
  }

  acquireSearchLock() {
    if (this.searchInProgress) return false;
    this.searchInProgress = true;
    return true;
  }

  releaseSearchLock() {
    this.searchInProgress = false;
  }

  isSearchInProgress() {
    return this.searchInProgress;
  }

  _buildSearchKey(entry) {
    const id = entry?.id ? String(entry.id) : '';
    const username = String(entry?.username || '').toLowerCase();
    const filename = String(entry?.filename || '').toLowerCase();
    const size = Number(entry?.size || 0);
    return `${id}|${username}|${filename}|${size}`;
  }

  _extractDirectoryPath(filename) {
    const parts = String(filename || '').split(/[\\/]/g).filter(Boolean);
    if (parts.length <= 1) return '';
    return parts.slice(0, -1).join('/');
  }

  _normalizeSearchResult(result) {
    const key = this._buildSearchKey(result);
    const directoryPath = this._extractDirectoryPath(result.filename);
    return {
      fileHash: key,
      fileName: result.filename,
      fileSize: result.size || 0,
      sourceCount: 1,
      username: result.username,
      bitrate: result.bitrate,
      length: result.length,
      directoryPath,
      canBrowseDirectory: !!directoryPath,
      isSlskd: true,
      raw: result.raw || result
    };
  }

  hasSearchResult(fileHash) {
    return this.lastSearchByKey.has(String(fileHash || ''));
  }

  async search(query) {
    if (!this.client) {
      const ready = await this.initClient();
      if (!ready || !this.client) throw new Error('slskd not connected');
    }

    const response = await this.client.searchText(query, { maxWaitMs: 45000, pollIntervalMs: 1500 });
    const normalized = (response.results || []).map((result) => this._normalizeSearchResult(result));

    this.lastSearchByKey.clear();
    for (let i = 0; i < normalized.length; i++) {
      this.lastSearchByKey.set(normalized[i].fileHash, response.results[i]);
    }

    this.lastSearchResults = normalized;
    this.lastSearchTimestamp = Date.now();

    return {
      results: normalized,
      resultsLength: normalized.length,
      searchId: response.searchId || null
    };
  }

  async getSearchResults() {
    return { results: this.lastSearchResults || [] };
  }

  async addSearchResult(fileHash, _categoryId = 0, username = null) {
    if (!this.client) throw new Error('slskd not connected');

    const entry = this.lastSearchByKey.get(String(fileHash || ''));
    if (!entry) throw new Error(`Search result not found: ${fileHash}`);

    await this.client.enqueueDownloads(entry.username, [{
      filename: entry.filename,
      size: Number(entry.size) || 0
    }]);

    this.trackDownload(fileHash, entry.filename || 'Unknown', Number(entry.size) || null, username, null);
    return true;
  }

  async getDirectoryContents(username, directory) {
    if (!this.client) {
      const ready = await this.initClient();
      if (!ready || !this.client) throw new Error('slskd not connected');
    }

    const payload = await this.client.getUserDirectoryContents(username, directory);

    // The API returns the Directory DTO { name, fileCount, files: [...] }
    // or an array of Directory DTOs. Normalize to a flat file list.
    const extractFiles = (node, parentDir = '') => {
      if (!node) return [];
      if (Array.isArray(node)) {
        return node.flatMap((n) => extractFiles(n, parentDir));
      }
      if (typeof node === 'object') {
        const dirName = node.name || node.Name || parentDir;
        const rawFiles = node.files || node.Files || [];
        return rawFiles.map((f) => {
          const filename = f.filename || f.Filename || f.name || f.Name || '';
          const key = this._buildSearchKey({
            id: f.token || f.Token || null,
            username,
            filename: `${dirName}/${filename}`.replace(/\/+/g, '/'),
            size: f.size || f.Size || 0
          });
          return {
            fileHash: key,
            fileName: filename,
            fileSize: Number(f.size || f.Size || 0),
            sourceCount: 1,
            username,
            bitrate: f.bitrate || f.Bitrate || null,
            length: f.length || f.Length || null,
            directoryPath: dirName,
            canBrowseDirectory: false,
            isSlskd: true,
            raw: { ...f, username, directory: dirName }
          };
        });
      }
      return [];
    };

    const files = extractFiles(payload);

    // Register expanded files in the search key map so they can be downloaded
    for (const file of files) {
      if (!this.lastSearchByKey.has(file.fileHash)) {
        const entry = file.raw;
        const fullFilename = `${entry.directory || ''}/${entry.filename || entry.name || file.fileName}`.replace(/\/+/g, '/');
        this.lastSearchByKey.set(file.fileHash, {
          username,
          filename: fullFilename,
          size: file.fileSize
        });
      }
    }

    return files;
  }

  _flattenGroupedTransfers(grouped = []) {
    if (!Array.isArray(grouped)) {
      return [];
    }

    const files = [];
    for (const userGroup of grouped) {
      const username = userGroup?.username || userGroup?.Username || 'unknown';
      const directories = userGroup?.directories || userGroup?.Directories || [];
      for (const directoryGroup of directories) {
        const directory = directoryGroup?.directory || directoryGroup?.Directory || '';
        const entries = directoryGroup?.files || directoryGroup?.Files || [];
        for (const file of entries) {
          files.push({
            ...file,
            username,
            directory
          });
        }
      }
    }

    return files;
  }

  _refreshTransferCache(downloads = []) {
    this.lastDownloadsById.clear();
    for (const transfer of downloads) {
      const id = String(transfer.id || transfer.Id || '').toLowerCase();
      if (id) {
        this.lastDownloadsById.set(id, transfer);
      }
    }
  }

  _extractShares(payload) {
    const collected = [];
    const visit = (node) => {
      if (!node) return;
      if (Array.isArray(node)) {
        for (const entry of node) visit(entry);
        return;
      }
      if (typeof node !== 'object') return;

      if (node.id || node.localPath || node.remotePath || node.alias) {
        collected.push(node);
        return;
      }

      for (const value of Object.values(node)) {
        visit(value);
      }
    };

    visit(payload);

    const unique = new Map();
    for (const share of collected) {
      const key = String(share.id || share.alias || share.remotePath || share.localPath || '').toLowerCase();
      if (key && !unique.has(key)) {
        unique.set(key, share);
      }
    }
    return Array.from(unique.values());
  }

  async _fetchSharedFiles() {
    const shares = this._extractShares(await this.client.getShares());
    if (shares.length === 0) {
      return [];
    }

    const sharedFiles = [];
    for (const share of shares) {
      const shareId = share.id || share.Id;
      if (!shareId) continue;

      let directories = [];
      try {
        directories = await this.client.getShareContents(shareId);
      } catch (err) {
        this.warn(`Failed to fetch slskd share contents for ${share.alias || shareId}:`, logger.errorDetail(err));
        continue;
      }

      for (const directory of (Array.isArray(directories) ? directories : [])) {
        const files = Array.isArray(directory?.files || directory?.Files) ? (directory.files || directory.Files) : [];
        for (const file of files) {
          sharedFiles.push(normalizeSlskdSharedFile(file, {
            instanceId: this.instanceId,
            displayName: this.displayName,
            share,
            directory
          }));
        }
      }
    }

    return sharedFiles;
  }

  _deriveStats(downloads = [], uploads = []) {
    const inProgress = (state) => String(state || '') === 'InProgress';
    const toNumber = (v) => Number(v) || 0;

    const downloadSpeed = downloads
      .filter((d) => inProgress(d.state || d.State))
      .reduce((sum, d) => sum + toNumber(d.averageSpeed || d.AverageSpeed), 0);

    const totalDownloaded = downloads.reduce((sum, d) => sum + toNumber(d.bytesTransferred || d.BytesTransferred), 0);

    const uploadSpeed = uploads
      .filter((u) => inProgress(u.state || u.State))
      .reduce((sum, u) => sum + toNumber(u.averageSpeed || u.AverageSpeed), 0);

    const totalUploaded = uploads
      .filter((u) => {
        const state = String(u.state || u.State || '');
        return state === 'Completed' || state === 'Succeeded' || state.startsWith('Completed,');
      })
      .reduce((sum, u) => sum + toNumber(u.bytesTransferred || u.BytesTransferred || u.size || u.Size), 0);

    this.lastStats = {
      downloadSpeed,
      uploadSpeed,
      totalDownloaded,
      totalUploaded
    };

    return this.lastStats;
  }

  async _pollUploadEvents() {
    if (!this.client) return;
    try {
      const events = await this.client.getEvents();
      if (!Array.isArray(events)) return;
      for (const event of events) {
        const id = event?.id ?? event?.Id;
        if (id == null || this._seenEventIds.has(String(id))) continue;
        this._seenEventIds.add(String(id));
        const type = String(event?.type || event?.Type || '');
        if (type !== 'UploadFileComplete') continue;
        // EventRecord.data is a JSON string per the API spec
        let parsedData = null;
        try { if (event.data) parsedData = JSON.parse(event.data); } catch (_) {}
        const filename =
          parsedData?.filename || parsedData?.Filename ||
          parsedData?.fileName || parsedData?.FileName ||
          event.data || 'Unknown';
        const username = parsedData?.username || parsedData?.Username || '';
        eventScriptingManager.emit('uploadFinished', {
          filename,
          name: filename,
          username,
          instanceId: this.instanceId,
          instanceName: this.displayName,
          clientType: this.clientType
        });
      }
      // Bound the seen-set to avoid unbounded growth
      if (this._seenEventIds.size > 1000) this._seenEventIds.clear();
    } catch (_err) {
      // Non-critical — upload event polling failure should not affect data fetch
    }
  }

  async fetchData() {
    if (!this.client) {
      const ready = await this.initClient();
      if (!ready || !this.client) {
        return { downloads: [], sharedFiles: [] };
      }
    }

    try {
      const [grouped, groupedUploads, sharedFiles] = await Promise.all([
        this.client.getDownloads(false),
        this.client.getUploads(false),
        this._fetchSharedFiles()
      ]);
      const downloads = this._flattenGroupedTransfers(grouped);
      const uploads = this._flattenGroupedTransfers(groupedUploads);
      this._refreshTransferCache(downloads);
      this._deriveStats(downloads, uploads);
      await this._pollUploadEvents();

      const items = downloads.map((transfer) => normalizeSlskdDownload(transfer, {
        instanceId: this.instanceId,
        displayName: this.displayName,
        clientType: this.clientType,
        downloadDirectory: this._downloadDirectory || ''
      }));

      return {
        downloads: items,
        sharedFiles
      };
    } catch (err) {
      this.error('❌ Error fetching slskd downloads:', logger.errorDetail(err));
      this._setConnectionError(err);
      if (this.client) {
        await this.client.disconnect();
      }
      this.client = null;
      this.scheduleReconnect(30000);
      return { downloads: [], sharedFiles: [] };
    }
  }

  async getLog() {
    if (!this.client) {
      const ready = await this.initClient();
      if (!ready || !this.client) {
        throw new Error('slskd not connected');
      }
    }

    const logs = await this.client.getLogs();
    if (Array.isArray(logs)) {
      return logs.map((entry) => {
        if (typeof entry === 'string') return entry;
        if (entry && typeof entry === 'object') return JSON.stringify(entry);
        return String(entry ?? '');
      }).join('\n');
    }

    if (logs && typeof logs === 'object') {
      return JSON.stringify(logs, null, 2);
    }

    return String(logs ?? '');
  }

  async getGlobalStats() {
    let telemetry = null;
    try {
      if (this.client) {
        telemetry = await this.client.getTelemetrySummary();
      }
    } catch (_) {
      // Non-critical — telemetry unavailable on older slskd versions
    }
    return {
      downloadSpeed: this.lastStats.downloadSpeed || 0,
      uploadSpeed: this.lastStats.uploadSpeed || 0,
      downloadTotal: telemetry?.Download?.Succeeded?.totalBytes ?? this.lastStats.totalDownloaded ?? 0,
      uploadTotal: telemetry?.Upload?.Succeeded?.totalBytes ?? this.lastStats.totalUploaded ?? 0,
      activeConnections: 0,
      listenPort: 0,
      isConnected: this.isConnected(),
      networkStatus: this.getNetworkStatus()
    };
  }

  async getStats() {
    return await this.getGlobalStats();
  }

  extractMetrics(rawStats = {}) {
    return {
      uploadSpeed: rawStats.uploadSpeed || 0,
      downloadSpeed: rawStats.downloadSpeed || 0,
      uploadTotal: rawStats.uploadTotal || 0,
      downloadTotal: rawStats.downloadTotal || 0
    };
  }

  getNetworkStatus() {
    const connected = this.isConnected();
    return {
      status: connected ? 'green' : 'red',
      text: connected ? 'Connected' : 'Disconnected',
      listenPort: this._clientConfig?.port || null
    };
  }

  _getCachedTransferByHash(hash) {
    const key = String(hash || '').toLowerCase();
    return this.lastDownloadsById.get(key);
  }

  async pause(fileHash) {
    const transfer = this._getCachedTransferByHash(fileHash);
    if (!transfer) {
      throw new Error(`Transfer not found: ${fileHash}`);
    }

    await this.client.cancelDownload(transfer.username, transfer.id, false);
    return true;
  }

  async stop(fileHash) {
    return this.pause(fileHash);
  }

  async resume(fileHash) {
    const transfer = this._getCachedTransferByHash(fileHash);
    if (!transfer) {
      throw new Error(`Transfer not found: ${fileHash}`);
    }

    await this.client.enqueueDownloads(transfer.username, [{
      filename: transfer.filename,
      size: Number(transfer.size) || 0
    }]);

    return true;
  }

  async deleteItem(fileHash) {
    const transfer = this._getCachedTransferByHash(fileHash);
    if (!transfer) {
      return {
        success: false,
        error: `Transfer not found: ${fileHash}`
      };
    }

    await this.client.cancelDownload(transfer.username, transfer.id, true);
    return {
      success: true,
      pathsToDelete: []
    };
  }

  async addMagnet() {
    throw new Error('Adding magnet links is not supported by slskd integration');
  }

  async addTorrentRaw() {
    throw new Error('Adding torrent files is not supported by slskd integration');
  }

  async setCategoryOrLabel() {
    return true;
  }

  /**
   * Extract normalized history metadata from a normalized slskd download item
   * @param {Object} item - Normalized slskd download data
   * @returns {Object} Normalized metadata for history DB
   */
  extractHistoryMetadata(item) {
    const size = item?.size || 0;
    const downloaded = item?.isComplete ? size : (item?.downloaded || 0);
    const uploaded = item?.uploadTotal || 0;
    const ratio = downloaded > 0 ? uploaded / downloaded : 0;

    return {
      hash: item?.hash?.toLowerCase(),
      instanceId: item?.instanceId || this.instanceId,
      size,
      name: item?.name || item?.rawName || item?.raw?.filename || 'Unknown',
      downloaded,
      uploaded,
      ratio,
      trackerDomain: null,
      directory: item?.directory || item?.raw?.directory || null,
      multiFile: false,
      category: item?.category || null
    };
  }

  // Backward-compatible alias for older call sites.
  async getHistoryMetadata(normalizedItem) {
    return this.extractHistoryMetadata(normalizedItem);
  }

  async cleanup() {
    if (this.client) {
      await this.client.disconnect();
      this.client = null;
    }
    this.releaseSearchLock();
  }

  async shutdown() {
    return this.cleanup();
  }
}

module.exports = SlskdManager;