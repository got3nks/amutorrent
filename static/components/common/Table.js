/**
 * Table Component
 *
 * Generic data table with sorting, pagination, and responsive mobile/desktop views
 */

import React from 'https://esm.sh/react@18.2.0';
import { sortFiles, calculatePagination, TABLE_ROW_STYLES, getTableRowClass, MOBILE_CARD_STYLES, getMobileCardRowClass } from '../../utils/index.js';
import { useStaticData } from '../../contexts/StaticDataContext.js';
import { useTheme } from '../../contexts/ThemeContext.js';
import LoadMoreButton from './LoadMoreButton.js';
import PaginationControls from './PaginationControls.js';
import ClientIcon from './ClientIcon.js';
import TrackerLabel from './TrackerLabel.js';
import Icon from './Icon.js';

const { createElement: h, useEffect, useRef } = React;

// Default gray color for items without a category
const DEFAULT_CATEGORY_COLOR = '#CCCCCC';

/**
 * Compute category border style for an item
 * Uses unified category system - looks up by category name
 * @param {Object} item - Data item with category name
 * @param {Array} categories - Unified categories array (with hexColor field)
 * @returns {Object|null} Style object with borderLeft, or null if no category/Default
 */
const getCategoryBorderStyle = (item, categories) => {
  // Get category name from item (unified system uses category name)
  const categoryName = item.category;

  // Skip if no category, Default, or empty
  if (!categoryName || categoryName === 'Default' || categoryName === '(none)') {
    return null;
  }

  // Look up category by name in unified categories
  if (Array.isArray(categories)) {
    const cat = categories.find(c => c.name === categoryName || c.title === categoryName);
    if (cat && cat.hexColor) {
      return { borderLeft: `4px solid ${cat.hexColor}` };
    }
  }

  // Fallback: show default color if category exists but not found in list
  return { borderLeft: `4px solid ${DEFAULT_CATEGORY_COLOR}` };
};

/**
 * Reusable table component
 * @param {Array} data - Array of data to display
 * @param {Array} columns - Column definitions with label, key, sortable, width, render, headerRender (optional custom header)
 * @param {function|null} actions - Actions renderer function (receives item)
 * @param {string} currentSortBy - Current sort column key
 * @param {string} currentSortDirection - Current sort direction ('asc'/'desc')
 * @param {function} onSortChange - Sort change handler (sortBy, sortDirection)
 * @param {number} loadedCount - Number of items currently loaded
 * @param {number} totalCount - Total number of items
 * @param {boolean} hasMore - Whether there are more items to load
 * @param {number} remaining - Number of remaining items
 * @param {function} onLoadMore - Handler for loading more items
 * @param {number} pageSize - Items per batch
 * @param {function} resetLoaded - Handler to reset loaded items (back to first batch)
 * @param {function|null} getRowClassName - Function to get additional className for each row (receives item, idx)
 * @param {function|null} onRowContextMenu - Handler for right-click context menu (receives event, item)
 * @param {React.ReactNode|null} beforePagination - Content to render between table and load more button
 * @param {function|null} getRowKey - Function to get unique key for each row (receives item, idx)
 * @param {string} breakpoint - Breakpoint for mobile/desktop switch ('sm', 'md', 'lg', 'xl'), default 'md'
 * @param {function|null} mobileCardRender - Custom mobile card renderer (receives item, idx, showBadge, categoryStyle), overrides default card view
 * @param {string} mobileCardStyle - Mobile card style: 'row' (dividers between rows) or 'card' (margin between cards), default 'row'
 * @param {boolean} showCategoryBorder - When true, show category/label color border on first column (uses categories from StaticDataContext)
 * @param {string|null} trackerLabelColumnKey - Column key where tracker label should be appended (e.g., 'fileName')
 * @param {function|null} onRowClick - Handler for row click (receives item) - useful for selection mode
 * @param {React.ReactNode|null} actionsHeader - Content to render in the actions column header (e.g., column config button)
 */
