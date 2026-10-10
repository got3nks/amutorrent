/**
 * Shared Torrent Utilities
 *
 * Common parsing functions used by both rTorrent and qBittorrent managers.
 * Extracted to avoid code duplication.
 */

'use strict';

const crypto = require('crypto');
const logger = require('./logger');

/**
 * Convert base32 to hex (for magnet links with base32 hashes)
 * @param {string} base32 - Base32 encoded string
 * @returns {string} Hex string
 */
function base32ToHex(base32) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of base32.toUpperCase()) {
    const val = alphabet.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  let hex = '';
  for (let i = 0; i + 4 <= bits.length; i += 4) {
    hex += parseInt(bits.substr(i, 4), 2).toString(16);
  }
  return hex;
}

/**
 * Parse magnet URI to extract hash and name
 * @param {string} magnetUri - Magnet URI
 * @returns {Object} { hash, name }
 */
function parseMagnetUri(magnetUri) {
  let hash = null;
  let name = null;

  try {
    // Extract hash from xt=urn:btih:HASH
    const hashMatch = magnetUri.match(/xt=urn:btih:([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})/i);
    if (hashMatch) {
      hash = hashMatch[1];
      // Convert base32 to hex if needed (32 chars = base32, 40 chars = hex)
      if (hash.length === 32) {
        hash = base32ToHex(hash);
      }
      hash = hash.toLowerCase();
    }

    // Extract name from dn= parameter
    const nameMatch = magnetUri.match(/dn=([^&]+)/);
    if (nameMatch) {
      name = decodeURIComponent(nameMatch[1].replace(/\+/g, ' '));
    }
  } catch (err) {
    logger.warn('[torrentUtils] Failed to parse magnet URI:', err.message);
  }

  return { hash, name };
}

/**
 * Parse torrent file buffer to extract info hash, name, and size
 * Uses minimal bencode parsing
 * @param {Buffer} torrentData - Raw torrent file data
 * @returns {Object} { hash, name, size }
 */
function parseTorrentBuffer(torrentData) {
  let hash = null;
  let name = null;
  let size = null;

  try {
    // Find the info dictionary in the torrent
    const dataStr = torrentData.toString('binary');
    const infoStart = dataStr.indexOf('4:info');

    if (infoStart !== -1) {
      // Find the info dict boundaries
      const dictStart = infoStart + 6; // After "4:info"

      // Extract the info dictionary for hashing
      // We need to find the matching end of the dictionary
      let depth = 0;
      let pos = dictStart;
      let foundStart = false;

      while (pos < dataStr.length) {
        const char = dataStr[pos];
        if (char === 'd' || char === 'l') {
          if (!foundStart) foundStart = true;
          depth++;
        } else if (char === 'e') {
          depth--;
          if (foundStart && depth === 0) {
            pos++; // Include the final 'e'
            break;
          }
        } else if (char >= '0' && char <= '9') {
          // String length prefix - skip the string
          let lenStr = '';
          while (pos < dataStr.length && dataStr[pos] >= '0' && dataStr[pos] <= '9') {
            lenStr += dataStr[pos];
            pos++;
          }
          pos++; // Skip the ':'
          pos += parseInt(lenStr, 10); // Skip the string content
          continue;
        } else if (char === 'i') {
          // Integer - skip to 'e'
          while (pos < dataStr.length && dataStr[pos] !== 'e') pos++;
        }
        pos++;
      }

      // Extract info dict and compute SHA1 hash
      const infoDict = torrentData.slice(dictStart, pos);
      hash = crypto.createHash('sha1').update(infoDict).digest('hex').toLowerCase();

      // Try to extract name from the info dict
      const nameMatch = dataStr.match(/4:name(\d+):/);
      if (nameMatch) {
        const nameLen = parseInt(nameMatch[1], 10);
        const nameStart = dataStr.indexOf(nameMatch[0]) + nameMatch[0].length;
        name = dataStr.slice(nameStart, nameStart + nameLen);
      }

      // Try to extract size
      // Single file: look for "6:lengthi<number>e" (but not inside files list)
      // Multi-file: sum all lengths in "5:files" list
      const filesMatch = dataStr.indexOf('5:filesl');
      if (filesMatch !== -1 && filesMatch > infoStart) {
        // Multi-file torrent: sum all file lengths
        // Find all "6:lengthi<number>e" patterns after "5:files"
        const lengthRegex = /6:lengthi(\d+)e/g;
        let match;
        let totalSize = 0;
        // Start searching from files list position
        const filesSection = dataStr.slice(filesMatch);
        while ((match = lengthRegex.exec(filesSection)) !== null) {
          totalSize += parseInt(match[1], 10);
        }
        if (totalSize > 0) {
          size = totalSize;
        }
      } else {
        // Single file: look for length field
        const lengthMatch = dataStr.match(/6:lengthi(\d+)e/);
        if (lengthMatch) {
          size = parseInt(lengthMatch[1], 10);
        }
      }
    }
  } catch (err) {
    logger.warn('[torrentUtils] Failed to parse torrent file:', err.message);
  }

  return { hash, name, size };
}

/**
 * Parse ed2k link to extract hash, filename, and size
 * @param {string} link - ed2k:// link
 * @returns {Object} { hash, filename, size }
 */
function parseEd2kLink(link) {
  try {
    // Name may be empty ([^|]*, not +): the hash is still pinned to its field
    // (after the numeric size), so a 32-hex file name can't be read as the hash,
    // while an empty-name ed2k link still yields its hash instead of null.
    const match = link.match(/ed2k:\/\/\|file\|([^|]*)\|(\d+)\|([a-fA-F0-9]{32})\|/);
    if (match) {
      // Decode the name best-effort: a stray '%' (e.g. "50%OFF Movie.avi") makes
      // decodeURIComponent throw, which must NOT drop the hash — keep the raw name
      // and still return the hash/size (used for ownership, keying and history).
      let filename = match[1];
      try { filename = decodeURIComponent(filename); } catch { /* keep the raw name */ }
      return {
        filename,
        size: parseInt(match[2], 10),
        hash: match[3].toLowerCase()
      };
    }
  } catch (err) {
    logger.warn('[torrentUtils] Failed to parse ed2k link:', err.message);
  }
  return { hash: null, filename: null, size: null };
}

module.exports = {
  base32ToHex,
  parseMagnetUri,
  parseTorrentBuffer,
  parseEd2kLink
};
