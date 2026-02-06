/**
 * WebSocketContext
 *
 * Manages WebSocket connection and message handling
 * Routes incoming messages to appropriate context setters
 */

import React, { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from 'https://esm.sh/react@18.2.0';
import { useAppState } from './AppStateContext.js';
import { useLiveData } from './LiveDataContext.js';
import { useStaticData } from './StaticDataContext.js';
import { useSearch } from './SearchContext.js';
import { useAuth } from './AuthContext.js';

const { createElement: h } = React;

const WebSocketContext = createContext(null);

export const WebSocketProvider = ({ children }) => {
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const handleMessageRef = useRef(null);

  // Dynamic message handlers - allows components to subscribe to specific message types
  const dynamicHandlersRef = useRef(new Set());

  // Add a dynamic message handler
  const addMessageHandler = useCallback((handler) => {
    dynamicHandlersRef.current.add(handler);
  }, []);

  // Remove a dynamic message handler
  const removeMessageHandler = useCallback((handler) => {
    dynamicHandlersRef.current.delete(handler);
  }, []);

  // Get auth state
  const { authEnabled, isAuthenticated } = useAuth();

  // Get setters from other contexts
  const {
    setAppCurrentView,
    setAppPage,
    addAppError,
    addAppSuccess
  } = useAppState();

  // Get setters from LiveDataContext (frequently changing)
  const {
    setDataStats,
    setDataItems,
    markDataLoaded: markLiveDataLoaded
  } = useLiveData();

  // Get setters from StaticDataContext (less frequently changing)
  const {
    setDataServers,
    setDataCategories,
    setClientDefaultPaths,
    setClientsEnabled,
    setClientsConnected,
    setKnownTrackers,
    setHistoryTrackUsername,
    setHasCategoryPathWarnings,
    setDataLogs,
    setDataServerInfo,
    setDataAppLogs,
    setDataStatsTree,
    setDataServersEd2kLinks,
    markDataLoaded: markStaticDataLoaded,
    resetDataLoaded: resetStaticDataLoaded,
    lastEd2kWasServerListRef
  } = useStaticData();

  const {
    setSearchPreviousResults,
    setSearchPreviousResultsLoaded,
    setSearchLocked,
    setSearchResults,
    setSearchNoResultsError
  } = useSearch();

  // Send message through WebSocket
  const sendMessage = useCallback((message) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket is not connected. Message not sent:', message);
    }
  }, []);

  // Handle incoming WebSocket messages
  const handleMessage = useCallback((data) => {
    // Only process messages if authenticated or auth is disabled
    if (authEnabled && !isAuthenticated) {
      return;
    }

    // Helper for batch operation completion (success and error handling)
    const handleBatchComplete = (actionName) => {
      const results = data.results || [];
      const failures = results.filter(r => !r.success);
      const successes = results.filter(r => r.success);

      if (failures.length > 0) {
        const truncate = (s, max = 35) => s && s.length > max ? s.slice(0, max) + '…' : s;
        const details = failures.map(f => f.fileName ? `• ${truncate(f.fileName)}: "${f.error || 'unknown error'}"` : `• ${f.error}`).filter(Boolean);
        const msg = details.length > 0
          ? `Failed ${failures.length} ${actionName} action(s) on:\n${details.join('\n')}`
          : `Failed ${failures.length} ${actionName} action(s)`;
        addAppError(msg);
      }

      if (successes.length > 0) {
        const actionVerb = actionName === 'delete' ? 'Deleted' :
                          actionName === 'pause' ? 'Paused' :
                          actionName === 'resume' ? 'Resumed' :
                          actionName === 'download' ? 'Downloading' :
                          actionName === 'category change' ? 'Changed category for' :
                          actionName === 'label change' ? 'Changed label for' : 'Completed';
        addAppSuccess(`${actionVerb} ${successes.length} file${successes.length > 1 ? 's' : ''}`);
      }
    };

    const messageHandlers = {
      // Batch update - single message with multiple data types (reduces re-renders)
      'batch-update': () => {
        const batch = data.data;
        if (!batch) return;

        // Update all available data in one handler call
        // React 18 batches these setState calls within the same event
        if (batch.stats !== undefined) {
          setDataStats(batch.stats);
          // Update clientsEnabled separately (rarely changes, prevents unnecessary re-renders)
          if (batch.stats.clientsEnabled) {
            setClientsEnabled(prev => {
              const newEnabled = batch.stats.clientsEnabled;
              if (prev.amule === newEnabled.amule &&
                  prev.rtorrent === newEnabled.rtorrent &&
                  prev.prowlarr === newEnabled.prowlarr) {
                return prev; // Keep same reference
              }
              return newEnabled;
            });
          }
          // Update clientsConnected separately (connection status, changes less frequently than stats)
          if (batch.stats.clients) {
            setClientsConnected(prev => {
              const newConnected = batch.stats.clients;
              if (prev.amule === newConnected.amule &&
                  prev.rtorrent === newConnected.rtorrent) {
                return prev; // Keep same reference
              }
              return newConnected;
            });
          }
          // Update historyTrackUsername if present in stats
          if (batch.stats.historyTrackUsername !== undefined) {
            setHistoryTrackUsername(prev => {
              if (prev === batch.stats.historyTrackUsername) return prev;
              return batch.stats.historyTrackUsername;
            });
          }
        }
        if (batch.categories !== undefined) {
          // Only update if categories actually changed (prevents unnecessary re-renders)
          // Categories are now unified (aMule + rtorrent), pushed every 5s but rarely change
          setDataCategories(prev => {
            const newCats = batch.categories || [];
            // Quick check: same length and same names = no change
            if (prev.length === newCats.length &&
                prev.every((cat, i) => cat.name === newCats[i]?.name && cat.title === newCats[i]?.title)) {
              return prev; // Keep same reference
            }
            return newCats;
          });
          markStaticDataLoaded('categories');
        }
        if (batch.clientDefaultPaths !== undefined) {
          // Only update if paths actually changed
          setClientDefaultPaths(prev => {
            const newPaths = batch.clientDefaultPaths || {};
            if (prev.amule === newPaths.amule && prev.rtorrent === newPaths.rtorrent) {
              return prev; // Keep same reference
            }
            return newPaths;
          });
        }
        if (batch.hasPathWarnings !== undefined) {
          // Only update if value actually changed
          setHasCategoryPathWarnings(prev => {
            if (prev === batch.hasPathWarnings) return prev;
            return batch.hasPathWarnings;
          });
        }
        if (batch.items !== undefined) {
          setDataItems(batch.items || []);
          markLiveDataLoaded('items');
        }

        // Extract unique trackers from unified items
        const trackerSet = new Set();
        if (batch.items) {
          batch.items.forEach(item => { if (item.tracker) trackerSet.add(item.tracker); });
        }

        if (trackerSet.size > 0) {
          setKnownTrackers(prev => {
            const newTrackers = Array.from(trackerSet).sort();
            // Merge with existing trackers (trackers may come from different batches)
            const merged = new Set([...prev, ...newTrackers]);
            const mergedArray = Array.from(merged).sort();
            // Only update if changed (prevents unnecessary re-renders)
            if (mergedArray.length === prev.length &&
                mergedArray.every((t, i) => t === prev[i])) {
              return prev;
            }
            return mergedArray;
          });
        }
      },
      'previous-search-results': () => {
        setSearchPreviousResults(data.data || []);
        setSearchPreviousResultsLoaded(true);
      },
      'search-lock': () => setSearchLocked(data.locked),
      'search-results': () => {
        if (!data.data || data.data.length === 0) {
          setSearchNoResultsError();
        } else {
          setSearchResults(data.data);
          setAppCurrentView('search-results');
          setAppPage(0);
        }
      },
      // Batch operation completion handlers - show error only on partial failure
      'batch-download-complete': () => handleBatchComplete('download'),
      // Format: "Failed X action(s) on:\n• file1 - error1\n• file2 - error2"
      'batch-pause-complete': () => handleBatchComplete('pause'),
      'batch-resume-complete': () => handleBatchComplete('resume'),
      'batch-delete-complete': () => handleBatchComplete('delete'),
      'batch-category-changed': () => handleBatchComplete('category change'),
      'batch-label-changed': () => handleBatchComplete('label change'),
      'servers-update': () => {
        setDataServers(data.data?.EC_TAG_SERVER || []);
        markStaticDataLoaded('servers');
      },
      'server-action': () => {
        // Refresh servers list after server action
        resetStaticDataLoaded('servers');
        sendMessage({ action: 'getServersList' });
      },
      'log-update': () => {
        setDataLogs(data.data?.EC_TAG_STRING || '');
        markStaticDataLoaded('logs');
      },
      'server-info-update': () => {
        setDataServerInfo(data.data?.EC_TAG_STRING || '');
        markStaticDataLoaded('serverInfo');
      },
      'app-log-update': () => {
        setDataAppLogs(data.data || '');
        markStaticDataLoaded('appLogs');
      },
      'stats-tree-update': () => {
        setDataStatsTree(data.data);
      },
      'categories-update': () => {
        setDataCategories(data.data || []);
        if (data.clientDefaultPaths) {
          // Only update if paths actually changed
          setClientDefaultPaths(prev => {
            const newPaths = data.clientDefaultPaths;
            if (prev.amule === newPaths.amule && prev.rtorrent === newPaths.rtorrent) {
              return prev;
            }
            return newPaths;
          });
        }
        // Update path warnings flag
        setHasCategoryPathWarnings(data.hasPathWarnings || false);
        markStaticDataLoaded('categories');
      },
      'ed2k-added': () => {
        const results = Array.isArray(data.results) ? data.results : [];
        const successCount = results.filter(r => r && r.success).length;
        const failureCount = results.length - successCount;
        // Use ref to get current value (avoids stale closure)
        const wasServerList = lastEd2kWasServerListRef.current;

        if (successCount > 0) {
          addAppSuccess(wasServerList
            ? 'Servers added from ED2K server list'
            : `Added ${successCount} ED2K link${successCount > 1 ? 's' : ''}`);
          // Clear server links input if this was a server list add
          if (wasServerList) {
            setDataServersEd2kLinks("");
          }
        }
        if (failureCount > 0) {
          addAppError(`Failed to add ${failureCount} link${failureCount > 1 ? 's' : ''}`);
        }

        if (wasServerList) {
          setTimeout(() => {
            resetStaticDataLoaded('servers');
            sendMessage({ action: 'getServersList' });
          }, 500);
          // Reset flag
          lastEd2kWasServerListRef.current = false;
        }
        // Note: Server broadcasts batch-update with items after adding ED2K links
      },
      'magnet-added': () => {
        const results = Array.isArray(data.results) ? data.results : [];
        const successCount = results.filter(r => r && r.success).length;
        const failureCount = results.length - successCount;

        if (successCount > 0) {
          addAppSuccess(`Added ${successCount} magnet${successCount > 1 ? 's' : ''}`);
        }
        if (failureCount > 0) {
          addAppError(`Failed to add ${failureCount} magnet${failureCount > 1 ? 's' : ''}`);
        }
        // Note: Server broadcasts batch-update with items after adding magnet links
      },
      'torrent-added': () => {
        if (data.success) {
          addAppSuccess('Added torrent file');
        }
        // Note: Server broadcasts batch-update with items after adding torrent files
      },
      'error': () => {
        addAppError(data.message || 'An error occurred');
      }
    };

    const handler = messageHandlers[data.type];
    if (handler) {
      handler();
    }

    // Call dynamic handlers (for components that need to listen to specific messages)
    dynamicHandlersRef.current.forEach(h => {
      try {
        h(data);
      } catch (err) {
        console.error('Error in dynamic message handler:', err);
      }
    });
  }, [
    authEnabled, isAuthenticated, sendMessage,
    setAppCurrentView, setAppPage, addAppError, addAppSuccess,
    // Live data setters
    setDataStats, setDataItems,
    markLiveDataLoaded,
    // Static data setters
    setDataServers, setDataCategories, setClientDefaultPaths, setClientsEnabled, setClientsConnected,
    setKnownTrackers, setHistoryTrackUsername, setDataLogs, setDataServerInfo,
    setDataStatsTree, setDataServersEd2kLinks,
    markStaticDataLoaded, resetStaticDataLoaded,
    // Search setters
    setSearchPreviousResults, setSearchPreviousResultsLoaded, setSearchLocked, setSearchResults, setSearchNoResultsError
  ]); // lastEd2kWasServerListRef accessed via ref, no dep needed

  // Keep ref updated with latest handler (avoids stale closures in WebSocket)
  useEffect(() => {
    handleMessageRef.current = handleMessage;
  }, [handleMessage]);

  // Connect to WebSocket
  const connect = useCallback(() => {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('WebSocket connected');
        setWsConnected(true);
      };

      wsRef.current.onclose = () => {
        console.log('WebSocket disconnected');
        setWsConnected(false);

        // Attempt to reconnect after 2 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('Attempting to reconnect...');
          connect();
        }, 2000);
      };

      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        wsRef.current?.close();
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          // Use ref to always call latest handler (avoids stale closure)
          handleMessageRef.current?.(data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };
    } catch (error) {
      console.error('Error creating WebSocket:', error);
    }
  }, []); // No dependencies - connect only runs once

  // Initialize WebSocket connection on mount
  useEffect(() => {
    connect();

    // Cleanup on unmount
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]); // connect is stable (no deps)

  // Memoize context value to prevent unnecessary re-renders of consumers
  const value = useMemo(() => ({
    wsConnected,
    sendMessage,
    addMessageHandler,
    removeMessageHandler
  }), [wsConnected, sendMessage, addMessageHandler, removeMessageHandler]);

  return h(WebSocketContext.Provider, { value }, children);
};

export const useWebSocketConnection = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocketConnection must be used within WebSocketProvider');
  }
  return context;
};
