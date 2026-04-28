/**
 * StaticDataContext
 *
 * Manages less frequently changing data:
 * - Categories (changes on user action)
 * - Servers list (changes on user action)
 * - Logs (changes on user refresh)
 * - Server info (changes on user refresh)
 * - Stats tree (changes on user refresh)
 * - Downloaded files tracking
 *
 * Separated from LiveDataContext to prevent unnecessary re-renders
 * when frequently-changing data (stats, downloads, uploads, shared files) updates.
 */

import React, { createContext, useContext, useState, useRef, useCallback, useMemo } from 'https://esm.sh/react@18.2.0';

const { createElement: h } = React;

const StaticDataContext = createContext(null);

export const StaticDataProvider = ({ children }) => {
  // Static data state (changes less frequently)
  const [dataServers, setDataServers] = useState([]);
  const [dataCategories, setDataCategories] = useState([]);  // Unified categories (aMule + rtorrent)
  const [clientDefaultPaths, setClientDefaultPaths] = useState({});  // Default paths from clients (keyed by instanceId)
  const [prowlarrEnabled, setProwlarrEnabled] = useState(false);  // Whether prowlarr integration is enabled
  const [knownTrackers, setKnownTrackers] = useState([]);  // Known trackers from rtorrent items
  const [historyTrackUsername, setHistoryTrackUsername] = useState(false);  // Whether to track username in history
  const [hasCategoryPathWarnings, setHasCategoryPathWarnings] = useState(false);  // Whether any category has path issues
  const [instances, setInstances] = useState({});  // Per-instance metadata from backend (keyed by instanceId)
  const [dataLogs, setDataLogs] = useState('');
  const [dataServerInfo, setDataServerInfo] = useState('');
  // App logs: array of structured records emitted by the server's logger.
  // [{ ts: ISO, level: 'info'|'warn'|'error'|'debug', source: string|null, message: string }]
  const [dataAppLogs, setDataAppLogs] = useState([]);
  const [dataAppLogSources, setDataAppLogSources] = useState([]);
  const [dataQbittorrentLogs, setDataQbittorrentLogs] = useState('');
  const [dataStatsTree, setDataStatsTree] = useState(null);
  // Map<hash, Set<instanceId>> — tracks which instances have each download
  const [dataDownloadedFiles, setDataDownloadedFiles] = useState(new Map());
  // Alias map: realHash → displayHash (e.g. torrent info hash → Prowlarr GUID)
  // Used by delete handler to remove both keys from dataDownloadedFiles
  const downloadedAliasRef = useRef(new Map());

  // Loaded flags for static data
  const [dataLoaded, setDataLoaded] = useState({
    servers: false,
    categories: false,
    logs: false,
    serverInfo: false,
    appLogs: false,
    qbittorrentLogs: false
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

  // ED2K links state (for servers view)
  const [dataServersEd2kLinks, setDataServersEd2kLinks] = useState('ed2k://|serverlist|http://upd.emule-security.org/server.met|/');

  // lastEd2kWasServerList - just a ref, no state needed (not used for rendering)
  const lastEd2kWasServerListRef = useRef(false);

  // Set of client types that have >1 connected instance (e.g. two qBittorrent servers)
  const multiInstanceTypes = useMemo(() => {
    const typeCounts = {};
    for (const inst of Object.values(instances)) {
      if (inst.connected) {
        typeCounts[inst.type] = (typeCounts[inst.type] || 0) + 1;
      }
    }
    return new Set(
      Object.entries(typeCounts).filter(([, c]) => c > 1).map(([t]) => t)
    );
  }, [instances]);

  const hasMultiInstance = multiInstanceTypes.size > 0;

  // Derived: is any instance of this type connected?
  const isTypeConnected = useCallback((type) =>
    Object.values(instances).some(i => i.type === type && i.connected),
    [instances]
  );

  // Derived: is any instance of this network type connected?
  const isNetworkTypeConnected = useCallback((networkType) =>
    Object.values(instances).some(i => i.networkType === networkType && i.connected),
    [instances]
  );

  // Derived: is any instance of this type registered (enabled in config)?
  const hasType = useCallback((type) =>
    Object.values(instances).some(i => i.type === type),
    [instances]
  );

  // Derived: get capabilities object for a given instanceId
  const getCapabilities = useCallback((instanceId) =>
    instances[instanceId]?.capabilities || {},
    [instances]
  );

  // Derived: any disconnected instance with an error message?
  const hasClientConnectionWarnings = useMemo(() =>
    Object.values(instances).some(i => !i.connected && i.error),
    [instances]
  );

  // Derived: true when multiple clients are connected (different network types OR multi-instance)
  const multipleClientsConnected = useMemo(() => {
    const connectedNetworkTypes = new Set();
    for (const inst of Object.values(instances)) {
      if (inst.connected) {
        connectedNetworkTypes.add(inst.networkType);
      }
    }
    // Show badges when: multiple network types connected, OR multi-instance of same type
    if (connectedNetworkTypes.size > 1) return true;
    return multiInstanceTypes.size > 0;
  }, [instances, multiInstanceTypes]);

  // Memoize context value to prevent unnecessary re-renders
  const value = useMemo(() => ({
    // State
    dataServers,
    dataCategories,
    clientDefaultPaths,
    prowlarrEnabled,
    knownTrackers,
    historyTrackUsername,
    hasCategoryPathWarnings,

    instances,
    multiInstanceTypes,
    hasMultiInstance,

    // Derived helpers
    isTypeConnected,
    isNetworkTypeConnected,
    hasType,
    getCapabilities,
    hasClientConnectionWarnings,
    multipleClientsConnected,

    dataLogs,
    dataServerInfo,
    dataAppLogs,
    dataAppLogSources,
    dataQbittorrentLogs,
    dataStatsTree,
    dataDownloadedFiles,
    downloadedAliasRef,
    dataServersEd2kLinks,
    dataLoaded,
    lastEd2kWasServerListRef,

    // Setters
    setDataServers,
    setDataCategories,
    setClientDefaultPaths,
    setProwlarrEnabled,
    setKnownTrackers,
    setHistoryTrackUsername,
    setHasCategoryPathWarnings,
    setInstances,
    setDataLogs,
    setDataServerInfo,
    setDataAppLogs,
    setDataAppLogSources,
    setDataQbittorrentLogs,
    setDataStatsTree,
    setDataDownloadedFiles,
    setDataServersEd2kLinks,
    markDataLoaded,
    resetDataLoaded
  }), [
    dataServers, dataCategories, clientDefaultPaths, prowlarrEnabled, knownTrackers,
    historyTrackUsername, hasCategoryPathWarnings, instances, multiInstanceTypes, hasMultiInstance,
    isTypeConnected, isNetworkTypeConnected, hasType, getCapabilities, hasClientConnectionWarnings, multipleClientsConnected,
    dataLogs, dataServerInfo, dataAppLogs, dataQbittorrentLogs, dataStatsTree, dataDownloadedFiles, dataServersEd2kLinks,
    dataLoaded, markDataLoaded, resetDataLoaded
  ]);

  return h(StaticDataContext.Provider, { value }, children);
};

export const useStaticData = () => {
  const context = useContext(StaticDataContext);
  if (!context) {
    throw new Error('useStaticData must be used within StaticDataProvider');
  }
  return context;
};
