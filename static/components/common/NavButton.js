/**
 * NavButton Component
 *
 * Navigation button with icon and label, memoized to prevent unnecessary re-renders
 */

import React from 'https://esm.sh/react@18.2.0';
import Icon from './Icon.js';

const { createElement: h } = React;

/**
 * Navigation button component
 * @param {string} icon - Icon name
 * @param {string} label - Button label
 * @param {string} view - View identifier
 * @param {boolean} active - Whether this button is currently active
 * @param {function} onNavigate - Navigation handler function
 */
const NavButton = React.memo(({ icon, label, view, active, onNavigate }) => {
  return h('button', {
    onClick: () => onNavigate(view),
    className: `flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 rounded-lg transition-all text-base sm:text-lg font-medium ${
      active
        ? 'bg-blue-600 text-white shadow-lg'
        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
    }`
  },
    h(Icon, { name: icon, size: 20 }),
    h('span', null, label)
  );
});

export default NavButton;
