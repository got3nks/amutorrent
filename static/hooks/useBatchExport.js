/**
 * useBatchExport Hook
 *
 * Shared hook for batch exporting links (ED2K/magnet) with copy feedback
 */

import { useCallback } from 'https://esm.sh/react@18.2.0';
import { useCopyToClipboard } from './useCopyToClipboard.js';
import { getExportLink } from '../utils/index.js';

/**
 * Hook for batch exporting links with copy status feedback
 * @param {Object} options
 * @param {Set} options.selectedFiles - Set of selected file hashes
 * @param {Array} options.dataArray - Array of items to search for selected files
 * @returns {Object} { batchCopyStatus, handleBatchExport }
 */
export const useBatchExport = ({
  selectedFiles,
  dataArray
}) => {
  const { copyStatus: batchCopyStatus, handleCopy } = useCopyToClipboard();

  const handleBatchExport = useCallback(async () => {
    const selectedItems = dataArray.filter(item => selectedFiles.has(item.hash));
    const links = selectedItems
      .map(item => getExportLink(item))
      .filter(link => link)
      .join('\n');

    if (links) {
      await handleCopy(links);
    }
  }, [dataArray, selectedFiles, handleCopy]);

  return {
    batchCopyStatus,
    handleBatchExport
  };
};
