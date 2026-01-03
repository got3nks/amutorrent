/**
 * HomeView Component
 *
 * Main dashboard/home page with navigation and stats widgets
 */

import React from 'https://esm.sh/react@18.2.0';
import { Icon, StatCard, SpeedChart, TransferChart } from '../common/index.js';
import {
  DashboardChartWidget,
  ActiveDownloadsWidget,
  ActiveUploadsWidget,
  QuickSearchWidget
} from '../dashboard/index.js';
import { formatSpeed, formatBytes } from '../../utils/index.js';

const { createElement: h } = React;

/**
 * Home view component
 * @param {object} stats - Statistics data
 * @param {function} onNavigate - Navigation handler (receives view name)
 * @param {array} downloads - Downloads list
 * @param {array} uploads - Uploads list
 * @param {array} categories - Categories list
 * @param {object} dashboardState - Dashboard data state
 * @param {string} theme - Current theme
 * @param {string} searchQuery - Search query
 * @param {function} onSearchQueryChange - Search query change handler
 * @param {string} searchType - Search type
 * @param {function} onSearchTypeChange - Search type change handler
 * @param {boolean} searchLocked - Search locked state
 * @param {function} onSearch - Search submit handler
 */
const HomeView = ({
  stats,
  onNavigate,
  downloads = [],
  uploads = [],
  categories = [],
  dashboardState = {},
  theme = 'light',
  searchQuery = '',
  onSearchQueryChange = () => {},
  searchType = 'global',
  onSearchTypeChange = () => {},
  searchLocked = false,
  onSearch = () => {}
}) => {
  return h('div', { className: 'py-4 sm:py-8 px-2 sm:px-4' },
    // Desktop: Dashboard layout
    h('div', { className: 'hidden sm:block' },
      // Dashboard grid
      h('div', { className: 'grid grid-cols-1 lg:grid-cols-6 gap-4 max-w-7xl mx-auto' },
        // Quick Search Widget - Full width at top
        h('div', { className: 'lg:col-span-6' },
          h(QuickSearchWidget, {
            searchType,
            onSearchTypeChange,
            searchQuery,
            onSearchQueryChange,
            onSearch,
            searchLocked
          })
        ),

        // Speed Chart (half width)
        h('div', { className: 'lg:col-span-3' },
          h(DashboardChartWidget, {
            title: 'Speed (24h)',
            height: '200px'
          },
            dashboardState.speedData && h(SpeedChart, {
              speedData: dashboardState.speedData,
              theme,
              historicalRange: '24h'
            })
          )
        ),

        // Transfer Chart (half width)
        h('div', { className: 'lg:col-span-3' },
          h(DashboardChartWidget, {
            title: 'Data Transferred (24h)',
            height: '200px'
          },
            dashboardState.historicalData && h(TransferChart, {
              historicalData: dashboardState.historicalData,
              theme,
              historicalRange: '24h'
            })
          )
        ),

        // 24h Stats - Title (full width)
        dashboardState.historicalStats && h('h3', {
          className: 'lg:col-span-6 text-sm font-semibold text-gray-700 dark:text-gray-300'
        }, 'Last 24 Hours'),

        // 24h Stats - Cards (3 per row, each spans 2 columns in a 6-column grid)
        dashboardState.historicalStats && h('div', { className: 'lg:col-span-2' },
          h(StatCard, {
            label: 'Total Uploaded',
            value: formatBytes(dashboardState.historicalStats.totalUploaded),
            icon: 'upload',
            iconColor: 'text-green-600 dark:text-green-400'
          })
        ),
        dashboardState.historicalStats && h('div', { className: 'lg:col-span-2' },
          h(StatCard, {
            label: 'Avg Upload Speed',
            value: formatSpeed(dashboardState.historicalStats.avgUploadSpeed),
            icon: 'trendingUp',
            iconColor: 'text-green-600 dark:text-green-400'
          })
        ),
        dashboardState.historicalStats && h('div', { className: 'lg:col-span-2' },
          h(StatCard, {
            label: 'Peak Upload Speed',
            value: formatSpeed(dashboardState.historicalStats.peakUploadSpeed),
            icon: 'zap',
            iconColor: 'text-green-600 dark:text-green-400'
          })
        ),
        dashboardState.historicalStats && h('div', { className: 'lg:col-span-2' },
          h(StatCard, {
            label: 'Total Downloaded',
            value: formatBytes(dashboardState.historicalStats.totalDownloaded),
            icon: 'download',
            iconColor: 'text-blue-600 dark:text-blue-400'
          })
        ),
        dashboardState.historicalStats && h('div', { className: 'lg:col-span-2' },
          h(StatCard, {
            label: 'Avg Download Speed',
            value: formatSpeed(dashboardState.historicalStats.avgDownloadSpeed),
            icon: 'trendingUp',
            iconColor: 'text-blue-600 dark:text-blue-400'
          })
        ),
        dashboardState.historicalStats && h('div', { className: 'lg:col-span-2' },
          h(StatCard, {
            label: 'Peak Download Speed',
            value: formatSpeed(dashboardState.historicalStats.peakDownloadSpeed),
            icon: 'zap',
            iconColor: 'text-blue-600 dark:text-blue-400'
          })
        ),

        // Active Downloads Widget (half width)
        h('div', { className: 'lg:col-span-3' },
          h(ActiveDownloadsWidget, {
            downloads,
            categories,
            maxItems: 10
          })
        ),

        // Active Uploads Widget (half width)
        h('div', { className: 'lg:col-span-3' },
          h(ActiveUploadsWidget, {
            uploads,
            maxItems: 10
          })
        )
      )
    ),

    // Mobile: stats widgets + buttons (no Home button)
    h('div', { className: 'sm:hidden flex flex-col gap-3' },
      // Stats widgets - 2x2 grid
      stats ? h('div', { className: 'grid grid-cols-2 gap-3 mb-2' },
        // Upload widget
        h('div', { className: 'bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/30 rounded-lg p-4 border border-green-200 dark:border-green-800' },
          h('div', { className: 'flex items-center gap-2 mb-2' },
            h(Icon, { name: 'upload', size: 20, className: 'text-green-600 dark:text-green-400' }),
            h('h3', { className: 'font-semibold text-sm text-gray-800 dark:text-gray-200' }, 'Upload')
          ),
          h('div', { className: 'space-y-1' },
            h('div', { className: 'text-2xl font-bold text-green-600 dark:text-green-400' },
              formatSpeed(stats.EC_TAG_STATS_UL_SPEED || 0)
            ),
            h('div', { className: 'text-xs text-gray-600 dark:text-gray-400' },
              'Current speed'
            )
          )
        ),
        // Download widget
        h('div', { className: 'bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/30 rounded-lg p-4 border border-blue-200 dark:border-blue-800' },
          h('div', { className: 'flex items-center gap-2 mb-2' },
            h(Icon, { name: 'download', size: 20, className: 'text-blue-600 dark:text-blue-400' }),
            h('h3', { className: 'font-semibold text-sm text-gray-800 dark:text-gray-200' }, 'Download')
          ),
          h('div', { className: 'space-y-1' },
            h('div', { className: 'text-2xl font-bold text-blue-600 dark:text-blue-400' },
              formatSpeed(stats.EC_TAG_STATS_DL_SPEED || 0)
            ),
            h('div', { className: 'text-xs text-gray-600 dark:text-gray-400' },
              'Current speed'
            )
          )
        ),
        // ED2K Status widget
        (() => {
          const connState = stats.EC_TAG_CONNSTATE || {};
          const server = connState.EC_TAG_SERVER || {};
          const ed2kConnected = server?.EC_TAG_SERVER_PING > 0;
          const clientId = connState.EC_TAG_CLIENT_ID;
          const isHighId = clientId && clientId > 16777216;
          const statusText = ed2kConnected ? (isHighId ? 'High ID' : 'Low ID') : 'Disconnected';
          const statusColor = ed2kConnected ? (isHighId ? 'green' : 'yellow') : 'red';
          const serverName = ed2kConnected && server.EC_TAG_SERVER_NAME ? server.EC_TAG_SERVER_NAME : 'No server';

          return h('div', {
              className: 'bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-900/20 dark:to-indigo-800/30 rounded-lg p-4 border border-indigo-200 dark:border-indigo-800'
            },
            h('div', { className: 'flex items-center gap-2 mb-2' },
              h(Icon, { name: 'server', size: 20, className: 'text-indigo-600 dark:text-indigo-400' }),
              h('h3', { className: 'font-semibold text-sm text-gray-800 dark:text-gray-200' }, 'ED2K')
            ),
            h('div', { className: 'space-y-1' },
              h('div', { className: `text-2xl font-bold text-${statusColor}-600 dark:text-${statusColor}-400` },
                statusText
              ),
              h('div', { className: 'text-xs text-gray-600 dark:text-gray-400 truncate' },
                serverName
              )
            )
          );
        })(),
        // KAD Status widget
        (() => {
          const kadFirewalledValue = stats.EC_TAG_STATS_KAD_FIREWALLED_UDP;
          const kadConnected = kadFirewalledValue !== undefined && kadFirewalledValue !== null;
          const kadFirewalled = kadFirewalledValue === 1;
          const statusText = !kadConnected ? 'Disconnected' : (kadFirewalled ? 'Firewalled' : 'OK');
          const statusColor = !kadConnected ? 'red' : (kadFirewalled ? 'orange' : 'green');

          return h('div', { className: 'bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/30 rounded-lg p-4 border border-purple-200 dark:border-purple-800' },
            h('div', { className: 'flex items-center gap-2 mb-2' },
              h(Icon, { name: 'cloud', size: 20, className: 'text-purple-600 dark:text-purple-400' }),
              h('h3', { className: 'font-semibold text-sm text-gray-800 dark:text-gray-200' }, 'KAD')
            ),
            h('div', { className: 'space-y-1' },
              h('div', { className: `text-2xl font-bold text-${statusColor}-600 dark:text-${statusColor}-400` },
                statusText
              ),
              h('div', { className: 'text-xs text-gray-600 dark:text-gray-400' },
                'Network'
              )
            )
          );
        })()
      ) : h('div', { className: 'grid grid-cols-2 gap-3 mb-2' },
        // Placeholder widgets (4 total)
        ...Array(4).fill(null).map((_, i) =>
          h('div', {
            key: i,
            className: 'bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600 animate-pulse'
          },
            h('div', { className: 'h-4 bg-gray-300 dark:bg-gray-600 rounded w-20 mb-3' }),
            h('div', { className: 'h-8 bg-gray-300 dark:bg-gray-600 rounded w-24 mb-2' }),
            h('div', { className: 'h-3 bg-gray-300 dark:bg-gray-600 rounded w-20' })
          )
        )
      ),

      h('button', {
        onClick: () => onNavigate('search'),
        className: 'p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors active:scale-95 border border-blue-200 dark:border-blue-800 flex items-center gap-3'
      },
        h(Icon, { name: 'search', size: 24, className: 'text-blue-600 dark:text-blue-400' }),
        h('h3', { className: 'font-semibold text-base text-gray-800 dark:text-gray-200' }, 'Search Files')
      ),
      h('button', {
        onClick: () => onNavigate('downloads'),
        className: 'p-4 bg-green-50 dark:bg-green-900/20 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors active:scale-95 border border-green-200 dark:border-green-800 flex items-center gap-3'
      },
        h(Icon, { name: 'download', size: 24, className: 'text-green-600 dark:text-green-400' }),
        h('h3', { className: 'font-semibold text-base text-gray-800 dark:text-gray-200' }, 'Downloads')
      ),
      h('button', {
        onClick: () => onNavigate('uploads'),
        className: 'p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors active:scale-95 border border-orange-200 dark:border-orange-800 flex items-center gap-3'
      },
        h(Icon, { name: 'upload', size: 24, className: 'text-orange-600 dark:text-orange-400' }),
        h('h3', { className: 'font-semibold text-base text-gray-800 dark:text-gray-200' }, 'Uploads')
      ),
      h('button', {
        onClick: () => onNavigate('shared'),
        className: 'p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors active:scale-95 border border-purple-200 dark:border-purple-800 flex items-center gap-3'
      },
        h(Icon, { name: 'share', size: 24, className: 'text-purple-600 dark:text-purple-400' }),
        h('h3', { className: 'font-semibold text-base text-gray-800 dark:text-gray-200' }, 'Shared Files')
      ),
      h('button', {
        onClick: () => onNavigate('categories'),
        className: 'p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg hover:bg-yellow-100 dark:hover:bg-yellow-900/30 transition-colors active:scale-95 border border-yellow-200 dark:border-yellow-800 flex items-center gap-3'
      },
        h(Icon, { name: 'folder', size: 24, className: 'text-yellow-600 dark:text-yellow-400' }),
        h('h3', { className: 'font-semibold text-base text-gray-800 dark:text-gray-200' }, 'Categories')
      ),
      h('button', {
        onClick: () => onNavigate('servers'),
        className: 'p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors active:scale-95 border border-indigo-200 dark:border-indigo-800 flex items-center gap-3'
      },
        h(Icon, { name: 'server', size: 24, className: 'text-indigo-600 dark:text-indigo-400' }),
        h('h3', { className: 'font-semibold text-base text-gray-800 dark:text-gray-200' }, 'Servers')
      ),
      h('button', {
        onClick: () => onNavigate('logs'),
        className: 'p-4 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg hover:bg-cyan-100 dark:hover:bg-cyan-900/30 transition-colors active:scale-95 border border-cyan-200 dark:border-cyan-800 flex items-center gap-3'
      },
        h(Icon, { name: 'fileText', size: 24, className: 'text-cyan-600 dark:text-cyan-400' }),
        h('h3', { className: 'font-semibold text-base text-gray-800 dark:text-gray-200' }, 'Logs')
      ),
      h('button', {
        onClick: () => onNavigate('statistics'),
        className: 'p-4 bg-pink-50 dark:bg-pink-900/20 rounded-lg hover:bg-pink-100 dark:hover:bg-pink-900/30 transition-colors active:scale-95 border border-pink-200 dark:border-pink-800 flex items-center gap-3'
      },
        h(Icon, { name: 'chartBar', size: 24, className: 'text-pink-600 dark:text-pink-400' }),
        h('h3', { className: 'font-semibold text-base text-gray-800 dark:text-gray-200' }, 'Statistics')
      )
    )
  );
};

export default HomeView;
