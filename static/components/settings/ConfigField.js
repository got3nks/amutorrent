/**
 * ConfigField Component
 *
 * Form field with label, description, and validation
 */

import React from 'https://esm.sh/react@18.2.0';
import { Icon } from '../common/index.js';

const { createElement: h } = React;

/**
 * ConfigField component
 * @param {string} label - Field label
 * @param {string} description - Field description
 * @param {string} value - Field value
 * @param {function} onChange - Change handler
 * @param {string} type - Input type (text, number, password)
 * @param {string} placeholder - Placeholder text
 * @param {boolean} required - Required field
 * @param {string} error - Error message
 * @param {boolean} disabled - Disabled state
 * @param {boolean} fromEnv - Whether value comes from environment variable
 */
const ConfigField = ({
  label,
  description,
  value,
  onChange,
  type = 'text',
  placeholder,
  required = false,
  error,
  disabled = false,
  fromEnv = false,
  children
}) => {
  return h('div', { className: 'mb-4' },
    h('label', { className: 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1' },
      label,
      required && h('span', { className: 'text-red-500 ml-1' }, '*'),
      fromEnv && h('span', {
        className: 'ml-2 inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
        title: 'This value is set via environment variable'
      },
        h(Icon, { name: 'server', size: 12 }),
        'From Env'
      )
    ),
    description && h('p', { className: 'text-xs text-gray-500 dark:text-gray-400 mb-2' }, description),
    children || h('input', {
      type,
      value: value || '',
      onChange: (e) => onChange(type === 'number' ? parseInt(e.target.value, 10) : e.target.value),
      placeholder,
      required,
      disabled,
      className: `w-full px-3 py-2 border rounded-lg
        bg-white dark:bg-gray-700
        border-gray-300 dark:border-gray-600
        text-gray-900 dark:text-gray-100
        placeholder-gray-400 dark:placeholder-gray-500
        focus:ring-2 focus:ring-blue-500 focus:border-blue-500
        disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed
        ${error ? 'border-red-500 focus:ring-red-500' : ''}`
    }),
    error && h('p', { className: 'mt-1 text-sm text-red-600 dark:text-red-400' }, error)
  );
};

export default ConfigField;
