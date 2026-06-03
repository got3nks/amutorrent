/**
 * StatisticsView Component
 *
 * Displays historical statistics with charts and statistics tree
 * Uses contexts directly for all data and actions
 */

import React from 'https://esm.sh/react@18.2.0';
import { Button, ClientIcon, SegmentedControl, LoadingSpinner } from '../common/index.js';
import { VIEW_TITLE_STYLES } from '../../utils/index.js';
import { useAppState } from '../../contexts/AppStateContext.js';
import { useStaticData } from '../../contexts/StaticDataContext.js';
import { useTheme } from '../../contexts/ThemeContext.js';
import { useClientFilter } from '../../contexts/ClientFilterContext.js';
import { useClientChartConfig } from '../../hooks/useClientChartConfig.js';
import { StatsTreeModal } from '../modals/index.js';
import { StatsWidget, DashboardChartWidget } from '../dashboard/index.js';

const { createElement: h, useState, useCallback, useEffect, useMemo, useRef, lazy, Suspense } = React;

// Lazy load chart components for better initial page load performance
const ClientSpeedChart = lazy(() => import('../common/ClientSpeedChart.js'));
const ClientTransferChart = lazy(() => import('../common/ClientTransferChart.js'));

/**
 * Statistics view component - now uses contexts directly
 */
