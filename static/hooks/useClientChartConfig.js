/**
 * useClientChartConfig Hook
 *
 * Provides client connection state and chart display configuration
 * Used by HomeView and StatisticsView to determine which charts to show
 */

import React from 'https://esm.sh/react@18.2.0';
import { useClientFilter } from '../contexts/ClientFilterContext.js';
import { useLiveData } from '../contexts/LiveDataContext.js';

const { useState, useEffect } = React;

/**
 * Hook that computes chart display configuration based on client connection
 * state and filter settings
 *
 * @returns {object} Chart configuration object with:
 *   - amuleConnected: boolean - whether aMule client is connected
 *   - rtorrentConnected: boolean - whether rTorrent client is connected
 *   - showBothCharts: boolean - show side-by-side charts for both clients
 *   - showSingleClient: boolean - show single client charts (full width)
 *   - singleClientType: 'amule' | 'rtorrent' - which client to show when single
 *   - singleClientName: 'aMule' | 'rTorrent' - display name for single client
 *   - shouldRenderCharts: boolean - deferred rendering state for performance
 */
export const useClientChartConfig = () => {
  const { isAmuleEnabled, isRtorrentEnabled, amuleConnected, rtorrentConnected } = useClientFilter();
  const { dataStats } = useLiveData();

  // Check if we're still waiting for WebSocket data
  const isLoading = !dataStats;

  // Determine chart display mode (isXEnabled includes connection check)
  const showBothCharts = isAmuleEnabled && isRtorrentEnabled;
  const showSingleAmule = isAmuleEnabled && !isRtorrentEnabled;
  const showSingleRtorrent = isRtorrentEnabled && !isAmuleEnabled;
  const showSingleClient = showSingleAmule || showSingleRtorrent;
  const singleClientType = showSingleAmule ? 'amule' : 'rtorrent';
  const singleClientName = showSingleAmule ? 'aMule' : 'rTorrent';

  // Defer chart rendering until after initial paint for better performance
  const [shouldRenderCharts, setShouldRenderCharts] = useState(false);
  useEffect(() => {
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(() => setShouldRenderCharts(true));
    } else {
      setTimeout(() => setShouldRenderCharts(true), 0);
    }
  }, []);

  return {
    isLoading,
    amuleConnected,
    rtorrentConnected,
    isAmuleEnabled,
    isRtorrentEnabled,
    showBothCharts,
    showSingleClient,
    singleClientType,
    singleClientName,
    shouldRenderCharts
  };
};
