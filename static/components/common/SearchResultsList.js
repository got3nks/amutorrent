/**
 * SearchResultsList Component
 *
 * Shared component for displaying search results with mobile/desktop views
 * Uses checkboxes for multi-selection instead of per-row download buttons
 */

import React from 'https://esm.sh/react@18.2.0';
import { Table, Icon, MobileCardHeader, Tooltip, StarRating } from './index.js';
import { formatBytes, formatDateTime, getMobileCardRowClass } from '../../utils/index.js';
import { getSearchStatusBadge } from '../../utils/searchDownloadStatus.js';

const { createElement: h, useCallback, useMemo, useState } = React;

/**
 * Distinct alternate filenames a result carries, excluding its own.
 * aMule can repeat the parent's name among its children, so dedupe.
 * @param {Object} item - Search result
 * @returns {string[]}
 */
const alternateNames = (item) => {
  if (!item?.children?.length) return [];
  const seen = new Set([item.fileName]);
  const names = [];
  for (const child of item.children) {
    if (child?.fileName && !seen.has(child.fileName)) {
      seen.add(child.fileName);
      names.push(child.fileName);
    }
  }
  return names;
};

/**
 * Bare caret shown to the left of a filename that has alternate names (#82).
 * No label: the expanded list explains itself, and a label crowds the column.
 * @param {Object} opts - { item, expanded, onToggle }
 * @returns {Object|null} Element, or null when the result has no alternates
 */
const AlternateNamesCaret = ({ item, expanded, onToggle }) => {
  const count = alternateNames(item).length;
  if (count === 0) return null;

  // `flex` (not inline-block) so the SVG is blockified as a flex item — an
  // inline SVG carries baseline descender space that makes the whole row taller.
  // h-4 matches the text-xs line box exactly, so the caret adds no height.
  return h('button', {
    type: 'button',
    className: 'flex-shrink-0 self-center flex items-center h-4 leading-none text-gray-400 dark:text-gray-500',
    onClick: (e) => { e.stopPropagation(); onToggle(); },
    title: expanded
      ? 'Hide the other names this file is shared under'
      : `Also shared under ${count} other name${count > 1 ? 's' : ''}`
  }, h(Icon, { name: expanded ? 'chevronDown' : 'chevronRight', size: 12 }));
};

/**
 * The expanded alternate-name list. Same file either way — these are other
 * names for one hash (#82), not separate results.
 * @param {Object} opts - { item, expanded }
 * @returns {Object|null}
 */
const AlternateNamesList = ({ item, expanded }) => {
  const names = alternateNames(item);
  if (!expanded || names.length === 0) return null;

  return h('ul', { className: 'mt-1 ml-4 border-l border-gray-200 dark:border-gray-700 pl-2 space-y-0.5' },
    names.map((name, i) => h('li', {
      key: i,
      className: 'text-[11px] text-gray-600 dark:text-gray-400 break-words',
      style: { wordBreak: 'break-all', overflowWrap: 'anywhere' }
    }, name))
  );
};

// Same geometry as the pill used elsewhere (InfoModalTables); only tone varies.
const BADGE_TONES = {
  green: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  red: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
};

/**
 * "Queued" / "Downloaded" / "Cancelled" marker for a search result aMule
 * already knows about (#77). Renders nothing for a new file, which is the
 * overwhelming majority — marking those would be noise.
 * @param {Object} opts - { status } from item.downloadStatus
 * @returns {Object|null}
 */
const SearchStatusBadge = ({ status }) => {
  const badge = getSearchStatusBadge(status);
  if (!badge) return null;
  return h('span', {
    className: `flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${BADGE_TONES[badge.tone] || BADGE_TONES.blue}`,
    title: badge.title
  }, badge.label);
};

/**
 * Column definitions for search results (aMule)
 * Exported for MobileSortButton in parent components (uses key, label, sortable)
 * Also used by Table internally (uses all properties including width, render)
 */
export const SEARCH_RESULTS_COLUMNS = [
  {
    key: 'fileName',
    label: 'File Name',
    sortable: true,
    width: 'auto',
    render: (item) =>
      h('div', {
        className: 'font-medium text-xs break-words whitespace-normal',
        style: { wordBreak: 'break-all', overflowWrap: 'anywhere' }
      }, item.fileName)
  },
  {
    key: 'rating',
    label: 'Rating',
    sortable: true,
    width: '90px',
    render: (item) => item.rating > 0
      ? h(StarRating, { value: item.rating })
      : h('span', { className: 'text-xs text-gray-400' }, '-')
  },
  {
    key: 'fileSize',
    label: 'Size',
    sortable: true,
    width: '100px',
    render: (item) => h('span', { className: 'text-xs' }, formatBytes(item.fileSize))
  },
  {
    key: 'sourceCount',
    label: 'Sources',
    sortable: true,
    width: '120px',
    render: (item) => h('span', { className: 'text-xs' }, `${item.sourceCount} sources`)
  }
];

