/**
 * MobileFilterSheet Component
 *
 * Bottom sheet modal for advanced filtering on mobile.
 * Uses Portal for body-level rendering, slides up from bottom.
 * Has apply/cancel pattern with pending state.
 */

import React from 'https://esm.sh/react@18.2.0';
import Icon from './Icon.js';
import Portal from './Portal.js';
import { Button } from './FormControls.js';
import FilterCheckboxGroup from './FilterCheckboxGroup.js';

const { createElement: h, useEffect } = React;

/**
 * MobileFilterSheet component
 * @param {boolean} show - Whether the sheet is visible
 * @param {function} onClose - Close handler (cancel)
 * @param {function} onApply - Apply handler (commits filters)
 * @param {function} onClear - Clear all filters handler
 * @param {string} title - Sheet title
 * @param {Array} filterGroups - Array of filter group configs: { title, options, selectedValues, onToggle }
 *                               Falsy items are filtered out automatically
 * @param {ReactNode} children - Optional custom content (overrides filterGroups if provided)
 */
const MobileFilterSheet = ({ show, onClose, onApply, onClear, title = 'Filters', filterGroups = [], children }) => {
  // Prevent body scroll when sheet is open
  useEffect(() => {
    if (show) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [show]);

  if (!show) return null;

  return h(Portal, null,
    // Backdrop
    h('div', {
      className: 'fixed inset-0 bg-black/50 z-[60] transition-opacity',
      onClick: onClose
    }),
    // Sheet
    h('div', {
      className: 'fixed bottom-0 left-0 right-0 z-[61] bg-white dark:bg-gray-800 rounded-t-2xl shadow-xl max-h-[80vh] flex flex-col animate-slideUp',
      onClick: (e) => e.stopPropagation()
    },
      // Header
      h('div', { className: 'flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700' },
        h('h3', { className: 'text-base font-semibold text-gray-900 dark:text-gray-100' }, title),
        h('button', {
          onClick: onClose,
          className: 'p-1 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
        },
          h(Icon, { name: 'x', size: 20 })
        )
      ),
      // Content
      h('div', { className: 'flex-1 overflow-y-auto px-4 py-3' },
        // Use children if provided, otherwise render filterGroups
        children || (filterGroups.filter(Boolean).map((group, idx) =>
          h(FilterCheckboxGroup, {
            key: group.title || idx,
            title: group.title,
            options: group.options,
            selectedValues: group.selectedValues,
            onToggle: group.onToggle,
            className: idx > 0 ? 'mt-4' : ''
          })
        ))
      ),
      // Footer
      h('div', { className: 'flex items-center gap-2 px-4 pt-3 pb-5 border-t border-gray-200 dark:border-gray-700' },
        h(Button, {
          variant: 'secondary',
          onClick: onClear,
          className: 'flex-1'
        }, 'Clear'),
        h(Button, {
          variant: 'success',
          onClick: onApply,
          className: 'flex-1'
        }, 'Apply')
      )
    )
  );
};

export default MobileFilterSheet;
