/**
 * useColumnConfig Hook
 *
 * Manages column visibility and order with localStorage persistence.
 * Also manages modal open/close state and returns ready-to-render modal element.
 *
 * @param {string} viewKey - Unique identifier for the view
 * @param {Array} defaultColumns - Original column definitions
 * @returns {Object}
 */

import React, { useState, useMemo, useCallback } from 'https://esm.sh/react@18.2.0';
import ColumnConfigModal from '../components/common/ColumnConfigModal.js';
import { getSortableColumns } from '../utils/tableHelpers.js';

const { createElement: h } = React;

const STORAGE_KEY_PREFIX = 'tableColumns_';

/**
 * Get secondary sort config from localStorage (or return default)
 * This can be called before the full useColumnConfig hook
 * @param {string} viewKey - View identifier
 * @param {Object} defaultSecondarySort - Default to use if not saved
 * @returns {Object|null} Secondary sort config { sortBy, sortDirection }
 */
export const getSecondarySortConfig = (viewKey, defaultSecondarySort = null) => {
  try {
    const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}${viewKey}`);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed?.secondarySort) {
        return parsed.secondarySort;
      }
    }
  } catch (e) {
    // Ignore errors
  }
  return defaultSecondarySort;
};

/**
 * Load config from localStorage
 */
const loadConfig = (viewKey) => {
  try {
    const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}${viewKey}`);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Validate structure
      if (parsed && Array.isArray(parsed.order) && Array.isArray(parsed.hidden)) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn(`Failed to load column config for ${viewKey}:`, e);
  }
  return null;
};

/**
 * Save config to localStorage
 */
const saveConfig = (viewKey, config) => {
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${viewKey}`, JSON.stringify(config));
  } catch (e) {
    console.warn(`Failed to save column config for ${viewKey}:`, e);
  }
};

/**
 * Remove config from localStorage
 */
const removeConfig = (viewKey) => {
  try {
    localStorage.removeItem(`${STORAGE_KEY_PREFIX}${viewKey}`);
  } catch (e) {
    console.warn(`Failed to remove column config for ${viewKey}:`, e);
  }
};

/**
 * useColumnConfig Hook
 *
 * @param {string} viewKey - Unique identifier for the view (e.g., 'downloads', 'shared')
 * @param {Array} columns - Original column definitions array (can be empty initially)
 * @param {Object} options - Optional configuration
 * @param {Array} options.defaultHidden - Array of column keys to hide by default (when no saved config)
 * @param {Object} options.defaultSecondarySort - Default secondary sort { sortBy, sortDirection }
 * @param {Object} options.defaultPrimarySort - Default primary sort { sortBy, sortDirection } for reset
 * @param {function} options.onSortChange - Sort change handler (sortBy, sortDirection) for reset
 * @returns {Object} Column configuration state and handlers
 */
export const useColumnConfig = (viewKey, columns = [], { defaultHidden = [], defaultSecondarySort = null, defaultPrimarySort = null, onSortChange = null } = {}) => {
  // Modal visibility state
  const [showConfig, setShowConfig] = useState(false);

  // Load initial config from localStorage (only once)
  const [savedConfig, setSavedConfig] = useState(() => loadConfig(viewKey));

  // Get secondary sort config (saved or default)
  const secondarySort = useMemo(() => {
    return savedConfig?.secondarySort ?? defaultSecondarySort;
  }, [savedConfig, defaultSecondarySort]);

  // Compute allColumns for modal display (with visibility status)
  const allColumns = useMemo(() => {
    const config = savedConfig;
    // Use saved hidden columns if available, otherwise use defaultHidden
    const hiddenSet = new Set(config?.hidden ?? defaultHidden);

    // If we have a saved order, use it but also handle new/removed columns
    if (config?.order && config.order.length > 0) {
      const orderedColumns = [];
      const seenKeys = new Set();

      // First, add columns in saved order (if they still exist)
      for (const key of config.order) {
        const col = columns.find(c => c.key === key);
        if (col) {
          orderedColumns.push({
            key: col.key,
            label: col.label,
            visible: !hiddenSet.has(col.key)
          });
          seenKeys.add(col.key);
        }
      }

      // Then append any new columns that weren't in the saved order
      for (const col of columns) {
        if (!seenKeys.has(col.key)) {
          orderedColumns.push({
            key: col.key,
            label: col.label,
            visible: true // New columns are visible by default
          });
        }
      }

      return orderedColumns;
    }

    // No saved order - use default column order with defaultHidden applied
    return columns.map(col => ({
      key: col.key,
      label: col.label,
      visible: !hiddenSet.has(col.key)
    }));
  }, [columns, savedConfig, defaultHidden]);

  // Compute visibleColumns for table rendering (filtered and ordered)
  const visibleColumns = useMemo(() => {
    const config = savedConfig;
    // Use saved hidden columns if available, otherwise use defaultHidden
    const hiddenSet = new Set(config?.hidden ?? defaultHidden);

    // If we have a saved order, reorder the columns
    if (config?.order && config.order.length > 0) {
      const columnMap = new Map(columns.map(col => [col.key, col]));
      const orderedVisible = [];
      const seenKeys = new Set();

      // First, add columns in saved order (if visible and still exist)
      for (const key of config.order) {
        if (!hiddenSet.has(key) && columnMap.has(key)) {
          orderedVisible.push(columnMap.get(key));
          seenKeys.add(key);
        }
      }

      // Then append any new columns not in saved order (visible by default)
      for (const col of columns) {
        if (!seenKeys.has(col.key) && !hiddenSet.has(col.key)) {
          orderedVisible.push(col);
        }
      }

      return orderedVisible;
    }

    // No saved order - just filter out hidden columns (including defaultHidden)
    return columns.filter(col => !hiddenSet.has(col.key));
  }, [columns, savedConfig, defaultHidden]);

  // Update config handler - called when user saves from modal
  const updateConfig = useCallback((newConfig) => {
    // Validate: at least one column must be visible
    const visibleCount = newConfig.order.filter(key => !newConfig.hidden.includes(key)).length;
    if (visibleCount === 0) {
      console.warn('Cannot hide all columns');
      return;
    }

    setSavedConfig(newConfig);
    saveConfig(viewKey, newConfig);
    setShowConfig(false);
  }, [viewKey]);

  // Reset to defaults handler (columns, secondary sort, and optionally primary sort)
  const resetConfig = useCallback(() => {
    setSavedConfig(null);
    removeConfig(viewKey);
    // Also reset primary sort if handler provided
    if (onSortChange && defaultPrimarySort) {
      onSortChange(defaultPrimarySort.sortBy, defaultPrimarySort.sortDirection);
    }
    setShowConfig(false);
  }, [viewKey, onSortChange, defaultPrimarySort]);

  // Compute sortable columns from the original columns
  const sortableColumns = useMemo(() => getSortableColumns(columns), [columns]);

  // Pre-rendered modal element
  const ColumnConfigElement = useMemo(() => {
    return h(ColumnConfigModal, {
      show: showConfig,
      onClose: () => setShowConfig(false),
      columns: allColumns,
      onSave: updateConfig,
      onReset: resetConfig,
      secondarySort,
      defaultSecondarySort,
      sortableColumns
    });
  }, [showConfig, allColumns, updateConfig, resetConfig, secondarySort, defaultSecondarySort, sortableColumns]);

  return {
    // Columns for table rendering (filtered and ordered)
    visibleColumns,
    // Secondary sort configuration
    secondarySort,
    // Modal controls
    showConfig,
    setShowConfig,
    // Pre-rendered modal element
    ColumnConfigElement
  };
};

export default useColumnConfig;
