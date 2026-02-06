/**
 * Column Builder Utilities
 *
 * Helper functions to generate common column configurations
 * used across multiple views (Downloads, Shared, Uploads, History)
 */

import React from 'https://esm.sh/react@18.2.0';
import SortableHeaderPart from '../components/common/SortableHeaderPart.js';
import Icon from '../components/common/Icon.js';
import Tooltip from '../components/common/Tooltip.js';
import { ProgressBar } from '../components/common/ProgressBar.js';
import FlagIcon from '../components/common/FlagIcon.js';
import { formatBytes, formatSpeed, formatLastSeenComplete, getTimeBasedColor, formatRatio, formatTimeAgo, formatDateTime, formatETASeconds } from './formatters.js';
import { makeFilterHeaderRender } from './tableHelpers.js';
import { STATUS_DISPLAY_MAP, getItemStatusInfo, formatSourceDisplay, getSeederColorClass, getClientSoftware, getIpString } from './downloadHelpers.js';

const { createElement: h } = React;

// Default gray color for categories without a color set
const DEFAULT_CATEGORY_COLOR = '#CCCCCC';

/**
 * Convert BGR integer color (aMule format) to hex string
 * @param {number|string} color - BGR integer or hex string
 * @returns {string} Hex color string
 */
const categoryColorToHex = (color) => {
  if (!color) return DEFAULT_CATEGORY_COLOR;
  if (typeof color === 'string') {
    return color.startsWith('#') ? color : `#${color}`;
  }
  // Convert BGR integer to RGB hex
  const b = (color >> 16) & 0xFF;
  const g = (color >> 8) & 0xFF;
  const r = color & 0xFF;
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
};

/**
 * Create a Speed column with DL/UL sub-sorting
 * @param {Object} options
 * @param {boolean} options.showDownload - Include download speed (default true)
 * @param {boolean} options.showUpload - Include upload speed (default true)
 * @param {string} options.width - Column width (default '110px')
 * @param {function} options.onItemClick - Optional click handler for speed values
 * @param {boolean} options.compact - Only show lines with values, no dash placeholders (default false)
 * @param {boolean} options.disabled - Disable click handlers (for selection mode)
 * @returns {Object} Column definition
 */
