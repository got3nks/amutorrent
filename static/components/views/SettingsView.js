/**
 * SettingsView Component
 *
 * Full-page settings view for viewing and editing configuration.
 * Uses a `clients` array in formData for multi-instance support.
 * Client instances displayed as compact cards with add/edit modal.
 */

import React from 'https://esm.sh/react@18.2.0';
const { createElement: h, useState, useEffect, useCallback } = React;

import { useConfig } from '../../hooks/index.js';
import { useSettingsFormData } from '../../hooks/useSettingsFormData.js';
import { useClientManagement } from '../../hooks/useClientManagement.js';
import { useAppState } from '../../contexts/AppStateContext.js';
import { useStaticData } from '../../contexts/StaticDataContext.js';
import { LoadingSpinner, AlertBox, IconButton, Input, Select, Button, Icon, Portal } from '../common/index.js';
import DirectoryBrowserModal from '../modals/DirectoryBrowserModal.js';
import { TYPE_LABELS } from '../settings/ClientInstanceModal.js';
import {
  ConfigSection,
  ConfigField,
  TestButton,
  TestResultIndicator,
  PasswordField,
  EnableToggle,
  TestSummary,
  IntegrationConfigInfo,
  ClientInstanceCard,
  ClientInstanceModal,
  UserManagement
} from '../settings/index.js';
import { useAuth } from '../../contexts/AuthContext.js';
import { CAPABILITY_LABELS, CAPABILITY_GROUPS, PRESETS, SSO_DEFAULT_CAPABILITIES, detectPreset } from '../../utils/capabilities.js';
import { hasTestErrors as checkTestErrors, checkResultsForErrors } from '../../utils/testHelpers.js';
import { VIEW_TITLE_STYLES } from '../../utils/index.js';

/**
 * SettingsView component
 */
