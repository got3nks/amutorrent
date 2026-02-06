/**
 * SortableHeaderPart Component
 *
 * Helper button for creating sortable headers in combined columns
 * Used when a single column header needs multiple sortable fields (e.g., "Progress / Size")
 */

import React from 'https://esm.sh/react@18.2.0';

const { createElement: h } = React;

/**
 * @param {Object} props
 * @param {string} props.label - Display label for the sort button
 * @param {string} props.sortKey - The key to sort by when clicked
 * @param {string} props.currentSortBy - Currently active sort key
 * @param {string} props.currentSortDirection - Current sort direction ('asc'/'desc')
 * @param {function} props.onSortChange - Callback (sortKey, sortDirection)
 */
const SortableHeaderPart = ({ label, sortKey, currentSortBy, currentSortDirection, onSortChange }) => {
  const isActive = currentSortBy === sortKey;
  const arrow = isActive ? (currentSortDirection === 'asc' ? ' ↑' : ' ↓') : '';

  return h('button', {
    onClick: () => {
      if (isActive) {
        onSortChange(sortKey, currentSortDirection === 'asc' ? 'desc' : 'asc');
      } else {
        onSortChange(sortKey, 'desc');
      }
    },
    className: `whitespace-nowrap hover:text-blue-600 dark:hover:text-blue-400 transition-colors ${isActive ? 'text-blue-600 dark:text-blue-400' : ''}`
  }, label + arrow);
};

export default SortableHeaderPart;
