/**
 * PathPicker Component
 *
 * Reusable path selection UI with category quick links and manual path input.
 * Used by FileMoveModal and AddDownloadModal.
 */

import React from 'https://esm.sh/react@18.2.0';

const { createElement: h } = React;

/**
 * @param {string} value - Current path value
 * @param {function} onChange - Called with new path string (typing and quick links)
 * @param {function} onQuickLink - Optional callback for quick link clicks (e.g. immediate permission check)
 * @param {Array} categoryPaths - [{ name, path }] quick link buttons
 * @param {string} label - Label for the manual input (default: 'Or enter path')
 * @param {string} placeholder - Input placeholder
 * @param {string} hint - Optional hint text below label
 */
const PathPicker = ({
  value = '',
  onChange,
  onQuickLink,
  categoryPaths = [],
  label,
  placeholder = '/path/to/destination',
  hint
}) => {
  const handleQuickLink = (path) => {
    onChange(path);
    if (onQuickLink) onQuickLink(path);
  };
  return h('div', { className: 'space-y-3' },
    // Category quick links
    categoryPaths.length > 0 && h('div', { className: 'space-y-2' },
      h('label', { className: 'block text-sm font-medium text-gray-700 dark:text-gray-300' }, 'Quick destinations'),
      h('div', { className: 'flex flex-wrap gap-2' },
        ...categoryPaths.map(cat =>
          h('button', {
            key: cat.path,
            type: 'button',
            onClick: () => handleQuickLink(cat.path),
            className: `px-3 py-1.5 text-xs rounded-lg border transition-colors ${
              value === cat.path
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:border-blue-400 dark:hover:border-blue-500'
            }`
          },
            h('span', { className: 'font-medium' }, cat.name),
            h('span', { className: 'ml-1.5 text-gray-400 dark:text-gray-500 font-mono' }, cat.path)
          )
        )
      )
    ),

    // Manual path input
    h('div', { className: 'space-y-1' },
      h('label', { className: 'block text-sm font-medium text-gray-700 dark:text-gray-300' },
        label || (categoryPaths.length > 0 ? 'Or enter path' : 'Destination path')
      ),
      hint && h('p', { className: 'text-xs text-gray-500 dark:text-gray-500 italic' }, hint),
      h('input', {
        type: 'text',
        value,
        onChange: (e) => onChange(e.target.value),
        placeholder,
        className: 'w-full px-3 py-2 text-sm font-mono bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
      })
    )
  );
};

export default PathPicker;
