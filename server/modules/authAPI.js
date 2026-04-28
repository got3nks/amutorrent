/**
 * Authentication API Module
 * Handles authentication endpoints: login, logout, status
 */

const BaseModule = require('../lib/BaseModule');
const config = require('./config');
const { getClientIP, hashPassword } = require('../lib/authUtils');
const { validatePassword } = require('../lib/passwordValidator');
const response = require('../lib/responseFormatter');
const { MS_PER_HOUR, MS_PER_DAY } = require('../lib/timeRange');

// Singleton managers - imported directly instead of injected
const authManager = require('./authManager');

class AuthAPI extends BaseModule {
  /**
   * Register authentication routes
   * @param {Express} app - Express application instance
   */
  registerRoutes(app) {
    // POST /api/auth/login
    app.post('/api/auth/login', async (req, res) => {
      try {
        const { username, password, rememberMe } = req.body;

        if (!password || typeof password !== 'string') {
          return response.badRequest(res, 'password is required');
        }
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
            'Too many failed attempts.',
            Math.ceil(timeRemaining / 1000)
          );
        }

        // Check global rate limit (only blocks IPs with prior failed attempts)
        if (authManager.isGlobalLimitReached() && authManager.getAttemptCount(clientIp) > 0) {
          this.log(`🚫 Global rate limit reached, blocking ${clientIp} (has prior failed attempts)`);
          return response.rateLimited(res, 'Too many login attempts.', 900);
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

        if (!username || typeof username !== 'string') {
          return response.badRequest(res, 'username is required');
        }

        if (!this.userManager || !this.userManager.hasUsers()) {
          return response.serverError(res, 'No user accounts configured');
        }

        const user = this.userManager.getUserByUsername(username);

        if (!user) {
          authManager.recordFailedAttempt(clientIp);
          const newCount = authManager.getAttemptCount(clientIp);
          const retryDelay = authManager.getDelayForAttempts(newCount) / 1000;
          return response.error(res, 'Invalid username or password', 401, { retryDelay });
        }

        if (user.disabled) {
          authManager.recordFailedAttempt(clientIp);
          const newCount = authManager.getAttemptCount(clientIp);
          const retryDelay = authManager.getDelayForAttempts(newCount) / 1000;
          return response.error(res, 'Invalid username or password', 401, { retryDelay });
        }

        if (!user.password_hash) {
          // SSO-only user — cannot log in via form
          authManager.recordFailedAttempt(clientIp);
          const newCount = authManager.getAttemptCount(clientIp);
          const retryDelay = authManager.getDelayForAttempts(newCount) / 1000;
          return response.error(res, 'Invalid username or password', 401, { retryDelay });
        }

        const isValid = await authManager.verifyPassword(password, user.password_hash);

        if (!isValid) {
          authManager.recordFailedAttempt(clientIp);
          const newCount = authManager.getAttemptCount(clientIp);
          const retryDelay = authManager.getDelayForAttempts(newCount) / 1000;
          return response.error(res, 'Invalid username or password', 401, { retryDelay });
        }

        // Successful login
        authManager.recordSuccessfulLogin(clientIp);

        req.session.authenticated = true;
        req.session.userId = user.id;
        req.session.username = user.username;
        req.session.isAdmin = user.is_admin;
        req.session.capabilities = this.userManager.resolveCapabilities(user);

        this.userManager.updateLastLogin(user.id);

        if (rememberMe) {
          req.session.cookie.maxAge = 30 * MS_PER_DAY;
        } else {
          req.session.cookie.maxAge = 24 * MS_PER_HOUR;
        }

        req.session.save((err) => {
          if (err) {
            this.error('❌ Session save error:', err);
            return response.serverError(res, 'Failed to save session');
          }

          this.log(`✅ Successful login: ${user.username} from ${clientIp} (remember me: ${rememberMe})`);
          response.success(res, { message: 'Login successful' });
        });
      } catch (err) {
        this.error('❌ Login error:', err);
        response.serverError(res, 'Login failed: ' + err.message);
      }
    });

