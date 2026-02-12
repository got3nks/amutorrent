/**
 * SettingsView Component
 *
 * Full-page settings view for viewing and editing configuration
 * Uses contexts directly for all data and actions
 */

import React from 'https://esm.sh/react@18.2.0';
const { createElement: h, useState, useEffect } = React;

import { useConfig } from '../../hooks/index.js';
import { useAppState } from '../../contexts/AppStateContext.js';
import { LoadingSpinner, AlertBox, IconButton, Input } from '../common/index.js';
import DirectoryBrowserModal from '../modals/DirectoryBrowserModal.js';
import {
  ConfigSection,
  ConfigField,
  TestButton,
  TestResultIndicator,
  PasswordField,
  EnableToggle,
  TestSummary,
  IntegrationConfigInfo
} from '../settings/index.js';
import { validatePassword } from '../../utils/passwordValidator.js';
import { hasTestErrors as checkTestErrors, checkResultsForErrors, buildTestPayload } from '../../utils/testHelpers.js';

/**
 * SettingsView component - now uses contexts directly
 */
const SettingsView = () => {
  // Get navigation from context
  const { setAppCurrentView } = useAppState();
  const onClose = () => setAppCurrentView('home');

  const {
    currentConfig,
    configStatus,
    testResults,
    loading,
    error,
    fetchCurrent,
    fetchStatus,
    testConfig,
    saveConfig,
    clearTestResults,
    clearError
  } = useConfig();

  const [formData, setFormData] = useState(null);
  const [originalPasswords, setOriginalPasswords] = useState(null);
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [saveError, setSaveError] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [scriptTestResult, setScriptTestResult] = useState(null);
  const [openSections, setOpenSections] = useState({
    server: false,
    amule: false,
    integrations: false,
    bittorrent: false,
    directories: false,
    history: false,
    eventScripting: false,
    sonarr: false,
    radarr: false,
    prowlarr: false
  });
  const [showScriptBrowser, setShowScriptBrowser] = useState(false);

  // Load current configuration on mount
  useEffect(() => {
    fetchStatus();
    fetchCurrent();
  }, []);

  // Initialize form data when config is loaded
  useEffect(() => {
    if (currentConfig && !formData) {
      // Store masked form data for display
      setFormData({
        server: { ...currentConfig.server },
        amule: { ...currentConfig.amule },
        rtorrent: { ...currentConfig.rtorrent },
        qbittorrent: { ...currentConfig.qbittorrent || { enabled: false, host: '127.0.0.1', port: 8080, username: 'admin', password: '', useSsl: false } },
        directories: { ...currentConfig.directories },
        integrations: {
          sonarr: { ...currentConfig.integrations.sonarr },
          radarr: { ...currentConfig.integrations.radarr },
          prowlarr: { ...currentConfig.integrations?.prowlarr || { enabled: false, url: '', apiKey: '' } }
        },
        history: { ...currentConfig.history },
        eventScripting: { ...currentConfig.eventScripting || {
          enabled: false,
          scriptPath: '',
          events: {
            downloadAdded: true,
            downloadFinished: true,
            categoryChanged: true,
            fileMoved: true,
            fileDeleted: true
          },
          timeout: 30000
        }}
      });

      // Store original password values (masked as '********')
      // We'll keep them as '********' markers to know they haven't been changed
      setOriginalPasswords({
        auth: currentConfig.server?.auth?.password || '',
        amule: currentConfig.amule.password,
        rtorrent: currentConfig.rtorrent?.password || '',
        qbittorrent: currentConfig.qbittorrent?.password || '',
        sonarr: currentConfig.integrations.sonarr.apiKey,
        radarr: currentConfig.integrations.radarr.apiKey,
        prowlarr: currentConfig.integrations?.prowlarr?.apiKey || ''
      });
    }
  }, [currentConfig]);

  // Auto-open sections with test failures (preserves existing open state)
  useEffect(() => {
    if (!testResults || !testResults.results) return;

    const results = testResults.results;

    setOpenSections(prev => {
      const updates = {};

      // Only auto-open sections that have failures
      // (preserves existing state for sections without failures)

      // Check aMule
      if (results.amule && results.amule.success === false) {
        updates.amule = true;
      }

      // Check rtorrent
      if (results.rtorrent && results.rtorrent.success === false) {
        updates.bittorrent = true;
      }

      // Check qbittorrent
      if (results.qbittorrent && results.qbittorrent.success === false) {
        updates.bittorrent = true;
      }

      // Check directories
      if (results.directories) {
        if ((results.directories.data && !results.directories.data.success) ||
            (results.directories.logs && !results.directories.logs.success)) {
          updates.directories = true;
        }
      }

      // Check Sonarr
      if (results.sonarr && results.sonarr.success === false) {
        updates.sonarr = true;
      }

      // Check Radarr
      if (results.radarr && results.radarr.success === false) {
        updates.radarr = true;
      }

      // Check Prowlarr
      if (results.prowlarr && results.prowlarr.success === false) {
        updates.prowlarr = true;
      }

      // Return merged state (preserves existing open sections)
      return { ...prev, ...updates };
    });
  }, [testResults]);

  // Helper to unmask passwords for API calls
  // If a password is still '********', we DON'T send it (server will keep existing value)
  const getUnmaskedConfig = (config) => {
    const unmasked = JSON.parse(JSON.stringify(config));

    // Remove masked passwords - server will keep existing values
    if (unmasked.server?.auth?.password === '********') {
      delete unmasked.server.auth.password;
    }
    if (unmasked.amule?.password === '********') {
      delete unmasked.amule.password;
    }
    if (unmasked.rtorrent?.password === '********') {
      delete unmasked.rtorrent.password;
    }
    if (unmasked.qbittorrent?.password === '********') {
      delete unmasked.qbittorrent.password;
    }
    if (unmasked.integrations?.sonarr?.apiKey === '********') {
      delete unmasked.integrations.sonarr.apiKey;
    }
    if (unmasked.integrations?.radarr?.apiKey === '********') {
      delete unmasked.integrations.radarr.apiKey;
    }
    if (unmasked.integrations?.prowlarr?.apiKey === '********') {
      delete unmasked.integrations.prowlarr.apiKey;
    }

    return unmasked;
  };

  // Update field value
  const updateField = (section, field, value) => {
    setFormData(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value
      }
    }));
    setHasChanges(true);
    setSaveSuccess(false);
    clearTestResults();
  };

  // Update nested field value (for integrations)
  const updateNestedField = (section, subsection, field, value) => {
    setFormData(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [subsection]: {
          ...prev[section][subsection],
          [field]: value
        }
      }
    }));
    setHasChanges(true);
    setSaveSuccess(false);
    clearTestResults();
  };

  // Test aMule connection
  const handleTestAmule = async () => {
    if (!formData || formData.amule?.enabled === false) return;
    setIsTesting(true);
    try {
      const unmasked = getUnmaskedConfig(formData);
      await testConfig({ amule: unmasked.amule });
    } catch (err) {
      // Error is handled by useConfig
    } finally {
      setIsTesting(false);
    }
  };

  // Test rtorrent connection
  const handleTestRtorrent = async () => {
    if (!formData || !formData.rtorrent?.enabled) return;
    setIsTesting(true);
    try {
      const unmasked = getUnmaskedConfig(formData);
      await testConfig({ rtorrent: unmasked.rtorrent });
    } catch (err) {
      // Error is handled by useConfig
    } finally {
      setIsTesting(false);
    }
  };

  // Test qBittorrent connection
  const handleTestQbittorrent = async () => {
    if (!formData || !formData.qbittorrent?.enabled) return;
    setIsTesting(true);
    try {
      const unmasked = getUnmaskedConfig(formData);
      await testConfig({ qbittorrent: unmasked.qbittorrent });
    } catch (err) {
      // Error is handled by useConfig
    } finally {
      setIsTesting(false);
    }
  };

  // Test directories
  const handleTestDirectories = async () => {
    if (!formData) return;
    setIsTesting(true);
    try {
      const unmasked = getUnmaskedConfig(formData);
      await testConfig({ directories: unmasked.directories });
    } catch (err) {
      // Error is handled by useConfig
    } finally {
      setIsTesting(false);
    }
  };

  // Test Sonarr
  const handleTestSonarr = async () => {
    if (!formData) return;
    setIsTesting(true);
    try {
      const unmasked = getUnmaskedConfig(formData);
      await testConfig({ sonarr: unmasked.integrations.sonarr });
    } catch (err) {
      // Error is handled by useConfig
    } finally {
      setIsTesting(false);
    }
  };

  // Test Radarr
  const handleTestRadarr = async () => {
    if (!formData) return;
    setIsTesting(true);
    try {
      const unmasked = getUnmaskedConfig(formData);
      await testConfig({ radarr: unmasked.integrations.radarr });
    } catch (err) {
      // Error is handled by useConfig
    } finally {
      setIsTesting(false);
    }
  };

  // Test Prowlarr
  const handleTestProwlarr = async () => {
    if (!formData) return;
    setIsTesting(true);
    try {
      const unmasked = getUnmaskedConfig(formData);
      await testConfig({ prowlarr: unmasked.integrations.prowlarr });
    } catch (err) {
      // Error is handled by useConfig
    } finally {
      setIsTesting(false);
    }
  };

  // Test Event Script Path
  const handleTestScript = async () => {
    if (!formData?.eventScripting?.scriptPath) return;
    setIsTesting(true);
    setScriptTestResult(null);
    try {
      const response = await fetch('/api/config/test-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scriptPath: formData.eventScripting.scriptPath })
      });
      const result = await response.json();
      setScriptTestResult(result);
    } catch (err) {
      setScriptTestResult({ success: false, message: err.message });
    } finally {
      setIsTesting(false);
    }
  };

  // Test all
  const handleTestAll = async () => {
    if (!formData) return;
    setIsTesting(true);
    try {
      const payload = buildTestPayload(formData, true, getUnmaskedConfig);
      await testConfig(payload);
    } catch (err) {
      // Error is handled by useConfig
    } finally {
      setIsTesting(false);
    }
  };


  // Save configuration
  const handleSave = async () => {
    if (!formData) return;

    setSaveError(null);
    setSaveSuccess(false);
    clearError();

    // Validate authentication password if enabled and changed
    if (formData.server.auth?.enabled && formData.server.auth.password && formData.server.auth.password !== '********') {
      const passwordErrors = validatePassword(formData.server.auth.password);
      if (passwordErrors.length > 0) {
        setSaveError('Authentication password does not meet requirements: ' + passwordErrors.join(', '));
        return;
      }
      if (formData.server.auth.password !== passwordConfirm) {
        setSaveError('Authentication passwords do not match. Please ensure both password fields are identical.');
        return;
      }
    }

    // Cross-validation: at least one client must be enabled
    if (formData.amule?.enabled === false && !formData.rtorrent?.enabled && !formData.qbittorrent?.enabled) {
      setSaveError('At least one download client (aMule, rTorrent, or qBittorrent) must be enabled.');
      return;
    }

    // Always test before saving
    // If tests haven't been run, run them first
    if (!testResults || !testResults.results) {
      setIsTesting(true);
      let results;
      try {
        const unmasked = getUnmaskedConfig(formData);
        results = await testConfig({
          amule: unmasked.amule?.enabled !== false ? unmasked.amule : undefined,
          rtorrent: unmasked.rtorrent?.enabled ? unmasked.rtorrent : undefined,
          qbittorrent: unmasked.qbittorrent?.enabled ? unmasked.qbittorrent : undefined,
          directories: unmasked.directories,
          sonarr: unmasked.integrations.sonarr.enabled ? unmasked.integrations.sonarr : undefined,
          radarr: unmasked.integrations.radarr.enabled ? unmasked.integrations.radarr : undefined,
          prowlarr: unmasked.integrations.prowlarr?.enabled ? unmasked.integrations.prowlarr : undefined
        });
      } catch (err) {
        setSaveError('Configuration test failed. Please review the errors and fix them before saving.');
        setIsTesting(false);
        return;
      }
      setIsTesting(false);

      // Check results directly from the return value
      if (checkResultsForErrors(results, formData)) {
        setSaveError('Configuration test failed. Please fix the errors and click Save Changes again.');
        return;
      }

      // All tests passed - proceed with save automatically
      // (fall through to save logic below)
    } else {
      // Tests were already run - check for errors from state
      if (hasTestErrors()) {
        setSaveError('Configuration test failed. Please fix the errors before saving.');
        return;
      }
    }

    try {
      const unmasked = getUnmaskedConfig(formData);
      await saveConfig({
        version: '1.0',
        firstRunCompleted: true,
        ...unmasked
      });

      setSaveSuccess(true);
      setHasChanges(false);

      // Show success message
      setTimeout(() => {
        setSaveSuccess(false);
      }, 5000);
    } catch (err) {
      setSaveError(err.message);
    }
  };

  // Cancel changes
  const handleCancel = () => {
    if (hasChanges) {
      if (confirm('You have unsaved changes. Are you sure you want to cancel?')) {
        setFormData(null);
        fetchCurrent();
        setHasChanges(false);
        clearTestResults();
        onClose();
      }
    } else {
      onClose();
    }
  };

  // Check if there are any test errors
  const hasTestErrors = () => checkTestErrors(testResults, formData);


  // Show loading state when formData hasn't been initialized yet
  // (loading flag is for async operations, formData null means initial load)
  if (!formData) {
    // If there's an error, show error message
    if (error) {
      return h('div', { className: 'p-4' },
        h('p', { className: 'text-red-600 dark:text-red-400' }, 'Failed to load configuration: ', error)
      );
    }
    // Otherwise show loading spinner
    return h('div', { className: 'flex items-center justify-center h-64' },
      h(LoadingSpinner, { text: 'Loading configuration...' })
    );
  }

  const isDocker = configStatus?.isDocker;
  const meta = currentConfig?._meta;

  return h('div', { className: 'w-full lg:w-3/4 mx-auto px-2 py-4 sm:px-4' },
    // Server & Authentication Configuration
    h(ConfigSection, {
      title: 'Server & Authentication',
      description: 'HTTP server and web interface access control',
      defaultOpen: false,
      open: openSections.server,
      onToggle: (value) => setOpenSections(prev => ({ ...prev, server: value }))
    },
      h(ConfigField, {
        label: 'Port',
        description: 'HTTP server port for the web interface',
        value: formData.server.port,
        onChange: (value) => updateField('server', 'port', value),
        type: 'number',
        required: true,
        fromEnv: meta?.fromEnv.port
      }),
      isDocker && h(AlertBox, { type: 'warning' },
        h('p', {}, 'Changing the port requires updating the Docker port mapping and restarting the container.')
      ),

      h('hr', { className: 'my-4 border-gray-200 dark:border-gray-700' }),

      h(EnableToggle, {
        label: 'Enable Authentication',
        description: 'Require password to access the web interface (recommended for network-accessible installations)',
        enabled: formData.server.auth?.enabled || false,
        onChange: (enabled) => {
          updateNestedField('server', 'auth', 'enabled', enabled);
          if (!enabled) {
            setPasswordConfirm('');
          }
        }
      }),

      formData.server.auth?.enabled && h('div', { className: 'mt-4 space-y-4' },
        // Show info about environment variable
          meta?.fromEnv.serverAuthPassword && h(AlertBox, { type: 'warning' },
          h('p', {}, 'Password is set via WEB_AUTH_PASSWORD environment variable and cannot be changed here. To change the password, update the environment variable and restart the server.')
        ),

        !meta?.fromEnv.serverAuthPassword && h('div', {},
          h(AlertBox, { type: 'info', className: 'mb-4' },
            h('div', {},
              h('p', { className: 'font-medium mb-2' }, 'Password requirements:'),
              h('ul', { className: 'list-disc list-inside space-y-1' },
                h('li', {}, 'At least 8 characters'),
                h('li', {}, 'Contains at least one digit'),
                h('li', {}, 'Contains at least one letter'),
                h('li', {}, 'Contains at least one special character (!@#$%^&*()_+-=[]{}|;:,.<>?)')
              )
            )
          ),

          h(ConfigField, {
            label: 'Password',
            description: 'Choose a strong password for the web interface',
            value: formData.server.auth?.password || '',
            onChange: (value) => updateNestedField('server', 'auth', 'password', value),
            required: true,
          },
            h(PasswordField, {
              value: formData.server.auth?.password || '',
              onChange: (value) => updateNestedField('server', 'auth', 'password', value),
              placeholder: 'Enter password',
            })
          ),

          h(ConfigField, {
            label: 'Confirm Password',
            description: 'Re-enter your password to confirm',
            value: passwordConfirm,
            onChange: (value) => setPasswordConfirm(value),
            required: true,
          },
            h(PasswordField, {
              value: passwordConfirm,
              onChange: (value) => setPasswordConfirm(value),
              placeholder: 'Confirm password',
            })
          ),

          // Real-time validation feedback
          formData.server.auth?.password && formData.server.auth.password !== '********' && (() => {
            const passwordErrors = validatePassword(formData.server.auth.password);
            const passwordMismatch = formData.server.auth.password !== passwordConfirm && passwordConfirm;

            return h('div', {},
              passwordErrors.length > 0 && h(AlertBox, { type: 'error' },
                h('div', {},
                  h('p', { className: 'font-medium mb-1' }, 'Password requirements not met:'),
                  h('ul', { className: 'list-disc list-inside space-y-1' },
                    passwordErrors.map(error => h('li', { key: error }, error))
                  )
                )
              ),

              passwordMismatch && h(AlertBox, { type: 'error' },
                h('p', {}, 'Passwords do not match')
              ),

              passwordErrors.length === 0 && !passwordMismatch && passwordConfirm && h(AlertBox, { type: 'success' },
                h('p', {}, 'Password meets all requirements and matches')
              )
            );
          })()
        )
      ),

      !formData.server.auth?.enabled && h(AlertBox, { type: 'warning', className: 'mt-4' },
        h('p', {}, 'Authentication is disabled. Your web interface will be accessible without a password. This is not recommended for network-accessible installations.')
      )
    ),

    // aMule Configuration
    h(ConfigSection, {
      title: 'aMule Integration',
      description: 'aMule External Connection (EC) settings',
      defaultOpen: false,
      open: openSections.amule,
      onToggle: (value) => setOpenSections(prev => ({ ...prev, amule: value }))
    },
      h(EnableToggle, {
        enabled: formData.amule?.enabled !== false,
        onChange: (value) => updateField('amule', 'enabled', value),
        label: 'Enable aMule Integration',
        description: 'Connect to aMule for managing ed2k/Kademlia downloads'
      }),

      formData.amule?.enabled !== false && h('div', { className: 'mt-4 space-y-4' },
        isDocker && h(AlertBox, { type: 'info' },
            h('p', {}, 'You are running in Docker. If aMule is running on your host machine, use the special hostname ', h('code', { className: 'bg-white dark:bg-gray-800 px-1 rounded' }, 'host.docker.internal'), '. If aMule is running in another container, use that container\'s name as the hostname.')
        ),
        h(ConfigField, {
          label: 'Host',
          description: 'aMule External Connection (EC) host address',
          value: formData.amule.host,
          onChange: (value) => updateField('amule', 'host', value),
          placeholder: '127.0.0.1',
          required: formData.amule?.enabled !== false,
          fromEnv: meta?.fromEnv.amuleHost
        }),
        h(ConfigField, {
          label: 'Port',
          description: 'aMule EC port (default: 4712)',
          value: formData.amule.port,
          onChange: (value) => updateField('amule', 'port', value),
          type: 'number',
          placeholder: '4712',
          required: formData.amule?.enabled !== false,
          fromEnv: meta?.fromEnv.amulePort
        }),

        // Warning if aMule password is from environment
        meta?.fromEnv.amulePassword && h(AlertBox, { type: 'warning' },
          h('p', {}, 'aMule password is set via AMULE_PASSWORD environment variable and cannot be changed here. To change the password, update the environment variable and restart the server.')
        ),

        !meta?.fromEnv.amulePassword && h(ConfigField, {
          label: 'Password',
          description: 'aMule EC password (set in aMule preferences)',
          value: formData.amule.password,
          onChange: (value) => updateField('amule', 'password', value),
          required: formData.amule?.enabled !== false,
          fromEnv: meta?.fromEnv.amulePassword
        },
          h(PasswordField, {
            value: formData.amule.password,
            onChange: (value) => updateField('amule', 'password', value),
            placeholder: 'Enter aMule EC password',
            disabled: meta?.fromEnv.amulePassword
          })
        ),
        h(ConfigField, {
          label: 'Shared Files Auto-Reload Interval (hours)',
          description: 'Hours between automatic shared files reload (0 = disabled, default: 3). This makes aMule rescan shared directories periodically.',
          value: formData.amule.sharedFilesReloadIntervalHours ?? 3,
          onChange: (value) => updateField('amule', 'sharedFilesReloadIntervalHours', parseInt(value) || 0),
          type: 'number',
          placeholder: '3',
          fromEnv: meta?.fromEnv.amuleSharedFilesReloadInterval
        }),
        h('div', { className: 'mt-4' },
          h(TestButton, {
            onClick: handleTestAmule,
            loading: isTesting,
            disabled: !formData.amule.host || !formData.amule.port || !formData.amule.password
          }, 'Test Connection')
        ),
        testResults?.results?.amule && h(TestResultIndicator, {
          result: testResults.results.amule,
          label: 'aMule Connection Test'
        })
      )
    ),

    // *arr Integrations
    h(ConfigSection, {
      title: '*arr Integrations',
      description: 'Sonarr and Radarr scheduler settings',
      defaultOpen: false,
      open: openSections.integrations,
      onToggle: (value) => setOpenSections(prev => ({ ...prev, integrations: value }))
    },
      // *arr Integration Configuration info
      h(IntegrationConfigInfo, {
        title: '*arr Integration Configuration',
        port: formData.server.port,
        authEnabled: formData.server.auth?.enabled,
        amuleEnabled: formData.amule?.enabled !== false,
        className: 'mb-6'
      }),

      // Sonarr scheduler
      h('div', { className: 'mb-6' },
        h(EnableToggle, {
          enabled: formData.integrations.sonarr.enabled,
          onChange: (value) => updateNestedField('integrations', 'sonarr', 'enabled', value),
          label: 'Enable Sonarr scheduler',
          description: '(Optional) Schedule automatic searches for missing TV episodes via Sonarr API'
        }),
        formData.integrations.sonarr.enabled && h('div', { className: 'mt-4 space-y-4' },
          h(ConfigField, {
            label: 'Sonarr URL',
            description: 'Sonarr server URL (e.g., http://localhost:8989)',
            value: formData.integrations.sonarr.url,
            onChange: (value) => updateNestedField('integrations', 'sonarr', 'url', value),
            placeholder: 'http://localhost:8989',
            required: formData.integrations.sonarr.enabled,
            fromEnv: meta?.fromEnv.sonarrUrl
          }),
          meta?.fromEnv.sonarrApiKey && h(AlertBox, { type: 'warning' },
            h('p', {}, 'Sonarr API key is set via SONARR_API_KEY environment variable.')
          ),
          !meta?.fromEnv.sonarrApiKey && h(ConfigField, {
            label: 'API Key',
            description: 'Sonarr API key (found in Settings → General)',
            value: formData.integrations.sonarr.apiKey,
            onChange: (value) => updateNestedField('integrations', 'sonarr', 'apiKey', value),
            required: formData.integrations.sonarr.enabled,
            fromEnv: meta?.fromEnv.sonarrApiKey
          },
            h(PasswordField, {
              value: formData.integrations.sonarr.apiKey,
              onChange: (value) => updateNestedField('integrations', 'sonarr', 'apiKey', value),
              placeholder: 'Enter Sonarr API key',
              disabled: meta?.fromEnv.sonarrApiKey
            })
          ),
          h(ConfigField, {
            label: 'Search Interval (hours)',
            description: 'Hours between automatic searches (0 = disabled)',
            value: formData.integrations.sonarr.searchIntervalHours,
            onChange: (value) => updateNestedField('integrations', 'sonarr', 'searchIntervalHours', value),
            type: 'number',
            placeholder: '6',
            fromEnv: meta?.fromEnv.sonarrSearchInterval
          }),
          h('div', { className: 'mt-4' },
            h(TestButton, {
              onClick: handleTestSonarr,
              loading: isTesting,
              disabled: !formData.integrations.sonarr.url || !formData.integrations.sonarr.apiKey
            }, 'Test Sonarr Connection')
          ),
          testResults?.results?.sonarr && h(TestResultIndicator, {
            result: testResults.results.sonarr,
            label: 'Sonarr API Test'
          })
        )
      ),

      // Radarr scheduler
      h('div', { className: 'mb-6' },
        h(EnableToggle, {
          enabled: formData.integrations.radarr.enabled,
          onChange: (value) => updateNestedField('integrations', 'radarr', 'enabled', value),
          label: 'Enable Radarr scheduler',
          description: '(Optional) Schedule automatic searches for missing movies via Radarr API'
        }),
        formData.integrations.radarr.enabled && h('div', { className: 'mt-4 space-y-4' },
          h(ConfigField, {
            label: 'Radarr URL',
            description: 'Radarr server URL (e.g., http://localhost:7878)',
            value: formData.integrations.radarr.url,
            onChange: (value) => updateNestedField('integrations', 'radarr', 'url', value),
            placeholder: 'http://localhost:7878',
            required: formData.integrations.radarr.enabled,
            fromEnv: meta?.fromEnv.radarrUrl
          }),
          meta?.fromEnv.radarrApiKey && h(AlertBox, { type: 'warning' },
            h('p', {}, 'Radarr API key is set via RADARR_API_KEY environment variable.')
          ),
          !meta?.fromEnv.radarrApiKey && h(ConfigField, {
            label: 'API Key',
            description: 'Radarr API key (found in Settings → General)',
            value: formData.integrations.radarr.apiKey,
            onChange: (value) => updateNestedField('integrations', 'radarr', 'apiKey', value),
            required: formData.integrations.radarr.enabled,
            fromEnv: meta?.fromEnv.radarrApiKey
          },
            h(PasswordField, {
              value: formData.integrations.radarr.apiKey,
              onChange: (value) => updateNestedField('integrations', 'radarr', 'apiKey', value),
              placeholder: 'Enter Radarr API key',
              disabled: meta?.fromEnv.radarrApiKey
            })
          ),
          h(ConfigField, {
            label: 'Search Interval (hours)',
            description: 'Hours between automatic searches (0 = disabled)',
            value: formData.integrations.radarr.searchIntervalHours,
            onChange: (value) => updateNestedField('integrations', 'radarr', 'searchIntervalHours', value),
            type: 'number',
            placeholder: '6',
            fromEnv: meta?.fromEnv.radarrSearchInterval
          }),
          h('div', { className: 'mt-4' },
            h(TestButton, {
              onClick: handleTestRadarr,
              loading: isTesting,
              disabled: !formData.integrations.radarr.url || !formData.integrations.radarr.apiKey
            }, 'Test Radarr Connection')
          ),
          testResults?.results?.radarr && h(TestResultIndicator, {
            result: testResults.results.radarr,
            label: 'Radarr API Test'
          })
        )
      )
    ),

    // BitTorrent Integration Configuration
    h(ConfigSection, {
      title: 'BitTorrent Integration',
      description: 'BitTorrent client and Prowlarr settings',
      defaultOpen: false,
      open: openSections.bittorrent,
      onToggle: (value) => setOpenSections(prev => ({ ...prev, bittorrent: value }))
    },
      isDocker && h(AlertBox, { type: 'info', className: 'mb-4' },
        h('p', {}, 'You are running in Docker. If your BitTorrent clients are running on your host machine, use ', h('code', { className: 'bg-white dark:bg-gray-800 px-1 rounded' }, 'host.docker.internal'), ' as the hostname.')
      ),

      // rTorrent Section
      h('div', { className: 'bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700 mb-4' },
        h('h3', { className: 'text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4' }, 'rTorrent (XML-RPC)'),

        h(EnableToggle, {
          enabled: formData.rtorrent?.enabled || false,
          onChange: (value) => updateField('rtorrent', 'enabled', value),
          label: 'Enable rTorrent',
          description: 'Connect to rTorrent for managing BitTorrent downloads via XML-RPC'
        }),

        formData.rtorrent?.enabled && h('div', { className: 'mt-4 space-y-4' },
          h(ConfigField, {
            label: 'Host',
            description: 'rTorrent XML-RPC host address',
            value: formData.rtorrent.host || '',
            onChange: (value) => updateField('rtorrent', 'host', value),
            placeholder: '127.0.0.1',
            required: formData.rtorrent.enabled,
            fromEnv: meta?.fromEnv.rtorrentHost
          }),

          h(ConfigField, {
            label: 'Port',
            description: 'rTorrent XML-RPC port (default: 8000)',
            value: formData.rtorrent.port || 8000,
            onChange: (value) => updateField('rtorrent', 'port', parseInt(value, 10) || 8000),
            type: 'number',
            placeholder: '8000',
            required: formData.rtorrent.enabled,
            fromEnv: meta?.fromEnv.rtorrentPort
          }),

          h(ConfigField, {
            label: 'XML-RPC Path',
            description: 'Path for XML-RPC endpoint (default: /RPC2)',
            value: formData.rtorrent.path || '/RPC2',
            onChange: (value) => updateField('rtorrent', 'path', value),
            placeholder: '/RPC2',
            fromEnv: meta?.fromEnv.rtorrentPath
          }),

          h(ConfigField, {
            label: 'Username (Optional)',
            description: 'Username for HTTP basic authentication (if required)',
            value: formData.rtorrent.username || '',
            onChange: (value) => updateField('rtorrent', 'username', value),
            placeholder: 'Leave empty if not required',
            fromEnv: meta?.fromEnv.rtorrentUsername
          }),

          // Warning if rtorrent password is from environment
          meta?.fromEnv.rtorrentPassword && h(AlertBox, { type: 'warning' },
            h('p', {}, 'rTorrent password is set via RTORRENT_PASSWORD environment variable.')
          ),

          !meta?.fromEnv.rtorrentPassword && h(ConfigField, {
            label: 'Password (Optional)',
            description: 'Password for HTTP basic authentication (if required)',
            fromEnv: meta?.fromEnv.rtorrentPassword
          },
            h(PasswordField, {
              value: formData.rtorrent.password || '',
              onChange: (value) => updateField('rtorrent', 'password', value),
              placeholder: 'Leave empty if not required',
              disabled: meta?.fromEnv.rtorrentPassword
            })
          ),

          h('div', { className: 'mt-4' },
            h(TestButton, {
              onClick: handleTestRtorrent,
              loading: isTesting,
              disabled: !formData.rtorrent.host || !formData.rtorrent.port
            }, 'Test rTorrent Connection')
          ),

          testResults?.results?.rtorrent && h(TestResultIndicator, {
            result: testResults.results.rtorrent,
            label: 'rTorrent Connection Test'
          })
        )
      ),

      // qBittorrent Section
      h('div', { className: 'bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700 mb-4' },
        h('h3', { className: 'text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4' }, 'qBittorrent (WebUI API)'),

        h(EnableToggle, {
          enabled: formData.qbittorrent?.enabled || false,
          onChange: (value) => updateField('qbittorrent', 'enabled', value),
          label: 'Enable qBittorrent',
          description: 'Connect to qBittorrent for managing BitTorrent downloads via WebUI API'
        }),

        formData.qbittorrent?.enabled && h('div', { className: 'mt-4 space-y-4' },
          h(ConfigField, {
            label: 'Host',
            description: 'qBittorrent WebUI host address',
            value: formData.qbittorrent.host || '',
            onChange: (value) => updateField('qbittorrent', 'host', value),
            placeholder: '127.0.0.1',
            required: formData.qbittorrent.enabled,
            fromEnv: meta?.fromEnv.qbittorrentHost
          }),

          h(ConfigField, {
            label: 'Port',
            description: 'qBittorrent WebUI port (default: 8080)',
            value: formData.qbittorrent.port || 8080,
            onChange: (value) => updateField('qbittorrent', 'port', parseInt(value, 10) || 8080),
            type: 'number',
            placeholder: '8080',
            required: formData.qbittorrent.enabled,
            fromEnv: meta?.fromEnv.qbittorrentPort
          }),

          h(ConfigField, {
            label: 'Username',
            description: 'qBittorrent WebUI username (default: admin)',
            value: formData.qbittorrent.username || 'admin',
            onChange: (value) => updateField('qbittorrent', 'username', value),
            placeholder: 'admin',
            fromEnv: meta?.fromEnv.qbittorrentUsername
          }),

          // Warning if qbittorrent password is from environment
          meta?.fromEnv.qbittorrentPassword && h(AlertBox, { type: 'warning' },
            h('p', {}, 'qBittorrent password is set via QBITTORRENT_PASSWORD environment variable.')
          ),

          !meta?.fromEnv.qbittorrentPassword && h(ConfigField, {
            label: 'Password',
            description: 'qBittorrent WebUI password',
            fromEnv: meta?.fromEnv.qbittorrentPassword
          },
            h(PasswordField, {
              value: formData.qbittorrent.password || '',
              onChange: (value) => updateField('qbittorrent', 'password', value),
              placeholder: 'Enter qBittorrent password',
              disabled: meta?.fromEnv.qbittorrentPassword
            })
          ),

          h(EnableToggle, {
            label: 'Use SSL (HTTPS)',
            description: 'Connect to qBittorrent using HTTPS',
            enabled: formData.qbittorrent.useSsl || false,
            onChange: (value) => updateField('qbittorrent', 'useSsl', value)
          }),

          h('div', { className: 'mt-4' },
            h(TestButton, {
              onClick: handleTestQbittorrent,
              loading: isTesting,
              disabled: !formData.qbittorrent.host || !formData.qbittorrent.port
            }, 'Test qBittorrent Connection')
          ),

          testResults?.results?.qbittorrent && h(TestResultIndicator, {
            result: testResults.results.qbittorrent,
            label: 'qBittorrent Connection Test'
          })
        )
      ),

      // Prowlarr Integration (for BitTorrent clients)
      (formData.rtorrent?.enabled || formData.qbittorrent?.enabled) && h('div', { className: 'mt-4 pt-4 border-t border-gray-200 dark:border-gray-700' },
        h(EnableToggle, {
          enabled: formData.integrations.prowlarr?.enabled || false,
          onChange: (value) => updateNestedField('integrations', 'prowlarr', 'enabled', value),
          label: 'Enable Prowlarr Integration',
          description: 'Search for torrents via Prowlarr indexer manager'
        }),
        formData.integrations.prowlarr?.enabled && h('div', { className: 'mt-4 space-y-4' },
          h(ConfigField, {
            label: 'Prowlarr URL',
            description: 'Prowlarr server URL (e.g., http://localhost:9696)',
            value: formData.integrations.prowlarr?.url || '',
            onChange: (value) => updateNestedField('integrations', 'prowlarr', 'url', value),
            placeholder: 'http://localhost:9696',
            required: formData.integrations.prowlarr?.enabled,
            fromEnv: meta?.fromEnv.prowlarrUrl
          }),
          meta?.fromEnv.prowlarrApiKey && h(AlertBox, { type: 'warning' },
            h('p', {}, 'Prowlarr API key is set via PROWLARR_API_KEY environment variable.')
          ),
          !meta?.fromEnv.prowlarrApiKey && h(ConfigField, {
            label: 'API Key',
            description: 'Prowlarr API key (found in Settings → General)',
            value: formData.integrations.prowlarr?.apiKey || '',
            onChange: (value) => updateNestedField('integrations', 'prowlarr', 'apiKey', value),
            required: formData.integrations.prowlarr?.enabled,
            fromEnv: meta?.fromEnv.prowlarrApiKey
          },
            h(PasswordField, {
              value: formData.integrations.prowlarr?.apiKey || '',
              onChange: (value) => updateNestedField('integrations', 'prowlarr', 'apiKey', value),
              placeholder: 'Enter Prowlarr API key',
              disabled: meta?.fromEnv.prowlarrApiKey
            })
          ),
          h('div', { className: 'mt-4' },
            h(TestButton, {
              onClick: handleTestProwlarr,
              loading: isTesting,
              disabled: !formData.integrations.prowlarr?.url || !formData.integrations.prowlarr?.apiKey
            }, 'Test Prowlarr Connection')
          ),
          testResults?.results?.prowlarr && h(TestResultIndicator, {
            result: testResults.results.prowlarr,
            label: 'Prowlarr API Test'
          })
        )
      )
    ),

    // Directories Configuration
    h(ConfigSection, {
      title: 'Directories',
      description: 'Data, logs, and GeoIP directories',
      defaultOpen: false,
      open: openSections.directories,
      onToggle: (value) => setOpenSections(prev => ({ ...prev, directories: value }))
    },
      isDocker && h(AlertBox, { type: 'warning' },
        h('p', {}, 'You are running in Docker. Changing directories requires updating your docker-compose.yml volume mounts. Unless you know what you\'re doing, keep the default values.')
      ),
      h(ConfigField, {
        label: 'Data Directory',
        description: 'Data directory for database files',
        value: formData.directories.data,
        onChange: (value) => updateField('directories', 'data', value),
        placeholder: 'server/data',
        required: true
      }),
      h(ConfigField, {
        label: 'Logs Directory',
        description: 'Directory for application log files',
        value: formData.directories.logs,
        onChange: (value) => updateField('directories', 'logs', value),
        placeholder: 'server/logs',
        required: true
      }),
      h(ConfigField, {
        label: 'GeoIP Directory (Optional)',
        description: 'Directory for MaxMind GeoIP database files (GeoLite2-City.mmdb, GeoLite2-Country.mmdb). Leave default if databases are not available.',
        value: formData.directories.geoip,
        onChange: (value) => updateField('directories', 'geoip', value),
        placeholder: 'server/data/geoip',
        required: false
      }),
      h('div', { className: 'mt-4' },
        h(TestButton, {
          onClick: handleTestDirectories,
          loading: isTesting
        }, 'Test Directory Access')
      ),
      testResults?.results?.directories && h('div', {},
        testResults.results.directories.data && h(TestResultIndicator, {
          result: testResults.results.directories.data,
          label: 'Data Directory'
        }),
        testResults.results.directories.logs && h(TestResultIndicator, {
          result: testResults.results.directories.logs,
          label: 'Logs Directory'
        }),
        testResults.results.directories.geoip && h(TestResultIndicator, {
          result: testResults.results.directories.geoip,
          label: 'GeoIP Database'
        })
      )
    ),

    // Download History Configuration
    h(ConfigSection, {
      title: 'Download History',
      description: 'Track and view download history',
      defaultOpen: false,
      open: openSections.history,
      onToggle: (value) => setOpenSections(prev => ({ ...prev, history: value }))
    },
      h(EnableToggle, {
        enabled: formData.history?.enabled ?? true,
        onChange: (value) => updateField('history', 'enabled', value),
        label: 'Enable Download History',
        description: 'Track all downloads with their status (downloading, completed, missing, deleted)'
      }),
      formData.history?.enabled && h('div', { className: 'mt-4 space-y-4' },
        h(ConfigField, {
          label: 'Retention Period (days)',
          description: 'Number of days to keep history entries. Set to 0 to keep history indefinitely.',
          value: formData.history?.retentionDays ?? 0,
          onChange: (value) => updateField('history', 'retentionDays', parseInt(value) || 0),
          type: 'number',
          placeholder: '0'
        }),
        h(ConfigField, {
          label: 'Username Header (Optional)',
          description: 'HTTP header containing username from reverse proxy (e.g., X-Remote-User for Authelia). Leave empty if not using proxy authentication.',
          value: formData.history?.usernameHeader || '',
          onChange: (value) => updateField('history', 'usernameHeader', value),
          placeholder: 'X-Remote-User'
        }),
        h(AlertBox, { type: 'info' },
          h('div', {},
            h('p', { className: 'font-medium mb-1' }, 'History Status Tracking:'),
            h('ul', { className: 'list-disc list-inside space-y-1' },
              h('li', {}, h('span', { className: 'font-medium' }, 'Downloading'), ' - File is currently in the download queue'),
              h('li', {}, h('span', { className: 'font-medium' }, 'Completed'), ' - File has been downloaded and is shared'),
              h('li', {}, h('span', { className: 'font-medium' }, 'Missing'), ' - File was downloading but is no longer in queue or shared'),
              h('li', {}, h('span', { className: 'font-medium' }, 'Deleted'), ' - File was manually removed from downloads')
            )
          )
        )
      )
    ),

    // Event Scripting Configuration (Advanced)
    h(ConfigSection, {
      title: 'Custom Event Script',
      description: 'Advanced: Execute a custom script when events occur',
      defaultOpen: false,
      open: openSections.eventScripting,
      onToggle: (value) => setOpenSections(prev => ({ ...prev, eventScripting: value }))
    },
      // Recommendation to use Notifications page
      h(AlertBox, { type: 'info', className: 'mb-4' },
        h('div', {},
          h('p', { className: 'font-medium mb-1' }, 'Looking for push notifications?'),
          h('p', { className: 'text-sm mb-2' }, 'Use the Notifications page to easily configure Discord, Telegram, Slack, and other notification services.'),
          h('button', {
            onClick: () => setAppCurrentView('notifications'),
            className: 'text-sm text-blue-600 dark:text-blue-400 hover:underline font-medium'
          }, 'Go to Notifications →')
        )
      ),

      h(EnableToggle, {
        enabled: formData.eventScripting?.enabled || false,
        onChange: (value) => updateField('eventScripting', 'enabled', value),
        label: 'Enable Custom Event Script',
        description: 'Execute your own script when events occur (for power users)'
      }),
      formData.eventScripting?.enabled && h('div', { className: 'mt-4 space-y-4' },
        h(ConfigField, {
          label: 'Script Path',
          description: 'Full path to the script to execute (must be executable)',
          value: formData.eventScripting?.scriptPath || '',
          onChange: (value) => updateField('eventScripting', 'scriptPath', value),
          required: formData.eventScripting?.enabled
        },
          h('div', { className: 'flex gap-2' },
            h(Input, {
              value: formData.eventScripting?.scriptPath || '',
              onChange: (e) => updateField('eventScripting', 'scriptPath', e.target.value),
              placeholder: '/path/to/script.sh',
              className: 'flex-1 font-mono'
            }),
            h(IconButton, {
              type: 'button',
              icon: 'folder',
              variant: 'secondary',
              onClick: () => setShowScriptBrowser(true),
              title: 'Browse for script file'
            })
          )
        ),
        h(ConfigField, {
          label: 'Timeout (ms)',
          description: 'Maximum time to wait for script execution before killing it',
          value: formData.eventScripting?.timeout || 30000,
          onChange: (value) => updateField('eventScripting', 'timeout', parseInt(value) || 30000),
          type: 'number',
          placeholder: '30000'
        }),

        h('div', { className: 'mt-4' },
          h(TestButton, {
            onClick: handleTestScript,
            loading: isTesting,
            disabled: !formData.eventScripting?.scriptPath
          }, 'Test Script Path')
        ),

        scriptTestResult && h(TestResultIndicator, {
          result: scriptTestResult,
          label: 'Event Script Test'
        }),

        h(AlertBox, { type: 'info', className: 'mt-4' },
          h('div', {},
            h('p', { className: 'font-medium mb-2' }, 'Script Interface:'),
            h('ul', { className: 'list-disc list-inside space-y-1 text-sm' },
              h('li', {}, 'Event type passed as first argument: ', h('code', { className: 'bg-white dark:bg-gray-800 px-1 rounded' }, './script.sh downloadFinished')),
              h('li', {}, 'Environment variables: ', h('code', { className: 'bg-white dark:bg-gray-800 px-1 rounded' }, 'EVENT_TYPE'), ', ', h('code', { className: 'bg-white dark:bg-gray-800 px-1 rounded' }, 'EVENT_HASH'), ', ', h('code', { className: 'bg-white dark:bg-gray-800 px-1 rounded' }, 'EVENT_FILENAME'), ', ', h('code', { className: 'bg-white dark:bg-gray-800 px-1 rounded' }, 'EVENT_CLIENT_TYPE')),
              h('li', {}, 'Full event data as JSON via stdin')
            ),
            h('p', { className: 'mt-3 font-medium mb-1' }, 'Supported Events:'),
            h('ul', { className: 'list-disc list-inside space-y-1 text-sm text-gray-600 dark:text-gray-400' },
              h('li', {}, h('code', { className: 'bg-white dark:bg-gray-800 px-1 rounded' }, 'downloadAdded'), ' - A new download is started'),
              h('li', {}, h('code', { className: 'bg-white dark:bg-gray-800 px-1 rounded' }, 'downloadFinished'), ' - A download completes'),
              h('li', {}, h('code', { className: 'bg-white dark:bg-gray-800 px-1 rounded' }, 'categoryChanged'), ' - A file\'s category is changed'),
              h('li', {}, h('code', { className: 'bg-white dark:bg-gray-800 px-1 rounded' }, 'fileMoved'), ' - A file is moved'),
              h('li', {}, h('code', { className: 'bg-white dark:bg-gray-800 px-1 rounded' }, 'fileDeleted'), ' - A file is deleted')
            ),
            h('p', { className: 'mt-2 text-sm' }, 'Script execution is non-blocking (fire-and-forget). Errors are logged but don\'t affect the operation.')
          )
        )
      )
    ),

    // Script file browser modal
    h(DirectoryBrowserModal, {
      show: showScriptBrowser,
      mode: 'file',
      initialPath: (() => {
        const sp = formData.eventScripting?.scriptPath || '';
        if (!sp) return '/';
        const lastSlash = sp.lastIndexOf('/');
        return lastSlash > 0 ? sp.substring(0, lastSlash) : '/';
      })(),
      onSelect: (filePath) => {
        updateField('eventScripting', 'scriptPath', filePath);
      },
      onClose: () => setShowScriptBrowser(false)
    }),

    // Test summary
    h(TestSummary, {
      testResults,
      formData,
      showDetails: false
    }),

    // Error message
    (error || saveError) && h(AlertBox, { type: 'error', className: 'mb-4' },
        h('p', { className: 'font-medium' }, error || saveError)
    ),

    // Success message
    saveSuccess && h(AlertBox, { type: 'success', className: 'mb-4' },
        h('div', {},
            h('p', { className: 'font-medium' }, 'Configuration saved successfully!'),
            h('p', { className: 'mt-1' }, 'Note: Some changes may require a server restart to take effect.')
        )
    ),

    // Action buttons
    h('div', { className: 'flex flex-wrap gap-3 mt-6 pb-4' },
      h('button', {
        onClick: handleTestAll,
        disabled: isTesting || loading,
        className: `px-3 sm:px-4 py-1.5 sm:py-2 text-sm font-medium rounded-lg
          ${isTesting || loading
            ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
            : 'bg-blue-600 hover:bg-blue-700 text-white'}
          transition-colors`
      }, isTesting ? 'Testing...' : 'Test All'),
      h('button', {
        onClick: handleSave,
        disabled: !hasChanges || loading || hasTestErrors(),
        className: `px-3 sm:px-4 py-1.5 sm:py-2 text-sm font-medium rounded-lg
          ${!hasChanges || loading || hasTestErrors()
            ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
            : 'bg-green-600 hover:bg-green-700 text-white'}
          transition-colors`
      }, loading ? 'Saving...' : 'Save Changes'),
      h('button', {
        onClick: handleCancel,
        disabled: loading,
        className: 'px-3 sm:px-4 py-1.5 sm:py-2 text-sm font-medium rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 transition-colors'
      }, 'Cancel')
    ),

  );
};

export default SettingsView;
