/**
 * SearchResultsList Component
 *
 * Shared component for displaying search results with mobile/desktop views
 */

import React from 'https://esm.sh/react@18.2.0';
import { Icon, Table, PaginationControls } from './index.js';
import { formatBytes, getDynamicFontSize, sortFiles, calculatePagination } from '../../utils/index.js';

const { createElement: h } = React;

/**
 * Search results list component
 * @param {Array} results - Search results array
 * @param {object} sortConfig - Current sort configuration
 * @param {function} onSortChange - Sort change handler
 * @param {Array} categories - Categories list
 * @param {number} downloadCategoryId - Selected download category ID
 * @param {function} onDownloadCategoryChange - Download category change handler
 * @param {Set} downloadedFiles - Set of downloaded file hashes
 * @param {function} onDownload - Download handler (receives fileHash)
 * @param {number} page - Current page number
 * @param {function} onPageChange - Page change handler
 * @param {number} pageSize - Items per page
 */
const SearchResultsList = ({
  results,
  sortConfig,
  onSortChange,
  categories,
  downloadCategoryId,
  onDownloadCategoryChange,
  downloadedFiles,
  onDownload,
  page,
  onPageChange,
  pageSize
}) => {
  const { pagesCount, paginatedData } = calculatePagination(
    sortFiles(results, sortConfig.sortBy, sortConfig.sortDirection, true),
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
      label: 'Sources',
      key: 'sourceCount',
      sortable: true,
      width: '120px',
      render: (item) => `${item.sourceCount} sources`
    }
  ];

  return h('div', null,
    // Mobile sort and category controls
    h('div', { className: 'md:hidden flex flex-wrap items-center gap-2 mb-2' },
      h('div', { className: 'flex items-center gap-2 flex-1' },
        h('label', { className: 'text-sm font-medium text-gray-700 dark:text-gray-300' }, 'Sort:'),
        h('select', {
          value: sortConfig.sortBy,
          onChange: (e) => onSortChange(e.target.value, sortConfig.sortDirection),
          className: 'flex-1 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100'
        },
          columns.filter(c => c.sortable !== false).map(col =>
            h('option', { key: col.key, value: col.key }, col.label)
          )
        ),
        h('button', {
          onClick: () => onSortChange(sortConfig.sortBy, sortConfig.sortDirection === 'asc' ? 'desc' : 'asc'),
          className: 'px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm flex items-center gap-1 text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 active:scale-95 transition-all'
        },
          sortConfig.sortDirection === 'asc' ? '↑' : '↓'
        )
      ),
      h('div', { className: 'flex items-center gap-2 flex-1' },
        h('label', { className: 'text-sm font-medium text-gray-700 dark:text-gray-300' }, 'Cat:'),
        h('select', {
          value: downloadCategoryId,
          onChange: (e) => onDownloadCategoryChange(parseInt(e.target.value)),
          className: 'flex-1 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100'
        },
          h('option', { value: 0 }, 'Default (all)'),
          ...categories.filter(cat => cat.id !== 0).map(cat =>
            h('option', { key: cat.id, value: cat.id }, cat.title)
          )
        )
      )
    ),
    // Mobile card view
    h('div', { className: 'block md:hidden space-y-2' },
      paginatedData.map((item, idx) => {
        const isDownloaded = downloadedFiles.has(item.fileHash);
        return h('div', {
          key: item.fileHash || idx,
          className: `p-3 rounded-lg ${idx % 2 === 0 ? 'bg-gray-50 dark:bg-gray-700/50' : 'bg-white dark:bg-gray-800/50'} border border-gray-200 dark:border-gray-700 flex items-start gap-3`
        },
          // Left side: File info
          h('div', { className: 'flex-1 min-w-0' },
            // File name
            h('div', {
              className: 'font-medium text-sm mb-1 text-gray-900 dark:text-gray-100',
              style: {
                fontSize: getDynamicFontSize(item.fileName),
                wordBreak: 'break-all',
                overflowWrap: 'anywhere',
                lineHeight: '1.4'
              }
            }, item.fileName),
            // Size and Sources
            h('div', { className: 'text-xs text-gray-700 dark:text-gray-300 space-y-0.5' },
              h('div', null,
                h('span', { className: 'font-medium text-gray-600 dark:text-gray-400' }, 'Size: '),
                h('span', null, formatBytes(item.fileSize))
              ),
              h('div', null,
                h('span', { className: 'font-medium text-gray-600 dark:text-gray-400' }, 'Sources: '),
                h('span', null, `${item.sourceCount}`)
              )
            )
          ),
          // Right side: Download button (square)
          h('button', {
            onClick: () => !isDownloaded && onDownload(item.fileHash),
            disabled: isDownloaded,
            className: `flex-shrink-0 p-3 rounded-lg transition-all ${
              isDownloaded
                ? 'bg-gray-400 dark:bg-gray-600 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700 active:scale-95'
            }`,
            title: isDownloaded ? 'Downloading' : 'Download'
          },
            h(Icon, {
              name: isDownloaded ? 'check' : 'download',
              size: 20,
              className: 'text-white'
            })
          )
        );
      })
    ),
    // Mobile pagination
    h(PaginationControls, { page, onPageChange, pagesCount, options: { mobileOnly: true } }),
    // Desktop table view
    h('div', { className: 'hidden md:block' },
      h(Table, {
        data: results,
        columns,
        actions: (item) => {
          const isDownloaded = downloadedFiles.has(item.fileHash);
          return h('button', {
            onClick: () => !isDownloaded && onDownload(item.fileHash),
            disabled: isDownloaded,
            className: `flex-1 px-2 py-1 text-xs sm:text-sm rounded transition-all ${
              isDownloaded
                ? 'bg-gray-400 text-white cursor-not-allowed'
                : 'bg-green-600 text-white hover:bg-green-700 active:scale-95'
            }`
          },
            h('span', { className: 'flex items-center justify-center gap-1' },
              h(Icon, { name: isDownloaded ? 'check' : 'download', size: 14 }),
              isDownloaded ? 'Downloading' : 'Download'
            )
          );
        },
        currentSortBy: sortConfig.sortBy,
        currentSortDirection: sortConfig.sortDirection,
        onSortChange,
        page,
        onPageChange,
        pageSize
      })
    )
  );
};

export default SearchResultsList;
