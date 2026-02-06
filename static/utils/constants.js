/**
 * Application Constants
 *
 * Configuration values and constants used throughout the application
 */

// Pagination
export const PAGE_SIZE_DESKTOP = 100;
export const PAGE_SIZE_MOBILE = 10;
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 200];

// Breakpoints (match Tailwind defaults)
export const BREAKPOINT_MD = 768; // px
export const BREAKPOINT_XL = 1280; // px

// Refresh intervals (milliseconds)
export const AUTO_REFRESH_INTERVAL = 3000;        // Main data refresh
export const LOGS_REFRESH_INTERVAL = 5000;        // Logs refresh
export const STATISTICS_REFRESH_INTERVAL = 15000;  // Statistics refresh

// WebSocket reconnection
export const WS_INITIAL_RECONNECT_DELAY = 1000;   // ms
export const WS_MAX_RECONNECT_DELAY = 16000;      // ms

// Error display duration
export const ERROR_DISPLAY_DURATION = 4000;       // ms

// Default category ID
export const DEFAULT_CATEGORY_ID = 0;

// Animated stripes overlay for progress bars (used when actively downloading)
export const PROGRESS_STRIPES_STYLE = {
  backgroundImage: 'linear-gradient(-45deg, rgba(255,255,255,0.15) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.15) 50%, rgba(255,255,255,0.15) 75%, transparent 75%, transparent)',
  backgroundSize: '1rem 1rem',
  animation: 'progress-stripes 1s linear infinite'
};

// Search types
export const SEARCH_TYPES = {
  GLOBAL: 'global',
  LOCAL: 'local',
  KAD: 'kad',
  PROWLARR: 'prowlarr'
};

// Sort directions
export const SORT_DIRECTIONS = {
  ASC: 'asc',
  DESC: 'desc'
};

// View names
export const VIEWS = {
  HOME: 'home',
  SEARCH: 'search',
  SEARCH_RESULTS: 'search-results',
  DOWNLOADS: 'downloads',
  UPLOADS: 'uploads',
  SHARED: 'shared',
  SERVERS: 'servers',
  CATEGORIES: 'categories',
  STATISTICS: 'statistics',
  LOGS: 'logs'
};

// Priority values
export const PRIORITIES = {
  NORMAL: 0,
  HIGH: 1,
  LOW: 2,
  AUTO: 3
};

// Priority labels
export const PRIORITY_LABELS = {
  [PRIORITIES.NORMAL]: 'Normal',
  [PRIORITIES.HIGH]: 'High',
  [PRIORITIES.LOW]: 'Low',
  [PRIORITIES.AUTO]: 'Auto'
};

// aMule download status codes (EC protocol)
export const AMULE_STATUS = {
  DOWNLOADING: 0,
  DOWNLOADING_ACTIVE: 1,  // Also downloading (active state)
  PAUSED: 7
};

// rtorrent state values (d.state command)
// Note: The human-readable status is computed from state + is_open + is_active
export const RTORRENT_STATE = {
  STOPPED: 0,
  STARTED: 1
};

// rtorrent state labels
export const RTORRENT_STATE_LABELS = {
  [RTORRENT_STATE.STOPPED]: 'Stopped',
  [RTORRENT_STATE.STARTED]: 'Started'
};

// UI Timeouts (milliseconds)
export const UI_TIMEOUTS = {
  COPY_FEEDBACK: 2000,           // "Copied!" feedback display
  SEARCH_DEBOUNCE: 300,          // Search input debounce
  FETCH_DELAY_SHORT: 100,        // Short delay before fetch (downloads)
  FETCH_DELAY_MEDIUM: 500,       // Medium delay before fetch (servers)
  SETUP_COMPLETION: 1000,        // Setup wizard completion delay
  MOBILE_TOUCH_HOVER: 2000,      // Mobile hover simulation on touch
  DASHBOARD_CACHE: 30000         // Dashboard data cache duration
};

// Widget settings
export const WIDGET_SETTINGS = {
  MAX_ITEMS: 50                  // Max items in dashboard widgets
};

// Progress bar dimensions (pixels)
export const PROGRESS_BAR = {
  DESKTOP_WIDTH: 170,
  MOBILE_WIDTH: 400,
  HEIGHT: 20
};

// Table row styles (alternating colors)
export const TABLE_ROW_STYLES = {
  rowEven: 'bg-gray-50 dark:bg-gray-800',
  rowOdd: 'bg-white dark:bg-gray-900',
  hover: 'hover:bg-indigo-100 dark:hover:bg-indigo-700',
  transition: 'transition-colors duration-200',
  headerBorder: 'border-b-2 border-gray-300 dark:border-gray-600'
};

// Helper to get table row class
export const getTableRowClass = (idx, extraClass = '') => {
  const bg = idx % 2 === 0 ? TABLE_ROW_STYLES.rowEven : TABLE_ROW_STYLES.rowOdd;
  return `${bg} ${TABLE_ROW_STYLES.hover} ${TABLE_ROW_STYLES.transition} ${extraClass}`.trim();
};