/**
 * Column definitions for Prowlarr search results
 * Includes indexer, category, and publish date columns
 */
export const PROWLARR_RESULTS_COLUMNS = [
  {
    key: 'fileName',
    label: 'Title',
    sortable: true,
    width: 'auto',
    render: (item) =>
      h('div', {
        className: 'font-medium text-xs break-words whitespace-normal',
        style: { wordBreak: 'break-all', overflowWrap: 'anywhere' }
      }, item.fileName)
  },
  {
    key: 'indexer',
    label: 'Indexer',
    sortable: true,
    width: '120px',
    render: (item) => h('span', {
      className: 'text-xs px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
    }, item.indexer || '-')
  },
  {
    key: 'fileSize',
    label: 'Size',
    sortable: true,
    width: '90px',
    render: (item) => h('span', { className: 'text-xs' }, formatBytes(item.fileSize))
  },
  {
    key: 'sourceCount',
    label: 'Sources',
    sortable: true,
    width: '120px',
    render: (item) => h('span', { className: 'text-xs' },
      h('span', { className: 'text-green-600 dark:text-green-400' }, `S: ${item.sourceCount || 0}`),
      ' / ',
      h('span', { className: 'text-orange-600 dark:text-orange-400' }, `L: ${item.leechers || 0}`)
    )
  },
  {
    key: 'categories',
    label: 'Category',
    sortable: false,
    width: '100px',
    render: (item) => {
      const cats = item.categories || [];
      const catName = cats.length > 0 ? cats[0].name : '-';
      return h('span', { className: 'text-xs text-gray-600 dark:text-gray-400 truncate', title: catName }, catName);
    }
  },
  {
    key: 'publishDate',
    label: 'Published',
    sortable: true,
    width: '160px',
    render: (item) => {
      if (!item.publishDate) return h('span', { className: 'text-xs text-gray-400' }, '-');
      const date = new Date(item.publishDate);
      return h('span', { className: 'text-xs text-gray-600 dark:text-gray-400' }, date.toLocaleString());
    }
  }
];

/**
 * Search results list component
 * Uses hybrid scrollable mode: desktop shows all items in scrollable table,
 * mobile uses load-more pagination for natural page scrolling
 * @param {Array} results - All sorted search results (for desktop scrollable)
 * @param {Array} loadedData - Sliced results for mobile load-more
 * @param {object} sortConfig - Current sort configuration
 * @param {function} onSortChange - Sort change handler
 * @param {Map} downloadedFiles - Map of hash → Set<instanceId> for downloaded files
 * @param {string} activeInstanceId - Currently selected client instance ID
 * @param {Set} selectedFiles - Set of selected file hashes
 * @param {function} onToggleSelection - Toggle selection handler (receives fileHash)
 * @param {number} loadedCount - Number of items currently loaded (for mobile)
 * @param {number} totalCount - Total number of items
 * @param {boolean} hasMore - Whether there are more items to load (for mobile)
 * @param {number} remaining - Number of remaining items (for mobile)
 * @param {function} onLoadMore - Handler for loading more items (for mobile)
 * @param {function} onLoadAll - Handler for loading all remaining items (for mobile)
 * @param {function} resetLoaded - Handler to reset loaded items
 * @param {number} pageSize - Items per batch (for mobile)
 * @param {string} emptyMessage - Optional message to show when results are empty
 * @param {boolean} isProwlarr - Whether results are from Prowlarr (shows different columns)
 * @param {string} scrollHeight - Custom scroll height for the table (default: 'calc(100vh - 280px)')
 * @param {Array} customColumns - Optional custom column definitions (overrides default columns)
 */
