/**
 * AppStateContext
 *
 * Manages UI-level application state:
 * - Current view and navigation
 * - Page state (for pagination)
 * - Page size (items per page)
 * - Error state
 * - Sort configuration
 * - Statistics view state
 *
 * Note: Loading states are managed per-data-type in DataContext (dataLoaded)
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'https://esm.sh/react@18.2.0';
import { PAGE_SIZE_DESKTOP, PAGE_SIZE_MOBILE, BREAKPOINT_MD, ERROR_DISPLAY_DURATION, DEFAULT_SORT_CONFIG } from '../utils/index.js';

const { createElement: h } = React;

const AppStateContext = createContext(null);

// Bump when sort field names or sorting behavior changes.
// Mismatched or missing _v in localStorage → discard saved config, use defaults.
const SORT_CONFIG_VERSION = 2;

/**
 * Get appropriate default page size based on viewport width
 * @returns {number} Page size (desktop or mobile)
 */
const getDefaultPageSize = () => {
  if (typeof window === 'undefined') return PAGE_SIZE_DESKTOP;
  return window.innerWidth >= BREAKPOINT_MD ? PAGE_SIZE_DESKTOP : PAGE_SIZE_MOBILE;
};

/**
 * Scroll to top helper (iOS-compatible)
 */
const scrollToTop = () => {
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
};

export const AppStateProvider = ({ children }) => {
  // Navigation state
  const [appCurrentView, setAppCurrentViewRaw] = useState('home');
  const [appPage, setAppPage] = useState(0);

  // Page size state with localStorage persistence
  // Falls back to responsive default (mobile vs desktop) if not saved
  const [appPageSize, setAppPageSize] = useState(() => {
    try {
      const saved = localStorage.getItem('amule-page-size');
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed > 0) {
          return parsed;
        }
      }
    } catch (err) {
      console.error('Failed to load page size from localStorage:', err);
    }
    return getDefaultPageSize();
  });

  // UI state - errors as array for accumulation
  const [appErrors, setAppErrors] = useState([]);
  const errorTimeoutRef = useRef(null);

  // UI state - success messages as array for accumulation
  const [appSuccesses, setAppSuccesses] = useState([]);
  const successTimeoutRef = useRef(null);

  // Add error to the list and reset timeout
  const addAppError = useCallback((message) => {
    if (!message) return;

    setAppErrors(prev => {
      // Avoid duplicates
      if (prev.includes(message)) return prev;
      return [...prev, message];
    });

    // Clear existing timeout and set a new one
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
    }
    errorTimeoutRef.current = setTimeout(() => {
      setAppErrors([]);
    }, ERROR_DISPLAY_DURATION);
  }, []);

  // Clear all errors
  const clearAppErrors = useCallback(() => {
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
    }
    setAppErrors([]);
  }, []);

  // Add success message to the list and reset timeout
  const addAppSuccess = useCallback((message) => {
    if (!message) return;

    setAppSuccesses(prev => {
      // Avoid duplicates
      if (prev.includes(message)) return prev;
      return [...prev, message];
    });

    // Clear existing timeout and set a new one
    if (successTimeoutRef.current) {
      clearTimeout(successTimeoutRef.current);
    }
    successTimeoutRef.current = setTimeout(() => {
      setAppSuccesses([]);
    }, ERROR_DISPLAY_DURATION);
  }, []);

  // Clear all success messages
  const clearAppSuccesses = useCallback(() => {
    if (successTimeoutRef.current) {
      clearTimeout(successTimeoutRef.current);
    }
    setAppSuccesses([]);
  }, []);

  // Historical/Statistics state
  const [appStatsState, setAppStatsState] = useState({
    speedData: null,
    historicalData: null,
    historicalRange: '24h',
    historicalStats: null,
    loadingHistory: false
  });

  // Sort configuration state with localStorage persistence
  const [appSortConfig, setAppSortConfig] = useState(() => {
    try {
      const saved = localStorage.getItem('amule-sort-config');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed._v === SORT_CONFIG_VERSION) {
          return { ...DEFAULT_SORT_CONFIG, ...parsed };
        }
      }
    } catch (err) {
      console.error('Failed to load sort config from localStorage:', err);
    }

    return DEFAULT_SORT_CONFIG;
  });

  // Wrapped setAppCurrentView that scrolls to top first
  const setAppCurrentView = useCallback((view) => {
    scrollToTop();
    setAppCurrentViewRaw(view);
  }, []);

  // Navigation handler
  const handleAppNavigate = useCallback((view) => {
    scrollToTop();
    setAppCurrentViewRaw(view);
    setAppPage(0);
  }, []);

  // Persist sort configuration to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('amule-sort-config', JSON.stringify({ ...appSortConfig, _v: SORT_CONFIG_VERSION }));
    } catch (err) {
      console.error('Failed to save sort config to localStorage:', err);
    }
  }, [appSortConfig]);

  // Persist page size to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('amule-page-size', String(appPageSize));
    } catch (err) {
      console.error('Failed to save page size to localStorage:', err);
    }
  }, [appPageSize]);

  // Memoize context value to prevent unnecessary re-renders of consumers
  const value = useMemo(() => ({
    // State
    appCurrentView,
    appPage,
    appPageSize,
    appErrors,     // Array of error messages
    appSuccesses,  // Array of success messages
    appStatsState,
    appSortConfig,

    // Setters
    setAppCurrentView,
    setAppPage,
    setAppPageSize,
    addAppError,   // Add error to accumulator
    clearAppErrors, // Clear all errors
    addAppSuccess, // Add success message
    clearAppSuccesses, // Clear all success messages
    setAppStatsState,
    setAppSortConfig,

    // Handlers
    handleAppNavigate
  }), [
    appCurrentView, appPage, appPageSize, appErrors, appSuccesses, appStatsState, appSortConfig,
    setAppCurrentView, addAppError, clearAppErrors, addAppSuccess, clearAppSuccesses, handleAppNavigate
    // Note: React useState setters are stable and don't need to be in deps
  ]);

  return h(AppStateContext.Provider, { value }, children);
};

export const useAppState = () => {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error('useAppState must be used within AppStateProvider');
  }
  return context;
};