const StatisticsView = () => {

  // Get data from contexts
  const { appStatsState, setAppStatsState, addAppError } = useAppState();
  const { hasType, instances } = useStaticData();
  const { theme } = useTheme();
  const { disabledInstances } = useClientFilter();

  // Compute instanceIds filter param — empty string means use legacy (all connected enabled)
  const instanceIdsParam = useMemo(() => {
    const connected = Object.entries(instances)
      .filter(([, inst]) => inst.connected)
      .map(([id]) => id);
    if (connected.length === 0) return '';
    const enabled = connected.filter(id => !disabledInstances.has(id));
    if (enabled.length === connected.length) return '';
    return enabled.join(',');
  }, [instances, disabledInstances]);

  // Names of enabled instances for the filter banner (null when not filtering)
  const filteredInstanceNames = useMemo(() => {
    if (!instanceIdsParam) return null;
    const enabledIds = new Set(instanceIdsParam.split(','));
    return Object.entries(instances)
      .filter(([id, inst]) => inst.connected && enabledIds.has(id))
      .map(([, inst]) => inst.name);
  }, [instanceIdsParam, instances]);

  // Get client chart configuration from hook
  const {
    visibleNetworkInfo,
    showBothCharts,
    showSingleClient,
    singleNetworkType,
    singleNetworkName,
    shouldRenderCharts
  } = useClientChartConfig();

  // Check if aMule is enabled in config (not just connected)
  const amuleConfigEnabled = hasType('amule');

  // Show ED2K stats tree button only when aMule is enabled in config, connected, and enabled in filter
  const showAmuleStatsTree = amuleConfigEnabled && visibleNetworkInfo.some(info => info.type === 'ed2k');

  // State for stats tree modal
  const [showStatsTreeModal, setShowStatsTreeModal] = useState(false);
  // Chart mode: 'speed' or 'transfer'
  const [chartMode, setChartMode] = useState('speed');

  // Aliases for readability
  const loadingHistory = appStatsState.loadingHistory;
  const historicalRange = appStatsState.historicalRange;
  const historicalStats = appStatsState.historicalStats;
  const speedData = appStatsState.speedData;
  const historicalData = appStatsState.historicalData;
  // Abort controller for in-flight metrics fetches — new fetch aborts the previous one
  const metricsAbortRef = useRef(null);

  // Fetch historical data for statistics
  const fetchHistoricalData = useCallback(async (range, showLoading = true) => {
    if (metricsAbortRef.current) metricsAbortRef.current.abort();
    const controller = new AbortController();
    metricsAbortRef.current = controller;

    if (showLoading) setAppStatsState(prev => ({ ...prev, loadingHistory: true, historicalRange: range }));
    try {
      let url = `/api/metrics/dashboard?range=${range}`;
      if (instanceIdsParam) url += `&instanceIds=${instanceIdsParam}`;
      const response = await fetch(url, { signal: controller.signal });
      const { speedData, historicalData, historicalStats } = await response.json();

      setAppStatsState({
        speedData,
        historicalData,
        historicalStats,
        historicalRange: range,
        loadingHistory: false
      });
    } catch (err) {
      if (err.name === 'AbortError') return; // Superseded by newer fetch
      console.error('Error fetching historical data:', err);
      addAppError('Failed to load historical data');
      if (showLoading) setAppStatsState(prev => ({ ...prev, loadingHistory: false }));
    }
  }, [setAppStatsState, addAppError, instanceIdsParam]);

  // Local handlers
  const onFetchHistoricalData = fetchHistoricalData;

  // Fetch historical data on mount only
  useEffect(() => {
    fetchHistoricalData(historicalRange, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Re-fetch when instance filter changes (skip initial mount)
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return; }
    fetchHistoricalData(historicalRange, true);
  }, [instanceIdsParam]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh historical data
  useEffect(() => {
    const STATISTICS_REFRESH_INTERVAL = 30000; // 30 seconds
    const interval = setInterval(() => {
      fetchHistoricalData(historicalRange, false);
    }, STATISTICS_REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchHistoricalData, historicalRange]);

  // Check if we have data to render charts
  const hasSpeedData = speedData?.data?.length > 0;
  const hasHistoricalData = historicalData?.data?.length > 0;

  // Empty placeholder for charts without data (outer loading overlay handles the spinner)
  const chartPlaceholder = h('div', { className: 'h-full' });

  // Suspense fallback with spinner (for lazy JS loading — outer overlay not shown in this state)
  const chartLoader = h('div', { className: 'h-full flex items-center justify-center' },
    h(LoadingSpinner, { size: 'sm' })
  );

  // Helper to render chart content with loading state - only creates chart element when data exists
  const renderSpeedChart = (networkType) => {
    if (!shouldRenderCharts || !hasSpeedData) return chartPlaceholder;
    return h(Suspense, { fallback: chartLoader },
      h(ClientSpeedChart, { speedData, networkType, theme, historicalRange })
    );
  };

  const renderTransferChart = (networkType) => {
    if (!shouldRenderCharts || !hasHistoricalData) return chartPlaceholder;
    return h(Suspense, { fallback: chartLoader },
      h(ClientTransferChart, { historicalData, networkType, theme, historicalRange })
    );
  };

  // Helper to create chart title with icon
  const chartTitle = (title, icon) => h('span', { className: 'flex items-center gap-2' },
    h(ClientIcon, { clientType: icon, size: 16 }),
    title
  );

  const chartColClass = visibleNetworkInfo.length >= 3 ? 'col-span-6 md:col-span-2' : visibleNetworkInfo.length === 2 ? 'col-span-6 md:col-span-3' : 'col-span-6';

  const renderChartCards = (kind) => visibleNetworkInfo.map((info) => {
    const title = kind === 'speed' ? `${info.label} Speed` : `${info.label} Data Transferred`;
    const chart = kind === 'speed'
      ? renderSpeedChart(info.type)
      : renderTransferChart(info.type);

    return h('div', { key: `${kind}-${info.type}`, className: chartColClass },
      h(DashboardChartWidget, {
        title: chartTitle(title, info.client),
        height: '225px'
      }, chart)
    );
  });

  return h('div', { className: 'space-y-2 sm:space-y-3 px-2 sm:px-0' },
    // Header
    h('div', { className: 'flex justify-between items-center gap-2' },
      h('h2', { className: VIEW_TITLE_STYLES.desktop }, 'Historical Statistics'),
      // Time range toggle
      h(SegmentedControl, {
        options: [
          { value: '24h', label: '24H' },
          { value: '7d', label: '7D' },
          { value: '30d', label: '30D' }
        ],
        value: historicalRange,
        onChange: (range) => onFetchHistoricalData(range, true),
        disabled: loadingHistory
      })
    ),

    // Instance filter banner (shown when some instances are disabled)
    filteredInstanceNames && h('div', {
      className: 'flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-700/40 rounded px-2.5 py-1.5'
    },
      h('svg', { className: 'w-3.5 h-3.5 flex-shrink-0', fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor', strokeWidth: '2' },
        h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', d: 'M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z' })
      ),
      h('span', null, `Showing data for: ${filteredInstanceNames.join(', ')}`)
    ),

    // Summary Statistics Cards with loading state
    h('div', { className: loadingHistory ? 'opacity-50 pointer-events-none' : '' },
      // Desktop (with peak speeds)
      h('div', { className: 'hidden sm:block' },
        h(StatsWidget, {
          stats: historicalStats,
          showPeakSpeeds: true,
          timeRange: historicalRange
        })
      ),

      // Mobile (compact, no peak speeds)
      h('div', { className: 'sm:hidden' },
        h(StatsWidget, {
          stats: historicalStats,
          showPeakSpeeds: false,
          compact: true,
          timeRange: historicalRange
        })
      )
    ),

    // Network Activity section header with chart mode toggle (only when both clients active)
    h('div', { className: 'flex justify-between items-center gap-2 pt-2' },
      h('h3', { className: VIEW_TITLE_STYLES.desktop }, 'Network Activity'),
      // Only show toggle when both clients are active
      showBothCharts && h(SegmentedControl, {
        options: [
          { value: 'speed', label: 'Speed' },
          { value: 'transfer', label: 'Transferred' }
        ],
        value: chartMode,
        onChange: setChartMode
      })
    ),

    // Charts section with loading overlay
    h('div', { className: 'relative' },
      // Loading overlay (shows on top of content)
      loadingHistory && h('div', { className: 'absolute inset-0 bg-white/70 dark:bg-gray-900/70 z-10 flex flex-col items-center justify-center rounded-lg' },
        h(LoadingSpinner, { size: 'sm' }),
        h('p', { className: 'text-sm text-gray-500 dark:text-gray-400 mt-2' }, 'Loading historical data...')
      ),

      // Charts content (always rendered, dimmed when loading)
      h('div', { className: `space-y-2 sm:space-y-3${loadingHistory ? ' opacity-50 pointer-events-none' : ''}` },
        // Charts for the visible network types
        visibleNetworkInfo.length > 0 && h(React.Fragment, null,
          chartMode === 'speed' && renderChartCards('speed'),
          chartMode === 'transfer' && renderChartCards('transfer')
        )
      )
    ),

    // ED2K Statistics Tree button (only when aMule is connected and enabled)
    showAmuleStatsTree && h('div', { className: 'flex items-center justify-center pt-2' },
      h(Button, {
        variant: 'secondary',
        onClick: () => setShowStatsTreeModal(true),
        className: 'flex items-center gap-2'
      },
        h(ClientIcon, { clientType: 'amule', size: 18 }),
        'Open ED2K Statistics Tree'
      )
    ),

    // Stats Tree Modal
    h(StatsTreeModal, {
      show: showStatsTreeModal,
      onClose: () => setShowStatsTreeModal(false)
    })
  );
};

export default StatisticsView;
