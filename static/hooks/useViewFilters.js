/**
 * useViewFilters Hook
 *
 * Consolidates the common filter chain used across views:
 * useClientFilteredData → useTrackerFilter → useStatusFilter → useMobileFilters → useTableState
 *
 * Also sets up: selection mode, context menu, frozen sort order, page reset effects
 *
 * Options allow disabling certain features for simpler views (e.g., UploadsView).
 */

import React from 'https://esm.sh/react@18.2.0';
import { useClientFilteredData } from './useClientFilteredData.js';
import { useTrackerFilter } from './useTrackerFilter.js';
import { useStatusFilter } from './useStatusFilter.js';
import { useMobileFilters } from './useMobileFilters.js';
import { useTableState } from './useTableState.js';
import { useFrozenSortSelection } from './useFrozenSortSelection.js';
import { useContextMenuFrozenOrder } from './useContextMenuFrozenOrder.js';
import { useClientFilterPageReset } from './useClientFilterPageReset.js';
import { useContextMenu } from '../components/common/ContextMenu.js';

const { useMemo, useEffect, useState, useCallback, useRef } = React;

// Dummy no-op function for disabled features
const noop = () => {};

/**
 * Combined filter chain hook for views
 * @param {Object} options
 * @param {Array} options.data - Source data array
 * @param {string} options.viewKey - View identifier for sort config ('downloads', 'shared', 'uploads')
 * @param {Object} options.secondarySort - Secondary sort config { sortBy, sortDirection }
 * @param {function} options.getStatusKey - Optional custom status key derivation function
 * @param {string} options.filterField - Field to filter by text (default 'name')
 * @param {boolean} options.disableStatusFilter - Skip status filtering (default false)
 * @param {boolean} options.disableSelection - Skip selection mode setup (default false)
 * @param {string} options.rowKeyField - Field to use as row key for context menu frozen order (default 'hash')
 * @returns {Object} All filter state and handlers
 */
