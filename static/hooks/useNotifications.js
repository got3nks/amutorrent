/**
 * useNotifications Hook
 *
 * Manages notification settings and services API interactions
 */

import { useState, useCallback } from 'https://esm.sh/react@18.2.0';

/**
 * Custom hook for notification management
 * @returns {object} Notification state and methods
 */
export const useNotifications = () => {
  const [appriseStatus, setAppriseStatus] = useState(null);
  const [config, setConfig] = useState(null);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [testResult, setTestResult] = useState(null);

  /**
   * Fetch Apprise availability status
   */
  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/notifications/status');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      setAppriseStatus(data);
      return data;
    } catch (err) {
      setAppriseStatus({ available: false, error: err.message });
      return { available: false, error: err.message };
    }
  }, []);

  /**
   * Fetch notification configuration (enabled state, events)
   */
  const fetchConfig = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/notifications/config');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      setConfig(data);
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Save notification configuration
   * @param {object} cfg - Configuration to save
   */
  const saveConfig = useCallback(async (cfg) => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/notifications/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg)
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }
      const data = await response.json();
      setConfig(cfg);
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Fetch all notification services
   */
  const fetchServices = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/notifications/services');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      setServices(data.services || []);
      return data.services || [];
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Add a new notification service
   * @param {object} serviceData - Service data
   */
  const addService = useCallback(async (serviceData) => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/notifications/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(serviceData)
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }
      const data = await response.json();
      setServices(prev => [...prev, data.service]);
      return data.service;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Update an existing notification service
   * @param {string} id - Service ID
   * @param {object} updates - Updates to apply
   */
  const updateService = useCallback(async (id, updates) => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/notifications/services/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }
      const data = await response.json();
      setServices(prev => prev.map(s => s.id === id ? data.service : s));
      return data.service;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Delete a notification service
   * @param {string} id - Service ID
   */
  const deleteService = useCallback(async (id) => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/notifications/services/${id}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }
      setServices(prev => prev.filter(s => s.id !== id));
      return true;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Test notification services
   * @param {string|null} serviceId - Service ID to test, or null for all
   */
  const testServices = useCallback(async (serviceId = null) => {
    try {
      setLoading(true);
      setError(null);
      setTestResult(null);
      const url = serviceId
        ? `/api/notifications/test/${serviceId}`
        : '/api/notifications/test';
      const response = await fetch(url, { method: 'POST' });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }
      const data = await response.json();
      setTestResult(data);
      return data;
    } catch (err) {
      setError(err.message);
      setTestResult({ success: false, message: err.message });
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Clear test result
   */
  const clearTestResult = useCallback(() => {
    setTestResult(null);
  }, []);

  return {
    // State
    appriseStatus,
    config,
    services,
    loading,
    error,
    testResult,

    // Methods
    fetchStatus,
    fetchConfig,
    saveConfig,
    fetchServices,
    addService,
    updateService,
    deleteService,
    testServices,
    clearError,
    clearTestResult
  };
};
