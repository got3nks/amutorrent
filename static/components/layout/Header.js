/**
 * Header Component
 *
 * Displays the app logo, title, theme toggle, font size control, and client filter toggles
 * On mobile, hides when scrolled to make room for the view's sticky toolbar
 */

import React from 'https://esm.sh/react@18.2.0';
import { Icon, Tooltip, VersionBadge, ClientIcon } from '../common/index.js';
import { useFontSize } from '../../contexts/FontSizeContext.js';
import { useClientFilter } from '../../contexts/ClientFilterContext.js';
import { useStaticData } from '../../contexts/StaticDataContext.js';
import { useStickyHeader } from '../../contexts/StickyHeaderContext.js';

const { createElement: h } = React;

/**
 * Header component
 * @param {string} theme - Current theme (dark/light)
 * @param {function} onToggleTheme - Theme toggle handler
 * @param {boolean} isLandscape - Is device in landscape mode
 * @param {function} onNavigateHome - Navigate to home handler
 * @param {function} onOpenAbout - Open about modal handler
 * @param {boolean} authEnabled - Whether authentication is enabled
 * @param {function} onLogout - Logout handler
 */
const Header = ({ theme, onToggleTheme, isLandscape, onNavigateHome, onOpenAbout, authEnabled = false, onLogout }) => {
  const { fontSize, fontSizeConfig, cycleFontSize } = useFontSize();
  const { isAmuleEnabled, isRtorrentEnabled, toggleClient } = useClientFilter();
  const { bothClientsConnected } = useStaticData();
  const { headerHidden } = useStickyHeader();

  return h('header', {
    className: 'bg-white dark:bg-gray-800 shadow-md sticky top-0 z-50 border-b border-gray-200 dark:border-gray-700 transition-transform duration-200',
    style: headerHidden ? { transform: 'translateY(-100%)' } : undefined
  },
    h('div', { className: 'mx-auto px-2 sm:px-3 py-1.5 sm:py-2 flex items-center justify-between' },
      // Left column: Logo, title, version badge
      h('div', { className: 'flex items-center gap-1.5 sm:gap-3 flex-shrink-0' },
        h('img', { src: '/static/logo-amutorrent.png', alt: 'aMuTorrent', className: 'w-6 h-6 sm:w-10 sm:h-10 object-contain' }),
        h('h1', { className: 'font-bold text-gray-800 dark:text-gray-100', style: { fontSize: '16px' } }, 'aMuTorrent'),
        // Version badge
        onOpenAbout && h(VersionBadge, { onClick: onOpenAbout })
      ),

      // Middle column: Client filter toggles (centered) - only show when both clients are connected
      h('div', { className: 'flex-1 flex justify-center' },
        bothClientsConnected && h('div', { className: 'flex items-center' },
          // aMule/ED2K toggle
          h(Tooltip, {
            content: isAmuleEnabled ? 'Hide ED2K data' : 'Show ED2K data',
            position: 'bottom',
            showOnMobile: false
          },
            h('button', {
              onClick: () => toggleClient('amule'),
              className: `px-1.5 sm:px-2 py-0.5 sm:py-1 text-[10px] sm:text-xs font-bold rounded-l transition-all flex items-center gap-1 ${
                isAmuleEnabled
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
              }`,
              title: isAmuleEnabled ? 'ED2K enabled' : 'ED2K disabled'
            },
              h(ClientIcon, { client: 'amule', size: 14, title: '' }),
              'ED2K'
            )
          ),
          // rtorrent/BT toggle
          h(Tooltip, {
            content: isRtorrentEnabled ? 'Hide BT data' : 'Show BT data',
            position: 'bottom',
            showOnMobile: false
          },
            h('button', {
              onClick: () => toggleClient('rtorrent'),
              className: `px-1.5 sm:px-2 py-0.5 sm:py-1 text-[10px] sm:text-xs font-bold rounded-r transition-all flex items-center gap-1 ${
                isRtorrentEnabled
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
              }`,
              title: isRtorrentEnabled ? 'BT enabled' : 'BT disabled'
            },
              h(ClientIcon, { client: 'rtorrent', size: 14, title: '' }),
              'BT'
            )
          )
        )
      ),

      // Right column: Controls
      h('div', { className: 'flex items-center gap-1 flex-shrink-0' },
        // Logout button (only show if authentication is enabled)
        authEnabled && onLogout && h(Tooltip, {
          content: 'Logout',
          position: 'left',
          showOnMobile: false
        },
          h('button', {
            onClick: onLogout,
            className: 'p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors'
          }, h(Icon, { name: 'logOut', size: 18, className: 'text-gray-600 dark:text-gray-300' }))
        ),
        // Font size toggle button
        h(Tooltip, {
          content: `Font size: ${fontSizeConfig.label}`,
          position: 'left',
          showOnMobile: false
        },
          h('button', {
            onClick: cycleFontSize,
            className: 'p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors flex items-center justify-center min-w-[30px]'
          },
            h('span', {
              className: `font-bold text-gray-600 dark:text-gray-300 ${fontSize === 'large' ? 'text-base' : 'text-sm'}`
            }, 'Aa')
          )
        ),
        // Theme toggle button
        h(Tooltip, {
          content: theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
          position: 'left',
          showOnMobile: false
        },
          h('button', {
            onClick: onToggleTheme,
            className: 'p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors'
          }, h(Icon, { name: theme === 'dark' ? 'sun' : 'moon', size: 18, className: 'text-gray-600 dark:text-gray-300' }))
        ),
        // Show home button only in landscape mode (mobile portrait uses bottom nav)
        isLandscape && h(Tooltip, {
          content: 'Go to Home',
          position: 'left',
          showOnMobile: false
        },
          h('button', {
            onClick: onNavigateHome,
            className: 'p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors'
          }, h(Icon, { name: 'home', size: 20, className: 'text-gray-600 dark:text-gray-300' }))
        )
      )
    )
  );
};

// Memoize to prevent re-renders when parent context changes but props don't
export default React.memo(Header);
