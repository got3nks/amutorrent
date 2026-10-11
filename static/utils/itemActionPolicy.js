/**
 * Capability-driven decisions for the per-item Move and Delete UI, kept in one
 * pure place so the hooks that gate those actions and their tests agree (the
 * server mirrors the same rules in lib/sharedFilePolicy.js). Every function is
 * pure: given a client's capabilities and a unified item, it returns a decision
 * with no React or DOM dependency, so importStatic can test the real code the
 * hooks run instead of a copy of it.
 */

/**
 * Can this client relocate a file on disk at all? False for a client that
 * declares `noFileMove` (Rucio: no move API, and moving a file behind the daemon
 * would break seeding). The atomic guard shared by every Move entry point — the
 * context menu, the standalone batch move, and the category-change move.
 * @param {Object} caps - the client's capabilities
 * @returns {boolean}
 */
export function clientCanMoveFiles(caps) {
  return !!caps && !caps.noFileMove;
}

/**
 * Should the context menu offer "Move to…" for this item? The client must be
 * able to move files at all, and then the item must be in a movable state: an
 * active download needs `moveActiveDownloads`, while a completed or shared
 * (seeding, not downloading) file can always be relocated.
 * @param {Object} caps - the client's capabilities
 * @param {Object} item - the unified item
 * @returns {boolean}
 */
export function canMoveItem(caps, item) {
  if (!clientCanMoveFiles(caps) || !item) return false;
  return !!(caps.moveActiveDownloads || item.complete || (item.shared && !item.downloading));
}

/**
 * Classify how deleting an item touches the disk, matching the server's delete
 * decision (lib/sharedFilePolicy.js):
 *   - 'shared'   — a shared file on a client that can't just unshare it
 *                  (`removeSharedMustDeleteFiles`): always deleted from disk.
 *   - 'autoClean'— an UNFINISHED download on a client that discards a cancelled
 *                  partial (`cancelDeletesFiles`): the file goes automatically.
 *   - 'explicit' — everything else (a completed download, Rucio included, or a
 *                  client with no auto-clean): needs the explicit "delete files"
 *                  option and a permission check.
 * Keyed on completeness, not sharedness, so a finished download not yet in the
 * share list is still classified 'explicit' rather than auto-cleaned.
 * @param {Object} caps - the client's capabilities
 * @param {Object} item - the unified item
 * @returns {'shared'|'autoClean'|'explicit'}
 */
export function classifyDeleteItem(caps, item) {
  // A finished aMule file is shared the moment it completes, even before the
  // shared list catches up (lib/sharedFilePolicy.js deletesAsShare).
  const finishedShare = !!(caps?.seedsCompletedFiles && item?.complete);
  if (caps?.removeSharedMustDeleteFiles && (item?.shared || finishedShare) && !item?.downloading) return 'shared';
  if (caps?.cancelDeletesFiles && !item?.complete) return 'autoClean';
  return 'explicit';
}

export default { clientCanMoveFiles, canMoveItem, classifyDeleteItem };
