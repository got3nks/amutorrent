/**
 * CategoryModal Component
 *
 * Modal for creating and editing categories
 */

import React from 'https://esm.sh/react@18.2.0';
import { categoryColorToHex, hexToCategoryColor } from '../../utils/index.js';

const { createElement: h } = React;

/**
 * Category create/edit modal
 * @param {boolean} show - Whether to show the modal
 * @param {string} mode - 'create' or 'edit'
 * @param {object} category - Category object (for edit mode)
 * @param {object} formData - Form data state
 * @param {function} onFormDataChange - Form data change handler
 * @param {function} onCreate - Create handler
 * @param {function} onUpdate - Update handler
 * @param {function} onClose - Close handler
 * @param {function} setError - Error setter function
 */
const CategoryModal = ({
  show,
  mode,
  category,
  formData,
  onFormDataChange,
  onCreate,
  onUpdate,
  onClose,
  setError
}) => {
  if (!show) return null;

  const isEdit = mode === 'edit';

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      setError('Category title is required');
      return;
    }

    if (isEdit) {
      onUpdate(
        category.id,
        formData.title,
        formData.path,
        formData.comment,
        formData.color,
        formData.priority
      );
    } else {
      onCreate(
        formData.title,
        formData.path,
        formData.comment,
        formData.color,
        formData.priority
      );
    }
  };

  return h('div', {
    className: 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4',
    onClick: onClose
  },
    h('div', {
      className: 'bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full p-6',
      onClick: (e) => e.stopPropagation()
    },
      h('h3', { className: 'text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4' },
        isEdit ? 'Edit Category' : 'Create New Category'
      ),
      h('form', { onSubmit: handleSubmit, className: 'space-y-4' },
        // Title
        h('div', null,
          h('label', { className: 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1' },
            'Title *'
          ),
          h('input', {
            type: 'text',
            value: formData.title,
            onChange: (e) => onFormDataChange({ ...formData, title: e.target.value }),
            placeholder: 'e.g., Movies, Music, Software',
            className: 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent',
            required: true
          })
        ),

        // Download Path
        h('div', null,
          h('label', { className: 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1' },
            'Download Path'
          ),
          h('input', {
            type: 'text',
            value: formData.path,
            onChange: (e) => onFormDataChange({ ...formData, path: e.target.value }),
            placeholder: '/path/to/downloads (leave empty for default)',
            className: 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm'
          })
        ),

        // Comment
        h('div', null,
          h('label', { className: 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1' },
            'Comment'
          ),
          h('input', {
            type: 'text',
            value: formData.comment,
            onChange: (e) => onFormDataChange({ ...formData, comment: e.target.value }),
            placeholder: 'Optional description',
            className: 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent'
          })
        ),

        // Color
        h('div', null,
          h('label', { className: 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1' },
            'Color'
          ),
          h('div', { className: 'flex gap-2' },
            h('input', {
              type: 'color',
              value: categoryColorToHex(formData.color),
              onChange: (e) => {
                onFormDataChange({ ...formData, color: hexToCategoryColor(e.target.value) });
              },
              className: 'w-16 h-10 rounded border border-gray-300 dark:border-gray-600 cursor-pointer'
            }),
            h('input', {
              type: 'text',
              value: categoryColorToHex(formData.color).toUpperCase(),
              readOnly: true,
              className: 'flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-mono text-sm'
            })
          )
        ),

        // Priority
        h('div', null,
          h('label', { className: 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1' },
            'Priority'
          ),
          h('select', {
            value: formData.priority,
            onChange: (e) => onFormDataChange({ ...formData, priority: parseInt(e.target.value) }),
            className: 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent'
          },
            h('option', { value: 0 }, 'Normal'),
            h('option', { value: 1 }, 'High'),
            h('option', { value: 2 }, 'Low'),
            h('option', { value: 3 }, 'Auto')
          )
        ),

        // Buttons
        h('div', { className: 'flex gap-3 justify-end pt-4' },
          h('button', {
            type: 'button',
            onClick: onClose,
            className: 'px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all'
          }, 'Cancel'),
          h('button', {
            type: 'submit',
            className: 'px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-all'
          }, isEdit ? 'Update Category' : 'Create Category')
        )
      )
    )
  );
};

export default CategoryModal;
