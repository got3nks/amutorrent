/**
 * ConfigSection Component
 *
 * Collapsible section wrapper for configuration settings
 */

import React from 'https://esm.sh/react@18.2.0';
import { Icon } from '../common/index.js';

const { createElement: h, useState } = React;

/**
 * ConfigSection component
 * @param {string} title - Section title
 * @param {string} description - Section description
 * @param {boolean} defaultOpen - Default open state
 * @param {boolean} open - Controlled open state (overrides internal state)
 * @param {function} onToggle - Callback when toggled (for controlled mode)
 * @param {ReactNode} children - Section content
 */
const ConfigSection = ({ title, description, defaultOpen = true, open, onToggle, children }) => {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);

  // Use controlled state if provided, otherwise use internal state
  const isOpen = open !== undefined ? open : internalOpen;

  const handleToggle = () => {
    if (onToggle) {
      // Controlled mode - call parent callback
      onToggle(!isOpen);
    } else {
      // Uncontrolled mode - update internal state
      setInternalOpen(!isOpen);
    }
  };

  return h('div', { className: 'border border-gray-200 dark:border-gray-700 rounded-lg mb-4 overflow-hidden' },
    // Header
    h('button', {
      type: 'button',
      onClick: handleToggle,
      className: 'w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors'
    },
      h('div', { className: 'text-left flex-1' },
        h('h3', { className: 'text-lg font-semibold text-gray-900 dark:text-gray-100' }, title),
        description && h('p', { className: 'text-sm text-gray-500 dark:text-gray-400 mt-0.5' }, description)
      ),
      h(Icon, {
        name: isOpen ? 'chevronUp' : 'chevronDown',
        size: 20,
        className: 'text-gray-500 dark:text-gray-400'
      })
    ),
    // Content
    isOpen && h('div', { className: 'p-4 bg-white dark:bg-gray-900' }, children)
  );
};

export default ConfigSection;
