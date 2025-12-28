/**
 * Sorting Utilities
 *
 * Functions for sorting data in tables and lists
 */

/**
 * Sort files/items by a given property and direction
 * @param {Array} files - Array of items to sort
 * @param {string} sortBy - Property name to sort by
 * @param {string} sortDirection - 'asc' or 'desc'
 * @param {boolean} useFileNameAsSecondary - If true, use fileName as secondary sort when primary values are equal
 * @returns {Array} Sorted array (new copy, original unchanged)
 */
export const sortFiles = (files, sortBy, sortDirection, useFileNameAsSecondary = false) => {
  // Safety check: ensure files is an array
  if (!Array.isArray(files)) {
    console.error('sortFiles: files is not an array', files);
    return [];
  }

  return [...files].sort((a, b) => {
    let result = 0;

    // Progress and counts
    if (sortBy === 'progress') result = (a.progress || 0) - (b.progress || 0);
    else if (sortBy === 'fileSize') result = a.fileSize - b.fileSize;
    else if (sortBy === 'sourceCount') result = (a.sourceCount || 0) - (b.sourceCount || 0);
    else if (sortBy === 'transferred') result = a.transferred - b.transferred;
    else if (sortBy === 'transferredTotal') result = a.transferredTotal - b.transferredTotal;
    else if (sortBy === 'speed') result = (a.speed || 0) - (b.speed || 0);
    else if (sortBy === 'category') result = (a.category || 0) - (b.category || 0);

    // Upload client fields
    else if (sortBy === 'EC_TAG_CLIENT_UP_SPEED') result = (a.EC_TAG_CLIENT_UP_SPEED || 0) - (b.EC_TAG_CLIENT_UP_SPEED || 0);
    else if (sortBy === 'EC_TAG_CLIENT_UPLOAD_SESSION') result = (a.EC_TAG_CLIENT_UPLOAD_SESSION || 0) - (b.EC_TAG_CLIENT_UPLOAD_SESSION || 0);
    else if (sortBy === 'EC_TAG_CLIENT_UPLOAD_TOTAL') result = (a.EC_TAG_CLIENT_UPLOAD_TOTAL || 0) - (b.EC_TAG_CLIENT_UPLOAD_TOTAL || 0);
    else if (sortBy === 'EC_TAG_CLIENT_NAME') result = (a.EC_TAG_CLIENT_NAME || '').localeCompare(b.EC_TAG_CLIENT_NAME || '');
    else if (sortBy === 'EC_TAG_PARTFILE_NAME') result = (a.EC_TAG_PARTFILE_NAME || '').localeCompare(b.EC_TAG_PARTFILE_NAME || '');

    // Server fields
    else if (sortBy === 'EC_TAG_SERVER_NAME') result = (a.EC_TAG_SERVER_NAME || '').localeCompare(b.EC_TAG_SERVER_NAME || '');
    else if (sortBy === 'EC_TAG_SERVER_USERS') result = (a.EC_TAG_SERVER_USERS || 0) - (b.EC_TAG_SERVER_USERS || 0);
    else if (sortBy === 'EC_TAG_SERVER_FILES') result = (a.EC_TAG_SERVER_FILES || 0) - (b.EC_TAG_SERVER_FILES || 0);
    else if (sortBy === 'EC_TAG_SERVER_PING') result = (a.EC_TAG_SERVER_PING || 0) - (b.EC_TAG_SERVER_PING || 0);

    // Generic fields
    else if (sortBy === '_value') result = (a._value || '').localeCompare(b._value || '');
    else result = (a.fileName || '').localeCompare(b.fileName || '');

    // Apply primary sort direction
    const primaryResult = sortDirection === 'asc' ? result : -result;

    // If primary sort values are equal and useFileNameAsSecondary is true, sort by fileName (always ascending)
    if (result === 0 && useFileNameAsSecondary && sortBy !== 'fileName') {
      return (a.fileName || '').localeCompare(b.fileName || '');
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
