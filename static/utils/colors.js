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
 * @param {object} category - Category object with hexColor property
 * @param {boolean} isDefault - Whether this is the default category
 * @returns {object|null} Style object with borderLeft and boxShadow, or null if no color
 */
export const getCategoryColorStyle = (category, isDefault = false) => {
  if (isDefault || !category || !category.hexColor) {
    return null;
  }

  const hexColor = category.hexColor;

  return {
    borderLeft: `4px solid ${hexColor}`,
    boxShadow: `inset 4px 0 8px -4px ${hexColor}40`
  };
};

/**
 * Get hex color from category (prefers hexColor field)
 * @param {object|string|number} colorOrCategory - Category object, hex string, or legacy integer
 * @returns {string} Hex color string (e.g., "#FF0000")
 */
export const categoryColorToHex = (colorOrCategory) => {
  if (!colorOrCategory) return '#CCCCCC';
  // If it's an object with hexColor, use that
  if (typeof colorOrCategory === 'object' && colorOrCategory.hexColor) {
    return colorOrCategory.hexColor;
  }
  // If it's already a hex string, return it
  if (typeof colorOrCategory === 'string') {
    return colorOrCategory.startsWith('#') ? colorOrCategory : `#${colorOrCategory}`;
  }
  // Fallback for legacy integer (shouldn't happen with unified system)
  return '#CCCCCC';
};

/**
 * Parse hex color - just returns the hex string as-is
 * (BGR conversion happens in backend CategoryManager)
 * @param {string} hexColor - Hex color string (e.g., "#FF0000")
 * @returns {string} Hex color string
 */
export const hexToCategoryColor = (hexColor) => {
  return hexColor;
};
