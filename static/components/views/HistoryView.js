/**
 * HistoryView Component
 *
 * Displays download history with status tracking
 * Shows all downloads that have been started, with their current status
 * Uses client-side filtering and pagination (same pattern as other views)
 */

import React from 'https://esm.sh/react@18.2.0';
import { Icon, Table, DeleteModal, Button, Select, Tooltip, TrackerLabel, MobileCardHeader, IconButton, SelectionModeSection, ContextMenu, MoreButton, EmptyState, MobileSortButton, ExpandableSearch, FilterInput, MobileFilterPills, MobileFilterSheet, MobileFilterButton, ItemMobileCard, MobileStatusTabs, SelectionCheckbox } from '../common/index.js';
import { formatBytes, formatDateTime, formatTimeAgo, formatSpeed, formatRatio, getRowHighlightClass, HISTORY_STATUS_CONFIG, DEFAULT_SORT_CONFIG, DEFAULT_SECONDARY_SORT_CONFIG, buildSpeedColumn, buildTransferColumn, buildSizeColumn, buildRatioColumn, buildFileNameColumn, buildStatusColumn, buildCategoryColumn, buildAddedAtColumn, VIEW_TITLE_STYLES, createCategoryLabelFilter, createTrackerFilter } from '../../utils/index.js';
import { useLiveData } from '../../contexts/LiveDataContext.js';
import { useStaticData } from '../../contexts/StaticDataContext.js';
import { useDataFetch } from '../../contexts/DataFetchContext.js';
import { useViewFilters, useColumnConfig, getSecondarySortConfig, useFileInfoModal, usePageSelection, useCategoryFilterOptions, useItemContextMenu } from '../../hooks/index.js';
import { useStickyToolbar } from '../../contexts/StickyHeaderContext.js';

const { createElement: h, useState, useEffect, useMemo, useCallback } = React;

/**
 * Status Badge Component
 */
const StatusBadge = ({ status, completedTime, startedTime }) => {
  const config = HISTORY_STATUS_CONFIG[status] || HISTORY_STATUS_CONFIG.missing;

  let label = config.label;
  if (status === 'completed' && completedTime) {
    label = completedTime;
  } else if (status === 'downloading' && startedTime) {
    label = `Since ${startedTime}`;
  }

  return h('span', {
    className: `inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.bgColor} ${config.textColor}`
  },
    h(Icon, { name: config.icon, size: 12 }),
    label
  );
};

/**
 * History View Component
 */
