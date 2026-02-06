/**
 * SharedView Component
 *
 * Displays shared files list with upload statistics
 * Uses contexts directly for all data and actions
 */

import React from 'https://esm.sh/react@18.2.0';
import { Icon, Table, ContextMenu, MoreButton, Button, IconButton, Select, SelectionModeSection, MobileCardHeader, EmptyState, ClientIcon, ItemMobileCard, MobileStatusTabs, MobileFilterPills, MobileFilterSheet, MobileFilterButton, MobileSortButton, ExpandableSearch, FilterInput, SelectionCheckbox, TrackerLabel } from '../common/index.js';
import { formatBytes, formatSpeed, getRowHighlightClass, getItemStatusInfo, calculateRatio, DEFAULT_SORT_CONFIG, DEFAULT_SECONDARY_SORT_CONFIG, formatTitleCount, buildSizeColumn, buildFileNameColumn, buildStatusColumn, buildCategoryColumn, buildRatioColumn, buildUploadSpeedColumn, buildUploadTotalColumn, buildAddedAtColumn, VIEW_TITLE_STYLES, createCategoryLabelFilter, createTrackerFilter } from '../../utils/index.js';
import { useLiveData } from '../../contexts/LiveDataContext.js';
import { useStaticData } from '../../contexts/StaticDataContext.js';
import { useDataFetch } from '../../contexts/DataFetchContext.js';
import { useViewDeleteModal, useBatchExport, useViewFilters, usePageSelection, useItemActions, useCategoryFilterOptions, useItemContextMenu, useColumnConfig, getSecondarySortConfig, useFileInfoModal, useFileCategoryModal } from '../../hooks/index.js';
import { useActions } from '../../contexts/ActionsContext.js';
import { useStickyToolbar } from '../../contexts/StickyHeaderContext.js';

const { createElement: h, useCallback, useMemo } = React;

/**
 * Shared files view component - now uses contexts directly
 */
