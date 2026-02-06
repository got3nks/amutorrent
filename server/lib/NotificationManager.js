/**
 * NotificationManager - Manage Apprise notification services
 *
 * Handles CRUD operations for notification services and sends notifications
 * via the Apprise CLI.
 */

const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const BaseModule = require('./BaseModule');
const config = require('../modules/config');

class NotificationManager extends BaseModule {
  constructor() {
    super();
    this.configPath = null;
    this.notificationConfig = null;
    this.appriseAvailable = null; // cached result
  }

  /**
   * Initialize the notification manager
   * Called after config is loaded
   */
  init() {
    const dataDir = config.getDataDir();
    this.configPath = path.join(dataDir, 'notifications.json');
    this._loadConfig();
    this._checkAppriseAvailable();
  }

  /**
   * Check if Apprise CLI is available
   * @returns {Promise<{available: boolean, version?: string, error?: string}>}
   */
  async checkAppriseAvailable() {
    return new Promise((resolve) => {
      try {
        const result = execSync('apprise --version 2>&1', { encoding: 'utf8', timeout: 5000 });
        const version = result.trim().split('\n')[0];
        this.appriseAvailable = { available: true, version };
        resolve(this.appriseAvailable);
      } catch (err) {
        if (err.code === 'ENOENT' || (err.message && err.message.includes('not found'))) {
          this.appriseAvailable = { available: false, error: 'Apprise CLI not installed' };
        } else {
          this.appriseAvailable = { available: false, error: err.message };
        }
        resolve(this.appriseAvailable);
      }
    });
  }

  /**
   * Synchronous check for Apprise (called during init)
   */
  _checkAppriseAvailable() {
    try {
      const result = execSync('apprise --version 2>&1', { encoding: 'utf8', timeout: 5000 });
      const version = result.trim().split('\n')[0];
      this.appriseAvailable = { available: true, version };
      this.log(`[NotificationManager] Apprise available: ${version}`);
    } catch (err) {
      this.appriseAvailable = { available: false, error: 'Apprise CLI not installed' };
      this.log('[NotificationManager] Apprise CLI not available');
    }
  }

  /**
   * Get cached Apprise availability status
   * @returns {{available: boolean, version?: string, error?: string}}
   */
  getAppriseStatus() {
    return this.appriseAvailable || { available: false, error: 'Not checked yet' };
  }

