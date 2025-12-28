/**
 * Sidebar Component
 *
 * Navigation sidebar with all main views
 */

import React from 'https://esm.sh/react@18.2.0';
import { NavButton } from '../common/index.js';

const { createElement: h } = React;

/**
 * Sidebar component
 * @param {string} currentView - Current active view
 * @param {function} onNavigate - Navigation handler
 * @param {boolean} isLandscape - Is device in landscape mode
 */
const Sidebar = ({ currentView, onNavigate, isLandscape }) => {
  // Don't render sidebar on mobile in landscape mode
  if (isLandscape) return null;

  return h('aside', {
    className: 'hidden md:flex md:flex-col w-56 bg-white dark:bg-gray-800 p-3 rounded-lg shadow border border-gray-200 dark:border-gray-700'
  },
    h('div', { className: 'space-y-2' },
      h(NavButton, { icon: 'home', label: 'Home', view: 'home', active: currentView === 'home', onNavigate }),
      h(NavButton, { icon: 'search', label: 'Search', view: 'search', active: currentView === 'search' || currentView === 'search-results', onNavigate }),
      h(NavButton, { icon: 'download', label: 'Downloads', view: 'downloads', active: currentView === 'downloads', onNavigate }),
      h(NavButton, { icon: 'upload', label: 'Uploads', view: 'uploads', active: currentView === 'uploads', onNavigate }),
      h(NavButton, { icon: 'share', label: 'Shared Files', view: 'shared', active: currentView === 'shared', onNavigate }),
      h(NavButton, { icon: 'folder', label: 'Categories', view: 'categories', active: currentView === 'categories', onNavigate }),
      h(NavButton, { icon: 'server', label: 'Servers', view: 'servers', active: currentView === 'servers', onNavigate }),
      h(NavButton, { icon: 'fileText', label: 'Logs', view: 'logs', active: currentView === 'logs', onNavigate }),
      h(NavButton, { icon: 'chartBar', label: 'Statistics', view: 'statistics', active: currentView === 'statistics', onNavigate })
    )
  );
};

export default Sidebar;
