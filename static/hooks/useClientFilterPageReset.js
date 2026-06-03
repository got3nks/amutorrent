/**
 * useClientFilterPageReset Hook
 *
 * Resets page to 0 when any client filter changes (network type or individual instance),
 * but skips the initial render to avoid unnecessary reset on mount.
 *
 * Usage:
 *   useClientFilterPageReset(onPageChange, isEd2kEnabled, isBittorrentEnabled, isSoulseekEnabled, disabledInstances);
 */

import React from 'https://esm.sh/react@18.2.0';

const { useRef, useEffect } = React;

/**
 * @param {function} onPageChange - Callback to reset page (called with 0)
 * @param {boolean} isEd2kEnabled - Whether ED2K network type is enabled
 * @param {boolean} isBittorrentEnabled - Whether BitTorrent network type is enabled
 * @param {boolean} isSoulseekEnabled - Whether Soulseek network type is enabled
 * @param {Set} disabledInstances - Set of disabled instance IDs (new ref on each change)
 */
export const useClientFilterPageReset = (onPageChange, isEd2kEnabled, isBittorrentEnabled, isSoulseekEnabled, disabledInstances) => {
  const isFirstRender = useRef(true);
  const onPageChangeRef = useRef(onPageChange);
  onPageChangeRef.current = onPageChange;

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    onPageChangeRef.current(0);
  }, [isEd2kEnabled, isBittorrentEnabled, isSoulseekEnabled, disabledInstances]);
};

export default useClientFilterPageReset;
