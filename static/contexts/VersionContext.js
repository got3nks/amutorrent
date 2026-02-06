/**
 * VersionContext
 *
 * Manages version information state:
 * - Current app version
 * - Changelog data
 * - Update availability
 * - What's New modal state
 */

import React from 'https://esm.sh/react@18.2.0';

const { createElement: h, createContext, useContext, useState, useEffect, useCallback, useMemo } = React;

const VersionContext = createContext(null);

/**
 * Compare semver versions
 * @returns {number} -1 if a < b, 0 if equal, 1 if a > b
 */
const compareSemver = (a, b) => {
  if (!a || !b) return 0;
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
};

export const VersionProvider = ({ children }) => {
  const [versionInfo, setVersionInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [whatsNewChangelog, setWhatsNewChangelog] = useState(null);
  const [markingAsSeen, setMarkingAsSeen] = useState(false);

  // Fetch version info from API
  const fetchVersionInfo = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/version');
      if (!response.ok) throw new Error('Failed to fetch version');
      const data = await response.json();
      setVersionInfo(data);
      setError(null);

      // Determine if we should show Welcome modal
      const { version, lastSeenVersion, changelog } = data;

      // Show Welcome modal if:
      // - Fresh install (lastSeenVersion is null) - shown after setup wizard completes
      // - User upgraded (current version > lastSeenVersion)
      if (lastSeenVersion === null || compareSemver(version, lastSeenVersion) > 0) {
        const currentChangelog = changelog?.find(r => r.version === version)?.changes || {};
        setWhatsNewChangelog(currentChangelog);
        setShowWhatsNew(true);
      }
    } catch (err) {
      console.error('Error fetching version info:', err);
      setError(err.message);
      // Set minimal fallback version info
      setVersionInfo({
        appName: 'aMuTorrent',
        version: 'unknown',
        updateAvailable: false
      });
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchVersionInfo();
  }, [fetchVersionInfo]);

  // Refresh version info (e.g., after user dismisses update)
  const refreshVersionInfo = useCallback(() => {
    fetchVersionInfo();
  }, [fetchVersionInfo]);

  // Mark current version as seen and close What's New modal
  const markVersionSeen = useCallback(async () => {
    try {
      setMarkingAsSeen(true);
      const response = await fetch('/api/version/seen', { method: 'POST' });
      if (!response.ok) throw new Error('Failed to mark version as seen');

      setShowWhatsNew(false);
      setWhatsNewChangelog(null);

      // Refresh to get updated lastSeenVersion
      await fetchVersionInfo();
    } catch (err) {
      console.error('Error marking version as seen:', err);
      // Still close the modal on error
      setShowWhatsNew(false);
    } finally {
      setMarkingAsSeen(false);
    }
  }, [fetchVersionInfo]);

  // Memoize context value to prevent unnecessary re-renders of consumers
  const value = useMemo(() => ({
    versionInfo,
    loading,
    error,
    refreshVersionInfo,
    // Convenience getters
    version: versionInfo?.version || 'unknown',
    updateAvailable: versionInfo?.updateAvailable || false,
    latestVersion: versionInfo?.latestVersion || null,
    releaseUrl: versionInfo?.releaseUrl || null,
    // What's New modal
    showWhatsNew,
    whatsNewChangelog,
    markVersionSeen,
    markingAsSeen
  }), [versionInfo, loading, error, refreshVersionInfo, showWhatsNew, whatsNewChangelog, markVersionSeen, markingAsSeen]);

  return h(VersionContext.Provider, { value }, children);
};

export const useVersion = () => {
  const context = useContext(VersionContext);
  if (!context) {
    throw new Error('useVersion must be used within VersionProvider');
  }
  return context;
};

export default VersionContext;
