/**
 * InstanceSelector Component
 *
 * A reusable dropdown/button group for picking which connected instance a
 * feature uses. Only renders when 2+ instances qualify.
 *
 * Mirrors BitTorrentClientSelector with both 'buttons' and 'dropdown' variants.
 */

import React from 'https://esm.sh/react@18.2.0';
import ClientIcon from './ClientIcon.js';
import { BASE_HEIGHT } from './FormControls.js';

const { createElement: h } = React;

/**
 * aMule instance selector component
 * @param {Array} connectedInstances - List of connected instances from useInstanceSelector
 * @param {string} selectedId - Currently selected instance ID
 * @param {function} onSelect - Handler for instance selection
 * @param {boolean} showSelector - Whether to show the selector (from hook)
 * @param {string} [className] - Additional CSS classes
 * @param {string} [variant='buttons'] - 'buttons' or 'dropdown'
 * @param {string|null} [label='Instance'] - Label text (null to hide)
 * @param {boolean} [disabled=false] - Disable the selector
 */
const InstanceSelector = ({
  connectedInstances,
  selectedId,
  onSelect,
  showSelector,
  className = '',
  variant = 'buttons',
  label = 'Instance',
  disabled = false
}) => {
  if (!showSelector || connectedInstances.length < 2) {
    return null;
  }

  if (variant === 'dropdown') {
    return h('select', {
      value: selectedId || '',
      onChange: (e) => onSelect(e.target.value),
      disabled,
      className: `text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 ${className}`
    },
      connectedInstances.map(inst =>
        h('option', { key: inst.id, value: inst.id }, inst.name)
      )
    );
  }

  // Button group variant (default)
  return h('div', { className: `flex items-center gap-2 ${className}` },
    label && h('span', {
      className: 'text-sm font-medium text-gray-700 dark:text-gray-300'
    }, label),
    h('div', {
      className: 'flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-x-auto overflow-y-hidden',
      style: { scrollbarWidth: 'none' }
    },
      connectedInstances.map(inst =>
        h('button', {
          key: inst.id,
          type: 'button',
          onClick: () => onSelect(inst.id),
          disabled,
          className: `flex items-center gap-1.5 px-3 ${BASE_HEIGHT} text-sm font-medium whitespace-nowrap flex-shrink-0 transition-colors ${
            selectedId === inst.id
              ? 'bg-blue-600 text-white'
              : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`,
          title: inst.name
        },
          h(ClientIcon, { client: 'amule', size: 16, title: '' }),
          h('span', null, inst.name)
        )
      )
    )
  );
};

export default InstanceSelector;
