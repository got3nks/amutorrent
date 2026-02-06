/**
 * UploadsView Component
 *
 * Displays current uploads with client information
 * Uses contexts directly for all data and actions
 */

import React from 'https://esm.sh/react@18.2.0';
import { Icon, Table, FlagIcon, MobileCardHeader, Select, ContextMenu, MoreButton, EmptyState, ItemMobileCard, MobileSortButton, ExpandableSearch, FilterInput, MobileFilterPills, MobileFilterSheet, MobileFilterButton, TrackerLabel } from '../common/index.js';
import { formatBytes, formatSpeed, getClientSoftware, getIpString, getRowHighlightClass, DEFAULT_SORT_CONFIG, DEFAULT_SECONDARY_SORT_CONFIG, formatTitleCount, buildFileNameColumn, buildSizeColumn, buildUploadSpeedColumn, buildUploadTotalColumn, buildClientColumn, buildCategoryColumn, VIEW_TITLE_STYLES, createCategoryLabelFilter, createTrackerFilter } from '../../utils/index.js';
import { useLiveData } from '../../contexts/LiveDataContext.js';
import { useStaticData } from '../../contexts/StaticDataContext.js';
import { useViewFilters, useCategoryFilterOptions, useColumnConfig, getSecondarySortConfig, useFileInfoModal } from '../../hooks/index.js';
import { useStickyToolbar } from '../../contexts/StickyHeaderContext.js';

const { createElement: h, useCallback, useMemo } = React;

/**
 * Uploads view component - displays active upload peers
 */
