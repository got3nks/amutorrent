/**
 * useFrozenSortSelection Hook
 *
 * Combines useSelectionMode with frozen sort order functionality.
 * When entering selection mode, captures the current sort order to prevent
 * items from jumping around when data refreshes.
 *
 * Usage:
 *   const { sortedDataRef, frozenSortOrder, ... } = useFrozenSortSelection();
 *   const { sortedData } = useTableState({ frozenOrder: frozenSortOrder });
 *   sortedDataRef.current = sortedData; // Update ref after useTableState
 */

import React from 'https://esm.sh/react@18.2.0';
import { useSelectionMode } from './useSelectionMode.js';

const { useState, useCallback, useRef } = React;

/**
 * Hook for selection mode with frozen sort order
 * @param {Object} options
 * @param {string} options.hashKey - Key to use for getting item hash (default: 'hash')
 * @returns {Object} Selection mode state, handlers, frozen sort order, and sortedDataRef
 */
export const useFrozenSortSelection = ({
  hashKey = 'hash'
} = {}) => {
  // Base selection mode
  const {
    selectionMode,
    selectedFiles,
    selectedCount,
    toggleSelectionMode: baseToggleSelectionMode,
    exitSelectionMode: baseExitSelectionMode,
    enterSelectionWithItem: baseEnterSelectionWithItem,
    toggleFileSelection,
    clearAllSelections,
    selectAll,
    selectShown,
    isShownFullySelected,
    getSelectedHashes,
    isSelected
  } = useSelectionMode();

  // Frozen sort order state
  const [frozenSortOrder, setFrozenSortOrder] = useState(null);

  // Ref to store the latest sorted data - view must update this after useTableState
  const sortedDataRef = useRef([]);

  // Custom toggle that freezes/unfreezes sort order
  const toggleSelectionMode = useCallback(() => {
    if (!selectionMode) {
      // Entering selection mode - capture current sort order from ref
      const currentOrder = sortedDataRef.current.map(item => item[hashKey]);
      setFrozenSortOrder(currentOrder);
    } else {
      // Exiting selection mode - clear frozen order
      setFrozenSortOrder(null);
    }
    baseToggleSelectionMode();
  }, [selectionMode, baseToggleSelectionMode, hashKey]);

  // Custom exit that also clears frozen order
  const exitSelectionMode = useCallback(() => {
    setFrozenSortOrder(null);
    baseExitSelectionMode();
  }, [baseExitSelectionMode]);

  // Custom enter with item that also freezes sort order
  const enterSelectionWithItem = useCallback((fileHash) => {
    // Capture current sort order from ref before entering
    const currentOrder = sortedDataRef.current.map(item => item[hashKey]);
    setFrozenSortOrder(currentOrder);
    baseEnterSelectionWithItem(fileHash);
  }, [baseEnterSelectionWithItem, hashKey]);

  return {
    // Selection mode state
    selectionMode,
    selectedFiles,
    selectedCount,
    toggleSelectionMode,
    exitSelectionMode,
    enterSelectionWithItem,
    toggleFileSelection,
    clearAllSelections,
    selectAll,
    selectShown,
    isShownFullySelected,
    getSelectedHashes,
    isSelected,
    // Frozen sort order - pass to useTableState
    frozenSortOrder,
    // Ref to update with sorted data after useTableState call
    sortedDataRef
  };
};

export default useFrozenSortSelection;
