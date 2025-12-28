/**
 * Application Constants
 *
 * Configuration values and constants used throughout the application
 */

// Pagination
export const PAGE_SIZE_DESKTOP = 20;
export const PAGE_SIZE_MOBILE = 10;

// Breakpoints (match Tailwind defaults)
export const BREAKPOINT_MD = 768; // px

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

// Search types
export const SEARCH_TYPES = {
  GLOBAL: 'global',
  LOCAL: 'local',
  KAD: 'kad'
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