  /**
   * Load notification configuration from file
   */
  _loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf8');
        this.notificationConfig = JSON.parse(data);
        this.log('[NotificationManager] Configuration loaded');
      } else {
        // Create default config
        this.notificationConfig = {
          enabled: false,
          events: {
            downloadAdded: true,
            downloadFinished: true,
            categoryChanged: false,
            fileMoved: true,
            fileDeleted: true
          },
          services: []
        };
        this._saveConfig();
        this.log('[NotificationManager] Created default configuration');
      }
    } catch (err) {
      this.log(`[NotificationManager] Error loading config: ${err.message}`);
      this.notificationConfig = {
        enabled: false,
        events: {},
        services: []
      };
    }
  }

  /**
   * Save notification configuration to file
   */
  _saveConfig() {
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.configPath, JSON.stringify(this.notificationConfig, null, 2));
    } catch (err) {
      this.log(`[NotificationManager] Error saving config: ${err.message}`);
      throw err;
    }
  }

  /**
   * Build Apprise URL from service configuration
   * @param {Object} service - Service configuration
   * @returns {string|null} Apprise URL or null if invalid
   */
  _buildAppriseUrl(service) {
    const { type, config: cfg } = service;

    switch (type) {
      case 'discord':
        if (!cfg.webhook_id || !cfg.webhook_token) return null;
        return `discord://${cfg.webhook_id}/${cfg.webhook_token}`;

      case 'telegram':
        if (!cfg.bot_token || !cfg.chat_id) return null;
        return `tgram://${cfg.bot_token}/${cfg.chat_id}`;

      case 'slack':
        if (!cfg.token_a || !cfg.token_b || !cfg.token_c) return null;
        const channel = cfg.channel ? `/#${cfg.channel}` : '';
        return `slack://${cfg.token_a}/${cfg.token_b}/${cfg.token_c}${channel}`;

      case 'pushover':
        if (!cfg.user_key || !cfg.api_token) return null;
        return `pover://${cfg.user_key}@${cfg.api_token}`;

      case 'ntfy':
        if (!cfg.topic) return null;
        const host = cfg.host || 'ntfy.sh';
        return `ntfy://${host}/${cfg.topic}`;

      case 'gotify':
        if (!cfg.host || !cfg.token) return null;
        return `gotify://${cfg.host}/${cfg.token}`;

      case 'email':
        if (!cfg.smtp_host || !cfg.smtp_user || !cfg.to_email) return null;
        const port = cfg.smtp_port || 587;
        const password = cfg.smtp_password ? `:${cfg.smtp_password}` : '';
        const secure = cfg.smtp_secure ? 's' : '';
        return `mailto${secure}://${cfg.smtp_user}${password}@${cfg.smtp_host}:${port}?to=${cfg.to_email}`;

      case 'webhook':
        if (!cfg.url) return null;
        // JSON webhook
        return `json://${cfg.url.replace(/^https?:\/\//, '')}`;

      case 'custom':
        return cfg.url || null;

      default:
        return null;
    }
  }

  /**
   * Generate a unique ID for a service
   * @returns {string} UUID-like string
   */
  _generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Check if notifications are enabled
   * @returns {boolean}
   */
  isEnabled() {
    return this.notificationConfig?.enabled === true;
  }

  /**
   * Check if a specific event type is enabled for notifications
   * @param {string} eventType - Event type to check
   * @returns {boolean}
   */
  isEventEnabled(eventType) {
    if (!this.isEnabled()) return false;
    if (!this.appriseAvailable?.available) return false;
    return this.notificationConfig?.events?.[eventType] === true;
  }

  /**
   * Get notification configuration (enabled state and events)
   * @returns {Object} Configuration object
   */
  getConfig() {
    return {
      enabled: this.notificationConfig?.enabled || false,
      events: this.notificationConfig?.events || {}
    };
  }

  /**
   * Save notification configuration (enabled state and events)
   * @param {Object} cfg - Configuration to save
   */
  saveConfig(cfg) {
    this.notificationConfig.enabled = cfg.enabled === true;
    if (cfg.events) {
      this.notificationConfig.events = { ...cfg.events };
    }
    this._saveConfig();
    this.log('[NotificationManager] Configuration updated');
  }

  /**
   * Get all configured services
   * @returns {Array} Array of services (config passwords masked)
   */
  getServices() {
    return (this.notificationConfig?.services || []).map(service => ({
      ...service,
      config: this._maskServiceConfig(service.type, service.config)
    }));
  }

  /**
   * Mask sensitive fields in service config
   * @param {string} type - Service type
   * @param {Object} cfg - Service config
   * @returns {Object} Masked config
   */
  _maskServiceConfig(type, cfg) {
    if (!cfg) return cfg;
    const masked = { ...cfg };

    // Mask sensitive fields based on service type
    const sensitiveFields = {
      discord: ['webhook_token'],
      telegram: ['bot_token'],
      slack: ['token_a', 'token_b', 'token_c'],
      pushover: ['api_token'],
      gotify: ['token'],
      email: ['smtp_password'],
      custom: []
    };

    const fields = sensitiveFields[type] || [];
    fields.forEach(field => {
      if (masked[field]) {
        masked[field] = '********';
      }
    });

    return masked;
  }

  /**
   * Add a new notification service
   * @param {Object} serviceData - Service data (name, type, enabled, config)
   * @returns {Object} Created service
   */
  addService(serviceData) {
    const service = {
      id: this._generateId(),
      name: serviceData.name,
      type: serviceData.type,
      enabled: serviceData.enabled !== false,
      config: serviceData.config || {}
    };

    this.notificationConfig.services.push(service);
    this._saveConfig();
    this.log(`[NotificationManager] Added service: ${service.name} (${service.type})`);

    return {
      ...service,
      config: this._maskServiceConfig(service.type, service.config)
    };
  }

  /**
   * Update an existing notification service
   * @param {string} id - Service ID
   * @param {Object} updates - Updates to apply
   * @returns {Object|null} Updated service or null if not found
   */
  updateService(id, updates) {
    const index = this.notificationConfig.services.findIndex(s => s.id === id);
    if (index === -1) return null;

    const existing = this.notificationConfig.services[index];

    // Merge config, preserving existing passwords if masked
    let newConfig = { ...existing.config };
    if (updates.config) {
      Object.entries(updates.config).forEach(([key, value]) => {
        // Don't overwrite with masked value
        if (value !== '********') {
          newConfig[key] = value;
        }
      });
    }

    const updated = {
      ...existing,
      name: updates.name !== undefined ? updates.name : existing.name,
      enabled: updates.enabled !== undefined ? updates.enabled : existing.enabled,
      config: newConfig
    };

    this.notificationConfig.services[index] = updated;
    this._saveConfig();
    this.log(`[NotificationManager] Updated service: ${updated.name}`);

    return {
      ...updated,
      config: this._maskServiceConfig(updated.type, updated.config)
    };
  }

  /**
   * Delete a notification service
   * @param {string} id - Service ID
   * @returns {boolean} True if deleted
   */
  deleteService(id) {
    const index = this.notificationConfig.services.findIndex(s => s.id === id);
    if (index === -1) return false;

    const service = this.notificationConfig.services[index];
    this.notificationConfig.services.splice(index, 1);
    this._saveConfig();
    this.log(`[NotificationManager] Deleted service: ${service.name}`);
    return true;
  }

  /**
   * Test notification services
   * @param {string|null} serviceId - Specific service ID to test, or null for all
   * @returns {Promise<Object>} Test results
   */
  async testServices(serviceId = null) {
    // Check if Apprise is available
    if (!this.appriseAvailable?.available) {
      return { success: false, message: 'Apprise CLI is not installed' };
    }

    const services = serviceId
      ? this.notificationConfig.services.filter(s => s.id === serviceId)
      : this.notificationConfig.services.filter(s => s.enabled);

    if (services.length === 0) {
      return { success: false, message: 'No services to test' };
    }

    const urls = services.map(s => this._buildAppriseUrl(s)).filter(u => u);
    if (urls.length === 0) {
      return { success: false, message: 'No valid service configurations' };
    }

    const testTitle = 'aMuTorrent Test Notification';
    const testBody = 'This is a test notification from aMuTorrent Web Controller.';

    try {
      const result = await this._sendApprise(testTitle, testBody, urls);
      return result;
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  /**
   * Send a notification for an event
   * @param {string} eventType - Event type
   * @param {Object} eventData - Event data
   */
  async notify(eventType, eventData) {
    if (!this.isEventEnabled(eventType)) {
      return;
    }

    const enabledServices = this.notificationConfig.services.filter(s => s.enabled);
    if (enabledServices.length === 0) {
      return;
    }

    const urls = enabledServices.map(s => this._buildAppriseUrl(s)).filter(u => u);
    if (urls.length === 0) {
      return;
    }

    const title = this._buildNotificationTitle(eventType, eventData);
    const body = this._buildNotificationBody(eventType, eventData);

    try {
      await this._sendApprise(title, body, urls);
      this.log(`[NotificationManager] Notification sent for ${eventType}`);
    } catch (err) {
      this.log(`[NotificationManager] Failed to send notification: ${err.message}`);
    }
  }

  /**
   * Build notification title based on event type
   * @param {string} eventType - Event type
   * @param {Object} eventData - Event data
   * @returns {string} Title
   */
  _buildNotificationTitle(eventType, eventData) {
    const clientType = eventData.clientType ? ` (${eventData.clientType})` : '';
    switch (eventType) {
      case 'downloadAdded':
        return `Download Started${clientType}`;
      case 'downloadFinished':
        return `Download Complete${clientType}`;
      case 'categoryChanged':
        return `Category Changed${clientType}`;
      case 'fileMoved':
        return `File Moved${clientType}`;
      case 'fileDeleted':
        return `File Deleted${clientType}`;
      default:
        return `aMuTorrent Event${clientType}`;
    }
  }

  /**
   * Build notification body based on event type
   * @param {string} eventType - Event type
   * @param {Object} eventData - Event data
   * @returns {string} Body
   */
  _buildNotificationBody(eventType, eventData) {
    const filename = eventData.filename || eventData.name || 'Unknown file';

    switch (eventType) {
      case 'downloadAdded':
        return `Started downloading: ${filename}`;
      case 'downloadFinished':
        return `Completed: ${filename}`;
      case 'categoryChanged':
        const oldCat = eventData.oldCategory || 'None';
        const newCat = eventData.newCategory || eventData.category || 'None';
        return `${filename}\n${oldCat} → ${newCat}`;
      case 'fileMoved':
        const dest = eventData.destination || eventData.newPath || 'Unknown';
        return `Moved: ${filename}\nTo: ${dest}`;
      case 'fileDeleted':
        return `Deleted: ${filename}`;
      default:
        return filename;
    }
  }

  /**
   * Send notification via Apprise CLI
   * @param {string} title - Notification title
   * @param {string} body - Notification body
   * @param {Array<string>} urls - Apprise URLs
   * @returns {Promise<Object>} Result
   */
  _sendApprise(title, body, urls) {
    return new Promise((resolve, reject) => {
      // Use apprise CLI directly with URLs
      const args = [
        '-t', title,
        '-b', body,
        ...urls
      ];

      const child = spawn('apprise', args, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('error', (err) => {
        if (err.code === 'ENOENT') {
          reject(new Error('Apprise CLI not found. Install with: pipx install apprise'));
        } else {
          reject(err);
        }
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, message: 'Notification sent successfully' });
        } else {
          const errorMsg = stderr.trim() || stdout.trim() || `Apprise exited with code ${code}`;
          resolve({ success: false, message: errorMsg });
        }
      });

      // Set a timeout
      setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error('Notification timed out after 30 seconds'));
      }, 30000);
    });
  }
}

module.exports = new NotificationManager();
