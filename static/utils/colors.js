/**
 * Color Utilities
 *
 * Functions for calculating colors and styles
 */

/**
 * Get progress bar color based on completion percentage
 * @param {number} percent - Percentage (0-100)
 * @returns {string} Tailwind CSS class for background color
 */
export const getProgressColor = (percent) => {
  if (percent < 25) return 'bg-red-500';
  if (percent < 50) return 'bg-orange-500';
  if (percent < 75) return 'bg-yellow-500';
  return 'bg-green-500';
};

/**
 * Get category color border style for mobile cards
 * @param {object} category - Category object with color property
 * @param {boolean} isDefault - Whether this is the default category
 * @returns {object|null} Style object with borderLeft and boxShadow, or null if no color
 */
export const getCategoryColorStyle = (category, isDefault = false) => {
  if (isDefault || !category || category.color === null || category.color === 0) {
    return null;
  }

  const hexColor = `#${category.color.toString(16).padStart(6, '0')}`;

  return {
    borderLeft: `4px solid ${hexColor}`,
    boxShadow: `inset 4px 0 8px -4px ${hexColor}40`
  };
};

/**
 * Convert category color to hex string
 * @param {number} color - Category color as uint32
 * @returns {string} Hex color string (e.g., "#FF0000")
 */
export const categoryColorToHex = (color) => {
  if (!color || color === 0) return '#CCCCCC';
  return `#${color.toString(16).padStart(6, '0')}`;
};

/**
 * Parse hex color to uint32 for category
 * @param {string} hexColor - Hex color string (e.g., "#FF0000")
 * @returns {number} Color as uint32
 */
export const hexToCategoryColor = (hexColor) => {
  const hex = hexColor.replace('#', '');
  return parseInt(hex, 16);
};
