/**
 * usePagination Hook
 *
 * Manages pagination state and provides helper functions
 */

import { useState, useMemo, useCallback, useEffect } from 'https://esm.sh/react@18.2.0';
import { PAGE_SIZE_DESKTOP, PAGE_SIZE_MOBILE, BREAKPOINT_MD } from '../utils/index.js';

/**
 * Custom hook for pagination
 * @returns {object} { page, setPage, pageSize, getPaginatedData, resetPage }
 */
export const usePagination = () => {
  const [page, setPage] = useState(0);

  // Dynamic page size based on screen width
  const [pageSize, setPageSize] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= BREAKPOINT_MD ? PAGE_SIZE_DESKTOP : PAGE_SIZE_MOBILE;
    }
    return PAGE_SIZE_MOBILE;
  });

  // Update page size on window resize
  useEffect(() => {
    const handleResize = () => {
      const newPageSize = window.innerWidth >= BREAKPOINT_MD ? PAGE_SIZE_DESKTOP : PAGE_SIZE_MOBILE;
      setPageSize(newPageSize);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  /**
   * Get paginated data for current page
   * @param {Array} data - Full dataset
   * @returns {Array} Paginated subset
   */
  const getPaginatedData = useCallback((data) => {
    if (!Array.isArray(data)) return [];
    const start = page * pageSize;
    const end = start + pageSize;
    return data.slice(start, end);
  }, [page, pageSize]);

  /**
   * Reset to first page
   */
  const resetPage = useCallback(() => {
    setPage(0);
  }, []);

  /**
   * Get total number of pages for dataset
   * @param {Array} data - Full dataset
   * @returns {number} Total pages
   */
  const getTotalPages = useCallback((data) => {
    if (!Array.isArray(data) || data.length === 0) return 0;
    return Math.ceil(data.length / pageSize);
  }, [pageSize]);

  return {
    page,
    setPage,
    pageSize,
    getPaginatedData,
    resetPage,
    getTotalPages
  };
};
