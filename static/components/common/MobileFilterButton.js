/**
 * MobileFilterButton Component
 *
 * Rounded pill-style filter button for mobile views.
 * Matches the style of MobileStatusTabs buttons.
 * Shows active state with count when filters are applied.
 */

import React from 'https://esm.sh/react@18.2.0';
import Icon from './Icon.js';

const { createElement: h } = React;

/**
 * MobileFilterButton component
 * @param {function} onClick - Click handler to open filter sheet
 * @param {number} activeCount - Number of active filters (0 = inactive state)
 * @param {string} label - Button label (default: 'Filters')
 */
const MobileFilterButton = ({ onClick, activeCount = 0, label = 'Filters' }) => {
  const isActive = activeCount > 0;

  return h('button', {
    onClick,
    className: `px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1 ${
      isActive
        ? 'bg-purple-600 text-white'
        : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
    }`
  },
    h(Icon, { name: 'funnel', size: 12 }),
    isActive ? `${label} (${activeCount})` : label
  );
};

export default MobileFilterButton;
