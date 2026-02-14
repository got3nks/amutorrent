/**
 * Login View
 * Full-page login form for authentication
 */

import React from 'https://esm.sh/react@18.2.0';
const { createElement: h, useState, useEffect, useRef, useCallback } = React;
import { useAuth } from '../../contexts/AuthContext.js';
import { Icon, Button, Input } from '../common/index.js';

function formatCountdown(seconds) {
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  return `${seconds}s`;
}

export default function LoginView() {
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingDelay, setPendingDelay] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [retryCountdown, setRetryCountdown] = useState(0);
  const countdownRef = useRef(null);
  const retryRef = useRef(null);

  const { login, error, clearError, loginDelay } = useAuth();

  // Countdown during submission (progressive delay)
  useEffect(() => {
    if (countdown <= 0) {
      clearInterval(countdownRef.current);
      return;
    }
    countdownRef.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(countdownRef.current);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(countdownRef.current);
  }, [countdown > 0]);

  // Countdown for rate-limited wait
  useEffect(() => {
    if (retryCountdown <= 0) {
      clearInterval(retryRef.current);
      return;
    }
    retryRef.current = setInterval(() => {
      setRetryCountdown(c => {
        if (c <= 1) {
          clearInterval(retryRef.current);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(retryRef.current);
  }, [retryCountdown > 0]);

  // Initialize timers from server-reported delay on mount
  useEffect(() => {
    if (loginDelay.retryAfter > 0) {
      setRetryCountdown(loginDelay.retryAfter);
    } else if (loginDelay.retryDelay > 0) {
      setPendingDelay(loginDelay.retryDelay);
    }
  }, [loginDelay]);

  const handleClearError = useCallback(() => {
    clearError();
    setRetryCountdown(0);
  }, [clearError]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!password) {
      return;
    }

    setIsSubmitting(true);
    setRetryCountdown(0);

    // Start countdown if we know a delay is coming
    if (pendingDelay > 0) {
      setCountdown(pendingDelay);
    }

    const result = await login(password, rememberMe);

    if (result.success) {
      // Redirect to home
      window.location.href = '/';
    } else {
      setIsSubmitting(false);
      setCountdown(0);
      setPendingDelay(result.retryDelay || 0);

      if (result.retryAfter > 0) {
        setRetryCountdown(result.retryAfter);
      }
    }
  };

  const isFormDisabled = isSubmitting || retryCountdown > 0;

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
          // Error Message (also shown on page load when IP is blocked)
          (error || retryCountdown > 0) && h('div', { className: 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4' },
            h('div', { className: 'flex items-start' },
              h(Icon, { name: 'warning', size: 20, className: 'text-red-600 dark:text-red-400 mt-0.5 mr-3 flex-shrink-0' }),
              h('div', { className: 'flex-1' },
                h('p', { className: 'text-sm text-red-800 dark:text-red-200 font-medium' },
                  error || 'Too many failed attempts.'
                ),
                retryCountdown > 0 && h('p', { className: 'text-sm text-red-600 dark:text-red-300 mt-1' },
                  `Try again in ${formatCountdown(retryCountdown)}`
                )
              ),
              h('button', {
                type: 'button',
                onClick: handleClearError,
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
                disabled: isFormDisabled
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
              disabled: isFormDisabled
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
            disabled: isFormDisabled || !password,
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
                  countdown > 0 ? `Signing in... ${countdown}s` : 'Signing in...'
                ]
              : retryCountdown > 0
                ? `Wait ${formatCountdown(retryCountdown)}`
                : 'Sign in'
          )
        )
      ),

      // Footer
      // h('p', { className: 'text-center text-xs text-gray-500 dark:text-gray-400' }, 'Powered by aMuTorrent')
    )
  );
}
