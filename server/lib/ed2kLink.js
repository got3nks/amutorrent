'use strict';

/**
 * Pull the MD4 content hash out of an ed2k link
 * (`ed2k://|file|name|size|<32-hex>|/`), lower-cased to match the unified item
 * hashes. The one place the ed2k-hash regex lives, so the generic default in
 * BaseClientManager and the Rucio link parser can't drift apart.
 * @param {string} link
 * @returns {string|null} the lower-cased hash, or null if the link carries none
 */
function ed2kHashFromLink(link) {
  const m = (link || '').match(/\|([a-fA-F0-9]{32})\|/);
  return m ? m[1].toLowerCase() : null;
}

module.exports = { ed2kHashFromLink };
