/**
 * useFileInfoModal Hook
 *
 * Manages FileInfoModal state and returns ready-to-render modal element.
 * Simplifies modal usage in views by encapsulating state and rendering.
 */

import React, { useState, useCallback, useMemo } from 'https://esm.sh/react@18.2.0';
import FileInfoModal from '../components/modals/FileInfoModal.js';

const { createElement: h } = React;

/**
 * Hook for managing FileInfoModal in views
 * @returns {Object} { openFileInfo, FileInfoElement }
 */
export const useFileInfoModal = () => {
  const [infoHash, setInfoHash] = useState(null);

  // Open modal with specific hash
  const openFileInfo = useCallback((hash) => {
    setInfoHash(hash);
  }, []);

  // Close modal
  const closeFileInfo = useCallback(() => {
    setInfoHash(null);
  }, []);

  // Pre-rendered modal element
  const FileInfoElement = useMemo(() => {
    return h(FileInfoModal, {
      hash: infoHash,
      onClose: closeFileInfo
    });
  }, [infoHash, closeFileInfo]);

  return {
    openFileInfo,
    FileInfoElement
  };
};

export default useFileInfoModal;
