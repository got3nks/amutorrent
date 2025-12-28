/**
 * Footer Component
 *
 * Displays connection status, upload/download speeds, and network statistics
 */

import React from 'https://esm.sh/react@18.2.0';
import { formatSpeed } from '../../utils/index.js';

const { createElement: h } = React;

/**
 * Footer component
 * @param {object} stats - Statistics data
 * @param {string} currentView - Current view name
 */
const Footer = ({ stats, currentView }) => {
  if (!stats) {
    return h('footer', { className: 'bg-gray-800 text-white py-4 text-center text-sm' },
      'Loading stats...'
    );
  }

  // Hide footer on mobile when on home page (sm:hidden)
  if (currentView === 'home' && typeof window !== 'undefined' && window.innerWidth < 640) {
    return null;
  }

  const connState = stats.EC_TAG_CONNSTATE || {};
  const server = connState.EC_TAG_SERVER || {};

  const ed2kConnected = server?.EC_TAG_SERVER_PING > 0;
  const clientId = connState.EC_TAG_CLIENT_ID;
  const isHighId = clientId && clientId > 16777216;

  const kadFirewalled = stats.EC_TAG_STATS_KAD_FIREWALLED_UDP === 1;
  const kadConnected = stats.EC_TAG_STATS_KAD_FIREWALLED_UDP !== undefined && stats.EC_TAG_STATS_KAD_FIREWALLED_UDP !== null;

  const uploadSpeed = formatSpeed(stats.EC_TAG_STATS_UL_SPEED || 0);
  const downloadSpeed = formatSpeed(stats.EC_TAG_STATS_DL_SPEED || 0);

  return h('footer', {
    className: 'bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 py-1.5 px-2 sm:px-3 flex-none md:sticky md:bottom-0 z-40'
  },
    h('div', { className: 'mx-auto' },

      // Mobile view
      h('div', { className: 'md:hidden flex flex-col gap-1.5 text-xs' },

        h('div', { className: 'flex justify-between items-center' },
          h('div', { className: 'flex items-center gap-2' },
            h('span', { className: 'w-20 flex-shrink-0 font-semibold text-gray-700 dark:text-gray-300' }, 'ED2K:'),
            h('span', {
              className: `w-28 text-center px-2 py-0.5 rounded text-xs font-medium ${
                ed2kConnected
                  ? (isHighId ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200')
                  : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
              }`
            }, ed2kConnected ? (isHighId ? '✓ High ID' : '⚠ Low ID') : '✗ Disconnected')
          ),
          h('div', { className: 'flex items-center gap-2' },
            h('span', { className: 'w-20 flex-shrink-0 font-semibold text-gray-700 dark:text-gray-300' }, 'Upload ↑'),
            h('span', { className: 'w-24 text-right text-green-400 font-mono' }, uploadSpeed)
          )
        ),
        h('div', { className: 'flex justify-between items-center' },
          h('div', { className: 'flex items-center gap-2' },
            h('span', { className: 'w-20 flex-shrink-0 font-semibold text-gray-700 dark:text-gray-300' }, 'KAD:'),
            h('span', {
              className: `w-28 text-center px-2 py-0.5 rounded text-xs font-medium ${
                kadConnected
                  ? (!kadFirewalled ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200')
                  : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
              }`
            }, kadConnected ? (!kadFirewalled ? '✓ OK' : '⚠ Firewalled') : '✗ Disconnected')
          ),
          h('div', { className: 'flex items-center gap-2' },
            h('span', { className: 'w-20 flex-shrink-0 font-semibold text-gray-700 dark:text-gray-300' }, 'Download ↓'),
            h('span', { className: 'w-24 text-right text-blue-400 font-mono' }, downloadSpeed)
          )
        )
      ),

      // Desktop view
      h('div', { className: 'hidden md:flex justify-between items-center text-xs' },
        h('div', { className: 'flex items-center gap-3' },
          h('div', { className: 'flex items-center gap-2' },
            h('span', { className: 'font-semibold text-gray-700 dark:text-gray-300' }, 'ED2K:'),
            h('span', { className: `px-2 py-1 rounded text-xs font-medium ${
              ed2kConnected
                ? (isHighId ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200')
                : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'}`
              },
              ed2kConnected ? (isHighId ? '✓ High ID' : '⚠ Low ID') : '✗ Disconnected'
            ),
            ed2kConnected && server.EC_TAG_SERVER_NAME && h('span', { className: 'text-gray-600 dark:text-gray-400 text-xs' }, `(${server.EC_TAG_SERVER_NAME} - ${server.EC_TAG_SERVER_PING}ms)`)
          ),
          h('div', { className: 'flex items-center gap-2' },
            h('span', { className: 'font-semibold text-gray-700 dark:text-gray-300' }, 'KAD:'),
            h('span', { className: `px-2 py-1 rounded text-xs font-medium ${
              kadConnected
                ? (!kadFirewalled ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200')
                : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'}`
              },
              kadConnected ? (!kadFirewalled ? '✓ OK' : '⚠ Firewalled') : '✗ Disconnected'
            ),
          )
        ),
        h('div', { className: 'flex items-center gap-3' },
          h('div', { className: 'flex items-center gap-2' },
            h('span', { className: 'font-semibold text-gray-700 dark:text-gray-300' }, 'Upload ↑'),
            h('span', { className: 'text-green-600 dark:text-green-400 font-mono font-semibold' }, uploadSpeed)
          ),
          h('div', { className: 'flex items-center gap-2' },
            h('span', { className: 'font-semibold text-gray-700 dark:text-gray-300' }, 'Download ↓'),
            h('span', { className: 'text-blue-600 dark:text-blue-400 font-mono font-semibold' }, downloadSpeed)
          )
        )
      )
    )
  );
};

export default Footer;
