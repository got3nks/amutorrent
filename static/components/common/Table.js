/**
 * Table Component
 *
 * Generic data table with sorting, pagination, and responsive mobile/desktop views
 */

import React from 'https://esm.sh/react@18.2.0';
import Icon from './Icon.js';
import { sortFiles, calculatePagination } from '../../utils/index.js';
import { PaginationControls } from './PaginationControls.js';
import { SortControls } from './SortControls.js';

const { createElement: h } = React;

/**
 * Reusable table component
 * @param {Array} data - Array of data to display
 * @param {Array} columns - Column definitions with label, key, sortable, width, render
 * @param {function|null} actions - Actions renderer function (receives item)
 * @param {string} currentSortBy - Current sort column key
 * @param {string} currentSortDirection - Current sort direction ('asc'/'desc')
 * @param {function} onSortChange - Sort change handler (sortBy, sortDirection)
 * @param {number} page - Current page number
 * @param {function} onPageChange - Page change handler
 * @param {number} pageSize - Items per page
 * @param {React.ReactNode|null} mobileControls - Additional mobile controls to display
 * @param {boolean} mobileControlsSameRow - Whether to show mobile controls on same row as sort (default: false)
 */
const Table = ({
  data,
  columns,
  actions = null,
  currentSortBy,
  currentSortDirection,
  onSortChange,
  page,
  onPageChange,
  pageSize,
  mobileControls = null,
  mobileControlsSameRow = false
}) => {
  // Safety check: ensure data is an array
  if (!Array.isArray(data)) {
    console.error('Table: data is not an array', data);
    return h('div', { className: 'text-center py-6 text-xs sm:text-sm text-red-500 dark:text-red-400' },
      'Error: Invalid data format'
    );
  }

  const { pagesCount, paginatedData } = calculatePagination(
    sortFiles(data, currentSortBy, currentSortDirection),
    page,
    pageSize
  );

  return h('div', { className: 'space-y-2' },

    // Mobile sort control
    mobileControlsSameRow ?
      // Same row layout (for Search pages)
      h('div', { className: 'md:hidden flex flex-wrap items-center gap-2' },
        h(SortControls, {
          columns,
          sortBy: currentSortBy,
          sortDirection: currentSortDirection,
          onSortChange,
          showLabel: true,
          fullWidth: false
        }),
        mobileControls && h('div', { className: 'flex items-center gap-2' }, mobileControls)
      ) :
      // Separate rows layout (for Downloads page)
      h('div', { className: 'md:hidden' },
        h('div', { className: 'flex flex-wrap items-center gap-2 mb-2' },
          h(SortControls, {
            columns,
            sortBy: currentSortBy,
            sortDirection: currentSortDirection,
            onSortChange,
            showLabel: true,
            fullWidth: true
          })
        ),
        // Additional mobile controls (like Download to) on second row
        mobileControls && h('div', { className: 'flex items-center gap-2' }, mobileControls)
      ),

    // Mobile card view
    h('div', { className: 'block md:hidden space-y-2' },
      paginatedData.map((item, idx) => {
        // Title based on item type
        const title = item.EC_TAG_SERVER_NAME || item.fileName || item.EC_TAG_PARTFILE_NAME || 'N/A';

        return h('div', {
          key: item.fileHash || item.EC_TAG_CLIENT_HASH || item._value || idx,
          className: `p-2 sm:p-3 rounded-lg ${idx % 2 === 0 ? 'bg-gray-50 dark:bg-gray-700/50' : 'bg-white dark:bg-gray-800/50'} border border-gray-200 dark:border-gray-700`
        },
          h('div', {
            className: 'font-medium text-xs sm:text-sm mb-1.5 break-all text-gray-900 dark:text-gray-100'
          }, title),
          h('div', { className: 'space-y-1 text-xs' },
            columns.map((col, cidx) => {
              if (col.key === 'fileName' || col.key === 'EC_TAG_PARTFILE_NAME' || col.key === 'EC_TAG_SERVER_NAME') return null;
              return h('div', {
                key: cidx,
                className: 'text-gray-700 dark:text-gray-300'
              },
                col.key != 'progress' && h('span', { className: 'font-medium text-gray-600 dark:text-gray-400' }, col.label + ': '),
                h('span', { className: 'text-gray-900 dark:text-gray-100' },
                  col.render ? col.render(item) : item[col.key]
                )
              );
            })
          ),
          actions && h('div', { className: 'flex gap-1.5 mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 justify-center' },
            actions(item)
          )
        );
      })
    ),

    // Desktop table view
    h('div', { className: 'hidden md:block overflow-x-auto' },
      h('table', { className: 'w-full' },
        h('thead', null,
          h('tr', { className: 'border-b-2 border-gray-300 dark:border-gray-600' },
            columns.map((col, idx) =>
              h('th', {
                key: idx,
                className: 'text-left p-2 font-semibold text-xs sm:text-sm text-gray-700 dark:text-gray-300',
                style: col.width && col.width !== 'auto' ? { width: col.width } : undefined
              },
                col.sortable ? h('button', {
                  onClick: () => {
                    if (currentSortBy === col.key) {
                      // Toggle direction
                      onSortChange(col.key, currentSortDirection === 'asc' ? 'desc' : 'asc');
                    } else {
                      // New column – default to descending
                      onSortChange(col.key, 'desc');
                    }
                    onPageChange(0);
                  },
                  className: `hover:text-blue-600 dark:hover:text-blue-400 transition-colors ${currentSortBy === col.key ? 'text-blue-600 dark:text-blue-400' : ''}`
                }, col.label +
                    (currentSortBy === col.key
                      ? currentSortDirection === 'asc' ? ' ↑' : ' ↓'
                      : '')
                    ) : col.label
              )
            ),
            actions && h('th', { className: 'text-left p-2 font-semibold text-xs sm:text-sm text-gray-700 dark:text-gray-300' }, 'Actions')
          )
        ),
        h('tbody', null,
          paginatedData.map((item, idx) =>
            h('tr', {
              key: item.fileHash || item.EC_TAG_CLIENT_HASH || idx,
              className: `
                ${idx % 2 === 0 ? 'bg-gray-50 dark:bg-gray-800' : 'bg-white dark:bg-gray-900'}
                hover:bg-indigo-100 dark:hover:bg-indigo-700 transition-colors duration-200
              `
            },
              columns.map((col, cidx) =>
                h('td', {
                  key: cidx,
                  className: 'p-2 text-xs sm:text-sm text-gray-900 dark:text-gray-100',
                  style: col.width && col.width !== 'auto' ? { width: col.width } : undefined
                },
                  col.render ? col.render(item) : item[col.key]
                )
              ),
              actions && h('td', { className: 'p-2' },
                h('div', { className: 'flex gap-2' }, actions(item))
              )
            )
          )
        )
      )
    ),

    // Enhanced Pagination
    h(PaginationControls, {
      page,
      onPageChange,
      pagesCount,
      options: { showFirstLast: true, showPageSelector: true }
    })
  );
};

export default Table;
