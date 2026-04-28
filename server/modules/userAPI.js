/**
 * User Management API Module
 * Admin-only CRUD endpoints for user accounts and capabilities.
 */

const express = require('express');
const BaseModule = require('../lib/BaseModule');
const { requireAdmin } = require('../middleware/capabilities');
const { hashPassword } = require('../lib/authUtils');
const { validatePassword } = require('../lib/passwordValidator');
const response = require('../lib/responseFormatter');
const UserManager = require('./userManager');
const authManager = require('./authManager');

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,32}$/;

class UserAPI extends BaseModule {
  // ==========================================================================
  // ROUTE REGISTRATION
  // ==========================================================================

  registerRoutes(app) {
    const router = express.Router();
    router.use(express.json());
    router.use(requireAdmin);

    // GET /api/users — list all users
    router.get('/', (req, res) => this.listUsers(req, res));

    // POST /api/users — create user
    router.post('/', (req, res) => this.createUser(req, res));

    // GET /api/users/:id — get user details
    router.get('/:id', (req, res) => this.getUser(req, res));

    // PUT /api/users/:id — update user
    router.put('/:id', (req, res) => this.updateUser(req, res));

    // DELETE /api/users/:id — delete user
    router.delete('/:id', (req, res) => this.deleteUser(req, res));

    // POST /api/users/:id/api-key — regenerate API key
    router.post('/:id/api-key', (req, res) => this.regenerateApiKey(req, res));

    app.use('/api/users', router);
    this.log('👤 User management API routes registered');
  }

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  listUsers(req, res) {
    try {
      const users = this.userManager.listUsers();
      const sanitized = users.map(u => this._sanitizeUser(u, { requestingUserId: req.session.userId }));
      response.success(res, { users: sanitized });
    } catch (err) {
      this.error('❌ Error listing users:', err.message);
      response.serverError(res, 'Failed to list users');
    }
  }

  async createUser(req, res) {
    try {
      const { username, password, isAdmin, capabilities } = req.body;

      // Validate username
      if (!username || !USERNAME_REGEX.test(username)) {
        return response.badRequest(res, 'Username must be 3-32 alphanumeric/underscore characters');
      }

      // Check duplicate
      if (this.userManager.getUserByUsername(username)) {
        return response.badRequest(res, 'Username already exists');
      }

      // Validate password (optional for SSO-only users)
      let passwordHash = null;
      if (password) {
        const pwResult = validatePassword(password);
        if (!pwResult.valid) {
          return response.badRequest(res, pwResult.errors.join('; '));
        }
        passwordHash = await hashPassword(password);
      }

      // Validate capabilities
      const caps = Array.isArray(capabilities) ? capabilities : [];
      const validCaps = caps.filter(c => UserManager.ALL_CAPABILITIES.includes(c));

      // Enforce edit_all_downloads requires view_all_downloads
      if (validCaps.includes('edit_all_downloads') && !validCaps.includes('view_all_downloads')) {
        return response.badRequest(res, 'edit_all_downloads requires view_all_downloads');
      }

      const user = this.userManager.createUser(username, {
        passwordHash,
        isAdmin: !!isAdmin,
        capabilities: validCaps
      });

      // If non-admin, set capabilities explicitly
      if (!isAdmin && validCaps.length > 0) {
        this.userManager.setCapabilities(user.id, validCaps);
      }

      const created = this.userManager.getUser(user.id);
      this.log(`👤 Admin ${req.session.username} created user: ${username}`);

      response.success(res, { user: this._sanitizeUser(created, { requestingUserId: req.session.userId }) }, 201);
    } catch (err) {
      this.error('❌ Error creating user:', err.message);
      response.serverError(res, 'Failed to create user: ' + err.message);
    }
  }

