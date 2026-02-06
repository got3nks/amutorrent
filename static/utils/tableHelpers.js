/**
 * Table Helpers
 *
 * Utility functions for table column configuration
 */

import React from 'https://esm.sh/react@18.2.0';

const { createElement: h } = React;

/**
 * Create a filter dropdown headerRender for a Table column.
 * Renders a <select> styled as a column header that highlights blue when active.
 *
 * @param {string} value - Current filter value
 * @param {function} onChange - Called with new value string when selection changes
 * @param {Array<{value: string, label: string}>} options - Dropdown options (first should be the 'all'/default)
 * @returns {function} headerRender function for Table column definition
 *
 * Usage:
 *   { key: 'status', sortable: false, headerRender: makeFilterHeaderRender(
 *       statusFilter,
 *       (val) => { setStatusFilter(val); onPageChange(0); },
 *       statusOptions
 *   )}
 */
export const makeFilterHeaderRender = (value, onChange, options) => () =>
  h('select', {
    value,
    onChange: (e) => onChange(e.target.value),
    className: `bg-transparent border-none text-xs sm:text-sm font-semibold cursor-pointer outline-none ${value !== 'all' ? 'text-blue-600 dark:text-blue-400' : ''}`,
    onClick: (e) => e.stopPropagation()
  },
    options.map(opt => h('option', { key: opt.value, value: opt.value }, opt.label))
  );

/**
 * Extract all sortable keys from column definitions for secondary sort dropdown.
 * Handles columns with mobileSortOptions (sub-sorting) by expanding them.
 *
 * @param {Array} columns - Column definitions array
 * @returns {Array<{key: string, label: string}>} Sortable options for dropdown
 *
 * Example:
 *   columns = [
 *     { key: 'name', label: 'Name', sortable: true },
 *     { key: 'upload', label: 'Upload', mobileSortOptions: [
 *       { key: 'uploadTotal', label: 'UL Total' },
 *       { key: 'uploadSession', label: 'UL Session' }
 *     ]}
 *   ]
 *   returns: [
 *     { key: 'name', label: 'Name' },
 *     { key: 'uploadTotal', label: 'UL Total' },
 *     { key: 'uploadSession', label: 'UL Session' }
 *   ]
 */
export const getSortableColumns = (columns) => {
  const result = [];

  for (const col of columns) {
    // If column has mobileSortOptions, use those (sub-sort keys)
    if (col.mobileSortOptions && col.mobileSortOptions.length > 0) {
      for (const opt of col.mobileSortOptions) {
        result.push({ key: opt.key, label: opt.label });
      }
    }
    // Otherwise, if column is sortable, use its key
    else if (col.sortable) {
      result.push({ key: col.key, label: col.label });
    }
  }

  return result;
};
