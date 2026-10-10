/**
 * SearchContext
 *
 * Provides search-related state to the app
 * Manages search query, type, results, and error states
 */

import React, { createContext, useContext, useState, useCallback, useMemo } from 'https://esm.sh/react@18.2.0';
import { useStaticData } from './StaticDataContext.js';
import { resolveServingInstanceId } from '../utils/searchInstance.js';

const { createElement: h } = React;

const SearchContext = createContext(null);

/**
 * Internal hook for search state management
 * @returns {Object} Search state and update functions (flattened)
 */
const useSearchState = () => {
  const { instances } = useStaticData();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState('global');
  // Which instances currently hold a search lock. Each instance locks and
  // unlocks on its own, so a search finishing (or a background Torznab search)
  // on one instance never greys the box for a different, free instance.
  // Prowlarr, being instance-less, holds the 'prowlarr' key.
  const [lockedInstances, setLockedInstances] = useState(() => new Set());
  const [searchResults, setSearchResults] = useState([]);
  // The instance that produced the displayed results. Kept apart from
  // `searchInstanceId` (which tracks the instance the NEXT search targets, and
  // changes when the source button changes) so a batch download goes to the
  // instance that actually found the results, not the current selection.
  const [searchResultsInstanceId, setSearchResultsInstanceId] = useState(null);
  const [searchPreviousResults, setSearchPreviousResults] = useState([]);
  const [searchPreviousResultsLoaded, setSearchPreviousResultsLoaded] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchDownloadCategory, setSearchDownloadCategory] = useState('Default');
  const [searchInstanceId, setSearchInstanceId] = useState(null);

  // The box greys only for the instance the selected source would actually use,
  // so a lock held elsewhere doesn't block a search on a free instance. Resolve
  // that instance the same way the search dispatcher does (the connected instance
  // serving the selected source), independent of `searchInstanceId` — which stays
  // null until the first search, so keying on it alone left the box ungreyed while
  // the target instance was locked, and the first search was refused.
  const lockKey = useMemo(() => {
    if (searchType === 'prowlarr') return 'prowlarr';
    return resolveServingInstanceId(instances, searchType, searchInstanceId);
  }, [instances, searchType, searchInstanceId]);
  const searchLocked = lockKey != null && lockedInstances.has(lockKey);

  // Add/remove one instance's search lock, keyed by instance id (or 'prowlarr'
  // for the instance-less Prowlarr search).
  const setSearchLocked = useCallback((locked, instanceId = null) => {
    const key = instanceId || '__local';
    setLockedInstances(prev => {
      if (locked === prev.has(key)) return prev;
      const next = new Set(prev);
      if (locked) next.add(key); else next.delete(key);
      return next;
    });
  }, []);

  // Apply the connect-time snapshot from the server (the per-instance locks it
  // tracks), merging rather than replacing: the server doesn't know the client-
  // only keys — the instance-less 'prowlarr' search and the '__local' optimistic
  // hold — so a reconnect mid-Prowlarr-search must keep them, or the box ungreys
  // while that search is still running.
  const setSearchLockSnapshot = useCallback((instanceIds) => {
    setLockedInstances(prev => {
      const next = new Set(instanceIds || []);
      if (prev.has('prowlarr')) next.add('prowlarr');
      if (prev.has('__local')) next.add('__local');
      return next;
    });
  }, []);

  // Clear error
  const clearSearchError = useCallback(() => {
    setSearchError('');
  }, []);

  // Set "no results" error and clear results
  const setSearchNoResultsError = useCallback(() => {
    setSearchResults([]);
    setSearchError('No results found');
  }, []);

  // Helper to set results and clear error at the same time
  const setSearchResultsWithClear = useCallback((results) => {
    setSearchResults(results);
    setSearchError('');
  }, []);

  // Memoize return value to prevent unnecessary re-renders of consumers
  return useMemo(() => ({
    // State
    searchQuery,
    searchType,
    searchLocked,
    searchResults,
    searchPreviousResults,
    searchPreviousResultsLoaded,
    searchError,
    searchDownloadCategory,
    searchInstanceId,
    searchResultsInstanceId,

    // Setters
    setSearchQuery,
    setSearchType,
    setSearchLocked,
    setSearchLockSnapshot,
    setSearchResults: setSearchResultsWithClear,
    setSearchPreviousResults,
    setSearchPreviousResultsLoaded,
    setSearchError,
    setSearchDownloadCategory,
    setSearchInstanceId,
    setSearchResultsInstanceId,
    clearSearchError,
    setSearchNoResultsError
  }), [
    searchQuery, searchType, searchLocked, searchResults, searchPreviousResults,
    searchPreviousResultsLoaded, searchError, searchDownloadCategory, searchInstanceId,
    searchResultsInstanceId,
    setSearchLocked, setSearchLockSnapshot,
    setSearchResultsWithClear, clearSearchError, setSearchNoResultsError
    // Note: React useState setters are stable
  ]);
};

export const SearchProvider = ({ children }) => {
  const searchStateHook = useSearchState();

  return h(SearchContext.Provider, { value: searchStateHook }, children);
};

export const useSearch = () => {
  const context = useContext(SearchContext);
  if (!context) {
    throw new Error('useSearch must be used within SearchProvider');
  }
  return context;
};
