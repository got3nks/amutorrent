/**
 * useCopyToClipboard Hook
 *
 * Shared hook for clipboard copy functionality with status feedback
 */

import { useState, useCallback } from 'https://esm.sh/react@18.2.0';
import { copyToClipboard } from '../utils/index.js';

/**
 * Hook for copying text to clipboard with status feedback
 * @param {number} resetDelay - Delay in ms before resetting status (default: 2000)
 * @returns {Object} { copyStatus, handleCopy }
 */
export const useCopyToClipboard = (resetDelay = 2000) => {
  const [copyStatus, setCopyStatus] = useState('idle');

  const handleCopy = useCallback(async (text) => {
    if (!text) return false;

    const success = await copyToClipboard(text);
    if (success) {
      setCopyStatus('success');
      setTimeout(() => setCopyStatus('idle'), resetDelay);
    } else {
      setCopyStatus('error');
      setTimeout(() => setCopyStatus('idle'), resetDelay);
    }
    return success;
  }, [resetDelay]);

  return { copyStatus, handleCopy };
};
