/**
 * SearchResultsList Component
 *
 * Shared component for displaying search results with mobile/desktop views
 * Uses checkboxes for multi-selection instead of per-row download buttons
 */

import React from 'https://esm.sh/react@18.2.0';
import { Table, Icon, MobileCardHeader } from './index.js';
import { formatBytes, formatDateTime, getMobileCardRowClass } from '../../utils/index.js';

const { createElement: h, useCallback, useMemo } = React;

/**
 * Column definitions for search results (aMule)
 * Exported for MobileSortButton in parent components (uses key, label, sortable)
 * Also used by Table internally (uses all properties including width, render)
 */
export const SEARCH_RESULTS_COLUMNS = [
  {
    key: 'fileName',
    label: 'File Name',
    sortable: true,
    width: 'auto',
    render: (item) =>
      h('div', {
        className: 'font-medium text-xs break-words whitespace-normal',
        style: { wordBreak: 'break-all', overflowWrap: 'anywhere' }
      }, item.fileName)
  },
  {
    key: 'fileSize',
    label: 'Size',
    sortable: true,
    width: '100px',
    render: (item) => h('span', { className: 'text-xs' }, formatBytes(item.fileSize))
  },
  {
    key: 'sourceCount',
    label: 'Sources',
    sortable: true,
    width: '120px',
    render: (item) => h('span', { className: 'text-xs' }, `${item.sourceCount} sources`)
  }
];

/**
 * Column definitions for Prowlarr search results
 * Includes indexer, category, and publish date columns
 */
export const PROWLARR_RESULTS_COLUMNS = [
  {
    key: 'fileName',
    label: 'Title',
    sortable: true,
    width: 'auto',
    render: (item) =>
      h('div', {
        className: 'font-medium text-xs break-words whitespace-normal',
        style: { wordBreak: 'break-all', overflowWrap: 'anywhere' }
      }, item.fileName)
  },
  {
    key: 'indexer',
    label: 'Indexer',
    sortable: true,
    width: '120px',
    render: (item) => h('span', {
      className: 'text-xs px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
    }, item.indexer || '-')
  },
  {
    key: 'fileSize',
    label: 'Size',
    sortable: true,
    width: '90px',
    render: (item) => h('span', { className: 'text-xs' }, formatBytes(item.fileSize))
  },
  {
    key: 'sourceCount',
    label: 'Sources',
    sortable: true,
    width: '120px',
    render: (item) => h('span', { className: 'text-xs' },
      h('span', { className: 'text-green-600 dark:text-green-400' }, `S: ${item.sourceCount || 0}`),
      ' / ',
      h('span', { className: 'text-orange-600 dark:text-orange-400' }, `L: ${item.leechers || 0}`)
    )
  },
  {
    key: 'categories',
    label: 'Category',
    sortable: false,
    width: '100px',
    render: (item) => {
      const cats = item.categories || [];
      const catName = cats.length > 0 ? cats[0].name : '-';
      return h('span', { className: 'text-xs text-gray-600 dark:text-gray-400 truncate', title: catName }, catName);
    }
  },
  {
    key: 'publishDate',
    label: 'Published',
    sortable: true,
    width: '160px',
    render: (item) => {
      if (!item.publishDate) return h('span', { className: 'text-xs text-gray-400' }, '-');
      const date = new Date(item.publishDate);
      return h('span', { className: 'text-xs text-gray-600 dark:text-gray-400' }, date.toLocaleString());
    }
  }
];

/**
 * Search results list component
 * Uses hybrid scrollable mode: desktop shows all items in scrollable table,
 * mobile uses load-more pagination for natural page scrolling
 * @param {Array} results - All sorted search results (for desktop scrollable)
 * @param {Array} loadedData - Sliced results for mobile load-more
 * @param {object} sortConfig - Current sort configuration
 * @param {function} onSortChange - Sort change handler
 * @param {Set} downloadedFiles - Set of downloaded file hashes
 * @param {Set} selectedFiles - Set of selected file hashes
 * @param {function} onToggleSelection - Toggle selection handler (receives fileHash)
 * @param {number} loadedCount - Number of items currently loaded (for mobile)
 * @param {number} totalCount - Total number of items
 * @param {boolean} hasMore - Whether there are more items to load (for mobile)
 * @param {number} remaining - Number of remaining items (for mobile)
 * @param {function} onLoadMore - Handler for loading more items (for mobile)
 * @param {function} onLoadAll - Handler for loading all remaining items (for mobile)
 * @param {function} resetLoaded - Handler to reset loaded items
 * @param {number} pageSize - Items per batch (for mobile)
 * @param {string} emptyMessage - Optional message to show when results are empty
 * @param {boolean} isProwlarr - Whether results are from Prowlarr (shows different columns)
 * @param {string} scrollHeight - Custom scroll height for the table (default: 'calc(100vh - 280px)')
 * @param {Array} customColumns - Optional custom column definitions (overrides default columns)
 */
