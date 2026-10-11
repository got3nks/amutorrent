/**
 * useItemActions Hook
 *
 * Consolidates common item actions (pause, resume, stop, copy link)
 * used across DownloadsView and SharedView.
 */

import React from 'https://esm.sh/react@18.2.0';
import { useActions } from '../contexts/ActionsContext.js';
import { useStaticData } from '../contexts/StaticDataContext.js';
import { copyToClipboard, getExportLink } from '../utils/index.js';
import { itemKey } from '../utils/itemKey.js';

const { useState, useCallback } = React;

/**
 * @param {Object} options
 * @param {Array} options.dataArray - Array of items (downloads/shared files)
 * @param {Set} options.selectedFiles - Set of selected file hashes
 * @param {function} options.getSelectedHashes - Function to get array of selected hashes
 * @param {boolean} options.pauseSeedingOnly - If true, batch pause/resume only affect items whose client can pause seeding (default false)
 * @returns {Object} Action handlers and state
 */
export function useItemActions({
  dataArray,
  selectedFiles,
  getSelectedHashes,
  pauseSeedingOnly = false
}) {
  const actions = useActions();
  const { getCapabilities } = useStaticData();

  // Track which file's link was recently copied
  const [copiedHash, setCopiedHash] = useState(null);

  // ============================================================================
  // SINGLE ITEM ACTIONS
  // ============================================================================
  const handlePause = useCallback((fileHash, clientType = 'amule', fileName = null, instanceId = null) => {
    actions.files.pause(fileHash, clientType, fileName, instanceId);
  }, [actions.files]);

  const handleResume = useCallback((fileHash, clientType = 'amule', fileName = null, instanceId = null) => {
    actions.files.resume(fileHash, clientType, fileName, instanceId);
  }, [actions.files]);

  const handleStop = useCallback((fileHash, clientType = 'rtorrent', fileName = null, instanceId = null) => {
    actions.files.stop(fileHash, clientType, fileName, instanceId);
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
  // Resolve compound keys to pre-built items for ActionsContext
  const resolveItems = useCallback((compoundKeys) => {
    const keySet = new Set(compoundKeys);
    return dataArray
      .filter(d => keySet.has(itemKey(d.instanceId, d.hash)))
      .map(d => ({ fileHash: d.hash, clientType: d.client, instanceId: d.instanceId, fileName: d.name }));
  }, [dataArray]);

  // Like resolveItems, keeping only items whose client has `capability`
  const resolveItemsWith = useCallback((compoundKeys, capability) => {
    const keySet = new Set(compoundKeys);
    return dataArray
      .filter(d => keySet.has(itemKey(d.instanceId, d.hash)) && getCapabilities(d.instanceId)[capability])
      .map(d => ({ fileHash: d.hash, clientType: d.client, instanceId: d.instanceId, fileName: d.name }));
  }, [dataArray, getCapabilities]);

  const handleBatchPause = useCallback(() => {
    const selectedKeys = getSelectedHashes(); // compound keys
    const items = pauseSeedingOnly
      ? resolveItemsWith(selectedKeys, 'pauseSeeding')
      : resolveItems(selectedKeys);
    if (items.length > 0) {
      actions.files.pause(items);
    }
  }, [actions.files, getSelectedHashes, pauseSeedingOnly, resolveItemsWith, resolveItems]);

  const handleBatchResume = useCallback(() => {
    const selectedKeys = getSelectedHashes(); // compound keys
    const items = pauseSeedingOnly
      ? resolveItemsWith(selectedKeys, 'pauseSeeding')
      : resolveItems(selectedKeys);
    if (items.length > 0) {
      actions.files.resume(items);
    }
  }, [actions.files, getSelectedHashes, pauseSeedingOnly, resolveItemsWith, resolveItems]);

  const handleBatchStop = useCallback(() => {
    const items = resolveItemsWith(getSelectedHashes(), 'stop');
    if (items.length > 0) {
      actions.files.stop(items);
    }
  }, [actions.files, getSelectedHashes, resolveItemsWith]);

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
