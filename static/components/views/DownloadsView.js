/**
 * DownloadsView Component
 *
 * Displays current downloads with progress, categorization, and ED2K link input
 * Manages its own modals: fileCategoryModal, infoHash (FileInfoModal)
 * Uses contexts directly for all data and actions
 */

import React from 'https://esm.sh/react@18.2.0';
import { Table, ContextMenu, MoreButton, Button, Select, TrackerMultiSelect, IconButton, SelectionModeSection, EmptyState, DownloadMobileCard, MobileStatusTabs, MobileFilterPills, MobileFilterSheet, MobileFilterButton, MobileSortButton, ExpandableSearch, FilterInput, SelectionCheckbox, Tooltip, Icon } from '../common/index.js';
import { getRowHighlightClass, DEFAULT_SORT_CONFIG, DEFAULT_SECONDARY_SORT_CONFIG, formatTitleCount, buildSpeedColumn, buildSizeColumn, buildFileNameColumn, buildStatusColumn, buildCategoryColumn, buildProgressColumn, buildSourcesColumn, buildAddedAtColumn, buildETAColumn, buildDownloadPathColumn, VIEW_TITLE_STYLES, createCategoryLabelFilter, createTrackerFilter } from '../../utils/index.js';
import { itemKey } from '../../utils/itemKey.js';
import { useViewDeleteModal, useBatchExport, useViewFilters, usePageSelection, useItemActions, useCategoryFilterOptions, useItemContextMenu, useColumnConfig, getSecondarySortConfig, useFileInfoModal, useFileCategoryModal, useFileMoveModal, useFileRenameModal } from '../../hooks/index.js';
import { useLiveData } from '../../contexts/LiveDataContext.js';
import { useStaticData } from '../../contexts/StaticDataContext.js';
import { useActions } from '../../contexts/ActionsContext.js';
import { useTheme } from '../../contexts/ThemeContext.js';
import { useStickyToolbar } from '../../contexts/StickyHeaderContext.js';
import { useCapabilities } from '../../hooks/useCapabilities.js';
import { useWebSocketConnection } from '../../contexts/WebSocketContext.js';
import { useAddDownload } from '../../contexts/AddDownloadContext.js';

const { createElement: h, useMemo, useCallback, useEffect } = React;

/**
 * Downloads view component - now uses contexts directly
 */
