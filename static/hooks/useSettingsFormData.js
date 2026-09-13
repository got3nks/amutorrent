/**
 * useSettingsFormData Hook
 *
 * Manages settings form state: initialization from config, field updates,
 * password unmasking, and change tracking.
 */

import { useState, useEffect, useCallback } from 'https://esm.sh/react@18.2.0';

/**
 * Build formData shape from a raw config object
 */
const buildFormData = (cfg) => ({
  clients: (cfg.clients || []).map(c => ({ ...c })),
  server: { ...cfg.server },
  directories: { ...cfg.directories },
  integrations: {
    amuleInstanceId: cfg.integrations?.amuleInstanceId || null,
    sonarr: { ...cfg.integrations.sonarr },
    radarr: { ...cfg.integrations.radarr },
    lidarr: { ...cfg.integrations?.lidarr || { enabled: false, url: '', apiKey: '', searchIntervalHours: 6 } },
    readarr: { ...cfg.integrations?.readarr || { enabled: false, url: '', apiKey: '', searchIntervalHours: 6 } },
    prowlarr: { ...cfg.integrations?.prowlarr || { enabled: false, url: '', apiKey: '' } }
  },
  history: { ...cfg.history },
  eventScripting: { ...cfg.eventScripting || {
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

/**
 * Unmask passwords and strip transient metadata for API calls
 */
const getUnmaskedConfig = (config) => {
  const unmasked = JSON.parse(JSON.stringify(config));

  // Remove masked passwords - server will keep existing values
  if (unmasked.server?.auth?.password === '********') {
    delete unmasked.server.auth.password;
  }
  if (unmasked.integrations?.sonarr?.apiKey === '********') {
    delete unmasked.integrations.sonarr.apiKey;
  }
  if (unmasked.integrations?.radarr?.apiKey === '********') {
    delete unmasked.integrations.radarr.apiKey;
  }
  if (unmasked.integrations?.lidarr?.apiKey === '********') {
    delete unmasked.integrations.lidarr.apiKey;
  }
  if (unmasked.integrations?.readarr?.apiKey === '********') {
    delete unmasked.integrations.readarr.apiKey;
  }
  if (unmasked.integrations?.prowlarr?.apiKey === '********') {
    delete unmasked.integrations.prowlarr.apiKey;
  }

  // Unmask clients array passwords and strip transient metadata
  if (Array.isArray(unmasked.clients)) {
    for (const entry of unmasked.clients) {
      if (entry.password === '********') delete entry.password;
      delete entry._fromEnv;
    }
  }

  // Remove flat client sections — backend rebuilds them from clients array
  delete unmasked.amule;
  delete unmasked.rtorrent;
  delete unmasked.qbittorrent;

  return unmasked;
};

/**
 * @param {Object} options
 * @param {Object} options.currentConfig - From useConfig
 * @param {Function} options.clearTestResults - From useConfig
 */
export const useSettingsFormData = ({ currentConfig, clearTestResults }) => {
  const [formData, setFormData] = useState(null);
  const [originalPasswords, setOriginalPasswords] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Initialize form data when config is loaded
  useEffect(() => {
    if (currentConfig && !formData) {
      setFormData(buildFormData(currentConfig));

      // Store original password values (masked as '********')
      setOriginalPasswords({
        auth: currentConfig.server?.auth?.password || '',
        sonarr: currentConfig.integrations.sonarr.apiKey,
        radarr: currentConfig.integrations.radarr.apiKey,
        lidarr: currentConfig.integrations?.lidarr?.apiKey || '',
        readarr: currentConfig.integrations?.readarr?.apiKey || '',
        prowlarr: currentConfig.integrations?.prowlarr?.apiKey || ''
      });
    }
  }, [currentConfig]);

  // Mark form as changed and clear stale results
  const markChanged = useCallback(() => {
    setHasChanges(true);
    setSaveSuccess(false);
    clearTestResults();
  }, [clearTestResults]);

  // Update field value (e.g., server.port, directories.data)
  const updateField = useCallback((section, field, value) => {
    setFormData(prev => ({
      ...prev,
      [section]: { ...prev[section], [field]: value }
    }));
    markChanged();
  }, [markChanged]);

  // Update nested field value (e.g., integrations.sonarr.apiKey)
  const updateNestedField = useCallback((section, subsection, field, value) => {
    setFormData(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [subsection]: { ...prev[section][subsection], [field]: value }
      }
    }));
    markChanged();
  }, [markChanged]);

  // Update a field inside server.auth.trustedProxy
  const updateTrustedProxy = useCallback((field, value) => {
    setFormData(prev => ({
      ...prev,
      server: {
        ...prev.server,
        auth: {
          ...prev.server?.auth,
          trustedProxy: { ...prev.server?.auth?.trustedProxy, [field]: value }
        }
      }
    }));
    markChanged();
  }, [markChanged]);

  return {
    formData, setFormData,
    originalPasswords,
    hasChanges, setHasChanges,
    saveError, setSaveError,
    saveSuccess, setSaveSuccess,
    buildFormData,
    getUnmaskedConfig,
    updateField,
    updateNestedField,
    updateTrustedProxy
  };
};
