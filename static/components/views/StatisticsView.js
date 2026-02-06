/**
 * StatisticsView Component
 *
 * Displays historical statistics with charts and statistics tree
 * Uses contexts directly for all data and actions
 */

import React from 'https://esm.sh/react@18.2.0';
import { Button, ClientIcon, SegmentedControl } from '../common/index.js';
import { VIEW_TITLE_STYLES } from '../../utils/index.js';
import { useAppState } from '../../contexts/AppStateContext.js';
import { useStaticData } from '../../contexts/StaticDataContext.js';
import { useDataFetch } from '../../contexts/DataFetchContext.js';
import { useTheme } from '../../contexts/ThemeContext.js';
import { useClientChartConfig } from '../../hooks/useClientChartConfig.js';
import { StatsTreeModal } from '../modals/index.js';
import { StatsWidget, DashboardChartWidget } from '../dashboard/index.js';

const { createElement: h, useState, useCallback, useEffect, lazy, Suspense } = React;

// Lazy load chart components for better initial page load performance
const ClientSpeedChart = lazy(() => import('../common/ClientSpeedChart.js'));
const ClientTransferChart = lazy(() => import('../common/ClientTransferChart.js'));

/**
 * Statistics view component - now uses contexts directly
 */
const StatisticsView = () => {

  // Get data from contexts
  const { appStatsState, setAppStatsState, addAppError } = useAppState();
  const { dataStatsTree, clientsEnabled } = useStaticData();
  const { fetchStatsTree } = useDataFetch();
  const { theme } = useTheme();

  // Get client chart configuration from hook
  const {
    amuleConnected,
    isAmuleEnabled,
    showBothCharts,
    showSingleClient,
    singleClientType,
    singleClientName,
    shouldRenderCharts
  } = useClientChartConfig();

  // Check if aMule is enabled in config (not just connected)
  const amuleConfigEnabled = clientsEnabled?.amule !== false;

  // Show ED2K stats tree button only when aMule is enabled in config, connected, and enabled in filter
  const showAmuleStatsTree = amuleConfigEnabled && amuleConnected && isAmuleEnabled;

  // State for stats tree modal
  const [showStatsTreeModal, setShowStatsTreeModal] = useState(false);
  // Persist expanded nodes state across modal open/close
  const [statsTreeExpandedNodes, setStatsTreeExpandedNodes] = useState({});
  // Chart mode: 'speed' or 'transfer'
  const [chartMode, setChartMode] = useState('speed');

  // Aliases for readability
  const loadingHistory = appStatsState.loadingHistory;
  const historicalRange = appStatsState.historicalRange;
  const historicalStats = appStatsState.historicalStats;
  const speedData = appStatsState.speedData;
  const historicalData = appStatsState.historicalData;
  const statsTree = dataStatsTree;

  // Fetch historical data for statistics
  const fetchHistoricalData = useCallback(async (range, showLoading = true) => {
    if (showLoading) setAppStatsState(prev => ({ ...prev, loadingHistory: true }));
    try {
      const response = await fetch(`/api/metrics/dashboard?range=${range}`);
      const { speedData, historicalData, historicalStats } = await response.json();

      setAppStatsState({
        speedData,
        historicalData,
        historicalStats,
        historicalRange: range,
        loadingHistory: false
      });
    } catch (err) {
      console.error('Error fetching historical data:', err);
      addAppError('Failed to load historical data');
      if (showLoading) setAppStatsState(prev => ({ ...prev, loadingHistory: false }));
    }
  }, [setAppStatsState, addAppError]);

  // Local handlers
  const onFetchHistoricalData = fetchHistoricalData;

  // Fetch initial data on mount only
  useEffect(() => {
    if (amuleConfigEnabled) {
      fetchStatsTree();
    }
    fetchHistoricalData(historicalRange, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Set up auto-refresh intervals (separate effect to avoid re-triggering on range change)
  useEffect(() => {
    const STATISTICS_REFRESH_INTERVAL = 30000; // 30 seconds
    const statsTreeInterval = amuleConfigEnabled
      ? setInterval(fetchStatsTree, STATISTICS_REFRESH_INTERVAL)
      : null;
    const historicalDataInterval = setInterval(() => {
      fetchHistoricalData(historicalRange, false);
    }, STATISTICS_REFRESH_INTERVAL);

    return () => {
      if (statsTreeInterval) clearInterval(statsTreeInterval);
      clearInterval(historicalDataInterval);
    };
  }, [fetchStatsTree, fetchHistoricalData, historicalRange, amuleConfigEnabled]);

  // Check if we have data to render charts
  const hasSpeedData = speedData?.data?.length > 0;
  const hasHistoricalData = historicalData?.data?.length > 0;

  // Loader placeholder for charts without data
  const chartLoader = h('div', { className: 'h-full flex items-center justify-center' },
    h('div', { className: 'loader' })
  );

  // Helper to render chart content with loading state - only creates chart element when data exists
  const renderSpeedChart = (clientType) => {
    if (!shouldRenderCharts || !hasSpeedData) return chartLoader;
    return h(Suspense, { fallback: chartLoader },
      h(ClientSpeedChart, { speedData, clientType, theme, historicalRange })
    );
  };

  const renderTransferChart = (clientType) => {
    if (!shouldRenderCharts || !hasHistoricalData) return chartLoader;
    return h(Suspense, { fallback: chartLoader },
      h(ClientTransferChart, { historicalData, clientType, theme, historicalRange })
    );
  };

  // Helper to create chart title with icon
  const chartTitle = (title, icon) => h('span', { className: 'flex items-center gap-2' },
    h(ClientIcon, { clientType: icon, size: 16 }),
    title
  );

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
        h('div', { className: 'loader' }),
        h('p', { className: 'text-sm text-gray-500 dark:text-gray-400 mt-2' }, 'Loading historical data...')
      ),

      // Charts content (always rendered, dimmed when loading)
      h('div', { className: loadingHistory ? 'opacity-50 pointer-events-none' : '' },
        // BOTH CLIENTS: Show toggle-controlled charts
        showBothCharts && h(React.Fragment, null,
          // Speed charts (when chartMode === 'speed')
          chartMode === 'speed' && h(React.Fragment, null,
            h(DashboardChartWidget, {
              title: chartTitle('aMule Speed', 'amule'),
              height: '225px'
            }, renderSpeedChart('amule')),
            h(DashboardChartWidget, {
              title: chartTitle('rTorrent Speed', 'rtorrent'),
              height: '225px'
            }, renderSpeedChart('rtorrent'))
          ),
          // Transfer charts (when chartMode === 'transfer')
          chartMode === 'transfer' && h(React.Fragment, null,
            h(DashboardChartWidget, {
              title: chartTitle('aMule Data Transferred', 'amule'),
              height: '225px'
            }, renderTransferChart('amule')),
            h(DashboardChartWidget, {
              title: chartTitle('rTorrent Data Transferred', 'rtorrent'),
              height: '225px'
            }, renderTransferChart('rtorrent'))
          )
        ),

        // SINGLE CLIENT: Show both chart types (no toggle needed)
        showSingleClient && h(React.Fragment, null,
          h(DashboardChartWidget, {
            title: chartTitle(`${singleClientName} Speed`, singleClientType),
            height: '225px'
          }, renderSpeedChart(singleClientType)),
          h(DashboardChartWidget, {
            title: chartTitle(`${singleClientName} Data Transferred`, singleClientType),
            height: '225px'
          }, renderTransferChart(singleClientType))
        )
      )
    ),

    // ED2K Statistics Tree button (only when aMule is connected and enabled)
    showAmuleStatsTree && h('div', { className: 'flex justify-center pt-2' },
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
      onClose: () => setShowStatsTreeModal(false),
      statsTree,
      loading: statsTree === null,
      expandedNodes: statsTreeExpandedNodes,
      onExpandedNodesChange: setStatsTreeExpandedNodes
    })
  );
};

export default StatisticsView;
