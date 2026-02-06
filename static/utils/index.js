/**
 * Utilities Index
 *
 * Central export point for all utility modules
 */

// Formatters
export {
  formatBytes,
  formatSpeed,
  formatStatsValue,
  formatDateTime,
  formatTimeAgo,
  formatETA,
  formatETASeconds,
  formatLastSeenComplete,
  getTimeBasedColor,
  ipToString,
  generateMagnetLink,
  formatRatio,
  calculateRatio
} from './formatters.js';

// Validators
export {
  extractEd2kLinks,
  isValidEd2kLink
} from './validators.js';

// Colors
export {
  getProgressColor,
  getCategoryColorStyle,
  categoryColorToHex,
  hexToCategoryColor
} from './colors.js';

// Sorting
export {
  sortFiles,
  getNextSortDirection,
  createSortConfig
} from './sorting.js';

// Constants
export {
  PAGE_SIZE_DESKTOP,
  PAGE_SIZE_MOBILE,
  PAGE_SIZE_OPTIONS,
  BREAKPOINT_MD,
  BREAKPOINT_XL,
  AUTO_REFRESH_INTERVAL,
  LOGS_REFRESH_INTERVAL,
  STATISTICS_REFRESH_INTERVAL,
  WS_INITIAL_RECONNECT_DELAY,
  WS_MAX_RECONNECT_DELAY,
  ERROR_DISPLAY_DURATION,
  DEFAULT_CATEGORY_ID,
  SEARCH_TYPES,
  SORT_DIRECTIONS,
  VIEWS,
  PRIORITIES,
  PRIORITY_LABELS,
  AMULE_STATUS,
  UI_TIMEOUTS,
  WIDGET_SETTINGS,
  PROGRESS_BAR,
  TABLE_ROW_STYLES,
  getTableRowClass,
  MOBILE_CARD_STYLES,
  getMobileCardRowClass,
  ICON_SIZES,
  CLIENT_SOFTWARE,
  CLIENT_SOFTWARE_LABELS,
  HISTORY_STATUS_CONFIG,
  DEFAULT_SORT_CONFIG,
  DEFAULT_SECONDARY_SORT_CONFIG,
  getRowHighlightClass,
  VIEW_TITLE_STYLES,
  PROGRESS_STRIPES_STYLE
} from './constants.js';

// Pagination
export {
  calculatePagination,
  calculateLoadMore,
  generatePageOptions,
  shouldShowPagination,
  getNavigationBounds
} from './pagination.js';

// Chart Loader
export {
  loadChartJs,
  isChartJsLoaded
} from './chartLoader.js';

// Clipboard
export {
  copyToClipboard
} from './clipboard.js';

// Markdown
export {
  parseMarkdownBold
} from './markdown.js';

// Network Status
export {
  getED2KStatus,
  getKADStatus,
  getStatusDotClass,
  getStatusBadgeClass,
  getStatusIcon
} from './networkStatus.js';

// Table Helpers
export {
  makeFilterHeaderRender,
  getSortableColumns
} from './tableHelpers.js';

// Download Helpers
export {
  isItemPaused,
  isItemStopped,
  isItemChecking,
  isItemHashingQueued,
  isItemDownloading,
  STATUS_DISPLAY_MAP,
  STATUS_LABELS,
  getItemStatusInfo,
  getStatusBarColor,
  isActiveStatus,
  formatSourceDisplay,
  hasRtorrentItems,
  hasAmuleItems,
  filterByClient,
  filterByUnifiedFilter,
  buildUnifiedFilterOptions,
  buildCategoryColumnFilterOptions,
  formatTitleCount,
  getSeederColorClass,
  getSelectedClientTypes,
  getClientSoftware,
  getIpString,
  getExportLink,
  getExportLinkLabel,
  extractUniqueTrackers,
  filterByTracker,
  buildTrackerFilterOptions
} from './downloadHelpers.js';

// Column Builders
export {
  buildSpeedColumn,
  buildSizeColumn,
  buildTransferColumn,
  buildFileNameColumn,
  buildStatusColumn,
  buildCategoryColumn,
  buildRatioColumn,
  buildProgressColumn,
  buildSourcesColumn,
  buildUploadSpeedColumn,
  buildUploadTotalColumn,
  buildClientColumn,
  buildAddedAtColumn,
  buildETAColumn
} from './columnBuilders.js';

// Mobile Filter Helpers
export {
  createCategoryLabelFilter,
  createTrackerFilter,
  createIndexerFilter
} from './mobileFilterHelpers.js';
