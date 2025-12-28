/**
 * LogsView Component
 *
 * Displays application logs and server information
 */

import React from 'https://esm.sh/react@18.2.0';
import { Icon } from '../common/index.js';

const { createElement: h } = React;

/**
 * Logs view component
 * @param {string} logs - Application logs text
 * @param {string} serverInfo - Server information text
 * @param {object} logsRef - Ref for logs container
 * @param {object} serverInfoRef - Ref for server info container
 * @param {boolean} loading - Loading state
 * @param {function} onRefresh - Refresh handler
 */
const LogsView = ({ logs, serverInfo, logsRef, serverInfoRef, loading, onRefresh }) => {
  return h('div', { className: 'space-y-3 sm:space-y-4' },
    h('div', { className: 'flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3' },
      h('h2', { className: 'text-base sm:text-lg font-bold text-gray-800 dark:text-gray-100' }, 'Logs & Server Info'),
      h('button', {
        onClick: onRefresh,
        disabled: loading,
        className: 'hidden sm:block px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-all active:scale-95 text-sm sm:text-base w-full sm:w-auto'
      },
        loading ? h('span', { className: 'flex items-center justify-center gap-2' },
          h('div', { className: 'loader' }),
          'Loading...'
        ) : h('span', null,
          h(Icon, { name: 'refresh', size: 16, className: 'inline mr-1' }),
          'Refresh'
        )
      )
    ),

    // Server Info Section
    h('div', { className: 'bg-gray-50 dark:bg-gray-700 rounded-lg p-3' },
      h('h3', { className: 'text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2' }, 'Server Information'),
      h('div', {
        ref: serverInfoRef,
        className: 'bg-white dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600 p-3 max-h-48 overflow-y-auto',
        style: { fontFamily: 'monospace', fontSize: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }
      },
        serverInfo || h('span', { className: 'text-gray-400 dark:text-gray-500 italic' }, 'No server info available')
      )
    ),

    // Logs Section
    h('div', { className: 'bg-gray-50 dark:bg-gray-700 rounded-lg p-3' },
      h('h3', { className: 'text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2' }, 'Application Logs'),
      h('div', {
        ref: logsRef,
        className: 'bg-white dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600 p-3 max-h-96 overflow-y-auto',
        style: { fontFamily: 'monospace', fontSize: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }
      },
        logs || h('span', { className: 'text-gray-400 dark:text-gray-500 italic' }, 'No logs available')
      )
    )
  );
};

export default LogsView;
