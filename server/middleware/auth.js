/**
 * Authentication Middleware
 * Protects routes based on session authentication status
 */

const config = require('../modules/config');
const response = require('../lib/responseFormatter');

let userManager = null;

/**
 * Require authentication middleware
 * Checks if auth is enabled and if user is authenticated
 * Supports session cookies and X-API-Key header
 */
function requireAuth(req, res, next) {
  // Check if authentication is enabled
  const authEnabled = config.getAuthEnabled();

  // If auth is disabled, allow all requests
  if (!authEnabled) {
    return next();
  }

  // Check if user is authenticated via session
  if (req.session && req.session.authenticated) {
    return next();
  }

  // Check X-API-Key header (stateless auth for REST API)
  const apiKey = req.headers['x-api-key'];
  if (apiKey && userManager) {
    const user = userManager.getUserByApiKey(apiKey);
    if (user && !user.disabled) {
      // Populate session so downstream middleware/handlers work as normal
      req.session.authenticated = true;
      req.session.userId = user.id;
      req.session.username = user.username;
      req.session.isAdmin = user.is_admin;
      req.session.capabilities = userManager.resolveCapabilities(user);
      return next();
    }
  }

  // User is not authenticated
  // For API requests, return 401 JSON
  if (req.path.startsWith('/api/')) {
    return response.unauthorized(res, 'You must be logged in to access this resource');
  }

  // For page requests, redirect to login
  return res.redirect('/login');
}

/**
 * Set the UserManager instance (called during initialization)
 */
function setUserManager(um) {
  userManager = um;
}

module.exports = requireAuth;
module.exports.setUserManager = setUserManager;
