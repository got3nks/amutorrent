/**
 * SharedView Component
 *
 * Displays shared files list with upload statistics
 */

import React from 'https://esm.sh/react@18.2.0';
import { Icon, Table, MobileCardView, PaginationControls, SortControls } from '../common/index.js';
import { formatBytes, getDynamicFontSize, sortFiles, calculatePagination } from '../../utils/index.js';

const { createElement: h, useMemo } = React;

/**
 * Shared files view component
 * @param {Array} shared - List of shared files
 * @param {boolean} loading - Loading state
 * @param {function} onRefresh - Refresh handler
 * @param {object} sortConfig - Current sort configuration
 * @param {function} onSortChange - Sort change handler
 * @param {number} page - Current page number
 * @param {function} onPageChange - Page change handler
 * @param {number} pageSize - Items per page
 */
const SharedView = ({
  shared,
  loading,
  onRefresh,
  sortConfig,
  onSortChange,
  page,
  onPageChange,
  pageSize
}) => {
  // Memoize sorted data to avoid double sorting
  const sortedShared = useMemo(() =>
    sortFiles(shared, sortConfig.sortBy, sortConfig.sortDirection, true),
    [shared, sortConfig.sortBy, sortConfig.sortDirection]
  );

  const { pagesCount, paginatedData } = calculatePagination(
    sortedShared,
    page,
    pageSize
  );

  const columns = [
    {
      label: 'File Name',
      key: 'fileName',
      sortable: true,
      width: 'auto',
      render: (item) =>
        h('div', {
          className: 'font-medium break-words whitespace-normal',
          style: { wordBreak: 'break-all', overflowWrap: 'anywhere' }
        }, item.fileName)
    },
    {
      label: 'Size',
      key: 'fileSize',
      sortable: true,
      width: '100px',
      render: (item) => formatBytes(item.fileSize)
    },
    {
      label: 'Total Upload',
      key: 'transferredTotal',
      sortable: true,
      width: '140px',
      render: (item) => formatBytes(item.transferredTotal) + ` (${item.acceptedCountTotal})`
    },
    {
      label: 'Session Upload',
      key: 'transferred',
      sortable: true,
      width: '140px',
      render: (item) => formatBytes(item.transferred) + ` (${item.acceptedCount})`
    }
  ];

  return h('div', { className: 'space-y-2 sm:space-y-3' },
    h('div', { className: 'flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3' },
      h('h2', { className: 'text-base sm:text-lg font-bold text-gray-800 dark:text-gray-100' }, `Shared Files (${shared.length})`),
      h('button', {
        onClick: onRefresh,
        disabled: loading,
        className: 'hidden sm:block px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-all active:scale-95 text-sm sm:text-base w-full sm:w-auto'
      },
        loading ? h('span', { className: 'flex items-center justify-center gap-2' },
          h('div', { className: 'loader' }),
          'Loading...'
        ) : h('span', null,
          h(Icon, { name: 'refresh', size: 16, className: 'inline mr-1' }),
          'Refresh'
        )
      )
    ),
    shared.length === 0 ? h('div', { className: 'text-center py-6 text-xs sm:text-sm text-gray-500 dark:text-gray-400' },
      loading ? 'Loading shared files...' : 'No shared files'
    ) : h('div', null,
// Mobile sort control
      h('div', { className: 'md:hidden flex flex-wrap items-center justify-between gap-2 mb-2' },
        h(SortControls, {
          columns,
          sortBy: sortConfig.sortBy,
          sortDirection: sortConfig.sortDirection,
          onSortChange,
          showLabel: true,
          fullWidth: true
        })
      ),
      // Mobile card view
      h(MobileCardView, {
        data: paginatedData,
        columns,
        actions: null,
        options: {
          customRender: (item, idx) => {
            return h('div', {
              className: `p-3 rounded-lg ${idx % 2 === 0 ? 'bg-gray-50 dark:bg-gray-700/50' : 'bg-white dark:bg-gray-800/50'} border border-gray-200 dark:border-gray-700`
            },
              // File name with size
              h('div', {
                className: 'font-medium text-sm mb-2 text-gray-900 dark:text-gray-100',
                style: {
                  fontSize: getDynamicFontSize(item.fileName),
                  wordBreak: 'break-all',
                  overflowWrap: 'anywhere',
                  lineHeight: '1.4'
                }
              },
                item.fileName
              ),
              // File size
              h('div', { className: 'text-xs text-gray-700 dark:text-gray-300 mb-1' },
                h('span', { className: 'font-medium text-gray-600 dark:text-gray-400' }, 'Size: '),
                h('span', null, formatBytes(item.fileSize))
              ),
              // Total / Session Upload in one line (like Uploads page)
              h('div', { className: 'text-xs text-gray-700 dark:text-gray-300' },
                h('span', { className: 'font-medium text-gray-600 dark:text-gray-400' }, 'Session Upload: '),
                h('span', null, formatBytes(item.transferred) + ` (${item.acceptedCount})`),
                h('span', { className: 'mx-2 text-gray-400' }, '/'),
                h('span', { className: 'font-medium text-gray-600 dark:text-gray-400' }, 'Total Upload: '),
                h('span', null, formatBytes(item.transferredTotal) + ` (${item.acceptedCountTotal})`)
              )
            );
          }
        }
      }),
      // Mobile pagination
      h(PaginationControls, { page, onPageChange, pagesCount, options: { mobileOnly: true } }),
      // Desktop table view
      h('div', { className: 'hidden md:block' },
        h(Table, {
          data: sortedShared,
          columns,
          actions: null,
          currentSortBy: sortConfig.sortBy,
          currentSortDirection: sortConfig.sortDirection,
          onSortChange,
          page,
          onPageChange,
          pageSize
        })
      )
    )
  );
};

export default SharedView;
