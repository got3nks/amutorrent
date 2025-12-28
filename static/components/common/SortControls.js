/**
 * SortControls Component
 *
 * Reusable sorting controls for tables and views
 */

import React from 'https://esm.sh/react@18.2.0';

const { createElement: h } = React;

/**
 * Sort controls component - provides dropdown and direction toggle
 * @param {Object} props
 * @param {Array} props.columns - Column definitions (must have key, label, and optional sortable property)
 * @param {string} props.sortBy - Current sort field key
 * @param {string} props.sortDirection - Current sort direction ('asc' or 'desc')
 * @param {function} props.onSortChange - Sort change handler (sortBy, sortDirection)
 * @param {boolean} props.showLabel - Whether to show "Sort:" label (default: true)
 * @param {string} props.labelText - Custom label text (default: "Sort:")
 * @param {boolean} props.fullWidth - Whether select should take full width (default: false)
 * @param {string} props.className - Additional CSS classes for container
 */
export const SortControls = ({
  columns,
  sortBy,
  sortDirection,
  onSortChange,
  showLabel = true,
  labelText = 'Sort:',
  fullWidth = false,
  className = ''
}) => {
  // Filter to only sortable columns
  const sortableColumns = columns.filter(c => c.sortable !== false);

  if (sortableColumns.length === 0) {
    return null;
  }

  const containerClasses = `flex items-center gap-2 ${fullWidth ? 'flex-1' : ''} ${className}`.trim();
  const selectClasses = fullWidth
    ? 'flex-1 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100'
    : 'border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100';

  return h('div', { className: containerClasses },
    // Sort label (optional)
    showLabel && h('label', {
      className: 'text-sm font-medium text-gray-700 dark:text-gray-300'
    }, labelText),

    // Sort field selector
    h('select', {
      value: sortBy,
      onChange: (e) => onSortChange(e.target.value, sortDirection),
      className: selectClasses,
      'aria-label': 'Sort by field'
    },
      sortableColumns.map(col =>
        h('option', { key: col.key, value: col.key }, col.label)
      )
    ),

    // Sort direction toggle button
    h('button', {
      onClick: () => onSortChange(sortBy, sortDirection === 'asc' ? 'desc' : 'asc'),
      className: 'px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm flex items-center gap-1 text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 active:scale-95 transition-all',
      title: `Sort ${sortDirection === 'asc' ? 'descending' : 'ascending'}`,
      'aria-label': `Toggle sort direction (currently ${sortDirection === 'asc' ? 'ascending' : 'descending'})`
    },
      sortDirection === 'asc' ? '↑' : '↓'
    )
  );
};

export default SortControls;
