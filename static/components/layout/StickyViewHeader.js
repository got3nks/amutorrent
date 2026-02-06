/**
 * StickyViewHeader Component
 *
 * Renders the view's sticky toolbar content when the main header is hidden.
 * Shows on mobile when scrolled past threshold.
 *
 * Uses useLayoutEffect to preserve input focus and cursor position across re-renders.
 */

import React from 'https://esm.sh/react@18.2.0';
import { useStickyHeader, useStickyContentKey } from '../../contexts/StickyHeaderContext.js';

const { createElement: h, useRef, useEffect, useLayoutEffect } = React;

const StickyViewHeader = React.memo(() => {
  const { headerHidden, getStickyContent, getObservedElement } = useStickyHeader();
  useStickyContentKey(); // Subscribe to content updates
  const containerRef = useRef(null);
  const focusState = useRef(null);
  const prevHeaderHidden = useRef(headerHidden);

  // When sticky header hides, expand the in-page filter and transfer focus
  useEffect(() => {
    if (prevHeaderHidden.current && !headerHidden && focusState.current) {
      const savedFocusState = { ...focusState.current };
      focusState.current = null;

      const inPageHeader = getObservedElement();
      if (inPageHeader) {
        // Click filter button to expand ExpandableSearch, then restore cursor position
        const filterButton = inPageHeader.querySelector('button[title*="ilter"]');
        if (filterButton) {
          filterButton.click();
          setTimeout(() => {
            const input = inPageHeader.querySelector('input');
            if (input) {
              try { input.setSelectionRange(savedFocusState.selectionStart, savedFocusState.selectionEnd); } catch (e) {}
            }
          }, 50);
        }
      }
    }
    prevHeaderHidden.current = headerHidden;
  }, [headerHidden, getObservedElement]);

  // Track focus state and cursor position via DOM events
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateFocusState = (e) => {
      if (e.target.tagName === 'INPUT') {
        focusState.current = {
          selector: 'input',
          selectionStart: e.target.selectionStart,
          selectionEnd: e.target.selectionEnd
        };
      }
    };

    const clearFocusState = () => {
      setTimeout(() => {
        // Don't clear if container removed from DOM (sticky header hiding)
        if (!document.body.contains(container)) return;
        if (!container.contains(document.activeElement)) {
          focusState.current = null;
        }
      }, 0);
    };

    container.addEventListener('focusin', updateFocusState);
    container.addEventListener('input', updateFocusState);
    container.addEventListener('focusout', clearFocusState);
    return () => {
      container.removeEventListener('focusin', updateFocusState);
      container.removeEventListener('input', updateFocusState);
      container.removeEventListener('focusout', clearFocusState);
    };
  }, [headerHidden]);

  // Restore focus synchronously after DOM update
  useLayoutEffect(() => {
    const state = focusState.current;
    if (!state || !containerRef.current) return;

    const input = containerRef.current.querySelector(state.selector);
    if (input && document.activeElement !== input) {
      input.focus({ preventScroll: true });
      try { input.setSelectionRange(state.selectionStart, state.selectionEnd); } catch (e) {}
    }
  });

  const content = getStickyContent();
  if (!headerHidden || !content) return null;

  return h('div', {
    ref: containerRef,
    className: 'fixed top-0 left-0 right-0 z-50 bg-white dark:bg-gray-800 shadow-md border-b border-gray-200 dark:border-gray-700 xl:hidden'
  },
    h('div', { className: 'px-2 py-1.5' }, content)
  );
});

export default StickyViewHeader;
