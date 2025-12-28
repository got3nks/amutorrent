/**
 * SearchResultsView Component
 *
 * Displays search results with download functionality
 */

import React from 'https://esm.sh/react@18.2.0';
import { Icon, SearchResultsList } from '../common/index.js';

const { createElement: h } = React;

/**
 * Search results view component
 * @param {Array} searchResults - Search results list
 * @param {object} sortConfig - Current sort configuration
 * @param {function} onSortChange - Sort change handler
 * @param {Array} categories - Categories list
 * @param {number} searchDownloadCategoryId - Selected download category ID
 * @param {function} onSearchDownloadCategoryIdChange - Download category change handler
 * @param {Set} downloadedFiles - Set of downloaded file hashes
 * @param {function} onDownload - Download handler (receives fileHash)
 * @param {function} onNewSearch - New search handler
 * @param {number} page - Current page number
 * @param {function} onPageChange - Page change handler
 * @param {number} pageSize - Items per page
 */
const SearchResultsView = ({
  searchResults,
  sortConfig,
  onSortChange,
  categories,
  searchDownloadCategoryId,
  onSearchDownloadCategoryIdChange,
  downloadedFiles,
  onDownload,
  onNewSearch,
  page,
  onPageChange,
  pageSize
}) => {
  return h('div', { className: 'space-y-2 sm:space-y-3' },
    h('div', { className: 'flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2' },
      h('div', { className: 'flex items-center gap-3' },
        h('h2', { className: 'text-base sm:text-lg font-bold text-gray-800 dark:text-gray-100' }, 'Search Results'),
        h('span', { className: 'text-sm text-gray-500 dark:text-gray-400' }, `(${searchResults.length} results)`)
      ),
      h('div', { className: 'hidden sm:flex items-center gap-2' },
        searchResults.length > 0 && h('div', { className: 'flex items-center gap-2' },
          h('label', { className: 'text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap' }, 'Download to:'),
          h('select', {
            value: searchDownloadCategoryId,
            onChange: (e) => onSearchDownloadCategoryIdChange(parseInt(e.target.value)),
            className: 'px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500',
            title: 'Select category for downloads'
          },
            h('option', { value: 0 }, 'Default (all)'),
            ...categories.filter(cat => cat.id !== 0).map(cat =>
              h('option', { key: cat.id, value: cat.id }, cat.title)
            )
          )
        ),
        h('button', {
          onClick: onNewSearch,
          className: 'px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all active:scale-95 text-sm sm:text-base flex items-center gap-2 justify-center'
        },
          h(Icon, { name: 'search', size: 16 }),
          'New Search'
        )
      )
    ),
    // Mobile-only New Search button
    h('div', { className: 'sm:hidden' },
      h('button', {
        onClick: onNewSearch,
        className: 'w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all active:scale-95 text-sm flex items-center gap-2 justify-center'
      },
        h(Icon, { name: 'search', size: 16 }),
        'New Search'
      )
    ),
    searchResults.length === 0 ? h('div', { className: 'text-center py-6 text-xs sm:text-sm text-gray-500 dark:text-gray-400' }, 'No results found') :
    h(SearchResultsList, {
      results: searchResults,
      sortConfig,
      onSortChange,
      categories,
      downloadCategoryId: searchDownloadCategoryId,
      onDownloadCategoryChange: onSearchDownloadCategoryIdChange,
      downloadedFiles,
      onDownload,
      page,
      onPageChange,
      pageSize
    })
  );
};

export default SearchResultsView;
