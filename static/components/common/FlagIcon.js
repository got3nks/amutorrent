/**
 * FlagIcon Component
 *
 * Displays country flags using SVG from country-flag-icons
 */

import React from 'https://esm.sh/react@18.2.0';

const { createElement: h } = React;
/**
 * FlagIcon component
 * @param {string} country - Country ISO code
 * @param {number} size - Size of the flag in pixels (default: 20)
 * @param {string} className - Additional CSS classes
 * @param {string} title - Tooltip text (defaults to country name)
 */
const FlagIcon = ({ countryCode, size = 20, className = '', title }) => {
  if (!countryCode) {
    return null;
  }

  // Use flag-icons CDN for SVG flags
  const flagUrl = `https://purecatamphetamine.github.io/country-flag-icons/3x2/${countryCode}.svg`;

  return h('img', {
    src: flagUrl,
    alt: title || countryCode,
    title: title || countryCode,
    width: size,
    height: size * 2/3, // 3:2 aspect ratio
    className: `inline-block ${className}`,
    style: {
      verticalAlign: 'middle',
      borderRadius: '2px',
      boxShadow: '0 0 1px rgba(0,0,0,0.3)'
    },
    onError: (e) => {
      // Hide the image if it fails to load
      e.target.style.display = 'none';
    }
  });
};

export default FlagIcon;