    // POST /api/auth/logout
    app.post('/api/auth/logout', (req, res) => {
      try {
        const clientIp = getClientIP(req);

        req.session.destroy((err) => {
          if (err) {
            this.error('❌ Logout error:', err);
            return response.serverError(res, 'Logout failed');
          }

          this.log(`👋 User logged out from ${clientIp}`);
          response.success(res, { message: 'Logout successful' });
        });
      } catch (err) {
        this.error('❌ Logout error:', err);
        response.serverError(res, 'Logout failed: ' + err.message);
      }
    });

    // GET /api/auth/status
    app.get('/api/auth/status', (req, res) => {
      try {
        const authEnabled = config.getAuthEnabled();
        const authenticated = req.session && req.session.authenticated;

        const result = {
          authEnabled,
          authenticated: authenticated || false
        };

        if (authenticated) {
          result.username = req.session.username || null;
          result.isAdmin = req.session.isAdmin || false;
          result.capabilities = Array.isArray(req.session.capabilities) ? req.session.capabilities : [];
        }

        // Tell the frontend whether to show the username field
        result.hasUsers = this.userManager ? this.userManager.hasUsers() : false;

        // Tell the frontend whether this session was created via SSO
        result.sso = !!(req.session && req.session.sso);

        // Include delay/block info for unauthenticated clients
        if (authEnabled && !authenticated) {
          const clientIp = getClientIP(req);
          if (authManager.checkIPBlocked(clientIp)) {
            result.retryAfter = Math.ceil(authManager.getBlockTimeRemaining(clientIp) / 1000);
          } else {
            const attemptCount = authManager.getAttemptCount(clientIp);
            if (attemptCount > 0) {
              result.retryDelay = authManager.getDelayForAttempts(attemptCount) / 1000;
            }
          }
        }

        res.json(result);
      } catch (err) {
        this.error('❌ Auth status error:', err);
        res.json({
          authEnabled: false,
          authenticated: false
        });
      }
    });

    // PUT /api/auth/profile — self-service profile update (display name, password)
    app.put('/api/auth/profile', async (req, res) => {
      try {
        if (!req.session?.authenticated) {
          return response.unauthorized(res, 'Not authenticated');
        }

        const userId = req.session.userId;
        if (!userId || !this.userManager) {
          return response.badRequest(res, 'Profile updates not available');
        }

        const user = this.userManager.getUser(userId);
        if (!user) {
          return response.notFound(res, 'User not found');
        }

        const { currentPassword, newPassword } = req.body;
        const updates = {};

        // Update password (requires current password verification)
        if (newPassword) {
          if (!user.password_hash) {
            return response.badRequest(res, 'SSO-only users cannot set a password via profile');
          }

          if (!currentPassword) {
            return response.badRequest(res, 'Current password is required');
          }

          const isValid = await authManager.verifyPassword(currentPassword, user.password_hash);
          if (!isValid) {
            return response.error(res, 'Current password is incorrect', 401);
          }

          const pwResult = validatePassword(newPassword);
          if (!pwResult.valid) {
            return response.badRequest(res, pwResult.errors.join('; '));
          }

          updates.passwordHash = await hashPassword(newPassword);
        }

        if (Object.keys(updates).length === 0) {
          return response.badRequest(res, 'No fields to update');
        }

        this.userManager.updateUser(userId, updates);

        // Invalidate other sessions on password change (keep the current one)
        if (updates.passwordHash) {
          authManager.invalidateUserSessions(userId, req.sessionID);
        }

        this.log(`👤 User ${user.username} updated their profile`);
        response.success(res, { message: 'Profile updated' });
      } catch (err) {
        this.error('❌ Profile update error:', err);
        response.serverError(res, 'Failed to update profile');
      }
    });
  }
}

module.exports = new AuthAPI();
