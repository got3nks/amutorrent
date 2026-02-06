/**
 * PaginationControls Component
 *
 * Reusable pagination controls for mobile and desktop
 */

import React from 'https://esm.sh/react@18.2.0';
import { Icon } from './index.js';
import { Select } from './FormControls.js';
import { calculatePagination, generatePageOptions, shouldShowPagination, getNavigationBounds } from '../../utils/pagination.js';
import { PAGE_SIZE_DESKTOP, PAGE_SIZE_MOBILE, PAGE_SIZE_OPTIONS } from '../../utils/index.js';

const { createElement: h, Fragment } = React;

// Default page sizes that don't require showing the selector
const DEFAULT_PAGE_SIZES = [PAGE_SIZE_DESKTOP, PAGE_SIZE_MOBILE];

/**
 * Unified pagination controls component
 * @param {number} page - Current page (0-based)
 * @param {function} onPageChange - Page change handler
 * @param {number} pagesCount - Total number of pages
 * @param {number} pageSize - Current items per page (optional, for page size selector)
 * @param {function} onPageSizeChange - Page size change handler (optional)
 * @param {Object} options - Configuration options
 * @param {boolean} options.showFirstLast - Show first/last buttons (default: true)
 * @param {boolean} options.showPageSelector - Show page dropdown (default: true)
 * @param {boolean} options.showPageSizeSelector - Show items per page dropdown (default: false, true if onPageSizeChange provided)
 * @param {Array<number>} options.pageSizeOptions - Available page size options (default: [10, 20, 50, 100])
 * @param {boolean} options.mobileOnly - Only show on mobile (default: false)
 * @param {string} options.breakpoint - Breakpoint for mobileOnly (md, lg, xl) (default: md)
 * @param {string} options.className - Additional CSS classes
 */
export const PaginationControls = ({
  page,
  onPageChange,
  pagesCount,
  pageSize,
  onPageSizeChange,
  options = {}
}) => {
  const {
    showFirstLast = true,
    showPageSelector = true,
    showPageSizeSelector = !!onPageSizeChange,
    pageSizeOptions = PAGE_SIZE_OPTIONS,
    mobileOnly = false,
    breakpoint = 'md',
    className = ''
  } = options;

  // Check if user has a custom (non-default) page size
  const hasCustomPageSize = showPageSizeSelector && pageSize && !DEFAULT_PAGE_SIZES.includes(pageSize);

  // Show controls when: pagination is needed OR user has custom page size
  const needsPagination = shouldShowPagination(pagesCount);
  if (!needsPagination && !hasCustomPageSize) {
    return null;
  }

  const bounds = getNavigationBounds(page, pagesCount);
  const baseClasses = 'flex justify-center items-center gap-1.5 pt-3 flex-wrap';
  const responsiveClasses = mobileOnly ? `${breakpoint}:hidden` : '';
  const combinedClasses = `${baseClasses} ${responsiveClasses} ${className}`.trim();

  const handlePageSizeChange = (e) => {
    const newSize = parseInt(e.target.value);
    if (onPageSizeChange) {
      onPageSizeChange(newSize);
      // Reset to first page when changing page size
      onPageChange(0);
    }
  };

  return h('div', { className: combinedClasses },
    // Page size selector (items per page)
    showPageSizeSelector && h(Select, {
      value: pageSize,
      onChange: handlePageSizeChange,
      options: pageSizeOptions.map(size => ({ value: size, label: `${size} / page` })),
      title: 'Items per page',
      className: 'h-8 sm:h-9 !text-xs'
    }),

    // Separator between page size and page navigation (only if both are shown)
    showPageSizeSelector && needsPagination && h('span', { className: 'text-gray-400 dark:text-gray-500 px-1' }, '|'),

    // Page navigation buttons (only when pagination is needed)
    needsPagination && h(Fragment, null,
      // First page button
      showFirstLast && h('button', {
        onClick: () => onPageChange(0),
        disabled: !bounds.canGoFirst,
        className: 'p-1 sm:p-1.5 rounded-lg bg-gray-200 dark:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-gray-700 dark:text-gray-300',
        title: 'First page'
      }, h(Icon, { name: 'chevronFirst', size: 16 })),

      // Previous page button
      h('button', {
        onClick: () => onPageChange(Math.max(0, page - 1)),
        disabled: !bounds.canGoPrev,
        className: 'p-1 sm:p-1.5 rounded-lg bg-gray-200 dark:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-gray-700 dark:text-gray-300',
        title: 'Previous page'
      }, h(Icon, { name: 'chevronLeft', size: 16 })),

      // Page selector dropdown
      showPageSelector && h(Select, {
        value: page,
        onChange: (e) => onPageChange(parseInt(e.target.value)),
        options: generatePageOptions(pagesCount).map(i => ({ value: i, label: `Page ${i + 1}` })),
        title: 'Select page',
        className: 'h-8 sm:h-9 !text-xs'
      }),

      // Page count display
      h('span', { className: 'px-2 py-1 text-xs sm:text-sm text-gray-700 dark:text-gray-300' },
        `of ${pagesCount}`
      ),

      // Next page button
      h('button', {
        onClick: () => onPageChange(Math.min(pagesCount - 1, page + 1)),
        disabled: !bounds.canGoNext,
        className: 'p-1 sm:p-1.5 rounded-lg bg-gray-200 dark:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-gray-700 dark:text-gray-300',
        title: 'Next page'
      }, h(Icon, { name: 'chevronRight', size: 16 })),

      // Last page button
      showFirstLast && h('button', {
        onClick: () => onPageChange(pagesCount - 1),
        disabled: !bounds.canGoLast,
        className: 'p-1 sm:p-1.5 rounded-lg bg-gray-200 dark:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-gray-700 dark:text-gray-300',
        title: 'Last page'
      }, h(Icon, { name: 'chevronLast', size: 16 }))
    )
  );
};



export default PaginationControls;