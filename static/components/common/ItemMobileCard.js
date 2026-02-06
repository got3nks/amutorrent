/**
 * ItemMobileCard Component
 *
 * Generic card shell for mobile list items.
 * Provides consistent card styling with selection/context highlighting.
 * Wraps any view-specific card content (downloads, shared, uploads, etc.).
 */

import React from 'https://esm.sh/react@18.2.0';
import { TABLE_ROW_STYLES } from '../../utils/constants.js';

const { createElement: h } = React;

// Card-specific styles (border added to row styles)
const CARD_BORDER = 'border-gray-200 dark:border-gray-600';

/**
 * @param {Object} props
 * @param {boolean} props.isSelected - Whether the item is selected
 * @param {boolean} props.isContextTarget - Whether item is context menu target
 * @param {number} [props.idx] - Item index for alternating backgrounds
 * @param {Object} [props.categoryStyle] - Optional border style for category coloring
 * @param {boolean} [props.selectionMode] - Whether selection mode is active
 * @param {function} [props.onSelectionToggle] - Handler for selection toggle (entire card clickable in selection mode)
 * @param {React.ReactNode} props.children - Card content
 */
const ItemMobileCard = ({ isSelected, isContextTarget, idx, categoryStyle, selectionMode, onSelectionToggle, children }) => {
  const cardBase = 'rounded-xl border p-3 sm:p-3.5 transition-colors';
  let cardColors;
  if (isSelected) {
    cardColors = 'bg-purple-50 dark:bg-purple-900/40 border-purple-300 dark:border-purple-700';
  } else if (isContextTarget) {
    cardColors = 'bg-indigo-50 dark:bg-indigo-900/40 border-indigo-300 dark:border-indigo-600';
  } else if (idx != null && idx % 2 === 0) {
    cardColors = `${TABLE_ROW_STYLES.rowEven} ${CARD_BORDER}`;
  } else {
    cardColors = `${TABLE_ROW_STYLES.rowOdd} ${CARD_BORDER}`;
  }

  // In selection mode, entire card is clickable
  const isClickable = selectionMode && onSelectionToggle;

  return h('div', {
    className: `${cardBase} ${cardColors}${isClickable ? ' cursor-pointer' : ''}`,
    style: categoryStyle || {},
    onClick: isClickable ? onSelectionToggle : undefined
  }, children);
};

export default ItemMobileCard;
