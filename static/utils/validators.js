/**
 * Validation Utilities
 *
 * Functions for extracting and validating data
 */

/**
 * Extract the links the ed2k-add path handles from text — ed2k:// and rucio:
 * (a Rucio magnet). Allows pasting mixed text containing them.
 * @param {string} text - Text that may contain such links
 * @returns {string[]} Array of unique links
 */
export const extractEd2kLinks = (text) => {
  // Any substring starting with ed2k:// or rucio: up to the first whitespace.
  const matches = text.match(/(?:ed2k:\/\/|rucio:)\S+/g) || [];

  // Basic cleanup: trim, remove CR characters, and deduplicate while preserving order
  const seen = new Set();
  const links = [];
  for (const m of matches) {
    const link = m.trim().replace(/\r/g, "");
    if (!link) continue;
    if (seen.has(link)) continue;
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
