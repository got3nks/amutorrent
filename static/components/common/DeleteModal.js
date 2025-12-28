/**
 * DeleteModal Component
 *
 * Generic confirmation modal for delete operations
 */

import React from 'https://esm.sh/react@18.2.0';
import Icon from './Icon.js';

const { createElement: h } = React;

/**
 * Delete confirmation modal
 * @param {boolean} show - Whether to show the modal
 * @param {string} title - Modal title
 * @param {string} message - Confirmation message
 * @param {string} itemName - Name of item being deleted (for display)
 * @param {string} confirmLabel - Label for confirm button (default: 'Delete')
 * @param {function} onConfirm - Confirm handler
 * @param {function} onCancel - Cancel handler
 * @param {string} itemType - Type of item ('File' or 'Server', default: 'File')
 */
const DeleteModal = ({
  show,
  title,
  message,
  itemName,
  confirmLabel = 'Delete',
  onConfirm,
  onCancel,
  itemType = 'File'
}) => {
  if (!show) return null;

  const isServer = itemType === 'Server';
  const actionWord = isServer ? 'remove' : 'delete';
  const displayTitle = title || `${isServer ? 'Remove' : 'Delete'} ${itemType}`;
  const displayMessage = message || `Are you sure you want to ${actionWord} `;

  return h('div', {
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
      h('p', { className: 'text-gray-700 dark:text-gray-300 mb-6 break-words' },
        displayMessage,
        itemName && h('span', { className: 'font-semibold break-words max-w-full' }, `"${itemName}"`),
        itemName && '?'
      ),
      h('div', { className: 'flex gap-3 justify-end' },
        h('button', {
          onClick: onCancel,
          className: 'px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors'
        }, 'Cancel'),
        h('button', {
          onClick: onConfirm,
          className: 'px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors'
        }, confirmLabel)
      )
    )
  );
};

export default DeleteModal;
