/**
 * SelectionModeFooter Component
 *
 * Fixed footer for selection mode in file list views.
 * Uses Portal for body-level rendering with fixed positioning.
 * Shows selection count, select/clear buttons, action buttons, and Gmail-style banner.
 */

import React from 'https://esm.sh/react@18.2.0';
import Portal from './Portal.js';
import Icon from './Icon.js';

const { createElement: h, useRef, useEffect, useCallback } = React;

/**
 * Selection mode footer component (Portal-based, fixed position)
 * @param {Object} props
 * @param {number} props.selectedCount - Number of selected items
 * @param {boolean} props.allItemsSelected - Whether all items are selected
 * @param {boolean} props.shownFullySelected - Whether all shown items are fully selected
 * @param {boolean} props.hasMoreToLoad - Whether there are more items to load
 * @param {number} props.shownCount - Number of items currently shown
 * @param {number} props.totalCount - Total number of items (including not yet loaded)
 * @param {function} props.onSelectShown - Handler for "Select all shown" button
 * @param {function} props.onSelectAll - Handler for "Select all X items" link
 * @param {function} props.onClearAll - Handler for "Clear all" button
 * @param {function} props.onExit - Handler for exiting selection mode
 * @param {function} props.onHeightChange - Callback when footer height changes (height) => void
 * @param {React.ReactNode} props.children - Action buttons to render
 */
const SelectionModeFooter = ({
  selectedCount,
  allItemsSelected,
  shownFullySelected,
  hasMoreToLoad,
  shownCount,
  totalCount,
  onSelectShown,
  onSelectAll,
  onClearAll,
  onExit,
  onHeightChange,
  children
}) => {
  const contentRef = useRef(null);
  const observerRef = useRef(null);

  // Callback ref - fires when element is actually mounted in the DOM (works with Portal)
  const setContentRef = useCallback((element) => {
    // Cleanup previous observer if any
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }

    contentRef.current = element;

    if (!element || !onHeightChange) return;

    // Create new ResizeObserver
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const height = entry.borderBoxSize?.[0]?.blockSize ?? entry.target.offsetHeight;
        onHeightChange(height);
      }
    });

    observerRef.current = observer;
    observer.observe(element);

    // Initial measurement
    onHeightChange(element.offsetHeight);
  }, [onHeightChange]);

  // Cleanup observer on unmount
  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);

  return h(Portal, null,
    h('div', { className: 'fixed bottom-[calc(3rem+env(safe-area-inset-bottom,0px))] md:bottom-8 left-0 right-0 z-50' },
      h('div', {
        ref: setContentRef,
        className: 'bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 shadow-lg'
      },
        // Main bar
        h('div', { className: 'px-4 py-3 flex flex-wrap items-center justify-between gap-3' },
          // Left side: exit button + count + links
          h('div', { className: 'flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300' },
            onExit && h('button', {
              onClick: onExit,
              className: 'p-1.5 -ml-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors',
              title: 'Exit selection mode'
            }, h(Icon, { name: 'x', size: 18, className: 'text-gray-600 dark:text-gray-400' })),
            h('span', { className: 'font-semibold' }, `${selectedCount} file${selectedCount !== 1 ? 's' : ''} selected`),
            !allItemsSelected && h('button', {
              onClick: onSelectShown,
              className: 'text-blue-600 dark:text-blue-400 hover:underline'
            }, 'Select all shown'),
            selectedCount > 0 && h('button', {
              onClick: onClearAll,
              className: 'text-blue-600 dark:text-blue-400 hover:underline'
            }, 'Clear all')
          ),
          // Right side: action buttons
          selectedCount > 0 && h('div', { className: 'flex flex-wrap gap-2' },
            children
          )
        ),
        // Gmail-style "Select all" banner (shown when all shown items are selected and more can be loaded)
        shownFullySelected && hasMoreToLoad && !allItemsSelected && h('div', {
          className: 'text-sm text-center py-2 bg-blue-50 dark:bg-blue-900/20 border-t border-blue-200 dark:border-blue-800'
        },
          h('span', { className: 'text-gray-700 dark:text-gray-300' },
            `All ${shownCount} shown items are selected. `
          ),
          h('button', {
            onClick: onSelectAll,
            className: 'text-blue-600 dark:text-blue-400 hover:underline font-medium'
          }, `Select all ${totalCount} items`)
        )
      )
    )
  );
};

export default SelectionModeFooter;
