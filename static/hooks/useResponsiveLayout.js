/**
 * useResponsiveLayout Hook
 *
 * Manages responsive layout state (landscape mode and mobile detection)
 * Note: Page size is now managed by AppStateContext with user selection
 */

import { useState, useEffect } from 'https://esm.sh/react@18.2.0';
import { BREAKPOINT_MD, BREAKPOINT_XL } from '../utils/index.js';

/**
 * Check if device is in landscape mode (mobile device rotated)
 * @returns {boolean} True if in landscape on mobile device
 */
const checkIsLandscape = () => {
  if (typeof window === 'undefined') return false;

  return window.matchMedia("(orientation: landscape)").matches &&
         window.matchMedia("(max-device-width: 600px)").matches;
};

/**
 * Check if viewport is mobile size
 * @returns {boolean} True if viewport width is below tablet breakpoint
 */
const checkIsMobile = () => {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < BREAKPOINT_MD;
};

/**
 * Check if viewport is below XL breakpoint (tablet/mobile views)
 * @returns {boolean} True if viewport width is below xl breakpoint (< 1280px)
 */
const checkIsBelowXL = () => {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < BREAKPOINT_XL;
};

/**
 * Custom hook for responsive layout management
 * @returns {Object} Layout state
 * @returns {boolean} returns.isLandscape - Whether device is in landscape mode
 * @returns {boolean} returns.isMobile - Whether viewport is mobile size (< 768px)
 * @returns {boolean} returns.isBelowXL - Whether viewport is below xl breakpoint (< 1280px)
 */
export const useResponsiveLayout = () => {
  const [isLandscape, setIsLandscape] = useState(checkIsLandscape);
  const [isMobile, setIsMobile] = useState(checkIsMobile);
  const [isBelowXL, setIsBelowXL] = useState(checkIsBelowXL);

  useEffect(() => {
    const handleResize = () => {
      setIsLandscape(checkIsLandscape());
      setIsMobile(checkIsMobile());
      setIsBelowXL(checkIsBelowXL());
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return {
    isLandscape,
    isMobile,
    isBelowXL
  };
};