export const buildSpeedColumn = ({
  showDownload = true,
  showUpload = true,
  width = '110px',
  onItemClick = null,
  compact = false,
  disabled = false
} = {}) => {
  const mobileSortOptions = [];
  if (showDownload) mobileSortOptions.push({ key: 'downloadSpeed', label: 'DL Speed' });
  if (showUpload) mobileSortOptions.push({ key: 'uploadSpeed', label: 'UL Speed' });

  return {
    label: 'Speed',
    key: 'speed',
    sortable: false,
    mobileSortOptions,
    width,
    headerRender: ({ currentSortBy, currentSortDirection, onSortChange }) =>
      h('span', { className: 'flex items-center gap-1' },
        'Speed',
        showDownload && h(SortableHeaderPart, {
          label: 'DL',
          sortKey: 'downloadSpeed',
          currentSortBy,
          currentSortDirection,
          onSortChange
        }),
        showDownload && showUpload && '/',
        showUpload && h(SortableHeaderPart, {
          label: 'UL',
          sortKey: 'uploadSpeed',
          currentSortBy,
          currentSortDirection,
          onSortChange
        })
      ),
    render: (item) => {
      const dlSpeed = item.downloadSpeed || 0;
      const ulSpeed = item.uploadSpeed || 0;
      const isClickable = onItemClick && !disabled;

      // No speeds at all — single dash
      if ((!showDownload || dlSpeed <= 0) && (!showUpload || ulSpeed <= 0)) {
        return h('span', { className: 'text-xs text-gray-400' }, '-');
      }

      const baseClass = 'flex items-center';
      const clickableClass = isClickable ? ' cursor-pointer hover:underline decoration-dotted' : '';

      // Compact mode: only show lines with values
      if (compact) {
        return h('div', { className: 'text-xs font-mono leading-tight' },
          showDownload && dlSpeed > 0 && h('div', { className: `text-blue-600 dark:text-blue-400${clickableClass} flex items-center` },
            h('span', { className: 'arrow-animated' }, h(Icon, { name: 'arrowDown', size: 12 })), ' ', formatSpeed(dlSpeed)
          ),
          showUpload && ulSpeed > 0 && h('div', { className: `text-green-600 dark:text-green-400${clickableClass} flex items-center` },
            h('span', { className: 'arrow-animated arrow-up' }, h(Icon, { name: 'arrowUp', size: 12 })), ' ', formatSpeed(ulSpeed)
          )
        );
      }

      // Full mode: show both lines with dash placeholders
      return h('div', { className: 'text-xs font-mono leading-tight' },
        showDownload && h('div', { className: baseClass },
          dlSpeed > 0
            ? h('span', {
                className: `text-blue-600 dark:text-blue-400${clickableClass} flex items-center`,
                onClick: isClickable ? () => onItemClick(item) : undefined,
                title: isClickable ? 'Click to view details' : undefined
              }, h('span', { className: 'arrow-animated' }, h(Icon, { name: 'arrowDown', size: 12 })), ' ', formatSpeed(dlSpeed))
            : h('span', { className: 'text-blue-600 dark:text-blue-400 flex items-center' }, h(Icon, { name: 'arrowDown', size: 12 }), ' -')
        ),
        showUpload && h('div', { className: baseClass },
          ulSpeed > 0
            ? h('span', {
                className: `text-green-600 dark:text-green-400${clickableClass} flex items-center`,
                onClick: isClickable ? () => onItemClick(item) : undefined,
                title: isClickable ? 'Click to view details' : undefined
              }, h('span', { className: 'arrow-animated arrow-up' }, h(Icon, { name: 'arrowUp', size: 12 })), ' ', formatSpeed(ulSpeed))
            : h('span', { className: 'text-green-600 dark:text-green-400 flex items-center' }, h(Icon, { name: 'arrowUp', size: 12 }), ' -')
        )
      );
    }
  };
};

/**
 * Create a Size column with Done/Total sub-sorting
 * @param {Object} options
 * @param {boolean} options.showDone - Include downloaded size (default true)
 * @param {boolean} options.showTotal - Include total size (default true)
 * @param {string} options.width - Column width (default '150px')
 * @param {boolean} options.sortable - Whether column is sortable when showDone is false (default true)
 * @returns {Object} Column definition
 */
export const buildSizeColumn = ({
  showDone = true,
  showTotal = true,
  width = '150px',
  sortable = true
} = {}) => {
  // If only showing total, use simple column
  if (!showDone) {
    return {
      label: 'Size',
      key: 'size',
      sortable,
      width,
      render: (item) => h('span', { className: 'text-xs' }, formatBytes(item.size))
    };
  }

  const mobileSortOptions = [];
  if (showDone) mobileSortOptions.push({ key: 'sizeDownloaded', label: 'Size Done' });
  if (showTotal) mobileSortOptions.push({ key: 'size', label: 'Size Total' });

  return {
    label: 'Size',
    key: 'size',
    sortable: false,
    mobileSortOptions,
    width,
    headerRender: ({ currentSortBy, currentSortDirection, onSortChange }) =>
      h('span', { className: 'flex items-center gap-1' },
        'Size ',
        h(SortableHeaderPart, {
          label: 'Done',
          sortKey: 'sizeDownloaded',
          currentSortBy,
          currentSortDirection,
          onSortChange
        }),
        '/',
        h(SortableHeaderPart, {
          label: 'Total',
          sortKey: 'size',
          currentSortBy,
          currentSortDirection,
          onSortChange
        })
      ),
    render: (item) => h('span', { className: 'text-xs whitespace-nowrap' },
      formatBytes(item.sizeDownloaded),
      ' / ',
      formatBytes(item.size)
    )
  };
};

