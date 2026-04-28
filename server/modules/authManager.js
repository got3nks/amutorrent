/**
 * Authentication Manager Module
 * Manages authentication state, password verification, and brute force protection
 */

const Database = require('better-sqlite3');
const path = require('path');
const BaseModule = require('../lib/BaseModule');
const config = require('./config');
const { verifyPassword: verifyPasswordUtil } = require('../lib/authUtils');
const { minutesToMs } = require('../lib/timeRange');

class AuthManager extends BaseModule {
  constructor() {
    super();
    this.sessionDB = null;
    this._disconnectCallback = null;
  }

  /**
   * Initialize session database
   */
  initSessionDB() {
    const sessionDbPath = path.join(config.getDataDir(), 'sessions.db');
    this.sessionDB = new Database(sessionDbPath);

    // Create sessions table if not exists (better-sqlite3-session-store will use this)
    this.sessionDB.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        sid TEXT PRIMARY KEY,
        sess TEXT NOT NULL,
        expire INTEGER NOT NULL
      )
    `);

    // Create failed_attempts table for brute force protection
    this.sessionDB.exec(`
      CREATE TABLE IF NOT EXISTS failed_attempts (
        ip TEXT PRIMARY KEY,
        count INTEGER NOT NULL,
        first_attempt INTEGER NOT NULL,
        last_attempt INTEGER NOT NULL,
        blocked_until INTEGER
      )
    `);

    // Create index for cleanup queries
    this.sessionDB.exec(`
      CREATE INDEX IF NOT EXISTS idx_failed_attempts_last_attempt
      ON failed_attempts(last_attempt)
    `);

    this.log('🔐 Session database initialized with failed attempts tracking');
  }

  /**
   * Get session database instance
   */
  getSessionDB() {
    if (!this.sessionDB) {
      this.initSessionDB();
    }
    return this.sessionDB;
  }

  /**
   * Start auth manager
   */
  start() {
    // Initialize database (will create tables if needed)
    this.getSessionDB();

    this.log('🔐 Auth manager started with persistent brute force protection');
  }

  /**
   * Stop auth manager
   */
  stop() {
    if (this.sessionDB) {
      this.sessionDB.close();
      this.sessionDB = null;
    }
  }

  /**
   * Clean expired attempts (older than 15 minutes since last attempt)
   * Called on each login request to keep database clean
   */
  cleanExpiredAttempts() {
    const db = this.getSessionDB();
    const fifteenMinutesAgo = Date.now() - minutesToMs(15);

    try {
      const stmt = db.prepare('DELETE FROM failed_attempts WHERE last_attempt < ?');
      const result = stmt.run(fifteenMinutesAgo);

      if (result.changes > 0) {
        this.log(`🧹 Cleaned ${result.changes} expired failed attempt record(s)`);
      }
    } catch (err) {
      this.warn('⚠️  Error cleaning expired attempts:', err.message);
    }
  }

  /**
   * Check if IP is currently blocked
   * @param {string} ip - Client IP address
   * @returns {boolean} True if IP is blocked
   */
  checkIPBlocked(ip) {
    // Clean expired attempts first (done on each check to avoid setInterval)
    this.cleanExpiredAttempts();

    const db = this.getSessionDB();

    try {
      const stmt = db.prepare('SELECT blocked_until FROM failed_attempts WHERE ip = ?');
      const row = stmt.get(ip);

      if (!row || !row.blocked_until) {
        return false;
      }

      const now = Date.now();

      // Check if block has expired
      if (now > row.blocked_until) {
        // Block expired, clear it
        const deleteStmt = db.prepare('DELETE FROM failed_attempts WHERE ip = ?');
        deleteStmt.run(ip);
        return false;
      }

      return true;
    } catch (err) {
      this.warn('⚠️  Error checking IP block:', err.message);
      return false;
    }
  }

  /**
   * Get attempt count for IP
   * @param {string} ip - Client IP address
   * @returns {number} Number of failed attempts
   */
  getAttemptCount(ip) {
    const db = this.getSessionDB();

    try {
      const stmt = db.prepare('SELECT count FROM failed_attempts WHERE ip = ?');
      const row = stmt.get(ip);
      return row ? row.count : 0;
    } catch (err) {
      this.warn('⚠️  Error getting attempt count:', err.message);
      return 0;
    }
  }

  /**
   * Get delay for current attempt count
   * @param {number} count - Number of failed attempts
   * @returns {number} Delay in milliseconds
   */
  getDelayForAttempts(count) {
    if (count < 1) return 0;
    if (count >= 10) return 0;          // Will be blocked anyway
    // Exponential growth rounded to whole seconds: ceil(count * 1.5^(count-1) * 0.5)s
    // 1→1s, 2→2s, 3→4s, 4→7s, 5→13s, 6→23s, 7→40s, 8→69s, 9→116s
    return Math.ceil(count * Math.pow(1.5, count - 1) * 500 / 1000) * 1000;
  }

  /**
   * Record failed login attempt
   * @param {string} ip - Client IP address
   */
  recordFailedAttempt(ip) {
    const db = this.getSessionDB();
    const now = Date.now();

    try {
      // Check if IP already has failed attempts
      const selectStmt = db.prepare('SELECT * FROM failed_attempts WHERE ip = ?');
      const existing = selectStmt.get(ip);

      if (!existing) {
        // First failed attempt
        const insertStmt = db.prepare(`
          INSERT INTO failed_attempts (ip, count, first_attempt, last_attempt, blocked_until)
          VALUES (?, ?, ?, ?, ?)
        `);
        insertStmt.run(ip, 1, now, now, null);
        this.warn(`⚠️  Failed login attempt from ${ip} (1 attempt)`);
      } else {
        // Increment attempt count
        const newCount = existing.count + 1;
        let blockedUntil = existing.blocked_until;

        // Block after 10 failed attempts
        if (newCount >= 10) {
          blockedUntil = now + minutesToMs(15);
          this.log(`🚫 IP ${ip} blocked for 15 minutes after ${newCount} failed attempts`);
        } else {
          this.warn(`⚠️  Failed login attempt from ${ip} (${newCount} attempts)`);
        }

        const updateStmt = db.prepare(`
          UPDATE failed_attempts
          SET count = ?, last_attempt = ?, blocked_until = ?
          WHERE ip = ?
        `);
        updateStmt.run(newCount, now, blockedUntil, ip);
      }
    } catch (err) {
      this.warn('⚠️  Error recording failed attempt:', err.message);
    }
  }

  /**
   * Record successful login (clear failed attempts)
   * @param {string} ip - Client IP address
   */
  recordSuccessfulLogin(ip) {
    const db = this.getSessionDB();

    try {
      const stmt = db.prepare('DELETE FROM failed_attempts WHERE ip = ?');
      const result = stmt.run(ip);

      if (result.changes > 0) {
        this.log(`✅ Successful login from ${ip}, cleared failed attempts`);
      }
    } catch (err) {
      this.warn('⚠️  Error clearing failed attempts:', err.message);
    }
  }

  /**
   * Verify password against hashed password
   * Delegates to shared authUtils for consistency across the app
   * @param {string} inputPassword - Plain text password from user
   * @param {string} hashedPassword - Bcrypt hashed password from config
   * @returns {Promise<boolean>} True if password matches
   */
  async verifyPassword(inputPassword, hashedPassword) {
    return verifyPasswordUtil(inputPassword, hashedPassword);
  }

  /**
   * Validate session by checking if it exists and is not expired
   * @param {string} sessionId - Session ID from cookie
   * @returns {boolean} True if session is valid
   */
  validateSession(sessionId) {
    if (!sessionId) {
      return false;
    }

    const db = this.getSessionDB();

    try {
      // Query session from database
      const stmt = db.prepare('SELECT sess, expire FROM sessions WHERE sid = ?');
      const row = stmt.get(sessionId);

      if (!row) {
        return false;
      }

      // Check if session is expired
      const now = Date.now();
      if (row.expire < now) {
        return false;
      }

      // Parse session data and check if authenticated
      const sess = JSON.parse(row.sess);
      return sess.authenticated === true;
    } catch (err) {
      this.warn('Error validating session:', err.message);
      return false;
    }
  }

  /**
   * Extract user info from a session by session ID (for WebSocket auth)
   * @param {string} sessionId - Session ID
   * @returns {Object|null} User info or null
   */
  getSessionUser(sessionId) {
    if (!sessionId) return null;

    const db = this.getSessionDB();

    try {
      const row = db.prepare('SELECT sess, expire FROM sessions WHERE sid = ?').get(sessionId);
      if (!row) return null;

      if (row.expire < Date.now()) return null;

      const sess = JSON.parse(row.sess);
      if (!sess.authenticated) return null;

      return {
        userId: sess.userId || null,
        username: sess.username || null,
        isAdmin: sess.isAdmin || false,
        capabilities: Array.isArray(sess.capabilities) ? sess.capabilities : []
      };
    } catch (err) {
      this.warn('Error reading session user:', err.message);
      return null;
    }
  }

  /**
   * Check if global rate limit is reached (total failed attempts across all IPs)
   * @returns {boolean} True if global limit is reached
   */
  isGlobalLimitReached() {
    const db = this.getSessionDB();
    const fifteenMinutesAgo = Date.now() - minutesToMs(15);

    try {
      const stmt = db.prepare('SELECT COALESCE(SUM(count), 0) as total FROM failed_attempts WHERE last_attempt > ?');
      const row = stmt.get(fifteenMinutesAgo);
      return row.total >= 50;
    } catch (err) {
      this.warn('⚠️  Error checking global rate limit:', err.message);
      return false;
    }
  }

  /**
   * Get time remaining on IP block
   * @param {string} ip - Client IP address
   * @returns {number|null} Milliseconds remaining, or null if not blocked
   */
  getBlockTimeRemaining(ip) {
    const db = this.getSessionDB();

    try {
      const stmt = db.prepare('SELECT blocked_until FROM failed_attempts WHERE ip = ?');
      const row = stmt.get(ip);

      if (!row || !row.blocked_until) {
        return null;
      }

      const remaining = row.blocked_until - Date.now();
      return remaining > 0 ? remaining : null;
    } catch (err) {
      this.warn('⚠️  Error getting block time:', err.message);
      return null;
    }
  }

  /**
   * Set callback for force-disconnecting WebSocket clients.
   * Called by server.js after wss is available.
   * @param {Function} fn - Callback(userId) that disconnects WS clients for the given user
   */
  setDisconnectCallback(fn) {
    this._disconnectCallback = fn;
  }

  /**
   * Invalidate all sessions for a user and optionally force-disconnect their WebSocket connections.
   * Scans the sessions table (JSON-embedded userId) since there's no user_id column.
   * @param {number} userId - User ID whose sessions to invalidate
   * @param {string|null} excludeSid - Session ID to keep (e.g. the admin's own session). Null to invalidate all.
   * @returns {number} Number of sessions invalidated
   */
  invalidateUserSessions(userId, excludeSid = null) {
    const db = this.getSessionDB();

    try {
      const rows = db.prepare('SELECT sid, sess FROM sessions').all();
      const sidsToDelete = [];

      for (const row of rows) {
        if (excludeSid && row.sid === excludeSid) continue;
        try {
          const sess = JSON.parse(row.sess);
          if (sess.userId === userId) sidsToDelete.push(row.sid);
        } catch { /* skip malformed session data */ }
      }

      if (sidsToDelete.length > 0) {
        const placeholders = sidsToDelete.map(() => '?').join(',');
        db.prepare(`DELETE FROM sessions WHERE sid IN (${placeholders})`).run(...sidsToDelete);
        this.log(`🔐 Invalidated ${sidsToDelete.length} session(s) for userId ${userId}`);
      }

      // Force-disconnect WebSocket clients (only when invalidating ALL sessions, not on self password change)
      if (!excludeSid && this._disconnectCallback) {
        this._disconnectCallback(userId);
      }

      return sidsToDelete.length;
    } catch (err) {
      this.warn('⚠️  Error invalidating user sessions:', err.message);
      return 0;
    }
  }
}

module.exports = new AuthManager();
