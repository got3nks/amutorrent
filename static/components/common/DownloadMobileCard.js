/**
 * DownloadMobileCard Component
 *
 * Rounded card for mobile download items.
 * Uses MobileCardHeader with lineClamp, ProgressBar, and a compact info row.
 * Info row format: speed • peers/sources • tracker
 */

import React from 'https://esm.sh/react@18.2.0';
import ItemMobileCard from './ItemMobileCard.js';
import MobileCardHeader from './MobileCardHeader.js';
import { ProgressBar } from './ProgressBar.js';
import Icon from './Icon.js';
import TrackerLabel from './TrackerLabel.js';
import { MoreButton } from './ContextMenu.js';
import { formatSpeed, formatSourceDisplay, getItemStatusInfo, isActiveStatus, getSeederColorClass, getTimeBasedColor } from '../../utils/index.js';

const { createElement: h } = React;

/**
 * DownloadMobileCard component
 * @param {Object} item - Download item
 * @param {string} theme - 'dark' or 'light'
 * @param {boolean} showBadge - Whether to show client type badge
 * @param {Object} categoryStyle - Category border style
 * @param {number} idx - Item index
 * @param {boolean} selectionMode - Whether selection mode is active
 * @param {boolean} isSelected - Whether the item is selected
 * @param {boolean} isContextTarget - Whether item is context menu target
 * @param {function} onSelectionToggle - Selection toggle handler
 * @param {function} onNameClick - Name click handler (opens context menu)
 * @param {function} onMoreClick - More button click handler
 */
const DownloadMobileCard = ({
  item,
  theme,
  showBadge,
  categoryStyle,
  idx,
  selectionMode,
  isSelected,
  isContextTarget,
  onSelectionToggle,
  onNameClick,
  onMoreClick
}) => {
  const statusInfo = getItemStatusInfo(item);

  return h(ItemMobileCard, {
    isSelected,
    isContextTarget,
    idx,
    categoryStyle,
    selectionMode,
    onSelectionToggle
  },
    h(MobileCardHeader, {
      showBadge,
      clientType: item.client,
      fileName: item.name,
      fileSize: item.size,
      selectionMode,
      isSelected,
      onSelectionToggle,
      onNameClick,
      actions: h(MoreButton, { onClick: onMoreClick })
    },
      // Detail content
      h('div', { className: 'space-y-1' },
        // Status-aware progress bar
        h(ProgressBar, { item, theme }),
        // Compact info row: speed • peers/sources • tracker
        h('div', {
          className: 'flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 truncate'
        },
          renderInfoLine(item, statusInfo)
        )
      )
    )
  );
};

/**
 * Render the compact info line below the progress bar
 * Format: speed • peers/sources • tracker
 */
function renderInfoLine(item, statusInfo) {
  const parts = [];
  const isRtorrent = item.client === 'rtorrent';
  const isActive = isActiveStatus(statusInfo.key);

  // Speed segment
  const dlSpeed = item.downloadSpeed || 0;
  const ulSpeed = item.uploadSpeed || 0;
  const speedParts = [];

  if (isActive) {
    if (dlSpeed > 0) speedParts.push(h('span', { key: 'dl', className: 'text-blue-600 dark:text-blue-400 flex items-center' }, h('span', { className: 'arrow-animated' }, h(Icon, { name: 'arrowDown', size: 12 })), ' ', formatSpeed(dlSpeed)));
    if (ulSpeed > 0) speedParts.push(h('span', { key: 'ul', className: 'text-green-600 dark:text-green-400 flex items-center' }, h('span', { className: 'arrow-animated arrow-up' }, h(Icon, { name: 'arrowUp', size: 12 })), ' ', formatSpeed(ulSpeed)));
  }

  if (speedParts.length === 0 && isActive) {
    speedParts.push(h('span', { key: 'idle' }, '0 B/s'));
  }

  if (speedParts.length > 0) {
    parts.push(h('span', { key: 'speed', className: 'flex items-center gap-1.5' },
      ...speedParts
    ));
  }

  // Peers/Sources segment - color coding matches desktop table
  const sourceText = formatSourceDisplay(item);
  if (isRtorrent) {
    const seedColorClass = getSeederColorClass(item.sources?.seeders || 0);
    const hasMessage = item.message && item.message.trim();
    parts.push(h('span', { key: 'peers', className: `flex items-center gap-1 ${seedColorClass}` },
      hasMessage && h(Icon, { name: 'alertCircle', size: 12, className: 'text-red-500 dark:text-red-400 flex-shrink-0' }),
      sourceText
    ));
  } else {
    // aMule: color based on last seen complete time
    const colorClass = getTimeBasedColor(item.lastSeenComplete);
    parts.push(h('span', { key: 'sources', className: colorClass }, sourceText));
  }

  // Tracker segment (rtorrent only)
  if (isRtorrent && item.tracker) {
    parts.push(h(TrackerLabel, { key: 'tracker', tracker: item.tracker, maxWidth: 100 }));
  }

  // Join parts with dot separators
  const result = [];
  parts.forEach((part, i) => {
    if (i > 0) result.push(h('span', { key: `sep-${i}`, className: 'text-gray-400' }, '·'));
    result.push(part);
  });

  return result;
}

export default DownloadMobileCard;
