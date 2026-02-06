/**
 * useContextMenuFrozenOrder Hook
 *
 * Captures sort order when a context menu opens, so that data refreshes
 * don't rearrange rows while the menu is visible.
 *
 * Usage:
 *   const contextMenuFrozenOrder = useContextMenuFrozenOrder(contextMenu, sortedDataRef);
 *   const { sortedData } = useTableState({ frozenOrder: frozenSortOrder || contextMenuFrozenOrder });
 */

import React from 'https://esm.sh/react@18.2.0';

const { useRef } = React;

/**
 * @param {Object} contextMenu - Context menu state from useContextMenu ({ show, ... })
 * @param {{ current: Array }} sortedDataRef - Ref to the current sorted data array
 * @param {string} hashKey - Key to extract from each item for the order array (default: 'hash')
 * @returns {Array|null} Frozen order array when context menu is open, null otherwise
 */
export const useContextMenuFrozenOrder = (contextMenu, sortedDataRef, hashKey = 'hash') => {
  const frozenOrderRef = useRef(null);

  if (contextMenu.show && !frozenOrderRef.current) {
    frozenOrderRef.current = sortedDataRef.current.map(item => item[hashKey]);
  }
  if (!contextMenu.show) {
    frozenOrderRef.current = null;
  }

  return frozenOrderRef.current;
};

export default useContextMenuFrozenOrder;