/**
 * Create a transfer Total column with DL/UL sub-sorting (for history view)
 * @param {Object} options
 * @param {string} options.width - Column width (default '110px')
 * @param {string} options.downloadKey - Property name for downloaded bytes (default 'downloaded')
 * @param {string} options.uploadKey - Property name for uploaded bytes (default 'uploaded')
 * @returns {Object} Column definition
 */
export const buildTransferColumn = ({
  width = '110px',
  downloadKey = 'downloaded',
  uploadKey = 'uploaded'
} = {}) => ({
  key: 'transfer',
  label: 'Total',
  sortable: false,
  width,
  headerRender: ({ currentSortBy, currentSortDirection, onSortChange }) =>
    h('span', { className: 'flex items-center gap-1' },
      'Total',
      h(SortableHeaderPart, {
        label: 'DL',
        sortKey: downloadKey,
        currentSortBy,
        currentSortDirection,
        onSortChange
      }),
      '/',
      h(SortableHeaderPart, {
        label: 'UL',
        sortKey: uploadKey,
        currentSortBy,
        currentSortDirection,
        onSortChange
      })
    ),
  render: (item) => {
    const downloaded = formatBytes(item[downloadKey] || 0);
    const uploaded = formatBytes(item[uploadKey] || 0);
    return h('div', { className: 'text-xs font-mono leading-tight' },
      h('div', { className: 'flex items-center gap-1 text-blue-600 dark:text-blue-400' }, h(Icon, { name: 'download', size: 12 }), downloaded),
      h('div', { className: 'flex items-center gap-1 text-green-600 dark:text-green-400' }, h(Icon, { name: 'upload', size: 12 }), uploaded)
    );
  }
});

/**
 * Create a clickable file name column
 * @param {Object} options
 * @param {function} options.onClick - Click handler (item) => void
 * @param {string} options.label - Column label (default 'File Name')
 * @param {string} options.itemKey - Item property for name (default 'name')
 * @param {string} options.columnKey - Column key for sorting (default: same as itemKey)
 * @param {boolean|function} options.disabled - Disable click: boolean for global, function (item) => boolean for per-item
 * @returns {Object} Column definition
 */
export const buildFileNameColumn = ({
  onClick,
  label = 'File Name',
  itemKey = 'name',
  columnKey,
  disabled = false
} = {}) => ({
  label,
  key: columnKey || itemKey,
  sortable: true,
  width: 'auto',
  render: (item) => {
    const name = item[itemKey] || 'Unknown';
    const isDisabled = typeof disabled === 'function' ? disabled(item) : disabled;
    const isClickable = onClick && !isDisabled;
    return h('span', {
      className: `font-medium text-xs${isClickable ? ' cursor-pointer hover:underline decoration-dotted' : ''}`,
      style: { wordBreak: 'break-all', overflowWrap: 'anywhere' },
      onClick: isClickable ? () => onClick(item) : undefined,
      title: isClickable ? 'Click to view details' : undefined
    }, name);
  }
});

/**
 * Create a Status column with filter dropdown
 * @param {Object} options
 * @param {string} options.statusFilter - Current filter value
 * @param {function} options.setStatusFilter - Filter setter (val) => void
 * @param {function} options.resetLoaded - Reset loaded items function (for load-more mode)
 * @param {Array} options.statusOptions - Filter options array [{value, label}]
 * @param {function} options.getStatusKey - Function to get status key from item (default: getItemStatusInfo)
 * @param {string} options.width - Column width (default '120px')
 * @param {string} options.defaultStatus - Default status key for display map lookup (default 'active')
 * @param {function} options.render - Custom render function (item) => element (optional)
 * @returns {Object} Column definition
 */
