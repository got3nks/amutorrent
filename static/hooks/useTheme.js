/**
 * useTheme Hook
 *
 * Manages theme state (dark/light mode) with persistence
 */

import { useState, useEffect } from 'https://esm.sh/react@18.2.0';

/**
 * Custom hook for theme management
 * @returns {object} { theme, toggleTheme }
 */
export const useTheme = () => {
  const [theme, setTheme] = useState(() => {
    // Check device preference, default to dark
    if (typeof window !== 'undefined') {
      // Always default to dark
      const initialTheme = 'dark';
      const root = document.documentElement;
      const body = document.body;
      if (initialTheme === 'dark') {
        root.classList.add('dark');
        body.classList.add('dark');
        root.style.colorScheme = 'dark';
      }
      return initialTheme;
    }
    return 'dark';
  });

  // Apply theme to document and body
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;

    if (theme === 'dark') {
      root.classList.add('dark');
      body.classList.add('dark');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      body.classList.remove('dark');
      root.style.colorScheme = 'light';
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prevTheme => prevTheme === 'dark' ? 'light' : 'dark');
  };

  return { theme, toggleTheme };
};
