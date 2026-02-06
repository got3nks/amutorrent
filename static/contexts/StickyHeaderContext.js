/**
 * StickyHeaderContext
 *
 * Manages the sticky header behavior on mobile.
 * When scrolled down, the main app header is replaced by the view's toolbar.
 * Uses IntersectionObserver to detect when the in-page header leaves the viewport.
 */

import React from 'https://esm.sh/react@18.2.0';
import { BREAKPOINT_XL } from '../utils/index.js';

const { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } = React;

// Main context for sticky header state and actions
const StickyHeaderContext = createContext(null);

// Separate context for content updates (only StickyViewHeader subscribes to this)
const StickyContentUpdateContext = createContext(0);

/**
 * StickyHeaderProvider
 */
export const StickyHeaderProvider = ({ children }) => {
  const [headerHidden, setHeaderHidden] = useState(false);
  const [contentKey, setContentKey] = useState(0);
  const stickyContentRef = useRef(null);
  const observedElementRef = useRef(null);
  const observerRef = useRef(null);

  // Check if below XL breakpoint
  const [isBelowXL, setIsBelowXL] = useState(() => window.innerWidth < BREAKPOINT_XL);

  useEffect(() => {
    const onResize = () => setIsBelowXL(window.innerWidth < BREAKPOINT_XL);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Setup IntersectionObserver when below XL
  useEffect(() => {
    if (!isBelowXL) {
      setHeaderHidden(false);
      return;
    }

    observerRef.current = new IntersectionObserver(
      ([entry]) => {
        if (entry && stickyContentRef.current) {
          setHeaderHidden(!entry.isIntersecting);
        }
      },
      { threshold: 0 }
    );

    if (observedElementRef.current) {
      observerRef.current.observe(observedElementRef.current);
    }

    return () => observerRef.current?.disconnect();
  }, [isBelowXL, contentKey]);

  // Register sticky content and element to observe
  const registerStickyContent = useCallback((content, element) => {
    stickyContentRef.current = content;

    if (element && element !== observedElementRef.current) {
      if (observedElementRef.current) {
        observerRef.current?.unobserve(observedElementRef.current);
      }
      observedElementRef.current = element;
      observerRef.current?.observe(element);
    }

    setContentKey(k => k + 1);
  }, []);

  // Unregister sticky content
  const unregisterStickyContent = useCallback(() => {
    if (observedElementRef.current) {
      observerRef.current?.unobserve(observedElementRef.current);
    }
    stickyContentRef.current = null;
    observedElementRef.current = null;
    setHeaderHidden(false);
  }, []);

  // Getter for content
  const getStickyContent = useCallback(() => stickyContentRef.current, []);

  // Getter for observed element (in-page header)
  const getObservedElement = useCallback(() => observedElementRef.current, []);

  // Memoized context value
  const value = useMemo(() => ({
    headerHidden, getStickyContent, getObservedElement, isBelowXL, registerStickyContent, unregisterStickyContent
  }), [headerHidden, isBelowXL, getStickyContent, getObservedElement, registerStickyContent, unregisterStickyContent]);

  return React.createElement(StickyHeaderContext.Provider, { value },
    React.createElement(StickyContentUpdateContext.Provider, { value: contentKey }, children)
  );
};

/**
 * Hook to access sticky header context
 */
export const useStickyHeader = () => {
  const context = useContext(StickyHeaderContext);
  if (!context) {
    throw new Error('useStickyHeader must be used within StickyHeaderProvider');
  }
  return context;
};

/**
 * Hook to subscribe to content updates (for StickyViewHeader only)
 * This is separate from useStickyHeader to prevent views from re-rendering
 * when content changes
 */
export const useStickyContentKey = () => {
  return useContext(StickyContentUpdateContext);
};

/**
 * Hook for views to register their sticky toolbar content
 * @param {ReactNode} content - The toolbar content to show when scrolled
 * @param {boolean} enabled - Whether to enable sticky behavior (default true)
 * @returns {function} ref callback to attach to the in-page header element
 */
export const useStickyToolbar = (content, enabled = true) => {
  const { registerStickyContent, unregisterStickyContent, isBelowXL } = useStickyHeader();
  const elementRef = useRef(null);

  // Ref callback to store element
  const setHeaderRef = useCallback((el) => { elementRef.current = el; }, []);

  // Register content on every render when conditions are met
  useEffect(() => {
    if (enabled && isBelowXL && content && elementRef.current) {
      registerStickyContent(content, elementRef.current);
    }
  }); // No deps - runs every render

  // Unregister when disabled/above XL, and on unmount
  useEffect(() => {
    if (!enabled || !isBelowXL) unregisterStickyContent();
    return () => unregisterStickyContent();
  }, [enabled, isBelowXL, unregisterStickyContent]);

  return setHeaderRef;
};
