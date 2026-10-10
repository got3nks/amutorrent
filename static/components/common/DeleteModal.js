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
 * @param {function} onConfirm - Confirm handler (receives deleteFiles boolean)
 * @param {function} onCancel - Cancel handler
 * @param {string} itemType - Type of item ('File' or 'Server', default: 'File')
 * @param {boolean} hasSharedFiles - Whether any items are shared files (will always be deleted from disk)
 * @param {boolean} hasAutoDeleteItems - Whether any items auto-delete temp files on cancel (cancelDeletesFiles capability)
 * @param {boolean} hasNonAutoDeleteItems - Whether any items need explicit "delete files" option
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
  hasSharedFiles = false,
  hasAutoDeleteItems = false,
  hasNonAutoDeleteItems = false,
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

  // Capability-driven delete UI flags:
  // isSharedOnly: all items are shared files from auto-delete clients (will always be deleted, no checkbox)
  // isMixedShared: shared files + non-auto-delete items (show shared info + checkbox for others)
  // showDeleteFilesOption: any items that need explicit "delete files" checkbox
  const isSharedOnly = hasSharedFiles && !hasNonAutoDeleteItems;
  const isMixedShared = hasSharedFiles && hasNonAutoDeleteItems;
  const showDeleteFilesOption = hasNonAutoDeleteItems;
  const isMixed = hasAutoDeleteItems && hasNonAutoDeleteItems;

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
        className: 'bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full flex flex-col overflow-hidden',
        onClick: (e) => e.stopPropagation()
      },
      // Header
      h('div', { className: 'px-6 py-4 border-b border-gray-200 dark:border-gray-700' },
        h('div', { className: 'flex items-center gap-3' },
          h('div', { className: 'flex-shrink-0 w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center' },
            h(Icon, { name: 'trash', size: 24, className: 'text-red-600 dark:text-red-400' })
          ),
          h('div', null,
            h('h3', { className: 'text-lg font-semibold text-gray-900 dark:text-gray-100' }, displayTitle),
            h('p', { className: 'text-sm text-gray-500 dark:text-gray-400' }, 'This action cannot be undone')
          )
        )
      ),

      // Body
      h('div', { className: 'flex-1 overflow-y-auto px-6 py-4' },
      h('p', { className: 'text-gray-700 dark:text-gray-300 mb-4' },
        displayMessage,
        isBatchOperation
          ? h('span', { className: 'font-semibold' }, `${itemCount || 1} selected file${(itemCount || 1) !== 1 ? 's' : ''}?`)
          : (itemName && h('span', { className: 'font-semibold break-all' }, `"${itemName}"`)),
        !isBatchOperation && itemName && '?'
      ),
      // Shared files info: files will be deleted from disk (no choice — cannot be unshared)
      hasSharedFiles && !skipFileMessages && h('div', { className: 'mb-4' },
        h(AlertBox, {
          type: 'info',
          className: 'text-xs py-2 !mb-0'
        }, 'Shared files will be deleted from disk (cannot be unshared)')
      ),
      // Auto-delete info: temp files are always deleted on cancel (only when no shared files shown)
      hasAutoDeleteItems && !hasSharedFiles && !skipFileMessages && h('div', { className: 'mb-4' },
        h(AlertBox, {
          type: 'info',
          className: 'text-xs py-2 !mb-0'
        },
          isMixed
            ? 'Some downloads will have their temporary files deleted automatically'
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
            isMixed ? 'Also delete torrent files from disk' :
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
      ), // Close body

      // Footer
      h('div', { className: 'px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex gap-3 justify-end' },
        h(Button, {
          variant: 'secondary',
          onClick: onCancel
        }, 'Cancel'),
        h(Button, {
          variant: 'danger',
          // Disable when checking permissions, when shared-only files can't be deleted,
          // or when mixed shared has file not found warnings (can't proceed without all files)
          disabled: isCheckingPermissions || (isSharedOnly && !canDeleteFiles) || (isMixedShared && permissionWarnings.length > 0),
          // The caller adds deleteFiles for shared files that can't be unshared
          onClick: () => onConfirm(deleteFiles)
        },
          // Button label reflects what will happen
          isCheckingPermissions ? [h('span', { key: 's', className: 'w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin' }), 'Checking\u2026'] :
          isSharedOnly ? 'Delete Files' :
          deleteFiles ? 'Delete with Files' : confirmLabel
        )
      )
    )
  ));
};

export default DeleteModal;
