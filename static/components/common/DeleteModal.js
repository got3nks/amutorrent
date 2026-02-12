/**
 * DeleteModal Component
 *
 * Generic confirmation modal for delete operations
 * Includes permission checking for file deletion
 */

import React from 'https://esm.sh/react@18.2.0';
import Icon from './Icon.js';
import Portal from './Portal.js';
import { Button } from './FormControls.js';
import AlertBox from './AlertBox.js';

const { createElement: h, useState, useEffect } = React;

/**
 * Delete confirmation modal
 * @param {boolean} show - Whether to show the modal
 * @param {string} title - Modal title
 * @param {string} message - Confirmation message
 * @param {string} itemName - Name of item being deleted (for display)
 * @param {number} itemCount - Number of items (for batch delete)
 * @param {boolean} isBatch - Whether this is a batch operation
 * @param {string} confirmLabel - Label for confirm button (default: 'Delete')
 * @param {function} onConfirm - Confirm handler (receives deleteFiles boolean for rtorrent)
 * @param {function} onCancel - Cancel handler
 * @param {string} itemType - Type of item ('File' or 'Server', default: 'File')
 * @param {string} clientType - Client type ('amule', 'rtorrent', or 'qbittorrent') - shows delete files option for rtorrent/qbittorrent
 * @param {boolean} forceShowDeleteOption - Force show delete files checkbox (for aMule shared files)
 * @param {Object} permissionCheck - Permission check results { loading, canDeleteFiles, warnings }
 * @param {boolean} skipFileMessages - Skip file-related info messages (e.g., for history deletion)
 * @param {function} onEditMappings - Optional handler to open category mappings editor
 */
