/**
 * TrackerLabel Component
 *
 * Pill-styled label for displaying tracker domain.
 * Provides consistent styling across all views (mobile and desktop).
 */

import React from 'https://esm.sh/react@18.2.0';

const { createElement: h } = React;

/**
 * TrackerLabel component
 * @param {string} tracker - Tracker domain to display
 * @param {number} maxWidth - Max width in pixels (default 120)
 * @param {string} className - Additional classes to apply (e.g., 'float-right ml-2')
 */
const TrackerLabel = ({ tracker, maxWidth = 120, className = '' }) => {
  if (!tracker) return null;

  return h('span', {
    className: `px-1.5 py-px rounded-full text-xs font-medium bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 truncate${className ? ` ${className}` : ''}`,
    style: { maxWidth: `${maxWidth}px` },
    title: tracker
  }, tracker);
};

export default TrackerLabel;
