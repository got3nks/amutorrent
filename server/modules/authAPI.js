/**
 * Authentication API Module
 * Handles authentication endpoints: login, logout, status
 */

const BaseModule = require('../lib/BaseModule');
const config = require('./config');
const { getClientIP } = require('../lib/authUtils');
const response = require('../lib/responseFormatter');
const { MS_PER_HOUR, MS_PER_DAY } = require('../lib/timeRange');
const { validate } = require('../middleware/validateRequest');

// Singleton managers - imported directly instead of injected
const authManager = require('./authManager');

// Validation middleware for login
const validateLogin = validate({
  password: {
    required: true,
    type: 'string',
    minLength: 1
  }
}, 'body');

class AuthAPI extends BaseModule {
  constructor() {
    super();
  }

  /**
   * Register authentication routes
   * @param {Express} app - Express application instance
   */
  registerRoutes(app) {
    // POST /api/auth/login
    app.post('/api/auth/login', validateLogin, async (req, res) => {
      try {
        const { password, rememberMe } = req.body;
        const clientIp = getClientIP(req);

        // Check if authentication is enabled
        const authEnabled = config.getAuthEnabled();
        if (!authEnabled) {
          return response.success(res, { message: 'Authentication is disabled' });
        }

        // Check if IP is blocked
        if (authManager.checkIPBlocked(clientIp)) {
          const timeRemaining = authManager.getBlockTimeRemaining(clientIp);
          const minutesRemaining = Math.ceil(timeRemaining / 60000);

          this.log(`🚫 Blocked login attempt from ${clientIp} (${minutesRemaining} minutes remaining)`);

          return response.rateLimited(res,
            `Too many failed attempts. Please try again in ${minutesRemaining} minute${minutesRemaining !== 1 ? 's' : ''}.`,
            Math.ceil(timeRemaining / 1000)
          );
        }

        // Get configured password
        const configPassword = config.getAuthPassword();
        if (!configPassword) {
          this.log('❌ Login failed: No password configured');
          return response.serverError(res, 'Authentication password not configured');
        }

        // Apply delay if needed based on previous failed attempts
        const attemptCount = authManager.getAttemptCount(clientIp);
        if (attemptCount > 0) {
          const delay = authManager.getDelayForAttempts(attemptCount);
          if (delay > 0) {
            this.log(`⏳ Applying ${delay}ms delay for IP ${clientIp} (${attemptCount} previous attempts)`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }

        // Verify password
        const isValid = await authManager.verifyPassword(password, configPassword);

        if (!isValid) {
          // Record failed attempt
          authManager.recordFailedAttempt(clientIp);
          return response.unauthorized(res, 'Invalid password');
        }

        // Successful login
        authManager.recordSuccessfulLogin(clientIp);

        // Set session
        req.session.authenticated = true;

        // Set cookie maxAge based on rememberMe
        if (rememberMe) {
          req.session.cookie.maxAge = 30 * MS_PER_DAY; // 30 days
        } else {
          req.session.cookie.maxAge = 24 * MS_PER_HOUR; // 24 hours
        }

        // Save session before sending response
        req.session.save((err) => {
          if (err) {
            this.log('❌ Session save error:', err);
            return response.serverError(res, 'Failed to save session');
          }

          this.log(`✅ Successful login from ${clientIp} (remember me: ${rememberMe})`);
          response.success(res, { message: 'Login successful' });
        });
      } catch (err) {
        this.log('❌ Login error:', err);
        response.serverError(res, 'Login failed: ' + err.message);
      }
    });

    // POST /api/auth/logout
    app.post('/api/auth/logout', (req, res) => {
      try {
        const clientIp = getClientIP(req);

        req.session.destroy((err) => {
          if (err) {
            this.log('❌ Logout error:', err);
            return response.serverError(res, 'Logout failed');
          }

          this.log(`👋 User logged out from ${clientIp}`);
          response.success(res, { message: 'Logout successful' });
        });
      } catch (err) {
        this.log('❌ Logout error:', err);
        response.serverError(res, 'Logout failed: ' + err.message);
      }
    });

    // GET /api/auth/status
    app.get('/api/auth/status', (req, res) => {
      try {
        const authEnabled = config.getAuthEnabled();
        const authenticated = req.session && req.session.authenticated;

        res.json({
          authEnabled,
          authenticated: authenticated || false
        });
      } catch (err) {
        this.log('❌ Auth status error:', err);
        res.json({
          authEnabled: false,
          authenticated: false
        });
      }
    });
  }
}

module.exports = new AuthAPI();
