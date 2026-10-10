'use strict';

/**
 * Capability-driven decisions for how a client's shared/completed items behave,
 * kept in one pure place so the WebSocket handlers and their tests agree.
 *
 * A "completed share" is a finished item the client is now seeding (shared, not
 * downloading) — the shape where category changes and deletions are handled
 * differently from an in-progress download.
 */

/**
 * Is this item a completed share for its client (seeding, not downloading)?
 * @param {Object} caps - the client's capabilities
 * @param {Object} item - the unified item
 * @returns {boolean}
 */
function isCompletedShare(caps, item) {
  return !!(caps && caps.sharedFiles && item && item.shared && !item.downloading);
}

/**
 * Changing a completed share's category: move the file on disk (true) or call
 * the client's category API (false). Only a client that declares
 * `moveSharedForCategoryChange` moves the file; others (e.g. Rucio) keep the
 * file in place and sync the category through the daemon API, so a disk move
 * behind the daemon can't break seeding.
 * @param {Object} caps
 * @param {Object} item
 * @returns {boolean}
 */
function movesSharedForCategoryChange(caps, item) {
  return isCompletedShare(caps, item) && !!caps.moveSharedForCategoryChange;
}

/**
 * Does the client delete the file itself, so aMuTorrent needn't check the path?
 * True only when the client's API deletes files (e.g. qBittorrent) or when it
 * discards a cancelled download whose file is still a partial — i.e. an
 * UNFINISHED download (`cancelDeletesFiles`). A COMPLETE item is never
 * auto-deleted by cancel: Rucio hands its on-disk path back for aMuTorrent to
 * delete, whether or not it is currently in the share list, so a complete item
 * always needs the path checked. Keying on completeness (not sharedness) is
 * deliberate — a completed download not yet in the share list must still be
 * path-checked.
 * @param {Object} caps
 * @param {boolean} isComplete - whether the item has finished downloading
 * @returns {boolean}
 */
function clientManagesDeletion(caps, isComplete) {
  if (!caps) return false;
  return !!caps.apiDeletesFiles || (!!caps.cancelDeletesFiles && !isComplete);
}

module.exports = { isCompletedShare, movesSharedForCategoryChange, clientManagesDeletion };