const DownloadsView = () => {
  // ============================================================================
  // CONTEXT DATA
  // ============================================================================
  const { dataItems, dataLoaded: liveDataLoaded } = useLiveData();
  const { dataCategories } = useStaticData();
  const actions = useActions();
  const { theme } = useTheme();
  const { hasCap } = useCapabilities();
  const { subscribe, unsubscribe } = useWebSocketConnection();
  const hasAnyMutationCap = hasCap('pause_resume') || hasCap('remove_downloads') || hasCap('assign_categories');

  // Subscribe to segment data (gapStatus/reqStatus) for SegmentsBar in ProgressBar
  useEffect(() => {
    subscribe('segmentData');
    return () => unsubscribe('segmentData');
  }, [subscribe, unsubscribe]);

  // Ownership check: user can mutate item if they have edit_all_downloads or own it
  const canMutateItem = useCallback((item) => hasCap('edit_all_downloads') || item.ownedByMe !== false, [hasCap]);

  const dataLoaded = { downloads: liveDataLoaded.items };

  // ============================================================================
  // DERIVED DATA
  // ============================================================================
  const downloads = useMemo(() => dataItems.filter(i => i.downloading), [dataItems]);

  // ============================================================================
  // SECONDARY SORT CONFIG (read early, before useViewFilters)
  // ============================================================================
  const secondarySortConfig = getSecondarySortConfig('downloads', DEFAULT_SECONDARY_SORT_CONFIG['downloads']);

  // ============================================================================
  // FILTER CHAIN (client → tracker → status → mobile → table)
  // ============================================================================
  const {
    // Filtered/sorted data
    filteredData: filteredDownloads,
    sortedData: sortedDownloads,
    loadedData,  // For mobile load-more in hybrid scrollable mode
    // Client filter (ED2K/BT toggle)
    unifiedFilter,
    setUnifiedFilter,
    // Tracker filter (array)
    trackerFilters,
    toggleTrackerFilter,
    resetTrackerFilter,
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
    // Selection mode
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
    data: downloads,
    viewKey: 'downloads',
    secondarySort: secondarySortConfig
  });

  // ============================================================================
  // PAGE SELECTION (Gmail-style select shown / select all)
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
    allData: sortedDownloads,
    selectedCount,
    selectShown,
    selectAll,
    isShownFullySelected,
    hashKey: 'hash',
    selectableFilter: canMutateItem
  });

  // ============================================================================
  // MODAL STATE
  // ============================================================================
  // Info modal
  const { openFileInfo, FileInfoElement } = useFileInfoModal();
  // Rename modal
  const { openRenameModal, FileRenameElement } = useFileRenameModal();

  // Add download modal (global — rendered in AppContent)
  const { openAddDownloadModal } = useAddDownload();

  // Delete modal with batch support and permission checking
  const {
    handleDeleteClick,
    handleBatchDeleteClick,
    selectedClientTypes,
    selectedNetworkTypes,
    DeleteModalElement
  } = useViewDeleteModal({
    dataArray: downloads,
    selectedFiles,
    clearAllSelections
  });

  // Batch export with status feedback
  const { batchCopyStatus, handleBatchExport } = useBatchExport({
    selectedFiles,
    dataArray: downloads
  });

  // ============================================================================
  // ITEM ACTIONS (single + batch)
  // ============================================================================
  const {
    copiedHash,
    handlePause,
    handleResume,
    handleStop,
    handleCopyLink,
    handleBatchPause,
    handleBatchResume,
    handleBatchStop
  } = useItemActions({
    dataArray: downloads,
    selectedFiles,
    getSelectedHashes
  });

  const handleShowInfo = useCallback((download) => {
    openFileInfo(download.hash, download.instanceId);
  }, [openFileInfo]);

  // ============================================================================
  // CATEGORY MODAL
  // ============================================================================
  const { openCategoryModal, handleBatchSetCategory, FileCategoryModalElement } = useFileCategoryModal({
    onSubmit: actions.categories.setFileCategory,
    getSelectedHashes,
    dataArray: downloads
  });

  // ============================================================================
  // MOVE MODAL
  // ============================================================================
  const { openMoveModal, handleBatchMove, FileMoveModalElement } = useFileMoveModal({
    getSelectedHashes,
    dataArray: downloads
  });

  // ============================================================================
  // CONTEXT MENU
  // ============================================================================
  const { handleRowContextMenu, getContextMenuItems } = useItemContextMenu({
    selectionMode,
    openContextMenu,
    onShowInfo: handleShowInfo,
    onDelete: hasCap('remove_downloads') ? (item) => handleDeleteClick(item.hash, item.name, item.client || 'amule', item.instanceId) : null,
    onCategoryChange: (item) => openCategoryModal(item.hash, item.name, item.category || 'Default', item.instanceId),
    onMoveTo: openMoveModal,
    onPause: handlePause,
    onResume: handleResume,
    onStop: handleStop,
    onRename: openRenameModal,
    onCopyLink: handleCopyLink,
    copiedHash,
    infoLabel: 'Download Details',
    onSelect: enterSelectionWithItem
  });

  // ============================================================================
  // COLUMN DEFINITIONS
  // ============================================================================
  // Use unified category filter options (no separate amule/rtorrent filters)
  const categoryFilterOptions = useCategoryFilterOptions();

  const columns = useMemo(() => [
    buildAddedAtColumn(),
    buildFileNameColumn({ onClick: handleShowInfo, disabled: selectionMode }),
    buildStatusColumn({
      statusFilter,
      setStatusFilter,
      resetLoaded,
      statusOptions
    }),
    buildSpeedColumn({ onItemClick: handleShowInfo, disabled: selectionMode }),
    buildProgressColumn({ theme }),
    buildETAColumn(),
    buildSizeColumn(),
    buildSourcesColumn({ onClick: handleShowInfo, disabled: selectionMode }),
    buildCategoryColumn({
      unifiedFilter,
      setUnifiedFilter,
      resetLoaded,
      filterOptions: categoryFilterOptions,
      categories: dataCategories,
      onCategoryClick: hasCap('assign_categories') ? openCategoryModal : null,
      disabled: (item) => selectionMode || !canMutateItem(item)
    }),
    buildDownloadPathColumn()
  ], [handleShowInfo, statusFilter, setStatusFilter, resetLoaded, statusOptions, theme, unifiedFilter, setUnifiedFilter, categoryFilterOptions, dataCategories, openCategoryModal, selectionMode, hasCap, canMutateItem]);

  // ============================================================================
  // COLUMN CONFIG (visibility and order)
  // ============================================================================
  const {
    visibleColumns,
    setShowConfig,
    ColumnConfigElement
  } = useColumnConfig('downloads', columns, {
    defaultHidden: ['size', 'downloadPath'],
    defaultSecondarySort: DEFAULT_SECONDARY_SORT_CONFIG['downloads'],
    defaultPrimarySort: DEFAULT_SORT_CONFIG['downloads'],
    onSortChange
  });

  // ============================================================================
  // MOBILE HEADER CONTENT (shared between sticky toolbar and in-page header)
  // ============================================================================
  const mobileHeaderContent = useMemo(() =>
    h('div', { className: 'flex items-center gap-2' },
      h('h2', { className: VIEW_TITLE_STYLES.mobile },
        `Downloads (${formatTitleCount(filteredDownloads.length, downloads.length)})`
      ),
      h('div', { className: 'flex-1' }),
      h(ExpandableSearch, {
        value: filterText,
        onChange: setFilterText,
        onClear: clearFilter || undefined,
        placeholder: 'Filter...',
        hiddenBeforeSearch: h(MobileSortButton, {
          columns,
          sortBy: sortConfig.sortBy,
          sortDirection: sortConfig.sortDirection,
          onSortChange,
          defaultSortBy: DEFAULT_SORT_CONFIG.downloads.sortBy,
          defaultSortDirection: DEFAULT_SORT_CONFIG.downloads.sortDirection
        }),
        hiddenWhenExpanded: [
          hasAnyMutationCap && h(IconButton, {
            key: 'select',
            variant: selectionMode ? 'danger' : 'secondary',
            icon: selectionMode ? 'x' : 'fileCheck',
            iconSize: 18,
            onClick: toggleSelectionMode,
            title: selectionMode ? 'Exit Selection Mode' : 'Select Files'
          }),
          hasCap('add_downloads') && h(IconButton, {
            key: 'add',
            variant: 'success',
            icon: 'plus',
            iconSize: 18,
            onClick: openAddDownloadModal,
            title: 'Add Download'
          })
        ].filter(Boolean)
      })
    ),
  [filteredDownloads.length, downloads.length, filterText, setFilterText, clearFilter, columns, sortConfig, onSortChange, selectionMode, toggleSelectionMode, openAddDownloadModal]);

  // Register sticky toolbar for mobile scroll behavior
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
        totalCount: downloads.length,
        onTabChange: (key) => { setStatusFilter(key); resetLoaded(); },
        leadingContent: h(MobileFilterButton, {
          onClick: mobileFilters.handleFilterSheetOpen,
          activeCount: mobileFilters.mobileCategoryFilters.length
        })
      }),
      // Filter pills
      h(MobileFilterPills, {
        filters: mobileFilters.activeFilterPills,
        onRemove: mobileFilters.handleRemoveFilterPill
      })
    ),

    // Desktop header (hidden xl:flex)
    h('div', { className: 'hidden xl:flex justify-between items-center gap-3' },
      h('h2', { className: VIEW_TITLE_STYLES.desktop },
        `Downloads (${formatTitleCount(filteredDownloads.length, downloads.length)})`
      ),
      h('div', { className: 'flex gap-2' },
        h(FilterInput, {
          value: filterText,
          onChange: setFilterText,
          onClear: clearFilter || undefined,
          placeholder: 'Filter by file name...',
          className: 'w-56'
        }),
        showTrackerFilter && h(TrackerMultiSelect, {
          key: 'tracker',
          values: trackerFilters,
          onToggle: toggleTrackerFilter,
          onClear: resetTrackerFilter,
          options: trackerOptions,
          title: 'Filter by tracker'
        }),
        hasAnyMutationCap && h(Button, {
          key: 'select',
          variant: selectionMode ? 'danger' : 'purple',
          onClick: toggleSelectionMode,
          icon: selectionMode ? 'x' : 'fileCheck'
        }, selectionMode ? 'Exit Selection Mode' : 'Select Files'),
        hasCap('add_downloads') && h(Button, {
          key: 'add',
          variant: 'success',
          onClick: openAddDownloadModal,
          icon: 'plus'
        }, 'Add')
      )
    ),

    // Main content: empty state or table
    filteredDownloads.length === 0 ? h(EmptyState, {
      loading: !dataLoaded.downloads,
      loadingMessage: 'Loading downloads...',
      hasFilters: !!(filterText || unifiedFilter !== 'all' || statusFilter !== 'all' || mobileFilters.mobileCategoryFilters.length > 0),
      filterMessage: 'No downloads match the current filters',
      emptyMessage: 'No active downloads',
      onClearFilters: () => { clearFilter(); setUnifiedFilter('all'); setStatusFilter('all'); mobileFilters.setMobileCategoryFilters([]); }
    // Hybrid scrollable mode: desktop shows all items in scrollable table,
    // mobile uses load-more pagination for natural page scrolling
    }) : h(Table, {
      data: sortedDownloads,
      columns: visibleColumns,
      scrollable: true,
      showCategoryBorder: true,
      trackerLabelColumnKey: 'name',
      actionsHeader: h('button', {
        onClick: () => setShowConfig(true),
        className: 'p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors',
        title: 'Configure columns'
      }, h(Icon, { name: 'tableConfig', size: 16, className: 'text-gray-500 dark:text-gray-400' })),
      actions: (item) => {
        if (selectionMode) {
          const key = itemKey(item.instanceId, item.hash);
          const canSelect = canMutateItem(item);
          return h(SelectionCheckbox, {
            checked: selectedFiles.has(key),
            onChange: canSelect ? () => toggleFileSelection(key) : undefined,
            disabled: !canSelect
          });
        }
        return h(MoreButton, {
          onClick: (e) => openContextMenu(e, item, e.currentTarget)
        });
      },
      currentSortBy: sortConfig.sortBy,
      currentSortDirection: sortConfig.sortDirection,
      onSortChange,
      // Load-more props for mobile in hybrid scrollable mode
      loadedCount,
      totalCount: sortedDownloads.length,
      hasMore,
      remaining,
      onLoadMore: loadMore,
      onLoadAll: loadAll,
      resetLoaded,
      pageSize,
      onPageSizeChange,
      skipSort: selectionMode || contextMenu.show,
      getRowKey: (item) => itemKey(item.instanceId, item.hash),
      getRowClassName: (item) => getRowHighlightClass(
        selectionMode && selectedFiles.has(itemKey(item.instanceId, item.hash)),
        contextMenu.show && contextMenu.item?.hash === item.hash && contextMenu.item?.instanceId === item.instanceId
      ),
      onRowContextMenu: handleRowContextMenu,
      onRowClick: selectionMode ? (item) => { if (canMutateItem(item)) toggleFileSelection(itemKey(item.instanceId, item.hash)); } : null,
      breakpoint: 'xl',
      mobileCardStyle: 'card',
      mobileCardRender: (item, idx, showBadge, categoryStyle) => {
        return h(DownloadMobileCard, {
          key: itemKey(item.instanceId, item.hash),
          item,
          theme,
          showBadge,
          categoryStyle,
          idx,
          selectionMode,
          isSelected: selectionMode && selectedFiles.has(itemKey(item.instanceId, item.hash)),
          isContextTarget: contextMenu.show && contextMenu.item?.hash === item.hash && contextMenu.item?.instanceId === item.instanceId,
          onSelectionToggle: canMutateItem(item) ? () => toggleFileSelection(itemKey(item.instanceId, item.hash)) : undefined,
          onNameClick: (e, anchorEl) => openContextMenu(e, item, anchorEl),
          onMoreClick: (e) => openContextMenu(e, item, e.currentTarget)
        });
      },
      beforePagination: null
    }),

    // Selection mode section (spacer + footer)
    h(SelectionModeSection, {
      active: selectionMode,
      selectedCount,
      allItemsSelected,
      shownFullySelected,
      hasMoreToLoad,
      shownCount,
      totalCount: totalFilteredCount,
      onSelectShown: handleSelectShown,
      onSelectAll: handleSelectAll,
      onClearAll: clearAllSelections,
      onExit: toggleSelectionMode
    },
      hasCap('pause_resume') && h(Button, { variant: 'warning', onClick: handleBatchPause, icon: 'pause', iconSize: 14 }, 'Pause'),
      hasCap('pause_resume') && h(Button, { variant: 'success', onClick: handleBatchResume, icon: 'play', iconSize: 14 }, 'Resume'),
      hasCap('pause_resume') && (!selectedNetworkTypes.has('bittorrent')
        ? h(Tooltip, { content: 'Stop is only available for BitTorrent downloads', position: 'top' },
            h(Button, { variant: 'secondary', onClick: handleBatchStop, icon: 'stop', iconSize: 14, disabled: true }, 'Stop')
          )
        : h(Button, { variant: 'secondary', onClick: handleBatchStop, icon: 'stop', iconSize: 14 }, 'Stop')
      ),
      hasCap('assign_categories') && h(Button, { variant: 'orange', onClick: handleBatchSetCategory, icon: 'folder', iconSize: 14 }, 'Edit Category'),
      hasCap('edit_downloads') && h(Button, { variant: 'cyan', onClick: handleBatchMove, icon: 'folderOpen', iconSize: 14 }, 'Move to...'),
      h(Button, { variant: batchCopyStatus === 'success' ? 'success' : 'purple', onClick: handleBatchExport, disabled: batchCopyStatus === 'success', icon: batchCopyStatus === 'success' ? 'check' : 'share', iconSize: 14 }, batchCopyStatus === 'success' ? 'Copied!' : 'Export Links'),
      hasCap('remove_downloads') && h(Button, { variant: 'danger', onClick: handleBatchDeleteClick, icon: 'trash', iconSize: 14 }, 'Delete')
    ),

    // ========================================================================
    // MODALS
    // ========================================================================
    FileCategoryModalElement,

    FileMoveModalElement,

    FileInfoElement,

    FileRenameElement,

    DeleteModalElement,

    // Mobile filter sheet
    h(MobileFilterSheet, {
      show: mobileFilters.showFilterSheet,
      onClose: () => mobileFilters.setShowFilterSheet(false),
      onApply: mobileFilters.handleFilterSheetApply,
      onClear: mobileFilters.handleFilterSheetClear,
      filterGroups: [
        createCategoryLabelFilter({
          categories: dataCategories,
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

    // Context menu
    h(ContextMenu, {
      show: contextMenu.show,
      x: contextMenu.x,
      y: contextMenu.y,
      items: getContextMenuItems(contextMenu.item),
      onClose: closeContextMenu,
      anchorEl: contextMenu.anchorEl
    }),

    // Column config modal
    ColumnConfigElement
  );
};

export default DownloadsView;
