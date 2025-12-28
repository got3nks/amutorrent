/**
 * Pagination Utilities
 *
 * Common pagination calculations and logic
 */

/**
 * Calculate pagination metadata
 * @param {Array} data - Data array to paginate
 * @param {number} page - Current page (0-based)
 * @param {number} pageSize - Items per page
 * @returns {object} { pagesCount, start, paginatedData }
 */
export const calculatePagination = (data, page, pageSize) => {
  if (!Array.isArray(data)) {
    return {
      pagesCount: 0,
      start: 0,
      paginatedData: []
    };
  }

  const pagesCount = Math.ceil(data.length / pageSize);
  const start = page * pageSize;
  const paginatedData = data.slice(start, start + pageSize);

  return {
    pagesCount,
    start,
    paginatedData
  };
};

/**
 * Generate page options for dropdown
 * @param {number} pagesCount - Total number of pages
 * @returns {Array} Array of page option elements
 */
export const generatePageOptions = (pagesCount) => {
  return Array.from({ length: pagesCount }, (_, i) => i);
};

/**
 * Check if pagination controls should be shown
 * @param {number} pagesCount - Total number of pages
 * @returns {boolean}
 */
export const shouldShowPagination = (pagesCount) => {
  return pagesCount > 1;
};

/**
 * Get safe page bounds for navigation
 * @param {number} currentPage - Current page
 * @param {number} pagesCount - Total pages
 * @returns {object} { canGoFirst, canGoPrev, canGoNext, canGoLast }
 */
export const getNavigationBounds = (currentPage, pagesCount) => {
  return {
    canGoFirst: currentPage > 0,
    canGoPrev: currentPage > 0,
    canGoNext: currentPage < pagesCount - 1,
    canGoLast: currentPage < pagesCount - 1
  };
};