  getUser(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return response.badRequest(res, 'Invalid user ID');

      const user = this.userManager.getUser(id);
      if (!user) return response.notFound(res, 'User not found');

      response.success(res, { user: this._sanitizeUser(user, { requestingUserId: req.session.userId }) });
    } catch (err) {
      this.error('❌ Error getting user:', err.message);
      response.serverError(res, 'Failed to get user');
    }
  }

  async updateUser(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return response.badRequest(res, 'Invalid user ID');

      const user = this.userManager.getUser(id);
      if (!user) return response.notFound(res, 'User not found');

      const { username, isAdmin, disabled, password, capabilities } = req.body;

      // Validate and check username rename
      if (username !== undefined) {
        if (!USERNAME_REGEX.test(username)) {
          return response.badRequest(res, 'Username must be 3-32 alphanumeric/underscore characters');
        }
        if (username !== user.username) {
          const existing = this.userManager.getUserByUsername(username);
          if (existing) {
            return response.badRequest(res, 'Username already exists');
          }
        }
      }

      // Prevent demoting self from admin if last admin
      if (isAdmin === false && user.is_admin && id === req.session.userId) {
        const allUsers = this.userManager.listUsers();
        const activeAdmins = allUsers.filter(u => u.isAdmin && !u.disabled);
        if (activeAdmins.length <= 1) {
          return response.badRequest(res, 'Cannot demote the last admin');
        }
      }

      // Build update object
      const updates = {};
      if (username !== undefined && username !== user.username) updates.username = username;
      if (isAdmin !== undefined) updates.isAdmin = isAdmin;
      if (disabled !== undefined) updates.disabled = disabled;

      if (password) {
        const pwResult = validatePassword(password);
        if (!pwResult.valid) {
          return response.badRequest(res, pwResult.errors.join('; '));
        }
        updates.passwordHash = await hashPassword(password);
      }

      this.userManager.updateUser(id, updates);

      // Update capabilities if provided
      if (Array.isArray(capabilities)) {
        const validCaps = capabilities.filter(c => UserManager.ALL_CAPABILITIES.includes(c));

        // Enforce edit_all_downloads requires view_all_downloads
        if (validCaps.includes('edit_all_downloads') && !validCaps.includes('view_all_downloads')) {
          return response.badRequest(res, 'edit_all_downloads requires view_all_downloads');
        }

        this.userManager.setCapabilities(id, validCaps);
      }

      // Update own session username if renaming self
      if (updates.username && id === req.session.userId) {
        req.session.username = updates.username;
      }

      // Invalidate sessions if security-relevant changes were made (not for self-edits)
      const securityChanged = updates.disabled !== undefined
        || updates.isAdmin !== undefined
        || updates.passwordHash !== undefined
        || updates.username !== undefined
        || Array.isArray(capabilities);

      if (securityChanged && id !== req.session.userId) {
        authManager.invalidateUserSessions(id);
      }

      const updated = this.userManager.getUser(id);
      this.log(`👤 Admin ${req.session.username} updated user: ${user.username}`);

      response.success(res, { user: this._sanitizeUser(updated, { requestingUserId: req.session.userId }) });
    } catch (err) {
      this.error('❌ Error updating user:', err.message);
      response.serverError(res, 'Failed to update user: ' + err.message);
    }
  }

  deleteUser(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return response.badRequest(res, 'Invalid user ID');

      // Prevent self-delete
      if (id === req.session.userId) {
        return response.badRequest(res, 'Cannot delete your own account');
      }

      const user = this.userManager.getUser(id);
      if (!user) return response.notFound(res, 'User not found');

      // Invalidate sessions before deletion (sessions DB is separate from users DB, no FK cascade)
      authManager.invalidateUserSessions(id);

      this.userManager.deleteUser(id);
      this.log(`👤 Admin ${req.session.username} deleted user: ${user.username}`);

      response.success(res, { message: `User ${user.username} deleted` });
    } catch (err) {
      this.error('❌ Error deleting user:', err.message);
      if (err.message.includes('last admin')) {
        return response.badRequest(res, err.message);
      }
      response.serverError(res, 'Failed to delete user: ' + err.message);
    }
  }

  regenerateApiKey(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return response.badRequest(res, 'Invalid user ID');

      const user = this.userManager.getUser(id);
      if (!user) return response.notFound(res, 'User not found');

      const apiKey = this.userManager.regenerateApiKey(id);
      this.log(`👤 Admin ${req.session.username} regenerated API key for: ${user.username}`);

      response.success(res, { apiKey });
    } catch (err) {
      this.error('❌ Error regenerating API key:', err.message);
      response.serverError(res, 'Failed to regenerate API key');
    }
  }

  // ==========================================================================
  // PRIVATE
  // ==========================================================================

  /**
   * Sanitize user object for API response (strip password_hash)
   */
  /**
   * Sanitize user object for API response (strip password_hash).
   * @param {Object} user - Raw user object from DB
   * @param {Object} [options] - Options
   * @param {number} [options.requestingUserId] - ID of the user making the request (to show own API key)
   */
  _sanitizeUser(user, { requestingUserId } = {}) {
    // Normalize: listUsers() returns camelCase, getUser() returns snake_case
    const isAdmin = user.isAdmin ?? user.is_admin;
    const apiKeyRaw = user.apiKey ?? user.api_key;
    const hasPassword = user.hasPassword ?? !!user.password_hash;

    // Only show full API key when viewing own profile
    let apiKey = null;
    if (apiKeyRaw) {
      apiKey = user.id === requestingUserId ? apiKeyRaw : '••••••••';
    }

    return {
      id: user.id,
      username: user.username,
      isAdmin,
      disabled: user.disabled,
      hasPassword,
      apiKey,
      capabilities: isAdmin
        ? UserManager.ALL_CAPABILITIES
        : (user.capabilities || []),
      createdAt: user.createdAt ?? user.created_at,
      updatedAt: user.updatedAt ?? user.updated_at,
      lastLoginAt: user.lastLoginAt ?? user.last_login_at
    };
  }
}

module.exports = new UserAPI();
