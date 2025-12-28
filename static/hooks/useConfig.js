/**
 * useConfig Hook
 *
 * Manages configuration state and API interactions
 */

import { useState, useCallback } from 'https://esm.sh/react@18.2.0';

/**
 * Custom hook for configuration management
 * @returns {object} Configuration state and methods
 */
export const useConfig = () => {
  const [configStatus, setConfigStatus] = useState(null);
  const [currentConfig, setCurrentConfig] = useState(null);
  const [defaults, setDefaults] = useState(null);
  const [testResults, setTestResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Fetch configuration status (first-run check, Docker detection)
   */
  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/config/status');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      setConfigStatus(data);
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Fetch current configuration
   */
  const fetchCurrent = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/config/current');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      setCurrentConfig(data);
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Fetch default configuration (with env var overrides)
   */
  const fetchDefaults = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/config/defaults');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      setDefaults(data);
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Test configuration
   * @param {object} config - Configuration to test (partial or complete)
   */
  const testConfig = useCallback(async (config) => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/config/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(config)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setTestResults(data);
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Save configuration
   * @param {object} config - Complete configuration object
   */
  const saveConfig = useCallback(async (config) => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/config/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(config)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Clear test results
   */
  const clearTestResults = useCallback(() => {
    setTestResults(null);
  }, []);

  /**
   * Clear error
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    // State
    configStatus,
    currentConfig,
    defaults,
    testResults,
    loading,
    error,

    // Methods
    fetchStatus,
    fetchCurrent,
    fetchDefaults,
    testConfig,
    saveConfig,
    clearTestResults,
    clearError
  };
};
