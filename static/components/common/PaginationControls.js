/**
 * PaginationControls Component
 *
 * Reusable pagination controls for mobile and desktop
 */

import React from 'https://esm.sh/react@18.2.0';
import { Icon } from './index.js';
import { calculatePagination, generatePageOptions, shouldShowPagination, getNavigationBounds } from '../../utils/pagination.js';

const { createElement: h } = React;

/**
 * Unified pagination controls component
 * @param {number} page - Current page (0-based)
 * @param {function} onPageChange - Page change handler
 * @param {number} pagesCount - Total number of pages
 * @param {Object} options - Configuration options
 * @param {boolean} options.showFirstLast - Show first/last buttons (default: true)
 * @param {boolean} options.showPageSelector - Show page dropdown (default: true)
 * @param {boolean} options.mobileOnly - Only show on mobile (default: false)
 * @param {string} options.className - Additional CSS classes
 */
export const PaginationControls = ({
  page,
  onPageChange,
  pagesCount,
  options = {}
}) => {
  const {
    showFirstLast = true,
    showPageSelector = true,
    mobileOnly = false,
    className = ''
  } = options;

  if (!shouldShowPagination(pagesCount)) {
    return null;
  }

  const bounds = getNavigationBounds(page, pagesCount);
  const baseClasses = 'flex justify-center items-center gap-1.5 pt-3 flex-wrap';
  const responsiveClasses = mobileOnly ? 'md:hidden' : '';
  const combinedClasses = `${baseClasses} ${responsiveClasses} ${className}`.trim();

  return h('div', { className: combinedClasses },
    // First page button
    showFirstLast && h('button', {
      onClick: () => onPageChange(0),
      disabled: !bounds.canGoFirst,
      className: 'p-1.5 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-gray-700 dark:text-gray-300',
      title: 'First page'
    }, h(Icon, { name: 'chevronFirst', size: 16 })),
    
    // Previous page button
    h('button', {
      onClick: () => onPageChange(Math.max(0, page - 1)),
      disabled: !bounds.canGoPrev,
      className: 'p-1.5 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-gray-700 dark:text-gray-300',
      title: 'Previous page'
    }, h(Icon, { name: 'chevronLeft', size: 16 })),
    
    // Page selector dropdown
    showPageSelector && h('select', {
      value: page,
      onChange: (e) => onPageChange(parseInt(e.target.value)),
      className: 'px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100',
      title: 'Select page'
    },
      generatePageOptions(pagesCount).map(i =>
        h('option', { key: i, value: i }, `Page ${i + 1}`)
      )
    ),
    
    // Page count display
    h('span', { className: 'px-2 py-1 text-xs sm:text-sm text-gray-700 dark:text-gray-300' },
      `of ${pagesCount}`
    ),
    
    // Next page button
    h('button', {
      onClick: () => onPageChange(Math.min(pagesCount - 1, page + 1)),
      disabled: !bounds.canGoNext,
      className: 'p-1.5 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-gray-700 dark:text-gray-300',
      title: 'Next page'
    }, h(Icon, { name: 'chevronRight', size: 16 })),
    
    // Last page button
    showFirstLast && h('button', {
      onClick: () => onPageChange(pagesCount - 1),
      disabled: !bounds.canGoLast,
      className: 'p-1.5 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-gray-700 dark:text-gray-300',
      title: 'Last page'
    }, h(Icon, { name: 'chevronLast', size: 16 }))
  );
};



export default PaginationControls;