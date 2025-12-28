/**
 * TestResultIndicator Component
 *
 * Shows test result with success/failure state and details
 */

import React from 'https://esm.sh/react@18.2.0';
import { Icon } from '../common/index.js';

const { createElement: h } = React;

/**
 * TestResultIndicator component
 * @param {object} result - Test result object
 * @param {string} label - Label for the test
 */
const TestResultIndicator = ({ result, label }) => {
  if (!result) return null;

  // Determine if this is a success
  // Priority: if success is explicitly false, it's not a success
  // Otherwise check for connected/reachable flags
  const isSuccess = result.success === false
    ? false
    : (result.success || result.connected || (result.reachable && result.authenticated));

  const hasWarning = result.warning && !result.error;

  // Determine styling based on state
  let bgColor, borderColor, iconName, iconColor, textColor, detailColor;

  if (isSuccess && !hasWarning) {
    // Success - green
    bgColor = 'bg-green-50 dark:bg-green-900/20';
    borderColor = 'border-green-200 dark:border-green-800';
    iconName = 'check';
    iconColor = 'text-green-600 dark:text-green-400';
    textColor = 'text-green-800 dark:text-green-300';
    detailColor = 'text-green-700 dark:text-green-400';
  } else if (isSuccess && hasWarning) {
    // Warning - yellow/orange (success but with warning)
    bgColor = 'bg-yellow-50 dark:bg-yellow-900/20';
    borderColor = 'border-yellow-200 dark:border-yellow-800';
    iconName = 'alertTriangle';
    iconColor = 'text-yellow-600 dark:text-yellow-400';
    textColor = 'text-yellow-800 dark:text-yellow-300';
    detailColor = 'text-yellow-700 dark:text-yellow-400';
  } else {
    // Error - red
    bgColor = 'bg-red-50 dark:bg-red-900/20';
    borderColor = 'border-red-200 dark:border-red-800';
    iconName = 'x';
    iconColor = 'text-red-600 dark:text-red-400';
    textColor = 'text-red-800 dark:text-red-300';
    detailColor = 'text-red-700 dark:text-red-400';
  }

  return h('div', {
    className: `mt-2 p-3 rounded-lg border ${bgColor} ${borderColor}`
  },
    h('div', { className: 'flex items-start gap-2' },
      h(Icon, {
        name: iconName,
        size: 20,
        className: iconColor
      }),
      h('div', { className: 'flex-1' },
        h('p', { className: `font-medium ${textColor}` }, label),
        result.version && h('p', {
          className: `text-sm ${detailColor} mt-1`
        }, `Version: ${result.version}`),
        result.message && h('p', {
          className: `text-sm ${detailColor} mt-1`
        }, result.message),
        result.warning && h('p', {
          className: `text-sm ${detailColor} mt-1`
        }, result.warning),
        result.error && h('p', {
          className: `text-sm text-red-700 dark:text-red-400 mt-1`
        }, result.error),
        // Directory-specific results
        result.readable !== undefined && h('p', {
          className: 'text-sm text-gray-600 dark:text-gray-400 mt-1'
        }, `Readable: ${result.readable ? '✓' : '✗'}, Writable: ${result.writable ? '✓' : '✗'}`)
      )
    )
  );
};

export default TestResultIndicator;
