/**
 * useViewDeleteModal Hook
 *
 * Shared hook for delete modal state and handlers in list views
 * Handles both single and batch delete operations with client type detection
 * Includes permission checking for file deletion
 * Returns a pre-rendered DeleteModal element
 */

import React, { useCallback, useMemo, useState, useEffect, useRef } from 'https://esm.sh/react@18.2.0';
import { useModal } from './useModal.js';
import { useActions } from '../contexts/ActionsContext.js';
import { useAppState } from '../contexts/AppStateContext.js';
import { useStaticData } from '../contexts/StaticDataContext.js';
import { useWebSocketConnection } from '../contexts/WebSocketContext.js';
import DeleteModal from '../components/common/DeleteModal.js';
import { itemKey, parseItemKey } from '../utils/itemKey.js';

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
  const { instances, getCapabilities } = useStaticData();
  const { sendMessage, addMessageHandler, removeMessageHandler } = useWebSocketConnection();

  // Ref for instances to avoid re-registering permission handler on every broadcast
  const instancesRef = useRef(instances);
  instancesRef.current = instances;

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

        // Look up display name from instances metadata (avoids hardcoded client-type map)
        const getClientLabel = (clientType) => {
          const inst = Object.values(instancesRef.current).find(i => i.type === clientType);
          return inst?.name || clientType;
        };

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
        // Or if all items are client-managed (active downloads with auto-cleanup)
        const deletableCount = results.filter(r => r.canDelete).length;
        const managedCount = results.filter(r => r.reason === 'managed').length;

        setPermissionCheck({
          loading: false,
          canDeleteFiles: deletableCount > 0 || managedCount === results.length,
          warnings
        });
      }
    };

    addMessageHandler(handlePermissions);
    return () => removeMessageHandler(handlePermissions);
  }, [addMessageHandler, removeMessageHandler]);

  // Capability-driven flags for the items being deleted
  const { hasSharedFiles, hasAutoDeleteItems, hasNonAutoDeleteItems } = useMemo(() => {
    if (!deleteModal.show) return { hasSharedFiles: false, hasAutoDeleteItems: false, hasNonAutoDeleteItems: false };
    const fileHashes = Array.isArray(deleteModal.fileHash)
      ? deleteModal.fileHash
      : [deleteModal.fileHash];
    let shared = false, autoDelete = false, nonAutoDelete = false;
    // Classify each item the way the server now does (see sharedFilePolicy): a
    // shared file on a client that can't just unshare it is always deleted from
    // disk; otherwise a cancel only discards an UNFINISHED download's partial, so
    // a completed download (Rucio, or the brief window before an aMule file is
    // shared) needs the explicit "delete files" option and a permission check.
    const classify = (item) => {
      const caps = getCapabilities(item.instanceId);
      if (caps.removeSharedMustDeleteFiles && item.shared && !item.downloading) shared = true;
      else if (caps.cancelDeletesFiles && !item.complete) autoDelete = true;
      else nonAutoDelete = true;
    };
    if (deleteModal.isBatch) {
      const keySet = new Set(fileHashes);
      for (const d of dataArray) {
        if (!keySet.has(itemKey(d.instanceId, d.hash))) continue;
        classify(d);
      }
    } else {
      const item = dataArray.find(d => d.hash === fileHashes[0] && (!deleteModal.instanceId || d.instanceId === deleteModal.instanceId));
      if (item) classify(item);
    }
    return { hasSharedFiles: shared, hasAutoDeleteItems: autoDelete, hasNonAutoDeleteItems: nonAutoDelete };
  }, [deleteModal.show, deleteModal.fileHash, deleteModal.isBatch, deleteModal.instanceId, dataArray, getCapabilities]);

  // Determine source type based on items (auto-detect shared vs downloads)
  const sourceType = useMemo(() => {
    if (!deleteModal.show) return 'downloads';
    return hasSharedFiles ? 'shared' : 'downloads';
  }, [deleteModal.show, hasSharedFiles]);

  // Request permission check when modal opens
  useEffect(() => {
    if (!deleteModal.show) {
      // Reset permission state when modal closes
      setPermissionCheck({ loading: false, canDeleteFiles: true, warnings: [] });
      return;
    }

    // Build items with instanceId for compound-key lookup on backend
    const rawFileHashes = Array.isArray(deleteModal.fileHash)
      ? deleteModal.fileHash
      : [deleteModal.fileHash];
    let items;
    if (deleteModal.isBatch) {
      // Batch: compound keys → resolve to { fileHash, instanceId }
      items = rawFileHashes.map(k => {
        const { instanceId, hash } = parseItemKey(k);
        return { fileHash: hash, instanceId };
      });
    } else {
      items = rawFileHashes.map(h => ({ fileHash: h, instanceId: deleteModal.instanceId || null }));
    }

    // Check permissions when items need explicit file deletion or are shared files
    const needsCheck = hasNonAutoDeleteItems || hasSharedFiles;

    if (needsCheck && items.length > 0 && items[0].fileHash) {
      setPermissionCheck({ loading: true, canDeleteFiles: true, warnings: [] });
      sendMessage({
        action: 'checkDeletePermissions',
        items,
        source: sourceType
      });
    }
  }, [deleteModal.show, deleteModal.fileHash, deleteModal.isBatch, deleteModal.instanceId, hasNonAutoDeleteItems, hasSharedFiles, sourceType, sendMessage]);

  /**
   * Detect batch client type from selected hashes
   * Returns 'amule', 'rtorrent', 'qbittorrent', or 'mixed'
   */
  const detectBatchClientType = useCallback((compoundKeys) => {
    const keySet = new Set(compoundKeys);
    const batchClientTypes = new Set();
    dataArray.forEach(d => {
      if (keySet.has(itemKey(d.instanceId, d.hash))) {
        batchClientTypes.add(d.client);
      }
    });
    // If only one client type, return it; otherwise return 'mixed'
    return batchClientTypes.size === 1
      ? batchClientTypes.values().next().value
      : 'mixed';
  }, [dataArray]);

  // Single file delete handler
  const handleDeleteClick = useCallback((fileHash, fileName, clientType = 'amule', instanceId = null) => {
    openDeleteModal({ fileHash, fileName, clientType, instanceId, isBatch: false });
  }, [openDeleteModal]);

  // Batch delete handler (uses selectedFiles — compound keys)
  const handleBatchDeleteClick = useCallback(() => {
    const compoundKeys = Array.from(selectedFiles);
    const batchClientType = detectBatchClientType(compoundKeys);

    openDeleteModal({
      fileHash: compoundKeys,  // compound keys, not raw hashes
      fileName: null,
      clientType: batchClientType,
      isBatch: true,
      itemCount: compoundKeys.length
    });
  }, [selectedFiles, detectBatchClientType, openDeleteModal]);

  // Confirm delete handler
  const handleConfirmDelete = useCallback((deleteFiles = false) => {
    if (deleteModal.isBatch) {
      // Batch: compound keys → resolve to pre-built items
      const compoundKeys = Array.isArray(deleteModal.fileHash) ? deleteModal.fileHash : [deleteModal.fileHash];
      const keySet = new Set(compoundKeys);
      const items = dataArray
        .filter(d => keySet.has(itemKey(d.instanceId, d.hash)))
        .map(d => ({ fileHash: d.hash, clientType: d.client, instanceId: d.instanceId, fileName: d.name }));
      actions.files.deleteFile(items, null, deleteFiles, sourceType);
      // Clear selections after batch delete
      if (typeof clearAllSelections === 'function') {
        clearAllSelections();
      }
    } else {
      const clientType = deleteModal.clientType;
      const fileName = deleteModal.fileName;
      actions.files.deleteFile(deleteModal.fileHash, clientType, deleteFiles, sourceType, fileName, deleteModal.instanceId);
    }
    closeDeleteModal();
  }, [deleteModal, actions.files, dataArray, sourceType, closeDeleteModal, clearAllSelections]);

  // Navigate to categories view (for "Edit category mappings" link in warnings)
  const onEditMappings = useCallback(() => {
    closeDeleteModal();
    handleAppNavigate('categories');
  }, [closeDeleteModal, handleAppNavigate]);

  // Check if selection contains mixed client types (selectedFiles contains compound keys)
  const isMixedSelection = useMemo(() => {
    if (selectedFiles.size === 0) return false;
    const clientTypes = new Set();
    dataArray.forEach(d => {
      if (selectedFiles.has(itemKey(d.instanceId, d.hash))) {
        clientTypes.add(d.client);
      }
    });
    return clientTypes.size > 1;
  }, [selectedFiles, dataArray]);

  // Get selected client types set (selectedFiles contains compound keys)
  const selectedClientTypes = useMemo(() => {
    if (selectedFiles.size === 0) return new Set();
    const types = new Set();
    dataArray.forEach(d => {
      if (selectedFiles.has(itemKey(d.instanceId, d.hash))) {
        types.add(d.client);
      }
    });
    return types;
  }, [selectedFiles, dataArray]);

  // Get selected network types set (future-proof: any new BitTorrent client works automatically)
  const selectedNetworkTypes = useMemo(() => {
    if (selectedFiles.size === 0) return new Set();
    const types = new Set();
    dataArray.forEach(d => {
      if (selectedFiles.has(itemKey(d.instanceId, d.hash))) {
        types.add(d.networkType);
      }
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
      hasSharedFiles,
      hasAutoDeleteItems,
      hasNonAutoDeleteItems,
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
    itemType,
    confirmLabel,
    hasSharedFiles,
    hasAutoDeleteItems,
    hasNonAutoDeleteItems,
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
    selectedNetworkTypes,
    // Pre-rendered modal element
    DeleteModalElement
  };
};
