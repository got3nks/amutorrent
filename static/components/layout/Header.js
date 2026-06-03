/**
 * Header Component
 *
 * Displays the app logo, title, theme toggle, font size control, and client filter toggles
 * On mobile, hides when scrolled to make room for the view's sticky toolbar
 * Includes user menu with profile and logout when authentication is enabled
 */

import React from 'https://esm.sh/react@18.2.0';
import { Icon, Tooltip, VersionBadge, ClientIcon, Portal } from '../common/index.js';
import { useFontSize } from '../../contexts/FontSizeContext.js';
import { useClientFilter } from '../../contexts/ClientFilterContext.js';
import { useStaticData } from '../../contexts/StaticDataContext.js';
import { useStickyHeader } from '../../contexts/StickyHeaderContext.js';
import ProfileModal from '../modals/ProfileModal.js';

const { createElement: h, useState, useRef, useEffect, useCallback } = React;

const NETWORK_CONFIGS = [
  { type: 'ed2k', label: 'ED2K', client: 'amule', mobileTitle: 'ED2K data', hiddenTitle: 'all ED2K', color: '#3b82f6' },
  { type: 'bittorrent', label: 'BT', client: 'bittorrent', mobileTitle: 'BT data', hiddenTitle: 'all BT', color: '#f97316' },
  { type: 'soulseek', label: 'Soulseek', client: 'soulseek', mobileTitle: 'Soulseek data', hiddenTitle: 'all Soulseek', color: '#0ea5e9' }
];

/**
 * UserMenu dropdown component
 */
const UserMenu = ({ username, onOpenProfile, onLogout }) => {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target) &&
          buttonRef.current && !buttonRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return h('div', { className: 'relative' },
    h('button', {
      ref: buttonRef,
      onClick: () => setOpen(!open),
      className: `flex items-center gap-1 px-2 py-1 rounded-lg transition-colors text-sm ${
        open
          ? 'bg-gray-100 dark:bg-gray-700'
          : 'hover:bg-gray-100 dark:hover:bg-gray-700'
      }`
    },
      h(Icon, { name: 'user', size: 16, className: 'text-gray-600 dark:text-gray-300' }),
      h('span', { className: 'hidden sm:inline text-gray-700 dark:text-gray-300 font-medium max-w-[80px] truncate' }, username),
      h(Icon, { name: open ? 'chevronUp' : 'chevronDown', size: 12, className: 'text-gray-400' })
    ),

    open && h(Portal, null,
      // Backdrop
      h('div', {
        className: 'fixed inset-0 z-[100]',
        onClick: () => setOpen(false)
      }),
      // Menu positioned below the button
      h('div', {
        ref: menuRef,
        className: 'fixed z-[101] w-44 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden animate-fadeIn',
        style: (() => {
          if (!buttonRef.current) return { top: 48, right: 8 };
          const rect = buttonRef.current.getBoundingClientRect();
          return { top: rect.bottom + 4, right: window.innerWidth - rect.right };
        })()
      },
        // Username label (mobile — hidden on desktop since it's in the button)
        h('div', { className: 'sm:hidden px-4 py-2 border-b border-gray-200 dark:border-gray-700' },
          h('p', { className: 'text-sm font-medium text-gray-700 dark:text-gray-300 truncate' }, username)
        ),
        // Profile
        h('button', {
          onClick: () => { setOpen(false); onOpenProfile(); },
          className: 'flex items-center gap-3 w-full px-4 py-2.5 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors'
        },
          h(Icon, { name: 'user', size: 16 }),
          'Profile'
        ),
        // Logout (hidden for SSO sessions)
        onLogout && h('button', {
          onClick: () => { setOpen(false); onLogout(); },
          className: 'flex items-center gap-3 w-full px-4 py-2.5 text-left text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors'
        },
          h(Icon, { name: 'logOut', size: 16 }),
          'Logout'
        )
      )
    )
  );
};

/**
 * Header component
 * @param {string} theme - Current theme (dark/light)
 * @param {function} onToggleTheme - Theme toggle handler
 * @param {boolean} isLandscape - Is device in landscape mode
 * @param {function} onNavigateHome - Navigate to home handler
 * @param {function} onOpenAbout - Open about modal handler
 * @param {boolean} authEnabled - Whether authentication is enabled
 * @param {string} username - Current username
 * @param {function} onLogout - Logout handler
 */
