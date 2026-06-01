/**
 * Network Utilities
 *
 * Common network-related helper functions
 */

const clientMeta = require('./clientMeta');

/**
 * Validate IP address format
 * @param {string} ip - IP to validate
 * @returns {boolean}
 */
function isValidIP(ip) {
  if (!ip || typeof ip !== 'string') {
    return false;
  }
  // IPv4
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  // IPv6 (simplified)
  const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;

  return ipv4Regex.test(ip) || ipv6Regex.test(ip);
}

/**
 * aMule client software labels
 * Maps numeric client ID to human-readable name
 */
const CLIENT_SOFTWARE_LABELS = {
  0x00: 'eMule',           // SO_EMULE
  0x01: 'cDonkey',         // SO_CDONKEY
  0x02: '(l/x)Mule',      // SO_LXMULE
  0x03: 'aMule',           // SO_AMULE
  0x04: 'Shareaza',        // SO_SHAREAZA
  0x05: 'eMule+',          // SO_EMULEPLUS
  0x06: 'HydraNode',       // SO_HYDRANODE
  0x0a: 'MLDonkey',        // SO_NEW2_MLDONKEY
  0x14: 'lphant',          // SO_LPHANT
  0x28: 'Shareaza',        // SO_NEW2_SHAREAZA
  0x32: 'eDonkeyHybrid',   // SO_EDONKEYHYBRID
  0x33: 'eDonkey',         // SO_EDONKEY
  0x34: 'Old MLDonkey',    // SO_MLDONKEY
  0x35: 'eMule',           // SO_OLDEMULE
  0x36: 'Unknown',         // SO_UNKNOWN
  0x44: 'Shareaza',        // SO_NEW_SHAREAZA
  0x98: 'MLDonkey',        // SO_NEW_MLDONKEY
  0xff: 'eMule Compatible' // SO_COMPAT_UNK
};

/**
 * Get client software name from upload/peer entry
 * @param {Object} item - Upload or peer item with EC_TAG_CLIENT_SOFTWARE
 * @returns {string} Client software name with version if available
 */
function getClientSoftwareName(item) {
  // For rtorrent, use the client string directly
  if (clientMeta.isBittorrent(item.clientType) || clientMeta.isSoulseek(item.clientType) || item.EC_TAG_CLIENT_SOFTWARE === -1) {
    return item.EC_TAG_CLIENT_SOFT_VER_STR || 'Unknown';
  }
  const baseName = CLIENT_SOFTWARE_LABELS[item.EC_TAG_CLIENT_SOFTWARE] || 'Unknown';
  const version = item.EC_TAG_CLIENT_SOFT_VER_STR;
  return version && version !== 'Unknown' ? `${baseName} ${version}` : baseName;
}

module.exports = {
  isValidIP,
  CLIENT_SOFTWARE_LABELS,
  getClientSoftwareName
};
