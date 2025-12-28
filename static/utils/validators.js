/**
 * Validation Utilities
 *
 * Functions for extracting and validating data
 */

/**
 * Extract ED2K links from text
 * Allows pasting mixed text containing ED2K links
 * @param {string} text - Text that may contain ED2K links
 * @returns {string[]} Array of unique ED2K links
 */
export const extractEd2kLinks = (text) => {
  // Extract any substring starting with ed2k:// until the first whitespace.
  // This allows pasting mixed text containing ED2K links.
  const matches = text.match(/ed2k:\/\/\S+/g) || [];

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
