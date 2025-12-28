/**
 * Tooltip Component
 *
 * Custom tooltip that works reliably on desktop and mobile
 */

import React from 'https://esm.sh/react@18.2.0';

const { createElement: h, useState } = React;

/**
 * Tooltip component
 * @param {object} props
 * @param {React.ReactNode} props.children - Element to wrap with tooltip
 * @param {string} props.content - Tooltip text content
 * @param {string} props.position - Tooltip position: 'top' | 'bottom' | 'left' | 'right'
 */
const Tooltip = ({ children, content, position = 'top' }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isMobileActive, setIsMobileActive] = useState(false);

  if (!content) {
    return children;
  }

  const handleMouseEnter = () => {
    setIsVisible(true);
  };

  const handleMouseLeave = () => {
    setIsVisible(false);
  };

  const handleClick = (e) => {
    // On mobile, toggle tooltip on click/tap
    if ('ontouchstart' in window) {
      e.stopPropagation();
      setIsMobileActive(!isMobileActive);
    }
  };

  // Close mobile tooltip when clicking outside
  React.useEffect(() => {
    if (isMobileActive) {
      const handleClickOutside = () => setIsMobileActive(false);
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [isMobileActive]);

  const showTooltip = isVisible || isMobileActive;

  // Position classes
  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2'
  };

  // Arrow classes
  const arrowClasses = {
    top: 'top-full left-1/2 -translate-x-1/2 border-t-gray-900 dark:border-t-gray-700',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-gray-900 dark:border-b-gray-700',
    left: 'left-full top-1/2 -translate-y-1/2 border-l-gray-900 dark:border-l-gray-700',
    right: 'right-full top-1/2 -translate-y-1/2 border-r-gray-900 dark:border-r-gray-700'
  };

  return h('div', {
    className: 'relative inline-block',
    onMouseEnter: handleMouseEnter,
    onMouseLeave: handleMouseLeave,
    onClick: handleClick
  },
    children,
    showTooltip && h('div', {
      className: `absolute z-[9999] px-3 py-2 text-xs text-white bg-gray-900 dark:bg-gray-700 rounded-lg shadow-xl pointer-events-none ${positionClasses[position]}`,
      style: {
        maxWidth: '300px',
        minWidth: '150px',
        whiteSpace: 'normal',
        wordWrap: 'break-word'
      }
    },
      content,
      // Arrow
      h('div', {
        className: `absolute w-0 h-0 border-4 border-transparent ${arrowClasses[position]}`
      })
    )
  );
};

export default Tooltip;
