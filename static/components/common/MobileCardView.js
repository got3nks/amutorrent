/**
 * MobileCardView Component
 *
 * Reusable mobile card view for paginated data
 */

import React from 'https://esm.sh/react@18.2.0';

const { createElement: h } = React;

/**
 * Mobile card view component
 * @param {Array} data - Data to display
 * @param {Array} columns - Column definitions
 * @param {function} [actions] - Actions renderer function (receives item)
 * @param {function} [getItemKey] - Function to get unique key for item
 * @param {function} [getItemTitle] - Function to get title for card (default: first column value)
 * @param {Object} [options] - Additional options
 * @param {boolean} [options.excludeTitleFromDetails=true] - Exclude title column from details
 * @param {function} [options.customRender] - Custom card render function
 */
export const MobileCardView = ({
  data,
  columns,
  actions,
  getItemKey,
  getItemTitle,
  options = {}
}) => {
  const {
    excludeTitleFromDetails = true,
    customRender = null
  } = options;

  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  // Default key function
  const defaultGetKey = (item, idx) => 
    item.fileHash || item.EC_TAG_CLIENT_HASH || item.EC_TAG_SERVER_NAME || item._value || idx;
  
  const keyFn = getItemKey || defaultGetKey;

  // Default title function - use first column or common name fields
  const defaultGetTitle = (item) => 
    item.fileName || 
    item.EC_TAG_PARTFILE_NAME || 
    item.EC_TAG_SERVER_NAME || 
    columns[0]?.render?.(item) || 
    item[columns[0]?.key] || 
    'N/A';
  
  const titleFn = getItemTitle || defaultGetTitle;

  // Custom render override
  if (customRender) {
    return h('div', { className: 'block md:hidden space-y-2' },
      data.map((item, idx) => 
        h('div', { key: keyFn(item, idx) },
          customRender(item, idx)
        )
      )
    );
  }

  // Default card render
  return h('div', { className: 'block md:hidden space-y-2' },
    data.map((item, idx) => {
      const title = titleFn(item);
      const titleColumnKeys = ['fileName', 'EC_TAG_PARTFILE_NAME', 'EC_TAG_SERVER_NAME'];

      return h('div', {
        key: keyFn(item, idx),
        className: `p-2 sm:p-3 rounded-lg ${idx % 2 === 0 ? 'bg-gray-50 dark:bg-gray-700/50' : 'bg-white dark:bg-gray-800/50'} border border-gray-200 dark:border-gray-700`
      },
        // Card title
        h('div', {
          className: 'font-medium text-xs sm:text-sm mb-1.5 break-all text-gray-900 dark:text-gray-100'
        }, title),
        
        // Card details
        h('div', { className: 'space-y-1 text-xs' },
          columns.map((col, cidx) => {
            // Skip title column if configured
            if (excludeTitleFromDetails && titleColumnKeys.includes(col.key)) {
              return null;
            }
            
            return h('div', {
              key: cidx,
              className: 'text-gray-700 dark:text-gray-300'
            },
              h('span', { className: 'font-medium text-gray-600 dark:text-gray-400' }, col.label + ': '),
              h('span', { className: 'text-gray-900 dark:text-gray-100' },
                col.render ? col.render(item) : item[col.key]
              )
            );
          })
        ),
        
        // Actions
        actions && h('div', { className: 'flex gap-1.5 mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 justify-center' },
          actions(item)
        )
      );
    })
  );
};

export default MobileCardView;