/**
 * Validation Utilities
 *
 * Functions for extracting and validating data
 */

// Baseline scheme for the ed2k-add path, used only as a last resort when the
// caller passes none (e.g. a server list with no ed2k-path client connected).
// Callers normally pass the connected clients' own linkSchemes, so an added
// network's scheme (rucio:, …) comes from its capability, not from this generic
// file — nothing could route it here with no instance connected anyway.
export const DEFAULT_ED2K_SCHEMES = ['ed2k://'];

/**
 * Extract the links the ed2k-add path handles from text, for the given schemes.
 * Case-insensitive and anchored to a token boundary, so `Rucio:…` is matched but
 * `foorucio:x` is not. Allows pasting mixed text containing the links.
 * @param {string} text - Text that may contain such links
 * @param {string[]} [schemes] - Link schemes to extract (default: ed2k:// only)
 * @returns {string[]} Array of unique links
 */
export const extractEd2kLinks = (text, schemes = DEFAULT_ED2K_SCHEMES) => {
  if (!text || !schemes || schemes.length === 0) return [];
  const escaped = schemes.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  // (?:^|[^\w]) keeps the scheme from matching inside a word (no lookbehind, for
  // browser support); the link itself is captured in group 1.
  const re = new RegExp(`(?:^|[^\\w])((?:${escaped.join('|')})\\S+)`, 'gi');

  const seen = new Set();
  const links = [];
  for (const m of text.matchAll(re)) {
    const link = m[1].trim().replace(/\r/g, '');
    if (!link || seen.has(link)) continue;
    seen.add(link);
    links.push(link);
  }
  return links;
};

/**
 * Validate if a string is a valid ED2K link
 * @param {string} link - Link to validate
 * @returns {boolean} True if valid ED2K link
 */
export const isValidEd2kLink = (link) => {
  if (!link || typeof link !== 'string') return false;
  return /^ed2k:\/\/\S+/.test(link.trim());
};
