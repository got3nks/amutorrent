/**
 * FileMoveModal Component
 *
 * Modal for moving files to a destination path without changing category.
 * Shows category quick links and manual path input with permission checking.
 */

import React from 'https://esm.sh/react@18.2.0';
import Portal from '../common/Portal.js';
import { Button, Icon, AlertBox, LoadingSpinner, PathPicker } from '../common/index.js';

const { createElement: h, useState, useEffect, useCallback, useRef } = React;

/**
 * @param {boolean} isOpen
 * @param {function} onClose
 * @param {function} onSubmit - (destPath) => void
 * @param {function} onCheckPermissions - (destPath) => void
 * @param {Array} items - Items to move
 * @param {string} fileName - Display name (single item)
 * @param {number} fileCount - Number of items
 * @param {string} currentPath - Current item path
 * @param {Array} categoryPaths - [{ name, path }] quick links
 * @param {Object} permissionCheck - { loading, canMove, error, destPath }
 */
const FileMoveModal = ({
  isOpen, onClose, onSubmit, onCheckPermissions,
  items, fileName, fileCount, currentPath,
  categoryPaths = [], permissionCheck, moveMode
}) => {
  const [destPath, setDestPath] = useState('');
  const debounceRef = useRef(null);

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) setDestPath('');
  }, [isOpen]);

  // Debounced permission check on path change
  useEffect(() => {
    if (!destPath || !isOpen) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onCheckPermissions(destPath);
    }, 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [destPath, isOpen, onCheckPermissions]);

  const handleQuickLink = useCallback((path) => {
    setDestPath(path);
    // Check immediately for quick links (no debounce)
    onCheckPermissions(path);
  }, [onCheckPermissions]);

  const handleSubmit = useCallback(() => {
    if (destPath && permissionCheck.canMove) {
      onSubmit(destPath);
    }
  }, [destPath, permissionCheck.canMove, onSubmit]);

  if (!isOpen) return null;

  const title = fileCount > 1 ? `Move ${fileCount} files` : 'Move to...';
  const permChecked = permissionCheck.destPath === destPath && !permissionCheck.loading;
  const canSubmit = destPath && permChecked && permissionCheck.canMove && !permissionCheck.error;

  return h(Portal, null,
    h('div', {
      className: 'fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/50',
      onClick: (e) => e.target === e.currentTarget && onClose()
    },
      h('div', {
        className: 'modal-full w-full max-w-lg bg-white dark:bg-gray-800 rounded-lg shadow-xl max-h-[85vh] sm:max-h-[90vh] flex flex-col overflow-hidden'
      },
        // Header
        h('div', { className: 'flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700' },
          h('h2', { className: 'text-lg font-semibold text-gray-900 dark:text-gray-100' }, title),
          h('button', {
            onClick: onClose,
            className: 'p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          }, h(Icon, { name: 'x', size: 20 }))
        ),

        // Content
        h('div', { className: 'flex-1 overflow-y-auto p-4 sm:p-6 space-y-4' },
          // File info
          fileCount === 1 && fileName && h('div', { className: 'text-sm text-gray-600 dark:text-gray-400' },
            h('span', { className: 'font-medium text-gray-900 dark:text-gray-100 break-all' }, fileName)
          ),

          // Current path
          currentPath && h('div', { className: 'text-xs text-gray-500 dark:text-gray-500' },
            'Current: ', h('span', { className: 'font-mono' }, currentPath)
          ),

          // Path selection (quick links + manual input)
          h(PathPicker, {
            value: destPath,
            onChange: setDestPath,
            onQuickLink: handleQuickLink,
            categoryPaths,
            hint: moveMode === 'native' ? 'Path as seen by the download client'
              : moveMode === 'manual' ? 'Path as seen by aMuTorrent server'
              : moveMode ? 'Path will be resolved per client' : null
          }),

          // Permission check result — single unified status
          destPath && (
            permissionCheck.loading
              ? h('div', { className: 'flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400' },
                  h(LoadingSpinner, { size: 14 }),
                  'Checking permissions...'
                )
              : permChecked && (
                  permissionCheck.error
                    ? h(AlertBox, { type: 'error' },
                        h('p', { className: 'text-xs' }, permissionCheck.error)
                      )
                    : permissionCheck.canMove && h('div', { className: 'flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400' },
                        h(Icon, { name: 'check', size: 14 }),
                        'Permissions OK'
                      )
                )
          )
        ),

        // Footer
        h('div', { className: 'px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3' },
          h(Button, { variant: 'secondary', onClick: onClose }, 'Cancel'),
          h(Button, {
            variant: 'primary',
            icon: 'folderOpen',
            iconSize: 14,
            disabled: !canSubmit,
            onClick: handleSubmit
          }, 'Move')
        )
      )
    )
  );
};

export default FileMoveModal;
