/**
 * FileCategoryModal Component
 *
 * Modal for changing a file's category
 * Works with both aMule and rtorrent using unified category system
 * Permission checking is handled by useFileCategoryModal hook
 */

import React from 'https://esm.sh/react@18.2.0';
import Portal from '../common/Portal.js';
import { Button, Select, AlertBox } from '../common/index.js';
import { useStaticData } from '../../contexts/StaticDataContext.js';

const { createElement: h, useState, useEffect, useMemo } = React;

/**
 * File category change modal (unified for both clients)
 * @param {boolean} show - Whether to show the modal
 * @param {string|Array} fileHash - File hash or array of file hashes (for batch)
 * @param {string} fileName - File name to display (for single file)
 * @param {number} fileCount - Number of files (for batch operations)
 * @param {string} currentCategory - Current category name
 * @param {Array} items - Items being modified (for move option check)
 * @param {string} selectedCategory - Currently selected category (controlled by hook)
 * @param {function} onCategoryChange - Category change handler (controlled by hook)
 * @param {boolean} showMoveOption - Whether to show move option (computed by hook)
 * @param {object} permissionCheck - Permission check state from hook { loading, canMove, error, destPath }
 * @param {boolean} hasAmuleSharedFiles - Whether selection includes aMule shared files
 * @param {boolean} hasRtorrentItems - Whether selection includes rTorrent items
 * @param {boolean} forceMove - Whether move is forced (aMule shared files)
 * @param {function} onSubmit - Submit handler (fileHash/hashes, categoryName, options)
 * @param {function} onClose - Close handler
 */
