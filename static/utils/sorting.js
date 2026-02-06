/**
 * Sorting Utilities
 *
 * Functions for sorting data in tables and lists
 */

import { isItemPaused, isItemStopped, isItemChecking, isItemHashingQueued } from './downloadHelpers.js';

/**
 * Get effective speed value for sorting, handling paused/active/stopped/checking states
 * @param {Object} item - Download item
 * @returns {number} Effective speed value for sorting
 */
const getEffectiveSpeedForSort = (item, speedField = 'downloadSpeed') => {
  if (isItemStopped(item)) {
    return -3; // Stopped items sort lowest
  }
  if (isItemPaused(item)) {
    return -2; // Paused items sort next lowest
  }
  if (isItemChecking(item) || isItemHashingQueued(item)) {
    return -1.5; // Checking/queued items sort between paused and idle
  }
  const speed = item[speedField] || 0;
  if (speed <= 0) {
    return -1; // Active but no speed (play icon) sorts between checking and active
  }
  return speed;
};

/**
 * Sort files/items by a given property and direction
 * @param {Array} files - Array of items to sort
 * @param {string} sortBy - Property name to sort by
 * @param {string} sortDirection - 'asc' or 'desc'
 * @param {object} secondarySort - Optional secondary sort config {sortBy, sortDirection}
 * @returns {Array} Sorted array (new copy, original unchanged)
 */
