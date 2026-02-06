/**
 * EventScriptingManager - Execute user-defined scripts on specific events
 *
 * Supports events: downloadAdded, downloadFinished, categoryChanged, fileMoved, fileDeleted
 *
 * Script invocation:
 * - Event type as first argument
 * - Environment variables: EVENT_TYPE, EVENT_HASH, EVENT_FILENAME, EVENT_CLIENT_TYPE
 * - Full JSON event data via stdin
 *
 * Execution is fire-and-forget (non-blocking), errors are logged only.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const BaseModule = require('./BaseModule');
const config = require('../modules/config');
const notificationManager = require('./NotificationManager');

class EventScriptingManager extends BaseModule {
  constructor() {
    super();
  }

  /**
   * Check if event scripting is enabled and configured
   * @returns {boolean}
   */
  isEnabled() {
    const cfg = config.getConfig()?.eventScripting;
    return cfg?.enabled === true && !!cfg?.scriptPath;
  }

  /**
   * Check if a specific event type is enabled
   * @param {string} eventType - Event type to check
   * @returns {boolean}
   */
  isEventEnabled(eventType) {
    if (!this.isEnabled()) return false;
    const cfg = config.getConfig()?.eventScripting;
    return cfg?.events?.[eventType] !== false; // Default to true if not specified
  }

  /**
   * Emit an event - fire-and-forget script execution and Apprise notifications
   * @param {string} eventType - Event type (downloadAdded, downloadFinished, etc.)
   * @param {Object} eventData - Event data object
   */
  emit(eventType, eventData) {
    // Send Apprise notification (if enabled for this event)
    notificationManager.notify(eventType, eventData).catch(err => {
      this.log(`[Notification] Error sending notification for ${eventType}: ${err.message}`);
    });

    // Execute custom script (if enabled)
    if (!this.isEventEnabled(eventType)) {
      return;
    }

    const cfg = config.getConfig()?.eventScripting;
    const scriptPath = cfg?.scriptPath;
    const timeout = cfg?.timeout || 30000;

    if (!scriptPath) {
      return;
    }

    // Fire and forget - don't await
    this._executeScript(scriptPath, eventType, eventData, timeout).catch(err => {
      this.log(`[EventScript] Error executing script for ${eventType}: ${err.message}`);
    });
  }

  /**
   * Execute the script with event data
   * @param {string} scriptPath - Path to script
   * @param {string} eventType - Event type
   * @param {Object} eventData - Event data
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<void>}
   */
  async _executeScript(scriptPath, eventType, eventData, timeout) {
    // Verify script exists and is executable
    try {
      await fs.promises.access(scriptPath, fs.constants.X_OK);
    } catch (err) {
      this.log(`[EventScript] Script not found or not executable: ${scriptPath}`);
      return;
    }

    const jsonData = JSON.stringify(eventData);

    // Build environment variables
    const env = {
      ...process.env,
      EVENT_TYPE: eventType,
      EVENT_HASH: eventData.hash || '',
      EVENT_FILENAME: eventData.filename || '',
      EVENT_CLIENT_TYPE: eventData.clientType || ''
    };

    return new Promise((resolve) => {
      const child = spawn(scriptPath, [eventType], {
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: false
      });

      let timeoutId = null;
      let killed = false;

      // Set up timeout
      if (timeout > 0) {
        timeoutId = setTimeout(() => {
          killed = true;
          child.kill('SIGTERM');
          // Give process time to terminate gracefully, then force kill
          setTimeout(() => {
            if (!child.killed) {
              child.kill('SIGKILL');
            }
          }, 5000);
          this.log(`[EventScript] Script timed out after ${timeout}ms for ${eventType}`);
        }, timeout);
      }

      // Write JSON to stdin
      child.stdin.write(jsonData);
      child.stdin.end();

      // Capture stdout/stderr for logging (but don't block on it)
      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('error', (err) => {
        if (timeoutId) clearTimeout(timeoutId);
        this.log(`[EventScript] Failed to start script for ${eventType}: ${err.message}`);
        resolve();
      });

      child.on('close', (code) => {
        if (timeoutId) clearTimeout(timeoutId);

        if (!killed) {
          if (code === 0) {
            this.log(`[EventScript] Script completed for ${eventType}${stdout ? ': ' + stdout.trim().substring(0, 100) : ''}`);
          } else {
            this.log(`[EventScript] Script exited with code ${code} for ${eventType}${stderr ? ': ' + stderr.trim().substring(0, 200) : ''}`);
          }
        }
        resolve();
      });
    });
  }

  /**
   * Test if the configured script path is valid and executable
   * @param {string} scriptPath - Path to test
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async testScriptPath(scriptPath) {
    if (!scriptPath) {
      return { success: false, message: 'Script path is required' };
    }

    try {
      // Check if file exists
      const stats = await fs.promises.stat(scriptPath);
      if (!stats.isFile()) {
        return { success: false, message: 'Path is not a file' };
      }

      // Check if executable
      await fs.promises.access(scriptPath, fs.constants.X_OK);

      return { success: true, message: `Script found and executable: ${scriptPath}` };
    } catch (err) {
      if (err.code === 'ENOENT') {
        return { success: false, message: `Script not found: ${scriptPath}` };
      }
      if (err.code === 'EACCES') {
        return { success: false, message: `Script is not executable: ${scriptPath}` };
      }
      return { success: false, message: `Error checking script: ${err.message}` };
    }
  }
}

module.exports = new EventScriptingManager();