export const useViewFilters = ({
  data,
  viewKey,
  secondarySort = { sortBy: 'name', sortDirection: 'asc' },
  getStatusKey = null,
  filterField = 'name',
  disableStatusFilter = false,
  disableSelection = false,
  rowKeyField = 'hash'
}) => {
  // 1. Client and category/label filtering
  const {
    filteredData: categoryFilteredData,
    unifiedFilter,
    setUnifiedFilter,
    filterCategoryId,
    hasRtorrent,
    hasAmule,
    isAmuleEnabled,
    isRtorrentEnabled
  } = useClientFilteredData({ data });

  // 2. Tracker filter
  const {
    trackerFilter,
    setTrackerFilter,
    showTrackerFilter,
    trackerOptions,
    filterDataByTracker
  } = useTrackerFilter();

  // 3. Apply tracker filter
  const trackerFilteredData = useMemo(() =>
    filterDataByTracker(categoryFilteredData),
    [categoryFilteredData, filterDataByTracker]
  );

  // 4. Selection mode with frozen sort order (conditionally enabled)
  const selectionResult = useFrozenSortSelection();
  const {
    selectionMode: _selectionMode,
    selectedFiles: _selectedFiles,
    selectedCount: _selectedCount,
    toggleSelectionMode: _toggleSelectionMode,
    enterSelectionWithItem: _enterSelectionWithItem,
    toggleFileSelection: _toggleFileSelection,
    clearAllSelections: _clearAllSelections,
    selectAll: _selectAll,
    selectShown: _selectShown,
    isShownFullySelected: _isShownFullySelected,
    getSelectedHashes: _getSelectedHashes,
    frozenSortOrder: _frozenSortOrder,
    sortedDataRef: _sortedDataRef
  } = selectionResult;

  // For views without selection, use a simple ref for context menu frozen order
  const simpleSortedDataRef = useRef([]);
  const sortedDataRef = disableSelection ? simpleSortedDataRef : _sortedDataRef;
  const frozenSortOrder = disableSelection ? null : _frozenSortOrder;

  // 5. Context menu
  const { contextMenu, openContextMenu, closeContextMenu } = useContextMenu();

  // 6. Capture sort order when context menu opens
  const contextMenuFrozenOrder = useContextMenuFrozenOrder(contextMenu, sortedDataRef, rowKeyField);

  // 7. Status filter (conditionally enabled)
  // When disabled, use dummy state that passes data through
  const [dummyStatusFilter] = useState('all');
  const dummyStatusSetter = useCallback(() => {}, []);

  const statusFilterResult = useStatusFilter({
    data: trackerFilteredData,
    ...(getStatusKey && { getStatusKey })
  });

  // Use real or dummy status filter based on option
  const statusFilter = disableStatusFilter ? dummyStatusFilter : statusFilterResult.statusFilter;
  const setStatusFilter = disableStatusFilter ? dummyStatusSetter : statusFilterResult.setStatusFilter;
  const statusCounts = disableStatusFilter ? {} : statusFilterResult.statusCounts;
  const statusOptions = disableStatusFilter ? [] : statusFilterResult.statusOptions;
  const statusFilteredData = disableStatusFilter ? trackerFilteredData : statusFilterResult.filteredData;

  // 8. Mobile filters
  const mobileFilters = useMobileFilters({
    data: statusFilteredData,
    statusFilter,
    setStatusFilter,
    unifiedFilter,
    setUnifiedFilter,
    trackerFilter,
    setTrackerFilter
  });
  const mobileFilteredData = mobileFilters.filteredData;

  // 9. Table state (text filtering, sorting, load-more)
  const {
    filteredData,
    sortedData,
    loadedData,
    filterText,
    setFilterText,
    clearFilter,
    sortConfig,
    onSortChange,
    loadedCount,
    hasMore,
    remaining,
    loadMore,
    loadAll,
    resetLoaded,
    pageSize,
    onPageSizeChange
  } = useTableState({
    data: mobileFilteredData,
    viewKey,
    filterField,
    secondarySort,
    frozenOrder: frozenSortOrder || contextMenuFrozenOrder,
    hashKey: rowKeyField
  });

  // 10. Update sorted data ref for frozen sort order capture
  sortedDataRef.current = sortedData;

  // 11. Reset loaded items when client filter changes (header ED2K/BT toggles)
  useClientFilterPageReset(resetLoaded, isAmuleEnabled, isRtorrentEnabled);

  // 12. Reset loaded items when status filter changes (only if status filter is enabled)
  useEffect(() => {
    if (!disableStatusFilter) {
      resetLoaded();
    }
  }, [statusFilter, disableStatusFilter, resetLoaded]);

  // 13. Wire up reset ref for mobile filters
  useEffect(() => { mobileFilters.pageResetRef.current = resetLoaded; }, [resetLoaded, mobileFilters.pageResetRef]);

  return {
    // Final filtered/sorted data
    filteredData,
    sortedData,
    loadedData,

    // Client filter
    unifiedFilter,
    setUnifiedFilter,
    filterCategoryId,
    hasRtorrent,
    hasAmule,
    isAmuleEnabled,
    isRtorrentEnabled,

    // Tracker filter
    trackerFilter,
    setTrackerFilter,
    showTrackerFilter,
    trackerOptions,

    // Status filter (may be dummy values if disabled)
    statusFilter,
    setStatusFilter,
    statusCounts,
    statusOptions,

    // Mobile filters
    mobileFilters,

    // Text filter
    filterText,
    setFilterText,
    clearFilter,

    // Sorting
    sortConfig,
    onSortChange,

    // Load-more pagination
    loadedCount,
    hasMore,
    remaining,
    loadMore,
    loadAll,
    resetLoaded,
    pageSize,
    onPageSizeChange,

    // Selection (may be no-ops if disabled)
    selectionMode: disableSelection ? false : _selectionMode,
    selectedFiles: disableSelection ? new Set() : _selectedFiles,
    selectedCount: disableSelection ? 0 : _selectedCount,
    toggleSelectionMode: disableSelection ? noop : _toggleSelectionMode,
    enterSelectionWithItem: disableSelection ? noop : _enterSelectionWithItem,
    toggleFileSelection: disableSelection ? noop : _toggleFileSelection,
    clearAllSelections: disableSelection ? noop : _clearAllSelections,
    selectAll: disableSelection ? noop : _selectAll,
    selectShown: disableSelection ? noop : _selectShown,
    isShownFullySelected: disableSelection ? (() => false) : _isShownFullySelected,
    getSelectedHashes: disableSelection ? (() => []) : _getSelectedHashes,

    // Context menu
    contextMenu,
    openContextMenu,
    closeContextMenu
  };
};

export default useViewFilters;
