/**
 * ActiveUploadsWidget Component
 *
 * Displays active uploads with filename, speed, and category colors
 */

import React from 'https://esm.sh/react@18.2.0';
import { formatSpeed } from '../../utils/formatters.js';
import { getCategoryColorStyle } from '../../utils/colors.js';
import { useStaticData } from '../../contexts/StaticDataContext.js';
import { useClientFilter } from '../../contexts/ClientFilterContext.js';
import ClientIcon from '../common/ClientIcon.js';

const { createElement: h, useMemo } = React;

/**
 * ActiveUploadsWidget component
 * @param {array} items - Array of unified items with nested activeUploads
 * @param {number} maxItems - Maximum number of items to display
 * @param {boolean} compact - Use compact height for mobile (default: false)
 * @param {boolean} loading - Show loading placeholder (default: false)
 */
const ActiveUploadsWidget = ({ items = [], maxItems = 10, compact = false, loading = false }) => {
  const { dataCategories: categories } = useStaticData();
  const { filterByEnabledClients } = useClientFilter();

  // Filter by client type, then group by file name from unified items' nested activeUploads
  const groupedUploads = useMemo(() => {
    const groups = {};
    filterByEnabledClients(items || []).forEach(item => {
      const active = (item.activeUploads || []).filter(p => p.uploadRate > 0);
      if (active.length === 0) return;
      groups[item.name] = {
        fileName: item.name,
        totalSpeed: active.reduce((sum, p) => sum + p.uploadRate, 0),
        clientCount: active.length,
        clientType: item.client,
        category: item.category
      };
    });
    return Object.values(groups)
      .sort((a, b) => b.totalSpeed - a.totalSpeed)
      .slice(0, maxItems);
  }, [items, maxItems, filterByEnabledClients]);

  // Determine if empty (for compact mode height adjustment)
  const isEmpty = !loading && groupedUploads.length === 0;

  return h('div', {
    className: compact
      ? 'flex flex-col'
      : 'bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700 flex flex-col',
    style: { height: compact ? (isEmpty ? 'auto' : '140px') : '300px' }
  },
    h('h3', {
      className: `font-semibold text-gray-700 dark:text-gray-300 ${compact ? 'text-xs mb-1' : 'text-sm mb-2'}`
    }, 'Active Uploads'),
    h('div', {
      className: 'flex-1 overflow-y-auto space-y-2'
    },
      loading
        ? h('div', { className: 'flex items-center justify-center h-full' },
            h('div', { className: 'loader' })
          )
        : groupedUploads.length === 0
        ? h('p', {
            className: `text-gray-500 dark:text-gray-400 text-center ${compact ? 'text-xs py-1' : 'text-sm py-4'}`
          }, 'No active uploads')
        : groupedUploads.map((group, idx) => {
            // Find category by name and get color style (unified category system)
            const categoryName = group.category;
            const category = categories.find(cat => cat.name === categoryName || cat.title === categoryName);
            const isDefault = !categoryName || categoryName === 'Default';
            const categoryStyle = getCategoryColorStyle(category, isDefault);

            return h('div', {
              key: group.fileName || idx,
              className: 'p-2 rounded bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 flex items-center gap-2',
              style: categoryStyle || {}
            },
              // Client type badge
              h(ClientIcon, { clientType: group.clientType, size: 14 }),

              // Filename (truncated)
              h('div', {
                className: 'text-xs font-medium text-gray-800 dark:text-gray-200 truncate flex-1',
                title: group.fileName
              }, group.fileName),

              // Total speed with client count
              h('div', {
                className: 'text-xs text-green-600 dark:text-green-400 font-mono whitespace-nowrap'
              },
                formatSpeed(group.totalSpeed),
                group.clientCount > 1 && h('span', {
                  className: 'ml-1 text-gray-500 dark:text-gray-400'
                }, `(${group.clientCount})`)
              )
            );
          })
    )
  );
};

// Memoize to prevent unnecessary re-renders
export default React.memo(ActiveUploadsWidget);