const SettingsView = () => {
  const { setAppCurrentView } = useAppState();
  const { instances } = useStaticData();
  const { authEnabled: authIsActive, username: currentUsername } = useAuth();
  const onClose = () => setAppCurrentView('home');

  const {
    currentConfig,
    configStatus,
    testResults,
    loading,
    error,
    fetchCurrent,
    fetchStatus,
    fetchInterfaces,
    testConfig,
    saveConfig,
    clearTestResults,
    clearError
  } = useConfig();

  // Form state management
  const {
    formData, setFormData,
    hasChanges, setHasChanges,
    saveError, setSaveError,
    saveSuccess, setSaveSuccess,
    buildFormData, getUnmaskedConfig,
    updateField, updateNestedField, updateTrustedProxy
  } = useSettingsFormData({ currentConfig, clearTestResults });

  // View-local state
  const [isTesting, setIsTesting] = useState(false);
  const [scriptTestResult, setScriptTestResult] = useState(null);
  const [openSections, setOpenSections] = useState({
    server: false, users: false, clients: false,
    integrations: false, directories: false, history: false, eventScripting: false
  });
  const closeAllSections = () => setOpenSections({
    server: false, users: false, clients: false,
    integrations: false, directories: false, history: false, eventScripting: false
  });
  // Accordion toggle: opening one section closes all others
  const toggleSection = (key, value) => {
    if (value) {
      setOpenSections(prev => {
        const next = {};
        for (const k of Object.keys(prev)) next[k] = false;
        next[key] = true;
        return next;
      });
    } else {
      setOpenSections(prev => ({ ...prev, [key]: false }));
    }
  };
  const [showScriptBrowser, setShowScriptBrowser] = useState(false);
  const [interfaces, setInterfaces] = useState([{ value: '0.0.0.0', label: 'All Interfaces (0.0.0.0)' }]);

  // Admin API key for *arr integration info (fetched separately)
  const [adminApiKey, setAdminApiKey] = useState(null);
  // User count for badge display
  const [userCount, setUserCount] = useState(null);

  // Client management (CRUD, testing, modal state)
  const {
    clientModal, setClientModal,
    removeConfirm, setRemoveConfirm,
    clientTestResults,
    removeInstance, confirmRemoveInstance,
    handleMoveClient, handleToggleClient, handleEditClient, handleAddClient,
    handleModalTest, handleClientModalSave, handleTestClient,
    testAllClients
  } = useClientManagement({
    formData, setFormData, setSaveError,
    setIsTesting, clearTestResults, testConfig, saveConfig,
    fetchCurrent, buildFormData, getUnmaskedConfig
  });

  // Load current configuration on mount
  useEffect(() => {
    fetchStatus();
    fetchCurrent();
    fetchInterfaces().then(data => { if (data && data.length) setInterfaces(data); });
  }, []);

  // Fetch current admin's API key for *arr integration display
  useEffect(() => {
    if (!authIsActive || !currentUsername) return;
    fetch('/api/users').then(r => r.json()).then(data => {
      if (data.success && data.users) {
        const me = data.users.find(u => u.username === currentUsername);
        if (me?.apiKey) setAdminApiKey(me.apiKey);
        setUserCount(data.users.length);
      }
    }).catch(() => {});
  }, [authIsActive, currentUsername]);

  // Auto-open Download Clients section on client test failure
  useEffect(() => {
    if (Object.keys(clientTestResults).length === 0) return;
    const hasFailure = Object.values(clientTestResults).some(r => r && r.success === false);
    if (hasFailure) {
      setOpenSections(prev => ({ ...prev, clients: true }));
    }
  }, [clientTestResults]);

  // Auto-open sections with non-client test failures
  useEffect(() => {
    if (!testResults || !testResults.results) return;
    const results = testResults.results;
    const updates = {};

    if (results.directories) {
      if ((results.directories.data && !results.directories.data.success) ||
          (results.directories.logs && !results.directories.logs.success)) {
        updates.directories = true;
      }
    }
    if ((results.sonarr && results.sonarr.success === false) ||
        (results.radarr && results.radarr.success === false)) {
      updates.integrations = true;
    }
    if (results.prowlarr && results.prowlarr.success === false) {
      updates.clients = true;
    }

    if (Object.keys(updates).length > 0) {
      setOpenSections(prev => ({ ...prev, ...updates }));
    }
  }, [testResults]);

  // ==========================================================================
  // TEST HANDLERS
  // ==========================================================================

  // Factory for integration test handlers (directories, sonarr, radarr, prowlarr)
  const makeTestHandler = (key, getPayload) => async () => {
    if (!formData) return;
    setIsTesting(true);
    try {
      const unmasked = getUnmaskedConfig(formData);
      await testConfig({ [key]: getPayload(unmasked) });
    } catch (err) {
      // Error is handled by useConfig
    } finally {
      setIsTesting(false);
    }
  };

  const handleTestDirectories = makeTestHandler('directories', c => c.directories);
  const handleTestSonarr      = makeTestHandler('sonarr',      c => c.integrations.sonarr);
  const handleTestRadarr      = makeTestHandler('radarr',      c => c.integrations.radarr);
  const handleTestProwlarr    = makeTestHandler('prowlarr',    c => c.integrations.prowlarr);

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

  // Build non-client test payload (directories + enabled integrations)
  const buildNonClientPayload = (unmasked) => {
    const payload = { directories: unmasked.directories };
    if (unmasked.integrations?.sonarr?.enabled) payload.sonarr = unmasked.integrations.sonarr;
    if (unmasked.integrations?.radarr?.enabled) payload.radarr = unmasked.integrations.radarr;
    if (unmasked.integrations?.prowlarr?.enabled) payload.prowlarr = unmasked.integrations.prowlarr;
    return payload;
  };

  // Test all — tests each enabled client instance individually, then non-client items
  const handleTestAll = async () => {
    if (!formData) return;
    closeAllSections();
    setIsTesting(true);
    try {
      const unmasked = getUnmaskedConfig(formData);
      await testAllClients(unmasked);
      await testConfig(buildNonClientPayload(unmasked));
    } catch (err) {
      // Error is handled by useConfig
    } finally {
      setIsTesting(false);
    }
  };

  // ==========================================================================
  // SAVE / CANCEL
  // ==========================================================================

  // Check if there are any test errors
  const hasTestErrors = () => checkTestErrors(testResults, clientTestResults);

  // Save configuration
  const handleSave = async () => {
    if (!formData) return;
    closeAllSections();

    setSaveError(null);
    setSaveSuccess(false);
    clearError();

    // Cross-validation: at least one client must be enabled
    if (!formData.clients.some(c => c.enabled !== false)) {
      setSaveError('At least one download client must be enabled.');
      return;
    }

    // Check if we have complete test results
    const allClientsTested = formData.clients.every((c, i) =>
      c.enabled === false || clientTestResults[i] !== undefined
    );
    const nonClientsTested = testResults && testResults.results;

    if (!allClientsTested || !nonClientsTested) {
      // Run all tests before saving
      setIsTesting(true);

      const unmasked = getUnmaskedConfig(formData);
      const newClientResults = await testAllClients(unmasked);

      let nonClientData;
      try {
        nonClientData = await testConfig(buildNonClientPayload(unmasked));
      } catch (err) {
        setSaveError('Configuration test failed. Please review the errors and fix them before saving.');
        setIsTesting(false);
        return;
      }
      setIsTesting(false);

      // Check directly from values (not state, which may not be updated yet)
      if (checkResultsForErrors(nonClientData, newClientResults)) {
        setSaveError('Configuration test failed. Please fix the errors and click Save Changes again.');
        return;
      }
    } else {
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

      setTimeout(() => {
        setSaveSuccess(false);
      }, 5000);
    } catch (err) {
      setSaveError(err.message);
      // Auto-open User Management section if the error is about missing admin accounts
      if (err.message?.includes('admin') && err.message?.includes('User Management')) {
        toggleSection('users', true);
      }
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


  // Show loading state when formData hasn't been initialized yet
  if (!formData) {
    if (error) {
      return h('div', { className: 'p-4' },
        h('p', { className: 'text-red-600 dark:text-red-400' }, 'Failed to load configuration: ', error)
      );
    }
    return h('div', { className: 'flex items-center justify-center h-64' },
      h(LoadingSpinner, { text: 'Loading configuration...' })
    );
  }

  const isDocker = configStatus?.isDocker;
  const meta = currentConfig?._meta;

  // Check if any BitTorrent client exists (for Prowlarr section)
  const hasAnyBittorrent = Object.values(instances).some(inst => inst.networkType === 'bittorrent');

  // Badge helper
  const pill = (text) => h('span', {
    className: 'text-xs font-medium px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200'
  }, text);

  // Compute badges
  const authEnabled = formData.server.auth?.enabled || false;
  const ssoEnabled = formData.server?.auth?.trustedProxy?.enabled || false;
  const serverBadge = h(React.Fragment, {},
    pill(authEnabled ? 'Auth' : 'No Auth'),
    authEnabled && ssoEnabled && pill('SSO')
  );

  const enabledClientCount = formData.clients.filter(c => c.enabled !== false).length;
  const prowlarrEnabled = formData.integrations.prowlarr?.enabled;
  const clientsBadge = h(React.Fragment, {},
    pill(`${enabledClientCount} client${enabledClientCount !== 1 ? 's' : ''}`),
    prowlarrEnabled && pill('Prowlarr')
  );

  const enabledArrs = [
    formData.integrations.sonarr?.enabled && 'Sonarr',
    formData.integrations.radarr?.enabled && 'Radarr'
  ].filter(Boolean);
  const arrBadge = enabledArrs.length > 0 ? pill(enabledArrs.join(', ')) : null;

  const historyEnabled = formData.history?.enabled ?? true;
  const historyBadge = pill(historyEnabled ? 'Enabled' : 'Disabled');

  const scriptEnabled = formData.eventScripting?.enabled || false;
  const scriptBadge = scriptEnabled ? pill('Active') : null;

  const usersBadge = userCount != null ? pill(`${userCount} user${userCount !== 1 ? 's' : ''}`) : null;

  return h('div', { className: 'w-full lg:w-5/6 mx-auto px-2 py-4 sm:px-4' },
    // Interaction overlay while testing/saving
    (isTesting || loading) && h(Portal, null,
      h('div', {
        className: 'fixed inset-0 bg-white/30 dark:bg-gray-900/30 z-50 flex items-center justify-center'
      },
        h(LoadingSpinner, { size: 'lg' })
      )
    ),
    // Server & Authentication Configuration
    h(ConfigSection, {
      title: 'Server & Authentication',
      description: 'HTTP server and web interface access control',
      defaultOpen: false,
      open: openSections.server,
      onToggle: (value) => toggleSection('server', value),
      icon: 'lock',

      badge: serverBadge
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
      h(AlertBox, { type: 'warning' },
        h('p', {}, 'Changing the port or bind address requires a server restart to take effect.',
          isDocker ? ' Update your Docker port mapping and restart the container.' : '')
      ),

      h('hr', { className: 'my-4 border-gray-200 dark:border-gray-700' }),

      h(EnableToggle, {
        label: 'Enable Authentication',
        description: 'Require password to access the web interface (recommended for network-accessible installations)',
        enabled: formData.server.auth?.enabled || false,
        onChange: (enabled) => {
          updateNestedField('server', 'auth', 'enabled', enabled);
        }
      }),

      // Trusted Proxy SSO
      formData.server.auth?.enabled && h('div', { className: 'mt-4' },
        h('hr', { className: 'my-4 border-gray-200 dark:border-gray-700' }),

        h(EnableToggle, {
          label: 'Enable Trusted Proxy Authentication',
          description: 'Authenticate users via reverse proxy headers (e.g., Authelia, Authentik, Nginx auth_request)',
          enabled: formData.server?.auth?.trustedProxy?.enabled || false,
          onChange: (enabled) => updateTrustedProxy('enabled', enabled)
        }),

        formData.server?.auth?.trustedProxy?.enabled && h('div', { className: 'mt-4 space-y-4' },
          h(EnableToggle, {
            label: 'Auto-Provision Users',
            description: 'Automatically create user accounts for new usernames from the proxy header',
            enabled: formData.server?.auth?.trustedProxy?.autoProvision || false,
            onChange: (enabled) => updateTrustedProxy('autoProvision', enabled)
          }),

          h(ConfigField, {
            label: 'Username Header',
            description: 'HTTP header containing the authenticated username from the reverse proxy',
            value: formData.server?.auth?.trustedProxy?.usernameHeader || '',
            onChange: (value) => updateTrustedProxy('usernameHeader', value),
            placeholder: 'X-Remote-User',
            required: true
          }),

          // SSO Default Capabilities picker (shown when auto-provision is enabled)
          formData.server?.auth?.trustedProxy?.autoProvision && (() => {
            const currentCaps = formData.server?.auth?.trustedProxy?.defaultCapabilities || SSO_DEFAULT_CAPABILITIES;
            const currentPreset = detectPreset(currentCaps);

            const setCaps = (caps) => updateTrustedProxy('defaultCapabilities', caps);

            const handlePreset = (p) => {
              if (p === 'full') setCaps(PRESETS.full.slice());
              else if (p === 'readonly') setCaps(PRESETS.readonly.slice());
            };

            const toggleCap = (cap) => {
              let next;
              if (currentCaps.includes(cap)) {
                next = currentCaps.filter(c => c !== cap);
                if (cap === 'view_all_downloads') next = next.filter(c => c !== 'edit_all_downloads');
              } else {
                next = [...currentCaps, cap];
                if (cap === 'edit_all_downloads' && !next.includes('view_all_downloads')) next.push('view_all_downloads');
              }
              setCaps(next);
            };

            return h('div', {},
              h('div', { className: 'flex items-center justify-between mb-2' },
                h('label', { className: 'block text-sm font-medium text-gray-700 dark:text-gray-300' }, 'Default Capabilities for New SSO Users'),
                h('div', { className: 'flex gap-1' },
                  h('button', {
                    type: 'button',
                    onClick: () => handlePreset('full'),
                    className: `px-2 py-0.5 text-xs rounded font-medium transition-colors ${currentPreset === 'full' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'}`
                  }, 'Full'),
                  h('button', {
                    type: 'button',
                    onClick: () => handlePreset('readonly'),
                    className: `px-2 py-0.5 text-xs rounded font-medium transition-colors ${currentPreset === 'readonly' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'}`
                  }, 'Read-only'),
                  h('span', {
                    className: `px-2 py-0.5 text-xs rounded font-medium ${currentPreset === 'custom' ? 'bg-blue-600 text-white' : 'text-gray-400'}`
                  }, 'Custom')
                )
              ),
              h('div', { className: 'space-y-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3' },
                ...CAPABILITY_GROUPS.map(group =>
                  h('div', { key: group.label },
                    h('p', { className: 'text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1' }, group.label),
                    h('div', { className: 'grid grid-cols-2 gap-x-4 gap-y-1' },
                      ...group.caps.map(cap =>
                        h('label', {
                          key: cap,
                          className: 'flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer'
                        },
                          h('input', {
                            type: 'checkbox',
                            checked: currentCaps.includes(cap),
                            onChange: () => toggleCap(cap),
                            className: 'rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500'
                          }),
                          CAPABILITY_LABELS[cap] || cap
                        )
                      )
                    )
                  )
                )
              )
            );
          })(),

          h(AlertBox, { type: 'info' },
            h('div', {},
              h('p', { className: 'font-medium mb-1' }, 'How Trusted Proxy SSO works:'),
              h('ul', { className: 'list-disc list-inside space-y-1' },
                h('li', {}, 'Your reverse proxy authenticates users and sets a username header on each request'),
                h('li', {}, 'This app reads the header and creates a session with the matching user account'),
                h('li', {}, 'If auto-provision is enabled, new users are created automatically with the capabilities selected above'),
                h('li', {}, 'Users can still log in with a password if one is set for their account')
              )
            )
          )
        )
      ),

      !formData.server.auth?.enabled && h(AlertBox, { type: 'warning', className: 'mt-4' },
        h('p', {}, 'Authentication is disabled. Your web interface will be accessible without a password. This is not recommended for network-accessible installations.')
      )
    ),

    // User Management (shown when auth is enabled)
    formData.server.auth?.enabled && h(ConfigSection, {
      title: 'User Management',
      description: 'Manage user accounts and permissions',
      defaultOpen: false,
      open: openSections.users,
      onToggle: (value) => toggleSection('users', value),
      icon: 'user',

      badge: usersBadge
    },
      h(UserManagement, { currentUsername, onApiKeyChange: setAdminApiKey })
    ),

    // Download Clients — unified section with card grid
    h(ConfigSection, {
      title: 'Download Clients',
      description: 'Configure download client connections',
      defaultOpen: false,
      open: openSections.clients,
      onToggle: (value) => toggleSection('clients', value),
      warning: Object.values(instances).some(i => !i.connected && i.error),
      icon: 'download',

      badge: clientsBadge
    },
      // Card grid
      h('div', { className: 'grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4' },
        // Render each client as a compact card
        formData.clients.map((client, clientIndex) =>
          h(ClientInstanceCard, {
            key: clientIndex,
            client,
            clientIndex,
            totalClients: formData.clients.length,
            onMove: handleMoveClient,
            onEdit: handleEditClient,
            onToggle: handleToggleClient,
            onRemove: removeInstance,
            onTest: handleTestClient,
            isTesting,
            testResult: clientTestResults[clientIndex],
            instanceStatus: instances[client.id] || null
          })
        ),

        // "Add Client" dashed-border button card
        h('button', {
          onClick: handleAddClient,
          className: 'border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 flex flex-col items-center justify-center gap-2 text-gray-500 dark:text-gray-400 hover:border-blue-500 dark:hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors md:min-h-[160px]'
        },
          h(Icon, { name: 'plus', size: 24 }),
          h('span', { className: 'text-sm font-medium' }, 'Add Client')
        )
      ),

      // No clients hint
      formData.clients.length === 0 && h(AlertBox, { type: 'info', className: 'mb-4' },
        h('p', {}, 'No download clients configured. Click "Add Client" to add one.')
      ),

      // Prowlarr Integration
      !hasAnyBittorrent && h(AlertBox, { type: 'info', className: 'mt-4' },
        h('p', {}, 'Add a BitTorrent client to enable Prowlarr integration.')
      ),
      hasAnyBittorrent && h('div', { className: 'mt-4 pt-4 border-t border-gray-200 dark:border-gray-700' },
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

    // Client Instance Modal
    h(ClientInstanceModal, {
      isOpen: clientModal.open,
      onClose: () => setClientModal({ open: false, client: null }),
      onSave: handleClientModalSave,
      onTest: handleModalTest,
      editClient: clientModal.client,
      isDocker,
      existingNames: formData.clients.map(c => c.name),
      existingColors: formData.clients.map(c => c.color).filter(Boolean)
    }),

    // Remove Client Confirmation Modal
    removeConfirm.open && (() => {
      const client = formData.clients[removeConfirm.clientIndex];
      const clientLabel = client?.name || TYPE_LABELS[client?.type] || 'this client';
      return h('div', {
        className: 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50',
        onClick: () => setRemoveConfirm({ open: false, clientIndex: null })
      },
        h('div', {
          className: 'w-full max-w-md bg-white dark:bg-gray-800 rounded-xl shadow-xl overflow-hidden',
          onClick: (e) => e.stopPropagation()
        },
          h('div', { className: 'px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center gap-3' },
            h('div', { className: 'flex-shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center' },
              h(Icon, { name: 'trash', size: 20, className: 'text-red-600 dark:text-red-400' })
            ),
            h('h2', { className: 'text-lg font-semibold text-gray-900 dark:text-gray-100' }, `Remove ${clientLabel}?`)
          ),
          h('div', { className: 'px-6 py-4 space-y-3' },
            h('p', { className: 'text-sm text-gray-700 dark:text-gray-300' },
              'Are you sure you want to remove this download client configuration?'
            ),
            h(AlertBox, { type: 'warning' },
              h('p', { className: 'text-sm' },
                'Download history and metrics data associated with this instance will become orphaned and will no longer appear in the UI. This cannot be undone.'
              )
            )
          ),
          h('div', { className: 'px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3' },
            h('button', {
              onClick: () => setRemoveConfirm({ open: false, clientIndex: null }),
              className: 'px-4 py-2 text-sm font-medium rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors'
            }, 'Cancel'),
            h('button', {
              onClick: confirmRemoveInstance,
              className: 'px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors'
            }, 'Remove')
          )
        )
      );
    })(),

    // *arr Integrations
    h(ConfigSection, {
      title: '*arr Integrations',
      description: 'Torznab and qBittorrent-compatible API for ED2K, Sonarr and Radarr schedulers',
      defaultOpen: false,
      open: openSections.integrations,
      onToggle: (value) => toggleSection('integrations', value),
      icon: 'share',

      badge: arrBadge
    },
      // aMule instance selector (only when 2+ aMule clients configured)
      (() => {
        const amuleClients = formData.clients.filter(c => c.type === 'amule' && c.enabled !== false);
        return amuleClients.length > 1 && h('div', { className: 'mb-6' },
          h(ConfigField, {
            label: 'aMule Instance for *arr',
            description: 'Which aMule instance to use for Torznab API and qBittorrent-compatible API for *arr apps'
          },
            h('select', {
              value: formData.integrations.amuleInstanceId || '',
              onChange: (e) => {
                const val = e.target.value || null;
                setFormData(prev => ({
                  ...prev,
                  integrations: { ...prev.integrations, amuleInstanceId: val }
                }));
                setHasChanges(true);
                setSaveSuccess(false);
                clearTestResults();
              },
              className: 'w-full text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded px-3 py-2'
            },
              h('option', { value: '' }, 'Auto (first connected)'),
              ...amuleClients.map(c => {
                const id = c.id || `${c.type}-${c.host}-${c.port}`;
                return h('option', { key: id, value: id }, c.name || `aMule (${c.host}:${c.port})`);
              })
            )
          )
        );
      })(),

      h(IntegrationConfigInfo, {
        title: '*arr Integration Configuration',
        port: formData.server.port,
        authEnabled: formData.server.auth?.enabled,
        amuleEnabled: formData.clients.some(c => c.type === 'amule' && c.enabled !== false),
        apiKey: adminApiKey,
        username: currentUsername,
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

    // Directories Configuration
    h(ConfigSection, {
      title: 'Directories',
      description: 'Data, logs, and GeoIP directories',
      defaultOpen: false,
      open: openSections.directories,
      onToggle: (value) => toggleSection('directories', value),
      icon: 'folder'
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
      onToggle: (value) => toggleSection('history', value),
      icon: 'history',

      badge: historyBadge
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
      onToggle: (value) => toggleSection('eventScripting', value),
      icon: 'zap',

      badge: scriptBadge
    },
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
      clientTestResults,
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
    h('div', { className: 'flex gap-3 mt-6 pb-4' },
      h('button', {
        onClick: handleTestAll,
        disabled: isTesting || loading,
        className: `flex-1 px-3 sm:px-4 py-1.5 sm:py-2 text-sm font-medium rounded-lg
          ${isTesting || loading
            ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
            : 'bg-blue-600 hover:bg-blue-700 text-white'}
          transition-colors`
      }, h('span', { className: 'flex items-center justify-center gap-1.5' },
        h(Icon, { name: 'activity', size: 15 }),
        isTesting ? 'Testing...' : 'Test Configuration'
      )),
      h('button', {
        onClick: handleSave,
        disabled: !hasChanges || loading || hasTestErrors(),
        className: `flex-1 px-3 sm:px-4 py-1.5 sm:py-2 text-sm font-medium rounded-lg
          ${!hasChanges || loading || hasTestErrors()
            ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
            : 'bg-green-600 hover:bg-green-700 text-white'}
          transition-colors`
      }, h('span', { className: 'flex items-center justify-center gap-1.5' },
        h(Icon, { name: 'check', size: 15 }),
        loading ? 'Saving...' : 'Save Changes'
      )),
      h('button', {
        onClick: handleCancel,
        disabled: loading,
        className: 'flex-1 px-3 sm:px-4 py-1.5 sm:py-2 text-sm font-medium rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 transition-colors'
      }, h('span', { className: 'flex items-center justify-center gap-1.5' },
        h(Icon, { name: 'x', size: 15 }),
        'Cancel'
      ))
    ),

  );
};

export default SettingsView;
