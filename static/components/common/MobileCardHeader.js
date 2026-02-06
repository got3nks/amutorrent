/**
 * MobileCardHeader Component
 *
 * Reusable wrapper for mobile card views across Downloads, Uploads, Shared, History, and Search.
 * Layout: [Content] [Actions (right, top-aligned)]
 * When showBadge is true, client icon is integrated into the size label with matching colors.
 */

import React from 'https://esm.sh/react@18.2.0';
import ClientIcon from './ClientIcon.js';
import TrackerLabel from './TrackerLabel.js';
import { useDynamicFontSize } from '../../hooks/index.js';
import { formatBytes } from '../../utils/index.js';

const { createElement: h, useRef } = React;

/**
 * MobileCardHeader component - wraps entire card content
 * @param {boolean} showBadge - Whether to show the client type icon in the size badge
 * @param {string} clientType - Client type ('amule' or 'rtorrent')
 * @param {string} fileName - File name to display in first row
 * @param {number} fileSize - File size in bytes to display as label (optional)
 * @param {string} trackerDomain - Tracker domain to display as label (optional, aligned right)
 * @param {boolean} selectionMode - Whether selection mode is active
 * @param {boolean} isSelected - Whether the item is selected (for checkbox)
 * @param {function} onSelectionToggle - Handler for selection toggle
 * @param {function} onNameClick - Handler for tapping the filename (opens context menu on mobile)
 * @param {ReactNode} actions - Action buttons to render on the right side
 * @param {ReactNode} children - Additional content rows below the filename
 */
const MobileCardHeader = ({
  showBadge = false,
  clientType,
  fileName,
  fileSize,
  trackerDomain,
  selectionMode = false,
  isSelected = false,
  onSelectionToggle,
  onNameClick,
  actions,
  children
}) => {
  const getDynamicFontSize = useDynamicFontSize();
  const actionsRef = useRef(null);
  const hasActions = !selectionMode && actions;
  const hasCheckbox = selectionMode && onSelectionToggle;

  // Client-specific colors for the badge (matches header filter toggle)
  const isRtorrent = clientType === 'rtorrent';
  const badgeBgClass = showBadge
    ? (isRtorrent
        ? 'bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300'
        : 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300')
    : 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300';

  // Show size badge if we have fileSize or showBadge (for client icon)
  const showSizeBadge = fileSize > 0 || showBadge;

  return h('div', { className: 'flex items-start gap-2 pl-1' },
    // Main content area (takes remaining space)
    h('div', { className: 'flex-1 min-w-0' },
      // Filename row with labels
      h('div', {
        className: `flex items-start gap-1.5 mb-1${!selectionMode && onNameClick ? ' cursor-pointer' : ''}`,
        onClick: !selectionMode && onNameClick ? (e) => onNameClick(e, actionsRef.current) : undefined
      },
        // Filename with line-clamp (takes available space)
        h('span', {
          className: `flex-1 min-w-0 font-medium text-gray-900 dark:text-gray-100 ${!selectionMode && onNameClick ? 'underline decoration-dotted' : ''}`,
          style: {
            fontSize: getDynamicFontSize(fileName || 'Unknown'),
            wordBreak: 'break-all',
            lineHeight: '1.4',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden'
          }
        }, fileName || 'Unknown'),
        // Size badge (optionally with client icon)
        showSizeBadge && h('span', {
          className: `flex-shrink-0 px-1.5 py-px rounded-full text-xs font-medium ${badgeBgClass} whitespace-nowrap flex items-center gap-1`
        },
          showBadge && h(ClientIcon, { clientType, size: 12, title: '' }),
          fileSize > 0 ? formatBytes(fileSize) : null
        ),
        h(TrackerLabel, { tracker: trackerDomain, maxWidth: 100, className: 'flex-shrink-0' })
      ),
      children
    ),

    // Right column: checkbox in selection mode, or action buttons otherwise
    hasCheckbox
      ? h('div', { className: 'flex-shrink-0 mt-0.5', onClick: (e) => e.stopPropagation() },
          h('input', {
            type: 'checkbox',
            checked: isSelected,
            onChange: onSelectionToggle,
            className: 'w-5 h-5 text-purple-600 border-gray-300 rounded focus:ring-purple-500 cursor-pointer'
          })
        )
      : hasActions && h('div', { ref: actionsRef, className: 'flex-shrink-0 mt-1 flex flex-col gap-2.5 leading-none' }, actions)
  );
};

export default MobileCardHeader;
