/**
 * DownloadsView Component
 *
 * Displays current downloads with progress, categorization, and ED2K link input
 * Manages its own modals: fileCategoryModal, infoHash (FileInfoModal)
 * Uses contexts directly for all data and actions
 */

import React from 'https://esm.sh/react@18.2.0';
import { Table, ContextMenu, MoreButton, Button, Select, IconButton, SelectionModeSection, EmptyState, DownloadMobileCard, MobileStatusTabs, MobileFilterPills, MobileFilterSheet, MobileFilterButton, MobileSortButton, ExpandableSearch, FilterInput, SelectionCheckbox, Tooltip, Icon } from '../common/index.js';
import { getRowHighlightClass, DEFAULT_SORT_CONFIG, DEFAULT_SECONDARY_SORT_CONFIG, formatTitleCount, buildSpeedColumn, buildSizeColumn, buildFileNameColumn, buildStatusColumn, buildCategoryColumn, buildProgressColumn, buildSourcesColumn, buildAddedAtColumn, buildETAColumn, VIEW_TITLE_STYLES, createCategoryLabelFilter, createTrackerFilter } from '../../utils/index.js';
import { useModal, useViewDeleteModal, useBatchExport, useViewFilters, usePageSelection, useItemActions, useCategoryFilterOptions, useItemContextMenu, useColumnConfig, getSecondarySortConfig, useFileInfoModal, useFileCategoryModal } from '../../hooks/index.js';
import { useLiveData } from '../../contexts/LiveDataContext.js';
import { useStaticData } from '../../contexts/StaticDataContext.js';
import { useActions } from '../../contexts/ActionsContext.js';
import { useTheme } from '../../contexts/ThemeContext.js';
import { useStickyToolbar } from '../../contexts/StickyHeaderContext.js';
import AddDownloadModal from '../modals/AddDownloadModal.js';

const { createElement: h, useMemo, useCallback } = React;

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
    hashKey: 'hash'
  });

  // ============================================================================
  // MODAL STATE
  // ============================================================================
  // Info modal
  const { openFileInfo, FileInfoElement } = useFileInfoModal();

  // Add download modal
  const {
    modal: addDownloadModal,
    open: openAddDownloadModal,
    close: closeAddDownloadModal
  } = useModal({});

  // Delete modal with batch support and permission checking
  const {
    handleDeleteClick,
    handleBatchDeleteClick,
    selectedClientTypes,
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
    openFileInfo(download.hash);
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
  // CONTEXT MENU
  // ============================================================================
  const { handleRowContextMenu, getContextMenuItems } = useItemContextMenu({
    selectionMode,
    openContextMenu,
    onShowInfo: handleShowInfo,
    onDelete: (item) => handleDeleteClick(item.hash, item.name, item.client || 'amule'),
    onCategoryChange: (item) => openCategoryModal(item.hash, item.name, item.category || 'Default'),
    onPause: handlePause,
    onResume: handleResume,
    onStop: handleStop,
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
      onCategoryClick: openCategoryModal,
      disabled: selectionMode
    })
  ], [handleShowInfo, statusFilter, setStatusFilter, resetLoaded, statusOptions, theme, unifiedFilter, setUnifiedFilter, categoryFilterOptions, dataCategories, openCategoryModal, selectionMode]);

  // ============================================================================
  // COLUMN CONFIG (visibility and order)
  // ============================================================================
  const {
    visibleColumns,
    setShowConfig,
    ColumnConfigElement
  } = useColumnConfig('downloads', columns, {
    defaultHidden: ['size'],
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
          h(IconButton, {
            key: 'select',
            variant: selectionMode ? 'danger' : 'secondary',
            icon: selectionMode ? 'x' : 'fileCheck',
            iconSize: 18,
            onClick: toggleSelectionMode,
            title: selectionMode ? 'Exit Selection Mode' : 'Select Files'
          }),
          h(IconButton, {
            key: 'add',
            variant: 'success',
            icon: 'plus',
            iconSize: 18,
            onClick: openAddDownloadModal,
            title: 'Add Download'
          })
        ]
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
        showTrackerFilter && h(Select, {
          key: 'tracker',
          value: trackerFilter,
          onChange: (e) => setTrackerFilter(e.target.value),
          options: trackerOptions,
          title: 'Filter by tracker'
        }),
        h(Button, {
          key: 'select',
          variant: selectionMode ? 'danger' : 'purple',
          onClick: toggleSelectionMode,
          icon: selectionMode ? 'x' : 'fileCheck'
        }, selectionMode ? 'Exit Selection Mode' : 'Select Files'),
        h(Button, {
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
          return h(SelectionCheckbox, {
            checked: selectedFiles.has(item.hash),
            onChange: () => toggleFileSelection(item.hash)
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
      getRowKey: (item) => item.hash,
      getRowClassName: (item) => getRowHighlightClass(
        selectionMode && selectedFiles.has(item.hash),
        contextMenu.show && contextMenu.item?.hash === item.hash
      ),
      onRowContextMenu: handleRowContextMenu,
      onRowClick: selectionMode ? (item) => toggleFileSelection(item.hash) : null,
      breakpoint: 'xl',
      mobileCardStyle: 'card',
      mobileCardRender: (item, idx, showBadge, categoryStyle) => {
        return h(DownloadMobileCard, {
          key: item.hash,
          item,
          theme,
          showBadge,
          categoryStyle,
          idx,
          selectionMode,
          isSelected: selectionMode && selectedFiles.has(item.hash),
          isContextTarget: contextMenu.show && contextMenu.item?.hash === item.hash,
          onSelectionToggle: () => toggleFileSelection(item.hash),
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
      h(Button, { variant: 'warning', onClick: handleBatchPause, icon: 'pause', iconSize: 14 }, 'Pause'),
      h(Button, { variant: 'success', onClick: handleBatchResume, icon: 'play', iconSize: 14 }, 'Resume'),
      h(Tooltip, { content: !selectedClientTypes.has('rtorrent') ? 'Stop is only available for BitTorrent downloads' : 'Stop selected torrents', position: 'top' },
        h(Button, { variant: 'secondary', onClick: handleBatchStop, icon: 'stop', iconSize: 14, disabled: !selectedClientTypes.has('rtorrent') }, 'Stop')
      ),
      h(Button, { variant: 'orange', onClick: handleBatchSetCategory, icon: 'folder', iconSize: 14 }, 'Edit Category'),
      h(Button, { variant: batchCopyStatus === 'success' ? 'success' : 'purple', onClick: handleBatchExport, disabled: batchCopyStatus === 'success', icon: batchCopyStatus === 'success' ? 'check' : 'share', iconSize: 14 }, batchCopyStatus === 'success' ? 'Copied!' : 'Export Links'),
      h(Button, { variant: 'danger', onClick: handleBatchDeleteClick, icon: 'trash', iconSize: 14 }, 'Delete')
    ),

    // ========================================================================
    // MODALS
    // ========================================================================
    FileCategoryModalElement,

    FileInfoElement,

    DeleteModalElement,

    h(AddDownloadModal, {
      show: addDownloadModal.show,
      onAddEd2kLinks: (links, categoryId) => actions.search.addEd2kLinks(links.join('\n'), categoryId, false),
      onAddMagnetLinks: actions.search.addMagnetLinks,
      onAddTorrentFile: actions.search.addTorrentFile,
      onClose: closeAddDownloadModal
    }),

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
