/**
 * ClientInstanceCard Component
 *
 * Compact summary card for a client instance (follows ServiceCard pattern).
 * Shows icon, name, type badge, connection info, color dot, instance ID,
 * enable toggle, action buttons (Test/Edit/Delete), and per-instance test result.
 */

import React from 'https://esm.sh/react@18.2.0';
import ClientIcon from '../common/ClientIcon.js';
import { Icon } from '../common/index.js';
import TestResultIndicator from './TestResultIndicator.js';
import { ToggleSwitch } from './EnableToggle.js';
import { TYPE_LABELS } from './ClientInstanceModal.js';
import { NETWORK_TYPE_LABELS, CLIENT_NETWORK_TYPES } from '../../utils/index.js';

const { createElement: h } = React;

/**
 * ClientInstanceCard component
 * @param {Object} client - Client config entry from formData.clients
 * @param {number} clientIndex - Index in the formData.clients array
 * @param {function} onEdit - (clientIndex) => void — opens edit modal
 * @param {function} onToggle - (clientIndex, enabled) => void — toggle enable/disable
 * @param {function} onRemove - (clientIndex) => void
 * @param {function} onTest - (clientIndex) => void
 * @param {boolean} isTesting - Whether a test is currently running
 * @param {Object} testResult - Per-instance test result
 */
const ClientInstanceCard = ({ client, clientIndex, totalClients, onMove, onEdit, onToggle, onRemove, onTest, onSharedDirs, isTesting, testResult, instanceStatus }) => {
  const typeLabel = TYPE_LABELS[client.type] || client.type;
  const isEnabled = client.enabled !== false;
  const connectionInfo = client.mode === 'scgi-socket'
    ? `SCGI Socket: ${client.socketPath || 'not configured'}`
    : client.mode === 'scgi'
      ? `SCGI TCP: ${client.host ? `${client.host}:${client.port}` : 'not configured'}`
      : client.host ? `${client.host}:${client.port}` : 'Not configured';

  // Connection status from live instance data
  const isDisconnectedWithError = instanceStatus && !instanceStatus.connected && instanceStatus.error;
  const borderClass = isDisconnectedWithError
    ? 'border-red-400 dark:border-red-600'
    : 'border-gray-200 dark:border-gray-700';

  return h('div', {
    className: `border rounded-lg p-4 bg-white dark:bg-gray-800 ${borderClass} ${!isEnabled ? 'opacity-60' : ''}`
  },
    // Header row with icon, name, type badge, and toggle
    h('div', { className: 'flex items-start justify-between mb-3' },
      h('div', { className: 'flex items-center gap-3' },
        h(ClientIcon, { client: client.type, size: 24 }),
        h('div', {},
          h('h3', { className: 'font-medium text-gray-900 dark:text-gray-100' },
            client.name || typeLabel
          ),
          h('div', { className: 'flex items-center gap-1.5 -ml-1' },
            h('span', {
              className: 'text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
            }, NETWORK_TYPE_LABELS[instanceStatus?.networkType || CLIENT_NETWORK_TYPES[client.type]] || client.type),
            client.source === 'env' && h('span', {
              className: 'inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
              title: 'Configured via environment variables'
            },
              h(Icon, { name: 'server', size: 12 }),
              'Env'
            )
          )
        )
      ),
      // Enable/disable toggle
      h(ToggleSwitch, {
        enabled: isEnabled,
        onChange: (val) => onToggle(clientIndex, val)
      })
    ),

    // Connection info + color dot + shared dirs button
    h('div', { className: 'flex items-center gap-2 mb-1' },
      client.color && h('span', {
        className: 'w-3 h-3 rounded-full flex-shrink-0',
        style: { backgroundColor: client.color }
      }),
      h('span', { className: 'text-sm text-gray-600 dark:text-gray-400' }, connectionInfo),
      onSharedDirs && instanceStatus?.connected && h('button', {
        onClick: () => onSharedDirs(client.id),
        className: 'ml-auto flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-lg bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors'
      }, h(Icon, { name: 'folder', size: 12 }), 'Shared Dirs')
    ),

    // Connection status line (from live instance data)
    instanceStatus && h('div', { className: 'flex items-center gap-1.5 mb-1' },
      h('span', {
        className: `w-2 h-2 rounded-full flex-shrink-0 ${
          instanceStatus.connected
            ? 'bg-green-500'
            : instanceStatus.error ? 'bg-red-500' : 'bg-gray-400'
        }`
      }),
      instanceStatus.connected
        ? h('span', { className: 'text-xs text-green-600 dark:text-green-400' }, 'Connected')
        : instanceStatus.error
          ? h('span', { className: 'text-xs text-red-500 dark:text-red-400 truncate', title: instanceStatus.error }, instanceStatus.error)
          : h('span', { className: 'text-xs text-gray-500 dark:text-gray-400' }, 'Disconnected')
    ),

    // Instance ID
    h('p', { className: 'text-xs text-gray-400 dark:text-gray-500 font-mono mb-3 min-h-[1rem]' },
      client.id || ''
    ),

    // Action buttons
    h('div', { className: 'flex gap-2' },
      // Reorder arrows (left-aligned via mr-auto on wrapper)
      totalClients > 1 && h('div', { className: 'flex gap-1 mr-auto' },
        clientIndex > 0 && h('button', {
          onClick: () => onMove(clientIndex, -1),
          disabled: isTesting,
          className: 'w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors',
          title: 'Move up'
        }, h(Icon, { name: 'arrowUp', size: 14 })),
        clientIndex < totalClients - 1 && h('button', {
          onClick: () => onMove(clientIndex, 1),
          disabled: isTesting,
          className: 'w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors',
          title: 'Move down'
        }, h(Icon, { name: 'arrowDown', size: 14 }))
      ),
      h('button', {
        onClick: () => onTest(clientIndex),
        disabled: isTesting || !isEnabled,
        className: 'flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
      },
        h(Icon, { name: 'plugConnect', size: 14 }),
        'Test'
      ),
      h('button', {
        onClick: () => onEdit(clientIndex),
        className: 'flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
      },
        h(Icon, { name: 'edit', size: 14 }),
        'Edit'
      ),
      onRemove && h('button', {
        onClick: () => onRemove(clientIndex),
        className: 'flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
      },
        h(Icon, { name: 'trash', size: 14 })
      )
    ),

    // Test result
    testResult && h('div', { className: 'mt-3' },
      h(TestResultIndicator, {
        result: testResult,
        label: `${client.name || typeLabel} Connection`
      })
    )
  );
};

export default ClientInstanceCard;
