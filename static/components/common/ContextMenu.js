/**
 * ContextMenu Component
 *
 * A reusable context menu with smart positioning
 * Supports right-click and button-triggered modes
 */

import React from 'https://esm.sh/react@18.2.0';
import Icon from './Icon.js';
import Portal from './Portal.js';

const { createElement: h, useEffect, useLayoutEffect, useRef, useState, useCallback } = React;

/**
 * ContextMenu component
 * @param {boolean} show - Whether the menu is visible
 * @param {number} x - X position for the menu
 * @param {number} y - Y position for the menu
 * @param {Array} items - Menu items array [{label, icon, iconColor, onClick, disabled}]
 * @param {function} onClose - Callback when menu should close
 * @param {HTMLElement} anchorEl - Optional anchor element for smart positioning (for button-triggered mode)
 */
const ContextMenu = ({ show, x, y, items, onClose, anchorEl }) => {
  const menuRef = useRef(null);
  const [position, setPosition] = useState({ x, y, expandUp: false });

  // Calculate position and determine if menu should expand upward
  // Uses CSS bottom positioning when expanding up, so no menu height measurement needed
  useLayoutEffect(() => {
    if (!show) return;

    const menuWidth = menuRef.current?.offsetWidth || 180;
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const padding = 8;

    // Expand upward when cursor is in the bottom half of the viewport
    const expandUp = y > viewportHeight / 2;

    let newX = x;
    let anchorY = y;

    // For anchor element (button-triggered), use its edge as the anchor point
    if (anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      anchorY = expandUp ? rect.top : rect.bottom;
    }

    // Check if menu would overflow right
    if (x + menuWidth + padding > viewportWidth) {
      newX = x - menuWidth;
    }

    // Ensure menu doesn't go off-screen on left
    if (newX < padding) newX = padding;

    setPosition({ x: newX, y: anchorY, expandUp });
  }, [show, x, y, anchorEl]);

  // Handle click outside
  useEffect(() => {
    if (!show) return;

    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const handleScroll = () => {
      onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [show, onClose]);

  if (!show) return null;

  return h(Portal, null,
    h('div', {
      ref: menuRef,
      className: 'fixed z-50 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 min-w-[180px] animate-fadeIn',
      style: position.expandUp
        ? { left: position.x, bottom: window.innerHeight - position.y, transformOrigin: 'bottom' }
        : { left: position.x, top: position.y, transformOrigin: 'top' }
    },
    items.filter(item => !item.hidden).map((item, idx) => {
      if (item.divider) {
        return h('div', {
          key: `divider-${idx}`,
          className: 'border-t border-gray-200 dark:border-gray-700 my-1'
        });
      }

      return h('button', {
        key: idx,
        onClick: (e) => {
          e.stopPropagation();
          if (!item.disabled) {
            item.onClick();
            onClose();
          }
        },
        disabled: item.disabled,
        className: `w-full px-3 py-2 text-left text-sm flex items-center gap-2 ${
          item.disabled
            ? 'text-gray-400 dark:text-gray-600 cursor-not-allowed'
            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
        } transition-colors`
      },
        item.icon && h(Icon, {
          name: item.icon,
          size: 16,
          className: item.iconColor || 'text-gray-500 dark:text-gray-400'
        }),
        h('span', null, item.label)
      );
    }),
    // Dismiss action
    h('div', { key: 'dismiss-divider', className: 'border-t border-gray-200 dark:border-gray-700 my-1 md:hidden' }),
    h('button', {
      key: 'dismiss',
      onClick: (e) => { e.stopPropagation(); onClose(); },
      className: 'w-full px-3 py-2 text-left text-sm flex items-center gap-2 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors md:hidden'
    },
      h(Icon, { name: 'x', size: 16, className: 'text-gray-400 dark:text-gray-500' }),
      h('span', null, 'Dismiss')
    )
  ));
};

/**
 * Hook to manage context menu state
 * @returns {Object} Context menu state and handlers
 */
export const useContextMenu = () => {
  const [contextMenu, setContextMenu] = useState({
    show: false,
    x: 0,
    y: 0,
    item: null,
    anchorEl: null
  });

  const openContextMenu = useCallback((e, item, anchorEl = null) => {
    e.preventDefault();
    e.stopPropagation();

    let x, y;

    if (anchorEl) {
      // Button-triggered mode: position relative to the anchor element
      const rect = anchorEl.getBoundingClientRect();
      x = rect.left;
      y = rect.bottom;
    } else {
      // Right-click mode: use mouse/touch position
      x = e.clientX || (e.touches && e.touches[0]?.clientX) || 0;
      y = e.clientY || (e.touches && e.touches[0]?.clientY) || 0;
    }

    setContextMenu({
      show: true,
      x,
      y,
      item,
      anchorEl
    });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(prev => ({ ...prev, show: false }));
  }, []);

  return { contextMenu, openContextMenu, closeContextMenu };
};

/**
 * More button component (three dots) for triggering context menu
 * @param {function} onClick - Click handler
 * @param {string} className - Additional CSS classes
 */
export const MoreButton = ({ onClick, className = '' }) => {
  return h('button', {
    onClick,
    className: `flex items-center justify-center ${className}`,
    title: 'More options'
  },
    h(Icon, { name: 'moreVertical', size: 16, className: 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors block' })
  );
};

export default ContextMenu;