export const buildStatusColumn = ({
  statusFilter,
  setStatusFilter,
  resetLoaded,
  statusOptions,
  getStatusKey = null,
  width = '120px',
  defaultStatus = 'active',
  render: customRender = null
} = {}) => ({
  label: 'Status',
  key: 'status',
  sortable: false,
  width,
  headerRender: makeFilterHeaderRender(
    statusFilter,
    (val) => { setStatusFilter(val); resetLoaded && resetLoaded(); },
    statusOptions
  ),
  render: customRender || ((item) => {
    const statusKey = getStatusKey ? getStatusKey(item) : getItemStatusInfo(item).key;
    const d = STATUS_DISPLAY_MAP[statusKey] || STATUS_DISPLAY_MAP[defaultStatus];
    const label = d.label || 'Active';
    const labelClass = d.labelClass || 'text-green-600 dark:text-green-400';
    const errorMessage = statusKey === 'error' && item.message ? item.message : null;

    const content = h('div', { className: 'flex items-center gap-1 text-xs' },
      h(Icon, { name: d.icon, size: 14, className: d.iconClass }),
      h('span', { className: labelClass }, label)
    );

    return errorMessage ? h(Tooltip, { content: errorMessage }, content) : content;
  })
});

/**
 * Create a Category column with filter dropdown
 * Uses unified category system - same categories apply to both aMule and rtorrent
 * @param {Object} options
 * @param {string} options.unifiedFilter - Current filter value
 * @param {function} options.setUnifiedFilter - Filter setter (val) => void
 * @param {function} options.resetLoaded - Reset loaded items function (for load-more mode)
 * @param {Array} options.filterOptions - Filter options array [{value, label}]
 * @param {Array} options.categories - Unified categories array for color lookup
 * @param {function} options.onCategoryClick - Optional click handler (hash, name, categoryName, client) => void
 * @param {boolean} options.disabled - Disable click handlers (for selection mode)
 * @returns {Object} Column definition
 */
export const buildCategoryColumn = ({
  unifiedFilter,
  setUnifiedFilter,
  resetLoaded,
  filterOptions,
  categories,
  onCategoryClick = null,
  disabled = false
} = {}) => ({
  label: 'Category',
  key: 'category',
  sortable: true,
  headerRender: filterOptions ? makeFilterHeaderRender(
    unifiedFilter,
    (val) => { setUnifiedFilter(val); resetLoaded && resetLoaded(); },
    filterOptions
  ) : undefined,
  render: (item) => {
    const isClickable = onCategoryClick && !disabled;

    // Get category name from unified item (all items now have category name)
    const categoryName = item.category || 'Default';

    // Look up category in unified categories array for color
    const cat = Array.isArray(categories)
      ? categories.find(c => (c.name || c.title) === categoryName)
      : null;

    // Get color from category (supports both hexColor string and BGR integer)
    const categoryColor = cat?.hexColor || categoryColorToHex(cat?.color) || DEFAULT_CATEGORY_COLOR;

    const content = [
      h('div', {
        key: 'color',
        className: 'w-3 h-3 rounded border border-gray-300 dark:border-gray-600',
        style: { backgroundColor: categoryColor }
      }),
      h('span', { key: 'label', className: 'truncate max-w-[100px]' }, categoryName)
    ];

    if (isClickable) {
      return h('button', {
        onClick: () => onCategoryClick(item.hash, item.name, categoryName, item.client || 'amule'),
        title: 'Click to change category',
        className: 'text-xs px-2 py-1 rounded flex items-center gap-1 hover:opacity-80 transition-opacity'
      }, ...content);
    }
    return h('div', { className: 'text-xs flex items-center gap-1' }, ...content);
  }
});

/**
 * Create a Ratio column
 * @param {Object} options
 * @param {function} options.calculateRatio - Function to calculate ratio from item (default: formatRatio(item.ratio))
 * @param {string} options.width - Column width (default '70px')
 * @returns {Object} Column definition
 */
export const buildRatioColumn = ({
  calculateRatio = (item) => formatRatio(item.ratio),
  width = '70px'
} = {}) => ({
  label: 'Ratio',
  key: 'ratio',
  sortable: true,
  width,
  render: (item) => h('span', { className: 'text-xs' }, calculateRatio(item))
});

/**
 * Create a Progress column with ProgressBar
 * @param {Object} options
 * @param {Object} options.theme - Theme object for ProgressBar
 * @param {string} options.variant - ProgressBar variant (default 'desktop')
 * @param {string} options.width - Column width (default '170px')
 * @returns {Object} Column definition
 */
