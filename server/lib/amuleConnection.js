/**
 * aMule connection security: one level per instance, mapped to amule-ec-node's
 * encryption and allowLegacyAuth options.
 *
 * The library's own defaults refuse every released aMule reached over a
 * network, Docker networking included, so the default here stays compatible:
 * encryption and SRP are still used whenever the core offers them.
 */

const logger = require('./logger');

const SECURITY_LEVELS = {
  compatible: { encryption: 'prefer', allowLegacyAuth: true },   // aMule 2.3.3 and later
  encrypted: { encryption: 'require', allowLegacyAuth: true },   // aMule 3.1 and later
  strict: { encryption: 'require', allowLegacyAuth: false }      // aMule 3.3 and later (SRP)
};

const DEFAULT_SECURITY = 'compatible';

const CIPHER_LABELS = {
  'aes-128-gcm': 'AES-128-GCM',
  'chacha20-poly1305': 'ChaCha20-Poly1305'
};

// The client is rebuilt on every reconnect; warn about a bad value once.
const warnedValues = new Set();

/**
 * @param {string} [security] - Configured level; unset or invalid means the default
 * @returns {string} A key of SECURITY_LEVELS
 */
function normalizeSecurity(security) {
  if (security === undefined || security === null || security === '') return DEFAULT_SECURITY;
  const value = String(security).trim().toLowerCase();
  if (SECURITY_LEVELS[value]) return value;
  if (!warnedValues.has(value)) {
    warnedValues.add(value);
    logger.warn(`⚠️  aMule connection security "${security}" is not one of ${Object.keys(SECURITY_LEVELS).join(', ')}; using ${DEFAULT_SECURITY}`);
  }
  return DEFAULT_SECURITY;
}

/**
 * amule-ec-node options for a security level.
 * @param {string} [security]
 * @returns {{ encryption: string, allowLegacyAuth: boolean }}
 */
function amuleSecurityOptions(security) {
  return { ...SECURITY_LEVELS[normalizeSecurity(security)] };
}

/**
 * Turn the library's security refusals into the setting to change.
 * @param {Error} err
 * @returns {string|null} A hint, or null for any other error
 */
function amuleSecurityHint(err) {
  const msg = err?.message || '';
  if (msg.includes('did not negotiate an encrypted channel')) {
    return 'This aMule cannot encrypt the connection (versions before 3.1). Set Connection security to Compatible.';
  }
  if (msg.includes('does not offer SRP')) {
    return 'This aMule does not support SRP login (versions before 3.3). Set Connection security to Encrypted only or Compatible.';
  }
  return null;
}

/**
 * What a connected session negotiated, for display.
 * @param {Object} [session] - amule-ec-node ECProtocol session
 * @returns {string|null} e.g. "encrypted (ChaCha20-Poly1305), SRP login"
 */
function describeAmuleSecurity(session) {
  if (!session) return null;
  const state = session.encryptionState;
  const channel = state?.encrypted
    ? `encrypted (${CIPHER_LABELS[state.cipherName] || state.cipherName || 'unknown cipher'})`
    : 'not encrypted';
  const login = session.srpAuthenticated ? 'SRP login' : 'password login';
  return `${channel}, ${login}`;
}

module.exports = {
  SECURITY_LEVELS,
  DEFAULT_SECURITY,
  normalizeSecurity,
  amuleSecurityOptions,
  amuleSecurityHint,
  describeAmuleSecurity
};