const Header = ({ theme, onToggleTheme, isLandscape, onNavigateHome, onOpenAbout, authEnabled = false, username, onLogout, isSso = false }) => {
  const { fontSize, fontSizeConfig, cycleFontSize } = useFontSize();
  const { isEd2kEnabled, isBittorrentEnabled, isSoulseekEnabled, toggleNetworkType, toggleInstance, isInstanceEnabled } = useClientFilter();
  const { multipleClientsConnected, instances } = useStaticData();

  // Profile modal state
  const [profileOpen, setProfileOpen] = useState(false);

  const handleProfileSave = useCallback(async (updates) => {
    const res = await fetch('/api/auth/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.message || 'Failed to update profile');
    }
  }, []);

  // Group connected instances by network type for per-instance filter chips
  const instanceGroups = React.useMemo(() => {
    const groups = { ed2k: [], bittorrent: [], soulseek: [] };
    for (const [id, inst] of Object.entries(instances)) {
      if (inst.connected && groups[inst.networkType]) {
        groups[inst.networkType].push({ id, ...inst });
      }
    }
    groups.ed2k.sort((a, b) => a.order - b.order);
    groups.bittorrent.sort((a, b) => a.order - b.order);
    groups.soulseek.sort((a, b) => a.order - b.order);
    return groups;
  }, [instances]);

  const networkEnabled = {
    ed2k: isEd2kEnabled,
    bittorrent: isBittorrentEnabled,
    soulseek: isSoulseekEnabled
  };

  const renderNetworkToggleButton = (config, mobile = false) => {
    const enabled = networkEnabled[config.type];
    const hasInstances = instanceGroups[config.type]?.length > 0;
    if (!hasInstances) return null;

    const title = enabled ? `Hide ${config.mobileTitle}` : `Show ${config.mobileTitle}`;
    return h(Tooltip, {
      content: enabled ? `Hide ${config.mobileTitle}` : `Show ${config.mobileTitle}`,
      position: 'bottom',
      showOnMobile: false
    },
      h('button', {
        onClick: () => toggleNetworkType(config.type),
        className: `px-1.5 sm:px-2 py-0.5 sm:py-1 text-[10px] sm:text-xs font-bold transition-all flex items-center gap-1 ${enabled
          ? 'text-white'
          : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500'}`,
        title,
        style: enabled ? { backgroundColor: config.color } : undefined
      },
        h(ClientIcon, { client: config.client, size: 14, title: '' }),
        config.label
      )
    );
  };

  const renderInstanceGroup = (config) => {
    const group = instanceGroups[config.type] || [];
    if (group.length === 0) return null;

    return h(React.Fragment, null,
      h('button', {
        onClick: () => toggleNetworkType(config.type),
        className: `flex-shrink-0 p-0.5 rounded transition-all ${networkEnabled[config.type] ? 'opacity-100' : 'opacity-40 grayscale'}`,
        title: networkEnabled[config.type] ? `Hide ${config.hiddenTitle}` : `Show ${config.hiddenTitle}`
      }, h(ClientIcon, { client: config.client, size: 14, title: '' })),
      ...group.map(inst => h('button', {
        key: inst.id,
        onClick: () => toggleInstance(inst.id),
        className: `flex-shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded transition-all truncate max-w-[80px] ${
          isInstanceEnabled(inst.id)
            ? 'text-white'
            : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
        }`,
        style: isInstanceEnabled(inst.id) ? { backgroundColor: inst.color || config.color, textShadow: '0 1px 2px rgba(0,0,0,0.3)' } : undefined,
        title: `${inst.name} (${isInstanceEnabled(inst.id) ? 'visible' : 'hidden'})`
      }, inst.name))
    );
  };

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

      // Middle column: Client filter toggles (centered) - only show when multiple clients are connected
      h('div', { className: 'flex-1 flex justify-center' },
        multipleClientsConnected && h(React.Fragment, null,
          h('div', { className: 'flex items-center md:hidden flex-wrap gap-1 justify-center' },
            NETWORK_CONFIGS.map(config => renderNetworkToggleButton(config, true)).filter(Boolean)
          ),
          // Per-instance filter chips (md+ viewports — scrollable when many instances)
          h('div', { className: 'hidden md:flex items-center gap-1 overflow-x-auto max-w-[50vw] flex-nowrap', style: { scrollbarWidth: 'none' } },
            NETWORK_CONFIGS.map(config => renderInstanceGroup(config)).filter(Boolean)
          )
        )
      ),

      // Right column: Controls
      h('div', { className: 'flex items-center gap-1 flex-shrink-0' },
        // User menu (auth enabled with username) or simple logout button
        authEnabled && username && onLogout
          ? h(UserMenu, {
              username,
              onOpenProfile: () => setProfileOpen(true),
              onLogout: isSso ? null : onLogout
            })
          : authEnabled && !isSso && onLogout && h(Tooltip, {
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
    ),

    // Profile Modal
    h(ProfileModal, {
      show: profileOpen,
      username: username || '',
      onClose: () => setProfileOpen(false),
      onSave: handleProfileSave
    })
  );
};

// Memoize to prevent re-renders when parent context changes but props don't
export default React.memo(Header);
