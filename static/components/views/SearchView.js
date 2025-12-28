/**
 * SearchView Component
 *
 * File search interface with type selection and previous results
 */

import React from 'https://esm.sh/react@18.2.0';
import { SearchResultsList } from '../common/index.js';

const { createElement: h } = React;

/**
 * Search view component
 * @param {string} searchQuery - Current search query
 * @param {function} onSearchQueryChange - Search query change handler
 * @param {string} searchType - Search type (global/local/kad)
 * @param {function} onSearchTypeChange - Search type change handler
 * @param {boolean} loading - Loading state
 * @param {boolean} searchLocked - Search locked state
 * @param {function} onSearch - Search handler
 * @param {string|null} error - Error message
 * @param {Array} previousResults - Previous search results
 * @param {object} sortConfig - Current sort configuration
 * @param {function} onSortChange - Sort change handler
 * @param {Array} categories - Categories list
 * @param {number} searchDownloadCategoryId - Selected download category ID
 * @param {function} onSearchDownloadCategoryIdChange - Download category change handler
 * @param {Set} downloadedFiles - Set of downloaded file hashes
 * @param {function} onDownload - Download handler (receives fileHash)
 * @param {number} page - Current page number
 * @param {function} onPageChange - Page change handler
 * @param {number} pageSize - Items per page
 */
const SearchView = ({
  searchQuery,
  onSearchQueryChange,
  searchType,
  onSearchTypeChange,
  loading,
  searchLocked,
  onSearch,
  error,
  previousResults,
  sortConfig,
  onSortChange,
  categories,
  searchDownloadCategoryId,
  onSearchDownloadCategoryIdChange,
  downloadedFiles,
  onDownload,
  page,
  onPageChange,
  pageSize
}) => {
  return h('div', { className: 'space-y-2 sm:space-y-3' },
    h('h2', { className: 'text-base sm:text-lg font-bold text-gray-800 dark:text-gray-100' }, 'Search Files'),
    h('div', { className: 'space-y-2' },
      h('div', { className: 'grid grid-cols-3 gap-1.5' },
        [
          { value: 'global', label: '🌐 Global' },
          { value: 'local', label: '🗄️ Local' },
          { value: 'kad', label: '☁️ Kad' }
        ].map(type =>
          h('button', {
            key: type.value,
            onClick: () => onSearchTypeChange(type.value),
            className: `px-2 py-1.5 rounded text-xs sm:text-sm transition-all active:scale-95 ${
              searchType === type.value
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
            }`
          }, type.label)
        )
      ),
      h('div', { className: 'flex flex-col sm:flex-row gap-2' },
        h('input', {
          type: 'text',
          value: searchQuery,
          onChange: (e) => onSearchQueryChange(e.target.value),
          onKeyPress: (e) => e.key === 'Enter' && onSearch(),
          placeholder: 'Enter search query...',
          className: 'flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400'
        }),
        h('button', {
          onClick: onSearch,
          disabled: loading || searchLocked,
          className: 'px-4 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 whitespace-nowrap'
        },
          loading ? h('span', { className: 'flex items-center justify-center gap-2' },
            h('div', { className: 'loader' }),
            'Searching...'
          ) : searchLocked ? 'Another search is running' : 'Search'
        )
      ),
      error && h('div', { className: 'p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-200 text-sm' }, error)
    ),
    // Previous Search Results Section
    previousResults.length > 0 && h('div', { className: 'space-y-2' },
      h('div', { className: 'flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2' },
        h('div', { className: 'flex items-center gap-3' },
          h('h2', { className: 'text-base sm:text-lg font-bold text-gray-800 dark:text-gray-100' }, 'Previous Search Results'),
          h('span', { className: 'text-sm text-gray-500 dark:text-gray-400' }, `(${previousResults.length} cached results)`)
        ),
        h('div', { className: 'hidden sm:flex items-center gap-2' },
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
        )
      ),
      h(SearchResultsList, {
        results: previousResults,
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
    )
  );
};

export default SearchView;
