/**
 * FloodGuard — per-key rate limiter for notifications.
 *
 * Allows up to maxEvents notifications per key within a time window.
 * After the limit is hit, suppresses further notifications for a cooldown period.
 * The last allowed notification is marked as a "final warning" so the caller
 * can append a suppression message.
 */

'use strict';

class FloodGuard {
  /**
   * @param {Object} [options]
   * @param {number} [options.maxEvents=3] - Max events before suppression kicks in
   * @param {number} [options.windowMs=600000] - Window to count events in (default: 10 minutes)
   * @param {number} [options.cooldownMs=3600000] - Cooldown after suppression (default: 1 hour)
   */
  constructor(options = {}) {
    this.maxEvents = options.maxEvents || 3;
    this.windowMs = options.windowMs || 10 * 60 * 1000;
    this.cooldownMs = options.cooldownMs || 60 * 60 * 1000;
    this.buckets = new Map();
  }

  /**
   * Check if a notification should be sent or suppressed.
   * @param {string} key - Grouping key (e.g., instanceId)
   * @returns {{ allowed: boolean, isFinalWarning: boolean }}
   */
  check(key) {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = { timestamps: [], suppressed: false, suppressedUntil: 0 };
      this.buckets.set(key, bucket);
    }

    // If in cooldown, check if it's expired
    if (bucket.suppressed && now >= bucket.suppressedUntil) {
      bucket.suppressed = false;
      bucket.timestamps = [];
    }

    // If suppressed, block
    if (bucket.suppressed) {
      return { allowed: false, isFinalWarning: false };
    }

    // Clean old timestamps outside window
    bucket.timestamps = bucket.timestamps.filter(t => now - t < this.windowMs);
    bucket.timestamps.push(now);

    // Check if we've hit the limit
    if (bucket.timestamps.length >= this.maxEvents) {
      bucket.suppressed = true;
      bucket.suppressedUntil = now + this.cooldownMs;
      return { allowed: true, isFinalWarning: true };
    }

    return { allowed: true, isFinalWarning: false };
  }

  /**
   * Remove a key's bucket (when instance removed from config).
   */
  remove(key) {
    this.buckets.delete(key);
  }

  /**
   * Reset all buckets.
   */
  reset() {
    this.buckets.clear();
  }
}

module.exports = FloodGuard;
