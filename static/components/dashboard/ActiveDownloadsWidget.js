/**
 * ActiveDownloadsWidget Component
 *
 * Displays active downloads with progress bars and category colors
 */

import React from 'https://esm.sh/react@18.2.0';
import { getCategoryColorStyle, getProgressColor } from '../../utils/colors.js';
import { formatSpeed } from '../../utils/formatters.js';

const { createElement: h, useMemo } = React;

/**
 * ActiveDownloadsWidget component
 * @param {array} downloads - Array of download items
 * @param {array} categories - Array of categories
 * @param {number} maxItems - Maximum number of items to display
 */
const ActiveDownloadsWidget = ({ downloads = [], categories = [], maxItems = 10 }) => {
  // Filter and sort active downloads
  const activeDownloads = useMemo(() => {
    return downloads
      .filter(d => (d.speed || 0) > 0)
      .sort((a, b) => (b.speed || 0) - (a.speed || 0))
      .slice(0, maxItems);
  }, [downloads, maxItems]);

  return h('div', {
    className: 'bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700 flex flex-col',
    style: { height: '300px' }
  },
    h('h3', {
      className: 'text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300'
    }, 'Active Downloads'),
    h('div', {
      className: 'flex-1 overflow-y-auto space-y-2'
    },
      activeDownloads.length === 0
        ? h('p', {
            className: 'text-sm text-gray-500 dark:text-gray-400 text-center py-4'
          }, 'No active downloads')
        : activeDownloads.map((download, idx) => {
            // Find category and get color style
            const category = categories.find(cat => cat.id === download.category);
            const categoryStyle = getCategoryColorStyle(category, download.category === 0);

            // Ensure progress is a number
            const progress = Number(download.progress) || 0;

            return h('div', {
              key: download.fileHash || idx,
              className: 'p-2 rounded bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600',
              style: categoryStyle || {}
            },
              // Filename (truncated)
              h('div', {
                className: 'text-xs font-medium text-gray-800 dark:text-gray-200 truncate mb-1',
                title: download.fileName
              }, download.fileName),

              // Progress bar
              h('div', {
                className: 'w-full bg-gray-200 dark:bg-gray-600 rounded-full h-3 mb-1 relative'
              },
                h('div', {
                  className: `h-full rounded-full ${getProgressColor(progress)}`,
                  style: { width: `${progress}%` }
                }),
                h('span', {
                  className: 'absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white',
                  style: {
                    WebkitTextStroke: '0.5px black',
                    paintOrder: 'stroke fill'
                  }
                }, `${progress.toFixed(2)}%`)
              ),

              // Speed
              h('div', {
                className: 'text-xs text-blue-600 dark:text-blue-400 font-mono'
              }, formatSpeed(download.speed || 0))
            );
          })
    )
  );
};

export default ActiveDownloadsWidget;
