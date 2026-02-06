/**
 * AlertBox Component
 *
 * Unified alert/info/warning/error box with left border and icon
 */

import React from 'https://esm.sh/react@18.2.0';
import Icon from './Icon.js';

const { createElement: h } = React;

/**
 * AlertBox component
 * @param {string} type - Type of alert: 'info' | 'warning' | 'error' | 'success'
 * @param {React.ReactNode} children - Alert content
 * @param {string} className - Additional CSS classes
 */
const AlertBox = ({ type = 'info', children, className = '', onAction, actionLabel }) => {
  const styles = {
    info: {
      bg: 'bg-blue-50 dark:bg-blue-900/20',
      border: 'border-blue-400',
      text: 'text-blue-700 dark:text-blue-300',
      icon: 'info',
      iconColor: 'text-blue-400'
    },
    warning: {
      bg: 'bg-yellow-50 dark:bg-yellow-900/20',
      border: 'border-yellow-400',
      text: 'text-yellow-700 dark:text-yellow-300',
      icon: 'alertTriangle',
      iconColor: 'text-yellow-400'
    },
    error: {
      bg: 'bg-red-50 dark:bg-red-900/20',
      border: 'border-red-400',
      text: 'text-red-700 dark:text-red-300',
      icon: 'x',
      iconColor: 'text-red-400'
    },
    success: {
      bg: 'bg-green-50 dark:bg-green-900/20',
      border: 'border-green-400',
      text: 'text-green-700 dark:text-green-300',
      icon: 'check',
      iconColor: 'text-green-400'
    }
  };

  const style = styles[type] || styles.info;

  return h('div', {
    className: `${style.bg} border-l-4 ${style.border} p-4 mb-4 ${className}`
  },
    h('div', { className: 'flex' },
      h('div', { className: 'flex-shrink-0' },
        h(Icon, {
          name: style.icon,
          size: 20,
          className: style.iconColor
        })
      ),
      h('div', { className: `ml-3 flex-1 ${style.text} text-sm break-words whitespace-pre-line` },
        children,
        onAction && h('br'),
        onAction && h('button', {
          onClick: onAction,
          className: 'underline font-medium hover:no-underline'
        }, actionLabel)
      )
    )
  );
};

export default AlertBox;
