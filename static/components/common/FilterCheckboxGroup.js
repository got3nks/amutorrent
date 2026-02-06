/**
 * FilterCheckboxGroup Component
 *
 * Reusable checkbox group for filter sheets.
 * Renders a title and list of checkboxes with consistent styling.
 */

import React from 'https://esm.sh/react@18.2.0';

const { createElement: h } = React;

/**
 * FilterCheckboxGroup component
 * @param {string} title - Section heading (optional)
 * @param {Array} options - Array of { value, label } objects
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
        opt.label
      )
    )
  );
};

export default FilterCheckboxGroup;
