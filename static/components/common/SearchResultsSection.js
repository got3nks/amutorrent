/**
 * SearchResultsSection Component
 *
 * Shared component for displaying search results with header controls.
 * Provides multi-selection with checkboxes and a fixed bottom download bar.
 * Used by both SearchView (cached results) and SearchResultsView (live results)
 */

import React from 'https://esm.sh/react@18.2.0';
import { SearchResultsList, SEARCH_RESULTS_COLUMNS, PROWLARR_RESULTS_COLUMNS, FilterInput, MobileSortButton, ExpandableSearch, Select, Button, Icon, SelectionModeSection, ClientIcon, MobileFilterSheet, MobileFilterPills, MobileFilterButton } from './index.js';
import { DEFAULT_SORT_CONFIG, sortFiles, calculateLoadMore, VIEW_TITLE_STYLES, makeFilterHeaderRender, createIndexerFilter } from '../../utils/index.js';
import { useAppState } from '../../contexts/AppStateContext.js';
import { useStaticData } from '../../contexts/StaticDataContext.js';
import { useSearch } from '../../contexts/SearchContext.js';
import { useActions } from '../../contexts/ActionsContext.js';
import { useTextFilter, useSelectionMode, usePageSelection } from '../../hooks/index.js';
import { useStickyToolbar } from '../../contexts/StickyHeaderContext.js';

const { createElement: h, useCallback, useMemo, useEffect, useState } = React;

/**
 * SearchResultsSection component
 * @param {string} title - Desktop title (e.g. "Search Results", "Previous Search Results")
 * @param {string} mobileTitle - Mobile title (e.g. "Results")
 * @param {Array} results - Results array to display
 * @param {string} sortConfigKey - Key for sort config (e.g. 'search', 'search-results')
 * @param {ReactNode} extraMobileButtons - Additional buttons for mobile header
 * @param {ReactNode} extraDesktopButtons - Additional buttons for desktop header
 * @param {string} emptyMessage - Message when no results
 * @param {string} filterEmptyMessage - Message when filter has no matches
 * @param {string} scrollHeight - Custom scroll height for the table
 */
