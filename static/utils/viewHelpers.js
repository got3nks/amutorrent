/**
 * viewHelpers.js
 *
 * View component mapping
 * Views use contexts directly for their data
 */

import {
  LogsView,
  ServersView,
  SharedView,
  UploadsView,
  CategoriesView,
  HomeView,
  SearchView,
  SearchResultsView,
  DownloadsView,
  StatisticsView,
  SettingsView,
  HistoryView,
  NotificationsView
} from '../components/views/index.js';

/**
 * Mapping of view names to their components
 */
export const VIEW_COMPONENTS = {
  'home': HomeView,
  'search': SearchView,
  'search-results': SearchResultsView,
  'downloads': DownloadsView,
  'history': HistoryView,
  'uploads': UploadsView,
  'shared': SharedView,
  'categories': CategoriesView,
  'servers': ServersView,
  'logs': LogsView,
  'statistics': StatisticsView,
  'notifications': NotificationsView,
  'settings': SettingsView
};