const DeleteModal = ({
  show,
  title,
  message,
  itemName,
  itemCount,
  isBatch = false,
  confirmLabel = 'Delete',
  onConfirm,
  onCancel,
  itemType = 'File',
  clientType = 'amule',
  forceShowDeleteOption = false,
  permissionCheck = null,
  skipFileMessages = false,
  onEditMappings
}) => {
  const [deleteFiles, setDeleteFiles] = useState(false);

  // Reset deleteFiles when modal closes/opens
  useEffect(() => {
    if (!show) {
      setDeleteFiles(false);
    }
  }, [show]);

  if (!show) return null;

  // For aMule shared files: always delete (no checkbox needed, aMule can't just "unshare")
  // For mixed shared: show checkbox for rTorrent, but aMule files will always be deleted
  // For rTorrent: show checkbox
  const isAmuleSharedOnly = clientType === 'amule' && forceShowDeleteOption;
  const isMixedShared = clientType === 'mixed' && forceShowDeleteOption;

  // Show checkbox for rTorrent/qBittorrent files (pure torrent clients or any mixed batches)
  // For mixed: checkbox controls torrent file deletion (aMule files handled separately)
  const showDeleteFilesOption = clientType === 'rtorrent' || clientType === 'qbittorrent' || clientType === 'mixed';

  // Permission check state
  const isCheckingPermissions = permissionCheck?.loading || false;
  const canDeleteFiles = permissionCheck?.canDeleteFiles ?? true;
  const permissionWarnings = permissionCheck?.warnings || [];

  // Use explicit isBatch flag if provided, otherwise infer from itemCount
  const isBatchOperation = isBatch || (itemCount && itemCount > 1);
  const isServer = itemType === 'Server';
  const actionWord = isServer ? 'remove' : 'delete';
  const displayTitle = title || `${isServer ? 'Remove' : 'Delete'} ${isBatchOperation ? `${itemCount || 1} ${itemType}${(itemCount || 1) !== 1 ? 's' : ''}` : itemType}`;
  const displayMessage = message || `Are you sure you want to ${actionWord} `;

  return h(Portal, null,
    h('div', {
      className: 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4',
      onClick: onCancel
    },
      h('div', {
        className: 'bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6 transform transition-all',
        onClick: (e) => e.stopPropagation()
      },
      h('div', { className: 'flex items-center gap-3 mb-4' },
        h('div', { className: 'flex-shrink-0 w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center' },
          h(Icon, { name: 'trash', size: 24, className: 'text-red-600 dark:text-red-400' })
        ),
        h('div', null,
          h('h3', { className: 'text-lg font-semibold text-gray-900 dark:text-gray-100' }, displayTitle),
          h('p', { className: 'text-sm text-gray-500 dark:text-gray-400' }, 'This action cannot be undone')
        )
      ),
      h('p', { className: 'text-gray-700 dark:text-gray-300 mb-4' },
        displayMessage,
        isBatchOperation
          ? h('span', { className: 'font-semibold' }, `${itemCount || 1} selected file${(itemCount || 1) !== 1 ? 's' : ''}?`)
          : (itemName && h('span', { className: 'font-semibold break-all' }, `"${itemName}"`)),
        !isBatchOperation && itemName && '?'
      ),
      // For aMule shared files: info that files will be deleted (no choice)
      // Always show this when there are aMule shared files being removed
      isAmuleSharedOnly && !skipFileMessages && h('div', { className: 'mb-4' },
        h(AlertBox, {
          type: 'info',
          className: 'text-xs py-2 !mb-0'
        }, 'aMule shared files will be deleted from disk (cannot be unshared)')
      ),
      // For mixed shared: info that ED2K files will be deleted regardless of checkbox
      // Always show this when there are mixed shared files being removed
      isMixedShared && !skipFileMessages && h('div', { className: 'mb-4' },
        h(AlertBox, {
          type: 'info',
          className: 'text-xs py-2 !mb-0'
        }, 'aMule shared files will be deleted from disk (cannot be unshared)')
      ),
      // For aMule downloads (not shared): info that temp files are always deleted
      // Always show this when there are aMule downloads being removed (even if there are warnings)
      (clientType === 'amule' || clientType === 'mixed') && !forceShowDeleteOption && !skipFileMessages && h('div', { className: 'mb-4' },
        h(AlertBox, {
          type: 'info',
          className: 'text-xs py-2 !mb-0'
        },
          clientType === 'mixed'
            ? 'aMule downloads will have their temporary files deleted automatically'
            : 'Temporary download files will be deleted automatically'
        )
      ),
      // Show "delete files from disk" checkbox for rtorrent or mixed batches
      // Disabled when: no permission, checking permissions, or there are warnings (file not found, etc.)
      showDeleteFilesOption && h('div', { className: 'mb-4' },
        h('label', {
          className: `flex items-center gap-2 ${canDeleteFiles && !isCheckingPermissions && permissionWarnings.length === 0 ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'} select-none`
        },
          h('input', {
            type: 'checkbox',
            checked: deleteFiles && canDeleteFiles && permissionWarnings.length === 0,
            onChange: (e) => canDeleteFiles && permissionWarnings.length === 0 && setDeleteFiles(e.target.checked),
            disabled: !canDeleteFiles || isCheckingPermissions || permissionWarnings.length > 0,
            className: 'w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed'
          }),
          h('span', { className: 'text-sm text-gray-700 dark:text-gray-300' },
            isCheckingPermissions ? 'Checking file permissions...' :
            clientType === 'mixed' ? 'Also delete torrent files from disk' :
            'Also delete files from disk'
          )
        )
      ),
      // Show permission warnings (shared section for all cases)
      permissionWarnings.length > 0 && h('div', { className: 'mb-4 space-y-2' },
        permissionWarnings.map((warning, idx) =>
          h(AlertBox, {
            key: idx,
            type: 'warning',
            className: 'text-xs py-2 !mb-0',
            breakAll: true,
            onAction: onEditMappings,
            actionLabel: 'Edit category mappings \u2192'
          }, warning.message)
        )
      ),
      // Add margin when no info/warning/checkbox is shown
      !showDeleteFilesOption && !isAmuleSharedOnly && clientType !== 'amule' && clientType !== 'mixed' && h('div', { className: 'mb-2' }),
      h('div', { className: 'flex gap-3 justify-end' },
        h(Button, {
          variant: 'secondary',
          onClick: onCancel
        }, 'Cancel'),
        h(Button, {
          variant: 'danger',
          // Disable when checking permissions, when aMule shared files can't be deleted,
          // or when mixed shared has file not found warnings (can't proceed without all files)
          disabled: isCheckingPermissions || (isAmuleSharedOnly && !canDeleteFiles) || (isMixedShared && permissionWarnings.length > 0),
          // For aMule shared files, always pass deleteFiles=true (they can only be deleted, not unshared)
          onClick: () => onConfirm(isAmuleSharedOnly || isMixedShared ? true : deleteFiles)
        },
          // Button label reflects what will happen
          isCheckingPermissions ? [h('span', { key: 's', className: 'w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin' }), 'Checking\u2026'] :
          isAmuleSharedOnly ? 'Delete Files' :
          deleteFiles ? 'Delete with Files' : confirmLabel
        )
      )
    )
  ));
};

export default DeleteModal;
