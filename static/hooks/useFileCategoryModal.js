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
import { itemKey } from '../utils/itemKey.js';

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
  const { dataCategories: categories, clientDefaultPaths, instances, getCapabilities } = useStaticData();
  const { handleAppNavigate } = useAppState();
  const { sendMessage, addMessageHandler, removeMessageHandler } = useWebSocketConnection();

  // Ref for instances to avoid re-registering permission handler on every broadcast
  const instancesRef = useRef(instances);
  instancesRef.current = instances;

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

          // Look up display name from instances metadata (avoids hardcoded client-type map)
          const getClientLabel = (clientType) => {
            const inst = Object.values(instancesRef.current).find(i => i.type === clientType);
            return inst?.name || clientType;
          };

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

  // Capability-driven flags for the modal items
  // hasAutoMoveItems: some items auto-move on category change (e.g. aMule active downloads)
  // hasOptionalMoveItems: some items need explicit move (checkbox) — torrent clients
  // forceMove: some items MUST be moved for category change (shared files from auto-move clients)
  const { hasAutoMoveItems, hasOptionalMoveItems, forceMove } = useMemo(() => {
    let autoMove = false, optionalMove = false, forced = false;
    for (const item of modalState.items) {
      const caps = getCapabilities(item.instanceId);
      // A client that can't relocate a file (Rucio) only ever changes the
      // category in place — it never contributes a move to the modal.
      if (caps.noFileMove) continue;
      if (caps.moveSharedForCategoryChange && item.shared && !item.downloading) {
        forced = true;    // shared files must be physically moved for category change
      } else if (caps.categoryChangeAutoMoves) {
        autoMove = true;  // active downloads auto-move (no explicit handling needed)
      } else {
        optionalMove = true; // client doesn't auto-move (optional checkbox)
      }
    }
    return { hasAutoMoveItems: autoMove, hasOptionalMoveItems: optionalMove, forceMove: forced };
  }, [modalState.items, getCapabilities]);

  // Determine if move option should be shown for current selection and category
  const showMoveOption = useMemo(() => {
    if (!selectedCategory || !modalState.show) return false;

    const items = modalState.items;
    if (items.length === 0) return false;

    const targetCat = categories.find(c => (c.name || c.title) === selectedCategory);
    const defaultCat = categories.find(c => (c.name || c.title) === 'Default');

    // Check per-item if any file needs moving (directory differs from target)
    // Handles multi-instance: each item's instanceId resolves its own path mapping
    return items.some(item => {
      const caps = getCapabilities(item.instanceId);
      if (caps.noFileMove) return false; // can't relocate a file — never show Move
      const clientType = item.client;
      const instanceId = item.instanceId;
      const needsManualMove = caps.moveSharedForCategoryChange && item.shared && !item.downloading;

      // Skip items that auto-move on category change (unless shared files need manual move)
      if (caps.categoryChangeAutoMoves && !needsManualMove) return false;

      // Resolve target path: per-instance mapping → per-type mapping → category path → Default category → client default
      let targetLocalPath = targetCat?.pathMappings?.[instanceId] || targetCat?.pathMappings?.[clientType] || targetCat?.path;
      let targetRemotePath = targetCat?.path;

      if (!targetLocalPath && defaultCat) {
        targetLocalPath = defaultCat.pathMappings?.[instanceId] || defaultCat.pathMappings?.[clientType] || defaultCat.path;
        targetRemotePath = defaultCat.path || targetLocalPath;
      }
      if (!targetLocalPath && clientDefaultPaths?.[instanceId]) {
        targetLocalPath = clientDefaultPaths[instanceId];
        targetRemotePath = clientDefaultPaths[instanceId];
      }
      targetRemotePath = targetRemotePath || targetLocalPath;

      if (!targetLocalPath) return false;

      // Shared files use filePath; others use directory
      if (needsManualMove) {
        return item.filePath !== targetRemotePath;
      }
      return item.directory !== targetRemotePath;
    });
  }, [selectedCategory, categories, modalState.items, modalState.show, clientDefaultPaths, getCapabilities]);

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

    // Get items that need move — items where client doesn't auto-move, or shared files needing manual move
    const moveItems = modalState.items.filter(item => {
      const caps = getCapabilities(item.instanceId);
      if (caps.noFileMove) return false; // can't relocate a file
      const needsManualMove = caps.moveSharedForCategoryChange && item.shared && !item.downloading;
      return !caps.categoryChangeAutoMoves || needsManualMove;
    });

    if (moveItems.length === 0) return;

    setPermissionCheck({ loading: true, canMove: true, error: null, destPath: null });
    lastCheckedCategory.current = selectedCategory;

    // Request permission check via WebSocket (send items with instanceId for compound-key lookup)
    sendMessage({
      action: 'checkMovePermissions',
      items: moveItems.map(i => ({ fileHash: i.hash, instanceId: i.instanceId })),
      categoryName: selectedCategory
    });
  }, [showMoveOption, selectedCategory, modalState.items, modalState.show, sendMessage]);

  // Handle category change from modal
  const handleCategoryChange = useCallback((newCategory) => {
    setSelectedCategory(newCategory);
  }, []);

  // Open modal for single file (positional args)
  const openCategoryModal = useCallback((fileHash, fileName, currentCategory, instanceId = null) => {
    // Find the item in dataArray if available — use instanceId for precise match
    const item = dataArray?.find(d =>
      instanceId ? (d.instanceId === instanceId && d.hash === fileHash) : d.hash === fileHash
    );
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
      instanceId,
      items: item ? [item] : []
    });
  }, [dataArray]);

  // Handle batch category change (uses getSelectedHashes — returns compound keys)
  const handleBatchSetCategory = useCallback(() => {
    if (!getSelectedHashes || !dataArray) return;
    const compoundKeys = getSelectedHashes();
    if (compoundKeys.length === 0) return;
    const keySet = new Set(compoundKeys);
    const selectedItems = dataArray.filter(d => keySet.has(itemKey(d.instanceId, d.hash)));
    const firstSelected = selectedItems[0];
    const initialCategory = firstSelected?.category || 'Default';
    setSelectedCategory(initialCategory);
    lastCheckedCategory.current = null;
    setPermissionCheck({ loading: false, canMove: true, error: null, destPath: null });
    setModalState({
      show: true,
      fileHash: compoundKeys,  // compound keys, not raw hashes
      fileName: '',
      fileCount: compoundKeys.length,
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
  const handleSubmit = useCallback((fileHashOrCompoundKeys, categoryName, options = {}) => {
    if (onSubmit) {
      // For batch: compound keys → resolve to pre-built items with instanceId
      if (Array.isArray(fileHashOrCompoundKeys) && fileHashOrCompoundKeys.length > 0 &&
          typeof fileHashOrCompoundKeys[0] === 'string') {
        const keySet = new Set(fileHashOrCompoundKeys);
        const items = dataArray
          .filter(d => keySet.has(itemKey(d.instanceId, d.hash)))
          .map(d => ({ fileHash: d.hash, instanceId: d.instanceId }));
        onSubmit(items, categoryName, options);
      } else {
        // Single item — wrap as array with instanceId for proper resolution
        const item = modalState.items[0];
        onSubmit([{ fileHash: fileHashOrCompoundKeys, instanceId: item?.instanceId }], categoryName, options);
      }
    }
    closeModal();
  }, [onSubmit, closeModal, dataArray, modalState.items]);

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
      hasAutoMoveItems,
      hasOptionalMoveItems,
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
    hasAutoMoveItems,
    hasOptionalMoveItems,
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
