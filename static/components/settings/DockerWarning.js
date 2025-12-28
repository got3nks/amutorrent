/**
 * DockerWarning Component
 *
 * Displays a warning banner for Docker users
 */

import React from 'https://esm.sh/react@18.2.0';

const { createElement: h } = React;

/**
 * DockerWarning component
 * @param {string} message - Warning message
 */
const DockerWarning = ({ message }) => {
  return h('div', {
    className: 'bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 p-4 mb-4'
  },
    h('div', { className: 'flex' },
      h('div', { className: 'flex-shrink-0' },
        h('svg', {
          className: 'h-5 w-5 text-yellow-400',
          viewBox: '0 0 20 20',
          fill: 'currentColor'
        },
          h('path', {
            fillRule: 'evenodd',
            d: 'M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z',
            clipRule: 'evenodd'
          })
        )
      ),
      h('div', { className: 'ml-3' },
        h('p', { className: 'text-sm text-yellow-700 dark:text-yellow-300' }, message)
      )
    )
  );
};

export default DockerWarning;
