/**
 * HomeView Component
 *
 * Main dashboard/home page with navigation and stats widgets
 * Manages its own dashboard state and data fetching
 */

import React from 'https://esm.sh/react@18.2.0';
import {
  DashboardChartWidget,
  ActiveDownloadsWidget,
  ActiveUploadsWidget,
  QuickSearchWidget,
  MobileSpeedWidget,
  StatsWidget
} from '../dashboard/index.js';
import { ClientIcon } from '../common/index.js';
import { STATISTICS_REFRESH_INTERVAL } from '../../utils/index.js';
import { useAppState } from '../../contexts/AppStateContext.js';
import { useLiveData } from '../../contexts/LiveDataContext.js';
import { useSearch } from '../../contexts/SearchContext.js';
import { useActions } from '../../contexts/ActionsContext.js';
import { useTheme } from '../../contexts/ThemeContext.js';
import { useClientChartConfig } from '../../hooks/useClientChartConfig.js';

const { createElement: h, useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } = React;

// Lazy load chart components for better initial page load performance
const ClientSpeedChart = lazy(() => import('../common/ClientSpeedChart.js'));
const ClientTransferChart = lazy(() => import('../common/ClientTransferChart.js'));

/**
 * Home view component - self-contained with its own dashboard state
 */
const HomeView = () => {
  // Get data from contexts
  const { appCurrentView } = useAppState();
  const { dataStats, dataItems, dataLoaded } = useLiveData();
  const { searchQuery, searchType, searchLocked, setSearchQuery, setSearchType } = useSearch();
  const actions = useActions();
  const { theme } = useTheme();

  // Local dashboard state (previously in AppStateContext)
  const [dashboardState, setDashboardState] = useState({
    speedData: null,
    historicalData: null,
    historicalStats: null,
    loading: false
  });

  // Cache ref for dashboard data
  const lastFetchTime = useRef(0);

  // Fetch dashboard data with caching
  const fetchDashboardData = useCallback(async (force = false) => {
    const now = Date.now();
    const CACHE_DURATION = 30000; // 30 seconds cache

    // Skip fetch if data is fresh (unless forced)
    if (!force && now - lastFetchTime.current < CACHE_DURATION) {
      return;
    }

    // Don't show loading spinner for background refreshes (only for first load)
    const isFirstLoad = lastFetchTime.current === 0;
    if (isFirstLoad) {
      setDashboardState(prev => ({ ...prev, loading: true }));
    }

    try {
      const response = await fetch('/api/metrics/dashboard?range=24h');
      const { speedData, historicalData, historicalStats } = await response.json();

      setDashboardState({
        speedData,
        historicalData,
        historicalStats,
        loading: false
      });

      lastFetchTime.current = now;
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
      setDashboardState(prev => ({ ...prev, loading: false }));
    }
  }, []);

  // Auto-refresh dashboard data when view is active
  useEffect(() => {
    if (appCurrentView !== 'home') return;

    fetchDashboardData();

    const intervalId = setInterval(fetchDashboardData, STATISTICS_REFRESH_INTERVAL);

    return () => clearInterval(intervalId);
  }, [appCurrentView, fetchDashboardData]);

  // Get client chart configuration from hook
  const {
    isLoading: clientConfigLoading,
    showBothCharts,
    showSingleClient,
    singleClientType,
    singleClientName,
    shouldRenderCharts
  } = useClientChartConfig();

  // Aliases for readability
  const stats = dataStats;
  const downloads = useMemo(() => dataItems.filter(i => i.downloading), [dataItems]);
  const onSearchQueryChange = setSearchQuery;
  const onSearchTypeChange = setSearchType;
  const onSearch = actions.search.perform;

  return h('div', { className: 'flex-1 flex flex-col py-0 px-2 sm:px-0' },
    // Desktop: Dashboard layout (shown when sidebar is visible at md+)
    h('div', { className: 'hidden md:block' },
      // Dashboard grid
      h('div', { className: 'grid grid-cols-1 sm:grid-cols-6 gap-4 max-w-7xl mx-auto' },
        // Quick Search Widget - Full width at top
        h('div', { className: 'sm:col-span-6' },
          h(QuickSearchWidget, {
            searchType,
            onSearchTypeChange,
            searchQuery,
            onSearchQueryChange,
            onSearch,
            searchLocked
          })
        ),

        // Loading skeleton charts (shown while waiting for WebSocket data)
        clientConfigLoading && h('div', { className: 'sm:col-span-6 md:col-span-3' },
          h('div', {
            className: 'bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700 animate-pulse'
          },
            h('div', { className: 'h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-3' }),
            h('div', { className: 'flex items-center justify-center', style: { height: '200px' } },
              h('div', { className: 'loader' })
            )
          )
        ),
        clientConfigLoading && h('div', { className: 'sm:col-span-6 md:col-span-3' },
          h('div', {
            className: 'bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700 animate-pulse'
          },
            h('div', { className: 'h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-3' }),
            h('div', { className: 'flex items-center justify-center', style: { height: '200px' } },
              h('div', { className: 'loader' })
            )
          )
        ),

        // BOTH CLIENTS: aMule Speed Chart
        showBothCharts && h('div', { className: 'sm:col-span-6 md:col-span-3' },
          h(DashboardChartWidget, {
            title: h('span', { className: 'flex items-center gap-2' },
              h(ClientIcon, { clientType: 'amule', size: 16 }),
              'aMule Speed (24h)'
            ),
            height: '200px'
          },
            shouldRenderCharts && dashboardState.speedData
              ? h(Suspense, {
                  fallback: h('div', {
                    className: 'h-full flex items-center justify-center'
                  },
                    h('div', { className: 'loader' })
                  )
                },
                  h(ClientSpeedChart, {
                    speedData: dashboardState.speedData,
                    clientType: 'amule',
                    theme,
                    historicalRange: '24h'
                  })
                )
              : h('div', {
                  className: 'h-full flex items-center justify-center'
                },
                  h('div', { className: 'loader' })
                )
          )
        ),

        // BOTH CLIENTS: rTorrent Speed Chart
        showBothCharts && h('div', { className: 'sm:col-span-6 md:col-span-3' },
          h(DashboardChartWidget, {
            title: h('span', { className: 'flex items-center gap-2' },
              h(ClientIcon, { clientType: 'rtorrent', size: 16 }),
              'rTorrent Speed (24h)'
            ),
            height: '200px'
          },
            shouldRenderCharts && dashboardState.speedData
              ? h(Suspense, {
                  fallback: h('div', {
                    className: 'h-full flex items-center justify-center'
                  },
                    h('div', { className: 'loader' })
                  )
                },
                  h(ClientSpeedChart, {
                    speedData: dashboardState.speedData,
                    clientType: 'rtorrent',
                    theme,
                    historicalRange: '24h'
                  })
                )
              : h('div', {
                  className: 'h-full flex items-center justify-center'
                },
                  h('div', { className: 'loader' })
                )
          )
        ),

        // SINGLE CLIENT: Speed Chart
        showSingleClient && h('div', { className: 'sm:col-span-6 md:col-span-3' },
          h(DashboardChartWidget, {
            title: h('span', { className: 'flex items-center gap-2' },
              h(ClientIcon, { clientType: singleClientType, size: 16 }),
              `${singleClientName} Speed (24h)`
            ),
            height: '200px'
          },
            shouldRenderCharts && dashboardState.speedData
              ? h(Suspense, {
                  fallback: h('div', {
                    className: 'h-full flex items-center justify-center'
                  },
                    h('div', { className: 'loader' })
                  )
                },
                  h(ClientSpeedChart, {
                    speedData: dashboardState.speedData,
                    clientType: singleClientType,
                    theme,
                    historicalRange: '24h'
                  })
                )
              : h('div', {
                  className: 'h-full flex items-center justify-center'
                },
                  h('div', { className: 'loader' })
                )
          )
        ),

        // SINGLE CLIENT: Data Transferred Chart
        showSingleClient && h('div', { className: 'sm:col-span-6 md:col-span-3' },
          h(DashboardChartWidget, {
            title: h('span', { className: 'flex items-center gap-2' },
              h(ClientIcon, { clientType: singleClientType, size: 16 }),
              `${singleClientName} Data Transferred (24h)`
            ),
            height: '200px'
          },
            shouldRenderCharts && dashboardState.historicalData
              ? h(Suspense, {
                  fallback: h('div', {
                    className: 'h-full flex items-center justify-center'
                  },
                    h('div', { className: 'loader' })
                  )
                },
                  h(ClientTransferChart, {
                    historicalData: dashboardState.historicalData,
                    clientType: singleClientType,
                    theme,
                    historicalRange: '24h'
                  })
                )
              : h('div', {
                  className: 'h-full flex items-center justify-center'
                },
                  h('div', { className: 'loader' })
                )
          )
        ),


        // 24h Stats Widget (full width)
        h('div', { className: 'sm:col-span-6' },
          h(StatsWidget, {
            stats: dashboardState.historicalStats,
            showPeakSpeeds: true
          })
        ),

        // Active Downloads Widget (half width)
        h('div', { className: 'sm:col-span-3' },
          h(ActiveDownloadsWidget, {
            downloads,
            maxItems: 50,
            loading: !dataLoaded.items
          })
        ),

        // Active Uploads Widget (half width)
        h('div', { className: 'sm:col-span-3' },
          h(ActiveUploadsWidget, {
            items: dataItems,
            maxItems: 50,
            loading: !dataLoaded.items
          })
        )
      )
    ),

    // Mobile: Dashboard widgets (similar to desktop but optimized for mobile)
    // Shown below md breakpoint where sidebar is hidden
    h('div', { className: 'md:hidden flex-1 flex flex-col overflow-y-auto' },
      // Inner wrapper with my-auto to center content vertically when container is larger
      h('div', { className: 'flex flex-col gap-3 my-auto' },
        // Quick Search Widget
        h(QuickSearchWidget, {
          searchType,
          onSearchTypeChange,
          searchQuery,
          onSearchQueryChange,
          onSearch,
          searchLocked
        }),

        // Speed chart with network status
        h(MobileSpeedWidget, {
          speedData: dashboardState.speedData,
          stats,
          theme
        }),

        // 24h Stats (compact, no peak speeds)
        h(StatsWidget, {
          stats: dashboardState.historicalStats,
          showPeakSpeeds: false,
          compact: true
        }),

        // Active Downloads
        h(ActiveDownloadsWidget, {
          downloads,
          maxItems: 50,
          compact: true,
          loading: !dataLoaded.items
        }),

        // Active Uploads
        h(ActiveUploadsWidget, {
          items: dataItems,
          maxItems: 50,
          compact: true,
          loading: !dataLoaded.items
        })
      )
    )
  );
};

// Note: React.memo doesn't help much here since we're using contexts
// Context changes will trigger re-renders regardless of props
// The solution is to optimize the context structure or split into smaller components
export default HomeView;
