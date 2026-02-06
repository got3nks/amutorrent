/**
 * LogsView Component
 *
 * Displays application logs and server information
 * Uses contexts directly for all data and actions
 */

import React from 'https://esm.sh/react@18.2.0';

import { LOGS_REFRESH_INTERVAL } from '../../utils/index.js';
import { useStaticData } from '../../contexts/StaticDataContext.js';
import { useDataFetch } from '../../contexts/DataFetchContext.js';
import { useFontSize } from '../../contexts/FontSizeContext.js';

const { createElement: h, useRef, useEffect, useCallback } = React;

/**
 * Logs view component - now uses contexts directly
 */
const LogsView = () => {
  // Get data from contexts
  const { dataLogs, dataServerInfo, dataAppLogs, dataLoaded, clientsEnabled } = useStaticData();
  const { fetchLogs, fetchServerInfo, fetchAppLogs } = useDataFetch();
  const { fontSize } = useFontSize();
  const amuleEnabled = clientsEnabled?.amule !== false;

  // Refs for auto-scrolling
  const logsRef = useRef(null);
  const serverInfoRef = useRef(null);
  const appLogsRef = useRef(null);

  // Track whether user has scrolled away from bottom (per section)
  const userScrolledAwayLogs = useRef(false);
  const userScrolledAwayServerInfo = useRef(false);
  const userScrolledAwayAppLogs = useRef(false);

  // Scroll handlers — update "scrolled away" state per section
  const handleLogsScroll = useCallback(() => {
    if (!logsRef.current) return;
    const el = logsRef.current;
    userScrolledAwayLogs.current = el.scrollHeight - el.scrollTop - el.clientHeight > 30;
  }, []);
  const handleServerInfoScroll = useCallback(() => {
    if (!serverInfoRef.current) return;
    const el = serverInfoRef.current;
    userScrolledAwayServerInfo.current = el.scrollHeight - el.scrollTop - el.clientHeight > 30;
  }, []);
  const handleAppLogsScroll = useCallback(() => {
    if (!appLogsRef.current) return;
    const el = appLogsRef.current;
    userScrolledAwayAppLogs.current = el.scrollHeight - el.scrollTop - el.clientHeight > 30;
  }, []);

  // Aliases for readability
  const logs = dataLogs;
  const serverInfo = dataServerInfo;
  const appLogs = dataAppLogs;

  // Fetch logs and server info on mount with auto-refresh
  useEffect(() => {
    if (amuleEnabled) {
      fetchLogs();
      fetchServerInfo();
    }
    fetchAppLogs();

    const intervalId = setInterval(() => {
      if (amuleEnabled) {
        fetchLogs();
        fetchServerInfo();
      }
      fetchAppLogs();
    }, LOGS_REFRESH_INTERVAL);

    return () => clearInterval(intervalId);
  }, [fetchLogs, fetchServerInfo, fetchAppLogs, amuleEnabled]);

  // Auto-scroll to bottom when new logs arrive, loading completes, or font size changes
  // Only auto-scroll if user hasn't scrolled away from bottom
  useEffect(() => {
    if (logsRef.current && dataLoaded.logs && !userScrolledAwayLogs.current) {
      const timeoutId = setTimeout(() => {
        if (logsRef.current) {
          logsRef.current.scrollTop = logsRef.current.scrollHeight;
        }
      }, 50);
      return () => clearTimeout(timeoutId);
    }
  }, [logs, dataLoaded.logs, fontSize]);

  useEffect(() => {
    if (serverInfoRef.current && dataLoaded.serverInfo && !userScrolledAwayServerInfo.current) {
      const timeoutId = setTimeout(() => {
        if (serverInfoRef.current) {
          serverInfoRef.current.scrollTop = serverInfoRef.current.scrollHeight;
        }
      }, 50);
      return () => clearTimeout(timeoutId);
    }
  }, [serverInfo, dataLoaded.serverInfo, fontSize]);

  useEffect(() => {
    if (appLogsRef.current && dataLoaded.appLogs && !userScrolledAwayAppLogs.current) {
      const timeoutId = setTimeout(() => {
        if (appLogsRef.current) {
          appLogsRef.current.scrollTop = appLogsRef.current.scrollHeight;
        }
      }, 50);
      return () => clearTimeout(timeoutId);
    }
  }, [appLogs, dataLoaded.appLogs, fontSize]);

  return h('div', { className: 'space-y-2 sm:space-y-3 px-2 sm:px-0' },
    // App Logs Section (aMule Controller logs)
    h('div', { className: 'bg-gray-50 dark:bg-gray-700 rounded-lg p-3' },
      h('h3', { className: 'text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2' }, 'App Logs'),
      h('div', {
        ref: appLogsRef,
        onScroll: handleAppLogsScroll,
        className: `bg-white dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600 p-3 ${amuleEnabled ? 'max-h-48 sm:max-h-96' : 'max-h-[calc(100vh-16rem)]'} overflow-y-auto log-text`
      },
        (!dataLoaded.appLogs && !appLogs)
          ? h('span', { className: 'text-gray-400 dark:text-gray-500 italic' }, 'Loading app logs...')
          : (appLogs || h('span', { className: 'text-gray-400 dark:text-gray-500 italic' }, 'No app logs available'))
      )
    ),

    // aMule Logs Section (only when aMule is enabled)
    amuleEnabled && h('div', { className: 'bg-gray-50 dark:bg-gray-700 rounded-lg p-3' },
      h('h3', { className: 'text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2' }, 'aMule Logs'),
      h('div', {
        ref: logsRef,
        onScroll: handleLogsScroll,
        className: 'bg-white dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600 p-3 max-h-48 overflow-y-auto log-text'
      },
        // Only show loading on first load; once we have logs, keep showing them during refresh
        (!dataLoaded.logs && !logs)
          ? h('span', { className: 'text-gray-400 dark:text-gray-500 italic' }, 'Loading aMule logs...')
          : (logs || h('span', { className: 'text-gray-400 dark:text-gray-500 italic' }, 'No aMule logs available'))
      )
    ),

    // ED2K Server Logs Section (only when aMule is enabled)
    amuleEnabled && h('div', { className: 'bg-gray-50 dark:bg-gray-700 rounded-lg p-3' },
      h('h3', { className: 'text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2' }, 'ED2K Server Info'),
      h('div', {
        ref: serverInfoRef,
        onScroll: handleServerInfoScroll,
        className: 'bg-white dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600 p-3 max-h-48 overflow-y-auto log-text'
      },
        // Only show loading on first load; once we have server info, keep showing it during refresh
        (!dataLoaded.serverInfo && !serverInfo)
          ? h('span', { className: 'text-gray-400 dark:text-gray-500 italic' }, 'Loading server logs...')
          : (serverInfo || h('span', { className: 'text-gray-400 dark:text-gray-500 italic' }, 'No server logs available'))
      )
    )
  );
};

export default LogsView;