const SharedView = () => {
  // ============================================================================
  // CONTEXT DATA
  // ============================================================================
  const { dataItems, dataLoaded } = useLiveData();
  const { dataCategories } = useStaticData();
  const { refreshSharedFiles } = useDataFetch();
  const actions = useActions();

  const amuleConfigEnabled = useMemo(() => {
    // Check if aMule is enabled via live data stats
    return dataItems.some(i => i.client === 'amule');
  }, [dataItems]);

  // ============================================================================
  // DERIVED DATA
  // ============================================================================
  const sharedFiles = useMemo(() => dataItems.filter(i => i.shared), [dataItems]);

  // ============================================================================
  // SECONDARY SORT CONFIG (read early, before useViewFilters)
  // ============================================================================
  const secondarySortConfig = getSecondarySortConfig('shared', DEFAULT_SECONDARY_SORT_CONFIG['shared']);

  // ============================================================================
  // FILTER CHAIN (client → tracker → status → mobile → table)
  // ============================================================================
  const {
    // Filtered/sorted data
    filteredData: filteredShared,
    sortedData: sortedShared,
    loadedData,  // For mobile selection in hybrid mode
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
    // Load-more pagination (for mobile in hybrid mode)
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
    data: sharedFiles,
    viewKey: 'shared',
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
    shownData: loadedData,  // Use loadedData for mobile selection behavior
    allData: sortedShared,
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

  // Delete modal with batch support and permission checking
  const {
    handleDeleteClick,
    handleBatchDeleteClick,
    DeleteModalElement
  } = useViewDeleteModal({
    dataArray: sharedFiles,
    selectedFiles,
    clearAllSelections
  });

  // Batch export with status feedback
  const { batchCopyStatus, handleBatchExport } = useBatchExport({
    selectedFiles,
    dataArray: sharedFiles
  });

  // Category modal
  const { openCategoryModal, handleBatchSetCategory, FileCategoryModalElement } = useFileCategoryModal({
    onSubmit: actions.categories.setFileCategory,
    getSelectedHashes,
    dataArray: sharedFiles
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
    dataArray: sharedFiles,
    selectedFiles,
    getSelectedHashes,
    rtorrentOnly: true
  });

  const handleShowInfo = useCallback((item) => {
    openFileInfo(item.hash);
  }, [openFileInfo]);

  // ============================================================================
  // BULK OPERATIONS
  // ============================================================================
  // Check if selection contains rtorrent items (for showing pause/resume buttons)
  const hasSelectedRtorrentItems = useMemo(() => {
    if (!selectionMode || selectedCount === 0) return false;
    return Array.from(selectedFiles).some(hash => {
      const file = sharedFiles.find(f => f.hash === hash);
      return file?.client === 'rtorrent';
    });
  }, [selectionMode, selectedCount, selectedFiles, sharedFiles]);

  // ============================================================================
  // CONTEXT MENU
  // ============================================================================
  const { handleRowContextMenu, getContextMenuItems } = useItemContextMenu({
    selectionMode,
    openContextMenu,
    closeContextMenu,
    onShowInfo: handleShowInfo,
    onDelete: (item) => handleDeleteClick(item.hash, item.name, item.client || 'amule'),
    onCategoryChange: (item) => openCategoryModal(item.hash, item.name, item.category || 'Default'),
    onPause: handlePause,
    onResume: handleResume,
    onStop: handleStop,
    onCopyLink: handleCopyLink,
    copiedHash,
    actionsForRtorrentOnly: true,
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
      statusOptions,
      defaultStatus: 'seeding'
    }),
    buildUploadSpeedColumn({ onClick: handleShowInfo, disabled: selectionMode }),
    buildSizeColumn({ showDone: false, width: '100px' }),
    buildRatioColumn({ calculateRatio }),
    buildUploadTotalColumn(),
    buildCategoryColumn({
      unifiedFilter,
      setUnifiedFilter,
      resetLoaded,
      filterOptions: categoryFilterOptions,
      categories: dataCategories,
      onCategoryClick: openCategoryModal,
      disabled: selectionMode
    })
  ], [handleShowInfo, statusFilter, setStatusFilter, resetLoaded, statusOptions, unifiedFilter, setUnifiedFilter, categoryFilterOptions, dataCategories, openCategoryModal, selectionMode]);

  // ============================================================================
  // COLUMN CONFIG (visibility and order)
  // ============================================================================
  const {
    visibleColumns,
    setShowConfig,
    ColumnConfigElement
  } = useColumnConfig('shared', columns, {
    defaultHidden: ['addedAt'],
    defaultSecondarySort: DEFAULT_SECONDARY_SORT_CONFIG['shared'],
    defaultPrimarySort: DEFAULT_SORT_CONFIG['shared'],
    onSortChange
  });

  // ============================================================================
  // MOBILE HEADER CONTENT (shared between sticky toolbar and in-page header)
  // ============================================================================
  const mobileHeaderContent = useMemo(() =>
    h('div', { className: 'flex items-center gap-2' },
      h('h2', { className: VIEW_TITLE_STYLES.mobile },
        `Shared (${formatTitleCount(filteredShared.length, sharedFiles.length)})`
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
          defaultSortBy: DEFAULT_SORT_CONFIG.shared.sortBy,
          defaultSortDirection: DEFAULT_SORT_CONFIG.shared.sortDirection
        }),
        hiddenWhenExpanded: h(IconButton, {
          key: 'select',
          variant: selectionMode ? 'danger' : 'secondary',
          icon: selectionMode ? 'x' : 'fileCheck',
          iconSize: 18,
          onClick: toggleSelectionMode,
          title: selectionMode ? 'Exit Selection Mode' : 'Select Files'
        })
      })
    ),
  [filteredShared.length, sharedFiles.length, filterText, setFilterText, clearFilter, columns, sortConfig, onSortChange, selectionMode, toggleSelectionMode]);

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
        totalCount: sharedFiles.length,
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
        `Shared Files (${formatTitleCount(filteredShared.length, sharedFiles.length)})`
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
        amuleConfigEnabled && h(Button, {
          key: 'reload',
          variant: 'success',
          onClick: refreshSharedFiles,
          disabled: !dataLoaded.items,
          title: 'Reload Shared Files'
        },
          dataLoaded.items && h(ClientIcon, { client: 'amule', size: 16, title: '' }),
          dataLoaded.items ? 'Reload Files' : h('span', { className: 'flex items-center gap-2' }, h('div', { className: 'loader' }), 'Loading...')
        ),
        h(Button, {
          key: 'select',
          variant: selectionMode ? 'danger' : 'purple',
          onClick: toggleSelectionMode,
          icon: selectionMode ? 'x' : 'fileCheck'
        }, selectionMode ? 'Exit Selection Mode' : 'Select Files')
      )
    ),

    // Main content: empty state or table
    filteredShared.length === 0 ? h(EmptyState, {
      loading: !dataLoaded.items,
      loadingMessage: 'Loading shared files...',
      hasFilters: !!(filterText || statusFilter !== 'all' || unifiedFilter !== 'all' || mobileFilters.mobileCategoryFilters.length > 0),
      filterMessage: 'No shared files match the current filters',
      emptyMessage: 'No shared files',
      onClearFilters: () => { clearFilter(); setStatusFilter('all'); setUnifiedFilter('all'); mobileFilters.setMobileCategoryFilters([]); }
    }) : h(Table, {
      data: sortedShared,
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
      totalCount: sortedShared.length,
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
        const isSelected = selectionMode && selectedFiles.has(item.hash);
        const isContextTarget = contextMenu.show && contextMenu.item?.hash === item.hash;

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
            // Detail rows
            h('div', { className: 'space-y-1 text-xs' },
              // Row 1: Uploaded - Session - Ratio - Tracker
              h('div', { className: 'flex items-center gap-1 text-gray-700 dark:text-gray-300 flex-wrap' },
                h(Icon, { name: 'upload', size: 12, className: 'text-gray-500 dark:text-gray-400' }),
                h('span', { className: 'text-gray-900 dark:text-gray-100' },
                  formatBytes(item.uploadTotal) + (item.requestsAcceptedTotal != null ? ` (${item.requestsAcceptedTotal})` : '')
                ),
                (() => {
                  const hasSession = item.client !== 'rtorrent' && item.uploadSession !== null && item.uploadSession > 0;
                  if (!hasSession) return null;
                  return [
                    h('span', { key: 'dot', className: 'text-gray-400' }, '·'),
                    h('span', { key: 'label', className: 'text-gray-500 dark:text-gray-400' }, 'Session:'),
                    h('span', { key: 'value', className: 'text-gray-900 dark:text-gray-100' },
                      formatBytes(item.uploadSession) + (item.requestsAccepted != null ? ` (${item.requestsAccepted})` : '')
                    )
                  ];
                })(),
                h('span', { className: 'text-gray-400' }, '·'),
                h('span', { className: 'text-gray-500 dark:text-gray-400' }, 'R:'),
                h('span', { className: 'text-gray-900 dark:text-gray-100' }, calculateRatio(item)),
                item.tracker && h('span', { className: 'text-gray-400' }, '·'),
                h(TrackerLabel, { tracker: item.tracker, maxWidth: 100 })
              ),
              // Row 2: Status (if not seeding) + Current speed + active peers
              (() => {
                const ulSpeed = item.uploadSpeed || 0;
                const activeUploads = (item.activeUploads || []).length;
                const statusInfo = getItemStatusInfo(item);
                const showStatus = statusInfo.key !== 'seeding';
                const hasSpeed = ulSpeed > 0 || activeUploads > 0;
                const errorMessage = statusInfo.key === 'error' ? item.message : null;

                // Hide row entirely if nothing to show
                if (!showStatus && !hasSpeed) return null;

                return h('div', { className: 'flex items-center gap-1 text-gray-700 dark:text-gray-300 min-w-0' },
                  // Status icon + label (only if not seeding)
                  showStatus && h(Icon, { name: statusInfo.icon, size: 12, className: `flex-shrink-0 ${statusInfo.iconClass}` }),
                  showStatus && h('span', { className: `flex-shrink-0 ${statusInfo.labelClass || 'text-gray-600 dark:text-gray-400'}` }, statusInfo.label || 'Active'),
                  // Error message inline with truncation
                  errorMessage && h('span', { className: 'text-red-600 dark:text-red-400 truncate min-w-0', title: errorMessage }, `- ${errorMessage}`),
                  // Dot separator between status and speed
                  showStatus && hasSpeed && h('span', { className: 'flex-shrink-0 text-gray-400' }, '·'),
                  // Speed (only if uploading) - animated arrow when actively uploading
                  hasSpeed && ulSpeed > 0
                    ? h('span', { className: 'flex-shrink-0 arrow-animated arrow-up' }, h(Icon, { name: 'arrowUp', size: 12, className: 'text-green-600 dark:text-green-400' }))
                    : hasSpeed && h(Icon, { name: 'arrowUp', size: 12, className: 'flex-shrink-0 text-green-600 dark:text-green-400' }),
                  hasSpeed && h('span', { className: 'flex-shrink-0 text-green-600 dark:text-green-400 font-mono' }, formatSpeed(ulSpeed)),
                  activeUploads > 0 && h('span', { className: 'flex-shrink-0 text-gray-400' }, '·'),
                  activeUploads > 0 && h('span', { className: 'flex-shrink-0 text-gray-500 dark:text-gray-400' },
                    `${activeUploads} active ${activeUploads === 1 ? 'peer' : 'peers'}`
                  )
                );
              })()
            )
          )
        );
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
      hasSelectedRtorrentItems && h(Button, { variant: 'warning', onClick: handleBatchPause, icon: 'pause', iconSize: 14 }, 'Pause'),
      hasSelectedRtorrentItems && h(Button, { variant: 'success', onClick: handleBatchResume, icon: 'play', iconSize: 14 }, 'Resume'),
      hasSelectedRtorrentItems && h(Button, { variant: 'secondary', onClick: handleBatchStop, icon: 'stop', iconSize: 14 }, 'Stop'),
      h(Button, { variant: 'orange', onClick: handleBatchSetCategory, icon: 'folder', iconSize: 14 }, 'Edit Category'),
      h(Button, { variant: batchCopyStatus === 'success' ? 'success' : 'purple', onClick: handleBatchExport, disabled: batchCopyStatus === 'success', icon: batchCopyStatus === 'success' ? 'check' : 'share', iconSize: 14 }, batchCopyStatus === 'success' ? 'Copied!' : 'Export Links'),
      h(Button, { variant: 'danger', onClick: handleBatchDeleteClick, icon: 'trash', iconSize: 14 }, 'Delete')
    ),

    // ========================================================================
    // MODALS & OVERLAYS
    // ========================================================================
    h(ContextMenu, {
      show: contextMenu.show,
      x: contextMenu.x,
      y: contextMenu.y,
      items: getContextMenuItems(contextMenu.item),
      onClose: closeContextMenu,
      anchorEl: contextMenu.anchorEl
    }),

    FileInfoElement,

    FileCategoryModalElement,

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

    DeleteModalElement,

    // Column config modal
    ColumnConfigElement
  );
};

export default SharedView;
