/**
 * HealthTracker — per-instance health state machine with debouncing.
 *
 * Tracks whether each client instance is available or unavailable,
 * and emits transition events only on state changes.
 *
 * States: unknown → available ↔ unavailable
 * - unknown → available: silent (initial connection)
 * - unknown → stays unknown: no event (offline at boot)
 * - available → unavailable: after debounceThreshold consecutive failures
 * - unavailable → available: immediate on first success
 */

'use strict';

class HealthTracker {
  /**
   * @param {Object} [options]
   * @param {number} [options.debounceThreshold=3] - Consecutive failures required before declaring unavailable
   */
  constructor(options = {}) {
    this.debounceThreshold = options.debounceThreshold || 3;
    this.instances = new Map();
  }

  /**
   * Update health state for an instance. Returns a transition event or null.
   * @param {string} instanceId
   * @param {boolean} connected - current connection state
   * @param {string|null} error - error message if disconnected
   * @returns {{ event: 'clientAvailable'|'clientUnavailable', instanceId, error }|null}
   */
  update(instanceId, connected, error) {
    let state = this.instances.get(instanceId);
    if (!state) {
      state = { status: 'unknown', consecutiveFailures: 0, consecutiveSuccesses: 0, lastTransitionTime: 0 };
      this.instances.set(instanceId, state);
    }

    if (connected) {
      state.consecutiveFailures = 0;
      state.consecutiveSuccesses++;

      if (state.status === 'unavailable') {
        const prevTransition = state.lastTransitionTime;
        state.status = 'available';
        state.lastTransitionTime = Date.now();
        return { event: 'clientAvailable', instanceId, error: null, downtimeSince: prevTransition };
      }
      if (state.status === 'unknown') {
        state.status = 'available';
        state.lastTransitionTime = Date.now();
      }
    } else {
      state.consecutiveSuccesses = 0;
      state.consecutiveFailures++;

      if (state.status === 'available' && state.consecutiveFailures >= this.debounceThreshold) {
        state.status = 'unavailable';
        state.lastTransitionTime = Date.now();
        return { event: 'clientUnavailable', instanceId, error };
      }
    }

    return null;
  }

  /**
   * Remove tracking for an instance (when removed from config).
   */
  remove(instanceId) {
    this.instances.delete(instanceId);
  }

  /**
   * Reset all tracking (on reinitializeClients).
   */
  reset() {
    this.instances.clear();
  }
}

module.exports = HealthTracker;
