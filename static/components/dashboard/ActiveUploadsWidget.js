/**
 * ActiveUploadsWidget Component
 *
 * Displays active uploads with filename and speed
 */

import React from 'https://esm.sh/react@18.2.0';
import { formatSpeed } from '../../utils/formatters.js';

const { createElement: h, useMemo } = React;

/**
 * ActiveUploadsWidget component
 * @param {array} uploads - Array of upload items
 * @param {number} maxItems - Maximum number of items to display
 */
const ActiveUploadsWidget = ({ uploads = [], maxItems = 10 }) => {
  // Filter and sort active uploads
  const activeUploads = useMemo(() => {
    return uploads
      .filter(u => u.EC_TAG_CLIENT_UP_SPEED > 0)
      .sort((a, b) => b.EC_TAG_CLIENT_UP_SPEED - a.EC_TAG_CLIENT_UP_SPEED)
      .slice(0, maxItems);
  }, [uploads, maxItems]);

  return h('div', {
    className: 'bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700 flex flex-col',
    style: { height: '300px' }
  },
    h('h3', {
      className: 'text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300'
    }, 'Active Uploads'),
    h('div', {
      className: 'flex-1 overflow-y-auto space-y-2'
    },
      activeUploads.length === 0
        ? h('p', {
            className: 'text-sm text-gray-500 dark:text-gray-400 text-center py-4'
          }, 'No active uploads')
        : activeUploads.map((upload, idx) => {
            return h('div', {
              key: upload.EC_TAG_CLIENT_HASH || idx,
              className: 'p-2 rounded bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 flex items-center justify-between gap-2'
            },
              // Filename (truncated)
              h('div', {
                className: 'text-xs font-medium text-gray-800 dark:text-gray-200 truncate flex-1',
                title: upload.EC_TAG_PARTFILE_NAME
              }, upload.EC_TAG_PARTFILE_NAME),

              // Speed
              h('div', {
                className: 'text-xs text-green-600 dark:text-green-400 font-mono whitespace-nowrap'
              }, formatSpeed(upload.EC_TAG_CLIENT_UP_SPEED))
            );
          })
    )
  );
};

export default ActiveUploadsWidget;
