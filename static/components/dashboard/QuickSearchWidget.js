/**
 * QuickSearchWidget Component
 *
 * Quick search form for dashboard with type selector and search input
 */

import React from 'https://esm.sh/react@18.2.0';
import { Icon } from '../common/index.js';

const { createElement: h } = React;

/**
 * QuickSearchWidget component
 * @param {string} searchType - Current search type ('global', 'local', 'kad')
 * @param {function} onSearchTypeChange - Search type change handler
 * @param {string} searchQuery - Current search query
 * @param {function} onSearchQueryChange - Search query change handler
 * @param {function} onSearch - Search submit handler
 * @param {boolean} searchLocked - Whether search is in progress
 */
const QuickSearchWidget = ({
  searchType,
  onSearchTypeChange,
  searchQuery,
  onSearchQueryChange,
  onSearch,
  searchLocked
}) => {
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!searchLocked && searchQuery.trim()) {
      onSearch();
    }
  };

  const searchTypes = [
    { value: 'global', label: 'Global', emoji: '🌐' },
    { value: 'local', label: 'Local', emoji: '🗄️' },
    { value: 'kad', label: 'Kad', emoji: '☁️' }
  ];

  return h('div', {
    className: 'bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700'
  },
    h('h3', {
      className: 'text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300'
    }, 'Quick Search'),
    h('form', {
      onSubmit: handleSubmit,
      className: 'flex flex-col sm:flex-row gap-2'
    },
      // Search type selector
      h('div', {
        className: 'flex gap-1'
      },
        ...searchTypes.map(type =>
          h('button', {
            key: type.value,
            type: 'button',
            onClick: () => onSearchTypeChange(type.value),
            disabled: searchLocked,
            className: `px-3 py-2 rounded-lg transition-colors text-xs font-medium ${
              searchType === type.value
                ? 'bg-blue-600 dark:bg-blue-500 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            } disabled:opacity-50 disabled:cursor-not-allowed`
          },
            `${type.emoji} ${type.label}`
          )
        )
      ),

      // Search input
      h('input', {
        type: 'text',
        value: searchQuery,
        onChange: (e) => onSearchQueryChange(e.target.value),
        placeholder: 'Enter search query...',
        disabled: searchLocked,
        className: 'flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed'
      }),

      // Search button
      h('button', {
        type: 'submit',
        disabled: searchLocked || !searchQuery.trim(),
        className: 'px-4 py-2 bg-blue-600 dark:bg-blue-500 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm font-medium whitespace-nowrap'
      },
        h(Icon, { name: 'search', size: 16 }),
        h('span', {}, searchLocked ? 'Searching...' : 'Search')
      )
    )
  );
};

export default QuickSearchWidget;
