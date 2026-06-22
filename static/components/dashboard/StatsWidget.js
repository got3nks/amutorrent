/**
 * StatsWidget Component
 *
 * Displays statistics in a grid of stat cards for a configurable time range.
 * Can optionally show/hide peak speeds. Shows a per-network-type breakdown
 * when more than one network type is connected (aMule / Rucio / BitTorrent).
 */

import React from 'https://esm.sh/react@18.2.0';
import { StatCard } from '../common/index.js';
import { formatSpeed, formatBytes } from '../../utils/index.js';
import { NETWORK_NAMES, NETWORK_ORDER } from '../../utils/constants.js';
import { useClientFilter } from '../../contexts/ClientFilterContext.js';
import { useLiveData } from '../../contexts/LiveDataContext.js';
import ClientIcon from '../common/ClientIcon.js';

const { createElement: h } = React;

const EMPTY_STATS = {
  totalUploaded: 0, totalDownloaded: 0,
  avgUploadSpeed: 0, avgDownloadSpeed: 0,
  peakUploadSpeed: 0, peakDownloadSpeed: 0
};

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
 * Per-network-type breakdown value.
 * @param {Array<{type, value}>} entries - one per enabled network type
 * Desktop (xl+): icon value · icon value (inline with dot separator)
 * Tablet/Mobile (<xl) and compact: icon value (one line per network)
 */
const ClientBreakdownValue = ({ entries, showClientIcons, compact = false, formatter = (v) => v }) => {
  if (!showClientIcons) {
    // Only one network configured/connected — show plain combined value
    return h('span', null, formatter(entries.reduce((s, e) => s + e.value, 0)));
  }

  const line = (e, size) => h('span', { key: e.type, className: 'flex items-center gap-1' },
    h(ClientIcon, { clientType: e.type, size }),
    h('span', null, formatter(e.value))
  );

  if (compact) {
    return h('div', { className: 'flex flex-col gap-0.5 text-xs' }, entries.map(e => line(e, 12)));
  }

  // Two rows layout (below xl)
  const twoRowsLayout = h('div', { className: 'flex flex-col gap-0.5 xl:hidden' }, entries.map(e => line(e, 14)));

  // Inline layout with dot separators (xl+)
  const inlineParts = [];
  entries.forEach((e, i) => {
    if (i > 0) inlineParts.push(h('span', { key: `dot-${e.type}`, className: 'text-gray-400 mx-1' }, '·'));
    inlineParts.push(line(e, 14));
  });
  const inlineLayout = h('span', { className: 'hidden xl:flex items-center gap-1 flex-wrap' }, inlineParts);

  return h(React.Fragment, null, twoRowsLayout, inlineLayout);
};

/**
 * Compact mode combined stats (total · avg speed per network).
 * @param {Array<{type, total, avg}>} entries
 */
const CompactCombinedValue = ({ entries, showClientIcons }) => {
  if (!showClientIcons) {
    const total = entries.reduce((s, e) => s + e.total, 0);
    const avg = entries.reduce((s, e) => s + e.avg, 0);
    return h('span', { className: 'flex items-center gap-1' },
      h('span', null, formatBytes(total)),
      h('span', { className: 'text-gray-400' }, '·'),
      h('span', null, formatSpeed(avg))
    );
  }

  return h('div', { className: 'flex flex-col gap-0.5 text-xs' },
    entries.map(e => h('span', { key: e.type, className: 'flex items-center gap-1' },
      h(ClientIcon, { clientType: e.type, size: 12 }),
      h('span', null, formatBytes(e.total)),
      h('span', { className: 'text-gray-400' }, '·'),
      h('span', null, formatSpeed(e.avg))
    ))
  );
};

/**
 * StatsWidget component
 * @param {object} stats - Historical stats with per-networkType sub-objects (ed2k/rucio/bittorrent)
 * @param {boolean} showPeakSpeeds - Whether to show peak speed cards (default: true)
 * @param {boolean} compact - Use compact layout for mobile (default: false)
 * @param {string} timeRange - Time range label to display (default: '24h')
 */
const StatsWidget = ({ stats, showPeakSpeeds = true, compact = false, timeRange = '24h' }) => {
  const { isNetworkTypeEnabled, ed2kConnected, bittorrentConnected, rucioConnected } = useClientFilter();
  const { dataStats: liveStats } = useLiveData();

  // Show per-network icons/breakdown when more than one network is connected.
  const connectedCount = [ed2kConnected, rucioConnected, bittorrentConnected].filter(Boolean).length;
  const showClientIcons = connectedCount > 1;

  // Network types to include (connected AND enabled in the filter), in order.
  const enabledNetworks = NETWORK_ORDER.filter(nt => isNetworkTypeEnabled(nt));

  // Loading until both historical (stats) and live (connection status) arrive.
  const isLoading = !stats || !liveStats;

  // Build per-network entries for a given stat field.
  const entriesFor = (field) => enabledNetworks.map(nt => ({
    type: nt,
    value: (stats?.[nt] || EMPTY_STATS)[field]
  }));
  // Compact: total + avg pair per network.
  const compactEntries = (totalField, avgField) => enabledNetworks.map(nt => ({
    type: nt,
    total: (stats?.[nt] || EMPTY_STATS)[totalField],
    avg: (stats?.[nt] || EMPTY_STATS)[avgField]
  }));

  // Compact mode: 2 combined cards (Downloaded, Uploaded)
  if (compact) {
    return h('div', { className: 'grid grid-cols-2 gap-2' },
      !isLoading
        ? h(StatCard, {
            label: `Downloaded · Avg (${timeRange})`,
            value: h(CompactCombinedValue, { entries: compactEntries('totalDownloaded', 'avgDownloadSpeed'), showClientIcons }),
            icon: 'download',
            iconColor: 'text-blue-600 dark:text-blue-400',
            compact
          })
        : h(StatCardSkeleton, { compact }),
      !isLoading
        ? h(StatCard, {
            label: `Uploaded · Avg (${timeRange})`,
            value: h(CompactCombinedValue, { entries: compactEntries('totalUploaded', 'avgUploadSpeed'), showClientIcons }),
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

  // Card factory: per-network breakdown when multiple networks, else plain sum.
  const card = (label, field, formatter, icon, iconColor) => (!isLoading
    ? h(StatCard, {
        label: `${label} (${timeRange})`,
        value: showClientIcons
          ? h(ClientBreakdownValue, { entries: entriesFor(field), showClientIcons, formatter })
          : formatter(entriesFor(field).reduce((s, e) => s + e.value, 0)),
        icon,
        iconColor
      })
    : h(StatCardSkeleton));

  return h('div', { className: gridClass },
    card('Total Uploaded', 'totalUploaded', formatBytes, 'upload', 'text-green-600 dark:text-green-400'),
    card('Avg Upload Speed', 'avgUploadSpeed', formatSpeed, 'trendingUp', 'text-green-600 dark:text-green-400'),
    showPeakSpeeds && card('Peak Upload Speed', 'peakUploadSpeed', formatSpeed, 'zap', 'text-green-600 dark:text-green-400'),
    card('Total Downloaded', 'totalDownloaded', formatBytes, 'download', 'text-blue-600 dark:text-blue-400'),
    card('Avg Download Speed', 'avgDownloadSpeed', formatSpeed, 'trendingUp', 'text-blue-600 dark:text-blue-400'),
    showPeakSpeeds && card('Peak Download Speed', 'peakDownloadSpeed', formatSpeed, 'zap', 'text-blue-600 dark:text-blue-400')
  );
};

export default StatsWidget;