const SearchResultsList = ({
  results,
  loadedData,
  sortConfig,
  onSortChange,
  downloadedFiles,
  selectedFiles,
  onToggleSelection,
  loadedCount,
  totalCount,
  hasMore,
  remaining,
  onLoadMore,
  onLoadAll,
  resetLoaded,
  pageSize,
  emptyMessage = null,
  isProwlarr = false,
  scrollHeight,
  customColumns = null
}) => {
  // Select columns based on result type (use custom columns if provided)
  const baseColumns = customColumns || (isProwlarr ? PROWLARR_RESULTS_COLUMNS : SEARCH_RESULTS_COLUMNS);

  // Desktop columns with selection-aware fileName render
  const columnsWithSelection = useMemo(() =>
    baseColumns.map(col =>
      col.key === 'fileName'
        ? { ...col, render: (item) =>
            h('div', {
              className: 'font-medium text-xs break-words whitespace-normal cursor-pointer hover:underline decoration-dotted',
              style: { wordBreak: 'break-all', overflowWrap: 'anywhere' },
              onClick: () => onToggleSelection(item.fileHash)
            }, item.fileName)
          }
        : col
    ),
    [baseColumns, onToggleSelection]
  );

  // Mobile card renderer using MobileCardHeader
  const renderMobileCard = useCallback((item, idx) => {
    const isDownloaded = downloadedFiles.has(item.fileHash);
    const isSelected = selectedFiles.has(item.fileHash);
    return h('div', {
      className: `${getMobileCardRowClass(idx)}${isSelected ? ' !bg-purple-100 dark:!bg-purple-900/40' : ''}`
    },
      h(MobileCardHeader, {
        showBadge: false,
        fileName: item.fileName,
        onNameClick: () => onToggleSelection(item.fileHash),
        actions: isDownloaded
          ? h('div', { className: 'flex items-center justify-center w-8 h-8' },
              h(Icon, { name: 'check', size: 18, className: 'text-green-500' })
            )
          : h('input', {
              type: 'checkbox',
              checked: isSelected,
              onChange: () => onToggleSelection(item.fileHash),
              className: 'w-5 h-5 text-purple-600 border-gray-300 rounded cursor-pointer'
            })
      },
        // Detail row: Size and Sources/Seeders
        h('div', { className: 'flex items-center gap-1 text-xs text-gray-700 dark:text-gray-300 flex-wrap' },
          h(Icon, { name: 'harddrive', size: 12, className: 'text-gray-500 dark:text-gray-400' }),
          h('span', { className: 'text-gray-900 dark:text-gray-100' }, formatBytes(item.fileSize)),
          h('span', { className: 'text-gray-400' }, '·'),
          isProwlarr
            ? [
                h('span', { key: 'seeders', className: 'text-green-600 dark:text-green-400' }, `S: ${item.sourceCount || 0}`),
                h('span', { key: 'sep', className: 'text-gray-400' }, ' / '),
                h('span', { key: 'leechers', className: 'text-orange-600 dark:text-orange-400' }, `L: ${item.leechers || 0}`)
              ]
            : [
                h(Icon, { key: 'icon', name: 'share', size: 12, className: 'text-gray-500 dark:text-gray-400' }),
                h('span', { key: 'sources', className: 'text-gray-900 dark:text-gray-100' }, `${item.sourceCount} sources`)
              ],
          // Prowlarr-specific: indexer and category
          isProwlarr && item.indexer && [
            h('span', { key: 'sep2', className: 'text-gray-400' }, '·'),
            h('span', { key: 'indexer', className: 'px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' }, item.indexer)
          ],
          isProwlarr && item.categories?.length > 0 && [
            h('span', { key: 'sep3', className: 'text-gray-400' }, '·'),
            h('span', { key: 'cat', className: 'text-gray-500 dark:text-gray-400' }, item.categories[0].name)
          ]
        )
      )
    );
  }, [downloadedFiles, selectedFiles, onToggleSelection, isProwlarr]);

  // Desktop actions renderer — checkbox or green check icon
  const renderActions = useCallback((item) => {
    const isDownloaded = downloadedFiles.has(item.fileHash);
    if (isDownloaded) {
      return h('div', { className: 'flex items-center justify-center' },
        h(Icon, { name: 'check', size: 16, className: 'text-green-500' })
      );
    }
    return h('div', { className: 'flex items-center justify-center' },
      h('input', {
        type: 'checkbox',
        checked: selectedFiles.has(item.fileHash),
        onChange: () => onToggleSelection(item.fileHash),
        className: 'w-4 h-4 text-purple-600 border-gray-300 rounded cursor-pointer'
      })
    );
  }, [downloadedFiles, selectedFiles, onToggleSelection]);

  // Row highlight for selected items
  const getRowClassName = useCallback((item) => {
    return selectedFiles.has(item.fileHash) ? '!bg-purple-100 dark:!bg-purple-900/40' : '';
  }, [selectedFiles]);

  // Empty state
  if (results.length === 0 && emptyMessage) {
    return h('div', { className: 'text-center py-6 text-xs sm:text-sm text-gray-500 dark:text-gray-400' }, emptyMessage);
  }

  // Hybrid scrollable mode: desktop shows all items in scrollable table,
  // mobile uses load-more pagination for natural page scrolling
  return h(Table, {
    data: results,
    columns: columnsWithSelection,
    scrollable: true,
    scrollHeight,
    actions: renderActions,
    currentSortBy: sortConfig.sortBy,
    currentSortDirection: sortConfig.sortDirection,
    onSortChange,
    // Load-more props for mobile in hybrid scrollable mode
    loadedCount,
    totalCount,
    hasMore,
    remaining,
    onLoadMore,
    onLoadAll,
    resetLoaded,
    pageSize,
    getRowKey: (item) => item.fileHash,
    getRowClassName,
    breakpoint: 'xl',
    mobileCardRender: renderMobileCard
  });
};

export default SearchResultsList;
