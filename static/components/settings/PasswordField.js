/**
 * PasswordField Component
 *
 * Password input with show/hide toggle
 */

import React from 'https://esm.sh/react@18.2.0';
const { createElement: h, useState } = React;

/**
 * PasswordField component
 * @param {string} value - Field value
 * @param {function} onChange - Change handler
 * @param {string} placeholder - Placeholder text
 * @param {boolean} disabled - Disabled state
 */
const PasswordField = ({ value, onChange, placeholder, disabled = false }) => {
  const [showPassword, setShowPassword] = useState(false);

  return h('div', { className: 'relative' },
    h('input', {
      type: showPassword ? 'text' : 'password',
      value: value || '',
      onChange: (e) => onChange(e.target.value),
      placeholder,
      disabled,
      className: `w-full px-3 py-2 pr-10 border rounded-lg
        bg-white dark:bg-gray-700
        border-gray-300 dark:border-gray-600
        text-gray-900 dark:text-gray-100
        placeholder-gray-400 dark:placeholder-gray-500
        focus:ring-2 focus:ring-blue-500 focus:border-blue-500
        disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed`
    }),
    h('button', {
      type: 'button',
      onClick: () => setShowPassword(!showPassword),
      className: 'absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200',
      title: showPassword ? 'Hide password' : 'Show password'
    },
      h('svg', {
        className: 'w-5 h-5',
        fill: 'none',
        stroke: 'currentColor',
        viewBox: '0 0 24 24'
      },
        showPassword
          ? h('path', {
              strokeLinecap: 'round',
              strokeLinejoin: 'round',
              strokeWidth: 2,
              d: 'M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21'
            })
          : h('path', {
              strokeLinecap: 'round',
              strokeLinejoin: 'round',
              strokeWidth: 2,
              d: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z'
            })
      )
    )
  );
};

export default PasswordField;
