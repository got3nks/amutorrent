/**
 * SetupWizardView Component
 *
 * Multi-step first-time setup wizard
 */

import React from 'https://esm.sh/react@18.2.0';
const { createElement: h, useState, useEffect } = React;

import { useConfig } from '../../hooks/index.js';
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js';
import { LoadingSpinner, Icon, AlertBox, Button, Select } from '../common/index.js';
import {
  ConfigField,
  TestButton,
  TestResultIndicator,
  PasswordField,
  EnableToggle,
  TestSummary,
  IntegrationConfigInfo,
  ClientFieldsRenderer,
  CLIENT_FIELDS,
  TYPE_LABELS,
  TYPE_DESCRIPTIONS,
  TYPE_DEFAULTS,
  missingRequiredFields
} from '../settings/index.js';
import { NETWORK_NAMES, CLIENT_NETWORK_TYPES, MAGNET_SCHEME } from '../../utils/constants.js';
import { validatePassword } from '../../utils/passwordValidator.js';
import { hasTestErrors as checkTestErrors, checkResultsForErrors, buildTestPayload } from '../../utils/testHelpers.js';

// Adapter — the wizard stores `fromEnv` as a flat object with client-prefixed
// camelCase keys (`rtorrentHost`, `qbittorrentPassword`), so translate the
// renderer's field-name lookup to that convention.
const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);
const wizardFromEnv = (meta, type, field) => !!meta?.fromEnv?.[`${type}${capitalize(field)}`];

const CLIENT_TYPES = Object.keys(CLIENT_FIELDS);

