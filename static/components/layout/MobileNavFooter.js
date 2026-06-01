/**
 * MobileNavFooter Component
 *
 * Bottom navigation bar for mobile devices with main nav items and a "More" menu
 */

import React from 'https://esm.sh/react@18.2.0';
import Icon from '../common/Icon.js';
import Portal from '../common/Portal.js';
import { useLiveData } from '../../contexts/LiveDataContext.js';
import { useStaticData } from '../../contexts/StaticDataContext.js';
import { useCapabilities } from '../../hooks/useCapabilities.js';

const { createElement: h, useState, useRef, useEffect, useMemo } = React;

/**
 * Navigation item for the footer
 */
const NavItem = ({ icon, label, active, badge, onClick }) => {
  return h('button', {
    onClick,
    className: `flex flex-col items-center justify-center flex-1 py-1.5 px-1 transition-colors ${
      active
        ? 'text-blue-600 dark:text-blue-400'
        : 'text-gray-500 dark:text-gray-400'
    }`
  },
    h('div', { className: 'relative' },
      h(Icon, { name: icon, size: 20, className: active ? 'text-blue-600 dark:text-blue-400' : '' }),
      badge > 0 && h('span', {
        className: 'absolute -top-0.5 -right-2.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-blue-600 text-white text-[9px] font-bold leading-none'
      }, badge > 99 ? '99+' : badge)
    ),
    h('span', { className: 'text-[9px] mt-0.5 font-medium' }, label)
  );
};

/**
 * More menu popup item
 */
const MoreMenuItem = ({ icon, label, active, warning, onClick }) => {
  return h('button', {
    onClick,
    className: `flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors ${
      active
        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
        : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
    }`
  },
    h(Icon, { name: icon, size: 18 }),
    h('span', { className: 'text-sm font-medium flex items-center gap-1.5' },
      label,
      warning && h(Icon, { name: 'alertTriangle', size: 14, className: 'text-amber-500' })
    )
  );
};

/**
 * MobileNavFooter component
 * @param {string} currentView - Current active view
 * @param {function} onNavigate - Navigation handler
 */
const MobileNavFooter = ({ currentView, onNavigate }) => {
  const { dataItems } = useLiveData();
  const { hasType, hasCategoryPathWarnings, hasClientConnectionWarnings } = useStaticData();
  const { hasCap, isAdmin } = useCapabilities();
  const amuleEnabled = hasType('amule');
  const slskdEnabled = hasType('slskd');

  // Count active downloads for badge
  const activeDownloadCount = useMemo(() => {
    if (!dataItems) return 0;
    return dataItems.filter(i => i.downloading).length;
  }, [dataItems]);

  // Count active uploads for badge (peers with uploadRate > 0)
  const activeUploadCount = useMemo(() => {
    if (!dataItems) return 0;
    return dataItems.reduce((sum, i) => sum + (i.peers || []).filter(p => p.uploadRate > 0).length, 0);
  }, [dataItems]);

  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreButtonRef = useRef(null);
  const menuRef = useRef(null);

  // Close menu when clicking outside
  useEffect(() => {
    if (!moreMenuOpen) return;

    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target) &&
          moreButtonRef.current && !moreButtonRef.current.contains(e.target)) {
        setMoreMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [moreMenuOpen]);

  // Close menu on view change
  useEffect(() => {
    setMoreMenuOpen(false);
  }, [currentView]);

  const handleNavigate = (view) => {
    setMoreMenuOpen(false);
    onNavigate(view);
  };

  // Main nav items (capability-filtered)
  const mainNavItems = [
    { icon: 'home', label: 'Home', view: 'home' },
    hasCap('search') && { icon: 'search', label: 'Search', view: 'search', activeViews: ['search', 'search-results'] },
    { icon: 'download', label: 'Downloads', view: 'downloads', badge: activeDownloadCount },
    hasCap('view_uploads') && { icon: 'upload', label: 'Uploads', view: 'uploads', badge: activeUploadCount }
  ].filter(Boolean);

  // More menu items (capability + client-type filtered)
  const moreMenuItems = [
    { icon: 'history', label: 'History', view: 'history', cap: 'view_history' },
    { icon: 'share', label: 'Shared Files', view: 'shared', cap: 'view_shared' },
    { icon: 'folder', label: 'Categories', view: 'categories', warning: hasCategoryPathWarnings, cap: 'manage_categories' },
    ...(amuleEnabled ? [{ icon: 'server', label: 'ED2K Servers', view: 'servers', cap: 'view_servers' }] : []),
    ...(slskdEnabled ? [{ icon: 'messageSquare', label: 'Soulseek Chat', view: 'chat', cap: 'search' }] : []),
    { icon: 'fileText', label: 'Logs', view: 'logs', cap: 'view_logs' },
    { icon: 'chartBar', label: 'Statistics', view: 'statistics', cap: 'view_statistics' },
    { icon: 'bell', label: 'Notifications', view: 'notifications', adminOnly: true },
    { icon: 'settings', label: 'Settings', view: 'settings', warning: hasClientConnectionWarnings, adminOnly: true }
  ].filter(item => item.adminOnly ? isAdmin : (!item.cap || hasCap(item.cap)));

  // Check if current view is in the "More" menu
  const isMoreActive = moreMenuItems.some(item => item.view === currentView);

  return h('nav', {
    className: 'md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 z-50 safe-area-bottom'
  },
    h('div', { className: 'flex items-stretch' },
      // Main nav items
      ...mainNavItems.map(item =>
        h(NavItem, {
          key: item.view,
          icon: item.icon,
          label: item.label,
          badge: item.badge || 0,
          active: item.activeViews
            ? item.activeViews.includes(currentView)
            : currentView === item.view,
          onClick: () => handleNavigate(item.view)
        })
      ),
      // More button
      h('button', {
        ref: moreButtonRef,
        onClick: () => setMoreMenuOpen(!moreMenuOpen),
        className: `flex flex-col items-center justify-center flex-1 py-1.5 px-1 transition-colors ${
          isMoreActive || moreMenuOpen
            ? 'text-blue-600 dark:text-blue-400'
            : 'text-gray-500 dark:text-gray-400'
        }`
      },
        h(Icon, { name: 'moreHorizontal', size: 20, className: isMoreActive || moreMenuOpen ? 'text-blue-600 dark:text-blue-400' : '' }),
        h('span', { className: 'text-[9px] mt-0.5 font-medium' }, 'More')
      )
    ),

    // More menu popup
    moreMenuOpen && h(Portal, {},
      // Backdrop
      h('div', {
        className: 'fixed inset-0 z-[100]',
        onClick: () => setMoreMenuOpen(false)
      }),
      // Menu
      h('div', {
        ref: menuRef,
        className: 'fixed bottom-14 right-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-[101] overflow-hidden animate-fadeIn'
      },
        ...moreMenuItems.map(item =>
          h(MoreMenuItem, {
            key: item.view,
            icon: item.icon,
            label: item.label,
            active: item.view === currentView,
            warning: item.warning,
            onClick: () => handleNavigate(item.view)
          })
        )
      )
    )
  );
};

// Memoize to prevent re-renders when parent context changes but props don't
export default React.memo(MobileNavFooter);
