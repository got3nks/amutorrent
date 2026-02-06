/**
 * SetupWizardView Component
 *
 * Multi-step first-time setup wizard
 */

import React from 'https://esm.sh/react@18.2.0';
const { createElement: h, useState, useEffect } = React;

import { useConfig } from '../../hooks/index.js';
import { LoadingSpinner, Icon, AlertBox, Button } from '../common/index.js';
import {
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
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [securityValidationError, setSecurityValidationError] = useState(null);
  const [stepValidationError, setStepValidationError] = useState(null);

  const steps = ['Welcome', 'Security', 'aMule', 'rTorrent', 'Directories', 'Integrations', 'Review'];

  // Load defaults on mount
  useEffect(() => {
    fetchStatus();
    fetchDefaults();
  }, []);

  // Initialize form data from defaults
  useEffect(() => {
    if (defaults && !formData) {
      const meta = defaults._meta;
      setFormData({
        server: {
          ...defaults.server,
          auth: {
            ...defaults.server.auth,
            enabled: true // Enable auth by default during first-run setup
          }
        },
        amule: {
          ...defaults.amule,
          // Both clients enabled by default in wizard, unless env var explicitly says otherwise
          enabled: meta?.fromEnv?.amuleEnabled ? defaults.amule.enabled : true
        },
        rtorrent: {
          ...defaults.rtorrent,
          enabled: meta?.fromEnv?.rtorrentEnabled ? defaults.rtorrent.enabled : true
        },
        directories: { ...defaults.directories },
        integrations: {
          sonarr: { ...defaults.integrations.sonarr },
          radarr: { ...defaults.integrations.radarr },
          prowlarr: { ...defaults.integrations?.prowlarr || { enabled: false, url: '', apiKey: '' } }
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
    setStepValidationError(null); // Clear validation error when fields change
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
    setStepValidationError(null); // Clear validation error when fields change
  };

  // Navigate to next step
  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      // Validate security step before proceeding (step 1)
      if (currentStep === 1) {
        // Only validate if authentication is enabled and password is not from environment
        if (formData.server.auth.enabled && !meta?.fromEnv.serverAuthPassword) {
          // Check if password is provided
          if (!formData.server.auth.password) {
            setSecurityValidationError('Password is required when authentication is enabled');
            return; // Don't proceed without password
          }

          // Validate password requirements
          const passwordErrors = validatePassword(formData.server.auth.password);
          if (passwordErrors.length > 0) {
            setSecurityValidationError('Password does not meet requirements: ' + passwordErrors.join(', '));
            return; // Don't proceed if password doesn't meet requirements
          }

          // Check password confirmation
          if (!passwordConfirm) {
            setSecurityValidationError('Please confirm your password');
            return;
          }

          if (formData.server.auth.password !== passwordConfirm) {
            setSecurityValidationError('Passwords do not match');
            return; // Don't proceed if passwords don't match
          }
        }
        // If auth is disabled or password is from env, allow proceeding without validation
        setSecurityValidationError(null); // Clear any previous errors
      }

      // Validate aMule step (step 2) - only if enabled
      if (currentStep === 2) {
        if (formData.amule.enabled !== false) {
          const errors = [];
          if (!formData.amule.host) errors.push('Host is required');
          if (!formData.amule.port) errors.push('Port is required');
          if (!formData.amule.password && !meta?.fromEnv.amulePassword) errors.push('Password is required');

          if (errors.length > 0) {
            setStepValidationError(errors.join(', '));
            return;
          }
        }
        setStepValidationError(null);
      }

      // Validate rtorrent step (step 3) - only if enabled
      if (currentStep === 3) {
        if (formData.rtorrent.enabled) {
          const errors = [];
          if (!formData.rtorrent.host && !meta?.fromEnv.rtorrentHost) errors.push('Host is required');
          if (!formData.rtorrent.port && !meta?.fromEnv.rtorrentPort) errors.push('Port is required');

          if (errors.length > 0) {
            setStepValidationError(errors.join(', '));
            return;
          }
        }

        // Cross-validation: at least one client must be enabled
        if (formData.amule.enabled === false && !formData.rtorrent.enabled) {
          setStepValidationError('At least one download client (aMule or rTorrent) must be enabled');
          return;
        }
        setStepValidationError(null);
      }

      // Validate directories step (step 4)
      if (currentStep === 4) {
        const errors = [];
        if (!formData.directories.data) errors.push('Data directory is required');
        if (!formData.directories.logs) errors.push('Logs directory is required');

        if (errors.length > 0) {
          setStepValidationError(errors.join(', '));
          return;
        }
        setStepValidationError(null);
      }

      // Validate integrations step (step 5)
      if (currentStep === 5) {
        const errors = [];
        if (formData.integrations.sonarr.enabled) {
          if (!formData.integrations.sonarr.url) errors.push('Sonarr URL is required');
          if (!formData.integrations.sonarr.apiKey && !meta?.fromEnv.sonarrApiKey) errors.push('Sonarr API key is required');
        }
        if (formData.integrations.radarr.enabled) {
          if (!formData.integrations.radarr.url) errors.push('Radarr URL is required');
          if (!formData.integrations.radarr.apiKey && !meta?.fromEnv.radarrApiKey) errors.push('Radarr API key is required');
        }
        if (formData.integrations.prowlarr?.enabled) {
          if (!formData.integrations.prowlarr.url) errors.push('Prowlarr URL is required');
          if (!formData.integrations.prowlarr.apiKey && !meta?.fromEnv.prowlarrApiKey) errors.push('Prowlarr API key is required');
        }

        if (errors.length > 0) {
          setStepValidationError(errors.join(', '));
          return;
        }
        setStepValidationError(null);
      }

      setCurrentStep(currentStep + 1);
      clearTestResults();
    }
  };

  // Navigate to previous step
  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      setSaveError('');
      clearTestResults();
      setSecurityValidationError(null); // Clear validation errors when navigating
      setStepValidationError(null);
    }
  };

  // Test current step
  const handleTestCurrentStep = async () => {
    if (!formData) return;

    setIsTesting(true);
    try {
      if (currentStep === 2) {
        // Test aMule (step 2) - only if enabled
        if (formData.amule.enabled !== false) {
          await testConfig({ amule: formData.amule });
        }
      } else if (currentStep === 3) {
        // Test rtorrent (step 3) - only if enabled
        if (formData.rtorrent.enabled) {
          await testConfig({ rtorrent: formData.rtorrent });
        }
      } else if (currentStep === 4) {
        // Test directories (step 4)
        await testConfig({ directories: formData.directories });
      } else if (currentStep === 5) {
        // Test integrations (step 5)
        const testPayload = {};
        if (formData.integrations.sonarr.enabled) {
          testPayload.sonarr = formData.integrations.sonarr;
        }
        if (formData.integrations.radarr.enabled) {
          testPayload.radarr = formData.integrations.radarr;
        }
        if (formData.integrations.prowlarr?.enabled) {
          testPayload.prowlarr = formData.integrations.prowlarr;
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
      const payload = buildTestPayload(formData);
      await testConfig(payload);
    } catch (err) {
      // Error handled by useConfig
    } finally {
      setIsTesting(false);
    }
  };

  // Check if there are any test errors
  const hasTestErrors = () => checkTestErrors(testResults, formData);


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
          directories: formData.directories
        };

        if (formData.amule.enabled !== false) {
          testPayload.amule = formData.amule;
        }
        if (formData.rtorrent.enabled) {
          testPayload.rtorrent = formData.rtorrent;
        }
        if (formData.integrations.sonarr.enabled) {
          testPayload.sonarr = formData.integrations.sonarr;
        }
        if (formData.integrations.radarr.enabled) {
          testPayload.radarr = formData.integrations.radarr;
        }
        if (formData.integrations.prowlarr?.enabled) {
          testPayload.prowlarr = formData.integrations.prowlarr;
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
      if (checkResultsForErrors(results, formData)) {
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

  // Show loading state when formData hasn't been initialized yet
  if (!formData) {
    // If there's an error, show error message
    if (error) {
      return h('div', { className: 'flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-900' },
        h('p', { className: 'text-red-600 dark:text-red-400' }, 'Failed to load setup wizard: ', error)
      );
    }
    // Otherwise show loading spinner
    return h('div', { className: 'flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-900' },
      h(LoadingSpinner, { text: 'Loading setup wizard...' })
    );
  }

  const isDocker = configStatus?.isDocker;
  const meta = defaults?._meta;

  // Wizard steps content
  const WelcomeStep = () => h('div', { className: 'text-center max-w-2xl mx-auto' },
    h('div', { className: 'mb-6' },
      h('img', {
        src: 'static/logo-amutorrent.png',
        alt: 'aMuTorrent',
        className: 'w-20 h-20 mx-auto mb-4'
      }),
      h('h2', { className: 'text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2' }, 'Welcome to aMuTorrent'),
      h('p', { className: 'text-lg text-gray-600 dark:text-gray-400' }, 'Let\'s get you set up with a quick configuration wizard')
    ),
    h('div', { className: 'bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md text-left' },
      h('h3', { className: 'text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4' }, 'What we\'ll configure:'),
      h('ul', { className: 'space-y-3' },
        h('li', { className: 'flex items-start gap-3' },
          h(Icon, { name: 'lock', size: 20, className: 'text-blue-600 dark:text-blue-400 mt-0.5' }),
          h('div', {},
            h('p', { className: 'font-medium text-gray-900 dark:text-gray-100' }, 'Web Interface Security'),
            h('p', { className: 'text-sm text-gray-600 dark:text-gray-400' }, 'Protect your controller with password authentication')
          )
        ),
        h('li', { className: 'flex items-start gap-3' },
          h(Icon, { name: 'plugConnect', size: 20, className: 'text-blue-600 dark:text-blue-400 mt-0.5' }),
          h('div', {},
            h('p', { className: 'font-medium text-gray-900 dark:text-gray-100' }, 'Download Clients'),
            h('p', { className: 'text-sm text-gray-600 dark:text-gray-400' }, 'Connect aMule and/or rTorrent with optional integrations')
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
            h('p', { className: 'text-sm text-gray-600 dark:text-gray-400' }, 'Configure Sonarr, Radarr, and Prowlarr integrations')
          )
        )
      )
    ),
    h('p', { className: 'mt-6 text-gray-600 dark:text-gray-400' }, 'Click "Next" to begin the setup process')
  );

  const SecurityStep = () => {
    const passwordErrors = formData.server.auth.enabled && formData.server.auth.password
      ? validatePassword(formData.server.auth.password)
      : [];
    const passwordMismatch = formData.server.auth.enabled && formData.server.auth.password !== passwordConfirm;

    return h('div', {},
      h('h2', { className: 'text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2' }, 'Web Interface Security'),
      h('p', { className: 'text-gray-600 dark:text-gray-400 mb-6' }, 'Protect your aMuTorrent web interface with password authentication'),

      h(EnableToggle, {
        label: 'Enable Authentication',
        description: 'Require password to access the web interface (recommended for network-accessible installations)',
        enabled: formData.server.auth.enabled,
        onChange: (enabled) => {
          updateNestedField('server', 'auth', 'enabled', enabled);
          if (!enabled) {
            // Clear password fields when disabling
            updateNestedField('server', 'auth', 'password', '');
            setPasswordConfirm('');
          }
          setSecurityValidationError(null); // Clear validation error when toggling
        }
      }),

      formData.server.auth.enabled && h('div', { className: 'mt-6 space-y-4' },
        // Show warning if password from environment
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
            required: true,
            fromEnv: meta?.fromEnv.serverAuthPassword
          },
            h(PasswordField, {
              value: formData.server.auth.password || '',
              onChange: (value) => {
                updateNestedField('server', 'auth', 'password', value);
                setSecurityValidationError(null); // Clear validation error when typing
              },
              placeholder: 'Enter password',
              disabled: meta?.fromEnv.serverAuthPassword
            })
          ),

          h(ConfigField, {
            label: 'Confirm Password',
            description: 'Re-enter your password to confirm',
            required: true
          },
            h(PasswordField, {
              value: passwordConfirm,
              onChange: (value) => {
                setPasswordConfirm(value);
                setSecurityValidationError(null); // Clear validation error when typing
              },
              placeholder: 'Confirm password',
              disabled: meta?.fromEnv.serverAuthPassword
            })
          ),

          // Real-time validation feedback
          formData.server.auth.password && h('div', {},
            passwordErrors.length > 0 && h(AlertBox, { type: 'error' },
              h('div', {},
                h('p', { className: 'font-medium mb-1' }, 'Password requirements not met:'),
                h('ul', { className: 'list-disc list-inside space-y-1' },
                  passwordErrors.map(error => h('li', { key: error }, error))
                )
              )
            ),

            passwordMismatch && passwordConfirm && h(AlertBox, { type: 'error' },
              h('p', {}, 'Passwords do not match')
            ),

            passwordErrors.length === 0 && !passwordMismatch && passwordConfirm && h(AlertBox, { type: 'success' },
              h('p', {}, 'Password meets all requirements and matches')
            )
          )
        )
      ),

      // Validation error message
      securityValidationError && h(AlertBox, { type: 'error', className: 'mt-4' },
            h('p', {}, securityValidationError)
      ),

      !formData.server.auth.enabled && h(AlertBox, { type: 'warning', className: 'mt-4' },
        h('p', {},
          'Authentication is disabled. Your web interface will be accessible without a password. This is not recommended for network-accessible installations.')
      )
    );
  };

  const AmuleStep = () => h('div', {},
    h('h2', { className: 'text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2' }, 'aMule Connection'),
    h('p', { className: 'text-gray-600 dark:text-gray-400 mb-6' }, 'Optionally configure connection to your aMule daemon for ed2k/Kademlia downloads'),

    h(EnableToggle, {
      label: 'Enable aMule Integration',
      description: 'Connect to aMule for managing ed2k/Kademlia downloads',
      enabled: formData.amule.enabled !== false,
      onChange: (enabled) => updateField('amule', 'enabled', enabled)
    }),

    formData.amule.enabled !== false && h('div', { className: 'mt-6 space-y-4' },
      isDocker && h(AlertBox, { type: 'info' },
        h('p', {}, 'You are running in Docker. If aMule is running on your host machine, use the special hostname ', h('code', { className: 'bg-white dark:bg-gray-800 px-1 rounded' }, 'host.docker.internal'), '. If aMule is running in another container, use that container\'s name as the hostname.')
      ),

      h(ConfigField, {
        label: 'Host',
        description: 'aMule External Connection (EC) host address',
        value: formData.amule.host,
        onChange: (value) => updateField('amule', 'host', value),
        placeholder: '127.0.0.1',
        required: formData.amule.enabled !== false,
        fromEnv: meta?.fromEnv.amuleHost
      }),
      h(ConfigField, {
        label: 'Port',
        description: 'aMule EC port (default: 4712)',
        value: formData.amule.port,
        onChange: (value) => updateField('amule', 'port', value),
        type: 'number',
        placeholder: '4712',
        required: formData.amule.enabled !== false,
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
        required: formData.amule.enabled !== false,
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
    ),

    formData.amule.enabled === false && h(AlertBox, { type: 'info', className: 'mt-4' },
      h('p', {}, 'aMule integration is optional. You can skip this step if you only want to use rTorrent.')
    ),

    // Validation error message
    stepValidationError && currentStep === 2 && h(AlertBox, { type: 'error', className: 'mt-4' },
      h('p', {}, stepValidationError)
    )
  );

  const RtorrentStep = () => h('div', {},
    h('h2', { className: 'text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2' }, 'rTorrent Connection'),
    h('p', { className: 'text-gray-600 dark:text-gray-400 mb-6' }, 'Optionally configure rTorrent for BitTorrent downloads via XML-RPC'),

    h(EnableToggle, {
      label: 'Enable rTorrent Integration',
      description: 'Connect to rTorrent for managing BitTorrent downloads',
      enabled: formData.rtorrent.enabled,
      onChange: (enabled) => updateField('rtorrent', 'enabled', enabled)
    }),

    formData.rtorrent.enabled && h('div', { className: 'mt-6 space-y-4' },
      isDocker && h(AlertBox, { type: 'info' },
        h('p', {}, 'You are running in Docker. If rTorrent is running on your host machine, use ', h('code', { className: 'bg-white dark:bg-gray-800 px-1 rounded' }, 'host.docker.internal'), ' as the hostname.')
      ),

      h(ConfigField, {
        label: 'Host',
        description: 'rTorrent XML-RPC host address',
        value: formData.rtorrent.host,
        onChange: (value) => updateField('rtorrent', 'host', value),
        placeholder: '127.0.0.1',
        required: formData.rtorrent.enabled,
        fromEnv: meta?.fromEnv.rtorrentHost
      }),

      h(ConfigField, {
        label: 'Port',
        description: 'rTorrent XML-RPC port (default: 8000)',
        value: formData.rtorrent.port,
        onChange: (value) => updateField('rtorrent', 'port', parseInt(value, 10) || 8000),
        type: 'number',
        placeholder: '8000',
        required: formData.rtorrent.enabled,
        fromEnv: meta?.fromEnv.rtorrentPort
      }),

      h(ConfigField, {
        label: 'XML-RPC Path',
        description: 'Path for XML-RPC endpoint (default: /RPC2)',
        value: formData.rtorrent.path,
        onChange: (value) => updateField('rtorrent', 'path', value),
        placeholder: '/RPC2',
        fromEnv: meta?.fromEnv.rtorrentPath
      }),

      h(ConfigField, {
        label: 'Username (Optional)',
        description: 'Username for HTTP basic authentication (if required)',
        value: formData.rtorrent.username,
        onChange: (value) => updateField('rtorrent', 'username', value),
        placeholder: 'Leave empty if not required',
        fromEnv: meta?.fromEnv.rtorrentUsername
      }),

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

      meta?.fromEnv.rtorrentPassword && h(AlertBox, { type: 'warning' },
        h('p', {}, 'rTorrent password is set via RTORRENT_PASSWORD environment variable.')
      ),

      h('div', { className: 'mt-6' },
        h(TestButton, {
          onClick: handleTestCurrentStep,
          loading: isTesting,
          disabled: !formData.rtorrent.host || !formData.rtorrent.port
        }, 'Test rTorrent Connection')
      ),

      testResults?.results?.rtorrent && h(TestResultIndicator, {
        result: testResults.results.rtorrent,
        label: 'rTorrent Connection Test'
      }),

      // Prowlarr Integration (for torrent searches)
      h('div', { className: 'mt-8 pt-6 border-t border-gray-200 dark:border-gray-700' },
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
            h('p', {}, 'Prowlarr API key is set via environment variable.')
          ),
          !meta?.fromEnv.prowlarrApiKey && h(ConfigField, {
            label: 'API Key',
            description: 'Prowlarr API key (Settings → General)',
            value: formData.integrations.prowlarr?.apiKey || '',
            onChange: (value) => updateNestedField('integrations', 'prowlarr', 'apiKey', value),
            required: formData.integrations.prowlarr?.enabled
          },
            h(PasswordField, {
              value: formData.integrations.prowlarr?.apiKey || '',
              onChange: (value) => updateNestedField('integrations', 'prowlarr', 'apiKey', value),
              placeholder: 'Enter Prowlarr API key',
              disabled: meta?.fromEnv.prowlarrApiKey
            })
          )
        )
      )
    ),

    !formData.rtorrent.enabled && h(AlertBox, { type: 'info', className: 'mt-4' },
      h('p', {}, 'rTorrent integration is optional. You can skip this step if you only want to use aMule. At least one download client must be enabled.')
    ),

    // Validation error message
    stepValidationError && currentStep === 3 && h(AlertBox, { type: 'error', className: 'mt-4' },
      h('p', {}, stepValidationError)
    )
  );

  const DirectoriesStep = () => h('div', {},
    h('h2', { className: 'text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2' }, 'Directories'),
    h('p', { className: 'text-gray-600 dark:text-gray-400 mb-6' }, 'Configure directories for data, logs, and GeoIP files'),

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

    h('div', { className: 'mt-6' },
      h(TestButton, {
        onClick: handleTestCurrentStep,
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
    ),

    // Validation error message
    stepValidationError && currentStep === 4 && h(AlertBox, { type: 'error', className: 'mt-4' },
      h('p', {}, stepValidationError)
    )
  );

  const IntegrationsStep = () => {
    const hasAnyIntegration = formData.integrations.sonarr.enabled ||
                              formData.integrations.radarr.enabled ||
                              formData.integrations.prowlarr?.enabled;

    return h('div', {},
      h('h2', { className: 'text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2' }, 'Integrations'),
      h('p', { className: 'text-gray-600 dark:text-gray-400 mb-6' }, 'Configure optional integrations for automatic searches.'),

      // Integration config info (shown when aMule is enabled for *arr integration)
      formData.amule.enabled !== false && h(IntegrationConfigInfo, {
        title: '*arr Integration Configuration',
        port: formData.server.port,
        authEnabled: formData.server.auth.enabled,
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
            h('p', {}, 'Sonarr API key is set via environment variable.')
          ),
          !meta?.fromEnv.sonarrApiKey && h(ConfigField, {
            label: 'API Key',
            description: 'Sonarr API key (Settings → General)',
            value: formData.integrations.sonarr.apiKey,
            onChange: (value) => updateNestedField('integrations', 'sonarr', 'apiKey', value),
            required: formData.integrations.sonarr.enabled
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
            placeholder: '6'
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
            h('p', {}, 'Radarr API key is set via environment variable.')
          ),
          !meta?.fromEnv.radarrApiKey && h(ConfigField, {
            label: 'API Key',
            description: 'Radarr API key (Settings → General)',
            value: formData.integrations.radarr.apiKey,
            onChange: (value) => updateNestedField('integrations', 'radarr', 'apiKey', value),
            required: formData.integrations.radarr.enabled
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
            placeholder: '6'
          })
        )
      ),

      // Prowlarr summary (configured in rTorrent step)
      formData.integrations.prowlarr?.enabled && h('div', { className: 'bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 mb-6' },
        h('h3', { className: 'font-semibold text-gray-900 dark:text-gray-100 mb-2' }, 'Prowlarr (rTorrent torrent search)'),
        h('p', { className: 'text-sm text-gray-600 dark:text-gray-400' }, `URL: ${formData.integrations.prowlarr?.url}`)
      ),

      // Test button (only show if any integration is enabled)
      hasAnyIntegration && h('div', { className: 'mt-6' },
        h(TestButton, {
          onClick: handleTestCurrentStep,
          loading: isTesting,
          disabled:
            (formData.integrations.sonarr.enabled && (!formData.integrations.sonarr.url || !formData.integrations.sonarr.apiKey)) ||
            (formData.integrations.radarr.enabled && (!formData.integrations.radarr.url || !formData.integrations.radarr.apiKey)) ||
            (formData.integrations.prowlarr?.enabled && (!formData.integrations.prowlarr?.url || !formData.integrations.prowlarr?.apiKey))
        }, 'Test Integrations')
      ),

      hasAnyIntegration && testResults?.results && h('div', {},
        testResults.results.sonarr && h(TestResultIndicator, {
          result: testResults.results.sonarr,
          label: 'Sonarr API Test'
        }),
        testResults.results.radarr && h(TestResultIndicator, {
          result: testResults.results.radarr,
          label: 'Radarr API Test'
        }),
        testResults.results.prowlarr && h(TestResultIndicator, {
          result: testResults.results.prowlarr,
          label: 'Prowlarr API Test'
        })
      ),

      // Validation error message
      stepValidationError && currentStep === 5 && h(AlertBox, { type: 'error', className: 'mt-4' },
        h('p', {}, stepValidationError)
      )
    );
  };

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

      // Authentication
      h('div', { className: 'bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700' },
        h('h3', { className: 'font-semibold text-gray-900 dark:text-gray-100 mb-2' }, 'Web Interface Authentication'),
        h('p', { className: 'text-sm text-gray-600 dark:text-gray-400' },
          formData.server.auth.enabled
            ? 'Authentication: Enabled (password configured)'
            : 'Authentication: Disabled'
        )
      ),

      // aMule
      h('div', { className: 'bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700' },
        h('h3', { className: 'font-semibold text-gray-900 dark:text-gray-100 mb-2' }, 'aMule Connection'),
        formData.amule.enabled !== false
          ? h('div', {},
              h('p', { className: 'text-sm text-gray-600 dark:text-gray-400' }, `Host: ${formData.amule.host}`),
              h('p', { className: 'text-sm text-gray-600 dark:text-gray-400' }, `Port: ${formData.amule.port}`),
              h('p', { className: 'text-sm text-gray-600 dark:text-gray-400' }, 'Password: ********')
            )
          : h('p', { className: 'text-sm text-gray-500 dark:text-gray-500 italic' }, 'Disabled')
      ),

      // rtorrent
      formData.rtorrent.enabled && h('div', { className: 'bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700' },
        h('h3', { className: 'font-semibold text-gray-900 dark:text-gray-100 mb-2' }, 'rTorrent Connection'),
        h('p', { className: 'text-sm text-gray-600 dark:text-gray-400' }, `Host: ${formData.rtorrent.host}`),
        h('p', { className: 'text-sm text-gray-600 dark:text-gray-400' }, `Port: ${formData.rtorrent.port}`),
        h('p', { className: 'text-sm text-gray-600 dark:text-gray-400' }, `Path: ${formData.rtorrent.path || '/RPC2'}`),
        formData.rtorrent.username && h('p', { className: 'text-sm text-gray-600 dark:text-gray-400' }, `Username: ${formData.rtorrent.username}`)
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
      ),

      // Prowlarr
      formData.integrations.prowlarr?.enabled && h('div', { className: 'bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700' },
        h('h3', { className: 'font-semibold text-gray-900 dark:text-gray-100 mb-2' }, 'Prowlarr Integration'),
        h('p', { className: 'text-sm text-gray-600 dark:text-gray-400' }, `URL: ${formData.integrations.prowlarr.url}`),
        h('p', { className: 'text-sm text-gray-600 dark:text-gray-400' }, 'API Key: ********')
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
      h(TestSummary, {
        testResults,
        formData,
        showDetails: true
      })
    ),

    saveError && h(AlertBox, { type: 'error', className: 'mt-4' },
      h('p', { className: 'font-medium' }, saveError)
    ),

    isSaving && h(AlertBox, { type: 'success', className: 'mt-4' },
      h('p', { className: 'flex items-center gap-2' },
        h(LoadingSpinner, { size: 20 }),
        'Saving configuration and initializing services...'
      )
    )
  );

  const stepComponents = [WelcomeStep, SecurityStep, AmuleStep, RtorrentStep, DirectoriesStep, IntegrationsStep, ReviewStep];

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
        h(Button, {
          variant: 'secondary',
          onClick: handleBack,
          disabled: currentStep === 0 || isSaving
        }, 'Back'),
        currentStep < steps.length - 1
          ? h(Button, {
              variant: 'primary',
              onClick: handleNext,
              disabled: isSaving
            }, 'Next')
          : h(Button, {
              variant: 'success',
              onClick: handleComplete,
              disabled: isSaving
            }, isSaving ? 'Saving...' : 'Complete Setup')
      )
    )
  );
};

export default SetupWizardView;
