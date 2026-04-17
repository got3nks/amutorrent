/**
 * StarRating Component
 *
 * Compact read-only star rating (0–5) rendered with unicode ★/☆ glyphs,
 * yellow filled / gray empty. Returns null for falsy / zero values so
 * callers can conditionally render without guarding.
 *
 * For interactive rating input, see FileRatingCommentModal which uses a
 * different visual (hover state, clickable) on purpose.
 */

import React from 'https://esm.sh/react@18.2.0';

const { createElement: h } = React;

const clamp = (n) => Math.max(0, Math.min(5, Math.round(Number(n) || 0)));

/**
 * @param {Object} props
 * @param {number} props.value - 0..5 rating value
 * @param {string} [props.className] - additional classes (e.g. size override)
 * @param {string} [props.title] - optional tooltip
 * @param {boolean} [props.showEmpty] - render ☆ slots when value is 0 (default: false → returns null)
 */
const StarRating = ({ value, className = '', title, showEmpty = false }) => {
  const n = clamp(value);
  if (n === 0 && !showEmpty) return null;
  return h('span', {
    className: `text-yellow-500 whitespace-nowrap ${className}`.trim(),
    title: title || `Rating: ${n}/5`
  }, `${'★'.repeat(n)}${'☆'.repeat(5 - n)}`);
};

export default StarRating;
