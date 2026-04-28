/**
 * Trusted Proxy SSO Middleware
 * Authenticates users via reverse proxy headers (e.g., Authelia, Authentik).
 * Runs after session middleware, before requireAuth.
 *
 * Flow:
 * 1. Check if trusted proxy is enabled and session is not already authenticated
 * 2. Validate source IP is from a trusted network (req.socket.remoteAddress only — never forwarded headers)
 * 3. Read username from configured header
 * 4. Look up or auto-provision user
 * 5. Create session with full user identity, capabilities, and ownership tracking
 */

const ipaddr = require('ipaddr.js');
const config = require('../modules/config');
const response = require('../lib/responseFormatter');
const logger = require('../lib/logger');
const UserManager = require('../modules/userManager');
const ALL_CAPABILITIES = UserManager.ALL_CAPABILITIES;
const SSO_DEFAULT_CAPABILITIES = UserManager.SSO_DEFAULT_CAPABILITIES;

// Trusted-proxy log helpers — same source tag, level-aware so security
// events (rejected headers, session save failures) surface at the right
// severity rather than blending into INFO.
const log = {
  info: (...args) => logger.infoFor('TrustedProxy', ...args),
  warn: (...args) => logger.warnFor('TrustedProxy', ...args),
  error: (...args) => logger.errorFor('TrustedProxy', ...args)
};

/**
 * Default trusted CIDR ranges for SSO header acceptance.
 * Covers standard Docker, reverse proxy, and LAN setups.
 */
const DEFAULT_TRUSTED_CIDRS = [
  '127.0.0.0/8',     // IPv4 loopback
  '10.0.0.0/8',      // RFC 1918 private
  '172.16.0.0/12',   // RFC 1918 private (includes Docker default 172.17.x)
  '192.168.0.0/16',  // RFC 1918 private
  '::1/128',         // IPv6 loopback
  'fc00::/7',        // IPv6 ULA (includes fd00::/8)
  'fe80::/10',       // IPv6 link-local
];

/**
 * Parse a CIDR string into [parsedAddress, prefixLength].
 * Returns null if invalid.
 * @param {string} cidr - CIDR notation (e.g., '192.168.0.0/16') or bare IP
 * @returns {[Object, number]|null}
 */
function parseCIDR(cidr) {
  try {
    if (cidr.includes('/')) {
      return ipaddr.parseCIDR(cidr);
    }
    // Bare IP — treat as single host
    const addr = ipaddr.parse(cidr);
    const bits = addr.kind() === 'ipv6' ? 128 : 32;
    return [addr, bits];
  } catch {
    return null;
  }
}

/**
 * Check if an IP address is in a trusted range using proper CIDR math.
 * Uses ipaddr.js for robust parsing — handles IPv4, IPv6, IPv4-mapped IPv6,
 * and rejects malformed input.
 *
 * IMPORTANT: Only pass req.socket.remoteAddress to this function.
 * Never pass user-controlled headers (X-Forwarded-For, X-Real-IP).
 *
 * @param {string} ip - Remote socket address to check
 * @param {string[]|null} customCIDRs - Optional explicit list of trusted CIDRs. When set, replaces defaults.
 * @returns {boolean}
 */
function isTrustedIP(ip, customCIDRs) {
  if (!ip || typeof ip !== 'string') return false;

  let addr;
  try {
    addr = ipaddr.process(ip); // Normalizes IPv4-mapped IPv6 → IPv4
  } catch {
    return false; // Unparseable IP — reject
  }

  const cidrs = (Array.isArray(customCIDRs) && customCIDRs.length > 0)
    ? customCIDRs
    : DEFAULT_TRUSTED_CIDRS;

  for (const cidr of cidrs) {
    const parsed = parseCIDR(cidr);
    if (!parsed) continue; // Skip invalid CIDR entries

    const [range, bits] = parsed;

    try {
      // ipaddr.js handles IPv4/IPv6 kind matching internally
      if (addr.kind() === range.kind() && addr.match(range, bits)) {
        return true;
      }
      // Also check IPv4-in-IPv6: if range is IPv4 and addr was mapped
      if (addr.kind() === 'ipv4' && range.kind() === 'ipv4') {
        if (addr.match(range, bits)) return true;
      }
    } catch {
      // Kind mismatch (e.g., comparing IPv4 addr to IPv6 range) — skip
      continue;
    }
  }

  return false;
}

/**
 * Create trusted proxy SSO middleware.
 * @param {Object} userManager - UserManager instance for user lookup/creation
 * @returns {Function} Express middleware
 */
function createTrustedProxyMiddleware(userManager) {
  return (req, res, next) => {
    const proxyConfig = config.getTrustedProxyConfig();
    if (!proxyConfig.enabled) return next();
    if (req.session?.authenticated) return next();

    const headerName = (proxyConfig.usernameHeader || '').toLowerCase();
    if (!headerName) return next();

    const headerValue = req.headers[headerName];
    if (!headerValue) return next();

    // Validate source IP — only accept SSO header from trusted sources.
    // CRITICAL: Use req.socket.remoteAddress (actual TCP peer), never req.ip or forwarded headers.
    const remoteAddr = req.socket?.remoteAddress || '';
    const customCIDRs = Array.isArray(proxyConfig.trustedProxyIPs) && proxyConfig.trustedProxyIPs.length > 0
      ? proxyConfig.trustedProxyIPs
      : null;

    if (!isTrustedIP(remoteAddr, customCIDRs)) {
      log.warn(`⚠️ Rejected SSO header from untrusted IP: ${remoteAddr} (header: ${headerName}=${headerValue})`);
      return next(); // Fall through to normal login — don't reveal SSO exists
    }

    const username = headerValue.trim();
    if (!username) return next();

    let user = userManager.getUserByUsername(username);

    if (user && user.disabled) {
      return response.unauthorized(res, 'Account disabled');
    }

    if (!user && proxyConfig.autoProvision) {
      // Auto-create SSO-only user with default capabilities
      const caps = Array.isArray(proxyConfig.defaultCapabilities) && proxyConfig.defaultCapabilities.length > 0
        ? proxyConfig.defaultCapabilities
        : SSO_DEFAULT_CAPABILITIES;

      user = userManager.createUser(username, {
        passwordHash: null,
        isAdmin: false,
        capabilities: caps
      });
      userManager.setCapabilities(user.id, caps);
      log.info(`Auto-provisioned SSO user: ${username}`);
    }

    if (!user) return next();  // Fall through to normal login

    // Create session
    req.session.authenticated = true;
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.isAdmin = user.is_admin === 1 || user.is_admin === true;
    req.session.capabilities = userManager.resolveCapabilities(user);
    req.session.sso = true;
    userManager.updateLastLogin(user.id);

    req.session.save((err) => {
      if (err) log.error('Session save error:', err.message);
      next();
    });
  };
}

module.exports = { createTrustedProxyMiddleware, SSO_DEFAULT_CAPABILITIES, isTrustedIP, DEFAULT_TRUSTED_CIDRS };
