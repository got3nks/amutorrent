/**
 * SetupWizardView Component
 *
 * Multi-step first-time setup wizard
 */

import React from 'https://esm.sh/react@18.2.0';
const { createElement: h, useState, useEffect } = React;

import { useConfig } from '../../hooks/index.js';
import { LoadingSpinner, Icon } from '../common/index.js';
import {
  ConfigField,
  TestButton,
  TestResultIndicator,
  PasswordField,
  EnableToggle,
  DockerWarning
} from '../settings/index.js';

/**
 * SetupWizardView component
 * @param {function} onComplete - Completion handler (triggers page reload)
 */
const SetupWizardView = ({ onComplete }) => {
  const {
    defaults,
    configStatus,
    testResults,
    loading,
    error,
    fetchDefaults,
    fetchStatus,
    testConfig,
    saveConfig,
    clearTestResults
  } = useConfig();

  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const steps = ['Welcome', 'aMule', 'Directories', 'Integrations', 'Review'];

  // Load defaults on mount
  useEffect(() => {
    fetchStatus();
    fetchDefaults();
  }, []);

  // Initialize form data from defaults
  useEffect(() => {
    if (defaults && !formData) {
      setFormData({
        server: { ...defaults.server },
        amule: { ...defaults.amule },
        directories: { ...defaults.directories },
        integrations: {
          sonarr: { ...defaults.integrations.sonarr },
          radarr: { ...defaults.integrations.radarr }
        }
      });
    }
  }, [defaults]);

  // Update field value
  const updateField = (section, field, value) => {
    setFormData(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value
      }
    }));
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
    clearTestResults();
  };

  // Navigate to next step
  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
      clearTestResults();
    }
  };

  // Navigate to previous step
  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      clearTestResults();
    }
  };

  // Test current step
  const handleTestCurrentStep = async () => {
    if (!formData) return;

    setIsTesting(true);
    try {
      if (currentStep === 1) {
        // Test aMule
        await testConfig({ amule: formData.amule });
      } else if (currentStep === 2) {
        // Test directories
        await testConfig({ directories: formData.directories });
      } else if (currentStep === 3) {
        // Test integrations
        const testPayload = {};
        if (formData.integrations.sonarr.enabled) {
          testPayload.sonarr = formData.integrations.sonarr;
        }
        if (formData.integrations.radarr.enabled) {
          testPayload.radarr = formData.integrations.radarr;
        }
        if (Object.keys(testPayload).length > 0) {
          await testConfig(testPayload);
        }
      }
    } catch (err) {
      // Error handled by useConfig
    } finally {
      setIsTesting(false);
    }
  };

  // Test all configuration
  const handleTestAll = async () => {
    if (!formData) return;

    setIsTesting(true);
    try {
      const testPayload = {
        amule: formData.amule,
        directories: formData.directories
      };

      if (formData.integrations.sonarr.enabled) {
        testPayload.sonarr = formData.integrations.sonarr;
      }
      if (formData.integrations.radarr.enabled) {
        testPayload.radarr = formData.integrations.radarr;
      }

      await testConfig(testPayload);
    } catch (err) {
      // Error handled by useConfig
    } finally {
      setIsTesting(false);
    }
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
      className: `p-4 rounded-lg border ${
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

  // Check if results have errors (for direct return value checking)
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

  // Save and complete setup
  const handleComplete = async () => {
    if (!formData) return;

    setSaveError(null);
    setIsSaving(true);

    // Always test before saving
    // If tests haven't been run, run them first
    if (!testResults || !testResults.results) {
      setIsTesting(true);
      let results;
      try {
        const testPayload = {
          amule: formData.amule,
          directories: formData.directories
        };

        if (formData.integrations.sonarr.enabled) {
          testPayload.sonarr = formData.integrations.sonarr;
        }
        if (formData.integrations.radarr.enabled) {
          testPayload.radarr = formData.integrations.radarr;
        }

        results = await testConfig(testPayload);
      } catch (err) {
        setSaveError('Configuration test failed. Please review the errors and fix them before completing setup.');
        setIsTesting(false);
        setIsSaving(false);
        return;
      }
      setIsTesting(false);
      setIsSaving(false);

      // Check results directly from the return value
      if (checkResultsForErrors(results)) {
        setSaveError('Configuration test failed. Please fix the errors and click Complete Setup again.');
        return;
      }

      // All tests passed - proceed with save automatically
      // Set saving back to true and fall through to save logic
      setIsSaving(true);
    } else {
      // Tests were already run - check for errors from state
      if (hasTestErrors()) {
        setSaveError('Configuration test failed. Please fix the errors before completing setup.');
        setIsSaving(false);
        return;
      }
    }

    try {
      await saveConfig({
        version: '1.0',
        firstRunCompleted: true,
        ...formData
      });

      // Success! Reload page to initialize services
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (err) {
      setSaveError(err.message);
      setIsSaving(false);
    }
  };

  if (loading && !formData) {
    return h('div', { className: 'flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-900' },
      h(LoadingSpinner, { message: 'Loading setup wizard...' })
    );
  }

  if (!formData) {
    return h('div', { className: 'flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-900' },
      h('p', { className: 'text-red-600 dark:text-red-400' }, 'Failed to load setup wizard')
    );
  }

  const isDocker = configStatus?.isDocker;

  // Wizard steps content
  const WelcomeStep = () => h('div', { className: 'text-center max-w-2xl mx-auto' },
    h('div', { className: 'mb-6' },
      h('img', {
        src: 'static/logo-brax.png',
        alt: 'aMule Logo',
        className: 'w-20 h-20 mx-auto mb-4'
      }),
      h('h2', { className: 'text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2' }, 'Welcome to aMule Web Controller'),
      h('p', { className: 'text-lg text-gray-600 dark:text-gray-400' }, 'Let\'s get you set up with a quick configuration wizard')
    ),
    h('div', { className: 'bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md text-left' },
      h('h3', { className: 'text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4' }, 'What we\'ll configure:'),
      h('ul', { className: 'space-y-3' },
        h('li', { className: 'flex items-start gap-3' },
          h(Icon, { name: 'plugConnect', size: 20, className: 'text-blue-600 dark:text-blue-400 mt-0.5' }),
          h('div', {},
            h('p', { className: 'font-medium text-gray-900 dark:text-gray-100' }, 'aMule Connection'),
            h('p', { className: 'text-sm text-gray-600 dark:text-gray-400' }, 'Connect to your aMule daemon')
          )
        ),
        h('li', { className: 'flex items-start gap-3' },
          h(Icon, { name: 'folder', size: 20, className: 'text-blue-600 dark:text-blue-400 mt-0.5' }),
          h('div', {},
            h('p', { className: 'font-medium text-gray-900 dark:text-gray-100' }, 'Directories'),
            h('p', { className: 'text-sm text-gray-600 dark:text-gray-400' }, 'Configure data, logs, and GeoIP directories')
          )
        ),
        h('li', { className: 'flex items-start gap-3' },
          h(Icon, { name: 'cloud', size: 20, className: 'text-blue-600 dark:text-blue-400 mt-0.5' }),
          h('div', {},
            h('p', { className: 'font-medium text-gray-900 dark:text-gray-100' }, 'Integrations (Optional)'),
            h('p', { className: 'text-sm text-gray-600 dark:text-gray-400' }, 'Set up Sonarr and Radarr integration')
          )
        )
      )
    ),
    h('p', { className: 'mt-6 text-gray-600 dark:text-gray-400' }, 'Click "Next" to begin the setup process')
  );

  const AmuleStep = () => h('div', {},
    h('h2', { className: 'text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2' }, 'aMule Connection'),
    h('p', { className: 'text-gray-600 dark:text-gray-400 mb-6' }, 'Configure connection to your aMule daemon'),

    h(ConfigField, {
      label: 'Host',
      description: 'aMule External Connection (EC) host address',
      value: formData.amule.host,
      onChange: (value) => updateField('amule', 'host', value),
      placeholder: '127.0.0.1',
      required: true
    }),
    h(ConfigField, {
      label: 'Port',
      description: 'aMule EC port (default: 4712)',
      value: formData.amule.port,
      onChange: (value) => updateField('amule', 'port', value),
      type: 'number',
      placeholder: '4712',
      required: true
    }),
    h(ConfigField, {
      label: 'Password',
      description: 'aMule EC password (set in aMule preferences)',
      value: formData.amule.password,
      onChange: (value) => updateField('amule', 'password', value),
      required: true
    },
      h(PasswordField, {
        value: formData.amule.password,
        onChange: (value) => updateField('amule', 'password', value),
        placeholder: 'Enter aMule EC password'
      })
    ),

    h('div', { className: 'mt-6' },
      h(TestButton, {
        onClick: handleTestCurrentStep,
        loading: isTesting,
        disabled: !formData.amule.host || !formData.amule.port || !formData.amule.password
      }, 'Test aMule Connection')
    ),

    testResults?.results?.amule && h(TestResultIndicator, {
      result: testResults.results.amule,
      label: 'aMule Connection Test'
    })
  );

  const DirectoriesStep = () => h('div', {},
    h('h2', { className: 'text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2' }, 'Directories'),
    h('p', { className: 'text-gray-600 dark:text-gray-400 mb-6' }, 'Configure directories for data, logs, and GeoIP files'),

    isDocker && h(DockerWarning, {
      message: '⚠️ You are running in Docker. Changing directories requires updating your docker-compose.yml volume mounts. Unless you know what you\'re doing, keep the default values.'
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

    h('div', { className: 'mt-6' },
      h(TestButton, {
        onClick: handleTestCurrentStep,
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
  );

  const IntegrationsStep = () => h('div', {},
    h('h2', { className: 'text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2' }, 'Integrations'),
    h('p', { className: 'text-gray-600 dark:text-gray-400 mb-6' }, 'Optionally configure Sonarr and Radarr integration'),

    // Sonarr
    h('div', { className: 'bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 mb-4' },
      h(EnableToggle, {
        enabled: formData.integrations.sonarr.enabled,
        onChange: (value) => updateNestedField('integrations', 'sonarr', 'enabled', value),
        label: 'Enable Sonarr Integration',
        description: 'Automatic searching for TV shows'
      }),
      formData.integrations.sonarr.enabled && h('div', { className: 'mt-4 space-y-4' },
        h(ConfigField, {
          label: 'Sonarr URL',
          description: 'Sonarr server URL (e.g., http://localhost:8989)',
          value: formData.integrations.sonarr.url,
          onChange: (value) => updateNestedField('integrations', 'sonarr', 'url', value),
          placeholder: 'http://localhost:8989',
          required: formData.integrations.sonarr.enabled
        }),
        h(ConfigField, {
          label: 'API Key',
          description: 'Sonarr API key (found in Settings → General)',
          value: formData.integrations.sonarr.apiKey,
          onChange: (value) => updateNestedField('integrations', 'sonarr', 'apiKey', value),
          required: formData.integrations.sonarr.enabled
        },
          h(PasswordField, {
            value: formData.integrations.sonarr.apiKey,
            onChange: (value) => updateNestedField('integrations', 'sonarr', 'apiKey', value),
            placeholder: 'Enter Sonarr API key'
          })
        ),
        h(ConfigField, {
          label: 'Search Interval (hours)',
          description: 'Hours between automatic searches (0 = disabled)',
          value: formData.integrations.sonarr.searchIntervalHours,
          onChange: (value) => updateNestedField('integrations', 'sonarr', 'searchIntervalHours', value),
          type: 'number',
          placeholder: '6'
        })
      )
    ),

    // Radarr
    h('div', { className: 'bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 mb-4' },
      h(EnableToggle, {
        enabled: formData.integrations.radarr.enabled,
        onChange: (value) => updateNestedField('integrations', 'radarr', 'enabled', value),
        label: 'Enable Radarr Integration',
        description: 'Automatic searching for movies'
      }),
      formData.integrations.radarr.enabled && h('div', { className: 'mt-4 space-y-4' },
        h(ConfigField, {
          label: 'Radarr URL',
          description: 'Radarr server URL (e.g., http://localhost:7878)',
          value: formData.integrations.radarr.url,
          onChange: (value) => updateNestedField('integrations', 'radarr', 'url', value),
          placeholder: 'http://localhost:7878',
          required: formData.integrations.radarr.enabled
        }),
        h(ConfigField, {
          label: 'API Key',
          description: 'Radarr API key (found in Settings → General)',
          value: formData.integrations.radarr.apiKey,
          onChange: (value) => updateNestedField('integrations', 'radarr', 'apiKey', value),
          required: formData.integrations.radarr.enabled
        },
          h(PasswordField, {
            value: formData.integrations.radarr.apiKey,
            onChange: (value) => updateNestedField('integrations', 'radarr', 'apiKey', value),
            placeholder: 'Enter Radarr API key'
          })
        ),
        h(ConfigField, {
          label: 'Search Interval (hours)',
          description: 'Hours between automatic searches (0 = disabled)',
          value: formData.integrations.radarr.searchIntervalHours,
          onChange: (value) => updateNestedField('integrations', 'radarr', 'searchIntervalHours', value),
          type: 'number',
          placeholder: '6'
        })
      )
    ),

    (formData.integrations.sonarr.enabled || formData.integrations.radarr.enabled) && h('div', { className: 'mt-6' },
      h(TestButton, {
        onClick: handleTestCurrentStep,
        loading: isTesting,
        disabled:
          (formData.integrations.sonarr.enabled && (!formData.integrations.sonarr.url || !formData.integrations.sonarr.apiKey)) ||
          (formData.integrations.radarr.enabled && (!formData.integrations.radarr.url || !formData.integrations.radarr.apiKey))
      }, 'Test Integrations')
    ),

    testResults?.results && h('div', { className: 'space-y-2 mt-2' },
      testResults.results.sonarr && h(TestResultIndicator, {
        result: testResults.results.sonarr,
        label: 'Sonarr API Test'
      }),
      testResults.results.radarr && h(TestResultIndicator, {
        result: testResults.results.radarr,
        label: 'Radarr API Test'
      })
    )
  );

  const ReviewStep = () => h('div', {},
    h('h2', { className: 'text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2' }, 'Review Configuration'),
    h('p', { className: 'text-gray-600 dark:text-gray-400 mb-6' }, 'Review your configuration and test before saving'),

    // Summary
    h('div', { className: 'space-y-4' },
      // Server
      h('div', { className: 'bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700' },
        h('h3', { className: 'font-semibold text-gray-900 dark:text-gray-100 mb-2' }, 'Server'),
        h('p', { className: 'text-sm text-gray-600 dark:text-gray-400' }, `Port: ${formData.server.port}`)
      ),

      // aMule
      h('div', { className: 'bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700' },
        h('h3', { className: 'font-semibold text-gray-900 dark:text-gray-100 mb-2' }, 'aMule Connection'),
        h('p', { className: 'text-sm text-gray-600 dark:text-gray-400' }, `Host: ${formData.amule.host}`),
        h('p', { className: 'text-sm text-gray-600 dark:text-gray-400' }, `Port: ${formData.amule.port}`),
        h('p', { className: 'text-sm text-gray-600 dark:text-gray-400' }, 'Password: ********')
      ),

      // Directories
      h('div', { className: 'bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700' },
        h('h3', { className: 'font-semibold text-gray-900 dark:text-gray-100 mb-2' }, 'Directories'),
        h('p', { className: 'text-sm text-gray-600 dark:text-gray-400' }, `Data: ${formData.directories.data}`),
        h('p', { className: 'text-sm text-gray-600 dark:text-gray-400' }, `Logs: ${formData.directories.logs}`),
        h('p', { className: 'text-sm text-gray-600 dark:text-gray-400' }, `GeoIP: ${formData.directories.geoip}`)
      ),

      // Sonarr
      formData.integrations.sonarr.enabled && h('div', { className: 'bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700' },
        h('h3', { className: 'font-semibold text-gray-900 dark:text-gray-100 mb-2' }, 'Sonarr Integration'),
        h('p', { className: 'text-sm text-gray-600 dark:text-gray-400' }, `URL: ${formData.integrations.sonarr.url}`),
        h('p', { className: 'text-sm text-gray-600 dark:text-gray-400' }, 'API Key: ********'),
        h('p', { className: 'text-sm text-gray-600 dark:text-gray-400' }, `Search Interval: ${formData.integrations.sonarr.searchIntervalHours} hours`)
      ),

      // Radarr
      formData.integrations.radarr.enabled && h('div', { className: 'bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700' },
        h('h3', { className: 'font-semibold text-gray-900 dark:text-gray-100 mb-2' }, 'Radarr Integration'),
        h('p', { className: 'text-sm text-gray-600 dark:text-gray-400' }, `URL: ${formData.integrations.radarr.url}`),
        h('p', { className: 'text-sm text-gray-600 dark:text-gray-400' }, 'API Key: ********'),
        h('p', { className: 'text-sm text-gray-600 dark:text-gray-400' }, `Search Interval: ${formData.integrations.radarr.searchIntervalHours} hours`)
      )
    ),

    h('div', { className: 'mt-6' },
      h(TestButton, {
        onClick: handleTestAll,
        loading: isTesting
      }, isTesting ? 'Testing All...' : 'Test All Configuration')
    ),

    // Test summary
    h('div', { className: 'mt-4' },
      renderTestSummary()
    ),

    saveError && h('div', { className: 'mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg' },
      h('p', { className: 'text-red-800 dark:text-red-300 font-medium' }, saveError)
    ),

    isSaving && h('div', { className: 'mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg' },
      h('p', { className: 'text-blue-800 dark:text-blue-300 flex items-center gap-2' },
        h(LoadingSpinner, { size: 20 }),
        'Saving configuration and initializing services...'
      )
    )
  );

  const stepComponents = [WelcomeStep, AmuleStep, DirectoriesStep, IntegrationsStep, ReviewStep];

  return h('div', { className: 'min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4' },
    h('div', { className: 'max-w-3xl mx-auto' },
      // Progress indicator
      h('div', { className: 'mb-8' },
        h('div', { className: 'flex items-center' },
          steps.map((step, idx) => [
            // Circle and label wrapper
            h('div', {
              key: `step-${idx}`,
              className: 'flex flex-col items-center'
            },
              h('div', {
                className: `w-8 h-8 rounded-full flex items-center justify-center font-medium text-sm shrink-0 mb-2
                  ${idx === currentStep
                    ? 'bg-blue-600 text-white'
                    : idx < currentStep
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-300 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`
              }, idx < currentStep ? h(Icon, { name: 'check', size: 16 }) : idx + 1),
              h('span', {
                className: `text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap ${idx === currentStep ? 'font-medium text-blue-600 dark:text-blue-400' : ''}`
              }, step)
            ),
            // Connecting line
            idx < steps.length - 1 && h('div', {
              key: `line-${idx}`,
              className: `flex-1 h-1 mx-2 self-start mt-4 ${idx < currentStep ? 'bg-green-600' : 'bg-gray-300 dark:bg-gray-700'}`
            })
          ]).flat().filter(Boolean)
        )
      ),

      // Step content
      h('div', { className: 'bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6' },
        stepComponents[currentStep]()
      ),

      // Navigation buttons
      h('div', { className: 'flex justify-between' },
        h('button', {
          onClick: handleBack,
          disabled: currentStep === 0 || isSaving,
          className: `px-4 py-2 font-medium rounded-lg
            ${currentStep === 0 || isSaving
              ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
              : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200'}
            transition-colors`
        }, 'Back'),
        currentStep < steps.length - 1
          ? h('button', {
              onClick: handleNext,
              disabled: isSaving,
              className: 'px-4 py-2 font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors'
            }, 'Next')
          : h('button', {
              onClick: handleComplete,
              disabled: isSaving,
              className: `px-4 py-2 font-medium rounded-lg
                ${isSaving
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-green-600 hover:bg-green-700'}
                text-white transition-colors`
            }, isSaving ? 'Saving...' : 'Complete Setup')
      )
    )
  );
};

export default SetupWizardView;