const SearchResultsSection = ({
  title = 'Search Results',
  mobileTitle = 'Search Results',
  results,
  sortConfigKey = 'search',
  extraMobileButtons = null,
  extraDesktopButtons = null,
  emptyMessage = 'No results found',
  filterEmptyMessage = 'No results match the filter',
  scrollHeight
}) => {
  // Get data from contexts
  const { appPage, appPageSize, appSortConfig, setAppPage, setAppPageSize, setAppSortConfig, addAppSuccess } = useAppState();
  const { dataDownloadedFiles, dataCategories } = useStaticData();
  const { searchDownloadCategory, setSearchDownloadCategory } = useSearch();
  const actions = useActions();

  // Detect if results are from Prowlarr
  const isProwlarr = useMemo(() => results.length > 0 && results[0].isProwlarr, [results]);
  const sortableColumns = isProwlarr ? PROWLARR_RESULTS_COLUMNS : SEARCH_RESULTS_COLUMNS;

  // Indexer filter (for Prowlarr results only)
  const [indexerFilter, setIndexerFilter] = useState('all');

  // Download loading state
  const [downloading, setDownloading] = useState(false);

  // Mobile filter state for indexer
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [mobileIndexerFilters, setMobileIndexerFilters] = useState([]);
  const [pendingIndexerFilters, setPendingIndexerFilters] = useState([]);

  // Extract unique indexers from Prowlarr results
  const indexerOptions = useMemo(() => {
    if (!isProwlarr) return [];
    const indexers = [...new Set(results.map(r => r.indexer).filter(Boolean))].sort();
    return [
      { value: 'all', label: 'All Indexers' },
      ...indexers.map(i => ({ value: i, label: i }))
    ];
  }, [isProwlarr, results]);

  // Filter results by indexer (desktop uses single filter, mobile uses multi-select)
  const indexerFilteredResults = useMemo(() => {
    if (!isProwlarr) return results;

    // Mobile multi-select filter takes precedence
    if (mobileIndexerFilters.length > 0) {
      return results.filter(r => {
        return mobileIndexerFilters.some(f => {
          const indexerName = f.slice(8); // Remove 'indexer:' prefix
          return r.indexer === indexerName;
        });
      });
    }

    // Desktop single filter
    if (indexerFilter === 'all') return results;
    return results.filter(r => r.indexer === indexerFilter);
  }, [results, isProwlarr, indexerFilter, mobileIndexerFilters]);

  // Reset indexer filter when results change
  useEffect(() => {
    setIndexerFilter('all');
    setMobileIndexerFilters([]);
    setPendingIndexerFilters([]);
  }, [results]);

  // Mobile filter sheet handlers
  const handleFilterSheetOpen = useCallback(() => {
    setPendingIndexerFilters([...mobileIndexerFilters]);
    setShowFilterSheet(true);
  }, [mobileIndexerFilters]);

  const handleFilterSheetApply = useCallback(() => {
    setMobileIndexerFilters(pendingIndexerFilters);
    setShowFilterSheet(false);
    setAppPage(0);
  }, [pendingIndexerFilters, setAppPage]);

  const handleFilterSheetClear = useCallback(() => {
    setPendingIndexerFilters([]);
  }, []);

  const togglePendingFilter = useCallback((filterValue) => {
    setPendingIndexerFilters(prev =>
      prev.includes(filterValue) ? prev.filter(f => f !== filterValue) : [...prev, filterValue]
    );
  }, []);

  // Mobile filter pills
  const activeFilterPills = useMemo(() => {
    const pills = [];
    // Desktop filter pill (if not using mobile multi-select)
    if (indexerFilter !== 'all' && mobileIndexerFilters.length === 0) {
      pills.push({ key: 'indexer', label: indexerFilter, icon: 'server' });
    }
    // Mobile multi-select pills
    mobileIndexerFilters.forEach(f => {
      const label = f.slice(8); // Remove 'indexer:' prefix
      pills.push({ key: `mobile-${f}`, label, icon: 'server' });
    });
    return pills;
  }, [indexerFilter, mobileIndexerFilters]);

  const handleRemoveFilterPill = useCallback((key) => {
    if (key === 'indexer') {
      setIndexerFilter('all');
      setAppPage(0);
    } else if (key.startsWith('mobile-')) {
      const filterVal = key.slice(7);
      setMobileIndexerFilters(prev => prev.filter(f => f !== filterVal));
      setAppPage(0);
    }
  }, [setAppPage]);

  // Selection state (always-on checkboxes, no toggle needed)
  const { selectedFiles, selectedCount, toggleFileSelection,
          clearAllSelections, selectAll, selectShown, isShownFullySelected } = useSelectionMode();

  // Reset loaded handler for filter changes
  const resetLoaded = useCallback(() => setAppPage(0), [setAppPage]);

  // Text filter for results (uses indexer-filtered results for Prowlarr)
  const { filteredItems: filteredResults, filterText, setFilterText, clearFilter } = useTextFilter(indexerFilteredResults, 'fileName', { onFilterChange: resetLoaded });

  // Sort change handler
  const handleSortChange = useCallback((newSortBy, newSortDirection) => {
    setAppSortConfig(prev => ({
      ...prev,
      [sortConfigKey]: { sortBy: newSortBy, sortDirection: newSortDirection }
    }));
    resetLoaded();
  }, [sortConfigKey, setAppSortConfig, resetLoaded]);

  const sortConfig = appSortConfig[sortConfigKey] || { sortBy: 'fileName', sortDirection: 'asc' };

  // Compute sorted and loaded data for display
  const sortedResults = useMemo(() =>
    sortFiles(filteredResults, sortConfig.sortBy, sortConfig.sortDirection),
    [filteredResults, sortConfig.sortBy, sortConfig.sortDirection]
  );

  // Load-more pagination (cumulative) - used for mobile in hybrid scrollable mode
  const loadedPages = appPage + 1;
  const { loadedData, loadedCount, hasMore, remaining } = useMemo(() =>
    calculateLoadMore(sortedResults, loadedPages, appPageSize),
    [sortedResults, loadedPages, appPageSize]
  );

  const loadMore = useCallback(() => setAppPage(prev => prev + 1), [setAppPage]);

  // Load all handler - sets page to load everything
  const loadAll = useCallback(() => {
    const totalPages = Math.ceil(sortedResults.length / appPageSize);
    setAppPage(totalPages - 1);
  }, [sortedResults.length, appPageSize, setAppPage]);

  // Gmail-style selection
  const { shownFullySelected, allItemsSelected, hasMoreToLoad,
          handleSelectShown, handleSelectAll, shownCount, totalCount } = usePageSelection({
    shownData: loadedData,
    allData: sortedResults,
    selectedCount,
    selectShown,
    selectAll,
    isShownFullySelected,
    hashKey: 'fileHash'
  });

  // Build columns with indexer filter dropdown in header (for Prowlarr)
  const columnsWithIndexerFilter = useMemo(() => {
    if (!isProwlarr) return null;

    // Modify the indexer column to use filter header dropdown
    return PROWLARR_RESULTS_COLUMNS.map(col => {
      if (col.key === 'indexer' && indexerOptions.length > 2) {
        return {
          ...col,
          sortable: false,
          headerRender: makeFilterHeaderRender(
            indexerFilter,
            (val) => { setIndexerFilter(val); resetLoaded(); },
            indexerOptions
          )
        };
      }
      return col;
    });
  }, [isProwlarr, indexerFilter, indexerOptions, resetLoaded]);

  // Count of downloadable (not already downloaded) selected items
  const downloadableCount = useMemo(() =>
    Array.from(selectedFiles).filter(hash => !dataDownloadedFiles.has(hash)).length,
    [selectedFiles, dataDownloadedFiles]
  );

  // Batch download handler — handles both aMule and Prowlarr results
  const handleBatchDownload = useCallback(async () => {
    const toDownload = Array.from(selectedFiles).filter(hash => !dataDownloadedFiles.has(hash));
    if (toDownload.length === 0) {
      clearAllSelections();
      return;
    }

    setDownloading(true);

    try {
      // Find full items from results to check if they're Prowlarr items
      const itemsToDownload = toDownload.map(hash => results.find(r => r.fileHash === hash)).filter(Boolean);
      const prowlarrItems = itemsToDownload.filter(item => item.isProwlarr);
      const amuleHashes = itemsToDownload.filter(item => !item.isProwlarr).map(item => item.fileHash);

      // Download aMule items via WebSocket batch action
      if (amuleHashes.length > 0) {
        actions.search.batchDownload(amuleHashes, searchDownloadCategory);
      }

      // Download Prowlarr items via REST API
      let prowlarrSuccessCount = 0;
      for (const item of prowlarrItems) {
        const success = await actions.search.addProwlarrTorrent(item, searchDownloadCategory);
        if (success) prowlarrSuccessCount++;
      }

      // Show success message for Prowlarr downloads (aMule shows via WebSocket)
      if (prowlarrSuccessCount > 0) {
        addAppSuccess(`Downloading ${prowlarrSuccessCount} torrent${prowlarrSuccessCount > 1 ? 's' : ''}`);
      }

      clearAllSelections();
    } finally {
      setDownloading(false);
    }
  }, [selectedFiles, dataDownloadedFiles, results, actions, searchDownloadCategory, clearAllSelections, addAppSuccess]);

  // Clear selection when results change (navigating between cached/live results)
  useEffect(() => { clearAllSelections(); }, [results]);

  // ============================================================================
  // MOBILE HEADER CONTENT (shared between sticky toolbar and in-page header)
  // ============================================================================
  // Determine client type for icon (only show if results exist)
  const clientType = isProwlarr ? 'prowlarr' : 'amule';

  // Show filter button only for Prowlarr with multiple indexers
  const showMobileFilterButton = isProwlarr && indexerOptions.length > 2;

  const mobileHeaderContent = useMemo(() =>
    h('div', { className: 'flex items-center gap-2' },
      results.length > 0 && h(ClientIcon, { client: clientType, size: 18 }),
      h('h2', { className: VIEW_TITLE_STYLES.mobile }, mobileTitle),
      h('span', { className: 'text-sm text-gray-500 dark:text-gray-400' }, `(${filteredResults.length})`),
      h('div', { className: 'flex-1' }),
      results.length > 0 && h(ExpandableSearch, {
        value: filterText,
        onChange: setFilterText,
        onClear: clearFilter,
        placeholder: 'Filter...',
        hiddenBeforeSearch: h(MobileSortButton, {
          columns: sortableColumns,
          sortBy: sortConfig.sortBy,
          sortDirection: sortConfig.sortDirection,
          onSortChange: handleSortChange,
          defaultSortBy: DEFAULT_SORT_CONFIG[sortConfigKey].sortBy,
          defaultSortDirection: DEFAULT_SORT_CONFIG[sortConfigKey].sortDirection
        }),
        hiddenWhenExpanded: extraMobileButtons
      }),
      results.length === 0 && extraMobileButtons
    ),
  [mobileTitle, filteredResults.length, results.length, filterText, setFilterText, clearFilter, sortConfig, handleSortChange, sortConfigKey, extraMobileButtons, sortableColumns, clientType]);

  // Register sticky toolbar for mobile scroll behavior
  const mobileHeaderRef = useStickyToolbar(mobileHeaderContent);

  return h('div', null,
    // Mobile header with inline controls
    h('div', { className: 'xl:hidden mb-2', ref: mobileHeaderRef },
      h('div', { className: showMobileFilterButton ? 'pb-2 border-b border-gray-200 dark:border-gray-700' : '' },
        mobileHeaderContent
      ),
      // Indexer filter button + pills on second line (Prowlarr only)
      showMobileFilterButton && h('div', { className: 'flex items-center gap-2 py-2 overflow-x-auto', style: { scrollbarWidth: 'none' } },
        h(MobileFilterButton, {
          onClick: handleFilterSheetOpen,
          activeCount: mobileIndexerFilters.length
        }),
        h(MobileFilterPills, {
          filters: activeFilterPills,
          onRemove: handleRemoveFilterPill,
          inline: true
        })
      )
    ),

    // Desktop header
    h('div', { className: 'hidden xl:flex items-center justify-between gap-2 mb-2' },
      h('div', { className: 'flex items-center gap-3' },
        results.length > 0 && h(ClientIcon, { client: clientType, size: 20 }),
        h('h2', { className: VIEW_TITLE_STYLES.desktop }, title),
        h('span', { className: 'text-sm text-gray-500 dark:text-gray-400' }, `(${filteredResults.length})`)
      ),
      h('div', { className: 'flex items-center gap-2' },
        results.length > 0 && h(FilterInput, {
          value: filterText,
          onChange: setFilterText,
          onClear: clearFilter,
          placeholder: 'Filter by file name...',
          className: 'w-56'
        }),
        extraDesktopButtons
      )
    ),

    // Search results list with checkboxes
    // Hybrid scrollable mode: desktop shows all items, mobile uses load-more
    h(SearchResultsList, {
      results: sortedResults,
      loadedData,
      sortConfig,
      onSortChange: handleSortChange,
      downloadedFiles: dataDownloadedFiles,
      selectedFiles,
      onToggleSelection: toggleFileSelection,
      // Load-more props for mobile in hybrid scrollable mode
      loadedCount,
      totalCount: sortedResults.length,
      hasMore,
      remaining,
      onLoadMore: loadMore,
      onLoadAll: loadAll,
      resetLoaded,
      pageSize: appPageSize,
      emptyMessage: filterText ? filterEmptyMessage : emptyMessage,
      isProwlarr,
      scrollHeight,
      // Custom columns with indexer filter dropdown (for Prowlarr)
      customColumns: columnsWithIndexerFilter
    }),

    // Selection mode footer with dynamic spacer
    h(SelectionModeSection, {
      active: selectedCount > 0,
      selectedCount,
      allItemsSelected,
      shownFullySelected,
      hasMoreToLoad,
      shownCount,
      totalCount,
      onSelectShown: handleSelectShown,
      onSelectAll: handleSelectAll,
      onClearAll: clearAllSelections
    },
      h(Select, {
        value: searchDownloadCategory,
        onChange: (e) => setSearchDownloadCategory(e.target.value),
        options: dataCategories.map(cat => ({ value: cat.name, label: cat.title || cat.name })),
        title: 'Select category for downloads'
      }),
      h(Button, {
        variant: 'success',
        icon: downloading ? null : 'download',
        iconSize: 14,
        onClick: handleBatchDownload,
        disabled: downloadableCount === 0 || downloading
      },
        downloading
          ? h('span', { className: 'flex items-center gap-2' },
              h('div', { className: 'loader', style: { width: '14px', height: '14px' } }),
              'Downloading...'
            )
          : `Download ${downloadableCount} file${downloadableCount !== 1 ? 's' : ''}`
      )
    ),

    // Mobile filter sheet for indexer selection (Prowlarr only)
    showMobileFilterButton && h(MobileFilterSheet, {
      show: showFilterSheet,
      onClose: () => setShowFilterSheet(false),
      onApply: handleFilterSheetApply,
      onClear: handleFilterSheetClear,
      filterGroups: [
        createIndexerFilter({
          indexerOptions,
          selectedValues: pendingIndexerFilters,
          onToggle: togglePendingFilter,
          show: true
        })
      ].filter(Boolean)
    })
  );
};

export default SearchResultsSection;
