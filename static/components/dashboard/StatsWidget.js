/**
 * StatsWidget Component
 *
 * Displays statistics in a grid of stat cards for a configurable time range
 * Can optionally show/hide peak speeds
 * Shows per-network-type breakdown when both network types are active
 */

import React from 'https://esm.sh/react@18.2.0';
import { StatCard } from '../common/index.js';
import { formatSpeed, formatBytes } from '../../utils/index.js';
import { useClientFilter } from '../../contexts/ClientFilterContext.js';
import { useLiveData } from '../../contexts/LiveDataContext.js';
import ClientIcon from '../common/ClientIcon.js';

const { createElement: h } = React;

const NETWORK_ORDER = ['ed2k', 'bittorrent', 'soulseek'];

const getNetworkClient = (networkType) => {
  if (networkType === 'soulseek') return 'soulseek';
  if (networkType === 'bittorrent') return 'bittorrent';
  return 'ed2k';
};

const getStatValue = (statsByNetwork, networkType, metric) => Number(statsByNetwork[networkType]?.[metric] || 0);

/**
 * Loading placeholder for stat card
 * @param {boolean} compact - Use compact styling for mobile
 */
const StatCardSkeleton = ({ compact = false }) => {
  return h('div', {
    className: `bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 animate-pulse ${compact ? 'p-2' : 'p-3'}`
  },
    h('div', { className: `bg-gray-200 dark:bg-gray-700 rounded ${compact ? 'h-3 w-20 mb-1' : 'h-4 w-24 mb-2'}` }),
    h('div', { className: `bg-gray-200 dark:bg-gray-700 rounded ${compact ? 'h-5 w-16' : 'h-8 w-32'}` })
  );
};

/**
 * Helper component for displaying per-network-type breakdown values
 * Desktop (xl+): icon value · icon value · icon value (inline with dot separator)
 * Tablet/Mobile (<xl): stacked rows
 * Compact mode: always stacked rows with smaller text
 */
const ClientBreakdownValue = ({ metric, statsByNetwork, activeNetworkTypes, showClientIcons, compact = false, formatter = (v) => v }) => {
  const totalValue = activeNetworkTypes.reduce((sum, networkType) => sum + getStatValue(statsByNetwork, networkType, metric), 0);

  if (!showClientIcons) {
    return h('span', null, formatter(totalValue));
  }

  const renderLine = (networkType, iconSize) => h('span', { className: 'flex items-center gap-1' },
    h(ClientIcon, { clientType: getNetworkClient(networkType), size: iconSize }),
    h('span', null, formatter(getStatValue(statsByNetwork, networkType, metric)))
  );

  if (compact) {
    return h('div', { className: 'flex flex-col gap-0.5 text-xs' },
      ...activeNetworkTypes.map((networkType) => renderLine(networkType, 12))
    );
  }

  const twoRowsLayout = h('div', { className: 'flex flex-col gap-0.5 xl:hidden' },
    ...activeNetworkTypes.map((networkType) => renderLine(networkType, 14))
  );

  const inlineParts = [];
  activeNetworkTypes.forEach((networkType, index) => {
    if (index > 0) {
      inlineParts.push(h('span', { key: `${networkType}-dot`, className: 'text-gray-400 mx-1' }, '·'));
    }
    inlineParts.push(renderLine(networkType, 14));
  });

  return h(React.Fragment, null,
    twoRowsLayout,
    h('span', { className: 'hidden xl:flex items-center gap-1 flex-wrap' }, inlineParts)
  );
};

/**
 * Helper component for compact mode combined stats (total · avg speed per client)
 * Shows: icon total · avg (one line per network if multiple are visible)
 */
const CompactCombinedValue = ({ statsByNetwork, activeNetworkTypes, showClientIcons }) => {
  const renderClientLine = (networkType) => (
    h('span', { className: 'flex items-center gap-1' },
      showClientIcons && h(ClientIcon, { clientType: getNetworkClient(networkType), size: 12 }),
      h('span', null, formatBytes(getStatValue(statsByNetwork, networkType, 'total'))),
      h('span', { className: 'text-gray-400' }, '·'),
      h('span', null, formatSpeed(getStatValue(statsByNetwork, networkType, 'avg')))
    )
  );

  if (!showClientIcons) {
    const total = activeNetworkTypes.reduce((sum, networkType) => sum + getStatValue(statsByNetwork, networkType, 'total'), 0);
    const avg = activeNetworkTypes.reduce((sum, networkType) => sum + getStatValue(statsByNetwork, networkType, 'avg'), 0);
    return h('span', { className: 'flex items-center gap-1' },
      h('span', null, formatBytes(total)),
      h('span', { className: 'text-gray-400' }, '·'),
      h('span', null, formatSpeed(avg))
    );
  }

  return h('div', { className: 'flex flex-col gap-0.5 text-xs' },
    ...activeNetworkTypes.map((networkType) => renderClientLine(networkType))
  );
};

