/**
 * useClientChartConfig Hook
 *
 * Provides client connection state and chart display configuration
 * Used by HomeView and StatisticsView to determine which charts to show
 *
 * Charts display by network type:
 * - aMule (ED2K/Kademlia)
 * - BitTorrent (rtorrent + qBittorrent combined)
 */

import React from 'https://esm.sh/react@18.2.0';
import { useClientFilter } from '../contexts/ClientFilterContext.js';
import { useLiveData } from '../contexts/LiveDataContext.js';
import { NETWORK_NAMES, NETWORK_ORDER } from '../utils/constants.js';

const { useState, useEffect } = React;

/**
 * Hook that computes chart display configuration based on client connection
 * state and filter settings
 *
 * @returns {object} Chart configuration object with:
 *   - ed2kConnected: boolean - whether ED2K network client is connected
 *   - bittorrentConnected: boolean - whether any BitTorrent client is connected
 *   - isEd2kEnabled: boolean - whether ED2K network is enabled in filter
 *   - isBittorrentEnabled: boolean - whether BitTorrent is enabled in filter
 *   - showBothCharts: boolean - show side-by-side charts for both network types
 *   - showSingleClient: boolean - show single network type charts (full width)
 *   - singleNetworkType: 'ed2k' | 'bittorrent' - which network to show when single
 *   - singleNetworkName: 'aMule' | 'BitTorrent' - display name for single network
 *   - shouldRenderCharts: boolean - deferred rendering state for performance
 */
export const useClientChartConfig = () => {
  const { isNetworkTypeEnabled, isEd2kEnabled, isBittorrentEnabled, ed2kConnected, bittorrentConnected } = useClientFilter();
  const { dataStats } = useLiveData();

  // Check if we're still waiting for WebSocket data
  const isLoading = !dataStats;

  // Networks to chart: every connected+enabled network type, in display order.
  // Each chart reads keys like `${type}UploadSpeed` (built per-networkType by
  // the metrics API), so this scales to any number of networks (ed2k, rucio,
  // bittorrent, ...). Views map over this list rather than branching on 2.
  const networks = NETWORK_ORDER
    .filter(t => isNetworkTypeEnabled(t))
    .map(t => ({ type: t, name: NETWORK_NAMES[t] || t }));

  // Back-compat fields (still consumed by some views) — derived from the list.
  const showBothCharts = networks.length > 1;
  const showSingleClient = networks.length === 1;
  const singleNetworkType = networks[0]?.type || 'ed2k';
  const singleNetworkName = networks[0]?.name || NETWORK_NAMES.ed2k;

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
    networks,
    ed2kConnected,
    bittorrentConnected,
    isEd2kEnabled,
    isBittorrentEnabled,
    showBothCharts,
    showSingleClient,
    singleNetworkType,
    singleNetworkName,
    shouldRenderCharts
  };
};
