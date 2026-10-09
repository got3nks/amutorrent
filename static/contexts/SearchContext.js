/**
 * SearchContext
 *
 * Provides search-related state to the app
 * Manages search query, type, results, and error states
 */

import React, { createContext, useContext, useState, useCallback, useMemo } from 'https://esm.sh/react@18.2.0';

const { createElement: h } = React;

const SearchContext = createContext(null);

/**
 * Internal hook for search state management
 * @returns {Object} Search state and update functions (flattened)
 */
const useSearchState = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState('global');
  // Which instances currently hold a search lock. A search greys the box while
  // ANY instance is searching, but each instance locks and unlocks on its own,
  // so one finishing doesn't re-enable the box while another is still running.
  // '__local' is an optimistic pre-confirmation hold for an instance-less search
  // (e.g. Prowlarr) and for the click before the server echoes the lock back.
  const [lockedInstances, setLockedInstances] = useState(() => new Set());
  const searchLocked = lockedInstances.size > 0;
  const [searchResults, setSearchResults] = useState([]);
  const [searchPreviousResults, setSearchPreviousResults] = useState([]);
  const [searchPreviousResultsLoaded, setSearchPreviousResultsLoaded] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchDownloadCategory, setSearchDownloadCategory] = useState('Default');
  const [searchInstanceId, setSearchInstanceId] = useState(null);

  // Add/remove one instance's search lock. `instanceId` falls back to the
  // optimistic '__local' hold when the caller has no instance yet.
  const setSearchLocked = useCallback((locked, instanceId = null) => {
    const key = instanceId || '__local';
    setLockedInstances(prev => {
      if (locked === prev.has(key)) return prev;
      const next = new Set(prev);
      if (locked) next.add(key); else next.delete(key);
      return next;
    });
  }, []);

  // Replace the whole locked set (connect-time snapshot from the server).
  const setSearchLockSnapshot = useCallback((instanceIds) => {
    setLockedInstances(new Set(instanceIds || []));
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
    clearSearchError,
    setSearchNoResultsError
  }), [
    searchQuery, searchType, searchLocked, searchResults, searchPreviousResults,
    searchPreviousResultsLoaded, searchError, searchDownloadCategory, searchInstanceId,
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