/**
 * StatsWidget component
 * @param {object} stats - Historical stats object with totals and speeds (includes ed2k/bittorrent sub-objects)
 * @param {boolean} showPeakSpeeds - Whether to show peak speed cards (default: true)
 * @param {boolean} compact - Use compact layout for mobile (default: false)
 * @param {string} timeRange - Time range label to display (default: '24h')
 */
const StatsWidget = ({ stats, showPeakSpeeds = true, compact = false, timeRange = '24h' }) => {
  const { isEd2kEnabled, isBittorrentEnabled, isSoulseekEnabled, ed2kConnected, bittorrentConnected, soulseekConnected } = useClientFilter();
  const { dataStats: liveStats } = useLiveData();

  const activeNetworkTypes = NETWORK_ORDER.filter((networkType) => {
    if (networkType === 'ed2k') return isEd2kEnabled;
    if (networkType === 'bittorrent') return isBittorrentEnabled;
    return isSoulseekEnabled;
  });

  // Show client icons when more than one network is visible
  const showClientIcons = activeNetworkTypes.length > 1;

  const statsByNetwork = {
    ed2k: stats?.ed2k || { totalUploaded: 0, totalDownloaded: 0, avgUploadSpeed: 0, avgDownloadSpeed: 0, peakUploadSpeed: 0, peakDownloadSpeed: 0 },
    bittorrent: stats?.bittorrent || { totalUploaded: 0, totalDownloaded: 0, avgUploadSpeed: 0, avgDownloadSpeed: 0, peakUploadSpeed: 0, peakDownloadSpeed: 0 },
    soulseek: stats?.soulseek || { totalUploaded: 0, totalDownloaded: 0, avgUploadSpeed: 0, avgDownloadSpeed: 0, peakUploadSpeed: 0, peakDownloadSpeed: 0 }
  };

  const networkStats = {
    ed2k: {
      totalUploaded: statsByNetwork.ed2k.totalUploaded,
      totalDownloaded: statsByNetwork.ed2k.totalDownloaded,
      avgUploadSpeed: statsByNetwork.ed2k.avgUploadSpeed,
      avgDownloadSpeed: statsByNetwork.ed2k.avgDownloadSpeed,
      peakUploadSpeed: statsByNetwork.ed2k.peakUploadSpeed,
      peakDownloadSpeed: statsByNetwork.ed2k.peakDownloadSpeed
    },
    bittorrent: {
      totalUploaded: statsByNetwork.bittorrent.totalUploaded,
      totalDownloaded: statsByNetwork.bittorrent.totalDownloaded,
      avgUploadSpeed: statsByNetwork.bittorrent.avgUploadSpeed,
      avgDownloadSpeed: statsByNetwork.bittorrent.avgDownloadSpeed,
      peakUploadSpeed: statsByNetwork.bittorrent.peakUploadSpeed,
      peakDownloadSpeed: statsByNetwork.bittorrent.peakDownloadSpeed
    },
    soulseek: {
      totalUploaded: statsByNetwork.soulseek.totalUploaded,
      totalDownloaded: statsByNetwork.soulseek.totalDownloaded,
      avgUploadSpeed: statsByNetwork.soulseek.avgUploadSpeed,
      avgDownloadSpeed: statsByNetwork.soulseek.avgDownloadSpeed,
      peakUploadSpeed: statsByNetwork.soulseek.peakUploadSpeed,
      peakDownloadSpeed: statsByNetwork.soulseek.peakDownloadSpeed
    }
  };

  // Show loading skeleton if either data source is missing:
  // - stats: historical data from API
  // - liveStats: WebSocket data needed for client connection status
  const isLoading = !stats || !liveStats;

  const getFilteredValue = (metric) => activeNetworkTypes.reduce((sum, networkType) => sum + getStatValue(networkStats, networkType, metric), 0);

  // Compact mode: 2 combined cards (Downloaded, Uploaded)
  if (compact) {
    return h('div', { className: 'grid grid-cols-2 gap-2' },
        // Downloaded card (total · avg speed)
        !isLoading
          ? h(StatCard, {
              label: `Downloaded · Avg (${timeRange})`,
              value: h(CompactCombinedValue, {
                  statsByNetwork: {
                    ed2k: { total: networkStats.ed2k.totalDownloaded, avg: networkStats.ed2k.avgDownloadSpeed },
                    bittorrent: { total: networkStats.bittorrent.totalDownloaded, avg: networkStats.bittorrent.avgDownloadSpeed },
                    soulseek: { total: networkStats.soulseek.totalDownloaded, avg: networkStats.soulseek.avgDownloadSpeed }
                  },
                  activeNetworkTypes,
                showClientIcons,
              }),
              icon: 'download',
              iconColor: 'text-blue-600 dark:text-blue-400',
              compact
            })
          : h(StatCardSkeleton, { compact }),

        // Uploaded card (total · avg speed)
        !isLoading
          ? h(StatCard, {
              label: `Uploaded · Avg (${timeRange})`,
              value: h(CompactCombinedValue, {
                  statsByNetwork: {
                    ed2k: { total: networkStats.ed2k.totalUploaded, avg: networkStats.ed2k.avgUploadSpeed },
                    bittorrent: { total: networkStats.bittorrent.totalUploaded, avg: networkStats.bittorrent.avgUploadSpeed },
                    soulseek: { total: networkStats.soulseek.totalUploaded, avg: networkStats.soulseek.avgUploadSpeed }
                  },
                  activeNetworkTypes,
                showClientIcons,
              }),
              icon: 'upload',
              iconColor: 'text-green-600 dark:text-green-400',
              compact
            })
          : h(StatCardSkeleton, { compact })
    );
  }

  // Desktop mode: full grid with separate cards
  const gridClass = showPeakSpeeds
    ? 'grid grid-cols-2 sm:grid-cols-3 gap-3'
    : 'grid grid-cols-2 sm:grid-cols-4 gap-3';

  return h('div', { className: gridClass },
    // Total Uploaded
    !isLoading
      ? h(StatCard, {
          label: `Total Uploaded (${timeRange})`,
          value: showClientIcons
            ? h(ClientBreakdownValue, {
                metric: 'totalUploaded',
                statsByNetwork: networkStats,
                activeNetworkTypes,
                showClientIcons,
                formatter: formatBytes
              })
            : formatBytes(getFilteredValue('totalUploaded')),
          icon: 'upload',
          iconColor: 'text-green-600 dark:text-green-400'
        })
      : h(StatCardSkeleton),

    // Avg Upload Speed
    !isLoading
      ? h(StatCard, {
          label: `Avg Upload Speed (${timeRange})`,
          value: showClientIcons
            ? h(ClientBreakdownValue, {
                metric: 'avgUploadSpeed',
                statsByNetwork: networkStats,
                activeNetworkTypes,
                showClientIcons,
                formatter: formatSpeed
              })
            : formatSpeed(getFilteredValue('avgUploadSpeed')),
          icon: 'trendingUp',
          iconColor: 'text-green-600 dark:text-green-400'
        })
      : h(StatCardSkeleton),

    // Peak Upload Speed (optional)
    showPeakSpeeds && (!isLoading
      ? h(StatCard, {
          label: `Peak Upload Speed (${timeRange})`,
          value: showClientIcons
            ? h(ClientBreakdownValue, {
                metric: 'peakUploadSpeed',
                statsByNetwork: networkStats,
                activeNetworkTypes,
                showClientIcons,
                formatter: formatSpeed
              })
            : formatSpeed(getFilteredValue('peakUploadSpeed')),
          icon: 'zap',
          iconColor: 'text-green-600 dark:text-green-400'
        })
      : h(StatCardSkeleton)),

    // Total Downloaded
    !isLoading
      ? h(StatCard, {
          label: `Total Downloaded (${timeRange})`,
          value: showClientIcons
            ? h(ClientBreakdownValue, {
                metric: 'totalDownloaded',
                statsByNetwork: networkStats,
                activeNetworkTypes,
                showClientIcons,
                formatter: formatBytes
              })
            : formatBytes(getFilteredValue('totalDownloaded')),
          icon: 'download',
          iconColor: 'text-blue-600 dark:text-blue-400'
        })
      : h(StatCardSkeleton),

    // Avg Download Speed
    !isLoading
      ? h(StatCard, {
          label: `Avg Download Speed (${timeRange})`,
          value: showClientIcons
            ? h(ClientBreakdownValue, {
                metric: 'avgDownloadSpeed',
                statsByNetwork: networkStats,
                activeNetworkTypes,
                showClientIcons,
                formatter: formatSpeed
              })
            : formatSpeed(getFilteredValue('avgDownloadSpeed')),
          icon: 'trendingUp',
          iconColor: 'text-blue-600 dark:text-blue-400'
        })
      : h(StatCardSkeleton),

    // Peak Download Speed (optional)
    showPeakSpeeds && (!isLoading
      ? h(StatCard, {
          label: `Peak Download Speed (${timeRange})`,
          value: showClientIcons
            ? h(ClientBreakdownValue, {
                metric: 'peakDownloadSpeed',
                statsByNetwork: networkStats,
                activeNetworkTypes,
                showClientIcons,
                formatter: formatSpeed
              })
            : formatSpeed(getFilteredValue('peakDownloadSpeed')),
          icon: 'zap',
          iconColor: 'text-blue-600 dark:text-blue-400'
        })
      : h(StatCardSkeleton))
  );
};

export default StatsWidget;
