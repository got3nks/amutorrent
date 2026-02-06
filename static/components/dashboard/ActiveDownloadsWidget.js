/**
 * ActiveDownloadsWidget Component
 *
 * Displays active downloads with progress bars and category colors
 * Memoized to prevent unnecessary re-renders
 */

import React from 'https://esm.sh/react@18.2.0';
import { getCategoryColorStyle, getProgressColor } from '../../utils/colors.js';
import { formatSpeed } from '../../utils/formatters.js';
import { PROGRESS_STRIPES_STYLE } from '../../utils/constants.js';
import { useTheme } from '../../contexts/ThemeContext.js';
import { useStaticData } from '../../contexts/StaticDataContext.js';
import { useClientFilter } from '../../contexts/ClientFilterContext.js';
import ClientIcon from '../common/ClientIcon.js';

const { createElement: h, useMemo } = React;

/**
 * ActiveDownloadsWidget component
 * @param {array} downloads - Array of download items
 * @param {number} maxItems - Maximum number of items to display
 * @param {boolean} compact - Use compact height for mobile (default: false)
 * @param {boolean} loading - Show loading placeholder (default: false)
 */
const ActiveDownloadsWidget = ({ downloads = [], maxItems = 10, compact = false, loading = false }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { dataCategories: categories } = useStaticData();
  const { filterByEnabledClients } = useClientFilter();

  // Filter by client type, then filter and sort active downloads
  const activeDownloads = useMemo(() => {
    return filterByEnabledClients(downloads)
      .filter(d => (d.downloadSpeed || 0) > 0)
      .sort((a, b) => (b.downloadSpeed || 0) - (a.downloadSpeed || 0))
      .slice(0, maxItems);
  }, [downloads, maxItems, filterByEnabledClients]);

  // Determine if empty (for compact mode height adjustment)
  const isEmpty = !loading && activeDownloads.length === 0;

  return h('div', {
    className: compact
      ? 'flex flex-col'
      : 'bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700 flex flex-col',
    style: { height: compact ? (isEmpty ? 'auto' : '140px') : '300px' }
  },
    h('h3', {
      className: `font-semibold text-gray-700 dark:text-gray-300 ${compact ? 'text-xs mb-1' : 'text-sm mb-2'}`
    }, 'Active Downloads'),
    h('div', {
      className: 'flex-1 overflow-y-auto space-y-2'
    },
      loading
        ? h('div', { className: 'flex items-center justify-center h-full' },
            h('div', { className: 'loader' })
          )
        : activeDownloads.length === 0
        ? h('p', {
            className: `text-gray-500 dark:text-gray-400 text-center ${compact ? 'text-xs py-1' : 'text-sm py-4'}`
          }, 'No active downloads')
        : activeDownloads.map((download, idx) => {
            // Find category by name and get color style (unified category system)
            const categoryName = download.category;
            const category = categories.find(cat => cat.name === categoryName || cat.title === categoryName);
            const isDefault = !categoryName || categoryName === 'Default';
            const categoryStyle = getCategoryColorStyle(category, isDefault);

            // Ensure progress is a number
            const progress = Number(download.progress) || 0;

            // Count active peers/sources we're downloading from
            // rtorrent: count peers with active download rate
            // amule: use sources.connected (sourceCountXfer)
            const activePeerCount = download.client === 'rtorrent'
              ? (download.peersDetailed || []).filter(p => p.downloadRate > 0).length
              : (download.sources?.connected || 0);

            // Compact mode: simplified view (filename + speed only, like ActiveUploadsWidget)
            if (compact) {
              return h('div', {
                key: download.hash || idx,
                className: 'p-2 rounded bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 flex items-center justify-between gap-2',
                style: categoryStyle || {}
              },
                // Client type badge + Filename (truncated)
                h('div', {
                  className: 'flex items-center gap-1.5 flex-1 min-w-0'
                },
                  h(ClientIcon, { clientType: download.client, size: 14 }),
                  h('span', {
                    className: 'text-xs font-medium text-gray-800 dark:text-gray-200 truncate',
                    title: download.name
                  }, download.name)
                ),

                // Speed with peer count for rtorrent
                h('div', {
                  className: 'text-xs text-blue-600 dark:text-blue-400 font-mono whitespace-nowrap'
                },
                  formatSpeed(download.downloadSpeed || 0),
                  activePeerCount > 1 && h('span', {
                    className: 'ml-1 text-gray-500 dark:text-gray-400'
                  }, `(${activePeerCount})`)
                )
              );
            }

            // Desktop mode: full view with progress bar
            return h('div', {
              key: download.hash || idx,
              className: 'p-2 rounded bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600',
              style: categoryStyle || {}
            },
              // Client type badge + Filename + Speed (all on one line)
              h('div', {
                className: 'flex items-center gap-1.5 mb-1'
              },
                h(ClientIcon, { clientType: download.client, size: 14 }),
                h('span', {
                  className: 'text-xs font-medium text-gray-800 dark:text-gray-200 truncate flex-1',
                  title: download.name
                }, download.name),
                h('span', {
                  className: 'text-xs text-blue-600 dark:text-blue-400 font-mono whitespace-nowrap'
                },
                  formatSpeed(download.downloadSpeed || 0),
                  activePeerCount > 1 && h('span', {
                    className: 'ml-1 text-gray-500 dark:text-gray-400'
                  }, `(${activePeerCount})`)
                )
              ),

              // Progress bar
              h('div', {
                className: 'w-full bg-gray-200 dark:bg-gray-600 rounded-full h-3 relative overflow-hidden'
              },
                h('div', {
                  className: `h-full rounded-l-full ${getProgressColor(progress)} relative overflow-hidden`,
                  style: { width: `${progress}%` }
                },
                  // Animated stripes overlay
                  h('div', {
                    className: 'absolute inset-0',
                    style: PROGRESS_STRIPES_STYLE
                  })
                ),
                h('span', {
                  className: 'absolute inset-0 flex items-center justify-center text-[10px] font-bold text-gray-900 dark:text-white',
                  style: {
                    WebkitTextStroke: isDark ? '0.5px black' : '0.5px white',
                    textShadow: isDark ? '0 0 1px black, 0 0 1px black' : '0 0 1px white, 0 0 1px white',
                    paintOrder: 'stroke fill'
                  }
                }, `${progress.toFixed(2)}%`)
              )
            );
          })
    )
  );
};

// Memoize to prevent unnecessary re-renders
export default React.memo(ActiveDownloadsWidget);
