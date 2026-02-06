/**
 * SelectionModeSection Component
 *
 * Wrapper for selection mode footer that includes:
 * - Bottom spacer div (dynamically sized to match footer height)
 * - SelectionModeFooter with all standard props
 *
 * Only renders when selectionMode is true.
 */

import React from 'https://esm.sh/react@18.2.0';
import SelectionModeFooter from './SelectionModeFooter.js';

const { createElement: h, Fragment, useState, useCallback } = React;

// Small buffer for visual breathing room between content and footer
const SPACER_BUFFER = 8;

/**
 * SelectionModeSection component
 * @param {boolean} active - Whether selection mode is active (renders nothing if false)
 * @param {number} selectedCount - Number of selected items
 * @param {boolean} allItemsSelected - Whether all items are selected
 * @param {boolean} shownFullySelected - Whether all shown items are fully selected
 * @param {boolean} hasMoreToLoad - Whether there are more items to load
 * @param {number} shownCount - Number of items currently shown
 * @param {number} totalCount - Total number of items
 * @param {function} onSelectShown - Handler for selecting shown items
 * @param {function} onSelectAll - Handler for selecting all items
 * @param {function} onClearAll - Handler for clearing selection
 * @param {function} onExit - Handler for exiting selection mode
 * @param {React.ReactNode} children - Action buttons to render in footer
 */
const SelectionModeSection = ({
  active,
  selectedCount,
  allItemsSelected = false,
  shownFullySelected,
  hasMoreToLoad = true,
  shownCount,
  totalCount,
  onSelectShown,
  onSelectAll,
  onClearAll,
  onExit,
  children
}) => {
  // Dynamic footer height (measured by SelectionModeFooter)
  const [footerHeight, setFooterHeight] = useState(56); // Default: single row footer

  const handleHeightChange = useCallback((height) => {
    setFooterHeight(height);
  }, []);

  if (!active) return null;

  // Total spacer height = footer content height + buffer
  // Mobile needs extra space for MobileNavFooter (3rem = 48px)
  const spacerHeight = footerHeight + SPACER_BUFFER;

  return h(Fragment, null,
    // Bottom spacer to prevent content from being hidden behind fixed footer
    // !mt-0 overrides parent's space-y-* margin
    // sm:-mt-3 reduces height by 12px on sm+ to account for main container's py-3
    h('div', { className: '!mt-0 sm:!-mt-3', style: { height: spacerHeight } }),
    // Selection mode footer
    h(SelectionModeFooter, {
      selectedCount,
      allItemsSelected,
      shownFullySelected,
      hasMoreToLoad,
      shownCount,
      totalCount,
      onSelectShown,
      onSelectAll,
      onClearAll,
      onExit,
      onHeightChange: handleHeightChange
    }, children)
  );
};

export default SelectionModeSection;
