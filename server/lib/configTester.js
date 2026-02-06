/**
 * Configuration Testing Utilities
 * Provides functions to test configuration before saving
 */

const fs = require('fs').promises;
const path = require('path');
const QueuedAmuleClient = require('../modules/queuedAmuleClient');
const RtorrentHandler = require('./rtorrent/RtorrentHandler');
const ProwlarrHandler = require('./prowlarr/ProwlarrHandler');
const { checkDirectoryAccess } = require('./pathUtils');

/**
 * Test directory access (read and write permissions)
 * @param {string} dirPath - Path to test
 * @param {object} options - Options
 * @param {boolean} options.checkOnly - If true, only check existence (don't create missing directories)
 * @returns {Promise<{success: boolean, exists: boolean, readable: boolean, writable: boolean, error: string|null}>}
 */
async function testDirectoryAccess(dirPath, options = {}) {
  const { checkOnly = false } = options;
  const result = {
    success: false,
    exists: false,
    readable: false,
    writable: false,
    error: null
  };

  try {
    const resolvedPath = path.resolve(dirPath);

    // First check using shared helper (with actual write test)
    const checkResult = await checkDirectoryAccess(dirPath, true);

    // If directory doesn't exist and we're not in checkOnly mode, try to create it
    if (!checkResult.exists && !checkOnly) {
      try {
        await fs.mkdir(resolvedPath, { recursive: true });
        // Re-check after creation
        const recheck = await checkDirectoryAccess(dirPath, true);
        result.exists = recheck.exists;
        result.readable = recheck.readable;
        result.writable = recheck.writable;
        result.error = recheck.error;
        result.success = recheck.exists && recheck.readable && recheck.writable;
        return result;
      } catch (createErr) {
        result.error = `Cannot create directory: ${createErr.message}`;
        return result;
      }
    }

    // Map results
    result.exists = checkResult.exists;
    result.readable = checkResult.readable;
    result.writable = checkResult.writable;
    result.error = checkResult.error;
    result.success = checkResult.exists && checkResult.readable && checkResult.writable;

    return result;
  } catch (err) {
    result.error = `Unexpected error: ${err.message}`;
    return result;
  }
}

/**
 * Test aMule connection
 * @param {string} host - aMule EC host
 * @param {number} port - aMule EC port
 * @param {string} password - aMule EC password
 * @returns {Promise<{success: boolean, connected: boolean, version: string|null, error: string|null}>}
 */
async function testAmuleConnection(host, port, password) {
  const result = {
    success: false,
    connected: false,
    version: null,
    error: null
  };

  let client = null;

  try {
    // Create temporary client
    client = new QueuedAmuleClient(host, port, password);

    // Try to connect with timeout
    const connectPromise = client.connect();
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Connection timeout after 10 seconds')), 10000);
    });

    await Promise.race([connectPromise, timeoutPromise]);

    result.connected = true;

    // Try to get server status to verify the connection works
    try {
      const stats = await client.getStats();
      if (stats) {
        result.message = 'Connected successfully';
        result.success = true;
      }
    } catch (err) {
      // Connection works but couldn't get stats - still consider it successful
      result.message = 'Connected (stats unavailable)';
      result.success = true;
    }

    // Disconnect
    try {
      if (typeof client.disconnect === 'function') {
        await client.disconnect();
      }
    } catch (err) {
      // Ignore disconnect errors
    }

    return result;
  } catch (err) {
    result.error = err.message;

    // Try to clean up connection
    if (client) {
      try {
        if (typeof client.disconnect === 'function') {
          await client.disconnect();
        }
      } catch (cleanupErr) {
        // Ignore cleanup errors
      }
    }

    return result;
  }
}

/**
 * Test rtorrent connection via XML-RPC
 * @param {string} host - rtorrent XML-RPC host
 * @param {number} port - rtorrent XML-RPC port
 * @param {string} rpcPath - XML-RPC path (e.g., /RPC2)
 * @param {string} username - Optional username for basic auth
 * @param {string} password - Optional password for basic auth
 * @returns {Promise<{success: boolean, connected: boolean, version: string|null, error: string|null}>}
 */
