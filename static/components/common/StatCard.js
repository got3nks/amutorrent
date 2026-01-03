/**
 * StatCard Component
 *
 * Displays a metric card with icon, label, and value
 */

import React from 'https://esm.sh/react@18.2.0';
import { Icon } from './index.js';

const { createElement: h } = React;

/**
 * StatCard component
 * @param {string} label - Metric label
 * @param {string} value - Formatted metric value
 * @param {string} icon - Icon name
 * @param {string} iconColor - Tailwind CSS class for icon color
 */
const StatCard = ({ label, value, icon, iconColor }) => {
  return h('div', {
    className: 'bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700'
  },
    h('div', { className: 'flex items-center gap-2 mb-1' },
      h(Icon, { name: icon, size: 16, className: iconColor }),
      h('div', { className: 'text-xs text-gray-500 dark:text-gray-400' }, label)
    ),
    h('div', { className: 'text-lg font-bold text-gray-800 dark:text-gray-100' }, value)
  );
};

export default StatCard;