const HistoryView = () => {
  // ============================================================================
  // CONTEXT DATA
  // ============================================================================
  const { dataHistory, historyLoading, dataItems, dataLoaded } = useLiveData();
  const { dataCategories: categories, historyTrackUsername } = useStaticData();
  const { startHistoryRefresh, stopHistoryRefresh, fetchHistory } = useDataFetch();

  // Start/stop history refresh on mount/unmount
  useEffect(() => {
    startHistoryRefresh();
    return () => stopHistoryRefresh();
  }, [startHistoryRefresh, stopHistoryRefresh]);

  // ============================================================================
  // SORT CONFIG
  // ============================================================================
  const secondarySortConfig = getSecondarySortConfig('history', DEFAULT_SECONDARY_SORT_CONFIG['history']);

  // ============================================================================
  // VIEW FILTERS (same pattern as Downloads/Shared/Uploads views)
  // ============================================================================
  const {
    // Data
    sortedData: sortedHistory,
    loadedData,
    // Client filter
    isRtorrentEnabled,
    // Category filter (unified)
    unifiedFilter,
    setUnifiedFilter,
    // Tracker filter
    trackerFilter,
    setTrackerFilter,
    showTrackerFilter,
    trackerOptions,
    // Status filter
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
    // Selection
    selectionMode,
    selectedFiles,
    selectedCount,
    toggleSelectionMode,
    enterSelectionWithItem,
    toggleFileSelection,
    clearAllSelections,
    selectAll,
    selectShown,
    isShownFullySelected,
    getSelectedHashes,
    // Context menu
    contextMenu,
    openContextMenu,
    closeContextMenu
  } = useViewFilters({
    data: dataHistory,
    viewKey: 'history',
    secondarySort: secondarySortConfig,
    getStatusKey: (item) => item.status
  });

  const sortBy = sortConfig.sortBy;
  const sortDirection = sortConfig.sortDirection;

  // ============================================================================
  // PAGE SELECTION
  // ============================================================================
  const {
    shownFullySelected,
    allItemsSelected,
    hasMoreToLoad,
    handleSelectShown,
    handleSelectAll,
    shownCount,
    totalCount: totalFilteredCount
  } = usePageSelection({
    shownData: loadedData,
    allData: sortedHistory,
    selectedCount,
    selectShown,
    selectAll,
    isShownFullySelected,
    hashKey: 'hash'
  });

  // ============================================================================
  // MODAL STATE
  // ============================================================================
  const [itemToDelete, setItemToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [batchDeleteCount, setBatchDeleteCount] = useState(0);
  const { openFileInfo, FileInfoElement } = useFileInfoModal();

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================
  const findFileInLiveData = useCallback((historyItem) => {
    if (!historyItem?.hash) return false;
    const hash = historyItem.hash.toLowerCase();
    return dataItems.some(i => i.hash?.toLowerCase() === hash);
  }, [dataItems]);

  const handleShowInfo = useCallback((item) => {
    openFileInfo(item.hash);
  }, [openFileInfo]);

  // Context menu using shared hook
  const { handleRowContextMenu, getContextMenuItems } = useItemContextMenu({
    selectionMode,
    openContextMenu,
    closeContextMenu,
    onShowInfo: handleShowInfo,
    canShowInfo: findFileInLiveData,
    onDelete: (item) => setItemToDelete(item),
    deleteLabel: 'Delete from History',
    onSelect: enterSelectionWithItem
  });

  // ============================================================================
  // DELETE OPERATIONS
  // ============================================================================
  const handleBatchDelete = useCallback(() => {
    const hashes = getSelectedHashes();
    if (hashes.length === 0) return;
    setBatchDeleteCount(hashes.length);
    setItemToDelete({ hash: hashes, name: `${hashes.length} entries`, isBatch: true });
  }, [getSelectedHashes]);

  const handleConfirmDelete = useCallback(async () => {
    if (!itemToDelete) return;

    setDeleting(true);
    try {
      if (itemToDelete.isBatch) {
        const hashes = itemToDelete.hash;
        await Promise.all(
          hashes.map(hash =>
            fetch(`/api/history/${hash}`, { method: 'DELETE' })
              .then(res => res.ok)
              .catch(() => false)
          )
        );
        clearAllSelections();
        toggleSelectionMode();
      } else {
        await fetch(`/api/history/${itemToDelete.hash}`, { method: 'DELETE' });
      }
      // Refresh history data
      fetchHistory(false);
    } catch (err) {
      console.error('Failed to delete:', err);
    } finally {
      setDeleting(false);
      setItemToDelete(null);
      setBatchDeleteCount(0);
    }
  }, [itemToDelete, fetchHistory, clearAllSelections, toggleSelectionMode]);

  // ============================================================================
  // FILTER OPTIONS
  // Category filter options (uses unified category system)
  const categoryFilterOptions = useCategoryFilterOptions();

  // ============================================================================
  // COLUMN DEFINITIONS
  // ============================================================================
  const columns = useMemo(() => [
    buildAddedAtColumn({
      width: '120px',
      showUsername: historyTrackUsername,
      selectionMode: () => selectionMode
    }),
    buildFileNameColumn({
      onClick: handleShowInfo,
      disabled: (item) => selectionMode || !findFileInLiveData(item)
    }),
    buildSizeColumn({ showDone: false, width: '100px' }),
    buildStatusColumn({
      statusFilter,
      setStatusFilter,
      resetLoaded,
      statusOptions,
      width: '145px',
      render: (item) => {
        const badge = h(StatusBadge, {
          status: item.status,
          completedTime: item.status === 'completed' && item.completedAt ? formatTimeAgo(item.completedAt) : null
        });
        if (selectionMode) return badge;
        return item.status === 'completed' && item.completedAt
          ? h(Tooltip, { content: formatDateTime(item.completedAt) },
              h('span', { className: 'cursor-help' }, badge)
            )
          : badge;
      }
    }),
    buildSpeedColumn({ compact: true }),
    buildTransferColumn(),
    buildRatioColumn(),
    buildCategoryColumn({
      unifiedFilter,
      setUnifiedFilter,
      resetLoaded,
      filterOptions: categoryFilterOptions,
      categories
    }),
  ], [historyTrackUsername, findFileInLiveData, handleShowInfo, selectionMode, categories, unifiedFilter, setUnifiedFilter, categoryFilterOptions, resetLoaded, statusFilter, setStatusFilter, statusOptions]);

  // ============================================================================
  // COLUMN CONFIG
  // ============================================================================
  const {
    visibleColumns,
    setShowConfig,
    ColumnConfigElement
  } = useColumnConfig('history', columns, {
    defaultHidden: ['category'],
    defaultSecondarySort: DEFAULT_SECONDARY_SORT_CONFIG['history'],
    defaultPrimarySort: DEFAULT_SORT_CONFIG['history'],
    onSortChange
  });

  // ============================================================================
  // MOBILE CARD RENDERER
  // ============================================================================
  const renderMobileCard = useCallback((item, idx, showBadge, categoryStyle) => {
    const hasLiveData = (item.downloadSpeed || 0) > 0 || (item.uploadSpeed || 0) > 0;
    const isSelected = selectionMode && selectedFiles.has(item.hash);
    const isContextTarget = contextMenu.show && contextMenu.item?.hash === item.hash;

    const renderStatusBadge = () => {
      const badge = h(StatusBadge, {
        status: item.status,
        completedTime: item.status === 'completed' && item.completedAt ? formatTimeAgo(item.completedAt) : null,
        startedTime: item.status === 'downloading' && item.addedAt ? formatTimeAgo(item.addedAt) : null
      });
      if (selectionMode) return badge;
      if (item.status === 'completed' && item.completedAt) {
        return h(Tooltip, { content: `Completed: ${formatDateTime(item.completedAt)}` },
          h('span', { className: 'cursor-help' }, badge)
        );
      }
      if (item.status === 'downloading' && item.addedAt) {
        return h(Tooltip, { content: `Started: ${formatDateTime(item.addedAt)}` },
          h('span', { className: 'cursor-help' }, badge)
        );
      }
      return badge;
    };

    return h(ItemMobileCard, {
      isSelected,
      isContextTarget,
      idx,
      categoryStyle,
      selectionMode,
      onSelectionToggle: () => toggleFileSelection(item.hash)
    },
      h(MobileCardHeader, {
        showBadge,
        clientType: item.client,
        fileName: item.name,
        fileSize: item.size,
        selectionMode,
        isSelected,
        onSelectionToggle: () => toggleFileSelection(item.hash),
        onNameClick: (e, anchorEl) => openContextMenu(e, item, anchorEl),
        actions: h(MoreButton, {
          onClick: (e) => openContextMenu(e, item, e.currentTarget)
        })
      },
        h('div', { className: 'space-y-1 text-xs mt-1' },
          // Row 1: Status, Added time, Tracker, Username
          h('div', { className: 'flex items-center gap-2 flex-wrap -ml-1' },
            renderStatusBadge(),
            item.addedAt && item.status !== 'completed' && item.status !== 'downloading' && (
              selectionMode
                ? h('span', {
                    className: 'px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                  }, 'Added ', formatTimeAgo(item.addedAt))
                : h(Tooltip, { content: formatDateTime(item.addedAt) },
                    h('span', {
                      className: 'px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 cursor-help'
                    }, 'Added ', formatTimeAgo(item.addedAt))
                  )
            ),
            h(TrackerLabel, { tracker: item.trackerDomain }),
            historyTrackUsername && item.username && h('span', {
              className: 'flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
            },
              h(Icon, { name: 'user', size: 10, className: 'text-purple-500 dark:text-purple-400' }),
              item.username
            )
          ),
          // Row 2: Total transferred - Ratio
          (item.downloaded > 0 || item.uploaded > 0 || (item.ratio !== null && item.ratio > 0)) && h('div', { className: 'flex items-center gap-1 text-gray-700 dark:text-gray-300 flex-wrap' },
            (item.downloaded > 0 || item.uploaded > 0) && h('span', { className: 'flex items-center font-mono gap-1' },
              h(Icon, { name: 'download', size: 12, className: 'text-blue-600 dark:text-blue-400' }),
              h('span', null, formatBytes(item.downloaded || 0)),
              h('span', { className: 'text-gray-400' }, '·'),
              h(Icon, { name: 'upload', size: 12, className: 'text-green-600 dark:text-green-400' }),
              h('span', null, formatBytes(item.uploaded || 0))
            ),
            (item.downloaded > 0 || item.uploaded > 0) && item.ratio !== null && item.ratio > 0 && h('span', { className: 'text-gray-400' }, '·'),
            item.ratio !== null && item.ratio > 0 && h('span', { className: 'text-gray-900 dark:text-gray-100' },
              `R: ${formatRatio(item.ratio)}`
            )
          ),
          // Row 3: Current DL/UP speed (only if > 0)
          hasLiveData && h('div', { className: 'flex items-center gap-1 text-gray-700 dark:text-gray-300' },
            h('span', { className: 'flex items-center font-mono gap-1' },
              h('span', { className: 'text-blue-600 dark:text-blue-400 flex items-center' },
                item.downloadSpeed > 0
                  ? h('span', { className: 'arrow-animated' }, h(Icon, { name: 'arrowDown', size: 12 }))
                  : h(Icon, { name: 'arrowDown', size: 12 }),
                ' ', item.downloadSpeed > 0 ? formatSpeed(item.downloadSpeed) : '-'
              ),
              h('span', { className: 'text-gray-400' }, '·'),
              h('span', { className: 'text-green-600 dark:text-green-400 flex items-center' },
                item.uploadSpeed > 0
                  ? h('span', { className: 'arrow-animated arrow-up' }, h(Icon, { name: 'arrowUp', size: 12 }))
                  : h(Icon, { name: 'arrowUp', size: 12 }),
                ' ', item.uploadSpeed > 0 ? formatSpeed(item.uploadSpeed) : '-'
              )
            )
          )
        )
      )
    );
  }, [selectionMode, selectedFiles, contextMenu.show, contextMenu.item, historyTrackUsername, toggleFileSelection, openContextMenu]);

  // ============================================================================
  // MOBILE HEADER
  // ============================================================================
  const totalCount = sortedHistory.length;

  const mobileHeaderContent = useMemo(() =>
    h('div', { className: 'flex items-center gap-2' },
      h('h2', { className: VIEW_TITLE_STYLES.mobile },
        `History (${totalCount})`
      ),
      h('div', { className: 'flex-1' }),
      h(ExpandableSearch, {
        value: filterText,
        onChange: setFilterText,
        placeholder: 'Search...',
        hiddenBeforeSearch: h(MobileSortButton, {
          columns: columns,
          sortBy,
          sortDirection,
          onSortChange,
          defaultSortBy: DEFAULT_SORT_CONFIG.history.sortBy,
          defaultSortDirection: DEFAULT_SORT_CONFIG.history.sortDirection
        }),
        hiddenWhenExpanded: h(IconButton, {
          variant: selectionMode ? 'danger' : 'secondary',
          icon: selectionMode ? 'x' : 'fileCheck',
          iconSize: 18,
          onClick: toggleSelectionMode,
          title: selectionMode ? 'Exit Selection Mode' : 'Select Items'
        })
      })
    ),
  [totalCount, filterText, setFilterText, columns, sortBy, sortDirection, onSortChange, selectionMode, toggleSelectionMode]);

  const mobileHeaderRef = useStickyToolbar(mobileHeaderContent);

  // ============================================================================
  // RENDER
  // ============================================================================
  return h('div', { className: 'space-y-2 sm:space-y-3 px-2 sm:px-0' },
    // Mobile header (xl:hidden)
    h('div', { className: 'xl:hidden', ref: mobileHeaderRef },
      h('div', { className: 'pb-2 border-b border-gray-200 dark:border-gray-700' },
        mobileHeaderContent
      ),
      // Status tabs + filter button
      h(MobileStatusTabs, {
        activeTab: statusFilter,
        statusCounts,
        totalCount,
        onTabChange: (key) => { setStatusFilter(key); resetLoaded(); },
        leadingContent: (categories.length > 0 || (isRtorrentEnabled && trackerOptions.length > 1)) && h(MobileFilterButton, {
          onClick: mobileFilters.handleFilterSheetOpen,
          activeCount: mobileFilters.mobileCategoryFilters.length
        })
      }),
      // Filter pills
      mobileFilters.activeFilterPills.length > 0 && h(MobileFilterPills, {
        filters: mobileFilters.activeFilterPills,
        onRemove: mobileFilters.handleRemoveFilterPill
      })
    ),

    // Desktop header (hidden xl:flex)
    h('div', { className: 'hidden xl:flex items-center justify-between gap-4' },
      h('h2', { className: VIEW_TITLE_STYLES.desktop },
        `Download History (${totalCount})`
      ),
      h('div', { className: 'flex items-center gap-2' },
        h(FilterInput, {
          value: filterText,
          onChange: setFilterText,
          placeholder: 'Filter...'
        }),
        showTrackerFilter && h(Select, {
          value: trackerFilter || 'all',
          onChange: (e) => {
            setTrackerFilter(e.target.value);
            resetLoaded();
          },
          options: trackerOptions
        }),
        h(Button, {
          variant: selectionMode ? 'danger' : 'purple',
          onClick: toggleSelectionMode,
          icon: selectionMode ? 'x' : 'fileCheck'
        }, selectionMode ? 'Exit Selection Mode' : 'Select Items')
      )
    ),

    // Main content
    loadedData.length === 0
      ? h(EmptyState, {
          loading: !dataLoaded.history,
          loadingMessage: 'Loading history...',
          icon: 'history',
          hasFilters: !!(filterText || statusFilter !== 'all' || unifiedFilter !== 'all' || mobileFilters.mobileCategoryFilters.length > 0),
          filterMessage: 'No history entries match the current filters',
          emptyMessage: 'No download history yet',
          onClearFilters: () => { clearFilter(); setStatusFilter('all'); setUnifiedFilter('all'); mobileFilters.setMobileCategoryFilters([]); }
        })
      : h(Table, {
          data: loadedData,
          columns: visibleColumns,
          scrollable: true,
          showCategoryBorder: true,
          trackerLabelColumnKey: 'filename',
          hoverActions: !selectionMode,
          actionsHeader: h('button', {
            onClick: () => setShowConfig(true),
            className: 'p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors',
            title: 'Configure columns'
          }, h(Icon, { name: 'tableConfig', size: 16, className: 'text-gray-500 dark:text-gray-400' })),
          actions: (item) => {
            if (selectionMode) {
              return h(SelectionCheckbox, {
                checked: selectedFiles.has(item.hash),
                onChange: () => toggleFileSelection(item.hash)
              });
            }
            const hasLiveFile = !!findFileInLiveData(item);
            return h('div', { className: 'flex items-center gap-1' },
              hasLiveFile && h('button', {
                onClick: (e) => { e.stopPropagation(); handleShowInfo(item); },
                className: 'p-1.5 rounded bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors',
                title: 'View file details'
              }, h(Icon, { name: 'info', size: 14, className: 'text-blue-600 dark:text-blue-400' })),
              h('button', {
                onClick: (e) => { e.stopPropagation(); setItemToDelete(item); },
                className: 'p-1.5 rounded bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors',
                title: 'Delete from history'
              }, h(Icon, { name: 'trash', size: 14, className: 'text-red-600 dark:text-red-400' }))
            );
          },
          currentSortBy: sortBy,
          currentSortDirection: sortDirection,
          onSortChange,
          // Load-more pagination (client-side)
          loadedCount,
          totalCount,
          hasMore,
          remaining,
          onLoadMore: loadMore,
          onLoadAll: loadAll,
          resetLoaded,
          pageSize,
          onPageSizeChange,
          skipSort: selectionMode || contextMenu.show,
          getRowKey: (item) => item.hash,
          getRowClassName: (item) => getRowHighlightClass(
            selectionMode && selectedFiles.has(item.hash),
            contextMenu.show && contextMenu.item?.hash === item.hash
          ),
          onRowContextMenu: handleRowContextMenu,
          onRowClick: selectionMode ? (item) => toggleFileSelection(item.hash) : null,
          breakpoint: 'xl',
          mobileCardRender: renderMobileCard,
          mobileCardStyle: 'card',
          beforePagination: null
        }),

    // Selection mode section
    h(SelectionModeSection, {
      active: selectionMode,
      selectedCount,
      shownFullySelected,
      allItemsSelected,
      hasMoreToLoad,
      shownCount,
      totalCount: totalFilteredCount,
      onSelectShown: handleSelectShown,
      onSelectAll: handleSelectAll,
      onClearAll: clearAllSelections,
      onExit: toggleSelectionMode
    },
      h(Button, { variant: 'danger', onClick: handleBatchDelete, icon: 'trash', iconSize: 14, disabled: selectedCount === 0 }, 'Delete')
    ),

    // ========================================================================
    // MODALS & OVERLAYS
    // ========================================================================
    h(DeleteModal, {
      show: !!itemToDelete,
      onCancel: () => {
        setItemToDelete(null);
        setBatchDeleteCount(0);
      },
      onConfirm: handleConfirmDelete,
      title: itemToDelete?.isBatch ? 'Delete History Entries' : 'Delete History Entry',
      itemName: !itemToDelete?.isBatch ? itemToDelete?.name : null,
      itemCount: itemToDelete?.isBatch ? batchDeleteCount : null,
      isBatch: itemToDelete?.isBatch,
      message: 'Are you sure you want to delete ',
      skipFileMessages: true
    }),

    FileInfoElement,

    h(ContextMenu, {
      show: contextMenu.show,
      x: contextMenu.x,
      y: contextMenu.y,
      items: getContextMenuItems(contextMenu.item),
      onClose: closeContextMenu,
      anchorEl: contextMenu.anchorEl
    }),

    h(MobileFilterSheet, {
      show: mobileFilters.showFilterSheet,
      onClose: () => mobileFilters.setShowFilterSheet(false),
      onApply: mobileFilters.handleFilterSheetApply,
      onClear: mobileFilters.handleFilterSheetClear,
      filterGroups: [
        createCategoryLabelFilter({
          categories,
          selectedValues: mobileFilters.pendingCategoryFilters,
          onToggle: mobileFilters.togglePendingFilter
        }),
        createTrackerFilter({
          trackerOptions,
          selectedValues: mobileFilters.pendingCategoryFilters,
          onToggle: mobileFilters.togglePendingFilter,
          show: showTrackerFilter
        })
      ]
    }),

    // Column config modal
    ColumnConfigElement
  );
};

export default HistoryView;