async function testRtorrentConnection(host, port, rpcPath, username, password) {
  const result = {
    success: false,
    connected: false,
    version: null,
    error: null
  };

  if (!host) {
    result.error = 'Host is required';
    return result;
  }

  let client = null;

  try {
    // Create temporary client
    client = new RtorrentHandler({
      host,
      port: port || 8000,
      path: rpcPath || '/RPC2',
      username: username || null,
      password: password || null
    });

    client.connect();

    // Try to test connection with timeout
    const testPromise = client.testConnection();
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Connection timeout after 10 seconds')), 10000);
    });

    const testResult = await Promise.race([testPromise, timeoutPromise]);

    if (testResult.success) {
      result.connected = true;
      result.version = testResult.version;
      result.success = true;
      result.message = `Connected to rtorrent ${testResult.version}`;
    } else {
      result.error = testResult.error || 'Connection failed';
    }

    // Cleanup
    client.disconnect();

    return result;
  } catch (err) {
    result.error = err.message;

    // Try to clean up connection
    if (client) {
      try {
        client.disconnect();
      } catch (cleanupErr) {
        // Ignore cleanup errors
      }
    }

    return result;
  }
}

/**
 * Generic function to test *arr API connection (Sonarr, Radarr, etc.)
 * @param {string} serviceName - Name of the service (for error messages)
 * @param {string} url - Service URL
 * @param {string} apiKey - Service API key
 * @returns {Promise<{success: boolean, reachable: boolean, authenticated: boolean, version: string|null, error: string|null}>}
 */
async function testArrAPI(serviceName, url, apiKey) {
  const result = {
    success: false,
    reachable: false,
    authenticated: false,
    version: null,
    error: null
  };

  if (!url || !apiKey) {
    result.error = 'URL and API key are required';
    return result;
  }

  try {
    // Remove trailing slash from URL
    const baseUrl = url.replace(/\/$/, '');
    const endpoint = `${baseUrl}/api/v3/system/status`;

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'X-Api-Key': apiKey
      },
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });

    result.reachable = true;

    if (response.status === 401 || response.status === 403) {
      result.error = 'Authentication failed - invalid API key';
      return result;
    }

    if (!response.ok) {
      const text = await response.text();
      result.error = `HTTP ${response.status}: ${text}`;
      return result;
    }

    const data = await response.json();
    result.authenticated = true;

    if (data.version) {
      result.version = data.version;
    }

    result.success = true;
    return result;
  } catch (err) {
    if (err.name === 'AbortError' || err.message.includes('timeout')) {
      result.error = 'Connection timeout - server not reachable';
    } else if (err.message.includes('ECONNREFUSED')) {
      result.error = 'Connection refused - server not running or wrong port';
    } else if (err.message.includes('ENOTFOUND')) {
      result.error = 'Host not found - check URL';
    } else {
      result.error = err.message;
    }
    return result;
  }
}

/**
 * Test Sonarr API connection
 * @param {string} url - Sonarr URL
 * @param {string} apiKey - Sonarr API key
 * @returns {Promise<{success: boolean, reachable: boolean, authenticated: boolean, version: string|null, error: string|null}>}
 */
async function testSonarrAPI(url, apiKey) {
  return testArrAPI('Sonarr', url, apiKey);
}

/**
 * Test Radarr API connection
 * @param {string} url - Radarr URL
 * @param {string} apiKey - Radarr API key
 * @returns {Promise<{success: boolean, reachable: boolean, authenticated: boolean, version: string|null, error: string|null}>}
 */
async function testRadarrAPI(url, apiKey) {
    return testArrAPI('Radarr', url, apiKey);
}

/**
 * Test Prowlarr API connection
 * @param {string} url - Prowlarr URL
 * @param {string} apiKey - Prowlarr API key
 * @returns {Promise<{success: boolean, reachable: boolean, authenticated: boolean, version: string|null, indexerCount: number|null, error: string|null}>}
 */