export const buildProgressColumn = ({
  theme,
  variant = 'desktop',
  width = '170px'
} = {}) => ({
  label: 'Progress',
  key: 'progress',
  sortable: true,
  width,
  render: (item) => h(ProgressBar, { item, theme, variant })
});

/**
 * Create a Sources column for Downloads view
 * Shows source counts with different handling for rtorrent (seeders/leechers) and aMule (sources with A4AF)
 * @param {Object} options
 * @param {function} options.onClick - Click handler (item) => void
 * @param {boolean} options.disabled - Disable click handlers (for selection mode)
 * @param {string} options.width - Column width (default '130px')
 * @returns {Object} Column definition
 */
export const buildSourcesColumn = ({
  onClick,
  disabled = false,
  width = '130px'
} = {}) => ({
  label: 'Sources',
  key: 'sources',
  sortable: true,
  width,
  render: (item) => {
    const sourceText = formatSourceDisplay(item, true); // compact format for desktop
    const isRtorrent = item.client === 'rtorrent';
    const hasMessage = isRtorrent && item.message && item.message.trim();
    const isClickable = onClick && !disabled;

    // For rtorrent: clickable, color based on seed count, optional alert icon
    if (isRtorrent) {
      const seedColorClass = getSeederColorClass(item.sources?.seeders || 0);

      return h(isClickable ? 'button' : 'div', {
        onClick: isClickable ? () => onClick(item) : undefined,
        className: `flex items-center gap-1 ${seedColorClass}${isClickable ? ' hover:font-bold' : ''} font-mono text-xs transition-all`,
        title: isClickable ? (hasMessage ? item.message : 'Click to view details') : undefined
      },
        hasMessage && h(Icon, {
          name: 'alertCircle',
          size: 14,
          className: 'text-red-500 dark:text-red-400 flex-shrink-0'
        }),
        h('span', null, sourceText)
      );
    }

    // For aMule: tooltip with last seen complete, clickable
    // Split A4AF to new line if present
    const colorClass = getTimeBasedColor(item.lastSeenComplete);
    const formattedLastSeen = formatLastSeenComplete(item.lastSeenComplete);
    const a4af = item.sources?.a4af || 0;
    const mainText = sourceText.split(' + ')[0]; // Text before A4AF

    // In selection mode, skip tooltip and click handler
    if (!isClickable) {
      return h('div', { className: `${colorClass} font-mono text-xs text-left` },
        h('div', null, mainText),
        a4af > 0 && h('div', { className: 'text-purple-600 dark:text-purple-400' }, `+ ${a4af} A4AF`)
      );
    }

    const tooltipContent = h('div', null,
      h('div', { className: 'font-semibold' }, 'Last seen complete:'),
      h('div', null, formattedLastSeen)
    );

    return h(Tooltip, { content: tooltipContent, position: 'top' },
      h('button', {
        onClick: () => onClick(item),
        className: `${colorClass} hover:font-bold font-mono text-xs transition-all text-left`,
        title: 'Click to view details'
      },
        h('div', null, mainText),
        a4af > 0 && h('div', { className: 'text-purple-600 dark:text-purple-400' }, `+ ${a4af} A4AF`)
      )
    );
  }
});

/**
 * Create an Upload Speed column (upload-only with optional active uploads count)
 * Used by SharedView and UploadsView
 * @param {Object} options
 * @param {function} options.onClick - Click handler (item) => void
 * @param {boolean|function} options.disabled - Disable click: boolean for global, function (item) => boolean for per-item
 * @param {string} options.width - Column width (default '150px')
 * @param {string} options.speedKey - Property name for upload speed (default 'uploadSpeed', UploadsView uses 'uploadRate')
 * @param {boolean} options.showActiveUploads - Show active uploads count (default true)
 * @returns {Object} Column definition
 */
