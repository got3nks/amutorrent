/**
 * MobileSortButton Component
 *
 * Compact sort button that shows current sort as a pill.
 * Tapping opens a small popover with sort options and direction toggle.
 */

import React from 'https://esm.sh/react@18.2.0';
import Icon from './Icon.js';
import { IconButton } from './FormControls.js';

const { createElement: h, useState, useRef, useEffect } = React;

/**
 * MobileSortButton component
 * @param {Array} columns - Column definitions (with sortable, mobileSortOptions)
 * @param {string} sortBy - Current sort column key
 * @param {string} sortDirection - Current sort direction ('asc'/'desc')
 * @param {function} onSortChange - Sort change handler (sortBy, sortDirection)
 * @param {string} defaultSortBy - Default sort column key (to detect custom sort)
 * @param {string} defaultSortDirection - Default sort direction (to detect custom sort)
 */
const MobileSortButton = ({ columns, sortBy, sortDirection, onSortChange, defaultSortBy, defaultSortDirection }) => {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef(null);
  const buttonRef = useRef(null);

  // Check if sort has been customized from defaults
  const isCustomSort = defaultSortBy && defaultSortDirection
    ? (sortBy !== defaultSortBy || sortDirection !== defaultSortDirection)
    : false;

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target) &&
        buttonRef.current && !buttonRef.current.contains(e.target)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  // Extract sortable options from columns
  const sortableColumns = columns.flatMap(col => {
    if (col.mobileSortOptions) return col.mobileSortOptions.map(opt => ({ ...opt, sortable: true }));
    if (col.sortable) return [col];
    return [];
  });

  // Find current sort label
  const currentSortCol = sortableColumns.find(c => c.key === sortBy);
  const currentLabel = currentSortCol ? currentSortCol.label : sortBy;

  // Button styling based on state
  const getButtonClass = () => {
    if (isOpen) {
      return 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400';
    }
    if (isCustomSort) {
      return 'bg-purple-600 text-white';
    }
    return 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600';
  };

  return h('div', { className: 'relative' },
    h('button', {
      ref: buttonRef,
      onClick: () => setIsOpen(!isOpen),
      className: `h-9 sm:h-10 flex items-center gap-1 px-2.5 rounded-lg text-sm font-medium transition-all ${getButtonClass()}`,
      title: 'Sort options'
    },
      h(Icon, { name: sortDirection === 'asc' ? 'arrowUp' : 'arrowDown', size: 16 }),
      currentLabel
    ),

    // Popover
    isOpen && h('div', {
      ref: popoverRef,
      className: 'absolute right-0 top-full mt-1 z-50 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-2 min-w-[180px] animate-fadeIn'
    },
      // Direction toggle
      h('div', { className: 'flex items-center justify-between px-2 py-1 mb-1 border-b border-gray-200 dark:border-gray-700' },
        h('span', { className: 'text-xs text-gray-500 dark:text-gray-400' }, 'Direction'),
        h(IconButton, {
          variant: 'secondary',
          icon: sortDirection === 'asc' ? 'arrowUp' : 'arrowDown',
          iconSize: 14,
          onClick: () => onSortChange(sortBy, sortDirection === 'asc' ? 'desc' : 'asc'),
          title: sortDirection === 'asc' ? 'Ascending' : 'Descending',
          className: 'w-7 h-7'
        })
      ),
      // Sort options
      ...sortableColumns.map(col =>
        h('button', {
          key: col.key,
          onClick: () => { onSortChange(col.key, sortDirection); setIsOpen(false); },
          className: `w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
            sortBy === col.key
              ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 font-medium'
              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`
        }, col.label)
      ),
      // Reset to default option (only shown when sort is customized)
      isCustomSort && h('button', {
        key: 'reset',
        onClick: () => { onSortChange(defaultSortBy, defaultSortDirection); setIsOpen(false); },
        className: 'w-full text-left px-2 py-1.5 mt-1 rounded text-xs transition-colors border-t border-gray-200 dark:border-gray-700 pt-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-1'
      },
        h(Icon, { name: 'refresh', size: 12 }),
        'Reset to default'
      )
    )
  );
};

export default MobileSortButton;
