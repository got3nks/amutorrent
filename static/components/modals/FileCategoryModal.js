/**
 * FileCategoryModal Component
 *
 * Modal for changing a file's category assignment
 */

import React from 'https://esm.sh/react@18.2.0';

const { createElement: h } = React;

/**
 * File category change modal
 * @param {boolean} show - Whether to show the modal
 * @param {string} fileHash - File hash
 * @param {string} fileName - File name to display
 * @param {number} currentCategoryId - Current category ID
 * @param {Array} categories - List of available categories
 * @param {number} selectedCategoryId - Currently selected category ID
 * @param {function} onSelectedCategoryChange - Handler for category selection change
 * @param {function} onSubmit - Submit handler
 * @param {function} onClose - Close handler
 */
const FileCategoryModal = ({
  show,
  fileHash,
  fileName,
  currentCategoryId,
  categories,
  selectedCategoryId,
  onSelectedCategoryChange,
  onSubmit,
  onClose
}) => {
  if (!show) return null;

  const handleSubmit = () => {
    onSubmit(fileHash, selectedCategoryId);
  };

  return h('div', {
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
      h('p', { className: 'text-sm text-gray-600 dark:text-gray-400 mb-4 break-words' },
        fileName
      ),
      h('select', {
        value: selectedCategoryId,
        onChange: (e) => onSelectedCategoryChange(parseInt(e.target.value)),
        className: 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 mb-4 focus:ring-2 focus:ring-blue-500'
      },
        h('option', { value: 0 }, 'Default (all)'),
        ...categories.filter(cat => cat.id !== 0).map(cat =>
          h('option', { key: cat.id, value: cat.id }, cat.title)
        )
      ),
      h('div', { className: 'flex gap-3 justify-end' },
        h('button', {
          onClick: onClose,
          className: 'px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all'
        }, 'Cancel'),
        h('button', {
          onClick: handleSubmit,
          className: 'px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-all'
        }, 'Change Category')
      )
    )
  );
};

export default FileCategoryModal;
