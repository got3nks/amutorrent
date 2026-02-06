/**
 * EventsTable Component
 *
 * Table showing all event types with checkboxes to enable/disable notifications
 */

import React from 'https://esm.sh/react@18.2.0';
import { getEventTypeOptions } from '../../utils/notificationServiceSchemas.js';

const { createElement: h } = React;

/**
 * EventsTable component
 * @param {Object} events - Current events state { eventType: boolean, ... }
 * @param {function} onEventChange - Callback when an event is toggled
 * @param {boolean} disabled - Whether the controls are disabled
 */
const EventsTable = ({ events = {}, onEventChange, disabled = false }) => {
  const eventOptions = getEventTypeOptions();

  return h('div', { className: 'overflow-x-auto' },
    h('table', { className: 'w-full text-sm' },
      h('thead', {},
        h('tr', { className: 'text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700' },
          h('th', { className: 'pb-2 pr-4 font-medium w-16' }, 'Enable'),
          h('th', { className: 'pb-2 pr-4 font-medium' }, 'Event'),
          h('th', { className: 'pb-2 font-medium hidden sm:table-cell' }, 'Description')
        )
      ),
      h('tbody', { className: 'divide-y divide-gray-100 dark:divide-gray-800' },
        eventOptions.map(event =>
          h('tr', { key: event.key },
            h('td', { className: 'py-2 pr-4' },
              h('input', {
                type: 'checkbox',
                checked: events[event.key] === true,
                onChange: (e) => onEventChange(event.key, e.target.checked),
                disabled,
                className: 'rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 disabled:opacity-50'
              })
            ),
            h('td', { className: 'py-2 pr-4' },
              h('span', { className: 'font-medium text-gray-900 dark:text-gray-100' }, event.label)
            ),
            h('td', { className: 'py-2 text-gray-600 dark:text-gray-400 hidden sm:table-cell' }, event.description)
          )
        )
      )
    )
  );
};

export default EventsTable;
