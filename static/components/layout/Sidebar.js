/**
 * Sidebar Component
 *
 * Navigation sidebar with all main views
 */

import React from 'https://esm.sh/react@18.2.0';
import { NavButton, Icon } from '../common/index.js';
import { useStaticData } from '../../contexts/StaticDataContext.js';
import { useCapabilities } from '../../hooks/useCapabilities.js';

const { createElement: h } = React;

/**
 * Custom nav button with optional warning indicator inside
 */
const WarningNavButton = ({ currentView, onNavigate, icon, label, view, hasWarning }) => {
  const active = currentView === view;
  return h('button', {
    onClick: () => onNavigate(view),
    className: `flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 rounded-lg transition-all text-base sm:text-lg font-medium ${
      active
        ? 'bg-blue-600 text-white shadow-lg'
        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
    }`
  },
    h(Icon, { name: icon, size: 20 }),
    h('span', { className: 'flex-1 text-left' }, label),
    hasWarning && h(Icon, {
      name: 'alertTriangle',
      size: 16,
      className: active ? 'text-amber-300' : 'text-amber-500'
    })
  );
};

/**
 * Sidebar component
 * @param {string} currentView - Current active view
 * @param {function} onNavigate - Navigation handler
 * @param {boolean} isLandscape - Is device in landscape mode
 */
const Sidebar = ({ currentView, onNavigate, isLandscape }) => {
  // Don't render sidebar on mobile in landscape mode
  if (isLandscape) return null;

  const { hasType, hasCategoryPathWarnings, hasClientConnectionWarnings } = useStaticData();
  const { hasCap, isAdmin } = useCapabilities();
  const amuleEnabled = hasType('amule');
  const slskdEnabled = hasType('slskd');

  return h('aside', {
    className: 'hidden md:flex md:flex-col w-56 bg-white dark:bg-gray-800 p-3 rounded-lg shadow border border-gray-200 dark:border-gray-700'
  },
    h('div', { className: 'space-y-2' },
      h(NavButton, { icon: 'home', label: 'Home', view: 'home', active: currentView === 'home', onNavigate }),
      hasCap('search') && h(NavButton, { icon: 'search', label: 'Search', view: 'search', active: currentView === 'search' || currentView === 'search-results', onNavigate }),
      h(NavButton, { icon: 'download', label: 'Downloads', view: 'downloads', active: currentView === 'downloads', onNavigate }),
      hasCap('view_history') && h(NavButton, { icon: 'history', label: 'History', view: 'history', active: currentView === 'history', onNavigate }),
      hasCap('view_shared') && h(NavButton, { icon: 'share', label: 'Shared Files', shortLabel: 'Shared', view: 'shared', active: currentView === 'shared', onNavigate }),
      hasCap('view_uploads') && h(NavButton, { icon: 'upload', label: 'Uploads', view: 'uploads', active: currentView === 'uploads', onNavigate }),
      hasCap('manage_categories') && h(WarningNavButton, { currentView, onNavigate, icon: 'folder', label: 'Categories', view: 'categories', hasWarning: hasCategoryPathWarnings }),
      amuleEnabled && hasCap('view_servers') && h(NavButton, { icon: 'server', label: 'ED2K Servers', shortLabel: 'Servers', view: 'servers', active: currentView === 'servers', onNavigate }),
      slskdEnabled && hasCap('search') && h(NavButton, { icon: 'messageSquare', label: 'Soulseek Chat', shortLabel: 'Chat', view: 'chat', active: currentView === 'chat', onNavigate }),
      hasCap('view_logs') && h(NavButton, { icon: 'fileText', label: 'Logs', view: 'logs', active: currentView === 'logs', onNavigate }),
      hasCap('view_statistics') && h(NavButton, { icon: 'chartBar', label: 'Statistics', view: 'statistics', active: currentView === 'statistics', onNavigate }),
      isAdmin && h(NavButton, { icon: 'bell', label: 'Notifications', view: 'notifications', active: currentView === 'notifications', onNavigate }),
      isAdmin && h(WarningNavButton, { currentView, onNavigate, icon: 'settings', label: 'Settings', view: 'settings', hasWarning: hasClientConnectionWarnings })
    )
  );
};

// Memoize to prevent re-renders when parent context changes but props don't
export default React.memo(Sidebar);
