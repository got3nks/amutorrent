/**
 * ServiceCard Component
 *
 * Card displaying a configured notification service with actions
 */

import React from 'https://esm.sh/react@18.2.0';
import { Icon } from '../common/index.js';
import { getServiceSchema } from '../../utils/notificationServiceSchemas.js';

const { createElement: h } = React;

/**
 * ServiceCard component
 * @param {Object} service - Service object { id, name, type, enabled, config }
 * @param {function} onEdit - Called when edit button clicked
 * @param {function} onDelete - Called when delete button clicked
 * @param {function} onTest - Called when test button clicked
 * @param {function} onToggle - Called when enable/disable toggled
 * @param {boolean} loading - Whether an action is in progress
 */
const ServiceCard = ({ service, onEdit, onDelete, onTest, onToggle, loading = false }) => {
  const schema = getServiceSchema(service.type);
  const serviceName = schema?.name || service.type;

  return h('div', {
    className: `border rounded-lg p-4 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 ${!service.enabled ? 'opacity-60' : ''}`
  },
    // Header row with icon, name, and type badge
    h('div', { className: 'flex items-start justify-between mb-3' },
      h('div', { className: 'flex items-center gap-3' },
        // Service icon with color background
        h('div', {
          className: 'w-10 h-10 rounded-2xl flex items-center justify-center',
          style: { backgroundColor: schema?.color || '#6b7280' }
        },
          schema?.logo
            ? h('img', { src: schema.logo, alt: schema.name, className: 'w-6 h-6', style: { filter: 'brightness(0) invert(1)' } })
            : h(Icon, { name: schema?.icon || 'bell', size: 20, className: 'text-white' })
        ),
        h('div', {},
          h('h3', { className: 'font-medium text-gray-900 dark:text-gray-100' }, service.name),
          h('span', {
            className: 'text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
          }, serviceName)
        )
      ),
      // Enable/disable toggle
      h('label', { className: 'relative inline-flex items-center cursor-pointer' },
        h('input', {
          type: 'checkbox',
          checked: service.enabled,
          onChange: () => onToggle(service.id, !service.enabled),
          disabled: loading,
          className: 'sr-only peer'
        }),
        h('div', {
          className: 'w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[\'\'] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600'
        })
      )
    ),

    // Status indicator
    h('div', { className: 'flex items-center gap-2 mb-4' },
      h('span', {
        className: `w-2 h-2 rounded-full ${service.enabled ? 'bg-green-500' : 'bg-gray-400'}`
      }),
      h('span', { className: 'text-xs text-gray-500 dark:text-gray-400' },
        service.enabled ? 'Active' : 'Disabled'
      )
    ),

    // Action buttons
    h('div', { className: 'flex gap-2' },
      h('button', {
        onClick: () => onTest(service.id),
        disabled: loading || !service.enabled,
        className: 'flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
      },
        h(Icon, { name: 'bell', size: 14 }),
        'Test'
      ),
      h('button', {
        onClick: () => onEdit(service),
        disabled: loading,
        className: 'flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
      },
        h(Icon, { name: 'edit', size: 14 }),
        'Edit'
      ),
      h('button', {
        onClick: () => onDelete(service.id),
        disabled: loading,
        className: 'flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
      },
        h(Icon, { name: 'trash', size: 14 })
      )
    )
  );
};

export default ServiceCard;