export const buildUploadSpeedColumn = ({
  onClick,
  disabled = false,
  width = '150px',
  speedKey = 'uploadSpeed',
  showActiveUploads = true
} = {}) => ({
  label: 'UL Speed',
  key: speedKey,
  sortable: true,
  width,
  render: (item) => {
    const ulSpeed = item[speedKey] || 0;
    const activeUploads = showActiveUploads ? (item.activeUploads || []).length : 0;
    const isDisabled = typeof disabled === 'function' ? disabled(item) : disabled;
    const isClickable = onClick && !isDisabled;

    if (ulSpeed <= 0 && activeUploads === 0) {
      return h('span', { className: 'text-xs' }, '-');
    }

    return h('span', { className: 'text-xs font-mono flex items-center' },
      ulSpeed > 0
        ? h('span', {
            className: `text-green-600 dark:text-green-400${isClickable ? ' cursor-pointer hover:underline decoration-dotted' : ''} flex items-center`,
            onClick: isClickable ? () => onClick(item) : undefined,
            title: isClickable ? 'Click to view details' : undefined
          }, h('span', { className: 'arrow-animated arrow-up' }, h(Icon, { name: 'arrowUp', size: 12 })), ' ', formatSpeed(ulSpeed))
        : h('span', { className: 'text-green-600 dark:text-green-400 flex items-center' }, h(Icon, { name: 'arrowUp', size: 12 }), ' -'),
      activeUploads > 0 && h('span', { className: 'text-gray-500 dark:text-gray-400 ml-1' }, `(${activeUploads})`)
    );
  }
});

/**
 * Create an Upload Total column with Total/Session sub-sorting
 * Shows total and session upload amounts with optional request counts
 * Used by SharedView and UploadsView
 * @param {Object} options
 * @param {string} options.width - Column width (default '150px')
 * @param {boolean} options.showRequests - Show request counts (default true, aMule only)
 * @param {string} options.label - Column label (default 'Upload')
 * @param {string} options.columnKey - Column key (default 'upload', UploadsView uses 'uploadTotal')
 * @param {boolean} options.sortable - Whether column is sortable (default false)
 * @returns {Object} Column definition
 */
export const buildUploadTotalColumn = ({
  width = '150px',
  showRequests = true,
  label = 'Upload',
  columnKey = 'upload',
  sortable = false
} = {}) => ({
  label,
  key: columnKey,
  sortable,
  mobileSortOptions: [
    { key: 'uploadTotal', label: 'UL Total' },
    { key: 'uploadSession', label: 'UL Session' }
  ],
  width,
  headerRender: ({ currentSortBy, currentSortDirection, onSortChange }) =>
    h('span', { className: 'flex items-center gap-1' },
      'UL',
      h(SortableHeaderPart, {
        label: 'Total',
        sortKey: 'uploadTotal',
        currentSortBy,
        currentSortDirection,
        onSortChange
      }),
      '/',
      h(SortableHeaderPart, {
        label: 'Session',
        sortKey: 'uploadSession',
        currentSortBy,
        currentSortDirection,
        onSortChange
      })
    ),
  render: (item) => {
    const total = formatBytes(item.uploadTotal);
    const totalRequests = showRequests && item.requestsAcceptedTotal != null ? ` (${item.requestsAcceptedTotal})` : '';

    // rtorrent doesn't track session stats
    if (item.client === 'rtorrent' || item.uploadSession === null) {
      return h('span', { className: 'text-xs' }, total + totalRequests);
    }

    const session = formatBytes(item.uploadSession);
    const sessionRequests = showRequests && item.requestsAccepted != null ? ` (${item.requestsAccepted})` : '';

    return h('div', { className: 'text-xs leading-tight' },
      h('div', null, total + totalRequests),
      h('div', { className: 'text-gray-500 dark:text-gray-400' }, session + sessionRequests)
    );
  }
});

/**
 * Create a Client column showing software, hostname/IP, and geo data
 * Used by UploadsView for displaying upload peer information
 * @param {Object} options
 * @param {boolean} options.showGeo - Show geo data (country flag + city) (default true)
 * @returns {Object} Column definition
 */
