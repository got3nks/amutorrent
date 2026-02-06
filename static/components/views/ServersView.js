/**
 * ServersView Component
 *
 * Displays ED2K servers list with connection management
 * Uses contexts directly for all data and actions
 */

import React from 'https://esm.sh/react@18.2.0';
import { Table, DeleteModal, MobileSortButton, Button, Input, IconButton } from '../common/index.js';
import { DEFAULT_SORT_CONFIG, VIEW_TITLE_STYLES } from '../../utils/index.js';
import { useModal, useTableState } from '../../hooks/index.js';
import { useStickyToolbar } from '../../contexts/StickyHeaderContext.js';
import { useLiveData } from '../../contexts/LiveDataContext.js';
import { useStaticData } from '../../contexts/StaticDataContext.js';
import { useDataFetch } from '../../contexts/DataFetchContext.js';
import { useActions } from '../../contexts/ActionsContext.js';

const { createElement: h, useCallback, useEffect, useMemo } = React;

/**
 * Servers view component - now uses contexts directly
 */
const ServersView = () => {
  // Get data from contexts
  const { dataStats } = useLiveData();
  const { dataServers, dataServersEd2kLinks, setDataServersEd2kLinks, dataLoaded } = useStaticData();
  const { fetchServers } = useDataFetch();
  const actions = useActions();

  // Fetch servers on mount
  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  // Use table state hook for sorting and pagination (no text filtering)
  const {
    sortedData: sortedServers,
    loadedData,
    sortConfig,
    onSortChange,
    loadedCount,
    hasMore,
    remaining,
    loadMore,
    loadAll,
    resetLoaded,
    pageSize,
    onPageSizeChange
  } = useTableState({
    data: dataServers,
    viewKey: 'servers'
  });

  // Aliases for readability
  const servers = dataServers;
  const ed2kLinks = dataServersEd2kLinks;

  // Memoize connected server address - only recalculate when connection state changes
  // This prevents re-renders when only speed stats change (every 5 seconds)
  const connectedServerAddress = useMemo(() => {
    return dataStats?.EC_TAG_CONNSTATE?.EC_TAG_SERVER?._value || null;
  }, [dataStats?.EC_TAG_CONNSTATE?.EC_TAG_SERVER?._value]);

  const isConnectedServer = useCallback(
    (serverAddress) => connectedServerAddress && serverAddress === connectedServerAddress,
    [connectedServerAddress]
  );

  // Delete modal state
  const { modal: deleteModal, open: openDeleteModal, close: closeDeleteModal } = useModal({
    serverAddress: null,
    serverName: ''
  });

  // Local handlers
  const onRefresh = fetchServers;
  const onEd2kLinksChange = setDataServersEd2kLinks;
  const onAddEd2kLinks = () => actions.search.addEd2kLinks(ed2kLinks, 0, true); // (input, categoryId, isServerList)

  // Server action handler - intercepts 'remove' to show confirmation modal
  const handleServerAction = useCallback((ipPort, action) => {
    if (action === 'remove') {
      // Find server name for the modal
      const server = servers.find(s => s._value === ipPort);
      const serverName = server?.EC_TAG_SERVER_NAME || ipPort;
      openDeleteModal({ serverAddress: ipPort, serverName });
    } else {
      // Handle other actions directly
      actions.servers.action(ipPort, action);
    }
  }, [servers, openDeleteModal, actions.servers]);

  // Confirm delete handler
  const handleConfirmDelete = useCallback(() => {
    actions.servers.remove(deleteModal.serverAddress);
    closeDeleteModal();
    setTimeout(() => fetchServers(), 500);
  }, [deleteModal.serverAddress, actions.servers, closeDeleteModal, fetchServers]);

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

  // Desktop table action buttons (icon only on tablet, icon + text on xl)
  const renderTableActions = useCallback((item) => h('div', { className: 'flex gap-1.5' },
    // Show Connect button only if NOT the connected server
    !isConnectedServer(item._value) && h(Button, {
      variant: 'success',
      icon: 'power',
      iconSize: 14,
      onClick: () => handleServerAction(item._value, 'connect'),
      title: 'Connect',
      className: 'h-8 text-sm'
    },
      h('span', { className: 'hidden xl:inline' }, 'Connect')
    ),
    // Show Disconnect button only if this IS the connected server
    isConnectedServer(item._value) && h(Button, {
      variant: 'orange',
      icon: 'disconnect',
      iconSize: 14,
      onClick: () => handleServerAction(item._value, 'disconnect'),
      title: 'Disconnect',
      className: 'h-8 text-sm'
    },
      h('span', { className: 'hidden xl:inline' }, 'Disconnect')
    ),
    h(Button, {
      variant: 'danger',
      icon: 'trash',
      iconSize: 14,
      onClick: () => handleServerAction(item._value, 'remove'),
      title: 'Remove',
      className: 'h-8 text-sm'
    },
      h('span', { className: 'hidden xl:inline' }, 'Remove')
    )
  ), [isConnectedServer, handleServerAction]);

  // Mobile card renderer
  const renderMobileCard = useCallback((item) => {
    const isConnected = isConnectedServer(item._value);
    return h('div', {
      className: `rounded-lg overflow-hidden border ${isConnected ? 'border-green-400 dark:border-green-600' : 'border-gray-200 dark:border-gray-700'}`
    },
      // Header with server name and action buttons
      h('div', { className: 'flex items-center justify-between gap-2 p-2 bg-gray-100 dark:bg-gray-700/70' },
        h('div', { className: 'flex-1 min-w-0' },
          h('div', { className: 'font-medium text-base text-gray-900 dark:text-gray-100 truncate' },
            item.EC_TAG_SERVER_NAME || 'Unknown'
          ),
          item.EC_TAG_SERVER_DESC && h('div', { className: 'text-xs text-gray-500 dark:text-gray-400 truncate' },
            item.EC_TAG_SERVER_DESC
          )
        ),
        // Action buttons on the right
        h('div', { className: 'flex gap-1 flex-shrink-0' },
          !isConnected && h(IconButton, {
            variant: 'success',
            icon: 'power',
            iconSize: 16,
            onClick: () => handleServerAction(item._value, 'connect'),
            title: 'Connect',
            className: 'w-8 h-8'
          }),
          isConnected && h(IconButton, {
            variant: 'orange',
            icon: 'disconnect',
            iconSize: 16,
            onClick: () => handleServerAction(item._value, 'disconnect'),
            title: 'Disconnect',
            className: 'w-8 h-8'
          }),
          h(IconButton, {
            variant: 'danger',
            icon: 'trash',
            iconSize: 16,
            onClick: () => handleServerAction(item._value, 'remove'),
            title: 'Remove',
            className: 'w-8 h-8'
          })
        )
      ),
      // Body with server details
      h('div', { className: 'p-2 space-y-1 text-xs bg-white dark:bg-gray-800' },
        // Address (no label)
        h('div', { className: 'font-mono text-gray-700 dark:text-gray-300' }, item._value),
        // Users
        h('div', { className: 'text-gray-700 dark:text-gray-300' },
          h('span', { className: 'font-medium text-gray-600 dark:text-gray-400' }, 'Users: '),
          h('span', null, `${(item.EC_TAG_SERVER_USERS || 0).toLocaleString()} / ${(item.EC_TAG_SERVER_USERS_MAX || 0).toLocaleString()}`)
        ),
        // Files
        h('div', { className: 'text-gray-700 dark:text-gray-300' },
          h('span', { className: 'font-medium text-gray-600 dark:text-gray-400' }, 'Files: '),
          h('span', null, (item.EC_TAG_SERVER_FILES || 0).toLocaleString())
        ),
        // Ping and Version on same line
        h('div', { className: 'flex gap-4 text-gray-700 dark:text-gray-300' },
          h('span', null,
            h('span', { className: 'font-medium text-gray-600 dark:text-gray-400' }, 'Ping: '),
            item.EC_TAG_SERVER_PING ? `${item.EC_TAG_SERVER_PING} ms` : '-'
          ),
          h('span', null,
            h('span', { className: 'font-medium text-gray-600 dark:text-gray-400' }, 'Version: '),
            item.EC_TAG_SERVER_VERSION || '-'
          )
        )
      )
    );
  }, [isConnectedServer, handleServerAction]);

  // ============================================================================
  // MOBILE HEADER CONTENT (shared between sticky toolbar and in-page header)
  // ============================================================================
  const mobileSortButton = useMemo(() =>
    servers.length > 0 && h(MobileSortButton, {
      columns,
      sortBy: sortConfig.sortBy,
      sortDirection: sortConfig.sortDirection,
      onSortChange,
      defaultSortBy: DEFAULT_SORT_CONFIG['servers'].sortBy,
      defaultSortDirection: DEFAULT_SORT_CONFIG['servers'].sortDirection
    }),
  [servers.length, columns, sortConfig, onSortChange]);

  const refreshButton = useMemo(() =>
    h(Button, {
      variant: 'primary',
      onClick: onRefresh,
      disabled: !dataLoaded.servers,
      icon: dataLoaded.servers ? 'refresh' : null
    }, dataLoaded.servers ? 'Refresh' : h('span', { className: 'flex items-center gap-2' }, h('div', { className: 'loader' }), 'Loading...')),
  [onRefresh, dataLoaded.servers]);

  const mobileHeaderContent = useMemo(() =>
    h('div', { className: 'flex items-center gap-2' },
      h('h2', { className: VIEW_TITLE_STYLES.desktop }, `Servers (${servers.length})`),
      h('div', { className: 'flex-1' }),
      mobileSortButton,
      refreshButton
    ),
  [servers.length, mobileSortButton, refreshButton]);

  // Register sticky toolbar for mobile scroll behavior
  const mobileHeaderRef = useStickyToolbar(mobileHeaderContent);

  return h('div', { className: 'space-y-2 sm:space-y-3 px-2 sm:px-0' },
    // Header with title + compact controls
    h('div', { className: 'flex items-center gap-2', ref: mobileHeaderRef },
      h('h2', { className: VIEW_TITLE_STYLES.desktop }, `Servers (${servers.length})`),
      h('div', { className: 'flex-1' }),
      h('div', { className: 'xl:hidden' }, mobileSortButton),
      refreshButton
    ),

    servers.length === 0 ? h('div', { className: 'text-center py-6 text-xs sm:text-sm text-gray-500 dark:text-gray-400' },
      !dataLoaded.servers ? 'Loading servers...' : 'No servers available'
    // Hybrid scrollable mode: desktop shows all items in scrollable table,
    // mobile uses load-more pagination for natural page scrolling
    ) : h(Table, {
      data: sortedServers,
      columns,
      scrollable: true,
      actions: renderTableActions,
      currentSortBy: sortConfig.sortBy,
      currentSortDirection: sortConfig.sortDirection,
      onSortChange,
      // Load-more props for mobile in hybrid scrollable mode
      loadedCount,
      totalCount: sortedServers.length,
      hasMore,
      remaining,
      onLoadMore: loadMore,
      onLoadAll: loadAll,
      resetLoaded,
      pageSize,
      onPageSizeChange,
      getRowKey: (item) => item._value,
      breakpoint: 'xl',
      mobileCardRender: renderMobileCard,
      mobileCardStyle: 'card'
    }),

    // ED2K server.met form
    h('div', { className: 'bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 mt-3' },
      h('label', { className: 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2' },
        'Add server from server.met ED2K link:'
      ),
      h('div', { className: 'flex gap-2' },
        h(Input, {
          value: ed2kLinks,
          onChange: (e) => onEd2kLinksChange(e.target.value),
          placeholder: 'ed2k://|serverlist|http://...|/',
          className: 'flex-1 font-mono'
        }),
        h(Button, {
          variant: 'success',
          onClick: onAddEd2kLinks,
          disabled: !ed2kLinks.trim() || !dataLoaded.servers
        }, 'Add Servers')
      )
    ),

    // Delete confirmation modal
    h(DeleteModal, {
      show: deleteModal.show,
      itemName: deleteModal.serverName,
      itemType: 'Server',
      confirmLabel: 'Remove',
      onConfirm: handleConfirmDelete,
      onCancel: closeDeleteModal
    })
  );
};

export default ServersView;
