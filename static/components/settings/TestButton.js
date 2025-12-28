/**
 * TestButton Component
 *
 * Button for testing configuration with loading state
 */

import React from 'https://esm.sh/react@18.2.0';
import { LoadingSpinner } from '../common/index.js';

const { createElement: h } = React;

/**
 * TestButton component
 * @param {function} onClick - Click handler
 * @param {boolean} loading - Loading state
 * @param {boolean} disabled - Disabled state
 * @param {string} children - Button text
 */
const TestButton = ({ onClick, loading = false, disabled = false, children = 'Test' }) => {
  return h('button', {
    type: 'button',
    onClick,
    disabled: disabled || loading,
    className: `px-3 py-1.5 text-sm font-medium rounded-lg
      ${disabled || loading
        ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
        : 'bg-blue-600 hover:bg-blue-700 text-white'}
      transition-colors inline-flex items-center gap-2`
  },
    loading && h(LoadingSpinner, { size: 16 }),
    children
  );
};

export default TestButton;
