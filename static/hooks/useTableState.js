/**
 * useTableState Hook
 *
 * Combines filtering, sorting, and pagination for table views
 * Reduces boilerplate across DownloadsView, UploadsView, SharedView, etc.
 */

import { useMemo, useCallback } from 'https://esm.sh/react@18.2.0';
import { useAppState } from '../contexts/AppStateContext.js';
import { useTextFilter } from './useTextFilter.js';
import { sortFiles, calculatePagination, calculateLoadMore } from '../utils/index.js';

/**
 * Combined table state hook for filtering, sorting, and pagination
 * @param {Object} options - Configuration options
 * @param {Array} options.data - Array of items to display
 * @param {string} options.viewKey - Unique key for this view (e.g., 'uploads', 'downloads')
 * @param {string|null} options.filterField - Field to filter by (null to disable text filtering)
 * @param {object|null} options.secondarySort - Secondary sort config {sortBy, sortDirection}
 * @param {Array|null} options.frozenOrder - Array of file hashes to maintain stable order (used during selection mode)
 * @param {string} options.hashKey - Key to use for getting item hash (default: 'hash')
 * @param {object} options.sortOptions - Extra options passed to sortFiles (e.g., { keepDefaultFirst: true })
 * @returns {Object} Table state and handlers
 */
export const useTableState = ({
  data = [],
  viewKey,
  filterField = null,
  secondarySort = null,
  frozenOrder = null,
  hashKey = 'hash',
  sortOptions = {}
}) => {
  // Get shared state from context
  const {
    appPage,
    appPageSize,
    appSortConfig,
    setAppPage,
    setAppPageSize,
    setAppSortConfig
  } = useAppState();

  // Reset page when filter changes
  const handleFilterChange = useCallback(() => setAppPage(0), [setAppPage]);

  // Text filter
  const {
    filteredItems,
    filterText,
    setFilterText,
    clearFilter
  } = useTextFilter(data, filterField, { onFilterChange: handleFilterChange });

  // Get sort config for this view (defaults are centralized in AppStateContext)
  const sortConfig = appSortConfig[viewKey] || { sortBy: 'fileName', sortDirection: 'asc' };

  // Sort change handler - also resets page to 0
  const handleSortChange = useCallback((newSortBy, newSortDirection) => {
    setAppSortConfig(prev => ({
      ...prev,
      [viewKey]: { sortBy: newSortBy, sortDirection: newSortDirection }
    }));
    setAppPage(0);
  }, [viewKey, setAppSortConfig, setAppPage]);

  // Memoized sorted data
  // When frozenOrder is provided, maintain stable order instead of dynamic sorting
  const sortedData = useMemo(() => {
    if (frozenOrder && frozenOrder.length > 0) {
      // Create a position map for O(1) lookups
      const positionMap = new Map(frozenOrder.map((hash, idx) => [hash, idx]));

      // Sort items according to frozen order
      // Items not in frozen order go at the end, sorted by the normal sort config
      const inFrozenOrder = [];
      const notInFrozenOrder = [];

      filteredItems.forEach(item => {
        const hash = item[hashKey];
        if (positionMap.has(hash)) {
          inFrozenOrder.push({ item, position: positionMap.get(hash) });
        } else {
          notInFrozenOrder.push(item);
        }
      });

      // Sort items that were in the frozen order by their original position
      inFrozenOrder.sort((a, b) => a.position - b.position);
      const orderedItems = inFrozenOrder.map(entry => entry.item);

      // New items get appended at the end, sorted normally
      if (notInFrozenOrder.length > 0) {
        const sortedNew = sortFiles(notInFrozenOrder, sortConfig.sortBy, sortConfig.sortDirection, secondarySort, sortOptions);
        return [...orderedItems, ...sortedNew];
      }

      return orderedItems;
    }

    // Normal dynamic sorting
    return sortFiles(filteredItems, sortConfig.sortBy, sortConfig.sortDirection, secondarySort, sortOptions);
  }, [filteredItems, sortConfig.sortBy, sortConfig.sortDirection, secondarySort, frozenOrder, hashKey, sortOptions]);

  // Load-more pagination (cumulative)
  // appPage represents "pages loaded - 1", so appPage=0 means 1 page loaded
  const loadedPages = appPage + 1;
  const { loadedData, loadedCount, hasMore, remaining } = calculateLoadMore(
    sortedData,
    loadedPages,
    appPageSize
  );

  // Load more handler - increments the loaded page count
  const loadMore = useCallback(() => {
    setAppPage(prev => prev + 1);
  }, [setAppPage]);

  // Load all handler - sets page to load everything
  const loadAll = useCallback(() => {
    const totalPages = Math.ceil(sortedData.length / appPageSize);
    setAppPage(totalPages - 1); // -1 because appPage is 0-based
  }, [sortedData.length, appPageSize, setAppPage]);

  // Reset loaded count (back to first batch)
  const resetLoaded = useCallback(() => {
    setAppPage(0);
  }, [setAppPage]);

  return {
    // Data
    filteredData: filteredItems,
    sortedData,
    loadedData,        // Items currently shown (0 to loadedCount)
    totalCount: filteredItems.length,

    // Filter state (only relevant when filterField is provided)
    hasTextFilter: !!filterField,
    filterText,
    setFilterText,
    clearFilter,

    // Sort state
    sortConfig,
    onSortChange: handleSortChange,

    // Load-more state
    loadedCount,
    hasMore,
    remaining,
    loadMore,
    loadAll,
    resetLoaded,
    pageSize: appPageSize,
    onPageSizeChange: setAppPageSize
  };
};