const FileCategoryModal = ({
  show,
  fileHash,
  fileName,
  fileCount,
  currentCategory = 'Default',
  items = [],
  selectedCategory: controlledCategory,
  onCategoryChange,
  showMoveOption = false,
  permissionCheck = { loading: false, canMove: true, error: null, destPath: null },
  hasAmuleFiles = false,
  hasAmuleSharedFiles = false,
  hasRtorrentItems = false,
  forceMove = false,
  onSubmit,
  onClose,
  onEditMappings
}) => {
  // Get unified categories from context
  const { dataCategories: categories } = useStaticData();

  // Local state for custom category input
  const [customCategory, setCustomCategory] = useState('');
  const [useCustom, setUseCustom] = useState(false);

  // Move files option state
  const [moveFiles, setMoveFiles] = useState(false);

  // Reset state when modal opens with new file
  useEffect(() => {
    if (show) {
      // Check if current category exists in the categories list
      const categoryExists = categories.some(c => (c.name || c.title) === currentCategory) || currentCategory === 'Default';
      if (onCategoryChange) {
        onCategoryChange(categoryExists ? (currentCategory || 'Default') : '__custom__');
      }
      setCustomCategory(categoryExists ? '' : (currentCategory || ''));
      setUseCustom(!categoryExists && currentCategory && currentCategory !== 'Default');
      setMoveFiles(false);
    }
  }, [show, currentCategory, categories, onCategoryChange]);

  // Reset moveFiles when showMoveOption changes or permission check fails
  useEffect(() => {
    if (!showMoveOption || permissionCheck.error) {
      setMoveFiles(false);
    }
  }, [showMoveOption, permissionCheck.error]);

  if (!show) return null;

  const isBatch = Array.isArray(fileHash) || fileCount > 1;
  const displayCount = fileCount || (Array.isArray(fileHash) ? fileHash.length : 1);

  // Use controlled category from hook if provided, otherwise fallback to currentCategory
  const selectedCategory = controlledCategory || currentCategory || 'Default';

  // Check if selected category is the same as current (no change)
  const finalCategory = useCustom ? customCategory.trim() : selectedCategory;
  const isSameCategory = finalCategory === currentCategory || (useCustom && !customCategory.trim());

  // Determine if submit should be disabled
  const isSubmitDisabled = isSameCategory || (hasAmuleSharedFiles && permissionCheck.error);

  const handleSubmit = () => {
    // Always submit category name (backend handles client-specific logic)
    // Pass moveFiles option if applicable
    // For aMule shared files, move is always true (forceMove)
    const shouldMove = forceMove || (showMoveOption && moveFiles);
    onSubmit(fileHash, finalCategory, { moveFiles: shouldMove });
  };

  const handleCategoryChange = (e) => {
    const value = e.target.value;
    if (value === '__custom__') {
      setUseCustom(true);
      if (onCategoryChange) onCategoryChange('__custom__');
    } else {
      setUseCustom(false);
      if (onCategoryChange) onCategoryChange(value);
    }
  };

  // Sort categories: Default first, then alphabetically
  const sortedCategories = [...categories].sort((a, b) => {
    const nameA = a.name || a.title || '';
    const nameB = b.name || b.title || '';
    if (nameA === 'Default') return -1;
    if (nameB === 'Default') return 1;
    return nameA.localeCompare(nameB);
  });

  return h(Portal, null,
    h('div', {
      className: 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4',
      onClick: onClose
    },
      h('div', {
        className: 'bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6',
        onClick: (e) => e.stopPropagation()
      },
      h('h3', { className: 'text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2' },
        'Change Category'
      ),
      h('p', { className: 'text-sm text-gray-600 dark:text-gray-400 mb-4 break-all' },
        isBatch
          ? `Change category for ${displayCount} selected file${displayCount !== 1 ? 's' : ''}`
          : fileName
      ),

      // Single unified category dropdown for both client types
      h('div', { className: 'mb-4' },
        h('label', { className: 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1' },
          'Category'
        ),
        h(Select, {
          value: useCustom ? '__custom__' : selectedCategory,
          onChange: handleCategoryChange,
          options: [
            ...sortedCategories.map(cat => ({
              value: cat.name || cat.title,
              label: cat.name || cat.title
            })),
            { value: '__custom__', label: '+ Create new category...' }
          ],
          className: 'w-full'
        }),
        // Custom category input (shown when custom option selected)
        useCustom && h('input', {
          type: 'text',
          value: customCategory,
          onChange: (e) => setCustomCategory(e.target.value),
          placeholder: 'Enter new category name',
          autoFocus: true,
          className: 'w-full mt-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm ' +
            'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ' +
            'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100'
        })
      ),

      // Info for aMule files (downloads will complete to category path, shared files will be moved)
      hasAmuleFiles && !useCustom && h(AlertBox, { type: 'info', className: 'mb-4' },
        'aMule files will be moved to the new category path'
      ),

      // Move files option - different behavior based on client types
      showMoveOption && !useCustom && h('div', { className: 'mb-4' },
        // For aMule-only: show destination path (no checkbox, forced)
        // For rTorrent (or mixed): show checkbox with appropriate label
        hasAmuleSharedFiles && !hasRtorrentItems
          ? h('div', { className: 'text-sm text-gray-700 dark:text-gray-300' },
              permissionCheck.loading
                ? 'Checking paths...'
                : permissionCheck.destPath
                  ? h('span', null,
                      'Destination: ',
                      h('span', { className: 'font-mono text-xs break-all' }, permissionCheck.destPath)
                    )
                  : 'Files will be moved to category path'
            )
          : h('label', {
              className: `flex items-start gap-2 text-sm ${permissionCheck.error ? 'opacity-50' : 'cursor-pointer'}`
            },
              h('input', {
                type: 'checkbox',
                checked: moveFiles,
                onChange: (e) => setMoveFiles(e.target.checked),
                disabled: !!permissionCheck.error || permissionCheck.loading,
                className: 'mt-0.5 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500'
              }),
              h('span', { className: 'text-gray-700 dark:text-gray-300' },
                permissionCheck.loading
                  ? 'Checking paths...'
                  : hasAmuleSharedFiles && hasRtorrentItems
                    ? permissionCheck.destPath
                      ? h('span', null,
                          'Also move rTorrent files to: ',
                          h('span', { className: 'font-mono text-xs break-all' }, permissionCheck.destPath)
                        )
                      : 'Also move rTorrent files'
                    : permissionCheck.destPath
                      ? h('span', null,
                          'Move files to: ',
                          h('span', { className: 'font-mono text-xs break-all' }, permissionCheck.destPath)
                        )
                      : 'Move files to category path'
              )
            ),
        // Show warning if path check failed
        permissionCheck.error && h(AlertBox, {
          type: 'warning',
          className: 'mt-2',
          onAction: onEditMappings,
          actionLabel: 'Edit category mappings \u2192'
        }, permissionCheck.error)
      ),

      h('div', { className: 'flex gap-3 justify-end' },
        h(Button, {
          variant: 'secondary',
          onClick: onClose
        }, 'Cancel'),
        h(Button, {
          variant: 'primary',
          onClick: handleSubmit,
          disabled: isSubmitDisabled || permissionCheck.loading
        }, permissionCheck.loading
          ? [h('span', { key: 's', className: 'w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin' }), 'Checking\u2026']
          : 'Change Category'
        )
      )
    )
  ));
};

export default FileCategoryModal;
