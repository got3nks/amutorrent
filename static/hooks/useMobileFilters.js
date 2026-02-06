/**
 * useMobileFilters Hook
 *
 * Extracts the mobile filter sheet logic from DownloadsView.
 * Manages filter sheet state, mobile multi-select category filters,
 * active filter pills, and applies category/tracker filters.
 *
 * Filter logic:
 * - OR logic within filter types (multiple categories = match any, multiple trackers = match any)
 * - AND logic between filter types (must match a category AND a tracker if both are selected)
 *
 * Uses an internal ref for onPageChange to avoid circular dependency with useTableState.
 */

import React from 'https://esm.sh/react@18.2.0';
import { STATUS_LABELS } from '../utils/index.js';

const { useState, useMemo, useCallback, useRef } = React;

/**
 * @param {Object} options
 * @param {Array} options.data - Data to filter (already status-filtered)
 * @param {string} options.statusFilter - Current status filter value
 * @param {function} options.setStatusFilter - Status filter setter (for pill removal)
 * @param {string} options.unifiedFilter - Current unified filter value
 * @param {function} options.setUnifiedFilter - Unified filter setter (for pill removal)
 * @param {string} options.trackerFilter - Current tracker filter value
 * @param {function} options.setTrackerFilter - Tracker filter setter (for pill removal)
 * @returns {Object}
 */
export function useMobileFilters({
  data,
  statusFilter,
  setStatusFilter,
  unifiedFilter,
  setUnifiedFilter,
  trackerFilter,
  setTrackerFilter
}) {
  // Internal ref for page reset — set after useTableState via pageResetRef
  const pageResetRef = useRef(null);

  // Filter sheet state
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [mobileCategoryFilters, setMobileCategoryFilters] = useState([]);
  const [pendingCategoryFilters, setPendingCategoryFilters] = useState([]);

  // Apply mobile multi-select filters with AND logic between types, OR logic within types
  // - Multiple categories selected: match ANY of them (OR within type)
  // - Multiple trackers selected: match ANY of them (OR within type)
  // - Category + Tracker selected: must match a category AND a tracker (AND between types)
  const filteredData = useMemo(() => {
    if (mobileCategoryFilters.length === 0) return data;

    // Separate filters by type
    const categoryFilters = mobileCategoryFilters.filter(f => f.startsWith('category:'));
    const trackerFilters = mobileCategoryFilters.filter(f => f.startsWith('tracker:'));

    return data.filter(item => {
      // Check category filters (OR logic within type)
      const matchesCategory = categoryFilters.length === 0 || categoryFilters.some(filter => {
        const categoryName = filter.slice(9);
        return item.category === categoryName;
      });

      // Check tracker filters (OR logic within type)
      const matchesTracker = trackerFilters.length === 0 || trackerFilters.some(filter => {
        const tracker = filter.slice(8);
        if (tracker === 'none') return !item.tracker;
        return item.tracker === tracker;
      });

      // AND logic between types: must match both (if both types are present)
      return matchesCategory && matchesTracker;
    });
  }, [data, mobileCategoryFilters]);

  // Resolve category filter to display name (used by pills)
  const getCategoryLabel = useCallback((filter) => {
    if (filter.startsWith('category:')) {
      return filter.slice(9);
    }
    return filter;
  }, []);

  // Build active filter pills for mobile
  const activeFilterPills = useMemo(() => {
    const pills = [];
    if (statusFilter !== 'all') {
      pills.push({ key: 'status', label: STATUS_LABELS[statusFilter] || statusFilter, icon: 'activity' });
    }
    if (unifiedFilter !== 'all') {
      const filterLabel = getCategoryLabel(unifiedFilter);
      pills.push({ key: 'unifiedFilter', label: filterLabel, icon: 'folder' });
    }
    if (trackerFilter !== 'all') {
      pills.push({ key: 'tracker', label: trackerFilter, icon: 'server' });
    }
    mobileCategoryFilters.forEach(f => {
      const label = f.startsWith('tracker:') ? f.slice(8) : getCategoryLabel(f);
      const icon = f.startsWith('tracker:') ? 'server' : 'folder';
      pills.push({ key: `mobile-${f}`, label, icon });
    });
    return pills;
  }, [statusFilter, unifiedFilter, trackerFilter, mobileCategoryFilters, getCategoryLabel]);

  // Filter sheet callbacks
  const handleFilterSheetOpen = useCallback(() => {
    setPendingCategoryFilters([...mobileCategoryFilters]);
    setShowFilterSheet(true);
  }, [mobileCategoryFilters]);

  const handleFilterSheetApply = useCallback(() => {
    setMobileCategoryFilters(pendingCategoryFilters);
    setShowFilterSheet(false);
    if (pageResetRef.current) pageResetRef.current(0);
  }, [pendingCategoryFilters]);

  const handleFilterSheetClear = useCallback(() => {
    setPendingCategoryFilters([]);
  }, []);

  const togglePendingFilter = useCallback((filterValue) => {
    setPendingCategoryFilters(prev =>
      prev.includes(filterValue) ? prev.filter(f => f !== filterValue) : [...prev, filterValue]
    );
  }, []);

  // Remove a filter pill
  const handleRemoveFilterPill = useCallback((key) => {
    if (key === 'status') {
      setStatusFilter('all');
      if (pageResetRef.current) pageResetRef.current(0);
    } else if (key === 'unifiedFilter') {
      setUnifiedFilter('all');
      if (pageResetRef.current) pageResetRef.current(0);
    } else if (key === 'tracker') {
      setTrackerFilter('all');
    } else if (key.startsWith('mobile-')) {
      const filterVal = key.slice(7);
      setMobileCategoryFilters(prev => prev.filter(f => f !== filterVal));
    }
  }, [setStatusFilter, setUnifiedFilter, setTrackerFilter]);

  return {
    // Filter sheet state
    showFilterSheet,
    setShowFilterSheet,
    pendingCategoryFilters,
    mobileCategoryFilters,
    setMobileCategoryFilters,
    handleFilterSheetOpen,
    handleFilterSheetApply,
    handleFilterSheetClear,
    togglePendingFilter,
    // Filter pills
    activeFilterPills,
    handleRemoveFilterPill,
    // Filtered data
    filteredData,
    // Ref for wiring onPageChange after useTableState
    pageResetRef
  };
}
