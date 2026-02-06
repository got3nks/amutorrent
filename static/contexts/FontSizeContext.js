/**
 * FontSizeContext
 *
 * Provides global font size control (medium/large) to the entire app
 * Device-aware: applies different base sizes on mobile vs desktop
 * Uses CSS class mapping to reuse existing text-size-* CSS rules
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'https://esm.sh/react@18.2.0';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout.js';

const { createElement: h } = React;

const FontSizeContext = createContext(null);

// Device-aware font size configurations
const DESKTOP_CONFIG = {
  medium: { base: '14px', scale: 1.0, formScale: 1.0, label: 'Medium' },
  large:  { base: '16px', scale: 1.15, formScale: 1.1, label: 'Large' }
};

const MOBILE_CONFIG = {
  medium: { base: '13px', scale: 0.9, formScale: 0.9, label: 'Medium' },
  large:  { base: '14px', scale: 1.0, formScale: 1.0, label: 'Large' }
};

// CSS class mapping: (device, fontSize) → body class
// Reuses existing text-size-small/medium/large CSS rules
const CSS_CLASS_MAP = {
  'mobile-medium': 'text-size-small',
  'mobile-large': 'text-size-medium',
  'desktop-medium': 'text-size-medium',
  'desktop-large': 'text-size-large'
};

export const FONT_SIZES = ['medium', 'large'];

export const FontSizeProvider = ({ children }) => {
  const [fontSize, setFontSize] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('amule-font-size');
        // Migration: 'small' falls back to 'medium'
        if (saved === 'small') return 'medium';
        if (saved && DESKTOP_CONFIG[saved]) {
          return saved;
        }
      } catch (err) {
        console.error('Failed to load font size from localStorage:', err);
      }
    }
    return 'medium';
  });

  // Mobile detection for device-aware sizing
  const { isMobile } = useResponsiveLayout();

  // Get device-aware config
  const fontSizeConfig = useMemo(() =>
    (isMobile ? MOBILE_CONFIG : DESKTOP_CONFIG)[fontSize],
    [isMobile, fontSize]
  );

  // Apply font size CSS custom properties to document
  useEffect(() => {
    const root = document.documentElement;
    const config = fontSizeConfig;

    // Set CSS custom properties
    root.style.setProperty('--font-size-base', config.base);
    root.style.setProperty('--font-size-scale', config.scale.toString());
    root.style.setProperty('--font-size-form-scale', config.formScale.toString());

    // Apply mapped CSS class to body (reuses existing text-size-* rules)
    const classKey = `${isMobile ? 'mobile' : 'desktop'}-${fontSize}`;
    document.body.classList.remove('text-size-small', 'text-size-medium', 'text-size-large');
    document.body.classList.add(CSS_CLASS_MAP[classKey]);

    // Save to localStorage
    try {
      localStorage.setItem('amule-font-size', fontSize);
    } catch (err) {
      console.error('Failed to save font size to localStorage:', err);
    }
  }, [fontSize, isMobile, fontSizeConfig]);

  // Cycle through font sizes: medium -> large -> medium
  const cycleFontSize = useCallback(() => {
    setFontSize(prev => {
      const currentIndex = FONT_SIZES.indexOf(prev);
      const nextIndex = (currentIndex + 1) % FONT_SIZES.length;
      return FONT_SIZES[nextIndex];
    });
  }, []);

  // Set specific font size
  const setFontSizeValue = useCallback((size) => {
    if (DESKTOP_CONFIG[size]) {
      setFontSize(size);
    }
  }, []);

  // Memoize context value
  const value = useMemo(() => ({
    fontSize,
    fontSizeConfig,
    cycleFontSize,
    setFontSize: setFontSizeValue,
    FONT_SIZES,
    getScaledSize: (baseSize) => {
      const scale = fontSizeConfig.scale;
      const numericSize = parseInt(baseSize, 10);
      return `${Math.round(numericSize * scale)}px`;
    }
  }), [fontSize, fontSizeConfig, cycleFontSize, setFontSizeValue]);

  return h(FontSizeContext.Provider, { value }, children);
};

export const useFontSize = () => {
  const context = useContext(FontSizeContext);
  if (!context) {
    throw new Error('useFontSize must be used within FontSizeProvider');
  }
  return context;
};