export const buildClientColumn = ({
  showGeo = true
} = {}) => ({
  label: 'Client',
  key: 'software',
  sortable: true,
  render: (item) => {
    const isRtorrent = item.client === 'rtorrent';
    const clientSoftware = getClientSoftware(item);
    const ipString = getIpString(item);

    return h('div', { className: 'space-y-1 text-xs' }, [
      h('div', null,
        h('span', { className: 'font-medium align-baseline' },
          isRtorrent || !item.software || item.software === 'Unknown'
            ? clientSoftware
            : item.software
        )
      ),
      h('div', null,
        item.hostname
          ? h(Tooltip, { content: ipString, position: 'top' },
              h('span', { className: 'font-mono cursor-help break-all' }, item.hostname)
            )
          : h('span', { className: 'font-mono break-all' }, ipString)
      ),
      showGeo && (item.geoData?.countryCode || item.geoData?.city) && h('div', { className: 'flex items-center gap-1' },
        item.geoData?.countryCode ? h(FlagIcon, {
          countryCode: item.geoData.countryCode,
          size: 16,
          title: item.geoData.countryCode
        }) : null,
        item.geoData?.city ? h('span', { className: 'text-gray-500 dark:text-gray-400' }, item.geoData.city) : null
      )
    ]);
  }
});

/**
 * Create an Added At column showing when the item was added
 * Shows relative time (e.g., "5 days ago") with formatted timestamp in tooltip
 * @param {Object} options
 * @param {string} options.width - Column width (default '100px')
 * @param {string} options.label - Column label (default 'Added')
 * @param {boolean} options.showUsername - Show username below date if available (default false)
 * @param {boolean|function} options.selectionMode - Skip tooltip when true (default false)
 * @returns {Object} Column definition
 */
export const buildAddedAtColumn = ({
  width = '100px',
  label = 'Added',
  showUsername = false,
  selectionMode = false
} = {}) => ({
  label,
  key: 'addedAt',
  sortable: true,
  width,
  render: (item) => {
    const isSelectionMode = typeof selectionMode === 'function' ? selectionMode() : selectionMode;

    // Treat 0, null, undefined as "no data" (0 = epoch time, not a real added date)
    if (!item.addedAt || item.addedAt === 0) {
      return h('span', { className: 'text-xs text-gray-400' }, '-');
    }

    const relativeTime = formatTimeAgo(item.addedAt);
    const fullDateTime = formatDateTime(item.addedAt);

    const timeElement = isSelectionMode
      ? h('span', { className: 'text-xs' }, relativeTime)
      : h(Tooltip, { content: fullDateTime, position: 'top' },
          h('span', { className: 'text-xs cursor-help' }, relativeTime)
        );

    // If showing username, wrap in a flex column
    if (showUsername && item.username) {
      return h('div', { className: 'flex flex-col' },
        timeElement,
        h('div', { className: 'flex items-center gap-1 text-gray-500 dark:text-gray-400 mt-0.5' },
          h(Icon, { name: 'user', size: 12 }),
          h('span', { className: 'text-xs' }, item.username)
        )
      );
    }

    return timeElement;
  }
});

/**
 * Create an ETA column showing estimated time to completion
 * Uses pre-calculated eta field from server (in seconds)
 * @param {Object} options
 * @param {string} options.width - Column width (default '80px')
 * @param {string} options.label - Column label (default 'ETA')
 * @returns {Object} Column definition
 */
export const buildETAColumn = ({
  width = '80px',
  label = 'ETA'
} = {}) => ({
  label,
  key: 'eta',
  sortable: true,
  width,
  getValue: (item) => item.eta,
  render: (item) => {
    const etaSeconds = item.eta;
    // null means complete or stalled (no speed)
    if (etaSeconds === null) {
      // Check if complete by looking at progress
      if (item.progress >= 100) {
        return h('span', { className: 'text-xs text-green-600 dark:text-green-400' }, '✓');
      }
      return h('span', { className: 'text-xs' }, '-');
    }
    return h('span', { className: 'text-xs' }, formatETASeconds(etaSeconds));
  }
});
