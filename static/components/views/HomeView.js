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
import { ClientIcon, LoadingSpinner } from '../common/index.js';
import { STATISTICS_REFRESH_INTERVAL } from '../../utils/index.js';
import { useAppState } from '../../contexts/AppStateContext.js';
import { useLiveData } from '../../contexts/LiveDataContext.js';
import { useSearch } from '../../contexts/SearchContext.js';
import { useActions } from '../../contexts/ActionsContext.js';
import { useTheme } from '../../contexts/ThemeContext.js';
import { useClientFilter } from '../../contexts/ClientFilterContext.js';
import { useStaticData } from '../../contexts/StaticDataContext.js';
import { useClientChartConfig } from '../../hooks/useClientChartConfig.js';
import { useCapabilities } from '../../hooks/useCapabilities.js';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout.js';

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
  const { disabledInstances } = useClientFilter();
  const { instances } = useStaticData();
  const { isMobile } = useResponsiveLayout();

  // Compute instanceIds filter param — empty string means all connected (no filter)
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

  // Capability check for conditional widgets
  const { hasCap } = useCapabilities();
  const canViewStats = hasCap('view_statistics');

  // Local dashboard state (previously in AppStateContext)
  const [dashboardState, setDashboardState] = useState({
    speedData: null,
    historicalData: null,
    historicalStats: null,
    loading: false
  });

  // Cache ref for dashboard data
  const lastFetchTime = useRef(0);

  // Fetch dashboard data with caching (skip if user lacks view_statistics capability)
  // On mobile, skip instance filter so the speed chart always shows all instances
  const fetchDashboardData = useCallback(async (force = false, showLoading = false) => {
    if (!canViewStats) return;

    const now = Date.now();
    const CACHE_DURATION = 30000; // 30 seconds cache

    // Skip fetch if data is fresh (unless forced)
    if (!force && now - lastFetchTime.current < CACHE_DURATION) {
      return;
    }

    // Show loading spinner for first load or when explicitly requested (e.g. instance filter change)
    if (lastFetchTime.current === 0 || showLoading) {
      setDashboardState(prev => ({ ...prev, loading: true }));
    }

    try {
      let url = '/api/metrics/dashboard?range=24h';
      if (!isMobile && instanceIdsParam) url += `&instanceIds=${instanceIdsParam}`;
      const response = await fetch(url);
      const { speedData, historicalData, historicalStats } = await response.json();

      setDashboardState({ speedData, historicalData, historicalStats, loading: false });

      lastFetchTime.current = now;
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
      setDashboardState(prev => ({ ...prev, loading: false }));
    }
  }, [instanceIdsParam, canViewStats, isMobile]);

  // Auto-refresh dashboard data when view is active
  useEffect(() => {
    if (appCurrentView !== 'home') return;

    fetchDashboardData();

    const intervalId = setInterval(fetchDashboardData, STATISTICS_REFRESH_INTERVAL);

    return () => clearInterval(intervalId);
  }, [appCurrentView, fetchDashboardData]);

  // Re-fetch with loading indicator when instance filter changes (skip initial mount)
  const filterMountedRef = useRef(false);
  useEffect(() => {
    if (!filterMountedRef.current) { filterMountedRef.current = true; return; }
    fetchDashboardData(true, true);
  }, [instanceIdsParam]); // eslint-disable-line react-hooks/exhaustive-deps

  // Get client chart configuration from hook
  const {
    isLoading: clientConfigLoading,
    networks,
    showBothCharts,
    showSingleClient,
    singleNetworkType,
    singleNetworkName,
    shouldRenderCharts
  } = useClientChartConfig();

  // Aliases for readability
  const stats = dataStats;
  const downloads = useMemo(() => dataItems.filter(i => i.downloading), [dataItems]);
  const onSearchQueryChange = setSearchQuery;
  const onSearchTypeChange = setSearchType;
  const onSearch = actions.search.perform;
  const loadingDashboard = dashboardState.loading;

  return h('div', { className: 'flex-1 flex flex-col py-0 px-2 sm:px-0' },
    // Desktop: Dashboard layout (shown when sidebar is visible at md+)
    h('div', { className: 'hidden md:block' },
      // Dashboard grid
      h('div', { className: 'grid grid-cols-1 sm:grid-cols-6 gap-4 max-w-7xl mx-auto' },
        // Quick Search Widget - Full width at top (hidden if user lacks search capability)
        hasCap('search') && h('div', { className: 'sm:col-span-6' },
          h(QuickSearchWidget, {
            searchType,
            onSearchTypeChange,
            searchQuery,
            onSearchQueryChange,
            onSearch,
            searchLocked
          })
        ),

        // Instance filter banner (shown when some instances are disabled)
        filteredInstanceNames && h('div', { className: 'sm:col-span-6' },
          h('div', {
            className: 'flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-700/40 rounded px-2.5 py-1.5'
          },
            h('svg', { className: 'w-3.5 h-3.5 flex-shrink-0', fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor', strokeWidth: '2' },
              h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', d: 'M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z' })
            ),
            h('span', null, `Showing data for: ${filteredInstanceNames.join(', ')}`)
          )
        ),

        // Charts + Stats section (with loading overlay on instance filter change)
        canViewStats && h('div', { className: 'sm:col-span-6 relative' },
          // Loading overlay (shown on top of content during instance filter reload)
          loadingDashboard && !clientConfigLoading && h('div', { className: 'absolute inset-0 bg-white/70 dark:bg-gray-900/70 z-10 flex items-center justify-center rounded-lg' },
            h(LoadingSpinner, { size: 'sm' })
          ),

          h('div', { className: `grid grid-cols-6 gap-4${loadingDashboard && !clientConfigLoading ? ' opacity-50 pointer-events-none' : ''}` },
            // Loading skeleton charts (shown while waiting for WebSocket data)
            clientConfigLoading && h('div', { className: 'col-span-6 md:col-span-3' },
              h('div', {
                className: 'bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700 animate-pulse'
              },
                h('div', { className: 'h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-3' }),
                h('div', { style: { height: '200px' } })
              )
            ),
            clientConfigLoading && h('div', { className: 'col-span-6 md:col-span-3' },
              h('div', {
                className: 'bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700 animate-pulse'
              },
                h('div', { className: 'h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-3' }),
                h('div', { style: { height: '200px' } })
              )
            ),

            // BOTH/MULTI NETWORK: one speed chart per connected network
            // (aMule / Rucio / BitTorrent). Half-width tiles wrap as needed.
            ...(showBothCharts ? networks.map(n =>
              h('div', { key: `home-speed-${n.type}`, className: 'col-span-6 md:col-span-3' },
                h(DashboardChartWidget, {
                  title: h('span', { className: 'flex items-center gap-2' },
                    h(ClientIcon, { clientType: n.type, size: 16 }),
                    `${n.name} Speed (24h)`
                  ),
                  height: '200px'
                },
                  shouldRenderCharts && dashboardState.speedData
                    ? h(Suspense, {
                        fallback: h('div', {
                          className: 'h-full flex items-center justify-center'
                        },
                          h(LoadingSpinner, { size: 'sm' })
                        )
                      },
                        h(ClientSpeedChart, {
                          speedData: dashboardState.speedData,
                          networkType: n.type,
                          theme,
                          historicalRange: '24h'
                        })
                      )
                    : h('div', { className: 'h-full' })
                )
              )
            ) : []),

            // SINGLE CLIENT: Speed Chart
            showSingleClient && h('div', { className: 'col-span-6 md:col-span-3' },
              h(DashboardChartWidget, {
                title: h('span', { className: 'flex items-center gap-2' },
                  h(ClientIcon, { clientType: singleNetworkType, size: 16 }),
                  `${singleNetworkName} Speed (24h)`
                ),
                height: '200px'
              },
                shouldRenderCharts && dashboardState.speedData
                  ? h(Suspense, {
                      fallback: h('div', {
                        className: 'h-full flex items-center justify-center'
                      },
                        h(LoadingSpinner, { size: 'sm' })
                      )
                    },
                      h(ClientSpeedChart, {
                        speedData: dashboardState.speedData,
                        networkType: singleNetworkType,
                        theme,
                        historicalRange: '24h'
                      })
                    )
                  : h('div', { className: 'h-full' })
              )
            ),

            // SINGLE CLIENT: Data Transferred Chart
            showSingleClient && h('div', { className: 'col-span-6 md:col-span-3' },
              h(DashboardChartWidget, {
                title: h('span', { className: 'flex items-center gap-2' },
                  h(ClientIcon, { clientType: singleNetworkType, size: 16 }),
                  `${singleNetworkName} Data Transferred (24h)`
                ),
                height: '200px'
              },
                shouldRenderCharts && dashboardState.historicalData
                  ? h(Suspense, {
                      fallback: h('div', {
                        className: 'h-full flex items-center justify-center'
                      },
                        h(LoadingSpinner, { size: 'sm' })
                      )
                    },
                      h(ClientTransferChart, {
                        historicalData: dashboardState.historicalData,
                        networkType: singleNetworkType,
                        theme,
                        historicalRange: '24h'
                      })
                    )
                  : h('div', { className: 'h-full' })
              )
            ),

            // 24h Stats Widget (full width)
            h('div', { className: 'col-span-6' },
              h(StatsWidget, {
                stats: dashboardState.historicalStats,
                showPeakSpeeds: true
              })
            )
          )
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
      h('div', { className: 'flex flex-col gap-3' },
        // Quick Search Widget (hidden if user lacks search capability)
        hasCap('search') && h(QuickSearchWidget, {
          searchType,
          onSearchTypeChange,
          searchQuery,
          onSearchQueryChange,
          onSearch,
          searchLocked
        }),

        // Speed chart + Stats (with loading overlay on instance filter change)
        canViewStats && h('div', { className: 'relative' },
          loadingDashboard && h('div', { className: 'absolute inset-0 bg-white/70 dark:bg-gray-900/70 z-10 flex items-center justify-center rounded-lg' },
            h(LoadingSpinner, { size: 'sm' })
          ),
          h('div', { className: `flex flex-col gap-3${loadingDashboard ? ' opacity-50 pointer-events-none' : ''}` },
            // Speed chart with network status (always shows all instances — fetch skips filter on mobile)
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
            })
          )
        ),

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
