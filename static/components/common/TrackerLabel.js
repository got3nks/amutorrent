/**
 * TrackerLabel Component
 *
 * Pill-styled label for displaying a tracker domain. Loads the host's
 * favicon from our cache endpoint and hides the image when unavailable.
 */

import React from 'https://esm.sh/react@18.2.0';
import { trackerFaviconUrl } from '../../utils/index.js';

const { createElement: h, useState, useEffect } = React;

/**
 * TrackerLabel component
 * @param {string} tracker - Tracker domain to display
 * @param {number} maxWidth - Max width in pixels (default 120)
 * @param {string} className - Additional classes to apply (e.g., 'float-right ml-2')
 */
const TrackerLabel = ({ tracker, maxWidth = 120, className = '' }) => {
  const [iconLoaded, setIconLoaded] = useState(true);

  // Reset load state when the tracker changes
  useEffect(() => { setIconLoaded(true); }, [tracker]);

  if (!tracker) return null;

  const iconSrc = iconLoaded ? trackerFaviconUrl(tracker) : null;

  return h('span', {
    className: `inline-flex items-center gap-1 px-1.5 py-px rounded-full text-xs font-medium bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200${className ? ` ${className}` : ''}`,
    style: { maxWidth: `${maxWidth}px` },
    title: tracker
  },
    iconSrc && h('img', {
      src: iconSrc,
      alt: '',
      width: 12,
      height: 12,
      loading: 'lazy',
      onError: () => setIconLoaded(false),
      className: 'flex-shrink-0 rounded-sm'
    }),
    h('span', { className: 'truncate' }, tracker)
  );
};

export default TrackerLabel;
