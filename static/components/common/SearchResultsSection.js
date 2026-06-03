/**
 * SearchResultsSection Component
 *
 * Shared component for displaying search results with header controls.
 * Provides multi-selection with checkboxes and a fixed bottom download bar.
 * Used by both SearchView (cached results) and SearchResultsView (live results)
 */

import React from 'https://esm.sh/react@18.2.0';
import { SearchResultsList, SEARCH_RESULTS_COLUMNS, PROWLARR_RESULTS_COLUMNS, FilterInput, MobileSortButton, ExpandableSearch, Select, Button, Icon, SelectionModeSection, ClientIcon, MobileFilterSheet, MobileFilterPills, MobileFilterButton, LoadingSpinner, Tooltip } from './index.js';
import { DEFAULT_SORT_CONFIG, sortFiles, calculateLoadMore, VIEW_TITLE_STYLES, makeFilterHeaderRender, createIndexerFilter, formatBytes } from '../../utils/index.js';
import { useAppState } from '../../contexts/AppStateContext.js';
import { useStaticData } from '../../contexts/StaticDataContext.js';
import { useSearch } from '../../contexts/SearchContext.js';
import { useActions } from '../../contexts/ActionsContext.js';
import { useTextFilter, useSelectionMode, usePageSelection, useBitTorrentClientSelector } from '../../hooks/index.js';
import { useStickyToolbar } from '../../contexts/StickyHeaderContext.js';
import { useCapabilities } from '../../hooks/useCapabilities.js';
import BitTorrentClientSelector from './BitTorrentClientSelector.js';

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
  const { dataDownloadedFiles, setDataDownloadedFiles, downloadedAliasRef, dataCategories } = useStaticData();
  const { searchDownloadCategory, setSearchDownloadCategory, searchInstanceId } = useSearch();
  const actions = useActions();
  const { hasCap } = useCapabilities();
  const canAddDownloads = hasCap('add_downloads');

  // Detect if results are from Prowlarr
  const isProwlarr = useMemo(() => results.length > 0 && results[0].isProwlarr, [results]);
  const sortableColumns = isProwlarr ? PROWLARR_RESULTS_COLUMNS : SEARCH_RESULTS_COLUMNS;

  // BitTorrent client selector for Prowlarr results
  const { connectedClients, showClientSelector, selectedClientId, selectedClient, selectClient, hasBitTorrentClient } = useBitTorrentClientSelector();

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

  // Detect if results are from slskd
  const isSlskd = useMemo(() => results.length > 0 && results[0].isSlskd, [results]);

  // Track which slskd folder groups are expanded
  const [expandedFolders, setExpandedFolders] = useState(new Set());

  // Reset expanded folders when results change
  useEffect(() => { setExpandedFolders(new Set()); }, [results]);

  const toggleFolderExpand = useCallback((folderKey) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderKey)) next.delete(folderKey);
      else next.add(folderKey);
      return next;
    });
  }, []);

  // Number of unique folder groups (for header count)
  const slskdFolderCount = useMemo(() => {
    if (!isSlskd) return 0;
    return new Set(filteredResults.map(r => `${r.username || ''}|${r.directoryPath || ''}`)).size;
  }, [isSlskd, filteredResults]);

  // For slskd: group files into folder rows; expand/collapse shows individual files
  const displayedResults = useMemo(() => {
    if (!isSlskd) return sortedResults;

    // Build insertion-order groups (order follows first occurrence in sortedResults)
    const groupMap = new Map();
    for (const item of sortedResults) {
      const key = `${item.username || ''}|${item.directoryPath || ''}`;
      if (!groupMap.has(key)) {
        const dirParts = (item.directoryPath || '').split('/').filter(Boolean);
        const folderName = dirParts[dirParts.length - 1] || item.directoryPath || item.username || 'Unknown';
        groupMap.set(key, {
          _isFolder: true,
          _folderKey: key,
          fileHash: `folder:${key}`,
          username: item.username || '',
          directoryPath: item.directoryPath || '',
          folderName,
          fileName: folderName,
          fileCount: 0,
          fileSize: 0,
          sourceCount: 0,
          _files: [],
          isSlskd: true
        });
      }
      const g = groupMap.get(key);
      g.fileCount++;
      g.fileSize += item.fileSize || 0;
      g._files.push(item);
    }

    const out = [];
    for (const folder of groupMap.values()) {
      folder._expanded = expandedFolders.has(folder._folderKey);
      out.push(folder);
      if (folder._expanded) {
        for (const file of folder._files) {
          out.push({ ...file, _isChild: true, _parentKey: folder._folderKey });
        }
      }
    }
    return out;
  }, [isSlskd, sortedResults, expandedFolders]);

  // Load-more pagination (cumulative) - used for mobile in hybrid scrollable mode
  const loadedPages = appPage + 1;
  const { loadedData, loadedCount, hasMore, remaining } = useMemo(() =>
    calculateLoadMore(displayedResults, loadedPages, appPageSize),
    [displayedResults, loadedPages, appPageSize]
  );

  const loadMore = useCallback(() => setAppPage(prev => prev + 1), [setAppPage]);

  // Load all handler - sets page to load everything
  const loadAll = useCallback(() => {
    const totalPages = Math.ceil(displayedResults.length / appPageSize);
    setAppPage(totalPages - 1);
  }, [displayedResults.length, appPageSize, setAppPage]);

  // Gmail-style selection
  const { shownFullySelected, allItemsSelected, hasMoreToLoad,
          handleSelectShown, handleSelectAll, shownCount, totalCount } = usePageSelection({
    // For slskd folder grouping: use raw file results (not grouped) for selection tracking
    shownData: isSlskd ? sortedResults : loadedData,
    allData: isSlskd ? sortedResults : displayedResults,
    selectedCount,
    selectShown,
    selectAll,
    isShownFullySelected,
    hashKey: 'fileHash'
  });

  // Build columns with indexer filter dropdown in header (for Prowlarr)
  // and folder grouping for slskd results
  const columnsWithIndexerFilter = useMemo(() => {
    if (isSlskd) {
      return [
        {
          key: 'fileName',
          label: 'Name / File',
          sortable: true,
          width: 'auto',
          render: (item) => {
            if (item._isFolder) {
              const expanded = expandedFolders.has(item._folderKey);
              return h('div', { className: 'flex items-center gap-1.5 min-w-0' },
                h('button', {
                  type: 'button',
                  className: `shrink-0 w-4 h-4 flex items-center justify-center transition-colors
                    ${expanded ? 'text-purple-500 dark:text-purple-400' : 'text-gray-400 dark:text-gray-500 hover:text-purple-500 dark:hover:text-purple-400'}`,
                  title: expanded ? `Collapse: ${item.directoryPath}` : `Expand: ${item.directoryPath}`,
                  onClick: (e) => { e.stopPropagation(); toggleFolderExpand(item._folderKey); }
                }, h(Icon, { name: expanded ? 'chevronDown' : 'chevronRight', size: 12 })),
                h(Icon, { name: 'folder', size: 13, className: 'shrink-0 text-amber-400 dark:text-amber-500' }),
                h('span', {
                  className: 'font-semibold text-xs text-gray-900 dark:text-gray-100 truncate ml-0.5',
                  title: `${item.username}: ${item.directoryPath}`
                }, item.folderName)
              );
            }
            // Child row: indented with file icon
            const baseName = String(item.fileName || '').split(/[\/\\]/).pop() || item.fileName || '';
            return h('div', { className: 'flex items-center gap-1.5 min-w-0 pl-5' },
              h(Icon, { name: 'file', size: 11, className: 'shrink-0 text-gray-400 dark:text-gray-500' }),
              h('span', {
                className: 'text-xs break-words min-w-0',
                style: { wordBreak: 'break-all', overflowWrap: 'anywhere' }
              }, baseName)
            );
          }
        },
        {
          key: 'username',
          label: 'User',
          sortable: true,
          width: '120px',
          render: (item) => item._isFolder
            ? h('span', { className: 'text-xs text-gray-500 dark:text-gray-400 truncate block', title: item.username }, item.username)
            : null
        },
        {
          key: 'fileSize',
          label: 'Size',
          sortable: true,
          width: '90px',
          render: (item) => h('span', { className: 'text-xs' }, formatBytes(item.fileSize || 0))
        },
        {
          key: 'sourceCount',
          label: 'Files / Info',
          sortable: false,
          width: '100px',
          render: (item) => {
            if (item._isFolder) {
              return h('span', { className: 'text-xs text-gray-500 dark:text-gray-400' },
                `${item.fileCount} file${item.fileCount !== 1 ? 's' : ''}`
              );
            }
            const parts = [];
            if (item.bitrate) parts.push(`${item.bitrate}kbps`);
            if (item.length) {
              parts.push(`${Math.floor(item.length / 60)}:${String(item.length % 60).padStart(2, '0')}`);
            }
            return h('span', { className: 'text-xs text-gray-400 dark:text-gray-500' }, parts.join(' ') || '—');
          }
        }
      ];
    }

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
  }, [isProwlarr, isSlskd, indexerFilter, indexerOptions, resetLoaded, expandedFolders, toggleFolderExpand]);

  // Folder-aware selection toggle: clicking a folder hash selects/deselects all its children
  const handleToggleSelection = useCallback((fileHash) => {
    if (typeof fileHash === 'string' && fileHash.startsWith('folder:')) {
      const folderKey = fileHash.slice(7);
      const folderItem = displayedResults.find(item => item._isFolder && item._folderKey === folderKey);
      if (!folderItem?._files?.length) return;
      const childHashes = folderItem._files.map(f => f.fileHash);
      const allSelected = childHashes.every(h => selectedFiles.has(h));
      const current = Array.from(selectedFiles);
      if (allSelected) {
        const toRemove = new Set(childHashes);
        selectAll(current.filter(h => !toRemove.has(h)));
      } else {
        selectAll(Array.from(new Set([...current, ...childHashes])));
      }
      return;
    }
    toggleFileSelection(fileHash);
  }, [displayedResults, selectedFiles, selectAll, toggleFileSelection]);

  // Count of downloadable (not already downloaded on the selected client) selected items
  const activeInstanceId = isProwlarr ? selectedClientId : searchInstanceId;
  const downloadableCount = useMemo(() =>
    Array.from(selectedFiles).filter(hash => {
      const instances = dataDownloadedFiles.get(hash);
      return !instances || !activeInstanceId || !instances.has(activeInstanceId);
    }).length,
    [selectedFiles, dataDownloadedFiles, activeInstanceId]
  );

  // Batch download handler — handles both aMule and Prowlarr results
  const handleBatchDownload = useCallback(async () => {
    const toDownload = Array.from(selectedFiles).filter(hash => {
      const instances = dataDownloadedFiles.get(hash);
      return !instances || !activeInstanceId || !instances.has(activeInstanceId);
    });
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
      // API returns the real info hash — store GUID for UI checkmark and
      // record realHash → GUID alias so delete handler can remove both
      let prowlarrSuccessCount = 0;
      const prowlarrGuids = [];
      for (const item of prowlarrItems) {
        const result = await actions.search.addProwlarrTorrent(item, searchDownloadCategory, selectedClientId, selectedClient?.type);
        if (result) {
          prowlarrSuccessCount++;
          prowlarrGuids.push(item.fileHash);
          if (typeof result === 'string') {
            downloadedAliasRef.current.set(result, item.fileHash);
          }
        }
      }

      if (prowlarrSuccessCount > 0) {
        setDataDownloadedFiles(prev => {
          const next = new Map(prev);
          prowlarrGuids.forEach(h => {
            const instances = next.get(h) || new Set();
            instances.add(selectedClientId || 'unknown');
            next.set(h, instances);
          });
          return next;
        });
        addAppSuccess(`Downloading ${prowlarrSuccessCount} torrent${prowlarrSuccessCount > 1 ? 's' : ''}`);
      }

      clearAllSelections();
    } finally {
      setDownloading(false);
    }
  }, [selectedFiles, dataDownloadedFiles, setDataDownloadedFiles, results, actions, searchDownloadCategory, selectedClientId, clearAllSelections, addAppSuccess]);

  // Clear selection when results change (navigating between cached/live results)
  useEffect(() => { clearAllSelections(); }, [results]);

  // ============================================================================
  // MOBILE HEADER CONTENT (shared between sticky toolbar and in-page header)
  // ============================================================================
  // Determine client type for icon (only show if results exist)
  const clientType = isProwlarr ? 'prowlarr' : isSlskd ? 'slskd' : 'amule';

  // Show filter button only for Prowlarr with multiple indexers
  const showMobileFilterButton = isProwlarr && indexerOptions.length > 2;

  const mobileHeaderContent = useMemo(() =>
    h('div', { className: 'flex items-center gap-2' },
      results.length > 0 && h(ClientIcon, { client: clientType, size: 18 }),
      h('h2', { className: VIEW_TITLE_STYLES.mobile }, mobileTitle),
      h('span', { className: 'text-sm text-gray-500 dark:text-gray-400' },
        isSlskd
          ? `(${slskdFolderCount} folder${slskdFolderCount !== 1 ? 's' : ''}, ${filteredResults.length} files)`
          : `(${filteredResults.length})`
      ),
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
        h('span', { className: 'text-sm text-gray-500 dark:text-gray-400' },
          isSlskd
            ? `(${slskdFolderCount} folder${slskdFolderCount !== 1 ? 's' : ''}, ${filteredResults.length} files)`
            : `(${filteredResults.length})`
        )
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
      results: displayedResults,
      loadedData,
      sortConfig,
      onSortChange: handleSortChange,
      downloadedFiles: dataDownloadedFiles,
      activeInstanceId,
      connectedClientIds: isProwlarr ? connectedClients.map(c => c.id) : [activeInstanceId],
      selectedFiles,
      onToggleSelection: handleToggleSelection,
      onToggleFolderExpand: toggleFolderExpand,
      // Load-more props for mobile in hybrid scrollable mode
      loadedCount,
      totalCount: displayedResults.length,
      hasMore,
      remaining,
      onLoadMore: loadMore,
      onLoadAll: loadAll,
      resetLoaded,
      pageSize: appPageSize,
      emptyMessage: filterText ? filterEmptyMessage : emptyMessage,
      isProwlarr,
      scrollHeight,
      // Custom columns with indexer filter dropdown (for Prowlarr) / directory expand (for slskd)
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
      // Show BitTorrent client selector for Prowlarr results when 2+ clients are connected
      isProwlarr && canAddDownloads && h(BitTorrentClientSelector, {
        connectedClients,
        selectedClientId,
        onSelectClient: selectClient,
        showSelector: showClientSelector,
        label: null,
        variant: connectedClients.length >= 4 ? 'dropdown' : 'buttons'
      }),
      canAddDownloads && h(Select, {
        value: searchDownloadCategory,
        onChange: (e) => setSearchDownloadCategory(e.target.value),
        options: dataCategories.map(cat => ({ value: cat.name, label: cat.title || cat.name })),
        title: 'Select category for downloads'
      }),
      canAddDownloads && (() => {
        const isDisabled = downloadableCount === 0 || downloading || (isProwlarr && !hasBitTorrentClient);
        const disabledReason = !downloading && isDisabled
          ? (isProwlarr && !hasBitTorrentClient ? 'No BitTorrent client connected' : downloadableCount === 0 && selectedFiles.size > 0 ? 'Already downloaded on the selected client' : null)
          : null;
        const btn = h(Button, {
          variant: 'success',
          icon: downloading ? null : 'download',
          iconSize: 14,
          onClick: handleBatchDownload,
          disabled: isDisabled
        },
          downloading
            ? h('span', { className: 'flex items-center gap-2' },
                h(LoadingSpinner, { size: 14 }),
                'Downloading...'
              )
            : `Download ${downloadableCount} file${downloadableCount !== 1 ? 's' : ''}`
        );
        return disabledReason ? h(Tooltip, { content: disabledReason, position: 'top' }, btn) : btn;
      })()
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
