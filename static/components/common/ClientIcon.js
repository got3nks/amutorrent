/**
 * ClientIcon Component
 *
 * Reusable icon component for client types (aMule/ED2K and BitTorrent clients)
 * Used in badges, buttons, modals, and other UI elements
 */

import React from 'https://esm.sh/react@18.2.0';

const { createElement: h } = React;

/**
 * Client icon component
 * @param {string} client - 'amule', 'rtorrent', or 'qbittorrent' (also accepts 'clientType' for backwards compatibility)
 * @param {string} clientType - Alias for 'client' prop (deprecated, use 'client')
 * @param {number} size - Size in pixels (default: 16)
 * @param {boolean} float - Whether to float left for text wrapping (default: false)
 * @param {string} className - Additional CSS classes
 * @param {string} title - Tooltip text (optional, has sensible defaults)
 * @param {object} style - Additional inline styles
 */
const ClientIcon = ({ client, clientType, size = 16, float = false, className = '', title, style = {} }) => {
  // Support both 'client' and 'clientType' props
  const clientValue = client || clientType;

  // Determine icon based on client type
  let defaultTitle, alt, src;
  if (clientValue === 'prowlarr') {
    defaultTitle = 'Prowlarr';
    alt = 'Prowlarr';
    src = '/static/prowlarr.svg';
  } else if (clientValue === 'bittorrent') {
    // Generic BitTorrent (aggregated rtorrent + qbittorrent)
    defaultTitle = 'BitTorrent';
    alt = 'BT';
    src = '/static/logo-magnet.png';
  } else if (clientValue === 'rtorrent') {
    defaultTitle = 'BitTorrent (rTorrent)';
    alt = 'rT';
    src = '/static/logo-rtorrent.svg';
  } else if (clientValue === 'qbittorrent') {
    defaultTitle = 'BitTorrent (qBittorrent)';
    alt = 'qB';
    src = '/static/logo-qbittorrent.svg';
  } else if (clientValue === 'deluge') {
    defaultTitle = 'BitTorrent (Deluge)';
    alt = 'De';
    src = '/static/logo-deluge.svg';
  } else if (clientValue === 'transmission') {
    defaultTitle = 'BitTorrent (Transmission)';
    alt = 'Tr';
    src = '/static/logo-transmission.svg';
  } else if (clientValue === 'rucio') {
    defaultTitle = 'Rucio';
    alt = 'Rucio';
    src = '/static/logo-rucio.svg';
  } else if (clientValue === 'amule' || clientValue === 'ed2k') {
    defaultTitle = 'ED2K (aMule)';
    alt = 'ED2K';
    src = '/static/logo-brax.png';
  } else {
    // Unknown client type — use ED2K icon as fallback
    defaultTitle = clientValue || 'Unknown';
    alt = '?';
    src = '/static/logo-brax.png';
  }

  const floatClass = float ? 'float-left mr-1.5' : '';

  return h('img', {
    src,
    alt,
    title: title !== undefined ? title : defaultTitle,
    className: `flex-shrink-0 ${floatClass} ${className}`.trim(),
    style: {
      width: size,
      height: size,
      minWidth: size,
      minHeight: size,
      marginTop: float ? '2px' : undefined,
      ...style
    }
  });
};

export default ClientIcon;
