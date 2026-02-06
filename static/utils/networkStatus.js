/**
 * Network Status Utilities
 *
 * Shared helpers for determining ED2K and KAD network connection status
 */

/**
 * Status types for network connections
 * @typedef {'green' | 'yellow' | 'red'} StatusColor
 */

/**
 * Network status result
 * @typedef {object} NetworkStatus
 * @property {StatusColor} status - Status color (green/yellow/red)
 * @property {string} label - Short label (ED2K/KAD)
 * @property {string} text - Status text (High ID, Low ID, OK, Firewalled, Disconnected)
 * @property {boolean} connected - Whether the network is connected
 */

/**
 * Get ED2K network status from stats
 * @param {object} stats - Stats object from WebSocket
 * @returns {NetworkStatus} ED2K status information
 */
export const getED2KStatus = (stats) => {
  if (!stats) {
    return { status: 'red', label: 'ED2K', text: 'Disconnected', connected: false };
  }

  const connState = stats.EC_TAG_CONNSTATE || {};
  const server = connState.EC_TAG_SERVER || {};
  const ed2kConnected = server?.EC_TAG_SERVER_PING > 0;
  const clientId = connState.EC_TAG_CLIENT_ID;
  const isHighId = clientId && clientId > 16777216;

  if (!ed2kConnected) {
    return { status: 'red', label: 'ED2K', text: 'Disconnected', connected: false };
  }

  return {
    status: isHighId ? 'green' : 'yellow',
    label: 'ED2K',
    text: isHighId ? 'High ID' : 'Low ID',
    connected: true,
    serverName: server.EC_TAG_SERVER_NAME,
    serverPing: server.EC_TAG_SERVER_PING
  };
};

/**
 * Get KAD network status from stats
 * @param {object} stats - Stats object from WebSocket
 * @returns {NetworkStatus} KAD status information
 */
export const getKADStatus = (stats) => {
  if (!stats) {
    return { status: 'red', label: 'KAD', text: 'Disconnected', connected: false };
  }

  const kadFirewalledValue = stats.EC_TAG_STATS_KAD_FIREWALLED_UDP;
  const kadConnected = kadFirewalledValue !== undefined && kadFirewalledValue !== null;
  const kadFirewalled = kadFirewalledValue === 1;

  if (!kadConnected) {
    return { status: 'red', label: 'KAD', text: 'Disconnected', connected: false };
  }

  return {
    status: kadFirewalled ? 'yellow' : 'green',
    label: 'KAD',
    text: kadFirewalled ? 'Firewalled' : 'OK',
    connected: true
  };
};

/**
 * Get BitTorrent (rTorrent) network status from stats
 * @param {object} stats - Stats object from WebSocket
 * @returns {NetworkStatus} BT status information
 */
export const getBTStatus = (stats) => {
  if (!stats || !stats.rtorrent?.connected) {
    return { status: 'red', label: 'BT', text: 'Disconnected', connected: false };
  }

  const portOpen = stats.rtorrent.portOpen;
  const listenPort = stats.rtorrent.listenPort;

  return {
    status: portOpen ? 'green' : 'yellow',
    label: 'BT',
    text: portOpen ? 'OK' : 'Firewalled',
    connected: true,
    listenPort
  };
};

/**
 * Get CSS class for status dot color
 * @param {StatusColor} status - Status color
 * @returns {string} Tailwind CSS class
 */
export const getStatusDotClass = (status) => {
  switch (status) {
    case 'green': return 'bg-green-500';
    case 'yellow': return 'bg-yellow-500';
    case 'red': return 'bg-red-500';
    default: return 'bg-gray-400';
  }
};

/**
 * Get CSS classes for status badge
 * @param {StatusColor} status - Status color
 * @returns {string} Tailwind CSS classes for badge background and text
 */
export const getStatusBadgeClass = (status) => {
  switch (status) {
    case 'green': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    case 'yellow': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    case 'red': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
    default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
  }
};

/**
 * Get status icon prefix for display
 * @param {StatusColor} status - Status color
 * @returns {string} Unicode symbol
 */
export const getStatusIcon = (status) => {
  switch (status) {
    case 'green': return '✓';
    case 'yellow': return '⚠';
    case 'red': return '✗';
    default: return '•';
  }
};
