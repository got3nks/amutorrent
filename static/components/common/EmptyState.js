/**
 * EmptyState Component
 *
 * Shows loading, empty, or "no matches" state for data views.
 * Optionally shows an icon and a "Clear filters" button.
 */

import React from 'https://esm.sh/react@18.2.0';
import Icon from './Icon.js';

const { createElement: h } = React;

/**
 * @param {boolean} [loading=false] - Whether data is still loading
 * @param {string} [loadingMessage='Loading...'] - Message while loading
 * @param {boolean} [hasFilters=false] - Whether any filters are active
 * @param {string} [filterMessage='No items match the current filters'] - Message when filters yield no results
 * @param {string} [emptyMessage='No items'] - Message when empty with no filters
 * @param {function} [onClearFilters] - Callback to clear all filters
 * @param {string} [icon] - Optional icon name for larger empty states
 * @param {number} [iconSize=48] - Icon size
 */
const EmptyState = ({
  loading = false,
  loadingMessage = 'Loading...',
  hasFilters = false,
  filterMessage = 'No items match the current filters',
  emptyMessage = 'No items',
  onClearFilters,
  icon,
  iconSize = 48
}) => {
  if (loading) {
    return h('div', { className: 'text-center py-6 text-xs sm:text-sm text-gray-500 dark:text-gray-400' },
      loadingMessage
    );
  }

  const message = hasFilters ? filterMessage : emptyMessage;

  if (icon) {
    return h('div', { className: 'text-center py-12' },
      h(Icon, { name: icon, size: iconSize, className: 'mx-auto text-gray-400 mb-4' }),
      h('p', { className: 'text-gray-500 dark:text-gray-400' }, message),
      hasFilters && onClearFilters && h('button', {
        onClick: onClearFilters,
        className: 'mt-2 text-blue-600 dark:text-blue-400 hover:underline text-sm'
      }, 'Clear filters')
    );
  }

  return h('div', { className: 'text-center py-6 text-xs sm:text-sm text-gray-500 dark:text-gray-400' },
    h('p', null, message),
    hasFilters && onClearFilters && h('button', {
      onClick: onClearFilters,
      className: 'mt-2 text-blue-600 dark:text-blue-400 hover:underline text-sm'
    }, 'Clear filters')
  );
};

export default EmptyState;
