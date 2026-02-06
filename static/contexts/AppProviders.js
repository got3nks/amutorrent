/**
 * AppProviders
 *
 * Wraps all context providers in the correct order
 * Includes: Auth, Theme, AppState, LiveData, StaticData, Search, WebSocket, DataFetch, Actions
 *
 * Data contexts are split for performance:
 * - LiveDataContext: frequently changing data (stats, downloads, uploads)
 * - StaticDataContext: less frequently changing data (categories, servers, shared, etc.)
 */

import React from 'https://esm.sh/react@18.2.0';
import { AuthProvider } from './AuthContext.js';
import { ThemeProvider } from './ThemeContext.js';
import { FontSizeProvider } from './FontSizeContext.js';
import { AppStateProvider } from './AppStateContext.js';
import { LiveDataProvider } from './LiveDataContext.js';
import { StaticDataProvider } from './StaticDataContext.js';
import { SearchProvider } from './SearchContext.js';
import { WebSocketProvider } from './WebSocketContext.js';
import { DataFetchProvider } from './DataFetchContext.js';
import { ActionsProvider } from './ActionsContext.js';
import { VersionProvider } from './VersionContext.js';
import { ClientFilterProvider } from './ClientFilterContext.js';
import { StickyHeaderProvider } from './StickyHeaderContext.js';

const { createElement: h } = React;

/**
 * Compose multiple providers into a single component
 * Providers are applied from first to last (outermost to innermost)
 * @param {...React.ComponentType} providers - Provider components to compose
 * @returns {React.ComponentType} Composed provider component
 */
const composeProviders = (...providers) => ({ children }) =>
  providers.reduceRight(
    (acc, Provider) => h(Provider, null, acc),
    children
  );

/**
 * All app context providers composed in the correct order
 * Order matters: outer providers are available to inner providers
 *
 * Provider hierarchy:
 * 1. AuthProvider - authentication state
 * 2. ThemeProvider - theme (light/dark)
 * 3. FontSizeProvider - font size (small/medium/large)
 * 4. VersionProvider - app version info
 * 5. AppStateProvider - UI state (current view, modals, etc.)
 * 6. LiveDataProvider - frequently changing data (stats, downloads, uploads)
 * 7. StaticDataProvider - less frequently changing data (categories, servers, etc.)
 * 8. ClientFilterProvider - client filter (aMule/rtorrent enabled) - needs LiveData for connection status
 * 9. SearchProvider - search state
 * 10. WebSocketProvider - WebSocket connection (uses LiveData + StaticData)
 * 11. DataFetchProvider - data fetching functions (uses LiveData + StaticData)
 * 12. ActionsProvider - action handlers (uses WebSocket)
 * 13. StickyHeaderProvider - scroll-based header management (UI only)
 */
export const AppProviders = composeProviders(
  AuthProvider,
  ThemeProvider,
  FontSizeProvider,
  VersionProvider,
  AppStateProvider,
  LiveDataProvider,
  StaticDataProvider,
  ClientFilterProvider,
  SearchProvider,
  WebSocketProvider,
  DataFetchProvider,
  ActionsProvider,
  StickyHeaderProvider
);
