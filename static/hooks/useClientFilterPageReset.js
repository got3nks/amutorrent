/**
 * useClientFilterPageReset Hook
 *
 * Resets page to 0 when client filter (ED2K/BT toggle) changes,
 * but skips the initial render to avoid unnecessary reset on mount.
 *
 * Usage:
 *   useClientFilterPageReset(onPageChange, isAmuleEnabled, isRtorrentEnabled);
 */

import React from 'https://esm.sh/react@18.2.0';

const { useRef, useEffect } = React;

/**
 * @param {function} onPageChange - Callback to reset page (called with 0)
 * @param {boolean} isAmuleEnabled - Whether aMule client is enabled
 * @param {boolean} isRtorrentEnabled - Whether rtorrent client is enabled
 */
export const useClientFilterPageReset = (onPageChange, isAmuleEnabled, isRtorrentEnabled) => {
  const isFirstRender = useRef(true);
  const onPageChangeRef = useRef(onPageChange);
  onPageChangeRef.current = onPageChange;

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    onPageChangeRef.current(0);
  }, [isAmuleEnabled, isRtorrentEnabled]);
};

export default useClientFilterPageReset;