// Per-client results of a config test, labelled for display
const clientResultsFrom = (data) => Object.fromEntries(CLIENT_TYPES
  .filter(type => data?.results?.[type])
  .map(type => [type, { ...data.results[type], _label: `${TYPE_LABELS[type]} Connection` }]));

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
    fetchInterfaces,
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
  const [clientTestResults, setClientTestResults] = useState({});
  const [interfaces, setInterfaces] = useState([{ value: '0.0.0.0', label: 'All Interfaces (0.0.0.0)' }]);
  const debouncedAuthPassword = useDebouncedValue(formData?.server?.auth?.password || '');
  const debouncedPasswordConfirm = useDebouncedValue(passwordConfirm);

  // Load defaults on mount
  useEffect(() => {
    fetchStatus();
    fetchDefaults();
    fetchInterfaces().then(data => { if (data && data.length) setInterfaces(data); });
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
        // Every client starts disabled unless enabled via env var
        ...Object.fromEntries(CLIENT_TYPES.map(type => [type, {
          ...TYPE_DEFAULTS[type],
          ...defaults[type],
          enabled: meta?.fromEnv?.[`${type}Enabled`] ? !!defaults[type]?.enabled : false
        }])),
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
    setClientTestResults({});
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
    setClientTestResults({});
    setStepValidationError(null); // Clear validation error when fields change
  };

  // Navigate to next step
  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      if (step.key === 'security') {
        // Only validate if authentication is enabled and password is not from environment
        if (formData.server.auth.enabled) {
          // Validate admin username
          const adminUsername = formData.server.auth.adminUsername || 'admin';
          if (!/^[a-zA-Z0-9_]{3,32}$/.test(adminUsername)) {
            setSecurityValidationError('Admin username must be 3-32 characters (letters, numbers, underscore)');
            return;
          }
        }

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

      if (step.group) {
        const errors = [];
        for (const type of step.group.types) {
          if (!formData[type]?.enabled) continue;
          for (const f of missingRequiredFields(type, formData[type], (field) => wizardFromEnv(meta, type, field))) {
            errors.push(`${TYPE_LABELS[type]} ${f.label.toLowerCase()} is required`);
          }
        }
        if (errors.length > 0) {
          setStepValidationError(errors.join(', '));
          return;
        }
        // Leaving the last client step: at least one client must be enabled
        const isLastClientStep = !steps[currentStep + 1]?.group;
        if (isLastClientStep && !CLIENT_TYPES.some(type => formData[type]?.enabled)) {
          setStepValidationError(`At least one download client (${CLIENT_TYPES.map(t => TYPE_LABELS[t]).join(', ')}) must be enabled`);
          return;
        }
        setStepValidationError(null);
      }

      if (step.key === 'directories') {
        const errors = [];
        if (!formData.directories.data) errors.push('Data directory is required');
        if (!formData.directories.logs) errors.push('Logs directory is required');

        if (errors.length > 0) {
          setStepValidationError(errors.join(', '));
          return;
        }
        setStepValidationError(null);
      }

      if (step.key === 'integrations') {
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
      setClientTestResults({});
    }
  };

  // Navigate to previous step
  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      setSaveError('');
      clearTestResults();
      setClientTestResults({});
      setSecurityValidationError(null); // Clear validation errors when navigating
      setStepValidationError(null);
    }
  };

  // Test current step
  const handleTestCurrentStep = async () => {
    if (!formData) return;

    setIsTesting(true);
    try {
      if (step.group) {
        const payload = Object.fromEntries(step.group.types
          .filter(type => formData[type]?.enabled)
          .map(type => [type, formData[type]]));
        if (Object.keys(payload).length > 0) {
          const data = await testConfig(payload);
          setClientTestResults(prev => ({ ...prev, ...clientResultsFrom(data) }));
        }
      } else if (step.key === 'directories') {
        await testConfig({ directories: formData.directories });
      } else if (step.key === 'integrations') {
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
      const clients = buildClientsFromFormData();
      const payload = buildTestPayload({ clients, directories: formData.directories, integrations: formData.integrations });
      const data = await testConfig(payload);
      setClientTestResults(clientResultsFrom(data));
    } catch (err) {
      // Error handled by useConfig
    } finally {
      setIsTesting(false);
    }
  };

  // Check if there are any test errors
  const hasTestErrors = () => checkTestErrors(testResults, clientTestResults);


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
        const clients = buildClientsFromFormData();
        const testPayload = buildTestPayload({ clients, directories: formData.directories, integrations: formData.integrations });
        results = await testConfig(testPayload);
      } catch (err) {
        setSaveError('Configuration test failed. Please review the errors and fix them before completing setup.');
        setIsTesting(false);
        setIsSaving(false);
        return;
      }
      setIsTesting(false);
      setIsSaving(false);

      const newClientResults = clientResultsFrom(results);
      setClientTestResults(newClientResults);

      // Check results directly from the return value
      if (checkResultsForErrors(results, newClientResults)) {
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
      const clients = buildClientsFromFormData();

      await saveConfig({
        version: '1.0',
        firstRunCompleted: true,
        server: formData.server,
        directories: formData.directories,
        integrations: formData.integrations,
        clients
      });

      // Success! Reload page to initialize services
      // Delay longer if bind address changed so user can see the restart warning
      const needsRestart = formData.server.host && formData.server.host !== '0.0.0.0';
      setTimeout(() => {
        window.location.reload();
      }, needsRestart ? 4000 : 1000);
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

  // Build a clients array from flat formData (used by test and save paths)
  const buildClientsFromFormData = () => CLIENT_TYPES
    .filter(type => formData[type]?.enabled)
    .map(type => {
      const { enabled, ...fields } = formData[type];
      const entry = { type, enabled, ...fields };
      if (meta?.fromEnv?.[`${type}Host`]) entry.source = 'env';
      return entry;
    });

  // Client steps come from the client registry: source-based clients, then
  // torrent clients (trackers capability)
  const typeCaps = (type) => meta?.clientCapabilities?.[type] || {};
  const clientGroups = [false, true]
    .map(torrent => CLIENT_TYPES.filter(type => !!typeCaps(type).trackers === torrent))
    .filter(types => types.length > 0)
    .map(types => ({
      types,
      title: [...new Set(types.map(type => NETWORK_NAMES[CLIENT_NETWORK_TYPES[type]] || TYPE_LABELS[type]))].join(' & ')
    }));
  const steps = [
    { key: 'welcome', title: 'Welcome' },
    { key: 'security', title: 'Security' },
    ...clientGroups.map((group, i) => ({ key: `clients-${i}`, title: group.title, group })),
    { key: 'directories', title: 'Directories' },
    { key: 'integrations', title: 'Integrations' },
    { key: 'review', title: 'Review' }
  ];
  const step = steps[currentStep];

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
            h('p', { className: 'text-sm text-gray-600 dark:text-gray-400' }, 'Set up your ED2K and BitTorrent clients with optional integrations')
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
    const passwordErrors = formData.server.auth.enabled && debouncedAuthPassword
      ? validatePassword(debouncedAuthPassword)
      : [];
    const passwordMismatch = formData.server.auth.enabled && debouncedAuthPassword && debouncedPasswordConfirm
      && debouncedAuthPassword !== debouncedPasswordConfirm;

    return h('div', {},
      h('h2', { className: 'text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2' }, 'Server & Security'),
      h('p', { className: 'text-gray-600 dark:text-gray-400 mb-6' }, 'Configure server binding and protect your web interface with password authentication'),

      h(ConfigField, {
        label: 'Bind Address',
        description: 'Network interface to listen on. Use 127.0.0.1 to restrict to localhost only.',
        fromEnv: meta?.fromEnv.host
      },
        h(Select, {
          value: formData.server.host || '0.0.0.0',
          onChange: (e) => updateField('server', 'host', e.target.value),
          options: interfaces.some(i => i.value === (formData.server.host || '0.0.0.0'))
            ? interfaces
            : [...interfaces, { value: formData.server.host, label: `Custom (${formData.server.host})` }],
          disabled: meta?.fromEnv.host
        })
      ),

      h('hr', { className: 'my-6 border-gray-200 dark:border-gray-700' }),

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
        // Admin username field
        h(ConfigField, {
          label: 'Admin Username',
          description: 'Username for the administrator account (3-32 characters, alphanumeric and underscore only)',
          fromEnv: meta?.fromEnv.serverAuthAdminUsername
        },
          h('input', {
            type: 'text',
            value: formData.server.auth.adminUsername || 'admin',
            onChange: (e) => {
              updateNestedField('server', 'auth', 'adminUsername', e.target.value);
              setSecurityValidationError(null);
            },
            className: 'appearance-none block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white text-sm transition-colors',
            placeholder: 'admin',
            pattern: '[a-zA-Z0-9_]{3,32}',
            title: '3-32 characters: letters, numbers, underscore'
          })
        ),

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
                h('li', {}, 'Contains at least one special character')
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

          // Real-time validation feedback (debounced)
          debouncedAuthPassword && h('div', {},
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

            passwordErrors.length === 0 && !passwordMismatch && debouncedPasswordConfirm && h(AlertBox, { type: 'success' },
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

  const ClientsStep = ({ group }) => {
    const enabledTypes = group.types.filter(type => formData[type]?.enabled);
    const hasMagnetClient = enabledTypes.some(type => (typeCaps(type).linkSchemes || []).includes(MAGNET_SCHEME));
    const canTest = enabledTypes.length > 0 && enabledTypes.every(type =>
      missingRequiredFields(type, formData[type], (field) => wizardFromEnv(meta, type, field)).length === 0);

    return h('div', {},
      h('h2', { className: 'text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2' }, group.title),
      h('p', { className: 'text-gray-600 dark:text-gray-400 mb-6' }, 'Enable the clients you use. Several can run at the same time.'),

      isDocker && h(AlertBox, { type: 'info', className: 'mb-6' },
        h('p', {}, 'You are running in Docker. If a client runs on your host machine, use ', h('code', { className: 'bg-white dark:bg-gray-800 px-1 rounded' }, 'host.docker.internal'), ' as the hostname. If it runs in another container, use that container\'s name.')
      ),

      ...group.types.map(type => h('div', { key: type, className: 'bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 mb-6' },
        h('h3', { className: 'text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4' }, TYPE_LABELS[type]),

        h(EnableToggle, {
          label: `Enable ${TYPE_LABELS[type]}`,
          description: TYPE_DESCRIPTIONS[type],
          enabled: !!formData[type]?.enabled,
          onChange: (enabled) => updateField(type, 'enabled', enabled)
        }),

        formData[type]?.enabled && h('div', { className: 'mt-4 space-y-4' },
          h(ClientFieldsRenderer, {
            type,
            fields: CLIENT_FIELDS[type],
            values: formData[type],
            onFieldChange: (field, value) => updateField(type, field, value),
            isFieldFromEnv: (field) => wizardFromEnv(meta, type, field),
            isEnabled: true
          }),

          clientTestResults[type] && h(TestResultIndicator, {
            result: clientTestResults[type],
            label: `${TYPE_LABELS[type]} Connection Test`
          })
        )
      )),

      enabledTypes.length > 0 && h('div', { className: 'mb-6' },
        h(TestButton, { onClick: handleTestCurrentStep, loading: isTesting, disabled: !canTest }, 'Test Connections')
      ),

      // Prowlarr hands over magnets, so it sits with a client that takes them
      hasMagnetClient && h('div', { className: 'bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 mb-6' },
        h('h3', { className: 'text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4' }, 'Prowlarr (Torrent Search)'),
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
      ),

      enabledTypes.length === 0 && h(AlertBox, { type: 'info', className: 'mt-4' },
        h('p', {}, 'These clients are optional. At least one download client must be enabled.')
      ),

      stepValidationError && h(AlertBox, { type: 'error', className: 'mt-4' },
        h('p', {}, stepValidationError)
      )
    );
  };

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
    stepValidationError && h(AlertBox, { type: 'error', className: 'mt-4' },
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

      // *arr integration info, when an enabled client serves it
      CLIENT_TYPES.some(type => formData[type]?.enabled && typeCaps(type).arrIntegration) && h(IntegrationConfigInfo, {
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
      stepValidationError && h(AlertBox, { type: 'error', className: 'mt-4' },
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
        h('p', { className: 'text-sm text-gray-600 dark:text-gray-400' }, `Bind Address: ${formData.server.host || '0.0.0.0'}`),
        h('p', { className: 'text-sm text-gray-600 dark:text-gray-400' }, `Port: ${formData.server.port}`),
        (formData.server.host && formData.server.host !== '0.0.0.0') && h(AlertBox, { type: 'warning', className: 'mt-2' },
          h('p', {}, 'The bind address has been changed from the default. A server restart is required after setup for the new bind address to take effect.')
        )
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

      // Enabled clients: their visible fields, passwords masked
      ...CLIENT_TYPES.filter(type => formData[type]?.enabled).map(type => {
        const values = formData[type];
        const shown = CLIENT_FIELDS[type].filter(f => !f.hideWhen?.(values));
        const text = (f) => f.sensitive ? '********'
          : f.select ? (f.options.find(o => o.value === values[f.field])?.label ?? values[f.field])
          : values[f.field];
        return h('div', { key: type, className: 'bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700' },
          h('h3', { className: 'font-semibold text-gray-900 dark:text-gray-100 mb-2' }, `${TYPE_LABELS[type]} Connection`),
          ...shown.filter(f => !f.toggle && String(values[f.field] ?? '') !== '').map(f =>
            h('p', { key: f.field, className: 'text-sm text-gray-600 dark:text-gray-400' }, `${f.label}: ${text(f)}`)),
          // Toggles that are on by default (category sync, notifications) only when changed
          ...shown.filter(f => f.toggle && !!values[f.field] !== (f.defaultValue === true)).map(f =>
            h('p', { key: f.field, className: 'text-sm text-gray-600 dark:text-gray-400' }, `${f.label}: ${values[f.field] ? 'Enabled' : 'Disabled'}`))
        );
      }),

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
        clientTestResults,
        showDetails: true
      })
    ),

    saveError && h(AlertBox, { type: 'error', className: 'mt-4' },
      h('p', { className: 'font-medium' }, saveError)
    ),

    isSaving && h(AlertBox, { type: 'success', className: 'mt-4' },
      h('div', {},
        h('p', { className: 'flex items-center gap-2' },
          h(LoadingSpinner, { size: 20 }),
          'Saving configuration and initializing services...'
        ),
        (formData.server.host && formData.server.host !== '0.0.0.0') && h('p', { className: 'mt-2 font-medium' },
          `Restart the server for the bind address (${formData.server.host}) to take effect.`
        )
      )
    )
  );

  const stepComponents = { welcome: WelcomeStep, security: SecurityStep, directories: DirectoriesStep, integrations: IntegrationsStep, review: ReviewStep };
  const renderStep = () => step.group ? ClientsStep({ group: step.group }) : stepComponents[step.key]();

  return h('div', { className: 'min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4' },
    h('div', { className: 'max-w-3xl mx-auto' },
      // Progress indicator
      h('div', { className: 'mb-8' },
        h('div', { className: 'flex items-center' },
          steps.map(({ title }, idx) => [
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
              }, title)
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
        renderStep()
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
