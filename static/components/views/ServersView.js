/**
 * ServersView Component
 *
 * Displays ED2K servers list with connection management
 */

import React from 'https://esm.sh/react@18.2.0';
import { Icon, Table } from '../common/index.js';

const { createElement: h } = React;

/**
 * Servers view component
 * @param {Array} servers - List of servers
 * @param {boolean} loading - Loading state
 * @param {function} onRefresh - Refresh handler
 * @param {function} onServerAction - Server action handler (connect/disconnect/remove)
 * @param {object} sortConfig - Current sort configuration
 * @param {function} onSortChange - Sort change handler
 * @param {string} ed2kLinks - ED2K links input value
 * @param {function} onEd2kLinksChange - ED2K links change handler
 * @param {function} onAddEd2kLinks - Add ED2K links handler
 * @param {number} page - Current page number
 * @param {function} onPageChange - Page change handler
 * @param {number} pageSize - Items per page
 */
const ServersView = ({
  servers,
  loading,
  onRefresh,
  onServerAction,
  sortConfig,
  onSortChange,
  ed2kLinks,
  onEd2kLinksChange,
  onAddEd2kLinks,
  page,
  onPageChange,
  pageSize
}) => {
  const columns = [
    {
      label: 'Server Name',
      key: 'EC_TAG_SERVER_NAME',
      sortable: true,
      width: 'auto',
      render: (item) =>
        h('div', { className: 'max-w-xs' },
          h('div', { className: 'font-medium text-sm' }, item.EC_TAG_SERVER_NAME || 'Unknown'),
          h('div', { className: 'text-xs text-gray-500 dark:text-gray-400 ml-1' }, item.EC_TAG_SERVER_DESC || '')
        )
    },
    {
      label: 'Address',
      key: '_value',
      sortable: true,
      width: '140px',
      render: (item) => h('span', { className: 'font-mono text-xs' }, item._value || 'N/A')
    },
    {
      label: 'Users',
      key: 'EC_TAG_SERVER_USERS',
      sortable: true,
      width: '120px',
      render: (item) => {
        const users = item.EC_TAG_SERVER_USERS || 0;
        const maxUsers = item.EC_TAG_SERVER_USERS_MAX || 0;
        return h('span', { className: '' }, [
          h('span', { className: 'font-medium text-sm align-baseline' }, users.toLocaleString()),
          h('span', { className: 'text-xs text-gray-500 dark:text-gray-400 align-baseline ml-1' }, `/ ${maxUsers.toLocaleString()}`)
        ])
      }
    },
    {
      label: 'Files',
      key: 'EC_TAG_SERVER_FILES',
      sortable: true,
      width: '100px',
      render: (item) => (item.EC_TAG_SERVER_FILES || 0).toLocaleString()
    },
    {
      label: 'Ping',
      key: 'EC_TAG_SERVER_PING',
      sortable: true,
      width: '80px',
      render: (item) => item.EC_TAG_SERVER_PING ? `${item.EC_TAG_SERVER_PING} ms` : '-'
    },
    {
      label: 'Version',
      key: 'EC_TAG_SERVER_VERSION',
      width: '80px',
      render: (item) => item.EC_TAG_SERVER_VERSION || '-'
    }
  ];

  const renderActions = (item) => h('div', { className: 'flex gap-1.5' },
    h('button', {
      onClick: () => onServerAction(item._value, 'connect'),
      className: 'flex-1 px-2 py-1 text-xs sm:text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-all active:scale-95'
    },
      h('span', { className: 'flex items-center justify-center gap-1' },
        h(Icon, { name: 'power', size: 14 }),
        'Connect'
      )
    ),
    h('button', {
      onClick: () => onServerAction(item._value, 'disconnect'),
      className: 'flex-1 px-2 py-1 text-xs sm:text-sm bg-orange-600 text-white rounded hover:bg-orange-700 transition-all active:scale-95'
    },
      h('span', { className: 'flex items-center justify-center gap-1' },
        h(Icon, { name: 'disconnect', size: 14 }),
        'Disconnect'
      )
    ),
    h('button', {
      onClick: () => onServerAction(item._value, 'remove'),
      className: 'flex-1 px-2 py-1 text-xs sm:text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-all active:scale-95'
    },
      h('span', { className: 'flex items-center justify-center gap-1' },
        h(Icon, { name: 'trash', size: 14 }),
        'Remove'
      )
    )
  );

  return h('div', { className: 'space-y-2 sm:space-y-3' },
    h('div', { className: 'flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3' },
      h('h2', { className: 'text-base sm:text-lg font-bold text-gray-800 dark:text-gray-100' }, `Servers (${servers.length})`),
      h('button', {
        onClick: onRefresh,
        disabled: loading,
        className: 'px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-all active:scale-95 text-sm sm:text-base w-full sm:w-auto'
      },
        loading ? h('span', { className: 'flex items-center justify-center gap-2' },
          h('div', { className: 'loader' }),
          'Loading...'
        ) : h('span', null,
          h(Icon, { name: 'refresh', size: 16, className: 'inline mr-1' }),
          'Refresh'
        )
      )
    ),

    servers.length === 0 ? h('div', { className: 'text-center py-6 text-xs sm:text-sm text-gray-500 dark:text-gray-400' },
      loading ? 'Loading servers...' : 'No servers available'
    ) : h(Table, {
      data: servers,
      columns,
      actions: renderActions,
      currentSortBy: sortConfig.sortBy,
      currentSortDirection: sortConfig.sortDirection,
      onSortChange,
      page,
      onPageChange,
      pageSize
    }),

    // ED2K server.met form
    h('div', { className: 'bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 mt-3' },
      h('label', { className: 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2' },
        'Add server from server.met ED2K link:'
      ),
      h('div', { className: 'flex gap-2' },
        h('input', {
          type: 'text',
          value: ed2kLinks,
          onChange: (e) => onEd2kLinksChange(e.target.value),
          placeholder: 'ed2k://|serverlist|http://...|/',
          className: 'flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono',
          disabled: loading
        }),
        h('button', {
          onClick: onAddEd2kLinks,
          disabled: loading,
          className: 'px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm font-medium'
        }, loading ? 'Adding...' : 'Add Servers')
      )
    )
  );
};

export default ServersView;
