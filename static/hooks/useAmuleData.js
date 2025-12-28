/**
 * useAmuleData Hook
 *
 * Centralizes all data fetching operations for aMule
 */

import { useCallback } from 'https://esm.sh/react@18.2.0';

/**
 * Custom hook for aMule data fetching operations
 * @param {function} sendMessage - WebSocket message sender
 * @param {function} setLoading - Loading state setter
 * @returns {object} All fetch functions
 */
export const useAmuleData = (sendMessage, setLoading) => {
  const fetchDownloads = useCallback(async () => {
    setLoading(true);
    sendMessage({ action: 'getDownloads' });
    //setTimeout(() => setLoading(false), 1000);
  }, [sendMessage, setLoading]);

  const fetchPreviousSearchResults = useCallback(async () => {
    sendMessage({ action: 'getPreviousSearchResults' });
  }, [sendMessage]);

  const fetchShared = useCallback(async () => {
    setLoading(true);
    sendMessage({ action: 'getShared' });
    //setTimeout(() => setLoading(false), 1000);
  }, [sendMessage, setLoading]);

  const fetchStats = useCallback(() => {
    sendMessage({ action: 'getStats' });
  }, [sendMessage]);

  const fetchUploads = useCallback(() => {
    setLoading(true);
    sendMessage({ action: 'getUploadingQueue' });
    //setTimeout(() => setLoading(false), 1000);
  }, [sendMessage, setLoading]);

  const fetchLogs = useCallback(() => {
    setLoading(true);
    sendMessage({ action: 'getLog' });
    //setTimeout(() => setLoading(false), 1000);
  }, [sendMessage, setLoading]);

  const fetchServerInfo = useCallback(() => {
    sendMessage({ action: 'getServerInfo' });
  }, [sendMessage]);

  const fetchStatsTree = useCallback(() => {
    setLoading(true);
    sendMessage({ action: 'getStatsTree' });
    //setTimeout(() => setLoading(false), 1000);
  }, [sendMessage, setLoading]);

  const fetchServers = useCallback(() => {
    setLoading(true);
    sendMessage({ action: 'getServersList' });
    //setTimeout(() => setLoading(false), 1000);
  }, [sendMessage, setLoading]);

  const fetchCategories = useCallback(() => {
    sendMessage({ action: 'getCategories' });
  }, [sendMessage]);

  return {
    fetchDownloads,
    fetchPreviousSearchResults,
    fetchShared,
    fetchStats,
    fetchUploads,
    fetchLogs,
    fetchServerInfo,
    fetchStatsTree,
    fetchServers,
    fetchCategories
  };
};
