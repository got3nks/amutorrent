/**
 * ActionsContext
 *
 * Provides all WebSocket action handlers to the app
 * Handles all WebSocket message sending and action handlers
 */

import React, { createContext, useContext } from 'https://esm.sh/react@18.2.0';
import { useAppState } from './AppStateContext.js';
import { useSearch } from './SearchContext.js';
import { useStaticData } from './StaticDataContext.js';
import { useWebSocketConnection } from './WebSocketContext.js';
import { extractEd2kLinks } from '../utils/index.js';

const { createElement: h } = React;

const ActionsContext = createContext(null);

/**
 * Internal hook for WebSocket actions
 * Uses WebSocketContext directly instead of requiring sendMessage prop
 * @returns {Object} Action handlers
 */
const useWebSocketActions = () => {
  // Get state from contexts
  const { addAppError, setAppCurrentView, setAppPage } = useAppState();
  const { sendMessage } = useWebSocketConnection();
  const {
    searchQuery,
    searchType,
    searchDownloadCategory,
    searchInstanceId,
    clearSearchError,
    setSearchLocked,
    setSearchResults,
    setSearchPreviousResults,
    setSearchError,
    setSearchInstanceId
  } = useSearch();
  const { setDataDownloadedFiles, lastEd2kWasServerListRef, instances } = useStaticData();

  // Resolve which instance a search should target: the one serving the selected
  // search source. Keeps the current selection if it still serves the source,
  // otherwise falls back to the first that does. Returns null when none is
  // connected (the handler then surfaces a clear error).
  const resolveSearchInstanceId = () => {
    // Serving instances are those whose clientMeta searchSources include the
    // selected source value (shipped via instances[id].capabilities) — no
    // per-network branch, so a new searchable network resolves automatically.
    const serving = Object.entries(instances || {})
      .filter(([, i]) => i.connected && (i.capabilities?.searchSources || []).some(s => s.value === searchType))
      .map(([id]) => id);
    if (serving.includes(searchInstanceId)) return searchInstanceId;
    return serving[0] || null;
  };

  // ============================================================================
  // CATEGORY MANAGEMENT
  // ============================================================================

  const handleCreateCategory = (title, path, comment, color, priority, pathMappings = null) => {
    sendMessage({
      action: 'createCategory',
      title,
      path,
      comment,
      color,
      priority,
      pathMappings
    });
  };

  const handleUpdateCategory = (categoryName, title, path, comment, color, priority, pathMappings = null) => {
    sendMessage({
      action: 'updateCategory',
      name: categoryName,
      title,
      path,
      comment,
      color,
      priority,
      pathMappings
    });
  };

  const handleDeleteCategory = (categoryName) => {
    if (!categoryName || categoryName === 'Default') {
      addAppError('Cannot delete default category');
      return;
    }

    sendMessage({
      action: 'deleteCategory',
      name: categoryName
    });
  };

  const handleSetFileCategory = (items, categoryName, options = {}) => {
    sendMessage({
      action: 'batchSetFileCategory',
      items,
      categoryName,
      moveFiles: options.moveFiles || false
    });
  };

  // ============================================================================
  // SERVER MANAGEMENT
  // ============================================================================

  const handleServerAction = (ipPort, action, instanceId) => {
    const [ip, port] = ipPort.split(':');
    sendMessage({
      action: 'serverDoAction',
      ip,
      port: parseInt(port),
      serverAction: action,
      ...(instanceId && { instanceId })
    });
  };

  const handleServerRemove = (ipPort, instanceId) => {
    const [ip, port] = ipPort.split(':');
    sendMessage({
      action: 'serverDoAction',
      ip,
      port: parseInt(port),
      serverAction: 'remove',
      ...(instanceId && { instanceId })
    });
  };

  // ============================================================================
  // SEARCH AND DOWNLOAD
  // ============================================================================

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    clearSearchError();
    setSearchPreviousResults([]); // Clear previous results when starting new search

    // Prowlarr uses REST API instead of WebSocket, so it never broadcasts a
    // search lock — it holds and releases its own key around the fetch.
    if (searchType === 'prowlarr') {
      setSearchLocked(true, 'prowlarr'); // show "Searching..." state
      try {
        const response = await fetch('/api/prowlarr/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: searchQuery })
        });
        const data = await response.json();
        if (data.success) {
          // Results are already transformed by the backend
          const results = data.results || [];
          if (results.length === 0) {
            setSearchError('No results found');
          } else {
            // Navigate to search results view (same as aMule search)
            setSearchResults(results);
            setAppCurrentView('search-results');
            setAppPage(0);
          }
        } else {
          setSearchError(data.error || 'Prowlarr search failed');
        }
      } catch (err) {
        setSearchError(`Prowlarr search failed: ${err.message}`);
      } finally {
        setSearchLocked(false, 'prowlarr');
      }
      return;
    }

    // Target the instance matching the selected source's client type, and
    // persist it so the follow-up batch download routes to the same instance.
    const targetInstanceId = resolveSearchInstanceId();
    if (targetInstanceId && targetInstanceId !== searchInstanceId) {
      setSearchInstanceId(targetInstanceId);
    }
    // Lock the serving instance optimistically; the server echoes the lock for
    // the same instance and clears it when the search finishes. With no resolved
    // instance, skip the optimistic hold and let the server's broadcast drive it,
    // so no orphan key can linger.
    if (targetInstanceId) setSearchLocked(true, targetInstanceId);
    sendMessage({
      action: 'search',
      query: searchQuery,
      type: searchType,
      extension: null,
      ...(targetInstanceId && { instanceId: targetInstanceId })
    });
  };

  const handleBatchDownload = (fileHashes, categoryName = null) => {
    const downloadCategory = categoryName !== null ? categoryName : searchDownloadCategory;
    // Send category name to backend - it will look up the aMule ID if needed
    const targetInstance = searchInstanceId || 'amule';
    sendMessage({ action: 'batchDownloadSearchResults', fileHashes, categoryName: downloadCategory, ...(searchInstanceId && { instanceId: searchInstanceId }) });
    setDataDownloadedFiles(prev => {
      const next = new Map(prev);
      fileHashes.forEach(h => {
        const instances = next.get(h) || new Set();
        instances.add(targetInstance);
        next.set(h, instances);
      });
      return next;
    });
  };

  const handleAddEd2kLinks = (input, categoryName = 'Default', isServerList = false, instanceId = null) => {
    // Extract using the schemes the connected ed2k-path (non-tracker) clients
    // accept, so a new network's scheme isn't dropped here. Fall back to the
    // defaults when nothing's connected yet.
    const ed2kSchemes = [...new Set(
      Object.values(instances || {})
        .filter(i => i.connected && !i.capabilities?.trackers)
        .flatMap(i => i.capabilities?.linkSchemes || [])
    )];
    const links = extractEd2kLinks(input, ed2kSchemes.length ? ed2kSchemes : undefined);

    if (links.length === 0) {
      addAppError('No valid ED2K links found');
      return;
    }

    // Track whether this was a server list addition (for response handling)
    lastEd2kWasServerListRef.current = isServerList;
    const effectiveInstanceId = instanceId || searchInstanceId || null;
    sendMessage({
      action: "addEd2kLinks",
      links,
      categoryName,
      ...(effectiveInstanceId && { instanceId: effectiveInstanceId })
    });
  };

  const handleAddMagnetLinks = (links, label = '', instanceId = null, clientType = 'rtorrent', savePath = null) => {
    if (!links || links.length === 0) {
      addAppError('No magnet links provided');
      return;
    }
    sendMessage({ action: "addMagnetLinks", links, label, clientId: clientType, ...(instanceId && { instanceId }), ...(savePath && { savePath }) });
  };

  const handleAddTorrentFile = async (file, label = '', instanceId = null, clientType = 'rtorrent', savePath = null) => {
    if (!file) {
      addAppError('No torrent file provided');
      return;
    }

    try {
      // Read file as base64
      const reader = new FileReader();
      reader.onload = () => {
        const base64Data = reader.result.split(',')[1]; // Remove data URL prefix
        sendMessage({
          action: "addTorrentFile",
          fileData: base64Data,
          fileName: file.name,
          label,
          clientId: clientType,
          ...(instanceId && { instanceId }),
          ...(savePath && { savePath })
        });
      };
      reader.onerror = () => {
        addAppError('Failed to read torrent file');
      };
      reader.readAsDataURL(file);
    } catch (err) {
      addAppError(`Failed to process torrent file: ${err.message}`);
    }
  };

  // Add Prowlarr torrent to BitTorrent client
  const handleAddProwlarrTorrent = async (item, label = '', instanceId = null, clientType = 'rtorrent') => {
    try {
      const downloadUrl = item.magnetUrl || item.downloadUrl;
      if (!downloadUrl) {
        addAppError('No download URL available for this item');
        return false;
      }

      const response = await fetch('/api/prowlarr/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          downloadUrl,
          title: item.fileName,
          label,
          clientId: clientType,
          ...(instanceId && { instanceId })
        })
      });
      const data = await response.json();
      if (!data.success) {
        addAppError(data.error || 'Failed to add torrent');
        return null;
      }
      return data.hash || true;
    } catch (err) {
      addAppError(`Failed to add torrent: ${err.message}`);
      return null;
    }
  };

  // ============================================================================
  // FILE OPERATIONS (unified single/batch - always use batch action)
  // ============================================================================

  const handlePauseDownload = (itemsOrHash, clientType = 'amule', fileName = null, instanceId = null) => {
    const items = Array.isArray(itemsOrHash)
      ? itemsOrHash
      : [{ fileHash: itemsOrHash, clientType, fileName, instanceId }];
    sendMessage({ action: 'batchPause', items });
  };

  const handleResumeDownload = (itemsOrHash, clientType = 'amule', fileName = null, instanceId = null) => {
    const items = Array.isArray(itemsOrHash)
      ? itemsOrHash
      : [{ fileHash: itemsOrHash, clientType, fileName, instanceId }];
    sendMessage({ action: 'batchResume', items });
  };

  const handleStopDownload = (itemsOrHash, clientType = 'rtorrent', fileName = null, instanceId = null) => {
    const items = Array.isArray(itemsOrHash)
      ? itemsOrHash
      : [{ fileHash: itemsOrHash, clientType, fileName, instanceId }];
    sendMessage({ action: 'batchStop', items });
  };

  const handleDeleteFile = (itemsOrHash, clientType = 'amule', deleteFiles = false, source = 'downloads', fileName = null, instanceId = null) => {
    const items = Array.isArray(itemsOrHash)
      ? itemsOrHash
      : [{ fileHash: itemsOrHash, clientType, fileName, instanceId }];
    sendMessage({ action: 'batchDelete', items, deleteFiles, source });
  };

  const handleRenameFile = (fileHash, newName, instanceId) => {
    sendMessage({ action: 'renameFile', fileHash, newName, instanceId });
  };

  const handleSetFileRatingComment = (fileHash, comment, rating, instanceId) => {
    sendMessage({
      action: 'setFileRatingComment',
      fileHash,
      comment: typeof comment === 'string' ? comment : '',
      rating: Number.isInteger(rating) ? rating : 0,
      instanceId
    });
  };

  return {
    categories: {
      create: handleCreateCategory,
      update: handleUpdateCategory,
      delete: handleDeleteCategory,
      setFileCategory: handleSetFileCategory
    },
    servers: {
      action: handleServerAction,
      remove: handleServerRemove
    },
    search: {
      perform: handleSearch,
      batchDownload: handleBatchDownload,
      addEd2kLinks: handleAddEd2kLinks,
      addMagnetLinks: handleAddMagnetLinks,
      addTorrentFile: handleAddTorrentFile,
      addProwlarrTorrent: handleAddProwlarrTorrent
    },
    files: {
      pause: handlePauseDownload,
      resume: handleResumeDownload,
      stop: handleStopDownload,
      deleteFile: handleDeleteFile,
      renameFile: handleRenameFile,
      setFileRatingComment: handleSetFileRatingComment
    }
  };
};

export const ActionsProvider = ({ children }) => {
  // Create actions using internal hook (uses WebSocketContext internally)
  const actions = useWebSocketActions();

  return h(ActionsContext.Provider, { value: actions }, children);
};

export const useActions = () => {
  const context = useContext(ActionsContext);
  if (!context) {
    throw new Error('useActions must be used within ActionsProvider');
  }
  return context;
};
