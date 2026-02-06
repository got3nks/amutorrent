/**
 * useItemContextMenu Hook
 *
 * Provides handleRowContextMenu and getContextMenuItems for file-based views
 * (DownloadsView, SharedView). Consolidates common context menu patterns.
 */

import { useCallback } from 'https://esm.sh/react@18.2.0';
import { getItemStatusInfo, getExportLink, getExportLinkLabel } from '../utils/index.js';

/**
 * Hook for building context menu items and handlers
 * @param {Object} options
 * @param {boolean} options.selectionMode - Whether selection mode is active (disables context menu)
 * @param {Function} options.openContextMenu - Function to open context menu
 * @param {Function} options.closeContextMenu - Function to close context menu (optional)
 * @param {Function} options.onShowInfo - Handler for showing item info (required)
 * @param {Function} options.onDelete - Handler for deleting item (required)
 * @param {Function} options.onCategoryChange - Handler for changing category (optional - shows menu item if provided)
 * @param {Function} options.onPause - Handler for pausing item (optional)
 * @param {Function} options.onResume - Handler for resuming item (optional)
 * @param {Function} options.onStop - Handler for stopping item (optional - rtorrent only)
 * @param {Function} options.onCopyLink - Handler for copying export link (optional)
 * @param {string|null} options.copiedHash - Hash of recently copied item for "Copied!" feedback
 * @param {string} options.infoLabel - Label for info menu item (default: 'File Details')
 * @param {boolean} options.actionsForRtorrentOnly - If true, pause/resume/stop only shown for rtorrent items
 * @param {Function} options.onSelect - Handler for entering selection mode with item selected (optional)
 * @param {Function} options.canShowInfo - Function to determine if info item should show (default: always true)
 * @param {string} options.deleteLabel - Label for delete menu item (default: 'Delete')
 * @returns {Object} { handleRowContextMenu, getContextMenuItems }
 */
export const useItemContextMenu = ({
  selectionMode = false,
  openContextMenu,
  closeContextMenu,
  onShowInfo,
  onDelete,
  onCategoryChange,
  onPause,
  onResume,
  onStop,
  onCopyLink,
  copiedHash = null,
  infoLabel = 'File Details',
  actionsForRtorrentOnly = false,
  onSelect,
  canShowInfo,
  deleteLabel = 'Delete'
}) => {
  const handleRowContextMenu = useCallback((e, item) => {
    if (selectionMode) return;
    openContextMenu(e, item);
  }, [selectionMode, openContextMenu]);

  const getContextMenuItems = useCallback((item) => {
    if (!item) return [];

    const isRtorrent = item.client === 'rtorrent';
    const status = getItemStatusInfo(item);
    const items = [];

    // Info item (shown if onShowInfo provided and canShowInfo passes)
    const showInfo = onShowInfo && (!canShowInfo || canShowInfo(item));
    if (showInfo) {
      items.push({
        label: infoLabel,
        icon: 'info',
        iconColor: 'text-blue-600 dark:text-blue-400',
        onClick: () => {
          onShowInfo(item);
          closeContextMenu?.();
        }
      });
    }

    // Category item (optional)
    if (onCategoryChange) {
      items.push({
        label: 'Change Category',
        icon: 'folder',
        iconColor: 'text-orange-600 dark:text-orange-400',
        onClick: () => {
          onCategoryChange(item);
          closeContextMenu?.();
        }
      });
    }

    // Pause/Resume/Start (skip for checking/queued state)
    const canShowPauseResume = actionsForRtorrentOnly ? isRtorrent : true;
    if (canShowPauseResume && onPause && onResume && status.key !== 'checking' && status.key !== 'hashing-queued') {
      const needsResume = status.key === 'paused' || status.key === 'stopped';
      items.push({
        label: status.key === 'stopped' ? 'Start' : (status.key === 'paused' ? 'Resume' : 'Pause'),
        icon: needsResume ? 'play' : 'pause',
        iconColor: needsResume ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400',
        onClick: () => {
          if (needsResume) {
            onResume(item.hash, item.client || 'amule', item.name);
          } else {
            onPause(item.hash, item.client || 'amule', item.name);
          }
          closeContextMenu?.();
        }
      });
    }

    // Stop (rtorrent only, when not already stopped)
    if (onStop && isRtorrent && status.key !== 'stopped') {
      items.push({
        label: 'Stop',
        icon: 'stop',
        iconColor: 'text-gray-600 dark:text-gray-400',
        onClick: () => {
          onStop(item.hash, item.name);
          closeContextMenu?.();
        }
      });
    }

    // Export link
    if (onCopyLink) {
      const hasExportLink = isRtorrent || !!item.ed2kLink || !!getExportLink(item);
      const isCopied = copiedHash === item.hash;
      const linkLabel = getExportLinkLabel(item);

      items.push({
        label: isCopied ? 'Copied!' : `Export ${linkLabel}`,
        icon: isCopied ? 'check' : 'share',
        iconColor: isCopied ? 'text-green-600 dark:text-green-400' : 'text-cyan-600 dark:text-cyan-400',
        disabled: !hasExportLink,
        onClick: () => {
          onCopyLink(item);
          closeContextMenu?.();
        }
      });
    }

    // Select (enter selection mode with this item)
    if (onSelect) {
      items.push({
        label: 'Select',
        icon: 'checkSquare',
        iconColor: 'text-purple-600 dark:text-purple-400',
        onClick: () => {
          onSelect(item.hash);
          closeContextMenu?.();
        }
      });
    }

    // Divider + Delete
    items.push({ divider: true });
    items.push({
      label: deleteLabel,
      icon: 'trash',
      iconColor: 'text-red-600 dark:text-red-400',
      onClick: () => {
        onDelete(item);
        closeContextMenu?.();
      }
    });

    return items;
  }, [
    infoLabel,
    onShowInfo,
    canShowInfo,
    onCategoryChange,
    onPause,
    onResume,
    onStop,
    onCopyLink,
    onDelete,
    deleteLabel,
    copiedHash,
    actionsForRtorrentOnly,
    closeContextMenu,
    onSelect
  ]);

  return { handleRowContextMenu, getContextMenuItems };
};

export default useItemContextMenu;
