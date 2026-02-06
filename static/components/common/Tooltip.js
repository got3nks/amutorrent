/**
 * Tooltip Component
 *
 * Custom tooltip that uses Portal for body-level rendering
 * to avoid overflow clipping issues in scrollable containers
 */

import React from 'https://esm.sh/react@18.2.0';
import Portal from './Portal.js';
import { useTheme } from '../../contexts/ThemeContext.js';

const { createElement: h, useState, useRef, useEffect, useCallback } = React;

/**
 * Tooltip component
 * @param {object} props
 * @param {React.ReactNode} props.children - Element to wrap with tooltip
 * @param {string|React.ReactNode} props.content - Tooltip content
 * @param {string} props.position - Tooltip position: 'top' | 'bottom' | 'left' | 'right'
 * @param {boolean} props.showOnMobile - Whether to show tooltip on mobile (default: true)
 */
const Tooltip = ({ children, content, position = 'top', showOnMobile = true }) => {
  const { theme } = useTheme();
  const [isVisible, setIsVisible] = useState(false);
  const [isMobileActive, setIsMobileActive] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);

  // Arrow color based on theme (matches tooltip bg: gray-900 light, gray-700 dark)
  const arrowColor = theme === 'dark' ? 'rgb(55 65 81)' : 'rgb(17 24 39)';

  const calculatePosition = useCallback(() => {
    if (!triggerRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipEl = tooltipRef.current;

    // Default tooltip dimensions if not yet rendered
    const tooltipWidth = tooltipEl?.offsetWidth || 150;
    const tooltipHeight = tooltipEl?.offsetHeight || 40;

    const gap = 8; // Gap between trigger and tooltip
    const viewportPadding = 8; // Minimum padding from viewport edges

    let top = 0;
    let left = 0;

    switch (position) {
      case 'top':
        top = triggerRect.top - tooltipHeight - gap;
        left = triggerRect.left + (triggerRect.width / 2) - (tooltipWidth / 2);
        break;
      case 'bottom':
        top = triggerRect.bottom + gap;
        left = triggerRect.left + (triggerRect.width / 2) - (tooltipWidth / 2);
        break;
      case 'left':
        top = triggerRect.top + (triggerRect.height / 2) - (tooltipHeight / 2);
        left = triggerRect.left - tooltipWidth - gap;
        break;
      case 'right':
        top = triggerRect.top + (triggerRect.height / 2) - (tooltipHeight / 2);
        left = triggerRect.right + gap;
        break;
      default:
        top = triggerRect.top - tooltipHeight - gap;
        left = triggerRect.left + (triggerRect.width / 2) - (tooltipWidth / 2);
    }

    // Prevent tooltip from going off-screen horizontally
    const maxLeft = window.innerWidth - tooltipWidth - viewportPadding;
    left = Math.max(viewportPadding, Math.min(left, maxLeft));

    // Prevent tooltip from going off-screen vertically
    const maxTop = window.innerHeight - tooltipHeight - viewportPadding;
    top = Math.max(viewportPadding, Math.min(top, maxTop));

    setTooltipPosition({ top, left });
  }, [position]);

  // Recalculate position when tooltip becomes visible
  useEffect(() => {
    if (isVisible || isMobileActive) {
      // Calculate immediately
      calculatePosition();
      // Recalculate after a frame to account for tooltip render
      requestAnimationFrame(calculatePosition);
    }
  }, [isVisible, isMobileActive, calculatePosition]);

  const handleMouseEnter = () => {
    setIsVisible(true);
  };

  const handleMouseLeave = () => {
    setIsVisible(false);
  };

  const handleClick = (e) => {
    // On mobile, toggle tooltip on click/tap (only if showOnMobile is true)
    if ('ontouchstart' in window && showOnMobile) {
      e.stopPropagation();
      setIsMobileActive(!isMobileActive);
    }
  };

  // Close mobile tooltip when clicking outside
  useEffect(() => {
    if (isMobileActive) {
      const handleClickOutside = () => setIsMobileActive(false);
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [isMobileActive]);

  const showTooltip = isVisible || isMobileActive;

  // If no content, just render children without tooltip
  if (!content) {
    return children;
  }

  // Arrow position styles (using dynamic arrowColor for theme support)
  const arrowStyles = {
    top: { bottom: '-6px', left: '50%', transform: 'translateX(-50%)', borderWidth: '6px 6px 0 6px', borderColor: `${arrowColor} transparent transparent transparent` },
    bottom: { top: '-6px', left: '50%', transform: 'translateX(-50%)', borderWidth: '0 6px 6px 6px', borderColor: `transparent transparent ${arrowColor} transparent` },
    left: { right: '-6px', top: '50%', transform: 'translateY(-50%)', borderWidth: '6px 0 6px 6px', borderColor: `transparent transparent transparent ${arrowColor}` },
    right: { left: '-6px', top: '50%', transform: 'translateY(-50%)', borderWidth: '6px 6px 6px 0', borderColor: `transparent ${arrowColor} transparent transparent` }
  };

  return h('div', {
    ref: triggerRef,
    className: 'inline-block',
    onMouseEnter: handleMouseEnter,
    onMouseLeave: handleMouseLeave,
    onClick: handleClick
  },
    children,
    showTooltip && h(Portal, { containerId: 'tooltip-portal' },
      h('div', {
        ref: tooltipRef,
        className: `fixed z-[9999] px-3 py-2 text-xs text-white bg-gray-900 dark:bg-gray-700 rounded-lg shadow-xl pointer-events-none ${showOnMobile ? '' : 'hidden sm:block'}`,
        style: {
          top: `${tooltipPosition.top}px`,
          left: `${tooltipPosition.left}px`,
          width: 'max-content',
          maxWidth: '300px',
          whiteSpace: 'normal',
          wordWrap: 'break-word'
        }
      },
        content,
        // Arrow
        h('div', {
          className: 'absolute w-0 h-0',
          style: {
            ...arrowStyles[position],
            borderStyle: 'solid'
          }
        })
      )
    )
  );
};

export default Tooltip;
