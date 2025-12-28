/**
 * Link Converter - Convert between ED2K and magnet link formats
 *
 * ED2K Link Format:
 *   ed2k://|file|<filename>|<size>|<hash>|/
 *
 * Magnet Link Format (for Sonarr/Radarr compatibility):
 *   magnet:?xt=urn:btih:<hash_padded>&dn=<filename>&xl=<size>
 *
 * Design: ED2K hashes are MD4-based (32 hex chars) while BitTorrent info hashes
 * are SHA-1 (40 hex chars). To make Sonarr/Radarr accept our ED2K links, we:
 * 1. Pad ED2K hashes with 8 zeros (00000000) to create 40-char "fake" BitTorrent hashes
 * 2. Use urn:btih prefix so Sonarr's MonoTorrent library accepts them
 * 3. Strip the padding when converting back to ED2K links in the download client
 *
 * This allows clean round-trip conversion while maintaining compatibility with
 * Sonarr/Radarr which validate magnet links before sending to download clients.
 */

/**
 * Convert ED2K link or hash to magnet link
 * @param {string} hashOrLink - ED2K hash or full ed2k:// link
 * @param {string} fileName - File name (optional if full link provided)
 * @param {number} fileSize - File size in bytes (optional if full link provided)
 * @returns {object} { magnetLink, magnetHash, ed2kHash }
 */
function convertEd2kToMagnet(hashOrLink, fileName = null, fileSize = null) {
  let hash, name, size;

  // Parse if it's a full ed2k link
  if (hashOrLink.startsWith('ed2k://')) {
    const parsed = parseEd2kLink(hashOrLink);
    hash = parsed.hash;
    name = parsed.fileName;
    size = parsed.fileSize;
  } else {
    // Just a hash
    hash = hashOrLink.toLowerCase();
    name = fileName || 'unknown';
    size = fileSize || 0;
  }

  // Generate magnet link with BitTorrent URN format for Sonarr compatibility
  // ED2K hashes are 32 hex chars (MD4), BitTorrent info hashes are 40 hex chars (SHA-1)
  // We pad with 8 zeros at the end to make it look like a valid BitTorrent hash
  const magnetHash = hash + '00000000';
  const dn = encodeURIComponent(name);

  return {
    magnetLink: `magnet:?xt=urn:btih:${magnetHash}&dn=${dn}&xl=${size}`,
    magnetHash: magnetHash,
    ed2kHash: hash
  };
}

/**
 * Convert magnet link to ED2K link
 * @param {string} magnetLink - Magnet link with urn:btih or urn:ed2k format
 * @returns {object} { ed2kLink, ed2kHash, magnetHash, fileName, fileSize }
 * @throws {Error} If magnet link is not an ED2K magnet
 */
function convertMagnetToEd2k(magnetLink) {
  // Parse magnet link
  const params = new URLSearchParams(magnetLink.split('?')[1] || '');

  // Extract hash from xt parameter
  const xt = params.get('xt') || '';
  let hash, magnetHash;

  // Try new format: urn:btih with padded ED2K hash (40 chars, ending in 00000000)
  const btihMatch = xt.match(/urn:btih:([a-fA-F0-9]{40})/i);
  if (btihMatch) {
    magnetHash = btihMatch[1].toLowerCase();
    // Remove the padding (last 8 zeros) to get the ED2K hash
    if (magnetHash.endsWith('00000000')) {
      hash = magnetHash.substring(0, 32);
    } else {
      throw new Error('Invalid magnet link: BitTorrent hash does not have ED2K padding');
    }
  } else {
    // Try legacy format: urn:ed2k
    const ed2kMatch = xt.match(/urn:ed2k:([a-fA-F0-9]+)/i);
    if (ed2kMatch) {
      hash = ed2kMatch[1].toLowerCase();
      magnetHash = hash;
    } else {
      throw new Error('Invalid magnet link: not an ED2K magnet (expected urn:btih with padding or urn:ed2k)');
    }
  }

  const fileName = decodeURIComponent(params.get('dn') || 'unknown');
  const fileSize = params.get('xl') || '0';

  // Construct ED2K link
  const ed2kLink = `ed2k://|file|${fileName}|${fileSize}|${hash}|/`;

  return {
    ed2kLink,
    ed2kHash: hash,
    magnetHash: magnetHash,
    fileName,
    fileSize: parseInt(fileSize, 10)
  };
}

/**
 * Parse ED2K link into components
 * @param {string} ed2kLink - Full ed2k:// link
 * @returns {object} { fileName, fileSize, hash }
 * @throws {Error} If link format is invalid
 */
function parseEd2kLink(ed2kLink) {
  // Format: ed2k://|file|filename|size|hash|/
  const parts = ed2kLink.split('|');

  if (parts.length < 5 || parts[0] !== 'ed2k://' || parts[1] !== 'file') {
    throw new Error('Invalid ED2K link format (expected: ed2k://|file|filename|size|hash|/)');
  }

  return {
    fileName: parts[2],
    fileSize: parseInt(parts[3], 10),
    hash: parts[4].toLowerCase()
  };
}

module.exports = {
  convertEd2kToMagnet,
  convertMagnetToEd2k,
  parseEd2kLink
};
