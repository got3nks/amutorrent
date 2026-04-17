/**
 * useTrackerFilter Hook
 *
 * Centralized hook for tracker filtering.
 * - State is an array of hostnames — empty means "no filter" (all trackers).
 * - `'none'` sentinel in the array matches items with no tracker.
 * - Exposes toggle/clear helpers so views don't reimplement array math.
 */

import { useState, useMemo, useCallback } from 'https://esm.sh/react@18.2.0';
import { useStaticData } from '../contexts/StaticDataContext.js';
import { useClientFilter } from '../contexts/ClientFilterContext.js';
import { filterByTracker, buildTrackerFilterOptions } from '../utils/downloadHelpers.js';

/**
 * Hook for tracker filtering
 * @param {Object} options
 * @param {boolean} options.includeNoTracker - Include the "(no tracker)" option (default: false)
 * @returns {Object} Tracker filter state and utilities
 */
export const useTrackerFilter = ({ includeNoTracker = false } = {}) => {
  const { knownTrackers } = useStaticData();
  const { isBittorrentEnabled } = useClientFilter();

  // Array of selected tracker hostnames (or 'none' sentinel). Empty = all.
  const [trackerFilters, setTrackerFilters] = useState([]);

  const showTrackerFilter = isBittorrentEnabled;

  // Full list of options (sans the synthetic 'all' entry used by the legacy
  // native <select>; the multi-select treats "no selection" as "all").
  const trackerOptions = useMemo(() => {
    if (!showTrackerFilter) return [];
    const options = buildTrackerFilterOptions(knownTrackers, includeNoTracker);
    return options.filter(o => o.value !== 'all');
  }, [knownTrackers, includeNoTracker, showTrackerFilter]);

  const filterDataByTracker = useCallback((items) => {
    if (!showTrackerFilter || trackerFilters.length === 0) return items;
    return filterByTracker(items, trackerFilters);
  }, [showTrackerFilter, trackerFilters]);

  const toggleTrackerFilter = useCallback((host) => {
    setTrackerFilters(prev =>
      prev.includes(host) ? prev.filter(h => h !== host) : [...prev, host]
    );
  }, []);

  const resetTrackerFilter = useCallback(() => {
    setTrackerFilters([]);
  }, []);

  const isTrackerFilterActive = trackerFilters.length > 0;

  return {
    // State (array)
    trackerFilters,
    setTrackerFilters,
    toggleTrackerFilter,

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
