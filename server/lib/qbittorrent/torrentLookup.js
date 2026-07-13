/**
 * Hash resolution helpers for the qBittorrent compatibility layer.
 */

/**
 * @param {string} hash - Requested hash (BTIH or ED2K)
 * @param {object} info - qBittorrent info object from convertToQBittorrentInfo()
 * @param {string} fileHash - Raw ED2K hash from the download item
 * @param {function(string): string|null} getEd2kHash
 */
function matchesTorrentHash(hash, info, fileHash, getEd2kHash) {
  const lower = String(hash).toLowerCase();
  const infoHash = String(info.hash || '').toLowerCase();
  const ed2k = String(fileHash || '').toLowerCase();
  const mappedEd2k = getEd2kHash(lower);

  return infoHash === lower
    || ed2k === lower
    || (!!mappedEd2k && ed2k === mappedEd2k.toLowerCase());
}

module.exports = { matchesTorrentHash };