const UploadsView = () => {
  // ============================================================================
  // CONTEXT DATA
  // ============================================================================
  const { dataItems, dataLoaded } = useLiveData();
  const { dataCategories } = useStaticData();

  // ============================================================================
  // DERIVED DATA
  // ============================================================================
  // Flatten upload peers from all items
  const uploadPeers = useMemo(() => dataItems.flatMap(item =>
    (item.activeUploads || []).map(peer => ({
      ...peer,
      // Parent item fields
      name: item.name,
      size: item.size,
      hash: item.hash,
      client: item.client,
      tracker: item.tracker,
      categoryId: item.client === 'amule' ? (item.categoryId ?? 0) : undefined,
      category: item.category,
      parentItem: item,
      parentHash: item.hash
    }))
  ), [dataItems]);

  // ============================================================================
  // SECONDARY SORT CONFIG (read early, before useViewFilters)
  // ============================================================================
  const secondarySortConfig = getSecondarySortConfig('uploads', DEFAULT_SECONDARY_SORT_CONFIG['uploads']);

  // ============================================================================
  // FILTER CHAIN (with status filter and selection disabled)
  // ============================================================================
  const {
    // Filtered/sorted data
    filteredData: filteredUploads,
    sortedData: sortedUploads,
    loadedData,  // For mobile load-more in hybrid scrollable mode
    // Client/Category filter
    unifiedFilter,
    setUnifiedFilter,
    hasRtorrent: hasRtorrentUploads,
    hasAmule: hasAmuleUploads,
    // Tracker filter
    trackerFilter,
    setTrackerFilter,
    showTrackerFilter,
    trackerOptions,
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
    // Context menu
    contextMenu,
    openContextMenu,
    closeContextMenu
  } = useViewFilters({
    data: uploadPeers,
    viewKey: 'uploads',
    secondarySort: secondarySortConfig,
    disableStatusFilter: true,
    disableSelection: true,
    rowKeyField: 'id'
  });

  // ============================================================================
  // MODAL STATE
  // ============================================================================
  const { openFileInfo, FileInfoElement } = useFileInfoModal();

  // ============================================================================
  // SINGLE ITEM ACTIONS
  // ============================================================================
  const handleShowInfo = useCallback((uploadItem) => {
    if (uploadItem.parentHash) {
      openFileInfo(uploadItem.parentHash);
    }
  }, [openFileInfo]);

  // ============================================================================
  // CONTEXT MENU
  // ============================================================================
  const handleRowContextMenu = useCallback((e, item) => {
    const hasParentFile = !!item.parentHash;
    if (!hasParentFile) return;
    openContextMenu(e, item);
  }, [openContextMenu]);

  const getContextMenuItems = useCallback((item) => {
    if (!item) return [];
    const hasParentFile = !!item.parentHash;
    if (!hasParentFile) return [];
    return [{
      label: 'File Details',
      icon: 'info',
      iconColor: 'text-blue-600 dark:text-blue-400',
      onClick: () => handleShowInfo(item)
    }];
  }, [handleShowInfo]);

  // ============================================================================
  // COLUMN DEFINITIONS
  // ============================================================================
  // Use unified category filter options (no separate amule/rtorrent filters)
  const categoryFilterOptions = useCategoryFilterOptions();

  const columns = useMemo(() => [
    buildFileNameColumn({
      onClick: handleShowInfo,
      disabled: (item) => !item.parentHash
    }),
    buildSizeColumn({ showDone: false, width: '100px', sortable: false }),
    buildUploadSpeedColumn({
      onClick: handleShowInfo,
      disabled: (item) => !item.parentHash,
      width: '130px',
      speedKey: 'uploadRate',
      showActiveUploads: false
    }),
    buildClientColumn(),
    buildUploadTotalColumn({
      label: 'UL Total',
      columnKey: 'uploadTotal',
      sortable: true,
      showRequests: false
    }),
    buildCategoryColumn({
      unifiedFilter,
      setUnifiedFilter,
      resetLoaded,
      filterOptions: categoryFilterOptions,
      categories: dataCategories,
      disabled: true // No category edit for upload peers
    })
  ], [handleShowInfo, unifiedFilter, setUnifiedFilter, resetLoaded, categoryFilterOptions, dataCategories]);

  // ============================================================================
  // COLUMN CONFIG (visibility and order)
  // ============================================================================
  const {
    visibleColumns,
    setShowConfig,
    ColumnConfigElement
  } = useColumnConfig('uploads', columns, {
    defaultSecondarySort: DEFAULT_SECONDARY_SORT_CONFIG['uploads'],
    defaultPrimarySort: DEFAULT_SORT_CONFIG['uploads'],
    onSortChange
  });

  // ============================================================================
  // MOBILE CARD RENDERER
  // ============================================================================
  const renderMobileCard = useCallback((item, idx, showBadge, categoryStyle) => {
    const fileName = item.name || 'Unknown';
    const fileSize = item.size;
    const hasParentFile = !!item.parentHash;
    const hasGeoData = item.geoData?.countryCode || item.geoData?.city;
    const isRtorrent = item.client === 'rtorrent';
    const clientSoftware = getClientSoftware(item);
    const ipString = getIpString(item);

    const isContextTarget = contextMenu.show && contextMenu.item?.id === item.id;

    return h(ItemMobileCard, {
      isSelected: false,
      isContextTarget,
      idx,
      categoryStyle
    },
      h(MobileCardHeader, {
        showBadge,
        clientType: item.client,
        fileName,
        fileSize,
        onNameClick: hasParentFile ? (e, anchorEl) => openContextMenu(e, item, anchorEl) : undefined,
        actions: hasParentFile && h(MoreButton, {
          onClick: (e) => openContextMenu(e, item, e.currentTarget)
        })
      },
        h('div', { className: 'space-y-1 text-xs' },
          // Row 1: IP/Hostname + GeoIP
          h('div', { className: 'flex items-center gap-1 text-gray-700 dark:text-gray-300 min-w-0' },
            h(Icon, { name: 'mapPin', size: 12, className: 'text-gray-500 dark:text-gray-400 flex-shrink-0' }),
            item.hostname
              ? h('span', { className: 'font-mono truncate', style: { maxWidth: '180px' }, title: ipString }, item.hostname)
              : h('span', { className: 'font-mono truncate', style: { maxWidth: '180px' } }, ipString),
            hasGeoData && h('span', { className: 'text-gray-400' }, '·'),
            item.geoData?.countryCode && h(FlagIcon, {
              countryCode: item.geoData.countryCode,
              size: 14,
              title: item.geoData.countryCode
            }),
            item.geoData?.city && h('span', { className: 'text-gray-500 dark:text-gray-400' }, item.geoData.city)
          ),
          // Row 2: Uploaded/Session
          h('div', { className: 'flex items-center gap-1 text-gray-700 dark:text-gray-300 flex-wrap' },
            h(Icon, { name: 'upload', size: 12, className: 'text-gray-500 dark:text-gray-400 flex-shrink-0' }),
            h('span', { className: 'text-gray-500 dark:text-gray-400' }, 'Uploaded:'),
            h('span', null, formatBytes(item.uploadTotal || 0)),
            !isRtorrent && item.uploadSession > 0 && h('span', { className: 'text-gray-400' }, '·'),
            !isRtorrent && item.uploadSession > 0 && h('span', { className: 'text-gray-500 dark:text-gray-400' }, 'Session:'),
            !isRtorrent && item.uploadSession > 0 && h('span', null, formatBytes(item.uploadSession))
          ),
          // Row 3: Speed + Client + Tracker
          h('div', { className: 'flex items-center gap-2 text-gray-700 dark:text-gray-300 flex-wrap' },
            h('span', { className: 'font-mono flex items-center gap-1 text-green-600 dark:text-green-400' },
              (item.uploadRate || 0) > 0
                ? h('span', { className: 'arrow-animated arrow-up' }, h(Icon, { name: 'arrowUp', size: 12 }))
                : h(Icon, { name: 'arrowUp', size: 12 }),
              formatSpeed(item.uploadRate || 0)
            ),
            h('span', { className: 'text-gray-400' }, '·'),
            h('span', null,
              isRtorrent || !item.software || item.software === 'Unknown'
                ? clientSoftware
                : item.software
            ),
            item.tracker && h('span', { className: 'text-gray-400' }, '·'),
            h(TrackerLabel, { tracker: item.tracker, maxWidth: 100 })
          )
        )
      )
    );
  }, [contextMenu.show, contextMenu.item, openContextMenu]);

  // ============================================================================
  // MOBILE HEADER CONTENT (shared between sticky toolbar and in-page header)
  // ============================================================================
  const mobileHeaderContent = useMemo(() =>
    h('div', { className: 'flex items-center gap-2' },
      h('h2', { className: VIEW_TITLE_STYLES.mobile },
        `Uploads (${formatTitleCount(filteredUploads.length, uploadPeers.length)})`
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
          defaultSortBy: DEFAULT_SORT_CONFIG.uploads.sortBy,
          defaultSortDirection: DEFAULT_SORT_CONFIG.uploads.sortDirection
        })
      })
    ),
  [filteredUploads.length, uploadPeers.length, filterText, setFilterText, clearFilter, columns, sortConfig, onSortChange]);

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
      // Filter row (filter button + inline pills)
      (showTrackerFilter || hasAmuleUploads || hasRtorrentUploads) && h('div', {
        className: 'flex items-center gap-1.5 py-2 border-b border-gray-200 dark:border-gray-700 overflow-x-auto',
        style: { scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }
      },
        h(MobileFilterButton, {
          onClick: mobileFilters.handleFilterSheetOpen,
          activeCount: mobileFilters.mobileCategoryFilters.length
        }),
        h(MobileFilterPills, {
          filters: mobileFilters.activeFilterPills,
          onRemove: mobileFilters.handleRemoveFilterPill,
          inline: true
        })
      )
    ),

    // Desktop header (hidden xl:flex)
    h('div', { className: 'hidden xl:flex justify-between items-center gap-3' },
      h('h2', { className: VIEW_TITLE_STYLES.desktop },
        `Active Uploads (${formatTitleCount(filteredUploads.length, uploadPeers.length)})`
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
        })
      )
    ),

    // Main content: empty state or table
    filteredUploads.length === 0 ? h(EmptyState, {
      loading: !dataLoaded.items,
      loadingMessage: 'Loading uploads...',
      hasFilters: !!(filterText || unifiedFilter !== 'all' || mobileFilters.mobileCategoryFilters.length > 0),
      filterMessage: 'No uploads match the filter',
      emptyMessage: 'No active uploads',
      onClearFilters: () => { clearFilter(); setUnifiedFilter('all'); mobileFilters.setMobileCategoryFilters([]); }
    // Hybrid scrollable mode: desktop shows all items in scrollable table,
    // mobile uses load-more pagination for natural page scrolling
    }) : h(Table, {
      data: sortedUploads,
      columns: visibleColumns,
      scrollable: true,
      showCategoryBorder: true,
      trackerLabelColumnKey: 'name',
      hoverActions: true,
      actionsHeader: h('button', {
        onClick: () => setShowConfig(true),
        className: 'p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors',
        title: 'Configure columns'
      }, h(Icon, { name: 'tableConfig', size: 16, className: 'text-gray-500 dark:text-gray-400' })),
      actions: (item) => {
        const hasParentFile = !!item.parentHash;
        if (!hasParentFile) return null;
        return h('button', {
          onClick: () => handleShowInfo(item),
          className: 'p-1.5 rounded bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors',
          title: 'View file details'
        }, h(Icon, { name: 'info', size: 14, className: 'text-blue-600 dark:text-blue-400' }));
      },
      currentSortBy: sortConfig.sortBy,
      currentSortDirection: sortConfig.sortDirection,
      onSortChange,
      // Load-more props for mobile in hybrid scrollable mode
      loadedCount,
      totalCount: sortedUploads.length,
      hasMore,
      remaining,
      onLoadMore: loadMore,
      onLoadAll: loadAll,
      resetLoaded,
      pageSize,
      onPageSizeChange,
      skipSort: contextMenu.show,
      getRowKey: (item) => item.id,
      getRowClassName: (item) => getRowHighlightClass(
        false,
        contextMenu.show && contextMenu.item?.id === item.id
      ),
      onRowContextMenu: handleRowContextMenu,
      breakpoint: 'xl',
      mobileCardStyle: 'card',
      mobileCardRender: renderMobileCard
    }),

    // ========================================================================
    // MODALS & OVERLAYS
    // ========================================================================
    FileInfoElement,

    (showTrackerFilter || hasAmuleUploads || hasRtorrentUploads) && h(MobileFilterSheet, {
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

export default UploadsView;
