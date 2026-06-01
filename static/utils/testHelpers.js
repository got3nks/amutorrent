/**
 * Test Helpers
 *
 * Shared utility functions for test result validation.
 * Uses `clientTestResults` (per-instance keyed object) for client checks.
 */

/**
 * Check if any client instance has a failure in test results.
 * @param {Object} clientTestResults - { [key]: { success, message, _label } }
 */
function _hasClientErrors(clientTestResults) {
  if (!clientTestResults) return false;
  return Object.values(clientTestResults).some(r => r && r.success === false);
}

/**
 * Check if test results contain any errors
 * @param {object} testResults - Test results object with results property (non-client: directories, integrations)
 * @param {object} clientTestResults - Per-instance client test results
 * @returns {boolean} True if there are any test errors
 */
export function hasTestErrors(testResults, clientTestResults) {
  // Check client errors
  if (_hasClientErrors(clientTestResults)) return true;

  if (!testResults || !testResults.results) return false;
  const results = testResults.results;

  // Check directories (data and logs are required)
  if (results.directories) {
    if (results.directories.data && !results.directories.data.success) return true;
    if (results.directories.logs && !results.directories.logs.success) return true;
  }

  // Check integrations — if a result exists and failed, it's an error
  if (results.sonarr && results.sonarr.success === false) return true;
  if (results.radarr && results.radarr.success === false) return true;
  if (results.lidarr && results.lidarr.success === false) return true;
  if (results.readarr && results.readarr.success === false) return true;
  if (results.prowlarr && results.prowlarr.success === false) return true;

  return false;
}

/**
 * Check if results object contains any errors (for direct return value checking)
 * @param {object} results - Results object with results property
 * @param {object} clientTestResults - Per-instance client test results
 * @returns {boolean} True if there are any errors
 */
export function checkResultsForErrors(results, clientTestResults) {
  // Check client errors
  if (_hasClientErrors(clientTestResults)) return true;

  if (!results || !results.results) return false;
  const testData = results.results;

  // Check directories (data and logs are required)
  if (testData.directories) {
    if (testData.directories.data && !testData.directories.data.success) return true;
    if (testData.directories.logs && !testData.directories.logs.success) return true;
  }

  // Check integrations
  if (testData.sonarr && testData.sonarr.success === false) return true;
  if (testData.radarr && testData.radarr.success === false) return true;
  if (testData.lidarr && testData.lidarr.success === false) return true;
  if (testData.readarr && testData.readarr.success === false) return true;
  if (testData.prowlarr && testData.prowlarr.success === false) return true;

  return false;
}

/**
 * Build test payload for testConfig API (used by SetupWizard)
 * @param {object} formData - Form data containing configuration
 * @param {boolean} unmaskPasswords - Whether to unmask passwords (for SettingsView)
 * @param {function} getUnmaskedConfig - Function to unmask config (optional, for SettingsView)
 * @returns {object} Test payload
 */
export function buildTestPayload(formData, unmaskPasswords = false, getUnmaskedConfig = null) {
  const configData = unmaskPasswords && getUnmaskedConfig ? getUnmaskedConfig(formData) : formData;

  const payload = {
    directories: configData.directories
  };

  // Build from clients array
  if (configData.clients) {
    const seenTypes = new Set();
    for (const client of configData.clients) {
      if (client.enabled === false || seenTypes.has(client.type)) continue;
      seenTypes.add(client.type);
      payload[client.type] = { ...client, instanceId: client.id };
    }
  }

  // Add Sonarr if enabled
  if (configData.integrations?.sonarr?.enabled) {
    payload.sonarr = configData.integrations.sonarr;
  }

  // Add Radarr if enabled
  if (configData.integrations?.radarr?.enabled) {
    payload.radarr = configData.integrations.radarr;
  }

  // Add Lidarr if enabled
  if (configData.integrations?.lidarr?.enabled) {
    payload.lidarr = configData.integrations.lidarr;
  }

  // Add Readarr if enabled
  if (configData.integrations?.readarr?.enabled) {
    payload.readarr = configData.integrations.readarr;
  }

  // Add Prowlarr if enabled
  if (configData.integrations?.prowlarr?.enabled) {
    payload.prowlarr = configData.integrations.prowlarr;
  }

  return payload;
}
