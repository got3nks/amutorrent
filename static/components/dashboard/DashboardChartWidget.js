/**
 * DashboardChartWidget Component
 *
 * Wrapper for minimized charts with consistent styling
 */

import React from 'https://esm.sh/react@18.2.0';

const { createElement: h } = React;

/**
 * DashboardChartWidget component
 * @param {string} title - Widget title
 * @param {ReactNode} children - Chart component
 * @param {string} height - Chart height (default: '200px')
 */
const DashboardChartWidget = ({ title, children, height = '200px' }) => {
  return h('div', {
    className: 'bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700'
  },
    h('h3', {
      className: 'text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300'
    }, title),
    h('div', { style: { height } }, children)
  );
};

export default DashboardChartWidget;
