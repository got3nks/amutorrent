/**
 * Authentication Handler - Placeholder for qBittorrent API
 *
 * Sonarr/Radarr will attempt to login using the qBittorrent auth endpoints.
 * For this MVP, we don't enforce authentication - always return success.
 *
 * Future enhancement: Add proper authentication if needed
 */

/**
 * Create authentication handlers
 * @returns {object} Auth handler functions
 */
function createAuthHandler() {
  /**
   * POST /api/v2/auth/login
   * Always returns success
   */
  function login(req, res) {
    res.send('Ok.');
  }

  /**
   * POST /api/v2/auth/logout
   * Always returns success
   */
  function logout(req, res) {
    res.send('Ok.');
  }

  return { login, logout };
}

module.exports = { createAuthHandler };
