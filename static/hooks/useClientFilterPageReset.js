/**
 * useClientFilterPageReset Hook
 *
 * Resets page to 0 when any client filter changes (network type or individual instance),
 * but skips the initial render to avoid unnecessary reset on mount.
 *
 * Usage:
 *   useClientFilterPageReset(onPageChange, isEd2kEnabled, isBittorrentEnabled, disabledInstances);
 */

import React from 'https://esm.sh/react@18.2.0';

const { useRef, useEffect } = React;

/**
 * @param {function} onPageChange - Callback to reset page (called with 0)
 * @param {string} enabledNetworksKey - Stable key of the enabled connected
 *   networks (changes whenever any network filter toggles). Network-agnostic,
 *   so a new network is covered with no change here.
 * @param {Set} disabledInstances - Set of disabled instance IDs (new ref on each change)
 */
export const useClientFilterPageReset = (onPageChange, enabledNetworksKey, disabledInstances) => {
  const isFirstRender = useRef(true);
  const onPageChangeRef = useRef(onPageChange);
  onPageChangeRef.current = onPageChange;

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    onPageChangeRef.current(0);
  }, [enabledNetworksKey, disabledInstances]);
};

export default useClientFilterPageReset;