const SearchResultsList = ({
  results,
  loadedData,
  sortConfig,
  onSortChange,
  downloadedFiles,
  activeInstanceId,
  connectedClientIds = [],
  selectedFiles,
  onToggleSelection,
  loadedCount,
  totalCount,
  hasMore,
  remaining,
  onLoadMore,
  onLoadAll,
  resetLoaded,
  pageSize,
  emptyMessage = null,
  isProwlarr = false,
  scrollHeight,
  customColumns = null
}) => {
  // Select columns based on result type (use custom columns if provided)
  const baseColumns = customColumns || (isProwlarr ? PROWLARR_RESULTS_COLUMNS : SEARCH_RESULTS_COLUMNS);

  // Helper: check download status for an item
  const getDownloadStatus = useCallback((fileHash) => {
    const instances = downloadedFiles.get(fileHash);
    if (!instances || instances.size === 0) return { downloaded: false, onActiveInstance: false, onAllInstances: false };
    const onActive = activeInstanceId ? instances.has(activeInstanceId) : instances.size > 0;
    const onAll = connectedClientIds.length > 0 && connectedClientIds.every(id => instances.has(id));
    return { downloaded: true, onActiveInstance: onActive, onAllInstances: onAll };
  }, [downloadedFiles, activeInstanceId, connectedClientIds]);

  // Which results have their alternate-name list expanded, keyed by hash.
  const [expandedNames, setExpandedNames] = useState(() => new Set());
  const toggleNames = useCallback((hash) => {
    setExpandedNames(prev => {
      const next = new Set(prev);
      if (next.has(hash)) next.delete(hash); else next.add(hash);
      return next;
    });
  }, []);

  // Desktop columns with selection-aware fileName render
  const columnsWithSelection = useMemo(() =>
    baseColumns.map(col =>
      col.key === 'fileName'
        ? { ...col, render: (item) => {
            const { onAllInstances } = getDownloadStatus(item.fileHash);
            const expanded = expandedNames.has(item.fileHash);
            return h('div', null,
              h('div', { className: 'flex items-center gap-0.5' },
                h(AlternateNamesCaret, { item, expanded, onToggle: () => toggleNames(item.fileHash) }),
                h('div', {
                  className: `font-medium text-xs break-words whitespace-normal ${onAllInstances ? '' : 'cursor-pointer hover:font-bold'}`,
                  style: { wordBreak: 'break-all', overflowWrap: 'anywhere' },
                  onClick: onAllInstances ? undefined : () => onToggleSelection(item.fileHash)
                }, item.fileName),
                h(SearchStatusBadge, { status: item.downloadStatus })
              ),
              h(AlternateNamesList, { item, expanded })
            );
          }}
        : col
    ),
    [baseColumns, onToggleSelection, getDownloadStatus, expandedNames, toggleNames]
  );

  // Mobile card renderer using MobileCardHeader
  const renderMobileCard = useCallback((item, idx) => {
    const { downloaded, onActiveInstance, onAllInstances } = getDownloadStatus(item.fileHash);
    const isSelected = selectedFiles.has(item.fileHash);
    return h('div', {
      className: `${getMobileCardRowClass(idx)}${isSelected ? ' !bg-purple-100 dark:!bg-purple-900/40' : ''}`
    },
      h(MobileCardHeader, {
        showBadge: false,
        fileName: item.fileName,
        namePrefix: h(AlternateNamesCaret, {
          item,
          expanded: expandedNames.has(item.fileHash),
          onToggle: () => toggleNames(item.fileHash)
        }),
        onNameClick: onAllInstances ? undefined : () => onToggleSelection(item.fileHash),
        actions: onActiveInstance
          ? h(Tooltip, { content: onAllInstances ? 'Downloaded on all clients' : 'Already downloaded — tap to select for another client' },
              h('div', {
                className: `flex items-center justify-center w-8 h-8 ${onAllInstances ? '' : 'cursor-pointer'}`,
                onClick: onAllInstances ? undefined : () => onToggleSelection(item.fileHash)
              },
                h(Icon, { name: 'check', size: 18, className: onAllInstances ? 'text-green-400 opacity-60' : 'text-green-500' })
              )
            )
          : h('div', { className: 'relative' },
              h('input', {
                type: 'checkbox',
                checked: isSelected,
                onChange: () => onToggleSelection(item.fileHash),
                className: 'w-5 h-5 text-purple-600 border-gray-300 rounded cursor-pointer'
              }),
              downloaded && h(Tooltip, { content: 'Downloaded on another client' },
                h('div', { className: 'absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border border-white dark:border-gray-800' })
              )
            )
      },
        // Alternate filenames for this hash, collapsed by default (#82)
        h(AlternateNamesList, { item, expanded: expandedNames.has(item.fileHash) }),
        // Detail row: Size, Sources/Seeders, then the status badge last
        h('div', { className: 'flex items-center gap-1 text-xs text-gray-700 dark:text-gray-300 flex-wrap' },
          h(Icon, { name: 'harddrive', size: 12, className: 'text-gray-500 dark:text-gray-400' }),
          h('span', { className: 'text-gray-900 dark:text-gray-100' }, formatBytes(item.fileSize)),
          h('span', { className: 'text-gray-400' }, '·'),
          isProwlarr
            ? [
                h('span', { key: 'seeders', className: 'text-green-600 dark:text-green-400' }, `S: ${item.sourceCount || 0}`),
                h('span', { key: 'sep', className: 'text-gray-400' }, ' / '),
                h('span', { key: 'leechers', className: 'text-orange-600 dark:text-orange-400' }, `L: ${item.leechers || 0}`)
              ]
            : [
                h(Icon, { key: 'icon', name: 'share', size: 12, className: 'text-gray-500 dark:text-gray-400' }),
                h('span', { key: 'sources', className: 'text-gray-900 dark:text-gray-100' }, `${item.sourceCount} sources`),
                item.rating > 0 && h('span', { key: 'rating-sep', className: 'text-gray-400' }, '·'),
                item.rating > 0 && h(StarRating, { key: 'rating', value: item.rating })
              ],
          // Prowlarr-specific: indexer and category
          isProwlarr && item.indexer && [
            h('span', { key: 'sep2', className: 'text-gray-400' }, '·'),
            h('span', { key: 'indexer', className: 'px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' }, item.indexer)
          ],
          isProwlarr && item.categories?.length > 0 && [
            h('span', { key: 'sep3', className: 'text-gray-400' }, '·'),
            h('span', { key: 'cat', className: 'text-gray-500 dark:text-gray-400' }, item.categories[0].name)
          ],
          h(SearchStatusBadge, { key: 'status', status: item.downloadStatus })
        )
      )
    );
  }, [getDownloadStatus, selectedFiles, onToggleSelection, isProwlarr, expandedNames, toggleNames]);

  // Desktop actions renderer — checkbox or green check icon
  const renderActions = useCallback((item) => {
    const { downloaded, onActiveInstance, onAllInstances } = getDownloadStatus(item.fileHash);
    if (onActiveInstance) {
      const tooltipMsg = onAllInstances ? 'Downloaded on all clients' : 'Already downloaded — click to select for another client';
      return h(Tooltip, { content: tooltipMsg, position: 'left' },
        h('div', {
          className: `flex items-center justify-center ${onAllInstances ? '' : 'cursor-pointer'}`,
          onClick: onAllInstances ? undefined : () => onToggleSelection(item.fileHash)
        },
          h(Icon, { name: 'check', size: 16, className: onAllInstances ? 'text-green-400 opacity-60' : 'text-green-500' })
        )
      );
    }
    return h('div', { className: 'flex items-center justify-center relative' },
      h('input', {
        type: 'checkbox',
        checked: selectedFiles.has(item.fileHash),
        onChange: () => onToggleSelection(item.fileHash),
        className: 'w-4 h-4 text-purple-600 border-gray-300 rounded cursor-pointer'
      }),
      downloaded && h(Tooltip, { content: 'Downloaded on another client', position: 'left' },
        h('div', { className: 'absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-500 rounded-full border border-white dark:border-gray-800' })
      )
    );
  }, [getDownloadStatus, selectedFiles, onToggleSelection]);

  // Row highlight for selected items
  const getRowClassName = useCallback((item) => {
    return selectedFiles.has(item.fileHash) ? '!bg-purple-100 dark:!bg-purple-900/40' : '';
  }, [selectedFiles]);

  // Empty state
  if (results.length === 0 && emptyMessage) {
    return h('div', { className: 'text-center py-6 text-xs sm:text-sm text-gray-500 dark:text-gray-400' }, emptyMessage);
  }

  // Hybrid scrollable mode: desktop shows all items in scrollable table,
  // mobile uses load-more pagination for natural page scrolling
  return h(Table, {
    data: results,
    columns: columnsWithSelection,
    scrollable: true,
    scrollHeight,
    actions: renderActions,
    currentSortBy: sortConfig.sortBy,
    currentSortDirection: sortConfig.sortDirection,
    onSortChange,
    // Load-more props for mobile in hybrid scrollable mode
    loadedCount,
    totalCount,
    hasMore,
    remaining,
    onLoadMore,
    onLoadAll,
    resetLoaded,
    pageSize,
    getRowKey: (item) => item.fileHash,
    getRowClassName,
    breakpoint: 'xl',
    mobileCardRender: renderMobileCard
  });
};

export default SearchResultsList;
