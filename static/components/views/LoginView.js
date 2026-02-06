/**
 * Login View
 * Full-page login form for authentication
 */

import React from 'https://esm.sh/react@18.2.0';
const { createElement: h, useState } = React;
import { useAuth } from '../../contexts/AuthContext.js';
import { Icon, Button, Input } from '../common/index.js';

export default function LoginView() {
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login, error, clearError } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!password) {
      return;
    }

    setIsSubmitting(true);
    const success = await login(password, rememberMe);

    if (success) {
      // Redirect to home
      window.location.href = '/';
    } else {
      setIsSubmitting(false);
    }
  };

  return h('div', { className: 'min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4' },
    h('div', { className: 'max-w-md w-full space-y-8' },
      // Header
      h('div', { className: 'text-center' },
        h('div', { className: 'flex justify-center mb-6' },
          h('div', { className: 'w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg' },
            h(Icon, { name: 'lock', size: 40, className: 'text-white' })
          )
        ),
        h('h2', { className: 'text-3xl font-bold text-gray-900 dark:text-white' }, 'aMuTorrent'),
        h('p', { className: 'mt-2 text-sm text-gray-600 dark:text-gray-400' }, 'Enter your password to continue')
      ),

      // Login Form
      h('div', { className: 'bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8' },
        h('form', { className: 'space-y-6', onSubmit: handleSubmit },
          // Error Message
          error && h('div', { className: 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4' },
            h('div', { className: 'flex items-start' },
              h(Icon, { name: 'warning', size: 20, className: 'text-red-600 dark:text-red-400 mt-0.5 mr-3 flex-shrink-0' }),
              h('div', { className: 'flex-1' },
                h('p', { className: 'text-sm text-red-800 dark:text-red-200 font-medium' }, error)
              ),
              h('button', {
                type: 'button',
                onClick: clearError,
                className: 'text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200 ml-3'
              },
                h(Icon, { name: 'close', size: 16 })
              )
            )
          ),

          // Password Field
          h('div', {},
            h('label', {
              htmlFor: 'password',
              className: 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'
            }, 'Password'),
            h('div', { className: 'relative' },
              h('input', {
                id: 'password',
                type: showPassword ? 'text' : 'password',
                value: password,
                onChange: (e) => setPassword(e.target.value),
                className: 'appearance-none block w-full px-3 sm:px-4 py-2 sm:py-3 pr-12 text-base sm:text-sm border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white transition-colors',
                placeholder: 'Enter your password',
                required: true,
                autoFocus: true,
                disabled: isSubmitting
              }),
              h('button', {
                type: 'button',
                onClick: () => setShowPassword(!showPassword),
                className: 'absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors',
                tabIndex: '-1'
              },
                h(Icon, {
                  name: showPassword ? 'eye-off' : 'eye',
                  size: 20
                })
              )
            )
          ),

          // Remember Me
          h('div', { className: 'flex items-center' },
            h('input', {
              id: 'rememberMe',
              type: 'checkbox',
              checked: rememberMe,
              onChange: (e) => setRememberMe(e.target.checked),
              className: 'h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer',
              disabled: isSubmitting
            }),
            h('label', {
              htmlFor: 'rememberMe',
              className: 'ml-2 block text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none'
            }, 'Remember me for 30 days')
          ),

          // Submit Button
          h(Button, {
            type: 'submit',
            variant: 'primary',
            disabled: isSubmitting || !password,
            className: 'w-full justify-center py-3'
          },
            isSubmitting
              ? [
                  h('svg', {
                    key: 'spinner',
                    className: 'animate-spin -ml-1 mr-3 h-5 w-5 text-white',
                    xmlns: 'http://www.w3.org/2000/svg',
                    fill: 'none',
                    viewBox: '0 0 24 24'
                  },
                    h('circle', { className: 'opacity-25', cx: '12', cy: '12', r: '10', stroke: 'currentColor', strokeWidth: '4' }),
                    h('path', { className: 'opacity-75', fill: 'currentColor', d: 'M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z' })
                  ),
                  'Signing in...'
                ]
              : 'Sign in'
          )
        )
      ),

      // Footer
      // h('p', { className: 'text-center text-xs text-gray-500 dark:text-gray-400' }, 'Powered by aMuTorrent')
    )
  );
}
