/**
 * useWebSocketActions Hook
 *
 * Handles all WebSocket message sending and action handlers
 * Consolidates event handlers that were previously in app.js
 */

import { extractEd2kLinks, ERROR_DISPLAY_DURATION } from '../utils/index.js';

/**
 * Custom hook for WebSocket actions
 * @param {Object} params - Hook parameters
 * @param {Function} params.sendMessage - WebSocket send message function
 * @param {Function} params.setLoading - Set loading state
 * @param {Function} params.setError - Set error state
 * @param {Function} params.setSearchState - Set search state
 * @param {Function} params.setDownloadedFiles - Set downloaded files
 * @param {Object} params.searchState - Current search state
 * @param {Object} params.categoryState - Current category state
 * @param {Object} params.deleteModal - Delete modal state
 * @param {Object} params.deleteCategoryModal - Delete category modal state
 * @param {Object} params.servers - Servers list
 * @param {Object} params.modalControls - Modal control functions
 * @param {Object} params.fetchFunctions - Data fetching functions
 * @param {Object} params.refs - References (isServerListAdd)
 * @returns {Object} Action handlers
 */
export const useWebSocketActions = ({
  sendMessage,
  setLoading,
  setError,
  setSearchState,
  setDownloadedFiles,
  searchState,
  categoryState,
  deleteModal,
  deleteCategoryModal,
  servers,
  modalControls: {
    closeCategoryModal,
    closeFileCategoryModal,
    closeDeleteModal,
    openDeleteModal,
    openDeleteCategoryModal,
    closeDeleteCategoryModal
  },
  fetchFunctions: {
    fetchDownloads,
    fetchServers
  },
  refs: {
    isServerListAdd
  }
}) => {
  // ============================================================================
  // CATEGORY MANAGEMENT
  // ============================================================================

  const handleCreateCategory = (title, path, comment, color, priority) => {
    sendMessage({
      action: 'createCategory',
      title,
      path,
      comment,
      color,
      priority
    });
    closeCategoryModal();
  };

  const handleUpdateCategory = (categoryId, title, path, comment, color, priority) => {
    sendMessage({
      action: 'updateCategory',
      categoryId,
      title,
      path,
      comment,
      color,
      priority
    });
    closeCategoryModal();
  };

  const handleDeleteCategory = (categoryId, categoryName) => {
    if (categoryId === 0) {
      setError('Cannot delete default category');
      return;
    }

    openDeleteCategoryModal({
      categoryId,
      categoryName
    });
  };

  const confirmDeleteCategory = () => {
    sendMessage({
      action: 'deleteCategory',
      categoryId: deleteCategoryModal.categoryId
    });
    closeDeleteCategoryModal();
  };

  const handleSetFileCategory = (fileHash, categoryId) => {
    sendMessage({
      action: 'setFileCategory',
      fileHash,
      categoryId
    });
    closeFileCategoryModal();
  };

  // ============================================================================
  // SERVER MANAGEMENT
  // ============================================================================

  const handleServerAction = (ipPort, action) => {
    if (action === 'remove') {
      // Extract server name from servers array
      const server = servers.find(s => s._value === ipPort);
      const serverName = server?.EC_TAG_SERVER_NAME || ipPort;
      openDeleteModal({ fileHash: null, fileName: serverName, isServer: true, serverAddress: ipPort });
      return;
    }

    const [ip, port] = ipPort.split(':');
    sendMessage({
      action: 'serverDoAction',
      ip,
      port: parseInt(port),
      serverAction: action
    });
  };

  // ============================================================================
  // SEARCH AND DOWNLOAD
  // ============================================================================

  const handleSearch = async () => {
    if (!searchState.query.trim()) return;
    setLoading(true);
    setSearchState(prev => ({ ...prev, error: '' }));

    sendMessage({
      action: 'search',
      query: searchState.query,
      type: searchState.type,
      extension: null
    });
  };

  const handleDownload = (fileHash, categoryId = null) => {
    const downloadCategoryId = categoryId !== null ? categoryId : categoryState.searchDownloadId;
    sendMessage({ action: 'download', fileHash, categoryId: downloadCategoryId });
    setDownloadedFiles(prev => new Set(prev).add(fileHash));
  };

  const handleAddEd2kLinks = (input, isServerList = false) => {
    const links = extractEd2kLinks(input);

    if (links.length === 0) {
      setError('No valid ED2K links found');
      setTimeout(() => setError(""), ERROR_DISPLAY_DURATION);
      return;
    }

    setLoading(true);
    isServerListAdd.current = isServerList;
    sendMessage({ action: "addEd2kLinks", links, categoryId: categoryState.selectedId });
  };

  // ============================================================================
  // FILE OPERATIONS
  // ============================================================================

  const handlePauseDownload = (fileHash) => {
    sendMessage({ action: 'pauseDownload', fileHash });
  };

  const handleResumeDownload = (fileHash) => {
    sendMessage({ action: 'resumeDownload', fileHash });
  };

  // ============================================================================
  // FILE AND SERVER DELETION
  // ============================================================================

  const handleDelete = (fileHash, fileName) => {
    openDeleteModal({ fileHash, fileName });
  };

  const confirmDelete = () => {
    if (deleteModal.isServer) {
      // Handle server removal
      const [ip, port] = deleteModal.serverAddress.split(':');
      sendMessage({
        action: 'serverDoAction',
        ip,
        port: parseInt(port),
        serverAction: 'remove'
      });
      closeDeleteModal();

      setTimeout(() => {
        fetchServers();
      }, 500);
    } else {
      // Handle file deletion
      const { fileHash } = deleteModal;
      sendMessage({ action: 'delete', fileHash });
      closeDeleteModal();

      setTimeout(() => {
        fetchDownloads();
      }, 100);
    }
  };

  const cancelDelete = () => {
    closeDeleteModal();
  };

  // ============================================================================
  // RETURN ALL HANDLERS
  // ============================================================================

  return {
    // Category management
    handleCreateCategory,
    handleUpdateCategory,
    handleDeleteCategory,
    confirmDeleteCategory,
    handleSetFileCategory,

    // Server management
    handleServerAction,

    // Search and download
    handleSearch,
    handleDownload,
    handleAddEd2kLinks,

    // File operations
    handlePauseDownload,
    handleResumeDownload,

    // Deletion
    handleDelete,
    confirmDelete,
    cancelDelete
  };
};
