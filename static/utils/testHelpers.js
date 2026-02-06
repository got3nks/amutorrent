/**
 * Test Helpers
 *
 * Shared utility functions for test result validation
 */

/**
 * Check if test results contain any errors
 * @param {object} testResults - Test results object with results property
 * @param {object} formData - Form data to check which integrations are enabled
 * @returns {boolean} True if there are any test errors
 */
export function hasTestErrors(testResults, formData) {
  if (!testResults || !testResults.results) return false;

  const results = testResults.results;

  // Check aMule (only if enabled)
  if (formData?.amule?.enabled !== false && results.amule && results.amule.success === false) {
    return true;
  }

  // Check rtorrent (only if enabled)
  if (formData?.rtorrent?.enabled && results.rtorrent && results.rtorrent.success === false) {
    return true;
  }

  // Check directories (data and logs are required)
  if (results.directories) {
    if (results.directories.data && !results.directories.data.success) {
      return true;
    }
    if (results.directories.logs && !results.directories.logs.success) {
      return true;
    }
    // GeoIP is optional, so we don't check it
  }

  // Check Sonarr (only if enabled)
  if (formData?.integrations?.sonarr?.enabled && results.sonarr && results.sonarr.success === false) {
    return true;
  }

  // Check Radarr (only if enabled)
  if (formData?.integrations?.radarr?.enabled && results.radarr && results.radarr.success === false) {
    return true;
  }

  // Check Prowlarr (only if enabled)
  if (formData?.integrations?.prowlarr?.enabled && results.prowlarr && results.prowlarr.success === false) {
    return true;
  }

  return false;
}

/**
 * Check if results object contains any errors (alternative form for direct return value checking)
 * @param {object} results - Results object with results property
 * @param {object} formData - Form data to check which integrations are enabled
 * @returns {boolean} True if there are any errors
 */
export function checkResultsForErrors(results, formData) {
  if (!results || !results.results) return false;

  const testData = results.results;

  // Check aMule (only if enabled)
  if (formData?.amule?.enabled !== false && testData.amule && testData.amule.success === false) {
    return true;
  }

  // Check rtorrent (only if enabled)
  if (formData?.rtorrent?.enabled && testData.rtorrent && testData.rtorrent.success === false) {
    return true;
  }

  // Check directories (data and logs are required)
  if (testData.directories) {
    if (testData.directories.data && !testData.directories.data.success) {
      return true;
    }
    if (testData.directories.logs && !testData.directories.logs.success) {
      return true;
    }
  }

  // Check Sonarr (only if enabled)
  if (formData?.integrations?.sonarr?.enabled && testData.sonarr && testData.sonarr.success === false) {
    return true;
  }

  // Check Radarr (only if enabled)
  if (formData?.integrations?.radarr?.enabled && testData.radarr && testData.radarr.success === false) {
    return true;
  }

  // Check Prowlarr (only if enabled)
  if (formData?.integrations?.prowlarr?.enabled && testData.prowlarr && testData.prowlarr.success === false) {
    return true;
  }

  return false;
}

/**
 * Build test payload for testConfig API
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

  // Add aMule if enabled
  if (configData.amule?.enabled !== false) {
    payload.amule = configData.amule;
  }

  // Add rtorrent if enabled
  if (configData.rtorrent?.enabled) {
    payload.rtorrent = configData.rtorrent;
  }

  // Add Sonarr if enabled
  if (configData.integrations?.sonarr?.enabled) {
    payload.sonarr = configData.integrations.sonarr;
  }

  // Add Radarr if enabled
  if (configData.integrations?.radarr?.enabled) {
    payload.radarr = configData.integrations.radarr;
  }

  // Add Prowlarr if enabled
  if (configData.integrations?.prowlarr?.enabled) {
    payload.prowlarr = configData.integrations.prowlarr;
  }

  return payload;
}
