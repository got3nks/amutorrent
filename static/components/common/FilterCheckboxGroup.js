/**
 * FilterCheckboxGroup Component
 *
 * Reusable checkbox group for filter sheets.
 * Renders a title and list of checkboxes with consistent styling.
 */

import React from 'https://esm.sh/react@18.2.0';
import Icon from './Icon.js';

const { createElement: h, useState, useEffect } = React;

const OptionIcon = ({ opt }) => {
  const [imgOk, setImgOk] = useState(true);
  useEffect(() => { setImgOk(true); }, [opt.iconSrc]);
  if (opt.iconSrc && imgOk) {
    return h('img', {
      src: opt.iconSrc,
      alt: '',
      width: 14,
      height: 14,
      loading: 'lazy',
      onError: () => setImgOk(false),
      className: 'flex-shrink-0 rounded-sm'
    });
  }
  if (opt.icon) {
    return h(Icon, { name: opt.icon, size: 12, className: 'flex-shrink-0 text-gray-400 dark:text-gray-500' });
  }
  return null;
};

/**
 * FilterCheckboxGroup component
 * @param {string} title - Section heading (optional)
 * @param {Array} options - Array of { value, label, iconSrc?, icon? } objects.
 *   `iconSrc` renders a small image (e.g. favicon) before the label; `icon`
 *   falls back to an SVG from the Icon set when the image is missing / errors.
 * @param {Array} selectedValues - Array of currently selected values
 * @param {function} onToggle - Callback when checkbox is toggled (receives value)
 * @param {string} className - Optional additional class names (e.g., 'mt-4' for spacing)
 */
const FilterCheckboxGroup = ({ title, options, selectedValues, onToggle, className = '' }) => {
  if (!options || options.length === 0) return null;

  return h('div', { className: `space-y-3 ${className}`.trim() },
    title && h('h4', { className: 'text-sm font-semibold text-gray-700 dark:text-gray-300' }, title),
    ...options.map(opt =>
      h('label', {
        key: opt.value,
        className: 'flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300'
      },
        h('input', {
          type: 'checkbox',
          checked: selectedValues.includes(opt.value),
          onChange: () => onToggle(opt.value),
          className: 'w-4 h-4 text-blue-600 border-gray-300 rounded'
        }),
        h(OptionIcon, { opt }),
        opt.label
      )
    )
  );
};

export default FilterCheckboxGroup;
