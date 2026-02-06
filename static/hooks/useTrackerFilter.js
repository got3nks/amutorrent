/**
 * useTrackerFilter Hook
 *
 * Centralized hook for tracker filtering functionality.
 * - Gets known trackers from StaticDataContext (extracted from all rtorrent data)
 * - Gets isRtorrentEnabled from ClientFilterContext (combines user preference AND connection status)
 * - Provides filter state, options, and filter function
 * - Only shows tracker filter when rtorrent is enabled (configured, connected, and user hasn't hidden it)
 */

import { useState, useMemo, useCallback } from 'https://esm.sh/react@18.2.0';
import { useStaticData } from '../contexts/StaticDataContext.js';
import { useClientFilter } from '../contexts/ClientFilterContext.js';
import { filterByTracker, buildTrackerFilterOptions } from '../utils/downloadHelpers.js';

/**
 * Hook for tracker filtering
 * @param {Object} options - Configuration options
 * @param {boolean} options.includeNoTracker - Whether to include "(no tracker)" option (default: false)
 * @returns {Object} Tracker filter state and utilities
 */
export const useTrackerFilter = ({ includeNoTracker = false } = {}) => {
  const { knownTrackers } = useStaticData();
  const { isRtorrentEnabled } = useClientFilter();

  // Filter state
  const [trackerFilter, setTrackerFilter] = useState('all');

  // Only show tracker filter when rtorrent is enabled (includes connection check)
  const showTrackerFilter = isRtorrentEnabled;

  // Build filter options from known trackers
  const trackerOptions = useMemo(() => {
    if (!showTrackerFilter) return [];
    return buildTrackerFilterOptions(knownTrackers, includeNoTracker);
  }, [knownTrackers, includeNoTracker, showTrackerFilter]);

  // Filter function - filters items by tracker
  const filterDataByTracker = useCallback((items) => {
    if (!showTrackerFilter || trackerFilter === 'all') return items;
    return filterByTracker(items, trackerFilter);
  }, [showTrackerFilter, trackerFilter]);

  // Reset filter to 'all'
  const resetTrackerFilter = useCallback(() => {
    setTrackerFilter('all');
  }, []);

  // Check if filter is active (not 'all')
  const isTrackerFilterActive = trackerFilter !== 'all';

  return {
    // State
    trackerFilter,
    setTrackerFilter,

    // Derived
    showTrackerFilter,
    trackerOptions,
    isTrackerFilterActive,

    // Functions
    filterDataByTracker,
    resetTrackerFilter
  };
};

export default useTrackerFilter;
