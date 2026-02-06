/**
 * DataFetchContext
 *
 * Provides data fetching operations for all views
 * Centralizes all aMule data fetching logic
 */

import React, { createContext, useContext, useCallback, useMemo, useRef, useEffect } from 'https://esm.sh/react@18.2.0';
import { useWebSocketConnection } from './WebSocketContext.js';
import { useStaticData } from './StaticDataContext.js';
import { useLiveData } from './LiveDataContext.js';

const { createElement: h } = React;

const DataFetchContext = createContext(null);

// History refresh interval (5 seconds)
const HISTORY_REFRESH_INTERVAL = 5000;

/**
 * DataFetchProvider - provides data fetching functions through context
 * @param {Object} props
 * @param {ReactNode} props.children - Child components
 */
export const DataFetchProvider = ({ children }) => {
  const { sendMessage } = useWebSocketConnection();
  const { resetDataLoaded: resetStaticDataLoaded, setHistoryTrackUsername } = useStaticData();
  const {
    setDataHistory,
    setHistoryLoading,
    markDataLoaded: markLiveDataLoaded,
    dataLoaded: liveDataLoaded
  } = useLiveData();

  // Track if history auto-refresh is active
  const historyRefreshRef = useRef(null);

  // Fetch all history data from API
  const fetchHistory = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setHistoryLoading(true);
      const response = await fetch('/api/history/all');
      if (!response.ok) throw new Error('Failed to fetch history');
      const data = await response.json();
      setDataHistory(data.entries || []);
      setHistoryTrackUsername(data.trackUsername || false);
    } catch (err) {
      console.error('Error fetching history:', err);
    } finally {
      markLiveDataLoaded('history');
      if (showLoading) setHistoryLoading(false);
    }
  }, [setDataHistory, setHistoryLoading, setHistoryTrackUsername, markLiveDataLoaded]);

  // Start history auto-refresh (called when HistoryView mounts)
  const startHistoryRefresh = useCallback(() => {
    // Initial fetch
    fetchHistory(true);
    // Set up interval for subsequent refreshes (no loading indicator)
    if (historyRefreshRef.current) clearInterval(historyRefreshRef.current);
    historyRefreshRef.current = setInterval(() => fetchHistory(false), HISTORY_REFRESH_INTERVAL);
  }, [fetchHistory]);

  // Stop history auto-refresh (called when HistoryView unmounts)
  const stopHistoryRefresh = useCallback(() => {
    if (historyRefreshRef.current) {
      clearInterval(historyRefreshRef.current);
      historyRefreshRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (historyRefreshRef.current) clearInterval(historyRefreshRef.current);
    };
  }, []);

  const fetchPreviousSearchResults = useCallback(async () => {
    sendMessage({ action: 'getPreviousSearchResults' });
  }, [sendMessage]);

  const refreshSharedFiles = useCallback(async () => {
    sendMessage({ action: 'refreshSharedFiles' });
  }, [sendMessage]);

  const fetchLogs = useCallback(() => {
    resetStaticDataLoaded('logs');
    sendMessage({ action: 'getLog' });
  }, [sendMessage, resetStaticDataLoaded]);

  const fetchServerInfo = useCallback(() => {
    resetStaticDataLoaded('serverInfo');
    sendMessage({ action: 'getServerInfo' });
  }, [sendMessage, resetStaticDataLoaded]);

  const fetchAppLogs = useCallback(() => {
    resetStaticDataLoaded('appLogs');
    sendMessage({ action: 'getAppLog' });
  }, [sendMessage, resetStaticDataLoaded]);

  const fetchStatsTree = useCallback(() => {
    sendMessage({ action: 'getStatsTree' });
  }, [sendMessage]);

  const fetchServers = useCallback(() => {
    resetStaticDataLoaded('servers');
    sendMessage({ action: 'getServersList' });
  }, [sendMessage, resetStaticDataLoaded]);

  const fetchCategories = useCallback(() => {
    resetStaticDataLoaded('categories');
    sendMessage({ action: 'getCategories' });
  }, [sendMessage, resetStaticDataLoaded]);

  // Memoize context value to prevent unnecessary re-renders of consumers
  const value = useMemo(() => ({
    fetchPreviousSearchResults,
    refreshSharedFiles,
    fetchLogs,
    fetchServerInfo,
    fetchAppLogs,
    fetchStatsTree,
    fetchServers,
    fetchCategories,
    fetchHistory,
    startHistoryRefresh,
    stopHistoryRefresh
  }), [
    fetchPreviousSearchResults, refreshSharedFiles,
    fetchLogs, fetchServerInfo, fetchAppLogs, fetchStatsTree,
    fetchServers, fetchCategories, fetchHistory, startHistoryRefresh, stopHistoryRefresh
  ]);

  return h(DataFetchContext.Provider, { value }, children);
};

export const useDataFetch = () => {
  const context = useContext(DataFetchContext);
  if (!context) {
    throw new Error('useDataFetch must be used within DataFetchProvider');
  }
  return context;
};
