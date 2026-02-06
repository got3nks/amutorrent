/**
 * ProgressBar Component
 *
 * Status-aware progress bar shared by desktop table and mobile cards.
 * Bar color is based on download status using gradients.
 * Standard solid bar by default; SegmentsBar appears on hover/touch
 * for aMule items with part data.
 *
 * Variants:
 *   desktop — centered percentage text, compact
 *   mobile  — left-aligned status icon + label + percentage + size
 */

import React from 'https://esm.sh/react@18.2.0';
import Icon from './Icon.js';
import SegmentsBar from './SegmentsBar.js';
import Tooltip from './Tooltip.js';
import { formatBytes, formatETASeconds, getStatusBarColor, getItemStatusInfo, STATUS_DISPLAY_MAP, PROGRESS_STRIPES_STYLE } from '../../utils/index.js';

const { createElement: h, useState, useCallback, useMemo } = React;

const VARIANT_CONFIG = {
  desktop: {
    container: 'w-full min-w-[100px]',
    segmentsWidth: 170,
    strokeWidth: '1px',
    textClass: 'absolute inset-0 flex items-center justify-center font-bold text-gray-900 dark:text-white pointer-events-none text-xs'
  },
  mobile: {
    container: 'w-full',
    segmentsWidth: 400,
    strokeWidth: '0.5px',
    textClass: 'absolute inset-0 flex items-center gap-1 pl-2 font-bold text-gray-900 dark:text-white pointer-events-none text-xs sm:text-sm'
  }
};

/**
 * ProgressBar component
 * @param {Object} item - Download item with progress data
 * @param {string} theme - 'dark' or 'light'
 * @param {string} variant - 'desktop' or 'mobile'
 */
const ProgressBar = ({ item, theme, variant = 'mobile' }) => {
  const isDark = theme === 'dark';
  const config = VARIANT_CONFIG[variant] || VARIANT_CONFIG.mobile;
  const statusInfo = getItemStatusInfo(item);
  const display = STATUS_DISPLAY_MAP[statusInfo.key] || STATUS_DISPLAY_MAP.active;
  const barColor = getStatusBarColor(statusInfo.key);

  // Hover/touch state for SegmentsBar toggle (aMule only)
  const isAmuleWithParts = item.client !== 'rtorrent' && item.partStatus;
  const [showSegments, setShowSegments] = useState(false);

  const handlePointerEnter = useCallback(() => {
    if (isAmuleWithParts) setShowSegments(true);
  }, [isAmuleWithParts]);

  const handlePointerLeave = useCallback(() => {
    setShowSegments(false);
  }, []);

  // Progress text varies by variant
  const progress = item.progress || 0;
  const statusLabel = display.label || 'Active';

  // Use pre-calculated ETA from server (in seconds), format for display
  const remainingBytes = (item.size || 0) - (item.sizeDownloaded || 0);
  const downloadSpeed = item.downloadSpeed || 0;
  const eta = item.eta != null ? formatETASeconds(item.eta) : null;

  let progressText;
  if (variant === 'desktop') {
    progressText = `${progress}%`;
  } else {
    if (progress >= 100) {
      progressText = `${statusLabel} · ${formatBytes(item.size)}`;
    } else {
      const sizeLeft = formatBytes(remainingBytes);
      progressText = eta
        ? `${statusLabel} · ${progress}% · ${sizeLeft} left · ${eta}`
        : `${statusLabel} · ${progress}% · ${sizeLeft} left`;
    }
  }

  return h('div', {
    className: config.container,
    onPointerEnter: handlePointerEnter,
    onPointerLeave: handlePointerLeave
  },
    h('div', { className: 'w-full bg-gray-200 dark:bg-gray-700 rounded-full h-5 relative overflow-hidden border border-gray-300 dark:border-gray-600' },
      // Show SegmentsBar on hover/touch for aMule items, gradient bar otherwise
      showSegments && isAmuleWithParts
        ? h(SegmentsBar, {
            fileSize: parseInt(item.size),
            fileSizeDownloaded: parseInt(item.sizeDownloaded),
            partStatus: item.partStatus,
            gapStatus: item.gapStatus,
            reqStatus: item.reqStatus,
            sourceCount: parseInt(item.sources?.total || 0),
            width: config.segmentsWidth,
            height: 20
          })
        : h('div', {
            className: `h-full rounded-l-full transition-all duration-300 ${barColor} relative overflow-hidden`,
            style: { width: `${progress}%` }
          },
            // Animated stripes overlay when downloading
            downloadSpeed > 0 && h('div', {
              className: 'absolute inset-0',
              style: PROGRESS_STRIPES_STYLE
            })
          ),
      // Text overlay - wrap with Tooltip for error status in mobile variant
      (() => {
        const textContent = h('span', {
          className: config.textClass,
          style: {
            WebkitTextStroke: isDark ? `${config.strokeWidth} black` : `${config.strokeWidth} white`,
            textShadow: isDark ? '0 0 1px black, 0 0 1px black' : '0 0 1px white, 0 0 1px white',
            paintOrder: 'stroke fill'
          }
        },
          variant === 'mobile' && h(Icon, { name: display.icon, size: 12 }),
          progressText
        );
        // Show tooltip for error status with message in mobile variant
        const showErrorTooltip = variant === 'mobile' && statusInfo.key === 'error' && item.message;
        return showErrorTooltip ? h(Tooltip, { content: item.message }, textContent) : textContent;
      })()
    )
  );
};

// Named export for direct import, default for backward compat
export { ProgressBar };
export default ProgressBar;
