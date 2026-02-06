/**
 * useSelectionMode Hook
 *
 * Manages selection mode state for file lists (downloads, shared files, etc.)
 * Provides toggle, select, clear operations for batch file operations
 */

import React from 'https://esm.sh/react@18.2.0';

const { useState, useCallback } = React;

/**
 * Hook for managing selection mode in file lists
 * @returns {Object} Selection mode state and handlers
 */
export const useSelectionMode = () => {
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState(new Set());

  // Toggle selection mode on/off
  const toggleSelectionMode = useCallback(() => {
    setSelectionMode(prev => !prev);
    setSelectedFiles(new Set()); // Clear selections when toggling
  }, []);

  // Exit selection mode
  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedFiles(new Set());
  }, []);

  // Enter selection mode with an item already selected
  const enterSelectionWithItem = useCallback((fileHash) => {
    setSelectionMode(true);
    setSelectedFiles(new Set([fileHash]));
  }, []);

  // Toggle a single file's selection
  const toggleFileSelection = useCallback((fileHash) => {
    setSelectedFiles(prev => {
      const newSelected = new Set(prev);
      if (newSelected.has(fileHash)) {
        newSelected.delete(fileHash);
      } else {
        newSelected.add(fileHash);
      }
      return newSelected;
    });
  }, []);

  // Clear all selections (without exiting selection mode)
  const clearAllSelections = useCallback(() => {
    setSelectedFiles(new Set());
  }, []);

  // Select all files from provided array of hashes (all pages)
  const selectAll = useCallback((fileHashes) => {
    setSelectedFiles(new Set(fileHashes));
  }, []);

  // Select only shown items (replaces current selection)
  const selectShown = useCallback((shownHashes) => {
    setSelectedFiles(new Set(shownHashes));
  }, []);

  // Check if all shown items are selected
  const isShownFullySelected = useCallback((shownHashes) => {
    if (!shownHashes || shownHashes.length === 0) return false;
    return shownHashes.every(hash => selectedFiles.has(hash));
  }, [selectedFiles]);

  // Get array of selected file hashes
  const getSelectedHashes = useCallback(() => {
    return Array.from(selectedFiles);
  }, [selectedFiles]);

  // Check if a file is selected
  const isSelected = useCallback((fileHash) => {
    return selectedFiles.has(fileHash);
  }, [selectedFiles]);

  return {
    selectionMode,
    selectedFiles,
    selectedCount: selectedFiles.size,
    toggleSelectionMode,
    exitSelectionMode,
    enterSelectionWithItem,
    toggleFileSelection,
    clearAllSelections,
    selectAll,
    selectShown,
    isShownFullySelected,
    getSelectedHashes,
    isSelected
  };
};

export default useSelectionMode;
