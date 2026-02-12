/**
 * BitTorrentClientSelector Component
 *
 * A reusable dropdown/button group for selecting which BitTorrent client
 * to use when adding downloads. Only renders when 2+ clients are connected.
 *
 * Uses ClientIcon for visual identification.
 */

import React from 'https://esm.sh/react@18.2.0';
import ClientIcon from './ClientIcon.js';
import { BASE_HEIGHT } from './FormControls.js';

const { createElement: h } = React;

/**
 * BitTorrent client selector component
 * @param {Array} connectedClients - List of connected clients from useBitTorrentClientSelector
 * @param {string} selectedClientId - Currently selected client ID
 * @param {function} onSelectClient - Handler for client selection
 * @param {boolean} showSelector - Whether to show the selector (from hook)
 * @param {string} className - Additional CSS classes
 * @param {string} variant - 'buttons' (default) or 'dropdown'
 * @param {string} label - Label text (optional)
 * @param {boolean} showFullName - Always show full client name regardless of viewport (default: false)
 */
const BitTorrentClientSelector = ({
  connectedClients,
  selectedClientId,
  onSelectClient,
  showSelector,
  className = '',
  variant = 'buttons',
  label = 'Send to',
  showFullName = false
}) => {
  // Don't render if we shouldn't show selector
  if (!showSelector || connectedClients.length < 2) {
    return null;
  }

  if (variant === 'dropdown') {
    return h('div', { className: `flex items-center gap-2 ${className}` },
      label && h('label', {
        className: 'text-sm font-medium text-gray-700 dark:text-gray-300'
      }, label),
      h('select', {
        value: selectedClientId,
        onChange: (e) => onSelectClient(e.target.value),
        className: 'px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
      },
        connectedClients.map(client =>
          h('option', { key: client.id, value: client.id }, client.name)
        )
      )
    );
  }

  // Button group variant (default)
  return h('div', { className: `flex items-center gap-2 ${className}` },
    label && h('span', {
      className: 'hidden sm:inline text-sm font-medium text-gray-700 dark:text-gray-300'
    }, label),
    h('div', {
      className: 'inline-flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden'
    },
      connectedClients.map(client =>
        h('button', {
          key: client.id,
          type: 'button',
          onClick: () => onSelectClient(client.id),
          className: `flex items-center gap-1.5 px-3 ${BASE_HEIGHT} text-sm font-medium transition-colors ${
            selectedClientId === client.id
              ? 'bg-blue-600 text-white'
              : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
          }`,
          title: client.name
        },
          h(ClientIcon, {
            client: client.id,
            size: 16,
            title: ''
          }),
          showFullName
            ? h('span', null, client.name)
            : [
                h('span', { key: 'short', className: 'hidden sm:inline md:hidden' }, client.shortName),
                h('span', { key: 'full', className: 'hidden md:inline' }, client.name)
              ]
        )
      )
    )
  );
};

export default BitTorrentClientSelector;
