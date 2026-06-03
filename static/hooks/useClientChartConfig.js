/**
 * useClientChartConfig Hook
 *
 * Provides client connection state and chart display configuration
 * Used by HomeView and StatisticsView to determine which charts to show
 *
 * Charts display by network type:
 * - aMule (ED2K/Kademlia)
 * - BitTorrent (rtorrent + qBittorrent combined)
 * - Soulseek (slskd)
 */

import React from 'https://esm.sh/react@18.2.0';
import { useClientFilter } from '../contexts/ClientFilterContext.js';
import { useLiveData } from '../contexts/LiveDataContext.js';

const { useState, useEffect } = React;

const NETWORK_INFO = {
  ed2k: { type: 'ed2k', client: 'ed2k', label: 'aMule' },
  bittorrent: { type: 'bittorrent', client: 'bittorrent', label: 'BitTorrent' },
  soulseek: { type: 'soulseek', client: 'soulseek', label: 'Soulseek' }
};

/**
 * Hook that computes chart display configuration based on client connection
 * state and filter settings
 *
 * @returns {object} Chart configuration object with:
 *   - ed2kConnected: boolean - whether ED2K network client is connected
 *   - bittorrentConnected: boolean - whether any BitTorrent client is connected
 *   - soulseekConnected: boolean - whether any Soulseek client is connected
 *   - isEd2kEnabled: boolean - whether ED2K network is enabled in filter
 *   - isBittorrentEnabled: boolean - whether BitTorrent is enabled in filter
 *   - isSoulseekEnabled: boolean - whether Soulseek network is enabled in filter
 *   - visibleNetworkTypes: string[] - enabled network types in display order
 *   - visibleNetworkInfo: object[] - metadata for the visible network types
 *   - showBothCharts: boolean - show multi-network charts
 *   - showSingleClient: boolean - show single network type charts (full width)
 *   - singleNetworkType: 'ed2k' | 'bittorrent' | 'soulseek' | null - which network to show when single
 *   - singleNetworkName: 'aMule' | 'BitTorrent' | 'Soulseek' | null - display name for single network
 *   - shouldRenderCharts: boolean - deferred rendering state for performance
 */
export const useClientChartConfig = () => {
  const {
    isEd2kEnabled,
    isBittorrentEnabled,
    isSoulseekEnabled,
    ed2kConnected,
    bittorrentConnected,
    soulseekConnected
  } = useClientFilter();
  const { dataStats } = useLiveData();

  // Check if we're still waiting for WebSocket data
  const isLoading = !dataStats;

  // Determine chart display mode (isXEnabled includes connection check)
  const visibleNetworkTypes = ['ed2k', 'bittorrent', 'soulseek'].filter((type) => {
    if (type === 'ed2k') return isEd2kEnabled;
    if (type === 'bittorrent') return isBittorrentEnabled;
    return isSoulseekEnabled;
  });

  const visibleNetworkInfo = visibleNetworkTypes.map(type => NETWORK_INFO[type]).filter(Boolean);
  const showBothCharts = visibleNetworkInfo.length > 1;
  const showSingleClient = visibleNetworkInfo.length === 1;
  const singleNetworkType = showSingleClient ? visibleNetworkInfo[0].type : null;
  const singleNetworkName = showSingleClient ? visibleNetworkInfo[0].label : null;

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
    ed2kConnected,
    bittorrentConnected,
    soulseekConnected,
    isEd2kEnabled,
    isBittorrentEnabled,
    isSoulseekEnabled,
    visibleNetworkTypes,
    visibleNetworkInfo,
    showBothCharts,
    showSingleClient,
    singleNetworkType,
    singleNetworkName,
    shouldRenderCharts
  };
};
