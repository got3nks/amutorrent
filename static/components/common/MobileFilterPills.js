/**
 * MobileFilterPills Component
 *
 * Shows active filter pills with dismiss buttons.
 * Only renders when filters are active.
 * Supports inline mode for displaying next to filter button.
 */

import React from 'https://esm.sh/react@18.2.0';
import Icon from './Icon.js';

const { createElement: h, Fragment, useState, useEffect } = React;

const PillIcon = ({ filter }) => {
  const [imgOk, setImgOk] = useState(true);
  useEffect(() => { setImgOk(true); }, [filter.iconSrc]);
  if (filter.iconSrc && imgOk) {
    return h('img', {
      src: filter.iconSrc,
      alt: '',
      width: 10,
      height: 10,
      loading: 'lazy',
      onError: () => setImgOk(false),
      className: 'flex-shrink-0 rounded-sm'
    });
  }
  if (filter.icon) {
    return h(Icon, { name: filter.icon, size: 10, className: 'flex-shrink-0' });
  }
  return null;
};

/**
 * MobileFilterPills component
 * @param {Array} filters - Array of { key, label, icon?, iconSrc? } for active filters.
 *   `icon` picks an SVG from the Icon set; `iconSrc` renders an <img> (e.g. favicon)
 *   and falls back to `icon` if the image errors.
 * @param {function} onRemove - Handler for removing a filter (receives key)
 * @param {boolean} inline - If true, renders pills without container (for inline use)
 */
const MobileFilterPills = ({ filters, onRemove, inline = false }) => {
  if (!filters || filters.length === 0) return null;

  const pills = filters.map(filter =>
    h('span', {
      key: filter.key,
      className: 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 whitespace-nowrap'
    },
      h(PillIcon, { filter }),
      filter.label,
      h('button', {
        onClick: () => onRemove(filter.key),
        className: 'ml-0.5 flex items-center text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
      },
        h(Icon, { name: 'x', size: 10 })
      )
    )
  );

  // Inline mode: just return the pills as a fragment
  if (inline) {
    return h(Fragment, null, pills);
  }

  // Default: wrap in a styled container row
  return h('div', {
    className: 'xl:hidden flex items-center gap-1.5 py-2 bg-gray-50 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-700 overflow-x-auto',
    style: { scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }
  }, pills);
};

export default MobileFilterPills;
