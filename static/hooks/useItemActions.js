/**
 * useItemActions Hook
 *
 * Consolidates common item actions (pause, resume, stop, copy link)
 * used across DownloadsView and SharedView.
 */

import React from 'https://esm.sh/react@18.2.0';
import { useActions } from '../contexts/ActionsContext.js';
import { copyToClipboard, getExportLink } from '../utils/index.js';

const { useState, useCallback } = React;

/**
 * @param {Object} options
 * @param {Array} options.dataArray - Array of items (downloads/shared files)
 * @param {Set} options.selectedFiles - Set of selected file hashes
 * @param {function} options.getSelectedHashes - Function to get array of selected hashes
 * @param {boolean} options.rtorrentOnly - If true, batch actions only affect rtorrent items (default false)
 * @returns {Object} Action handlers and state
 */
export function useItemActions({
  dataArray,
  selectedFiles,
  getSelectedHashes,
  rtorrentOnly = false
}) {
  const actions = useActions();

  // Track which file's link was recently copied
  const [copiedHash, setCopiedHash] = useState(null);

  // ============================================================================
  // SINGLE ITEM ACTIONS
  // ============================================================================
  const handlePause = useCallback((fileHash, clientType = 'amule', fileName = null) => {
    const client = rtorrentOnly ? 'rtorrent' : clientType;
    actions.files.pause(fileHash, client, fileName);
  }, [actions.files, rtorrentOnly]);

  const handleResume = useCallback((fileHash, clientType = 'amule', fileName = null) => {
    const client = rtorrentOnly ? 'rtorrent' : clientType;
    actions.files.resume(fileHash, client, fileName);
  }, [actions.files, rtorrentOnly]);

  const handleStop = useCallback((fileHash, fileName = null) => {
    // Stop is always rtorrent-only
    actions.files.stop(fileHash, 'rtorrent', fileName);
  }, [actions.files]);

  const handleCopyLink = useCallback(async (item) => {
    const link = getExportLink(item);
    if (link) {
      const success = await copyToClipboard(link);
      if (success) {
        setCopiedHash(item.hash);
        setTimeout(() => setCopiedHash(null), 2000);
      }
    }
  }, []);

  // ============================================================================
  // BATCH ACTIONS
  // ============================================================================
  const filterRtorrentHashes = useCallback((hashes) => {
    return hashes.filter(hash => {
      const item = dataArray.find(d => d.hash === hash);
      return item?.client === 'rtorrent';
    });
  }, [dataArray]);

  const handleBatchPause = useCallback(() => {
    const hashes = rtorrentOnly
      ? filterRtorrentHashes(Array.from(selectedFiles))
      : getSelectedHashes();
    if (hashes.length > 0) {
      actions.files.pause(hashes, dataArray);
    }
  }, [actions.files, selectedFiles, getSelectedHashes, dataArray, rtorrentOnly, filterRtorrentHashes]);

  const handleBatchResume = useCallback(() => {
    const hashes = rtorrentOnly
      ? filterRtorrentHashes(Array.from(selectedFiles))
      : getSelectedHashes();
    if (hashes.length > 0) {
      actions.files.resume(hashes, dataArray);
    }
  }, [actions.files, selectedFiles, getSelectedHashes, dataArray, rtorrentOnly, filterRtorrentHashes]);

  const handleBatchStop = useCallback(() => {
    // Stop is always rtorrent-only
    const rtorrentHashes = filterRtorrentHashes(getSelectedHashes());
    if (rtorrentHashes.length > 0) {
      actions.files.stop(rtorrentHashes, dataArray);
    }
  }, [actions.files, getSelectedHashes, dataArray, filterRtorrentHashes]);

  return {
    // State
    copiedHash,
    // Single item actions
    handlePause,
    handleResume,
    handleStop,
    handleCopyLink,
    // Batch actions
    handleBatchPause,
    handleBatchResume,
    handleBatchStop
  };
}

export default useItemActions;
