/**
 * useFileMoveModal Hook
 *
 * Manages FileMoveModal state — standalone "Move to..." feature.
 * Handles permission checking and move submission via WebSocket.
 */

import React, { useState, useCallback, useEffect, useRef } from 'https://esm.sh/react@18.2.0';
import FileMoveModal from '../components/modals/FileMoveModal.js';
import { useStaticData } from '../contexts/StaticDataContext.js';
import { useWebSocketConnection } from '../contexts/WebSocketContext.js';
import { itemKey } from '../utils/itemKey.js';

const { createElement: h } = React;

/**
 * Hook for managing FileMoveModal in views
 * @param {Object} options
 * @param {Function} options.getSelectedHashes - Function to get selected compound keys (for batch)
 * @param {Array} options.dataArray - Data array to find items (for batch)
 * @returns {Object} { openMoveModal, handleBatchMove, FileMoveModalElement }
 */
export const useFileMoveModal = ({ getSelectedHashes, dataArray }) => {
  const { dataCategories: categories, getCapabilities } = useStaticData();
  const { sendMessage, addMessageHandler, removeMessageHandler } = useWebSocketConnection();

  const [modalState, setModalState] = useState({
    show: false,
    items: [],     // [{ fileHash, instanceId, fileName }]
    fileName: '',  // display name (single item)
    fileCount: 0,  // batch count
    currentPath: ''
  });

  const [permissionCheck, setPermissionCheck] = useState({
    loading: false,
    canMove: false,
    error: null,
    destPath: null
  });

  const lastCheckedPath = useRef(null);

  // Listen for permission check results
  useEffect(() => {
    const handler = (data) => {
      if (data.type === 'move-to-permissions') {
        if (data.error) {
          setPermissionCheck({ loading: false, canMove: false, error: data.error, destPath: data.destPath });
          return;
        }
        const errorResults = data.results?.filter(r => r.canMove === false && r.reason !== 'same_path') || [];
        const allSamePath = data.results?.length > 0 && data.results.every(r => r.reason === 'same_path');
        const firstError = data.error || (errorResults.length > 0 ? errorResults[0].message : null);

        if (allSamePath) {
          setPermissionCheck({ loading: false, canMove: false, error: 'Already at this location', destPath: data.destPath });
        } else if (firstError) {
          setPermissionCheck({ loading: false, canMove: false, error: firstError, destPath: data.destPath });
        } else {
          setPermissionCheck({ loading: false, canMove: data.canMove, error: null, destPath: data.destPath });
        }
      }
    };
    addMessageHandler(handler);
    return () => removeMessageHandler(handler);
  }, [addMessageHandler, removeMessageHandler]);

  // Open modal for single item
  const openMoveModal = useCallback((item) => {
    const items = [{ fileHash: item.hash, instanceId: item.instanceId, fileName: item.name }];
    setModalState({
      show: true,
      items,
      fileName: item.name,
      fileCount: 1,
      currentPath: item.directory || item.filePath || ''
    });
    setPermissionCheck({ loading: false, canMove: false, error: null, destPath: null });
    lastCheckedPath.current = null;
  }, []);

  // Open modal for batch (selection mode)
  const handleBatchMove = useCallback(() => {
    const selectedKeys = getSelectedHashes();
    // getSelectedHashes returns an array — guard with .length, not .size.
    if (!selectedKeys || selectedKeys.length === 0) return;

    const items = [];
    for (const key of selectedKeys) {
      const item = dataArray.find(d => itemKey(d.instanceId, d.hash) === key);
      // Skip items whose client can't relocate a file (Rucio): the move would be
      // refused server-side, so a mixed batch moves only the movable ones and a
      // Rucio-only selection opens nothing instead of erroring.
      if (item && !getCapabilities(item.instanceId).noFileMove) {
        items.push({ fileHash: item.hash, instanceId: item.instanceId, fileName: item.name });
      }
    }
    if (items.length === 0) return;

    setModalState({
      show: true,
      items,
      fileName: items.length === 1 ? items[0].fileName : '',
      fileCount: items.length,
      currentPath: ''
    });
    setPermissionCheck({ loading: false, canMove: false, error: null, destPath: null });
    lastCheckedPath.current = null;
  }, [getSelectedHashes, dataArray, getCapabilities]);

  const closeModal = useCallback(() => {
    setModalState(prev => ({ ...prev, show: false }));
    setPermissionCheck({ loading: false, canMove: false, error: null, destPath: null });
    lastCheckedPath.current = null;
  }, []);

  // Check permissions for a destination path
  const checkPermissions = useCallback((destPath) => {
    if (!destPath || destPath === lastCheckedPath.current) return;
    lastCheckedPath.current = destPath;
    setPermissionCheck({ loading: true, canMove: false, error: null, destPath });
    sendMessage({
      action: 'checkMoveToPermissions',
      items: modalState.items,
      destPath
    });
  }, [sendMessage, modalState.items]);

  // Submit move
  const handleSubmit = useCallback((destPath) => {
    sendMessage({
      action: 'batchMoveFiles',
      items: modalState.items,
      destPath
    });
    closeModal();
  }, [sendMessage, modalState.items, closeModal]);

  // Category quick links (categories with configured paths)
  const categoryPaths = categories
    .filter(c => c.path && c.name !== 'Default')
    .map(c => ({ name: c.title || c.name, path: c.path }));

  // Determine move mode hint from items' capabilities
  // 'native' = all items use native move (path = what client sees)
  // 'manual' = all items use manual move (path = server filesystem)
  // 'mixed'  = batch has both types
  const moveMode = (() => {
    if (!modalState.items.length) return null;
    let hasNative = false, hasManual = false;
    for (const item of modalState.items) {
      const caps = getCapabilities(item.instanceId);
      if (caps.nativeMove) hasNative = true;
      else hasManual = true;
    }
    if (hasNative && hasManual) return 'mixed';
    return hasNative ? 'native' : 'manual';
  })();

  const FileMoveModalElement = modalState.show
    ? h(FileMoveModal, {
        isOpen: true,
        onClose: closeModal,
        onSubmit: handleSubmit,
        onCheckPermissions: checkPermissions,
        items: modalState.items,
        fileName: modalState.fileName,
        fileCount: modalState.fileCount,
        currentPath: modalState.currentPath,
        categoryPaths,
        permissionCheck,
        moveMode
      })
    : null;

  return { openMoveModal, handleBatchMove, FileMoveModalElement };
};

export default useFileMoveModal;
