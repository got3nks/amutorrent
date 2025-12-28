/**
 * Header Component
 *
 * Displays the app logo, title, and theme toggle
 */

import React from 'https://esm.sh/react@18.2.0';
import { Icon } from '../common/index.js';

const { createElement: h } = React;

/**
 * Header component
 * @param {string} theme - Current theme (dark/light)
 * @param {function} onToggleTheme - Theme toggle handler
 * @param {boolean} isLandscape - Is device in landscape mode
 * @param {function} onNavigateHome - Navigate to home handler
 * @param {function} onOpenSettings - Open settings handler
 * @param {boolean} showSettings - Whether to show settings button (default: true)
 */
const Header = ({ theme, onToggleTheme, isLandscape, onNavigateHome, onOpenSettings, showSettings = true }) => {
  return h('header', { className: 'bg-white dark:bg-gray-800 shadow-md sticky top-0 z-50 border-b border-gray-200 dark:border-gray-700' },
    h('div', { className: 'mx-auto px-2 sm:px-3 py-1.5 sm:py-2 flex items-center justify-between' },
      h('div', { className: 'flex items-center gap-1.5 sm:gap-3' },
        h('img', { src: '/static/logo-brax.png', alt: 'aMule', className: 'w-6 h-6 sm:w-10 sm:h-10 object-contain' }),
        h('h1', { className: 'text-sm sm:text-xl font-bold text-gray-800 dark:text-gray-100' }, 'aMule Controller')
      ),
      h('div', { className: 'flex items-center gap-1' },
        // Settings button (only show if not in setup wizard)
        showSettings && onOpenSettings && h('button', {
          onClick: onOpenSettings,
          className: 'p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors',
          title: 'Settings'
        }, h(Icon, { name: 'settings', size: 18, className: 'text-gray-600 dark:text-gray-300' })),
        // Theme toggle button
        h('button', {
          onClick: onToggleTheme,
          className: 'p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors',
          title: theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
        }, h(Icon, { name: theme === 'dark' ? 'sun' : 'moon', size: 18, className: 'text-gray-600 dark:text-gray-300' })),
        // Show home button on mobile (portrait) or in landscape mode
        h('button', {
          onClick: onNavigateHome,
          className: `${isLandscape ? '' : 'md:hidden'} p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors`,
          title: 'Go to Home'
        }, h(Icon, { name: 'home', size: 20, className: 'text-gray-600 dark:text-gray-300' }))
      )
    )
  );
};

export default Header;