export const sortFiles = (files, sortBy, sortDirection, secondarySort = null, options = {}) => {
  // Safety check: ensure files is an array
  if (!Array.isArray(files)) {
    console.error('sortFiles: files is not an array', files);
    return [];
  }

  return [...files].sort((a, b) => {
    // Special handling: keep "Default" category always first
    if (options.keepDefaultFirst) {
      const aIsDefault = (a.name || a.title) === 'Default';
      const bIsDefault = (b.name || b.title) === 'Default';
      if (aIsDefault && !bIsDefault) return -1;
      if (bIsDefault && !aIsDefault) return 1;
    }

    let result = 0;

    // Progress and counts
    if (sortBy === 'progress') result = (a.progress || 0) - (b.progress || 0);
    else if (sortBy === 'size' || sortBy === 'fileSize') result = (a.size || a.fileSize || 0) - (b.size || b.fileSize || 0);
    else if (sortBy === 'sources') result = (a.sources?.total || 0) - (b.sources?.total || 0);
    else if (sortBy === 'sourceCount') result = (a.sourceCount || 0) - (b.sourceCount || 0);
    else if (sortBy === 'fileName') result = (a.fileName || '').localeCompare(b.fileName || '');
    else if (sortBy === 'uploadSession') result = a.uploadSession - b.uploadSession;
    else if (sortBy === 'uploadTotal') result = a.uploadTotal - b.uploadTotal;
    else if (sortBy === 'downloadSpeed') result = getEffectiveSpeedForSort(a) - getEffectiveSpeedForSort(b);
    else if (sortBy === 'uploadSpeed') result = getEffectiveSpeedForSort(a, 'uploadSpeed') - getEffectiveSpeedForSort(b, 'uploadSpeed');
    else if (sortBy === 'category') {
      // Sort by category string (works for both aMule and rtorrent)
      result = (a.category || '').localeCompare(b.category || '');
    }

    // Ratio
    else if (sortBy === 'ratio') result = (a.ratio || 0) - (b.ratio || 0);

    // Upload peer fields
    else if (sortBy === 'uploadRate') result = (a.uploadRate || 0) - (b.uploadRate || 0);
    else if (sortBy === 'software') result = (a.software || '').localeCompare(b.software || '');

    // Server fields
    else if (sortBy === 'EC_TAG_SERVER_NAME') result = (a.EC_TAG_SERVER_NAME || '').localeCompare(b.EC_TAG_SERVER_NAME || '');
    else if (sortBy === 'EC_TAG_SERVER_USERS') result = (a.EC_TAG_SERVER_USERS || 0) - (b.EC_TAG_SERVER_USERS || 0);
    else if (sortBy === 'EC_TAG_SERVER_FILES') result = (a.EC_TAG_SERVER_FILES || 0) - (b.EC_TAG_SERVER_FILES || 0);
    else if (sortBy === 'EC_TAG_SERVER_PING') result = (a.EC_TAG_SERVER_PING || 0) - (b.EC_TAG_SERVER_PING || 0);

    // Timestamp fields
    else if (sortBy === 'addedAt') {
      const aTime = a.addedAt ? new Date(a.addedAt).getTime() : 0;
      const bTime = b.addedAt ? new Date(b.addedAt).getTime() : 0;
      result = aTime - bTime;
    }
    else if (sortBy === 'publishDate') {
      const aTime = a.publishDate ? new Date(a.publishDate).getTime() : 0;
      const bTime = b.publishDate ? new Date(b.publishDate).getTime() : 0;
      result = aTime - bTime;
    }

    // ETA field - null (complete/stalled) always sorts last regardless of direction
    // Uses pre-calculated eta field from server (in seconds)
    else if (sortBy === 'eta') {
      const aETA = a.eta;
      const bETA = b.eta;
      // Both null = equal (both complete or stalled)
      if (aETA === null && bETA === null) result = 0;
      // null always last: if a is null, a comes after b
      else if (aETA === null) return 1;
      else if (bETA === null) return -1;
      // Normal numeric comparison
      else result = aETA - bETA;
    }

    // Category fields
    else if (sortBy === 'id') result = (a.id || 0) - (b.id || 0);
    else if (sortBy === 'title') result = (a.title || '').localeCompare(b.title || '');
    else if (sortBy === 'path') result = (a.path || '').localeCompare(b.path || '');
    else if (sortBy === 'comment') result = (a.comment || '').localeCompare(b.comment || '');
    else if (sortBy === 'priority') result = (a.priority || 0) - (b.priority || 0);

    // Generic fields
    else if (sortBy === '_value') result = (a._value || '').localeCompare(b._value || '');
    else result = (a.name || '').localeCompare(b.name || '');

    // Apply primary sort direction
    const primaryResult = sortDirection === 'asc' ? result : -result;

    // If primary sort values are equal, apply secondary sort
    if (result === 0 && secondarySort && secondarySort.sortBy && sortBy !== secondarySort.sortBy) {
      let secondaryResult = 0;
      const secSortBy = secondarySort.sortBy;

      // Apply same sorting logic for secondary field
      if (secSortBy === 'uploadTotal') secondaryResult = (a.uploadTotal || 0) - (b.uploadTotal || 0);
      else if (secSortBy === 'size') secondaryResult = (a.size || 0) - (b.size || 0);
      else if (secSortBy === 'uploadSpeed') secondaryResult = (a.uploadSpeed || 0) - (b.uploadSpeed || 0);
      else if (secSortBy === 'downloadSpeed') secondaryResult = getEffectiveSpeedForSort(a) - getEffectiveSpeedForSort(b);
      else if (secSortBy === 'name') secondaryResult = (a.name || '').localeCompare(b.name || '');
      else if (secSortBy === 'fileName') secondaryResult = (a.fileName || '').localeCompare(b.fileName || '');
      else if (secSortBy === 'addedAt') {
        const aTime = a.addedAt ? new Date(a.addedAt).getTime() : 0;
        const bTime = b.addedAt ? new Date(b.addedAt).getTime() : 0;
        secondaryResult = aTime - bTime;
      }
      // Generic fallback: try numeric, then string comparison
      else {
        const aVal = a[secSortBy];
        const bVal = b[secSortBy];
        if (typeof aVal === 'string' || typeof bVal === 'string') {
          secondaryResult = (aVal || '').localeCompare(bVal || '');
        } else {
          secondaryResult = (aVal || 0) - (bVal || 0);
        }
      }

      return secondarySort.sortDirection === 'asc' ? secondaryResult : -secondaryResult;
    }

    return primaryResult;
  });
};

/**
 * Get the next sort direction when clicking a column header
 * @param {string} currentColumn - Currently sorted column
 * @param {string} newColumn - Column being clicked
 * @param {string} currentDirection - Current sort direction
 * @returns {string} Next sort direction ('asc' or 'desc')
 */
export const getNextSortDirection = (currentColumn, newColumn, currentDirection) => {
  // If clicking a different column, default to ascending
  if (currentColumn !== newColumn) {
    return 'asc';
  }
  // If clicking the same column, toggle direction
  return currentDirection === 'asc' ? 'desc' : 'asc';
};

/**
 * Create initial sort configuration for a view
 * @param {string} defaultSortBy - Default property to sort by
 * @param {string} defaultDirection - Default sort direction
 * @returns {object} Sort config object
 */
export const createSortConfig = (defaultSortBy, defaultDirection = 'asc') => ({
  sortBy: defaultSortBy,
  sortDirection: defaultDirection
});
