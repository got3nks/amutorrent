/**
 * StatisticsView Component
 *
 * Displays historical statistics with charts and statistics tree
 */

import React from 'https://esm.sh/react@18.2.0';
import { StatsTree, SpeedChart, TransferChart } from '../common/index.js';
import { formatBytes, formatSpeed } from '../../utils/index.js';

const { createElement: h } = React;

/**
 * Statistics view component
 * @param {boolean} loading - Loading state
 * @param {boolean} loadingHistory - Loading history state
 * @param {string} historicalRange - Current historical range (24h/7d/30d)
 * @param {function} onFetchHistoricalData - Fetch historical data handler (range)
 * @param {object} historicalStats - Historical statistics summary
 * @param {object} historicalData - Historical data for charts
 * @param {object} speedData - Speed history data
 * @param {object} statsTree - Statistics tree data
 * @param {string} theme - Current theme (dark/light)
 */
const StatisticsView = ({
  loading,
  loadingHistory,
  historicalRange,
  onFetchHistoricalData,
  historicalStats,
  historicalData,
  speedData,
  statsTree,
  theme
}) => {
  return h('div', { className: 'space-y-3 sm:space-y-4' },
    // Historical Statistics Header
    h('div', { className: 'flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3' },
      h('h2', { className: 'text-base sm:text-lg font-bold text-gray-800 dark:text-gray-100' }, 'Historical Statistics'),
      h('div', { className: 'flex gap-2' },
        ['24h', '7d', '30d'].map(range =>
          h('button', {
            key: range,
            onClick: () => onFetchHistoricalData(range, false),
            disabled: loadingHistory,
            className: `px-3 py-1.5 rounded transition-all text-sm ${
              historicalRange === range
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
            } disabled:opacity-50`
          }, range.toUpperCase())
        )
      )
    ),

    // Summary Statistics Cards - Upload stats first, then Download stats
    historicalStats && h('div', { className: 'grid grid-cols-2 sm:grid-cols-3 gap-3' },
      // Upload Statistics
      h('div', { className: 'bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700' },
        h('div', { className: 'text-xs text-gray-500 dark:text-gray-400' }, 'Total Uploaded'),
        h('div', { className: 'text-lg font-bold text-green-600 dark:text-green-400' },
          formatBytes(historicalStats.totalUploaded)
        )
      ),
      h('div', { className: 'bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700' },
        h('div', { className: 'text-xs text-gray-500 dark:text-gray-400' }, 'Avg Upload Speed'),
        h('div', { className: 'text-lg font-bold text-green-600 dark:text-green-400' },
          formatSpeed(historicalStats.avgUploadSpeed)
        )
      ),
      h('div', { className: 'hidden sm:block bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700' },
        h('div', { className: 'text-xs text-gray-500 dark:text-gray-400' }, 'Peak Upload Speed'),
        h('div', { className: 'text-lg font-bold text-green-600 dark:text-green-400' },
          formatSpeed(historicalStats.peakUploadSpeed)
        )
      ),
      // Download Statistics
      h('div', { className: 'bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700' },
        h('div', { className: 'text-xs text-gray-500 dark:text-gray-400' }, 'Total Downloaded'),
        h('div', { className: 'text-lg font-bold text-blue-600 dark:text-blue-400' },
          formatBytes(historicalStats.totalDownloaded)
        )
      ),
      h('div', { className: 'bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700' },
        h('div', { className: 'text-xs text-gray-500 dark:text-gray-400' }, 'Avg Download Speed'),
        h('div', { className: 'text-lg font-bold text-blue-600 dark:text-blue-400' },
          formatSpeed(historicalStats.avgDownloadSpeed)
        )
      ),
      h('div', { className: 'hidden sm:block bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700' },
        h('div', { className: 'text-xs text-gray-500 dark:text-gray-400' }, 'Peak Download Speed'),
        h('div', { className: 'text-lg font-bold text-blue-600 dark:text-blue-400' },
          formatSpeed(historicalStats.peakDownloadSpeed)
        )
      )
    ),

    // Speed Chart
    !loadingHistory && h('div', { className: 'bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700' },
      h('h3', { className: 'text-sm font-semibold mb-3 text-gray-700 dark:text-gray-300' }, 'Speed Over Time'),
      h('div', { className: 'w-full', style: { height: '300px' } },
        h(SpeedChart, { speedData, theme, historicalRange })
      )
    ),

    // Data Transferred Chart
    !loadingHistory && h('div', { className: 'bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700' },
      h('h3', { className: 'text-sm font-semibold mb-3 text-gray-700 dark:text-gray-300' }, 'Data Transferred Over Time'),
      h('div', { className: 'w-full', style: { height: '300px' } },
        h(TransferChart, { historicalData, theme, historicalRange })
      )
    ),

    // Loading state
    loadingHistory && h('div', { className: 'flex flex-col items-center justify-center py-6' },
      h('div', { className: 'loader' }),
      h('p', { className: 'text-sm text-gray-500 dark:text-gray-400 mt-2' }, 'Loading historical data...')
    ),

    // Statistics Tree (original content) - auto-refreshes every 5 seconds
    h(StatsTree, { statsTree, loading })
  );
};

export default StatisticsView;
