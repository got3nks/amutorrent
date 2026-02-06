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
    clearSearchError,
    setSearchLocked,
    setSearchResults,
    setSearchPreviousResults,
    setSearchError
  } = useSearch();
  const { setDataDownloadedFiles, lastEd2kWasServerListRef } = useStaticData();

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

  const handleUpdateCategory = (categoryId, title, path, comment, color, priority, pathMappings = null) => {
    sendMessage({
      action: 'updateCategory',
      categoryId,
      title,
      path,
      comment,
      color,
      priority,
      pathMappings
    });
  };

  const handleDeleteCategory = (categoryNameOrId) => {
    // Support both name-based (unified) and ID-based (legacy) deletion
    if (categoryNameOrId === 'Default' || categoryNameOrId === 0) {
      addAppError('Cannot delete default category');
      return;
    }

    const isNumericId = typeof categoryNameOrId === 'number';
    sendMessage({
      action: 'deleteCategory',
      ...(isNumericId ? { categoryId: categoryNameOrId } : { name: categoryNameOrId })
    });
  };

  const handleSetFileCategory = (fileHashOrHashes, categoryNameOrId, options = {}) => {
    const fileHashes = Array.isArray(fileHashOrHashes) ? fileHashOrHashes : [fileHashOrHashes];
    // Support both name-based (unified) and ID-based (legacy) assignment
    const isNumericId = typeof categoryNameOrId === 'number';
    sendMessage({
      action: 'batchSetFileCategory',
      fileHashes,
      ...(isNumericId ? { categoryId: categoryNameOrId } : { categoryName: categoryNameOrId }),
      moveFiles: options.moveFiles || false
    });
  };

  // ============================================================================
  // SERVER MANAGEMENT
  // ============================================================================

  const handleServerAction = (ipPort, action) => {
    const [ip, port] = ipPort.split(':');
    sendMessage({
      action: 'serverDoAction',
      ip,
      port: parseInt(port),
      serverAction: action
    });
  };

  const handleServerRemove = (ipPort) => {
    const [ip, port] = ipPort.split(':');
    sendMessage({
      action: 'serverDoAction',
      ip,
      port: parseInt(port),
      serverAction: 'remove'
    });
  };

  // ============================================================================
  // SEARCH AND DOWNLOAD
  // ============================================================================

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    clearSearchError();
    setSearchLocked(true); // Lock immediately to show "Searching..." state
    setSearchPreviousResults([]); // Clear previous results when starting new search

    // Prowlarr uses REST API instead of WebSocket
    if (searchType === 'prowlarr') {
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
        setSearchLocked(false);
      }
      return;
    }

    sendMessage({
      action: 'search',
      query: searchQuery,
      type: searchType,
      extension: null
    });
  };

  const handleBatchDownload = (fileHashes, categoryName = null) => {
    const downloadCategory = categoryName !== null ? categoryName : searchDownloadCategory;
    // Send category name to backend - it will look up the aMule ID if needed
    sendMessage({ action: 'batchDownloadSearchResults', fileHashes, categoryName: downloadCategory });
    setDataDownloadedFiles(prev => {
      const next = new Set(prev);
      fileHashes.forEach(h => next.add(h));
      return next;
    });
  };

  const handleAddEd2kLinks = (input, categoryId = 0, isServerList = false) => {
    const links = extractEd2kLinks(input);

    if (links.length === 0) {
      addAppError('No valid ED2K links found');
      return;
    }

    // Track whether this was a server list addition (for response handling)
    lastEd2kWasServerListRef.current = isServerList;
    sendMessage({ action: "addEd2kLinks", links, categoryId });
  };

  const handleAddMagnetLinks = (links, label = '') => {
    if (!links || links.length === 0) {
      addAppError('No magnet links provided');
      return;
    }
    sendMessage({ action: "addMagnetLinks", links, label });
  };

  const handleAddTorrentFile = async (file, label = '') => {
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
          label
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

  // Add Prowlarr torrent to rTorrent
  const handleAddProwlarrTorrent = async (item, label = '') => {
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
          label
        })
      });
      const data = await response.json();
      if (!data.success) {
        addAppError(data.error || 'Failed to add torrent');
        return false;
      }
      return true;
    } catch (err) {
      addAppError(`Failed to add torrent: ${err.message}`);
      return false;
    }
  };

  // ============================================================================
  // FILE OPERATIONS (unified single/batch - always use batch action)
  // ============================================================================

  const handlePauseDownload = (fileHashOrHashes, clientTypeOrDownloads = 'amule', fileName = null) => {
    const items = Array.isArray(fileHashOrHashes)
      ? fileHashOrHashes.map(fileHash => {
          const download = (clientTypeOrDownloads || []).find(d => d.hash === fileHash);
          return { fileHash, clientType: download?.client || 'amule', fileName: download?.name };
        })
      : [{ fileHash: fileHashOrHashes, clientType: clientTypeOrDownloads, fileName }];
    sendMessage({ action: 'batchPause', items });
  };

  const handleResumeDownload = (fileHashOrHashes, clientTypeOrDownloads = 'amule', fileName = null) => {
    const items = Array.isArray(fileHashOrHashes)
      ? fileHashOrHashes.map(fileHash => {
          const download = (clientTypeOrDownloads || []).find(d => d.hash === fileHash);
          return { fileHash, clientType: download?.client || 'amule', fileName: download?.name };
        })
      : [{ fileHash: fileHashOrHashes, clientType: clientTypeOrDownloads, fileName }];
    sendMessage({ action: 'batchResume', items });
  };

  const handleStopDownload = (fileHashOrHashes, clientTypeOrDownloads = 'rtorrent', fileName = null) => {
    const items = Array.isArray(fileHashOrHashes)
      ? fileHashOrHashes.map(fileHash => {
          const download = (clientTypeOrDownloads || []).find(d => d.hash === fileHash);
          return { fileHash, clientType: download?.client || 'rtorrent', fileName: download?.name };
        })
      : [{ fileHash: fileHashOrHashes, clientType: clientTypeOrDownloads, fileName }];
    sendMessage({ action: 'batchStop', items });
  };

  const handleDeleteFile = (fileHashOrHashes, clientTypeOrDownloads = 'amule', deleteFiles = false, source = 'downloads', fileName = null) => {
    const items = Array.isArray(fileHashOrHashes)
      ? fileHashOrHashes.map(fileHash => {
          const download = (clientTypeOrDownloads || []).find(d => d.hash === fileHash);
          return { fileHash, clientType: download?.client || 'amule', fileName: download?.name };
        })
      : [{ fileHash: fileHashOrHashes, clientType: clientTypeOrDownloads, fileName }];
    sendMessage({ action: 'batchDelete', items, deleteFiles, source });
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
      deleteFile: handleDeleteFile
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
