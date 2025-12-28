/**
 * SettingsView Component
 *
 * Full-page settings view for viewing and editing configuration
 */

import React from 'https://esm.sh/react@18.2.0';
const { createElement: h, useState, useEffect } = React;

import { useConfig } from '../../hooks/index.js';
import { LoadingSpinner, Icon } from '../common/index.js';
import {
  ConfigSection,
  ConfigField,
  TestButton,
  TestResultIndicator,
  PasswordField,
  EnableToggle,
  DockerWarning
} from '../settings/index.js';

/**
 * SettingsView component
 * @param {function} onClose - Close handler (navigate away from settings)
 */
const SettingsView = ({ onClose }) => {
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
  const [saveError, setSaveError] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [openSections, setOpenSections] = useState({
    server: false,
    amule: false,
    directories: false,
    sonarr: false,
    radarr: false
  });

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
        directories: { ...currentConfig.directories },
        integrations: {
          sonarr: { ...currentConfig.integrations.sonarr },
          radarr: { ...currentConfig.integrations.radarr }
        }
      });

      // Store original password values (masked as '********')
      // We'll keep them as '********' markers to know they haven't been changed
      setOriginalPasswords({
        amule: currentConfig.amule.password,
        sonarr: currentConfig.integrations.sonarr.apiKey,
        radarr: currentConfig.integrations.radarr.apiKey
      });
    }
  }, [currentConfig]);

  // Auto-open sections with test failures
  useEffect(() => {
    if (!testResults || !testResults.results) return;

    const results = testResults.results;
    const newOpenSections = {
      server: false,
      amule: false,
      directories: false,
      sonarr: false,
      radarr: false
    };

    // Check aMule
    if (results.amule && results.amule.success === false) {
      newOpenSections.amule = true;
    }

    // Check directories
    if (results.directories) {
      if ((results.directories.data && !results.directories.data.success) ||
          (results.directories.logs && !results.directories.logs.success)) {
        newOpenSections.directories = true;
      }
    }

    // Check Sonarr
    if (results.sonarr && results.sonarr.success === false) {
      newOpenSections.sonarr = true;
    }

    // Check Radarr
    if (results.radarr && results.radarr.success === false) {
      newOpenSections.radarr = true;
    }

    setOpenSections(newOpenSections);
  }, [testResults]);

  // Helper to unmask passwords for API calls
  // If a password is still '********', we DON'T send it (server will keep existing value)
  const getUnmaskedConfig = (config) => {
    const unmasked = JSON.parse(JSON.stringify(config));

    // Remove masked passwords - server will keep existing values
    if (unmasked.amule?.password === '********') {
      delete unmasked.amule.password;
    }
    if (unmasked.integrations?.sonarr?.apiKey === '********') {
      delete unmasked.integrations.sonarr.apiKey;
    }
    if (unmasked.integrations?.radarr?.apiKey === '********') {
      delete unmasked.integrations.radarr.apiKey;
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
    if (!formData) return;
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

  // Test all
  const handleTestAll = async () => {
    if (!formData) return;
    setIsTesting(true);
    try {
      const unmasked = getUnmaskedConfig(formData);
      await testConfig({
        amule: unmasked.amule,
        directories: unmasked.directories,
        sonarr: unmasked.integrations.sonarr.enabled ? unmasked.integrations.sonarr : undefined,
        radarr: unmasked.integrations.radarr.enabled ? unmasked.integrations.radarr : undefined
      });
    } catch (err) {
      // Error is handled by useConfig
    } finally {
      setIsTesting(false);
    }
  };

  // Check if results have errors
  const checkResultsForErrors = (results) => {
    if (!results || !results.results) return false;

    const testData = results.results;

    // Check aMule
    if (testData.amule && testData.amule.success === false) {
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

    return false;
  };

  // Save configuration
  const handleSave = async () => {
    if (!formData) return;

    setSaveError(null);
    setSaveSuccess(false);
    clearError();

    // Always test before saving
    // If tests haven't been run, run them first
    if (!testResults || !testResults.results) {
      setIsTesting(true);
      let results;
      try {
        const unmasked = getUnmaskedConfig(formData);
        results = await testConfig({
          amule: unmasked.amule,
          directories: unmasked.directories,
          sonarr: unmasked.integrations.sonarr.enabled ? unmasked.integrations.sonarr : undefined,
          radarr: unmasked.integrations.radarr.enabled ? unmasked.integrations.radarr : undefined
        });
      } catch (err) {
        setSaveError('Configuration test failed. Please review the errors and fix them before saving.');
        setIsTesting(false);
        return;
      }
      setIsTesting(false);

      // Check results directly from the return value
      if (checkResultsForErrors(results)) {
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
  const hasTestErrors = () => {
    if (!testResults || !testResults.results) return false;

    const results = testResults.results;

    // Check aMule
    if (results.amule && results.amule.success === false) {
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

    return false;
  };

  // Render test summary
  const renderTestSummary = () => {
    if (!testResults || !testResults.results) return null;

    const results = testResults.results;
    const summary = {
      passed: 0,
      failed: 0,
      warnings: 0,
      total: 0
    };

    // Count aMule
    if (results.amule) {
      summary.total++;
      if (results.amule.success === false) {
        summary.failed++;
      } else if (results.amule.success) {
        summary.passed++;
      }
    }

    // Count directories
    if (results.directories) {
      if (results.directories.data) {
        summary.total++;
        if (!results.directories.data.success) {
          summary.failed++;
        } else {
          summary.passed++;
        }
      }
      if (results.directories.logs) {
        summary.total++;
        if (!results.directories.logs.success) {
          summary.failed++;
        } else {
          summary.passed++;
        }
      }
      if (results.directories.geoip) {
        summary.total++;
        if (results.directories.geoip.warning && !results.directories.geoip.error) {
          summary.warnings++;
        } else if (results.directories.geoip.success) {
          summary.passed++;
        }
      }
    }

    // Count Sonarr (only if enabled)
    if (formData?.integrations?.sonarr?.enabled && results.sonarr) {
      summary.total++;
      if (results.sonarr.success === false) {
        summary.failed++;
      } else if (results.sonarr.success) {
        summary.passed++;
      }
    }

    // Count Radarr (only if enabled)
    if (formData?.integrations?.radarr?.enabled && results.radarr) {
      summary.total++;
      if (results.radarr.success === false) {
        summary.failed++;
      } else if (results.radarr.success) {
        summary.passed++;
      }
    }

    const allPassed = summary.failed === 0 && summary.total > 0;
    const hasWarnings = summary.warnings > 0;

    return h('div', {
      className: `p-4 rounded-lg border mb-4 ${
        allPassed && !hasWarnings
          ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
          : allPassed && hasWarnings
            ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
            : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
      }`
    },
      h('div', { className: 'flex items-center gap-2 mb-2' },
        h(Icon, {
          name: allPassed ? (hasWarnings ? 'alertTriangle' : 'check') : 'x',
          size: 20,
          className: allPassed && !hasWarnings
            ? 'text-green-600 dark:text-green-400'
            : allPassed && hasWarnings
              ? 'text-yellow-600 dark:text-yellow-400'
              : 'text-red-600 dark:text-red-400'
        }),
        h('p', {
          className: `font-medium ${
            allPassed && !hasWarnings
              ? 'text-green-800 dark:text-green-300'
              : allPassed && hasWarnings
                ? 'text-yellow-800 dark:text-yellow-300'
                : 'text-red-800 dark:text-red-300'
          }`
        }, allPassed
          ? hasWarnings
            ? 'Configuration test completed with warnings'
            : 'All configuration tests passed!'
          : 'Configuration test failed')
      ),
      h('p', {
        className: `text-sm ${
          allPassed && !hasWarnings
            ? 'text-green-700 dark:text-green-400'
            : allPassed && hasWarnings
              ? 'text-yellow-700 dark:text-yellow-400'
              : 'text-red-700 dark:text-red-400'
        }`
      }, `${summary.passed} passed${summary.warnings > 0 ? `, ${summary.warnings} warnings` : ''}${summary.failed > 0 ? `, ${summary.failed} failed` : ''} of ${summary.total} tests`)
    );
  };

  if (loading && !formData) {
    return h('div', { className: 'flex items-center justify-center h-64' },
      h(LoadingSpinner, { message: 'Loading configuration...' })
    );
  }

  if (!formData) {
    return h('div', { className: 'p-4' },
      h('p', { className: 'text-red-600 dark:text-red-400' }, 'Failed to load configuration')
    );
  }

  const isDocker = configStatus?.isDocker;
  const meta = currentConfig?._meta;

  return h('div', { className: 'max-w-4xl mx-auto p-4' },
    h('div', { className: 'mb-6' },
        h('h1', { className: 'text-2xl font-bold text-gray-900 dark:text-gray-100' }, 'Settings'),
    ),

    // Success message
    saveSuccess && h('div', {
      className: 'mb-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg'
    },
      h('p', { className: 'text-green-800 dark:text-green-300 font-medium' }, '✓ Configuration saved successfully!'),
      h('p', { className: 'text-sm text-green-700 dark:text-green-400 mt-1' },
        'Note: Some changes may require a server restart to take effect.')
    ),

    // Error message
    (error || saveError) && h('div', {
      className: 'mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg'
    },
      h('p', { className: 'text-red-800 dark:text-red-300 font-medium' }, error || saveError)
    ),

    // Server Configuration
    h(ConfigSection, {
      title: 'Server',
      description: 'HTTP server configuration',
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
      isDocker && h(DockerWarning, {
        message: 'Changing the port requires updating the Docker port mapping and restarting the container.'
      })
    ),

    // aMule Configuration
    h(ConfigSection, {
      title: 'aMule Connection',
      description: 'aMule External Connection (EC) settings',
      defaultOpen: false,
      open: openSections.amule,
      onToggle: (value) => setOpenSections(prev => ({ ...prev, amule: value }))
    },
      h(ConfigField, {
        label: 'Host',
        description: 'aMule External Connection (EC) host address',
        value: formData.amule.host,
        onChange: (value) => updateField('amule', 'host', value),
        placeholder: '127.0.0.1',
        required: true,
        fromEnv: meta?.fromEnv.amuleHost
      }),
      h(ConfigField, {
        label: 'Port',
        description: 'aMule EC port (default: 4712)',
        value: formData.amule.port,
        onChange: (value) => updateField('amule', 'port', value),
        type: 'number',
        placeholder: '4712',
        required: true,
        fromEnv: meta?.fromEnv.amulePort
      }),
      h(ConfigField, {
        label: 'Password',
        description: 'aMule EC password (set in aMule preferences)',
        value: formData.amule.password,
        onChange: (value) => updateField('amule', 'password', value),
        required: true,
        fromEnv: meta?.fromEnv.amulePassword
      },
        h(PasswordField, {
          value: formData.amule.password,
          onChange: (value) => updateField('amule', 'password', value),
          placeholder: 'Enter aMule EC password',
          disabled: meta?.fromEnv.amulePassword
        })
      ),
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
    ),

    // Directories Configuration
    h(ConfigSection, {
      title: 'Directories',
      description: 'Data, logs, and GeoIP directories',
      defaultOpen: false,
      open: openSections.directories,
      onToggle: (value) => setOpenSections(prev => ({ ...prev, directories: value }))
    },
      isDocker && h(DockerWarning, {
        message: 'You are running in Docker. Changing directories requires updating your docker-compose.yml volume mounts. Unless you know what you\'re doing, keep the default values.'
      }),
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
      testResults?.results?.directories && h('div', { className: 'space-y-2 mt-2' },
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

    // Sonarr Integration
    h(ConfigSection, {
      title: 'Sonarr Integration',
      description: 'Automatic TV show search integration',
      defaultOpen: false,
      open: openSections.sonarr,
      onToggle: (value) => setOpenSections(prev => ({ ...prev, sonarr: value }))
    },
      h(EnableToggle, {
        enabled: formData.integrations.sonarr.enabled,
        onChange: (value) => updateNestedField('integrations', 'sonarr', 'enabled', value),
        label: 'Enable Sonarr Integration',
        description: 'Enable automatic searching for TV shows'
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
        h(ConfigField, {
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

    // Radarr Integration
    h(ConfigSection, {
      title: 'Radarr Integration',
      description: 'Automatic movie search integration',
      defaultOpen: false,
      open: openSections.radarr,
      onToggle: (value) => setOpenSections(prev => ({ ...prev, radarr: value }))
    },
      h(EnableToggle, {
        enabled: formData.integrations.radarr.enabled,
        onChange: (value) => updateNestedField('integrations', 'radarr', 'enabled', value),
        label: 'Enable Radarr Integration',
        description: 'Enable automatic searching for movies'
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
        h(ConfigField, {
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
    ),

    // Test summary
    renderTestSummary(),

    // Action buttons
    h('div', { className: 'flex flex-wrap gap-3 mt-6 pb-4' },
      h('button', {
        onClick: handleTestAll,
        disabled: isTesting || loading,
        className: `px-4 py-2 font-medium rounded-lg
          ${isTesting || loading
            ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
            : 'bg-blue-600 hover:bg-blue-700 text-white'}
          transition-colors`
      }, isTesting ? 'Testing...' : 'Test All'),
      h('button', {
        onClick: handleSave,
        disabled: !hasChanges || loading || hasTestErrors(),
        className: `px-4 py-2 font-medium rounded-lg
          ${!hasChanges || loading || hasTestErrors()
            ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
            : 'bg-green-600 hover:bg-green-700 text-white'}
          transition-colors`
      }, loading ? 'Saving...' : 'Save Changes'),
      h('button', {
        onClick: handleCancel,
        disabled: loading,
        className: 'px-4 py-2 font-medium rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 transition-colors'
      }, 'Cancel')
    )
  );
};

export default SettingsView;
