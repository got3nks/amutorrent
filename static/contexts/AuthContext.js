/**
 * AuthContext
 *
 * Manages authentication state and initialization:
 * - Auth status check on mount
 * - First-run detection
 * - Login/logout operations
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'https://esm.sh/react@18.2.0';

const { createElement: h } = React;

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authEnabled, setAuthEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // First-run state (moved from AppContent)
  const [isFirstRun, setIsFirstRun] = useState(null);

  // Login delay info from status check (persists across page loads)
  const [loginDelay, setLoginDelay] = useState({ retryDelay: 0, retryAfter: 0 });

  /**
   * Check authentication status
   */
  const checkAuthStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/status');
      const data = await response.json();

      setAuthEnabled(data.authEnabled);
      setIsAuthenticated(data.authenticated);
      setLoginDelay({
        retryDelay: data.retryDelay || 0,
        retryAfter: data.retryAfter || 0
      });
      return data;
    } catch (err) {
      console.error('Failed to check auth status:', err);
      setAuthEnabled(false);
      setIsAuthenticated(false);
      return { authEnabled: false, authenticated: false };
    }
  }, []);

  /**
   * Check first-run status
   */
  const checkFirstRunStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/config/status');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      return data.firstRun;
    } catch (err) {
      console.error('Failed to check first-run status:', err);
      return false;
    }
  }, []);

  /**
   * Initialize auth and first-run status on mount
   */
  useEffect(() => {
    const initialize = async () => {
      try {
        setLoading(true);
        await checkAuthStatus();
        const firstRun = await checkFirstRunStatus();
        setIsFirstRun(firstRun);
      } catch (err) {
        console.error('Failed to initialize:', err);
        setIsFirstRun(false);
      } finally {
        setLoading(false);
      }
    };
    initialize();
  }, [checkAuthStatus, checkFirstRunStatus]);

  /**
   * Login with password
   */
  const login = useCallback(async (password, rememberMe = false) => {
    try {
      setError(null);

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ password, rememberMe })
      });

      const data = await response.json();

      if (data.success) {
        setIsAuthenticated(true);
        setError(null);
        setLoginDelay({ retryDelay: 0, retryAfter: 0 });
        return { success: true };
      } else {
        setError(data.message || 'Login failed');
        return {
          success: false,
          retryDelay: data.retryDelay || 0,
          retryAfter: data.retryAfter || 0
        };
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('An error occurred during login');
      return { success: false };
    }
  }, []);

  /**
   * Logout
   */
  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setIsAuthenticated(false);
      setError(null);
    } catch (err) {
      console.error('Logout error:', err);
    }
  }, []);

  /**
   * Clear error
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Complete first-run setup
   */
  const completeFirstRun = useCallback(() => {
    setIsFirstRun(false);
  }, []);

  // Memoize context value to prevent unnecessary re-renders of consumers
  const value = useMemo(() => ({
    // State
    isAuthenticated,
    authEnabled,
    loading,
    error,
    isFirstRun,
    loginDelay,

    // Methods
    login,
    logout,
    checkAuthStatus,
    clearError,
    completeFirstRun
  }), [isAuthenticated, authEnabled, loading, error, isFirstRun, loginDelay, login, logout, checkAuthStatus, clearError, completeFirstRun]);

  return h(AuthContext.Provider, { value }, children);
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
