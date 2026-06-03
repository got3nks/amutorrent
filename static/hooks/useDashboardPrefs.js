/**
 * useDashboardPrefs Hook
 *
 * Manages dashboard display preferences in localStorage.
 * These are client-side preferences — they take effect immediately
 * and do NOT go through the server config save flow.
 */

import React from 'https://esm.sh/react@18.2.0';

const { useState } = React;

const STORAGE_KEY = 'amule-dashboard-prefs';

function loadPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function savePrefs(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Hook for dashboard display preferences.
 *
 * @returns {{ combinedGraph: boolean, setCombinedGraph: function }}
 */
export const useDashboardPrefs = () => {
  const [prefs, setPrefs] = useState(loadPrefs);

  const setCombinedGraph = (val) => {
    setPrefs(prev => {
      const next = { ...prev, combinedGraph: val };
      savePrefs(next);
      return next;
    });
  };

  // Default: true — show combined graph when multiple networks are visible
  const combinedGraph = prefs.combinedGraph ?? true;

  return { combinedGraph, setCombinedGraph };
};