// Mobile card view styles (compact table-style)
// Colors match table row alternating colors
export const MOBILE_CARD_STYLES = {
  container: 'divide-y divide-gray-200 dark:divide-gray-700 border-y border-gray-200 dark:border-gray-700',
  rowBase: 'py-3 sm:py-3.5 pr-1.5 sm:pr-2',
  rowEven: TABLE_ROW_STYLES.rowEven,
  rowOdd: TABLE_ROW_STYLES.rowOdd
};

// Helper to get mobile card row class
export const getMobileCardRowClass = (idx, extraClass = '') => {
  const bg = idx % 2 === 0 ? MOBILE_CARD_STYLES.rowEven : MOBILE_CARD_STYLES.rowOdd;
  return `${MOBILE_CARD_STYLES.rowBase} ${bg} ${extraClass}`.trim();
};

// Row highlight styles for selection mode and context menu
export const ROW_HIGHLIGHT = {
  selected: '!bg-purple-100 dark:!bg-purple-900/40 hover:!bg-purple-200 dark:hover:!bg-purple-900/60',
  selectedMobile: 'bg-purple-100 dark:bg-purple-900/40',
  contextMenu: '!bg-indigo-100 dark:!bg-indigo-700'
};

// Helper to get row highlight class based on selection/context menu state
export const getRowHighlightClass = (isSelected, isContextTarget, mobile = false) =>
  isSelected ? (mobile ? ROW_HIGHLIGHT.selectedMobile : ROW_HIGHLIGHT.selected)
  : isContextTarget ? ROW_HIGHLIGHT.contextMenu
  : '';

// View title styles (for page headers)
export const VIEW_TITLE_STYLES = {
  mobile: 'text-base font-bold text-gray-800 dark:text-gray-100 whitespace-nowrap ml-1',
  desktop: 'text-base sm:text-lg font-bold text-gray-800 dark:text-gray-100 ml-1'
};

// Icon sizes (pixels)
export const ICON_SIZES = {
  SMALL: 12,
  MEDIUM: 14,
  LARGE: 16
};

// Client software types (for uploads view)
export const CLIENT_SOFTWARE = {
  EMULE: 0,
  AMULE: 1,
  XMULE: 2,
  AMULE_ALT: 3,
  MLDONKEY: 4,
  SHAREAZA: 5
};

// Client software labels
export const CLIENT_SOFTWARE_LABELS = {
  [CLIENT_SOFTWARE.EMULE]: 'eMule',
  [CLIENT_SOFTWARE.AMULE]: 'aMule',
  [CLIENT_SOFTWARE.XMULE]: 'xMule',
  [CLIENT_SOFTWARE.AMULE_ALT]: 'aMule',
  [CLIENT_SOFTWARE.MLDONKEY]: 'MLDonkey',
  [CLIENT_SOFTWARE.SHAREAZA]: 'Shareaza'
};

// History status badge colors and labels
export const HISTORY_STATUS_CONFIG = {
  downloading: {
    label: 'Downloading',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    textColor: 'text-blue-800 dark:text-blue-300',
    icon: 'arrowDown'
  },
  completed: {
    label: 'Completed',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    textColor: 'text-green-800 dark:text-green-300',
    icon: 'check'
  },
  missing: {
    label: 'Missing',
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
    textColor: 'text-yellow-800 dark:text-yellow-300',
    icon: 'alertTriangle'
  },
  deleted: {
    label: 'Deleted',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
    textColor: 'text-red-800 dark:text-red-300',
    icon: 'trash'
  }
};

// Default sort configuration for each view (primary sort)
export const DEFAULT_SORT_CONFIG = {
  'search': { sortBy: 'sourceCount', sortDirection: 'desc' },
  'search-results': { sortBy: 'sourceCount', sortDirection: 'desc' },
  'downloads': { sortBy: 'downloadSpeed', sortDirection: 'desc' },
  'uploads': { sortBy: 'uploadRate', sortDirection: 'desc' },
  'shared': { sortBy: 'uploadSpeed', sortDirection: 'desc' },
  'servers': { sortBy: 'EC_TAG_SERVER_FILES', sortDirection: 'desc' },
  'history': { sortBy: 'addedAt', sortDirection: 'desc' },
  'categories': { sortBy: 'title', sortDirection: 'asc' }
};

// Default secondary sort configuration for table views
// Used when primary sort values are equal
export const DEFAULT_SECONDARY_SORT_CONFIG = {
  'downloads': { sortBy: 'addedAt', sortDirection: 'desc' },
  'uploads': { sortBy: 'name', sortDirection: 'asc' },
  'shared': { sortBy: 'uploadTotal', sortDirection: 'desc' },
  'history': { sortBy: 'name', sortDirection: 'asc' }
};
