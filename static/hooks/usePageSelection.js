/**
 * usePageSelection Hook
 *
 * Handles Gmail-style two-step selection logic:
 * 1. First click selects all currently shown (loaded) items
 * 2. Banner appears offering to select all items (including not yet loaded)
 *
 * Works with useSelectionMode hook for the actual selection state management.
 */

import React from 'https://esm.sh/react@18.2.0';

const { useMemo, useCallback } = React;

/**
 * Hook for Gmail-style selection
 * @param {Object} options
 * @param {Array} options.shownData - Items currently shown (loaded via load-more)
 * @param {Array} options.allData - All items (sorted/filtered, including not loaded)
 * @param {number} options.selectedCount - Number of currently selected items
 * @param {function} options.selectShown - Function to select shown items
 * @param {function} options.selectAll - Function to select all items
 * @param {function} options.isShownFullySelected - Function to check if all shown items are selected
 * @param {string} options.hashKey - Key to use for getting item hash (default: 'fileHash')
 * @returns {Object} Selection state and handlers
 */
export const usePageSelection = ({
  shownData,
  allData,
  selectedCount,
  selectShown,
  selectAll,
  isShownFullySelected,
  hashKey = 'fileHash'
}) => {
  // Get hashes for shown items
  const shownHashes = useMemo(() => {
    return shownData.map(item => item[hashKey]);
  }, [shownData, hashKey]);

  // Get hashes for all items
  const allHashes = useMemo(() => {
    return allData.map(item => item[hashKey]);
  }, [allData, hashKey]);

  // Check if all shown items are selected
  const shownFullySelected = isShownFullySelected(shownHashes);

  // Check if all items are selected
  const allItemsSelected = selectedCount === allData.length && allData.length > 0;

  // Check if there are more items than currently shown
  const hasMoreToLoad = allData.length > shownData.length;

  // Handler to select all shown items
  const handleSelectShown = useCallback(() => {
    selectShown(shownHashes);
  }, [shownHashes, selectShown]);

  // Handler to select all items
  const handleSelectAll = useCallback(() => {
    selectAll(allHashes);
  }, [allHashes, selectAll]);

  return {
    shownHashes,
    shownFullySelected,
    allItemsSelected,
    hasMoreToLoad,
    handleSelectShown,
    handleSelectAll,
    shownCount: shownData.length,
    totalCount: allData.length
  };
};

export default usePageSelection;
