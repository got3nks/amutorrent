/**
 * ExpandableSearch Component
 *
 * Search icon that expands to show input field on mobile.
 * When expanded, hides sibling elements passed via `hiddenBeforeSearch` and `hiddenWhenExpanded` props.
 * - hiddenBeforeSearch: rendered BEFORE the search button (to the left), e.g., sort button
 * - hiddenWhenExpanded: rendered AFTER the search button (to the right), e.g., action buttons
 */

import React from 'https://esm.sh/react@18.2.0';
import Icon from './Icon.js';
import { IconButton } from './FormControls.js';

const { createElement: h, useState, useRef, useEffect, Fragment } = React;

/**
 * ExpandableSearch component
 * @param {string} value - Current search value
 * @param {function} onChange - Value change handler
 * @param {function} onClear - Clear handler (optional)
 * @param {string} placeholder - Input placeholder
 * @param {ReactNode|ReactNode[]} hiddenWhenExpanded - Elements rendered AFTER search, hidden when expanded (e.g., buttons)
 * @param {ReactNode|ReactNode[]} hiddenBeforeSearch - Elements rendered BEFORE search, hidden when expanded (e.g., sort button)
 */
const ExpandableSearch = ({
  value,
  onChange,
  onClear,
  placeholder = 'Search...',
  hiddenWhenExpanded = null,
  hiddenBeforeSearch = null
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const inputRef = useRef(null);
  const containerRef = useRef(null);

  // Focus input when expanded
  useEffect(() => {
    if (isExpanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isExpanded]);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target)
      ) {
        setIsExpanded(false);
      }
    };

    if (isExpanded) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isExpanded]);

  // Collapse without clearing
  const handleCollapse = () => {
    setIsExpanded(false);
  };

  // Clear the filter value
  const handleClear = () => {
    onChange('');
    if (onClear) onClear();
  };

  // Check if filter is active (has value but not expanded)
  const hasActiveFilter = value && !isExpanded;

  return h(Fragment, null,
    // Render items BEFORE search (only when NOT expanded)
    !isExpanded && hiddenBeforeSearch,
    // Search input or button
    h('div', {
      ref: containerRef,
      className: isExpanded ? 'relative flex-[3] ml-2' : 'relative'
    },
      isExpanded
        ? h('div', { className: 'flex items-center gap-1' },
            h('div', { className: 'relative flex-1' },
              h(Icon, {
                name: 'search',
                size: 14,
                className: 'absolute left-2 top-1/2 -translate-y-1/2 text-gray-400'
              }),
              h('input', {
                ref: inputRef,
                type: 'text',
                value,
                onChange: (e) => onChange(e.target.value),
                placeholder,
                className: 'w-full pl-7 pr-2 py-1 text-base sm:text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent'
              })
            ),
            // Clear button (only when there's a value)
            value && h(IconButton, {
              variant: 'secondary',
              icon: 'x',
              iconSize: 16,
              onClick: handleClear,
              title: 'Clear filter',
              className: 'w-8 h-8 sm:w-9 sm:h-9'
            }),
            // Collapse/done button
            h(IconButton, {
              variant: 'secondary',
              icon: 'check',
              iconSize: 16,
              onClick: handleCollapse,
              title: 'Done',
              className: 'w-8 h-8 sm:w-9 sm:h-9'
            })
          )
        : h(IconButton, {
            variant: hasActiveFilter ? 'purple' : 'secondary',
            icon: 'textSearch',
            iconSize: 18,
            onClick: () => setIsExpanded(true),
            title: hasActiveFilter ? 'Edit filter' : 'Filter'
          })
    ),
    // Render items AFTER search (only when NOT expanded)
    !isExpanded && hiddenWhenExpanded
  );
};

export default ExpandableSearch;
