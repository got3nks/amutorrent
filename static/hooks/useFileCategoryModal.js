/**
 * useFileCategoryModal Hook
 *
 * Manages FileCategoryModal state and returns ready-to-render modal element.
 * Simplifies modal usage in views by encapsulating state and rendering.
 * Includes permission checking for move operations (matching useViewDeleteModal pattern).
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'https://esm.sh/react@18.2.0';
import FileCategoryModal from '../components/modals/FileCategoryModal.js';
import { useStaticData } from '../contexts/StaticDataContext.js';
import { useAppState } from '../contexts/AppStateContext.js';
import { useWebSocketConnection } from '../contexts/WebSocketContext.js';

const { createElement: h } = React;

/**
 * Hook for managing FileCategoryModal in views
 * @param {Object} options
 * @param {Function} options.onSubmit - Handler called when category is changed (fileHash, categoryName, options)
 * @param {Function} options.getSelectedHashes - Function to get selected file hashes (for batch operations)
 * @param {Array} options.dataArray - Data array to find items by hash (for batch operations)
 * @returns {Object} { openCategoryModal, handleBatchSetCategory, FileCategoryModalElement }
 */
export const useFileCategoryModal = ({ onSubmit, getSelectedHashes, dataArray }) => {
  const { dataCategories: categories, clientDefaultPaths } = useStaticData();
  const { handleAppNavigate } = useAppState();
  const { sendMessage, addMessageHandler, removeMessageHandler } = useWebSocketConnection();

  const [modalState, setModalState] = useState({
    show: false,
    fileHash: null,
    fileName: '',
    fileCount: 0,
    currentCategory: 'Default',
    items: []
  });

  // Permission check state (matching useViewDeleteModal pattern)
  const [permissionCheck, setPermissionCheck] = useState({
    loading: false,
    canMove: true,
    error: null,
    destPath: null
  });

  // Track which category we've checked permissions for
  const lastCheckedCategory = useRef(null);

  // Selected category state (controlled from hook for permission checking)
  const [selectedCategory, setSelectedCategory] = useState('Default');

  // Listen for permission check results
  useEffect(() => {
    const handleMovePermissions = (data) => {
      if (data.type === 'move-permissions') {
        const destPath = data.destPath || null;

        if (data.error) {
          setPermissionCheck({ loading: false, canMove: false, error: data.error, destPath });
          return;
        }

        // Check if overall selection is mixed (multiple client types)
        const allClientTypes = new Set((data.results || []).map(r => r.clientType).filter(Boolean));
        const isMixedSelection = allClientTypes.size > 1;

        // Check for client-specific errors in results
        const errorResults = data.results?.filter(r => r.reason === 'dest_error' || r.reason === 'source_error') || [];
        if (errorResults.length > 0) {
          // Group errors by client type
          const errorsByClient = {};
          for (const r of errorResults) {
            const client = r.clientType || 'unknown';
            if (!errorsByClient[client]) {
              errorsByClient[client] = r.message;
            }
          }

          // Helper to get client label
          const getClientLabel = (client) =>
            client === 'amule' ? 'aMule' : client === 'rtorrent' ? 'rTorrent' : client;

          // Build error message - show client labels only for mixed selections
          const clientTypes = Object.keys(errorsByClient);
          let errorMessage;
          if (isMixedSelection && clientTypes[0] !== 'unknown') {
            // Mixed selection - show client labels
            errorMessage = clientTypes.map(client => {
              return `${getClientLabel(client)}: ${errorsByClient[client]}`;
            }).join('\n');
          } else {
            // Single client selection - no labels needed
            errorMessage = Object.values(errorsByClient).join('\n');
          }

          setPermissionCheck({ loading: false, canMove: false, error: errorMessage, destPath });
          return;
        }

        // Fallback to destError if no per-result errors (shouldn't happen but just in case)
        if (data.destError) {
          setPermissionCheck({ loading: false, canMove: false, error: data.destError, destPath });
          return;
        }

        // No errors - can move
        setPermissionCheck({ loading: false, canMove: true, error: null, destPath });
      }
    };

    addMessageHandler(handleMovePermissions);
    return () => removeMessageHandler(handleMovePermissions);
  }, [addMessageHandler, removeMessageHandler]);

  // Detect any aMule files in selection (for info message about category path)
  const hasAmuleFiles = useMemo(() => {
    return modalState.items.some(i => i.client === 'amule');
  }, [modalState.items]);

  // Detect aMule shared files in selection (completed files only, not downloads sharing chunks)
  // These require manual move since aMule doesn't auto-move completed files
  const hasAmuleSharedFiles = useMemo(() => {
    return modalState.items.some(i => i.shared && i.client === 'amule' && !i.downloading);
  }, [modalState.items]);

  // Detect rTorrent items in selection
  const hasRtorrentItems = useMemo(() => {
    return modalState.items.some(i => i.client === 'rtorrent');
  }, [modalState.items]);

  // For aMule shared files, move is forced (they don't auto-move like downloads)
  const forceMove = hasAmuleSharedFiles;

  // Determine if move option should be shown for current selection and category
  const showMoveOption = useMemo(() => {
    if (!selectedCategory || !modalState.show) return false;

    const items = modalState.items;
    if (items.length === 0) return false;

    // Check for rtorrent items
    const rtorrentItems = items.filter(i => i.client === 'rtorrent');
    // Check for aMule shared items (completed files only, not downloads sharing chunks)
    const amuleSharedItems = items.filter(i => i.shared && i.client === 'amule' && !i.downloading);

    // If no items need move handling, don't show option
    if (rtorrentItems.length === 0 && amuleSharedItems.length === 0) return false;

    // Check if target category has a configured path
    // In Docker: pathMappings[client] = local path, path = remote path
    // Native: no pathMappings, path is used for both
    // If category has no path, clients use Default category's path
    const targetCat = categories.find(c => (c.name || c.title) === selectedCategory);

    // Check rtorrent paths
    let rtorrentNeedsMove = false;
    if (rtorrentItems.length > 0) {
      let targetLocalPath = targetCat?.pathMappings?.rtorrent || targetCat?.path;
      let targetRemotePath = targetCat?.path;

      // Fall back to Default category if no path configured
      if (!targetLocalPath) {
        const defaultCat = categories.find(c => (c.name || c.title) === 'Default');
        if (defaultCat) {
          targetLocalPath = defaultCat.pathMappings?.rtorrent || defaultCat.path;
          targetRemotePath = defaultCat.path || targetLocalPath;
        }
      }
      // Fall back to client default path if still no path
      if (!targetLocalPath && clientDefaultPaths?.rtorrent) {
        targetLocalPath = clientDefaultPaths.rtorrent;
        targetRemotePath = clientDefaultPaths.rtorrent;
      }
      targetRemotePath = targetRemotePath || targetLocalPath;

      if (targetLocalPath) {
        rtorrentNeedsMove = rtorrentItems.some(item => item.directory !== targetRemotePath);
      }
    }

    // Check aMule shared paths
    let amuleNeedsMove = false;
    if (amuleSharedItems.length > 0) {
      let targetLocalPath = targetCat?.pathMappings?.amule || targetCat?.path;
      let targetRemotePath = targetCat?.path;

      // Fall back to Default category if no path configured
      if (!targetLocalPath) {
        const defaultCat = categories.find(c => (c.name || c.title) === 'Default');
        if (defaultCat) {
          targetLocalPath = defaultCat.pathMappings?.amule || defaultCat.path;
          targetRemotePath = defaultCat.path || targetLocalPath;
        }
      }
      // Fall back to client default path if still no path
      if (!targetLocalPath && clientDefaultPaths?.amule) {
        targetLocalPath = clientDefaultPaths.amule;
        targetRemotePath = clientDefaultPaths.amule;
      }
      targetRemotePath = targetRemotePath || targetLocalPath;

      if (targetLocalPath) {
        // aMule shared files use filePath property (directory containing the file)
        amuleNeedsMove = amuleSharedItems.some(item => item.filePath !== targetRemotePath);
      }
    }

    return rtorrentNeedsMove || amuleNeedsMove;
  }, [selectedCategory, categories, modalState.items, modalState.show, clientDefaultPaths]);

  // Request permission check when move option becomes visible or category changes
  useEffect(() => {
    if (!showMoveOption || !modalState.show) {
      setPermissionCheck({ loading: false, canMove: true, error: null, destPath: null });
      lastCheckedCategory.current = null;
      return;
    }

    // Don't re-check if we already checked this category
    if (lastCheckedCategory.current === selectedCategory) {
      return;
    }

    // Get items that need move - both rtorrent and aMule shared files (completed only)
    const rtorrentItems = modalState.items.filter(i => i.client === 'rtorrent');
    const amuleSharedItems = modalState.items.filter(i => i.shared && i.client === 'amule' && !i.downloading);
    const fileHashes = [...rtorrentItems, ...amuleSharedItems].map(i => i.hash);

    if (fileHashes.length === 0) return;

    setPermissionCheck({ loading: true, canMove: true, error: null, destPath: null });
    lastCheckedCategory.current = selectedCategory;

    // Request permission check via WebSocket
    sendMessage({
      action: 'checkMovePermissions',
      fileHashes,
      categoryName: selectedCategory
    });
  }, [showMoveOption, selectedCategory, modalState.items, modalState.show, sendMessage]);

  // Handle category change from modal
  const handleCategoryChange = useCallback((newCategory) => {
    setSelectedCategory(newCategory);
  }, []);

  // Open modal for single file (positional args)
  const openCategoryModal = useCallback((fileHash, fileName, currentCategory) => {
    // Find the item in dataArray if available
    const item = dataArray?.find(d => d.hash === fileHash);
    const initialCategory = currentCategory || 'Default';
    setSelectedCategory(initialCategory);
    lastCheckedCategory.current = null;
    setPermissionCheck({ loading: false, canMove: true, error: null, destPath: null });
    setModalState({
      show: true,
      fileHash,
      fileName: fileName || '',
      fileCount: 0,
      currentCategory: initialCategory,
      items: item ? [item] : []
    });
  }, [dataArray]);

  // Handle batch category change (uses getSelectedHashes and dataArray)
  const handleBatchSetCategory = useCallback(() => {
    if (!getSelectedHashes || !dataArray) return;
    const fileHashes = getSelectedHashes();
    if (fileHashes.length === 0) return;
    const selectedItems = dataArray.filter(d => fileHashes.includes(d.hash));
    const firstSelected = selectedItems[0];
    const initialCategory = firstSelected?.category || 'Default';
    setSelectedCategory(initialCategory);
    lastCheckedCategory.current = null;
    setPermissionCheck({ loading: false, canMove: true, error: null, destPath: null });
    setModalState({
      show: true,
      fileHash: fileHashes,
      fileName: '',
      fileCount: fileHashes.length,
      currentCategory: initialCategory,
      items: selectedItems
    });
  }, [getSelectedHashes, dataArray]);

  // Close modal
  const closeModal = useCallback(() => {
    setModalState(prev => ({ ...prev, show: false }));
    setPermissionCheck({ loading: false, canMove: true, error: null, destPath: null });
    lastCheckedCategory.current = null;
  }, []);

  // Navigate to categories view (for "Edit category mappings" link in warnings)
  const onEditMappings = useCallback(() => {
    closeModal();
    handleAppNavigate('categories');
  }, [closeModal, handleAppNavigate]);

  // Handle submit and close
  const handleSubmit = useCallback((fileHash, categoryName, options = {}) => {
    if (onSubmit) {
      onSubmit(fileHash, categoryName, options);
    }
    closeModal();
  }, [onSubmit, closeModal]);

  // Pre-rendered modal element
  const FileCategoryModalElement = useMemo(() => {
    return h(FileCategoryModal, {
      show: modalState.show,
      fileHash: modalState.fileHash,
      fileName: modalState.fileName,
      fileCount: modalState.fileCount,
      currentCategory: modalState.currentCategory,
      items: modalState.items,
      selectedCategory,
      onCategoryChange: handleCategoryChange,
      showMoveOption,
      permissionCheck,
      hasAmuleFiles,
      hasAmuleSharedFiles,
      hasRtorrentItems,
      forceMove,
      onSubmit: handleSubmit,
      onClose: closeModal,
      onEditMappings
    });
  }, [
    modalState.show,
    modalState.fileHash,
    modalState.fileName,
    modalState.fileCount,
    modalState.currentCategory,
    modalState.items,
    selectedCategory,
    handleCategoryChange,
    showMoveOption,
    permissionCheck,
    hasAmuleFiles,
    hasAmuleSharedFiles,
    hasRtorrentItems,
    forceMove,
    handleSubmit,
    closeModal,
    onEditMappings
  ]);

  return {
    openCategoryModal,
    handleBatchSetCategory,
    FileCategoryModalElement
  };
};

export default useFileCategoryModal;
