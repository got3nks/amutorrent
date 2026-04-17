/**
 * UserManager - User account database and management
 *
 * Handles database initialization, schema migrations, CRUD operations
 * for users, capabilities, API keys, and migration from legacy
 * single-password auth.
 *
 * Follows the DownloadHistory/MoveOperationsDB pattern: constructor
 * takes dbPath, creates DB, manages schema, and provides all operations.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const logger = require('../lib/logger');
const { hashPassword } = require('../lib/authUtils');

const CURRENT_VERSION = 1;

const ALL_CAPABILITIES = [
  'search', 'add_downloads', 'remove_downloads', 'pause_resume',
  'assign_categories', 'move_files', 'rename_files', 'set_comment',
  'manage_categories',
  'view_history', 'clear_history', 'view_shared', 'view_uploads',
  'view_statistics', 'view_logs', 'view_servers',
  'view_all_downloads', 'edit_all_downloads'
];

// Capabilities withheld from auto-provisioned SSO users and history-imported
// users. Everything else in ALL_CAPABILITIES is granted by default to keep
// self-service actions usable without admin intervention.
const SSO_EXCLUDED_CAPABILITIES = ['edit_all_downloads', 'manage_categories', 'view_servers', 'view_logs'];
const SSO_DEFAULT_CAPABILITIES = ALL_CAPABILITIES.filter(
  c => !SSO_EXCLUDED_CAPABILITIES.includes(c)
);

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,32}$/;

class UserManager {
  constructor(dbPath) {
    try {
      const dbDir = path.dirname(dbPath);
      if (!fs.existsSync(dbDir)) {
        logger.log(`Creating database directory: ${dbDir}`);
        fs.mkdirSync(dbDir, { recursive: true });
      }

      fs.accessSync(dbDir, fs.constants.W_OK);

      this.db = new Database(dbPath, { fileMustExist: false });
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');
      this.initSchema();

      logger.log(`👤 User database initialized: ${dbPath} (schema v${this.getVersion()})`);
    } catch (error) {
      logger.error(`Failed to initialize user database at ${dbPath}:`, error);
      throw new Error(`User DB initialization failed: ${error.message}`);
    }
  }

  // ============================================================================
  // SCHEMA MANAGEMENT
  // ============================================================================

  initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        version INTEGER NOT NULL DEFAULT 0
      );
    `);

    let currentVersion = this.getVersion();

    if (currentVersion === null) {
      currentVersion = 0;
      this.setVersion(0);
    }

    this.runMigrations(currentVersion);
  }

  getVersion() {
    try {
      const row = this.db.prepare('SELECT version FROM schema_version WHERE id = 1').get();
      return row ? row.version : null;
    } catch {
      return null;
    }
  }

  setVersion(version) {
    this.db.prepare(`
      INSERT OR REPLACE INTO schema_version (id, version) VALUES (1, ?)
    `).run(version);
  }

  runMigrations(fromVersion) {
    if (fromVersion >= CURRENT_VERSION) return;

    const migrations = [
      // Version 1: Initial schema — users + capabilities
      () => {
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL COLLATE NOCASE,
            password_hash TEXT,
            is_admin INTEGER NOT NULL DEFAULT 0,
            display_name TEXT,
            api_key TEXT UNIQUE,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            last_login_at INTEGER,
            disabled INTEGER NOT NULL DEFAULT 0
          );

          CREATE TABLE IF NOT EXISTS user_capabilities (
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            capability TEXT NOT NULL,
            PRIMARY KEY (user_id, capability)
          );

          CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
          CREATE INDEX IF NOT EXISTS idx_users_api_key ON users(api_key);
          CREATE INDEX IF NOT EXISTS idx_user_caps_user_id ON user_capabilities(user_id);

          CREATE TABLE IF NOT EXISTS download_ownership (
            item_key TEXT NOT NULL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            added_at INTEGER NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_ownership_user_id ON download_ownership(user_id);
        `);
      }
    ];

    for (let v = fromVersion; v < CURRENT_VERSION; v++) {
      logger.log(`👤 Running user DB migration v${v} → v${v + 1}`);
      migrations[v]();
      this.setVersion(v + 1);
    }
  }

  // ============================================================================
  // USER CRUD
  // ============================================================================

  /**
   * Create a new user
   * @param {string} username
   * @param {Object} options
   * @returns {Object} Created user
   */
  createUser(username, { passwordHash = null, isAdmin = false, capabilities = [] } = {}) {
    if (!USERNAME_REGEX.test(username)) {
      throw new Error(`Invalid username "${username}": must be 3-32 alphanumeric/underscore characters`);
    }

    const now = Date.now();
    const apiKey = crypto.randomBytes(32).toString('hex');

    const insertUser = this.db.prepare(`
      INSERT INTO users (username, password_hash, is_admin, api_key, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertCap = this.db.prepare(`
      INSERT INTO user_capabilities (user_id, capability) VALUES (?, ?)
    `);

    const createTransaction = this.db.transaction(() => {
      const result = insertUser.run(username, passwordHash, isAdmin ? 1 : 0, apiKey, now, now);
      const userId = result.lastInsertRowid;

      // Only store capabilities for non-admin users (admins get all implicitly)
      if (!isAdmin && capabilities.length > 0) {
        for (const cap of capabilities) {
          if (ALL_CAPABILITIES.includes(cap)) {
            insertCap.run(userId, cap);
          }
        }
      }

      return userId;
    });

    const userId = createTransaction();
    logger.log(`👤 Created user: ${username} (id=${userId}, admin=${isAdmin})`);
    return this.getUser(userId);
  }

  /**
   * Get user by ID with capabilities
   */
  getUser(id) {
    const user = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) return null;
    return this._attachCapabilities(user);
  }

  /**
   * Get user by username with capabilities
   */
  getUserByUsername(username) {
    const user = this.db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) return null;
    return this._attachCapabilities(user);
  }

  /**
   * Get user by API key with capabilities
   */
  getUserByApiKey(apiKey) {
    if (!apiKey) return null;
    const user = this.db.prepare('SELECT * FROM users WHERE api_key = ?').get(apiKey);
    if (!user) return null;
    return this._attachCapabilities(user);
  }

  /**
   * Update user fields (partial update)
   */
  updateUser(id, { username, isAdmin, disabled, passwordHash } = {}) {
    const sets = [];
    const values = [];

    if (username !== undefined) {
      sets.push('username = ?');
      values.push(username);
    }

    if (isAdmin !== undefined) {
      sets.push('is_admin = ?');
      values.push(isAdmin ? 1 : 0);

      // Auto-generate API key on admin promotion
      if (isAdmin) {
        const existing = this.db.prepare('SELECT api_key FROM users WHERE id = ?').get(id);
        if (existing && !existing.api_key) {
          sets.push('api_key = ?');
          values.push(crypto.randomBytes(32).toString('hex'));
        }
      }
    }

    if (disabled !== undefined) {
      sets.push('disabled = ?');
      values.push(disabled ? 1 : 0);
    }

    if (passwordHash !== undefined) {
      sets.push('password_hash = ?');
      values.push(passwordHash);
    }

    if (sets.length === 0) return this.getUser(id);

    sets.push('updated_at = ?');
    values.push(Date.now());
    values.push(id);

    this.db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    return this.getUser(id);
  }

  /**
   * Delete user with last-admin protection
   */
  deleteUser(id) {
    const user = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) throw new Error('User not found');

    if (user.is_admin) {
      const adminCount = this.db.prepare('SELECT COUNT(*) as count FROM users WHERE is_admin = 1 AND disabled = 0').get().count;
      if (adminCount <= 1) {
        throw new Error('Cannot delete the last admin user');
      }
    }

    this.db.prepare('DELETE FROM users WHERE id = ?').run(id);
    logger.log(`👤 Deleted user: ${user.username} (id=${id})`);
  }

  // ============================================================================
  // CAPABILITIES
  // ============================================================================

  /**
   * Replace capability set for a user
   */
  setCapabilities(userId, capabilities) {
    const validCaps = capabilities.filter(c => ALL_CAPABILITIES.includes(c));

    const setTransaction = this.db.transaction(() => {
      this.db.prepare('DELETE FROM user_capabilities WHERE user_id = ?').run(userId);
      const insert = this.db.prepare('INSERT INTO user_capabilities (user_id, capability) VALUES (?, ?)');
      for (const cap of validCaps) {
        insert.run(userId, cap);
      }
      this.db.prepare('UPDATE users SET updated_at = ? WHERE id = ?').run(Date.now(), userId);
    });

    setTransaction();
  }

  /**
   * Resolve effective capabilities for a user
   */
  resolveCapabilities(user) {
    if (user.is_admin) return [...ALL_CAPABILITIES];
    return user.capabilities || [];
  }

  // ============================================================================
  // API KEYS
  // ============================================================================

  /**
   * Regenerate API key for a user
   */
  regenerateApiKey(userId) {
    const newKey = crypto.randomBytes(32).toString('hex');
    this.db.prepare('UPDATE users SET api_key = ?, updated_at = ? WHERE id = ?').run(newKey, Date.now(), userId);
    return newKey;
  }

  // ============================================================================
  // QUERIES
  // ============================================================================

  /**
   * List all users with capabilities
   */
  listUsers() {
    const users = this.db.prepare('SELECT * FROM users ORDER BY created_at ASC').all();
    const allCaps = this.db.prepare('SELECT user_id, capability FROM user_capabilities').all();

    // Group capabilities by user_id
    const capsByUser = {};
    for (const row of allCaps) {
      (capsByUser[row.user_id] ||= []).push(row.capability);
    }

    return users.map(u => {
      const isAdmin = u.is_admin === 1;
      const caps = isAdmin ? ALL_CAPABILITIES : (capsByUser[u.id] || []);
      return {
        id: u.id,
        username: u.username,
        isAdmin,
        disabled: u.disabled === 1,
        hasPassword: !!u.password_hash,
        apiKey: u.api_key || null,
        capabilities: caps,
        createdAt: u.created_at,
        lastLoginAt: u.last_login_at
      };
    });
  }

  /**
   * Update last login timestamp
   */
  updateLastLogin(userId) {
    this.db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(Date.now(), userId);
  }

  /**
   * Get total user count
   */
  getUserCount() {
    return this.db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  }

  /**
   * Check if any users exist
   */
  hasUsers() {
    return this.getUserCount() > 0;
  }

  // ============================================================================
  // DOWNLOAD OWNERSHIP
  // ============================================================================

  /**
   * Record ownership of a download (idempotent — INSERT OR IGNORE)
   * @param {string} itemKey - Compound key (instanceId:hash)
   * @param {number} userId - User ID
   */
  recordOwnership(itemKey, userId) {
    this.db.prepare(
      'INSERT OR IGNORE INTO download_ownership (item_key, user_id, added_at) VALUES (?, ?, ?)'
    ).run(itemKey, userId, Date.now());
  }

  /**
   * Get the owner of a download
   * @param {string} itemKey - Compound key
   * @returns {number|null} User ID or null
   */
  getOwner(itemKey) {
    const row = this.db.prepare('SELECT user_id FROM download_ownership WHERE item_key = ?').get(itemKey);
    return row ? row.user_id : null;
  }

  /**
   * Get all item keys owned by a user
   * @param {number} userId
   * @returns {Set<string>}
   */
  getOwnedKeys(userId) {
    const rows = this.db.prepare('SELECT item_key FROM download_ownership WHERE user_id = ?').all(userId);
    return new Set(rows.map(r => r.item_key));
  }

  /**
   * Check if a download is owned by a specific user
   * @param {string} itemKey - Compound key
   * @param {number} userId - User ID
   * @returns {boolean}
   */
  isOwnedBy(itemKey, userId) {
    const row = this.db.prepare('SELECT 1 FROM download_ownership WHERE item_key = ? AND user_id = ?').get(itemKey, userId);
    return !!row;
  }

  /**
   * Remove ownership record (for cleanup)
   * @param {string} itemKey - Compound key
   */
  removeOwnership(itemKey) {
    this.db.prepare('DELETE FROM download_ownership WHERE item_key = ?').run(itemKey);
  }

  /**
   * Backfill ownership from download history database.
   * Matches history usernames to user IDs and creates ownership records.
   * @param {Object} downloadHistoryDB - DownloadHistory instance
   */
  backfillFromHistory(downloadHistoryDB) {
    if (!downloadHistoryDB) return;

    // Skip if ownership table already has data
    const count = this.db.prepare('SELECT COUNT(*) as count FROM download_ownership').get().count;
    if (count > 0) return;

    try {
      const rows = downloadHistoryDB.db.prepare(
        "SELECT hash, username, instance_id FROM download_history WHERE username IS NOT NULL AND username != 'external'"
      ).all();

      if (rows.length === 0) return;

      // Build username → userId lookup
      const users = this.db.prepare('SELECT id, username FROM users').all();
      const userByName = new Map(users.map(u => [u.username.toLowerCase(), u.id]));

      const insert = this.db.prepare(
        'INSERT OR IGNORE INTO download_ownership (item_key, user_id, added_at) VALUES (?, ?, ?)'
      );

      let inserted = 0;
      const backfillTransaction = this.db.transaction(() => {
        for (const row of rows) {
          const userId = userByName.get(row.username.toLowerCase());
          if (!userId || !row.hash) continue;
          const key = row.instance_id ? `${row.instance_id}:${row.hash}` : row.hash;
          insert.run(key, userId, Date.now());
          inserted++;
        }
      });

      backfillTransaction();
      if (inserted > 0) {
        logger.log(`👤 Backfilled ${inserted} ownership records from download history`);
      }
    } catch (err) {
      logger.log(`👤 Could not backfill ownership from history: ${err.message}`);
    }
  }

  // ============================================================================
  // MIGRATION
  // ============================================================================

  /**
   * Migrate from legacy single-password config to user accounts
   * @param {Object} config - Config module instance
   * @param {Object} downloadHistory - DownloadHistory instance (for importing usernames)
   */
  async migrateFromConfig(config, downloadHistory) {
    if (this.hasUsers()) return;

    const authEnabled = config.getAuthEnabled();
    let passwordHash = config.getAuthPassword();

    if (!authEnabled || !passwordHash) return;

    // Hash plaintext password if not already hashed (wizard saves plaintext to config.json)
    if (!passwordHash.startsWith('$2b$')) {
      passwordHash = await hashPassword(passwordHash);
    }

    // Determine admin username from env or default
    const adminUsername = config.getConfig()?.server?.auth?.adminUsername || process.env.WEB_AUTH_ADMIN_USERNAME || 'admin';

    logger.log('👤 Migrating legacy auth to user accounts...');

    // Create admin user with existing password hash
    this.createUser(adminUsername, {
      passwordHash,
      isAdmin: true
    });
    logger.log(`👤 Created admin user "${adminUsername}" from existing password`);

    // Import distinct usernames from download history as SSO-only users
    if (downloadHistory) {
      try {
        const rows = downloadHistory.db.prepare(
          "SELECT DISTINCT username FROM download_history WHERE username IS NOT NULL AND username != 'external'"
        ).all();

        for (const row of rows) {
          const username = row.username;
          if (!username || !USERNAME_REGEX.test(username)) continue;
          if (username.toLowerCase() === adminUsername.toLowerCase()) continue;

          try {
            this.createUser(username, {
              passwordHash: null,
              isAdmin: false,
              capabilities: SSO_DEFAULT_CAPABILITIES
            });
            logger.log(`👤 Imported history user "${username}" as SSO-only`);
          } catch (err) {
            // Skip duplicate or invalid usernames
            logger.log(`👤 Skipped importing user "${username}": ${err.message}`);
          }
        }
      } catch (err) {
        logger.log(`👤 Could not import history users: ${err.message}`);
      }
    }

    logger.log('👤 Legacy auth migration complete');
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  /**
   * Close database connection
   */
  close() {
    this.db.close();
    logger.log('👤 User database closed');
  }

  // ============================================================================
  // PRIVATE
  // ============================================================================

  /**
   * Attach capabilities array to a user row
   * @private
   */
  _attachCapabilities(user) {
    const caps = this.db.prepare('SELECT capability FROM user_capabilities WHERE user_id = ?').all(user.id);
    return {
      ...user,
      is_admin: user.is_admin === 1,
      disabled: user.disabled === 1,
      capabilities: caps.map(c => c.capability)
    };
  }
}

UserManager.ALL_CAPABILITIES = ALL_CAPABILITIES;
UserManager.SSO_DEFAULT_CAPABILITIES = SSO_DEFAULT_CAPABILITIES;
UserManager.SSO_EXCLUDED_CAPABILITIES = SSO_EXCLUDED_CAPABILITIES;
module.exports = UserManager;
