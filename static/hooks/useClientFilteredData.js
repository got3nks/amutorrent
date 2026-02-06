/**
 * useClientFilteredData Hook
 *
 * Shared hook for filtering data by client type and unified category/label filter
 * Used by views that display mixed aMule/rtorrent data
 */

import { useState, useMemo } from 'https://esm.sh/react@18.2.0';
import { useClientFilter } from '../contexts/ClientFilterContext.js';
import { filterByUnifiedFilter, hasRtorrentItems, hasAmuleItems } from '../utils/index.js';

/**
 * Hook for filtering data by client type and category/label
 * @param {Object} options
 * @param {Array} options.data - Raw data array to filter
 * @returns {Object} Filtered data and filter state
 */
export const useClientFilteredData = ({ data }) => {
  // Global client filter from context (toggle in header)
  const { filterByEnabledClients, isAmuleEnabled, isRtorrentEnabled } = useClientFilter();

  // Local category/label filter state (view-specific)
  const [unifiedFilter, setUnifiedFilter] = useState('all');

  // Apply global client filter first
  const clientFilteredData = useMemo(() => {
    return filterByEnabledClients(data);
  }, [data, filterByEnabledClients]);

  // Apply unified category/label filter
  const filteredData = useMemo(() => {
    return filterByUnifiedFilter(clientFilteredData, unifiedFilter);
  }, [clientFilteredData, unifiedFilter]);

  // Check if rtorrent/amule items exist (for showing/hiding filters)
  const hasRtorrent = useMemo(() => hasRtorrentItems(data), [data]);
  const hasAmule = useMemo(() => hasAmuleItems(data), [data]);

  // Parse category name from unified filter (for views that need it)
  const filterCategoryName = useMemo(() => {
    if (unifiedFilter.startsWith('category:')) {
      return unifiedFilter.slice(9);
    }
    return null;
  }, [unifiedFilter]);

  return {
    // Filtered data
    clientFilteredData,  // After client filter only
    filteredData,        // After both filters
    // Filter state
    unifiedFilter,
    setUnifiedFilter,
    filterCategoryName,
    // Data presence flags
    hasRtorrent,
    hasAmule,
    // Client filter state (for conditional rendering and page reset)
    isAmuleEnabled,
    isRtorrentEnabled
  };
};
