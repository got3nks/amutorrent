/**
 * Contexts Index
 *
 * Central export point for all context providers and hooks
 *
 * Data contexts are split for performance:
 * - useLiveData: frequently changing data (stats, downloads, uploads)
 * - useStaticData: less frequently changing data (categories, servers, shared, etc.)
 */

export { AppStateProvider, useAppState } from './AppStateContext.js';
export { LiveDataProvider, useLiveData } from './LiveDataContext.js';
export { StaticDataProvider, useStaticData } from './StaticDataContext.js';
export { DataFetchProvider, useDataFetch } from './DataFetchContext.js';
export { SearchProvider, useSearch } from './SearchContext.js';
export { ActionsProvider, useActions } from './ActionsContext.js';
export { ThemeProvider, useTheme } from './ThemeContext.js';
export { FontSizeProvider, useFontSize, FONT_SIZES } from './FontSizeContext.js';
export { WebSocketProvider, useWebSocketConnection } from './WebSocketContext.js';
export { VersionProvider, useVersion } from './VersionContext.js';
export { ClientFilterProvider, useClientFilter } from './ClientFilterContext.js';
export { StickyHeaderProvider, useStickyHeader, useStickyToolbar } from './StickyHeaderContext.js';
