/**
 * FormControls - Reusable UI components with consistent styling
 *
 * Provides Button, Input, and Select components with unified heights and styles
 * to ensure visual consistency across the application.
 */

import React from 'https://esm.sh/react@18.2.0';
import Icon from './Icon.js';

const { createElement: h } = React;

// Shared base styles
const BASE_HEIGHT = 'h-9 sm:h-10';
const BASE_ROUNDED = 'rounded-lg';
const BASE_TRANSITION = 'transition-all';
const BASE_TEXT = 'text-sm';
// 16px on mobile prevents iOS auto-zoom on input focus, 14px on desktop
const BASE_INPUT_TEXT = 'text-base sm:text-sm';

/**
 * Button variants with their respective styles
 */
const BUTTON_VARIANTS = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95',
  secondary: 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600',
  success: 'bg-green-600 text-white hover:bg-green-700 active:scale-95',
  danger: 'bg-red-600 text-white hover:bg-red-700 active:scale-95',
  warning: 'bg-yellow-600 text-white hover:bg-yellow-700 active:scale-95',
  orange: 'bg-orange-600 text-white hover:bg-orange-700 active:scale-95',
  purple: 'bg-purple-600 text-white hover:bg-purple-700 active:scale-95',
  cyan: 'bg-cyan-600 text-white hover:bg-cyan-700 active:scale-95'
};

/**
 * Button Component
 *
 * @param {string} variant - Button style variant (primary, secondary, success, danger, warning, orange, purple, cyan)
 * @param {boolean} disabled - Whether button is disabled
 * @param {function} onClick - Click handler
 * @param {string} icon - Optional icon name to display
 * @param {number} iconSize - Icon size (default: 16)
 * @param {string} className - Additional CSS classes
 * @param {string} title - Button title/tooltip
 * @param {React.ReactNode} children - Button content
 */
const Button = ({
  variant = 'primary',
  disabled = false,
  onClick,
  icon,
  iconSize = 16,
  className = '',
  title,
  children,
  ...rest
}) => {
  const variantClass = BUTTON_VARIANTS[variant] || BUTTON_VARIANTS.primary;

  return h('button', {
    onClick,
    disabled,
    title,
    className: `${BASE_HEIGHT} px-3 ${BASE_ROUNDED} ${BASE_TRANSITION} ${BASE_TEXT} flex items-center gap-1.5 ${variantClass} disabled:opacity-50 disabled:cursor-not-allowed ${className}`,
    ...rest
  },
    icon && h(Icon, { name: icon, size: iconSize }),
    children
  );
};

/**
 * Input Component
 *
 * @param {string} type - Input type (text, password, etc.)
 * @param {string} value - Input value
 * @param {function} onChange - Change handler (receives event)
 * @param {string} placeholder - Placeholder text
 * @param {boolean} disabled - Whether input is disabled
 * @param {string} className - Additional CSS classes
 */
const Input = ({
  type = 'text',
  value,
  onChange,
  placeholder,
  disabled = false,
  className = '',
  ...rest
}) => {
  return h('input', {
    type,
    value,
    onChange,
    placeholder,
    disabled,
    className: `${BASE_HEIGHT} px-3 ${BASE_ROUNDED} ${BASE_INPUT_TEXT} border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed ${className}`,
    ...rest
  });
};

/**
 * Select Component
 *
 * @param {string|number} value - Selected value
 * @param {function} onChange - Change handler (receives event)
 * @param {Array} options - Array of { value, label } objects
 * @param {boolean} disabled - Whether select is disabled
 * @param {string} className - Additional CSS classes
 * @param {string} title - Select title/tooltip
 */
const Select = ({
  value,
  onChange,
  options = [],
  disabled = false,
  className = '',
  title,
  ...rest
}) => {
  return h('select', {
    value,
    onChange,
    disabled,
    title,
    className: `${BASE_HEIGHT} px-3 ${BASE_ROUNDED} ${BASE_TEXT} border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed ${className}`,
    ...rest
  },
    options.map(opt =>
      h('option', { key: opt.value, value: opt.value }, opt.label)
    )
  );
};

/**
 * IconButton Component - Square button with just an icon
 *
 * @param {string} variant - Button style variant
 * @param {string} icon - Icon name (required)
 * @param {number} iconSize - Icon size (default: 18)
 * @param {boolean} disabled - Whether button is disabled
 * @param {function} onClick - Click handler
 * @param {string} className - Additional CSS classes
 * @param {string} title - Button title/tooltip
 */
const IconButton = ({
  variant = 'secondary',
  icon,
  iconSize = 18,
  disabled = false,
  onClick,
  className = '',
  title,
  ...rest
}) => {
  const variantClass = BUTTON_VARIANTS[variant] || BUTTON_VARIANTS.secondary;

  return h('button', {
    onClick,
    disabled,
    title,
    className: `${BASE_HEIGHT} w-9 sm:w-10 ${BASE_ROUNDED} ${BASE_TRANSITION} flex items-center justify-center ${variantClass} disabled:opacity-50 disabled:cursor-not-allowed ${className}`,
    ...rest
  },
    h(Icon, { name: icon, size: iconSize })
  );
};

/**
 * Textarea Component
 *
 * @param {string} value - Textarea value
 * @param {function} onChange - Change handler (receives event)
 * @param {string} placeholder - Placeholder text
 * @param {number} rows - Number of rows
 * @param {boolean} disabled - Whether textarea is disabled
 * @param {string} className - Additional CSS classes
 */
const Textarea = ({
  value,
  onChange,
  placeholder,
  rows = 4,
  disabled = false,
  className = '',
  ...rest
}) => {
  return h('textarea', {
    value,
    onChange,
    placeholder,
    rows,
    disabled,
    className: `w-full px-3 py-2 ${BASE_ROUNDED} ${BASE_INPUT_TEXT} border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed resize-none ${className}`,
    ...rest
  });
};

/**
 * SegmentedControl Component - Toggle switch with multiple options
 *
 * @param {Array} options - Array of { value, label } objects
 * @param {string|number} value - Currently selected value
 * @param {function} onChange - Change handler (receives new value)
 * @param {boolean} disabled - Whether control is disabled
 * @param {string} className - Additional CSS classes
 */
const SegmentedControl = ({
  options = [],
  value,
  onChange,
  disabled = false,
  className = ''
}) => {
  return h('div', {
    className: `flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden ${className}`
  },
    options.map((opt, index) =>
      h('button', {
        key: opt.value,
        onClick: () => !disabled && onChange(opt.value),
        disabled,
        className: `px-3 py-1.5 text-sm font-medium transition-colors ${
          index > 0 ? 'border-l border-gray-300 dark:border-gray-600' : ''
        } ${
          value === opt.value
            ? 'bg-blue-600 text-white'
            : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`
      }, opt.label)
    )
  );
};

export { Button, Input, Select, IconButton, Textarea, SegmentedControl, BUTTON_VARIANTS, BASE_HEIGHT };
