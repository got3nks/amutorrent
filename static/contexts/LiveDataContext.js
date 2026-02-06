/**
 * LiveDataContext
 *
 * Manages frequently changing data (updates every few seconds):
 * - Stats (speeds, connection status)
 * - Downloads queue
 * - Uploads queue
 * - Shared files (pushed via WebSocket)
 *
 * Separated from StaticDataContext to prevent unnecessary re-renders
 * of components that only need rarely-changing data like categories.
 */

import React, { createContext, useContext, useState, useCallback, useMemo } from 'https://esm.sh/react@18.2.0';

const { createElement: h } = React;

const LiveDataContext = createContext(null);

export const LiveDataProvider = ({ children }) => {
  // Live data state (changes frequently)
  const [dataStats, setDataStats] = useState(null);

  // Unified items array (replaces separate downloads/shared/uploads)
  const [dataItems, setDataItems] = useState([]);

  // History data (fetched from /api/history/all, refreshes every 5 seconds)
  const [dataHistory, setDataHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Loaded flags for live data
  const [dataLoaded, setDataLoaded] = useState({
    items: false,
    history: false
  });

  // Helper to mark a data type as loaded
  const markDataLoaded = useCallback((dataType) => {
    setDataLoaded(prev => {
      if (prev[dataType] === true) return prev; // No change needed
      return { ...prev, [dataType]: true };
    });
  }, []);

  // Helper to reset a data type's loaded state
  const resetDataLoaded = useCallback((dataType) => {
    setDataLoaded(prev => {
      if (prev[dataType] === false) return prev; // No change needed
      return { ...prev, [dataType]: false };
    });
  }, []);

  // Memoize context value to prevent unnecessary re-renders
  const value = useMemo(() => ({
    // State
    dataStats,
    dataItems,
    dataHistory,
    historyLoading,
    dataLoaded,

    // Setters
    setDataStats,
    setDataItems,
    setDataHistory,
    setHistoryLoading,
    markDataLoaded,
    resetDataLoaded
  }), [dataStats, dataItems, dataHistory, historyLoading, dataLoaded, markDataLoaded, resetDataLoaded]);

  return h(LiveDataContext.Provider, { value }, children);
};

export const useLiveData = () => {
  const context = useContext(LiveDataContext);
  if (!context) {
    throw new Error('useLiveData must be used within LiveDataProvider');
  }
  return context;
};
