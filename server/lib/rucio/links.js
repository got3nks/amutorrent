'use strict';

const { parseEd2kLink } = require('../torrentUtils');

/**
 * Pull the content hash out of a link the Rucio backend handles: the MD4 from an
 * ed2k link (`ed2k://|file|name|size|<32-hex>|/`) or the BLAKE3 from a rucio:
 * magnet (`rucio:<64-hex>?…`). Lower-cased to match the unified item hashes.
 * Shared by rucioManager (keying search results / downloads) and
 * webSocketHandlers (recording ownership) so the two can't drift. The ed2k half
 * reuses the field-based parseEd2kLink (the base manager default uses it too), so
 * a 32-hex file name is never mistaken for the hash.
 * @param {string} link
 * @returns {string|null} the lower-cased hash, or null if the link carries none
 */
function hashFromLink(link) {
  if (!link) return null;
  const ed2k = parseEd2kLink(link).hash;
  if (ed2k) return ed2k;
  const rucio = link.match(/^rucio:([a-fA-F0-9]{64})/i); // rucio:<blake3>?...
  if (rucio) return rucio[1].toLowerCase();
  return null;
}

module.exports = { hashFromLink };