async function testProwlarrAPI(url, apiKey) {
  const result = {
    success: false,
    reachable: false,
    authenticated: false,
    version: null,
    indexerCount: null,
    error: null
  };

  if (!url || !apiKey) {
    result.error = 'URL and API key are required';
    return result;
  }

  try {
    // Create temporary handler
    const handler = new ProwlarrHandler();
    handler.configure({ url, apiKey });

    // Test connection with timeout
    const testPromise = handler.testConnection();
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Connection timeout after 10 seconds')), 10000);
    });

    const testResult = await Promise.race([testPromise, timeoutPromise]);

    result.reachable = true;

    if (testResult.success) {
      result.authenticated = true;
      result.version = testResult.version;
      result.success = true;

      // Try to get indexer count
      try {
        const indexers = await handler.getIndexers();
        result.indexerCount = indexers.length;
        result.message = `Connected to Prowlarr ${result.version} with ${result.indexerCount} indexer(s)`;
      } catch (err) {
        result.message = `Connected to Prowlarr ${result.version}`;
      }
    } else {
      result.error = testResult.error || 'Connection failed';
    }

    return result;
  } catch (err) {
    if (err.name === 'AbortError' || err.message.includes('timeout')) {
      result.error = 'Connection timeout - server not reachable';
    } else if (err.message.includes('ECONNREFUSED')) {
      result.error = 'Connection refused - server not running or wrong port';
    } else if (err.message.includes('ENOTFOUND')) {
      result.error = 'Host not found - check URL';
    } else {
      result.error = err.message;
    }
    return result;
  }
}

/**
 * Test GeoIP database availability (optional feature)
 * @param {string} dirPath - Path to GeoIP directory
 * @returns {Promise<{success: boolean, available: boolean, databases: object, warning: string|null, error: string|null}>}
 */
async function testGeoIPDatabase(dirPath) {
  const result = {
    success: true, // Always successful since GeoIP is optional
    available: false,
    databases: {
      city: false,
      country: false
    },
    message: null, // For success/info messages
    warning: null, // For warnings only
    error: null
  };

  try {
    // Resolve absolute path
    const resolvedPath = path.resolve(dirPath);

    // Check if directory exists
    try {
      const stats = await fs.stat(resolvedPath);
      if (!stats.isDirectory()) {
        result.warning = 'Path exists but is not a directory. GeoIP features will be disabled.';
        return result;
      }
    } catch (err) {
      if (err.code === 'ENOENT') {
        result.warning = 'Directory does not exist. GeoIP features will be disabled.';
        return result;
      }
      result.warning = `Cannot access directory: ${err.message}. GeoIP features will be disabled.`;
      return result;
    }

    // Check for GeoIP database files
    const cityDbPath = path.join(resolvedPath, 'GeoLite2-City.mmdb');
    const countryDbPath = path.join(resolvedPath, 'GeoLite2-Country.mmdb');

    // Check City database
    try {
      await fs.access(cityDbPath, fs.constants.R_OK);
      result.databases.city = true;
    } catch (err) {
      // City database not available
    }

    // Check Country database
    try {
      await fs.access(countryDbPath, fs.constants.R_OK);
      result.databases.country = true;
    } catch (err) {
      // Country database not available
    }

    // Determine availability
    if (result.databases.city || result.databases.country) {
      result.available = true;
      const availableDbs = [];
      if (result.databases.city) availableDbs.push('City');
      if (result.databases.country) availableDbs.push('Country');
      result.message = `GeoIP databases available: ${availableDbs.join(', ')}`;
    } else {
      result.warning = 'No GeoIP databases found (GeoLite2-City.mmdb or GeoLite2-Country.mmdb). GeoIP features will be disabled.';
    }

    return result;
  } catch (err) {
    result.warning = `Error checking GeoIP databases: ${err.message}. GeoIP features will be disabled.`;
    return result;
  }
}

module.exports = {
  testDirectoryAccess,
  testGeoIPDatabase,
  testAmuleConnection,
  testRtorrentConnection,
  testSonarrAPI,
  testRadarrAPI,
  testProwlarrAPI
};
