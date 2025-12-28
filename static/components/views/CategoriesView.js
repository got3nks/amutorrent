/**
 * CategoriesView Component
 *
 * Displays category management interface
 */

import React from 'https://esm.sh/react@18.2.0';
import { Icon, Table } from '../common/index.js';
import { categoryColorToHex } from '../../utils/index.js';

const { createElement: h } = React;

/**
 * Categories view component
 * @param {Array} categories - List of categories
 * @param {boolean} loading - Loading state
 * @param {function} onCreateCategory - Create category handler
 * @param {function} onEditCategory - Edit category handler (receives category object)
 * @param {function} onDeleteCategory - Delete category handler (receives categoryId, categoryTitle)
 * @param {number} page - Current page number
 * @param {function} onPageChange - Page change handler
 * @param {number} pageSize - Items per page
 */
const CategoriesView = ({
  categories,
  loading,
  onCreateCategory,
  onEditCategory,
  onDeleteCategory,
  page,
  onPageChange,
  pageSize
}) => {
  const priorityMap = {
    0: { label: 'Normal', color: 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200' },
    1: { label: 'High', color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' },
    2: { label: 'Low', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' },
    3: { label: 'Auto', color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300' }
  };

  const columns = [
    {
      label: 'ID',
      key: 'id',
      sortable: true,
      width: '80px',
      render: (item) => h('span', { className: 'font-mono text-sm' }, item.id.toString())
    },
    {
      label: 'Title',
      key: 'title',
      sortable: true,
      width: 'auto',
      render: (item) => h('div', { className: 'font-medium flex items-center gap-2' },
        h('div', {
          className: 'w-4 h-4 rounded border border-gray-300 dark:border-gray-600',
          style: { backgroundColor: categoryColorToHex(item.color) }
        }),
        item.title
      )
    },
    {
      label: 'Path',
      key: 'path',
      sortable: true,
      width: '250px',
      render: (item) => h('div', {
        className: 'text-sm text-gray-600 dark:text-gray-400 truncate font-mono',
        title: item.path
      }, item.path || '(default path)')
    },
    {
      label: 'Comment',
      key: 'comment',
      sortable: true,
      width: '200px',
      render: (item) => h('div', { className: 'text-sm truncate', title: item.comment },
        item.comment || '-'
      )
    },
    {
      label: 'Priority',
      key: 'priority',
      sortable: true,
      width: '100px',
      render: (item) => {
        const p = priorityMap[item.priority] || priorityMap[0];
        return h('span', {
          className: `px-2 py-1 rounded text-xs font-medium ${p.color}`
        }, p.label);
      }
    },
    {
      label: 'Actions',
      key: 'actions',
      sortable: false,
      width: '150px',
      render: (item) => h('div', { className: 'flex gap-2' },
          item.id !== 0 && h('button', {
          onClick: () => onEditCategory(item),
          className: 'px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-all flex items-center gap-1'
        },
          h(Icon, { name: 'edit', size: 14 }),
          'Edit'
        ),
        item.id !== 0 && h('button', {
          onClick: () => onDeleteCategory(item.id, item.title),
          className: 'px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-all flex items-center gap-1'
        },
          h(Icon, { name: 'trash', size: 14 }),
          'Delete'
        )
      )
    }
  ];

  return h('div', { className: 'space-y-3' },
    h('div', { className: 'flex justify-between items-center mb-4' },
      h('h2', { className: 'text-xl font-bold text-gray-800 dark:text-gray-100' },
        `Categories (${categories.length})`
      ),
      h('button', {
        onClick: onCreateCategory,
        className: 'px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all flex items-center gap-2'
      },
        h(Icon, { name: 'plus', size: 16 }),
        'New Category'
      )
    ),
    categories.length === 0
      ? h('div', { className: 'text-center py-8 text-gray-500 dark:text-gray-400' },
          loading ? 'Loading categories...' : 'No categories found. Create one to get started!'
        )
      : h('div', null,
          // Mobile card view
          h('div', { className: 'block md:hidden space-y-2' },
            categories.map((item, idx) =>
              h('div', {
                key: item.id || idx,
                className: `p-3 rounded-lg ${idx % 2 === 0 ? 'bg-gray-50 dark:bg-gray-700/50' : 'bg-white dark:bg-gray-800/50'} border border-gray-200 dark:border-gray-700`
              },
                // Header with Title (ID: x), color indicator, and action buttons
                h('div', { className: 'flex items-start gap-2 mb-2' },
                  h('div', {
                    className: 'w-4 h-4 rounded border border-gray-300 dark:border-gray-600 flex-shrink-0 mt-0.5',
                    style: { backgroundColor: categoryColorToHex(item.color) }
                  }),
                  h('div', { className: 'flex-1 font-medium text-sm break-words text-gray-900 dark:text-gray-100 min-w-0' },
                    `${item.title} (ID: ${item.id})`
                  ),
                  h('button', {
                    onClick: () => onEditCategory(item),
                    className: 'flex-shrink-0 p-1.5 rounded-lg bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors',
                    title: 'Edit category'
                  }, h(Icon, { name: 'edit', size: 16 })),
                  item.id !== 0 && h('button', {
                    onClick: () => onDeleteCategory(item.id, item.title),
                    className: 'flex-shrink-0 p-1.5 rounded-lg bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors',
                    title: 'Delete category'
                  }, h(Icon, { name: 'trash', size: 16 }))
                ),
                // Details
                h('div', { className: 'space-y-1 text-xs text-gray-700 dark:text-gray-300' },
                  h('div', null,
                    h('span', { className: 'font-medium text-gray-600 dark:text-gray-400' }, 'Path: '),
                    h('span', { className: 'font-mono text-gray-900 dark:text-gray-100' }, item.path || '(default path)')
                  ),
                  h('div', null,
                    h('span', { className: 'font-medium text-gray-600 dark:text-gray-400' }, 'Comment: '),
                    h('span', { className: 'text-gray-900 dark:text-gray-100' }, item.comment || '-')
                  ),
                  h('div', null,
                    h('span', { className: 'font-medium text-gray-600 dark:text-gray-400' }, 'Priority: '),
                    h('span', {
                      className: `px-2 py-0.5 rounded text-xs font-medium ${(priorityMap[item.priority] || priorityMap[0]).color}`
                    }, (priorityMap[item.priority] || priorityMap[0]).label)
                  )
                )
              )
            )
          ),
          // Desktop table view
          h('div', { className: 'hidden md:block' },
            h(Table, {
              data: categories,
              columns,
              actions: null,
              currentSortBy: 'id',
              currentSortDirection: 'asc',
              onSortChange: () => {},
              page,
              onPageChange,
              pageSize
            })
          )
        )
  );
};

export default CategoriesView;
