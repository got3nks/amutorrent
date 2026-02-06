/**
 * useViewDeleteModal Hook
 *
 * Shared hook for delete modal state and handlers in list views
 * Handles both single and batch delete operations with client type detection
 * Includes permission checking for file deletion
 * Returns a pre-rendered DeleteModal element
 */

import React, { useCallback, useMemo, useState, useEffect } from 'https://esm.sh/react@18.2.0';
import { useModal } from './useModal.js';
import { useActions } from '../contexts/ActionsContext.js';
import { useAppState } from '../contexts/AppStateContext.js';
import { useWebSocketConnection } from '../contexts/WebSocketContext.js';
import DeleteModal from '../components/common/DeleteModal.js';

const { createElement: h } = React;

/**
 * Hook for managing delete modal in list views
 * @param {Object} options
 * @param {Array} options.dataArray - Array of items (downloads, sharedFiles, etc.)
 * @param {Set} options.selectedFiles - Set of selected file hashes
 * @param {Function} options.clearAllSelections - Function to clear all selections after batch delete
 * @param {string} options.itemType - Type of item for display ('File' or 'Server')
 * @param {string} options.confirmLabel - Label for confirm button
 * @returns {Object} Delete modal state, handlers, and pre-rendered modal element
 */
export const useViewDeleteModal = ({
  dataArray,
  selectedFiles,
  clearAllSelections,
  itemType = 'File',
  confirmLabel = 'Delete'
}) => {
  const actions = useActions();
  const { handleAppNavigate } = useAppState();
  const { sendMessage, addMessageHandler, removeMessageHandler } = useWebSocketConnection();

  // Delete modal state
  const { modal: deleteModal, open: openDeleteModal, close: closeDeleteModal } = useModal({
    fileHash: null,
    fileName: '',
    clientType: 'amule',
    isBatch: false,
    itemCount: 0
  });

  // Permission check state
  const [permissionCheck, setPermissionCheck] = useState({
    loading: false,
    canDeleteFiles: true,
    warnings: []
  });

  // Listen for permission check results
  useEffect(() => {
    const handlePermissions = (data) => {
      if (data.type === 'delete-permissions') {
        const results = data.results || [];
        const isDocker = data.isDocker || false;

        // Check if overall selection is mixed (multiple client types)
        const allClientTypes = new Set(results.map(r => r.clientType).filter(Boolean));
        const isMixedSelection = allClientTypes.size > 1;

        // Analyze results
        const notDeletable = results.filter(r => !r.canDelete);
        const warnings = [];

        // Helper to get client label
        const getClientLabel = (clientType) =>
          clientType === 'amule' ? 'aMule' : clientType === 'rtorrent' ? 'rTorrent' : clientType;

        // Helper to build message with client prefix for mixed selections
        const buildMessage = (items, singleMsg, pluralMsg) => {
          // Group by client type
          const byClient = {};
          for (const item of items) {
            const client = item.clientType || 'unknown';
            byClient[client] = (byClient[client] || 0) + 1;
          }
          const clientTypes = Object.keys(byClient);

          // Show client labels if overall selection is mixed
          if (isMixedSelection && clientTypes.length >= 1 && clientTypes[0] !== 'unknown') {
            return clientTypes.map(client => {
              const count = byClient[client];
              const label = getClientLabel(client);
              return count === 1 ? `${label}: ${singleMsg}` : `${label}: ${pluralMsg(count)}`;
            }).join('\n');
          } else {
            // Single client selection - no prefix needed
            return items.length === 1 ? singleMsg : pluralMsg(items.length);
          }
        };

        // Group warnings by reason
        const notVisible = notDeletable.filter(r => r.reason === 'not_visible');
        const noPermission = notDeletable.filter(r => r.reason === 'no_permission');
        const noPath = notDeletable.filter(r => r.reason === 'no_path');

        if (notVisible.length > 0) {
          // Different message based on Docker vs native environment
          const singleMsg = isDocker
            ? 'File not visible to server (volume may not be mounted)'
            : 'File not found on disk';
          const pluralMsg = (n) => isDocker
            ? `${n} files not visible to server (volumes may not be mounted)`
            : `${n} files not found on disk`;

          warnings.push({
            reason: 'not_visible',
            count: notVisible.length,
            message: buildMessage(notVisible, singleMsg, pluralMsg)
          });
        }

        if (noPermission.length > 0) {
          warnings.push({
            reason: 'no_permission',
            count: noPermission.length,
            message: buildMessage(
              noPermission,
              'No write permission to delete file',
              (n) => `No write permission to delete ${n} files`
            )
          });
        }

        if (noPath.length > 0) {
          warnings.push({
            reason: 'no_path',
            count: noPath.length,
            message: buildMessage(
              noPath,
              'File path not available',
              (n) => `Path not available for ${n} files`
            )
          });
        }

        // Can delete files if at least some files are deletable
        // Or if all items are aMule-managed (active downloads)
        const deletableCount = results.filter(r => r.canDelete).length;
        const amuleManagedCount = results.filter(r => r.reason === 'amule_managed').length;

        setPermissionCheck({
          loading: false,
          canDeleteFiles: deletableCount > 0 || amuleManagedCount === results.length,
          warnings
        });
      }
    };

    addMessageHandler(handlePermissions);
    return () => removeMessageHandler(handlePermissions);
  }, [addMessageHandler, removeMessageHandler]);

  // Detect if selection contains aMule shared files (completed, not downloading)
  const hasAmuleSharedFiles = useMemo(() => {
    if (!deleteModal.show) return false;
    const fileHashes = Array.isArray(deleteModal.fileHash)
      ? deleteModal.fileHash
      : [deleteModal.fileHash];
    return fileHashes.some(hash => {
      const item = dataArray.find(d => d.hash === hash);
      return item?.client === 'amule' && item?.shared && !item?.downloading;
    });
  }, [deleteModal.show, deleteModal.fileHash, dataArray]);

  // Determine source type based on items (auto-detect shared vs downloads)
  const sourceType = useMemo(() => {
    if (!deleteModal.show) return 'downloads';
    // If any aMule shared files (completed), treat as shared source
    return hasAmuleSharedFiles ? 'shared' : 'downloads';
  }, [deleteModal.show, hasAmuleSharedFiles]);

  // Request permission check when modal opens
  useEffect(() => {
    if (!deleteModal.show) {
      // Reset permission state when modal closes
      setPermissionCheck({ loading: false, canDeleteFiles: true, warnings: [] });
      return;
    }

    // Determine which hashes to check
    const fileHashes = Array.isArray(deleteModal.fileHash)
      ? deleteModal.fileHash
      : [deleteModal.fileHash];

    // Only check for rtorrent, mixed batches, or aMule shared files (completed)
    const clientType = deleteModal.clientType;
    const needsCheck = clientType === 'rtorrent' || clientType === 'mixed' || hasAmuleSharedFiles;

    if (needsCheck && fileHashes.length > 0 && fileHashes[0]) {
      setPermissionCheck({ loading: true, canDeleteFiles: true, warnings: [] });
      sendMessage({
        action: 'checkDeletePermissions',
        fileHashes,
        source: sourceType
      });
    }
  }, [deleteModal.show, deleteModal.fileHash, deleteModal.clientType, hasAmuleSharedFiles, sourceType, sendMessage]);

  /**
   * Detect batch client type from selected hashes
   * Returns 'amule', 'rtorrent', or 'mixed'
   */
  const detectBatchClientType = useCallback((fileHashes) => {
    const batchClientTypes = new Set();
    fileHashes.forEach(hash => {
      const item = dataArray.find(d => d.hash === hash);
      batchClientTypes.add(item?.client || 'amule');
    });
    const hasRtorrent = batchClientTypes.has('rtorrent');
    return batchClientTypes.size === 1
      ? batchClientTypes.values().next().value
      : (hasRtorrent ? 'mixed' : 'amule');
  }, [dataArray]);

  // Single file delete handler
  const handleDeleteClick = useCallback((fileHash, fileName, clientType = 'amule') => {
    openDeleteModal({ fileHash, fileName, clientType, isBatch: false });
  }, [openDeleteModal]);

  // Batch delete handler (uses selectedFiles)
  const handleBatchDeleteClick = useCallback(() => {
    const fileHashes = Array.from(selectedFiles);
    const batchClientType = detectBatchClientType(fileHashes);

    openDeleteModal({
      fileHash: fileHashes,
      fileName: null,
      clientType: batchClientType,
      isBatch: true,
      itemCount: fileHashes.length
    });
  }, [selectedFiles, detectBatchClientType, openDeleteModal]);

  // Confirm delete handler
  const handleConfirmDelete = useCallback((deleteFiles = false) => {
    if (deleteModal.isBatch) {
      const fileHashes = Array.isArray(deleteModal.fileHash) ? deleteModal.fileHash : [deleteModal.fileHash];
      actions.files.deleteFile(fileHashes, dataArray, deleteFiles, sourceType);
      // Clear selections after batch delete
      if (typeof clearAllSelections === 'function') {
        clearAllSelections();
      }
    } else {
      const clientType = deleteModal.clientType || 'amule';
      const fileName = deleteModal.fileName;
      actions.files.deleteFile(deleteModal.fileHash, clientType, deleteFiles, sourceType, fileName);
    }
    closeDeleteModal();
  }, [deleteModal, actions.files, dataArray, sourceType, closeDeleteModal, clearAllSelections]);

  // Navigate to categories view (for "Edit category mappings" link in warnings)
  const onEditMappings = useCallback(() => {
    closeDeleteModal();
    handleAppNavigate('categories');
  }, [closeDeleteModal, handleAppNavigate]);

  // Check if selection contains mixed client types
  const isMixedSelection = useMemo(() => {
    if (selectedFiles.size === 0) return false;
    const clientTypes = new Set();
    selectedFiles.forEach(hash => {
      const item = dataArray.find(d => d.hash === hash);
      clientTypes.add(item?.client || 'amule');
    });
    return clientTypes.size > 1;
  }, [selectedFiles, dataArray]);

  // Get selected client types set
  const selectedClientTypes = useMemo(() => {
    if (selectedFiles.size === 0) return new Set();
    const types = new Set();
    selectedFiles.forEach(hash => {
      const item = dataArray.find(d => d.hash === hash);
      types.add(item?.client || 'amule');
    });
    return types;
  }, [selectedFiles, dataArray]);

  // Pre-rendered modal element
  const DeleteModalElement = useMemo(() => {
    return h(DeleteModal, {
      show: deleteModal.show,
      itemName: deleteModal.fileName,
      itemCount: deleteModal.itemCount,
      isBatch: deleteModal.isBatch,
      itemType,
      confirmLabel,
      clientType: deleteModal.clientType,
      forceShowDeleteOption: hasAmuleSharedFiles,
      permissionCheck,
      onConfirm: handleConfirmDelete,
      onCancel: closeDeleteModal,
      onEditMappings
    });
  }, [
    deleteModal.show,
    deleteModal.fileName,
    deleteModal.itemCount,
    deleteModal.isBatch,
    deleteModal.clientType,
    itemType,
    confirmLabel,
    hasAmuleSharedFiles,
    permissionCheck,
    handleConfirmDelete,
    closeDeleteModal,
    onEditMappings
  ]);

  return {
    // Modal state (kept for backward compatibility and special cases)
    deleteModal,
    closeDeleteModal,
    // Permission check state
    permissionCheck,
    // Handlers
    handleDeleteClick,
    handleBatchDeleteClick,
    handleConfirmDelete,
    // Selection info
    isMixedSelection,
    selectedClientTypes,
    // Pre-rendered modal element
    DeleteModalElement
  };
};
