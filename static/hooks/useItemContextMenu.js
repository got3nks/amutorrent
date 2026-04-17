/**
 * useItemContextMenu Hook
 *
 * Provides handleRowContextMenu and getContextMenuItems for file-based views
 * (DownloadsView, SharedView). Consolidates common context menu patterns.
 */

import { useCallback } from 'https://esm.sh/react@18.2.0';
import { getItemStatusInfo, getExportLink, getExportLinkLabel } from '../utils/index.js';
import { itemKey } from '../utils/itemKey.js';
import { useStaticData } from '../contexts/StaticDataContext.js';
import { useCapabilities } from './useCapabilities.js';

/**
 * Hook for building context menu items and handlers
 * @param {Object} options
 * @param {boolean} options.selectionMode - Whether selection mode is active (disables context menu)
 * @param {Function} options.openContextMenu - Function to open context menu
 * @param {Function} options.closeContextMenu - Function to close context menu (optional)
 * @param {Function} options.onShowInfo - Handler for showing item info (required)
 * @param {Function} options.onDelete - Handler for deleting item (required)
 * @param {Function} options.onCategoryChange - Handler for changing category (optional - shows menu item if provided)
 * @param {Function} options.onMoveTo - Handler for moving files (optional - shows menu item if provided)
 * @param {Function} options.onPause - Handler for pausing item (optional)
 * @param {Function} options.onResume - Handler for resuming item (optional)
 * @param {Function} options.onStop - Handler for stopping item (optional - rtorrent only)
 * @param {Function} options.onRename - Handler for renaming item (optional - shows menu item if provided)
 * @param {Function} options.onSetRatingComment - Handler for editing rating/comment (optional - shared files only, clients with fileRatingComment capability)
 * @param {Function} options.onCopyLink - Handler for copying export link (optional)
 * @param {string|null} options.copiedHash - Hash of recently copied item for "Copied!" feedback
 * @param {string} options.infoLabel - Label for info menu item (default: 'File Details')
 * @param {boolean} options.actionsForBittorrentOnly - If true, pause/resume/stop only shown for BitTorrent items (rtorrent/qbittorrent)
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
  onMoveTo,
  onPause,
  onResume,
  onStop,
  onRename,
  onSetRatingComment,
  onCopyLink,
  copiedHash = null,
  infoLabel = 'File Details',
  actionsForBittorrentOnly = false,
  onSelect,
  canShowInfo,
  deleteLabel = 'Delete'
}) => {
  const { getCapabilities } = useStaticData();
  const { hasCap } = useCapabilities();

  const handleRowContextMenu = useCallback((e, item) => {
    if (selectionMode) return;
    openContextMenu(e, item);
  }, [selectionMode, openContextMenu]);

  const getContextMenuItems = useCallback((item) => {
    if (!item) return [];

    const caps = getCapabilities(item.instanceId);
    const isBittorrent = item.networkType === 'bittorrent';
    const status = getItemStatusInfo(item);
    const menuItems = [];

    // Ownership check: user can mutate if they have edit_all_downloads or own the item
    const canMutate = hasCap('edit_all_downloads') || item.ownedByMe !== false;

    // Info item (shown if onShowInfo provided and canShowInfo passes)
    const showInfo = onShowInfo && (!canShowInfo || canShowInfo(item));
    if (showInfo) {
      menuItems.push({
        label: infoLabel,
        icon: 'info',
        iconColor: 'text-blue-600 dark:text-blue-400',
        onClick: () => {
          onShowInfo(item);
          closeContextMenu?.();
        }
      });
    }

    // Category item (optional, gated on ownership)
    if (onCategoryChange && hasCap('assign_categories') && canMutate) {
      menuItems.push({
        label: 'Change Category',
        icon: 'folder',
        iconColor: 'text-orange-600 dark:text-orange-400',
        onClick: () => {
          onCategoryChange(item);
          closeContextMenu?.();
        }
      });
    }

    // Move to... (gated on ownership + edit_downloads capability)
    // Hide for clients that can't relocate active downloads (e.g., aMule temp files)
    const canMoveItem = caps.moveActiveDownloads || item.complete || (item.shared && !item.downloading);
    if (onMoveTo && canMoveItem && hasCap('edit_downloads') && canMutate && status.key !== 'moving') {
      menuItems.push({
        label: 'Move to...',
        icon: 'folderOpen',
        iconColor: 'text-teal-600 dark:text-teal-400',
        onClick: () => {
          onMoveTo(item);
          closeContextMenu?.();
        }
      });
    }

    // Pause/Resume/Start (skip for checking/queued state, gated on ownership)
    // Clients with stopReplacesPause: only show Resume/Start (no Pause - use Stop instead)
    const canShowPauseResume = actionsForBittorrentOnly ? isBittorrent : true;
    if (canShowPauseResume && onPause && onResume && hasCap('pause_resume') && canMutate && status.key !== 'checking' && status.key !== 'hashing-queued') {
      const needsResume = status.key === 'paused' || status.key === 'stopped' || status.key === 'error';
      const showPauseResumeItem = !caps.stopReplacesPause || needsResume;
      if (showPauseResumeItem) {
        menuItems.push({
          label: (status.key === 'stopped' || status.key === 'error') ? 'Start' : (status.key === 'paused' ? 'Resume' : 'Pause'),
          icon: needsResume ? 'play' : 'pause',
          iconColor: needsResume ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400',
          onClick: () => {
            if (needsResume) {
              onResume(item.hash, item.client, item.name, item.instanceId);
            } else {
              onPause(item.hash, item.client, item.name, item.instanceId);
            }
            closeContextMenu?.();
          }
        });
      }
    }

    // Stop (BitTorrent clients only, when not already stopped/errored, gated on ownership)
    if (onStop && isBittorrent && hasCap('pause_resume') && canMutate && status.key !== 'stopped' && status.key !== 'error') {
      menuItems.push({
        label: 'Stop',
        icon: 'stop',
        iconColor: 'text-gray-600 dark:text-gray-400',
        onClick: () => {
          onStop(item.hash, item.client, item.name, item.instanceId);
          closeContextMenu?.();
        }
      });
    }

    // Rename (only for clients with renameFile capability, gated on ownership)
    if (onRename && caps.renameFile && hasCap('rename_files') && canMutate) {
      menuItems.push({
        label: 'Rename',
        icon: 'edit',
        iconColor: 'text-indigo-600 dark:text-indigo-400',
        onClick: () => {
          onRename(item);
          closeContextMenu?.();
        }
      });
    }

    // Set Rating & Comment (clients with fileRatingComment capability, shared files only, gated on ownership)
    if (onSetRatingComment && caps.fileRatingComment && hasCap('set_comment') && canMutate && item.shared) {
      menuItems.push({
        label: 'Set Rating & Comment',
        icon: 'star',
        iconColor: 'text-yellow-500 dark:text-yellow-400',
        onClick: () => {
          onSetRatingComment(item);
          closeContextMenu?.();
        }
      });
    }

    // Export link (read-only action, not gated on ownership)
    if (onCopyLink) {
      const hasExportLink = isBittorrent || !!item.ed2kLink || !!getExportLink(item);
      const isCopied = copiedHash === item.hash;
      const linkLabel = getExportLinkLabel(item);

      menuItems.push({
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

    // Select (enter selection mode with this item, gated on ownership)
    if (onSelect && canMutate && (hasCap('pause_resume') || hasCap('remove_downloads') || hasCap('assign_categories'))) {
      menuItems.push({
        label: 'Select',
        icon: 'checkSquare',
        iconColor: 'text-purple-600 dark:text-purple-400',
        onClick: () => {
          onSelect(itemKey(item.instanceId, item.hash));
          closeContextMenu?.();
        }
      });
    }

    // Divider + Delete (gated at call site + ownership)
    if (onDelete && canMutate) {
      menuItems.push({ divider: true });
      menuItems.push({
        label: deleteLabel,
        icon: 'trash',
        iconColor: 'text-red-600 dark:text-red-400',
        onClick: () => {
          onDelete(item);
          closeContextMenu?.();
        }
      });
    }

    return menuItems;
  }, [
    getCapabilities,
    hasCap,
    infoLabel,
    onShowInfo,
    canShowInfo,
    onCategoryChange,
    onMoveTo,
    onPause,
    onResume,
    onStop,
    onRename,
    onSetRatingComment,
    onCopyLink,
    onDelete,
    deleteLabel,
    copiedHash,
    actionsForBittorrentOnly,
    closeContextMenu,
    onSelect
  ]);

  return { handleRowContextMenu, getContextMenuItems };
};

export default useItemContextMenu;
