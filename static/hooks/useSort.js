/**
 * useSort Hook
 *
 * Manages sorting state for tables and lists
 */

import { useState, useMemo, useCallback } from 'https://esm.sh/react@18.2.0';
import { sortFiles } from '../utils/index.js';

/**
 * Custom hook for sorting data
 * @param {object} initialConfig - Initial sort configuration by view
 * @returns {object} { sortConfig, setSortConfig, getSortForView, updateSort, sortData }
 */
export const useSort = (initialConfig = {}) => {
  const [sortConfig, setSortConfig] = useState(initialConfig);

  /**
   * Get sort configuration for a specific view
   * @param {string} view - View name
   * @returns {object} { sortBy, sortDirection }
   */
  const getSortForView = useCallback((view) => {
    return sortConfig[view] || { sortBy: 'fileName', sortDirection: 'asc' };
  }, [sortConfig]);

  /**
   * Update sort configuration for a view
   * @param {string} view - View name
   * @param {string} sortBy - Property to sort by
   * @param {string} sortDirection - Sort direction ('asc' or 'desc')
   */
  const updateSort = useCallback((view, sortBy, sortDirection) => {
    setSortConfig(prev => ({
      ...prev,
      [view]: { sortBy, sortDirection }
    }));
  }, []);

  /**
   * Sort data using current configuration for a view
   * @param {Array} data - Data to sort
   * @param {string} view - View name to get sort config from
   * @returns {Array} Sorted data
   */
  const sortData = useCallback((data, view) => {
    const { sortBy, sortDirection } = getSortForView(view);
    return sortFiles(data, sortBy, sortDirection);
  }, [getSortForView]);

  return {
    sortConfig,
    setSortConfig,
    getSortForView,
    updateSort,
    sortData
  };
};
