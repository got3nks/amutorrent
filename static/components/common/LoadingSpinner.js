/**
 * LoadingSpinner Component
 *
 * Reusable loading indicator
 */

import React from 'https://esm.sh/react@18.2.0';

const { createElement: h } = React;

/**
 * Loading spinner component
 * @param {string} size - Size: 'sm', 'md', 'lg' (default: 'md')
 * @param {string} text - Optional loading text
 */
const LoadingSpinner = ({ size = 'md', text = '' }) => {
  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-3',
    lg: 'w-12 h-12 border-4'
  };

  const spinnerClass = sizeClasses[size] || sizeClasses.md;

  return h('div', { className: 'flex flex-col items-center justify-center gap-2' },
    h('div', {
      className: `${spinnerClass} border-blue-600 border-t-transparent rounded-full animate-spin`
    }),
    text && h('p', { className: 'text-sm text-gray-600 dark:text-gray-400' }, text)
  );
};

export default LoadingSpinner;