const Table = ({
  data,
  columns,
  actions = null,
  actionsHeader = null,
  currentSortBy,
  currentSortDirection,
  onSortChange,
  // Load-more pagination props (default mode)
  loadedCount,
  totalCount,
  hasMore,
  remaining,
  onLoadMore,
  onLoadAll,
  resetLoaded,
  pageSize,
  onPageSizeChange,
  // Server-side pagination props (when serverSide=true)
  serverSide = false,
  page,
  onPageChange,
  // Scrollable mode props
  scrollable = false,
  scrollHeight = 'calc(100vh - 230px)', // Default height for scrollable mode
  // Common props
  getRowClassName = null,
  onRowContextMenu = null,
  beforePagination = null,
  getRowKey = null,
  breakpoint = 'md',
  mobileCardRender = null,
  mobileCardStyle = 'row',
  showCategoryBorder = false,
  trackerLabelColumnKey = null,
  hoverActions = false,
  onRowClick = null
}) => {
  // Get categories and bothClientsConnected from context
  const { dataCategories, bothClientsConnected } = useStaticData();
  // Get theme for sticky header border color
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // Animation sync - reset animations when data changes to keep them in sync
  // Uses direct DOM manipulation to avoid triggering React re-renders
  const containerRef = useRef(null);
  const prevDataRef = useRef(data);

  useEffect(() => {
    // Only reset if data reference changed
    if (prevDataRef.current !== data && containerRef.current) {
      prevDataRef.current = data;
      // Briefly add pause class to force animation restart
      containerRef.current.classList.add('animations-paused');
      requestAnimationFrame(() => {
        if (containerRef.current) {
          containerRef.current.classList.remove('animations-paused');
        }
      });
    }
  }, [data]);

  // Safety check: ensure data is an array
  if (!Array.isArray(data)) {
    console.error('Table: data is not an array', data);
    return h('div', { className: 'text-center py-6 text-xs sm:text-sm text-red-500 dark:text-red-400' },
      'Error: Invalid data format'
    );
  }

  // Data handling: both desktop and mobile use load-more pagination
  // loadedCount controls how many items are displayed
  const displayData = scrollable && loadedCount ? data.slice(0, loadedCount) : data;

  // Helper to get unique row key
  const getKey = (item, idx) => {
    if (getRowKey) return getRowKey(item, idx);
    return item.hash || item.id || item._value || idx;
  };

  // Breakpoint-aware class names
  const mobileClass = `${breakpoint}:hidden`;
  const desktopClass = `hidden ${breakpoint}:block`;

  // Build effective columns - prepend client type badge column if enabled and data has client info
  const hasClientData = data.length > 0 && data.some(item => item.client);
  const effectiveColumns = bothClientsConnected && hasClientData ? [
    {
      key: '_clientType',
      label: '',
      sortable: false,
      width: '32px',
      render: (item) => {
        const clientType = item.client;
        if (!clientType) return null;
        return h(ClientIcon, {
          clientType,
          size: 16
        });
      }
    },
    ...columns
  ] : columns;

  // Mobile container class based on card style
  const mobileContainerClass = mobileCardStyle === 'card'
    ? 'space-y-2'  // Card style: margin between cards
    : MOBILE_CARD_STYLES.container;  // Row style: dividers between rows

  return h('div', { ref: containerRef, className: 'space-y-2' },

    // Mobile card view (requires mobileCardRender prop)
    // Uses displayData for load-more pagination on mobile
    mobileCardRender && h('div', { className: `block ${mobileClass} ${mobileContainerClass}` },
      displayData.map((item, idx) => {
        // Compute category style for mobile cards
        const categoryStyle = showCategoryBorder ? getCategoryBorderStyle(item, dataCategories) : null;
        // Pass bothClientsConnected and categoryStyle to custom renderer
        return h(React.Fragment, { key: getKey(item, idx) }, mobileCardRender(item, idx, bothClientsConnected, categoryStyle));
      })
    ),

    // Mobile load-more button (outside scroll, since mobile cards aren't in scrollable container)
    scrollable && mobileCardRender && h('div', { className: mobileClass },
      h(LoadMoreButton, {
        loadedCount: loadedCount || displayData.length,
        totalCount,
        hasMore: hasMore !== undefined ? hasMore : displayData.length < totalCount,
        remaining: remaining !== undefined ? remaining : totalCount - displayData.length,
        onLoadMore,
        onLoadAll,
        pageSize,
        onPageSizeChange
      })
    ),

    // Desktop table view
    h('div', {
      className: `${desktopClass} overflow-x-auto${scrollable ? ' overflow-y-auto' : ''}`,
      style: scrollable ? { maxHeight: scrollHeight } : undefined
    },
      h('table', { className: 'w-full' },
        h('thead', {
          className: scrollable ? 'sticky top-0 z-10 bg-white dark:bg-gray-900' : null,
          // Bottom border via box-shadow (works reliably with sticky positioning)
          style: scrollable ? { boxShadow: `0 1px 0 0 ${isDark ? 'rgb(55 65 81)' : 'rgb(229 231 235)'}` } : undefined
        },
          h('tr', { className: scrollable ? null : TABLE_ROW_STYLES.headerBorder },
            effectiveColumns.map((col, idx) =>
              h('th', {
                key: idx,
                className: `text-left p-2 font-semibold text-xs sm:text-sm text-gray-700 dark:text-gray-300${col.className ? ` ${col.className}` : ''}`,
                style: col.width && col.width !== 'auto' ? { width: col.width } : undefined
              },
                // Custom header renderer for partial sorting in combined columns
                col.headerRender
                  ? col.headerRender({
                      currentSortBy,
                      currentSortDirection,
                      onSortChange: (key, dir) => {
                        onSortChange(key, dir);
                        resetLoaded && resetLoaded();
                      }
                    })
                  : col.sortable ? h('button', {
                      onClick: () => {
                        if (currentSortBy === col.key) {
                          // Toggle direction
                          onSortChange(col.key, currentSortDirection === 'asc' ? 'desc' : 'asc');
                        } else {
                          // New column – default to descending
                          onSortChange(col.key, 'desc');
                        }
                        resetLoaded && resetLoaded();
                      },
                      className: `hover:text-blue-600 dark:hover:text-blue-400 transition-colors ${currentSortBy === col.key ? 'text-blue-600 dark:text-blue-400' : ''}`
                    }, col.label +
                        (currentSortBy === col.key
                          ? currentSortDirection === 'asc' ? ' ↑' : ' ↓'
                          : '')
                        ) : col.label
              )
            ),
            actions && h('th', { className: `${actionsHeader ? 'text-center' : 'text-right'} p-2 font-semibold text-xs sm:text-sm text-gray-700 dark:text-gray-300` }, actionsHeader)
          )
        ),
        h('tbody', null,
          displayData.map((item, idx) => {
            const extraClassName = getRowClassName ? getRowClassName(item, idx) : '';
            const categoryStyle = showCategoryBorder ? getCategoryBorderStyle(item, dataCategories) : null;
            return h('tr', {
              key: getKey(item, idx),
              className: `${getTableRowClass(idx, extraClassName)}${hoverActions ? ' group' : ''}${onRowClick ? ' cursor-pointer' : ''}`,
              onClick: onRowClick ? () => onRowClick(item) : undefined,
              onContextMenu: onRowContextMenu ? (e) => onRowContextMenu(e, item) : undefined
            },
              effectiveColumns.map((col, cidx) => {
                // Apply category border style to the first column
                const isFirstCol = cidx === 0;
                const colStyle = col.width && col.width !== 'auto' ? { width: col.width } : {};
                const cellStyle = isFirstCol && categoryStyle
                  ? { ...colStyle, ...categoryStyle }
                  : colStyle;

                // Render cell content
                const cellContent = col.render ? col.render(item) : item[col.key];

                // Append tracker label if this column is marked for it
                const shouldAppendTracker = trackerLabelColumnKey && col.key === trackerLabelColumnKey && item.tracker;

                return h('td', {
                  key: cidx,
                  className: `p-2 text-xs sm:text-sm text-gray-900 dark:text-gray-100${col.className ? ` ${col.className}` : ''}`,
                  style: Object.keys(cellStyle).length > 0 ? cellStyle : undefined
                },
                  shouldAppendTracker
                    ? h(React.Fragment, null,
                        // Below 2xl: float method (text wraps below label)
                        // Using leading-6 (24px) line-height to match tracker label height so text clears float after one line
                        h('div', { className: '2xl:hidden leading-6' },
                          h(TrackerLabel, { tracker: item.tracker, className: 'float-right ml-2 leading-5' }),
                          cellContent
                        ),
                        // 2xl and above: flex method (label stays on right, aligned with first line)
                        h('div', {
                          className: 'hidden 2xl:flex items-start gap-2',
                          style: { width: 'fit-content', maxWidth: '100%' }
                        },
                          h('div', { className: 'min-w-0' }, cellContent),
                          h(TrackerLabel, { tracker: item.tracker, className: 'flex-shrink-0 whitespace-nowrap' })
                        )
                      )
                    : cellContent
                );
              }),
              actions && h('td', { className: `p-2${hoverActions ? ' relative' : ''}` },
                hoverActions && h('div', { className: 'absolute inset-0 flex items-center justify-center opacity-100 group-hover:opacity-0 transition-opacity duration-150 pointer-events-none' },
                  h(Icon, { name: 'moreHorizontal', size: 16, className: 'text-gray-500 dark:text-gray-400' })
                ),
                h('div', { className: `flex gap-2${hoverActions ? ' justify-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150' : ''}` }, actions(item))
              )
            );
          })
        )
      ),
      // Pagination inside scrollable container (visible after scrolling to bottom)
      scrollable && (serverSide
        ? h(PaginationControls, {
            page,
            onPageChange,
            pagesCount: Math.ceil(totalCount / pageSize),
            pageSize,
            onPageSizeChange
          })
        : h(LoadMoreButton, {
            loadedCount: loadedCount || displayData.length,
            totalCount,
            hasMore: hasMore !== undefined ? hasMore : displayData.length < totalCount,
            remaining: remaining !== undefined ? remaining : totalCount - displayData.length,
            onLoadMore,
            onLoadAll,
            pageSize,
            onPageSizeChange
          })
      )
    ),

    // Before load-more content (e.g., bulk action footer)
    beforePagination,

    // Non-scrollable mode pagination (outside scroll)
    !scrollable && (serverSide
      ? h(PaginationControls, {
          page,
          onPageChange,
          pagesCount: Math.ceil(totalCount / pageSize),
          pageSize,
          onPageSizeChange
        })
      : h(LoadMoreButton, {
          loadedCount,
          totalCount,
          hasMore,
          remaining,
          onLoadMore,
          onLoadAll,
          pageSize,
          onPageSizeChange
        })
    )
  );
};

export default Table;
