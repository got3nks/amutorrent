/**
 * ClientInstanceModal Component
 *
 * Modal for adding/editing client instances.
 * Step 1: Select client type (when adding)
 * Step 2: Configure client fields
 * Includes "Test & Save" flow that tests connection before saving.
 */

import React from 'https://esm.sh/react@18.2.0';
import { Icon, AlertBox, Portal } from '../common/index.js';
import ClientIcon from '../common/ClientIcon.js';
import ConfigField from './ConfigField.js';
import EnableToggle from './EnableToggle.js';
import TestResultIndicator from './TestResultIndicator.js';
import {
  TYPE_LABELS,
  CLIENT_FIELDS,
  TYPE_DEFAULTS,
  ClientFieldsRenderer
} from './clientFields.js';

// TYPE_LABELS and CLIENT_FIELDS are re-exported at the bottom of the file
// so the existing `ClientInstanceCard` import path keeps working without any
// migration.

const { createElement: h, useState, useEffect } = React;

// (Field schema and factories moved to ./clientFields.js so both this modal
// and the SetupWizard consume the same source of truth.)

const INSTANCE_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#e67e22', '#1abc9c', '#e84393', '#6c5ce7', '#00cec9', '#fd79a8'];

const TYPE_DESCRIPTIONS = {
  amule: 'ED2K / Kademlia downloads',
  rtorrent: 'BitTorrent via XML-RPC / SCGI',
  qbittorrent: 'BitTorrent via WebUI API',
  deluge: 'BitTorrent via WebUI JSON-RPC',
  transmission: 'BitTorrent via HTTP RPC'
};

/**
 * ClientTypeSelector - Grid of client type cards for step 1
 */
const ClientTypeSelector = ({ onSelect }) => {
  return h('div', { className: 'grid grid-cols-2 sm:grid-cols-4 gap-3' },
    Object.entries(TYPE_LABELS).map(([type, label]) =>
      h('button', {
        key: type,
        onClick: () => onSelect(type),
        className: 'flex flex-col items-center gap-2 p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors'
      },
        h(ClientIcon, { client: type, size: 32 }),
        h('span', { className: 'text-sm font-medium text-gray-900 dark:text-gray-100' }, label),
        h('span', { className: 'text-xs text-gray-500 dark:text-gray-400' }, TYPE_DESCRIPTIONS[type])
      )
    )
  );
};

/**
 * ClientInstanceModal component
 * @param {boolean} isOpen - Whether modal is visible
 * @param {function} onClose - Called when modal should close
 * @param {function} onSave - Called with client data when saving
 * @param {function} onTest - Called with client data, returns { success, message, ... }
 * @param {Object|null} editClient - Client to edit (with _index), or null for new
 * @param {boolean} isDocker - Whether running in Docker
 * @param {string[]} existingNames - Names of existing client instances (for dedup)
 * @param {string[]} existingColors - Colors of existing client instances (for auto-assign)
 */
const ClientInstanceModal = ({ isOpen, onClose, onSave, onTest, editClient = null, isDocker, existingNames = [], existingColors = [] }) => {
  const [step, setStep] = useState(1);
  const [formState, setFormState] = useState({});
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      if (editClient) {
        setStep(2);
        setFormState({ ...editClient });
      } else {
        setStep(1);
        setFormState({});
      }
      setTestResult(null);
      setTesting(false);
    }
  }, [isOpen, editClient]);

  const typeLabel = TYPE_LABELS[formState.type] || formState.type || '';
  const fields = CLIENT_FIELDS[formState.type] || [];
  const isEnabled = formState.enabled !== false;

  // Helper to check if a field value comes from environment
  // Uses per-instance _fromEnv metadata from the server (keyed by field name)
  const isFieldFromEnv = (field) => {
    return editClient?._fromEnv?.[field] || false;
  };

  const canTest = isEnabled && (() => {
    if (formState.type === 'rtorrent' && formState.mode === 'scgi-socket') {
      return !!formState.socketPath;
    }
    if (!formState.host || !formState.port) return false;
    if (formState.type === 'amule' && !formState.password && !isFieldFromEnv('password')) return false;
    return true;
  })();

  const handleTypeSelect = (type) => {
    const baseName = TYPE_LABELS[type];
    let name = baseName;
    if (existingNames.includes(name)) {
      let n = 2;
      while (existingNames.includes(`${baseName} ${n}`)) n++;
      name = `${baseName} ${n}`;
    }
    const defaults = { ...TYPE_DEFAULTS[type] };
    if (isDocker && defaults.host === '127.0.0.1') {
      defaults.host = 'host.docker.internal';
    }
    setFormState({
      type,
      name,
      enabled: true,
      ...defaults
    });
    setStep(2);
  };

  const handleFieldChange = (field, value) => {
    setFormState(prev => ({ ...prev, [field]: value }));
    setTestResult(null);
  };

  const handleBack = () => {
    if (editClient) {
      onClose();
    } else {
      setStep(1);
      setTestResult(null);
    }
  };

  const handleTestAndSave = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await onTest(formState);
      setTestResult(result);
      if (result && result.success) {
        try {
          await onSave(formState);
        } catch (err) {
          setTestResult({ success: false, message: `Save failed: ${err.message}` });
        }
      }
    } catch (err) {
      setTestResult({ success: false, message: err.message });
    } finally {
      setTesting(false);
    }
  };

  if (!isOpen) return null;

  return h(Portal, null,
    h('div', {
      className: 'fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/50',
      onClick: (e) => e.target === e.currentTarget && onClose()
    },
    h('div', {
      className: `${step === 2 ? 'modal-full ' : ''}w-full max-w-lg bg-white dark:bg-gray-800 rounded-lg shadow-xl max-h-[85vh] sm:max-h-[90vh] flex flex-col overflow-hidden`
    },
      // Header
      h('div', { className: 'flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700' },
        h('div', { className: 'flex items-center gap-3' },
          step === 2 && !editClient && h('button', {
            onClick: handleBack,
            className: 'p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          },
            h(Icon, { name: 'chevronLeft', size: 20 })
          ),
          h('h2', { className: 'text-lg font-semibold text-gray-900 dark:text-gray-100' },
            editClient
              ? `Edit ${editClient.name || typeLabel}`
              : step === 1
                ? 'Add Download Client'
                : `Configure ${typeLabel}`
          )
        ),
        h('button', {
          onClick: onClose,
          className: 'p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
        },
          h(Icon, { name: 'x', size: 20 })
        )
      ),

      // Content
      h('div', { className: 'flex-1 overflow-y-auto p-3 sm:p-4' },
        step === 1 && h(ClientTypeSelector, { onSelect: handleTypeSelect }),
        step === 2 && h('div', { className: 'space-y-4' },
          // Enable toggle
          h(EnableToggle, {
            enabled: isEnabled,
            onChange: (value) => handleFieldChange('enabled', value),
            label: 'Enable client'
          }),

          // Instance name
          h(ConfigField, {
            label: 'Instance Name',
            value: formState.name || '',
            onChange: (value) => handleFieldChange('name', value),
            placeholder: `My ${typeLabel}`,
            disabled: testing
          }),

          // Color picker — hidden until user clicks "Set color", avoids misleading default
          h(ConfigField, {
            label: 'Color',
            description: 'Optional color for visual identification'
          },
            formState.color
              ? h('div', { className: 'flex items-center gap-2' },
                  h('input', {
                    type: 'color',
                    value: formState.color,
                    onChange: (e) => handleFieldChange('color', e.target.value),
                    disabled: testing,
                    className: 'w-10 h-10 rounded cursor-pointer border border-gray-300 dark:border-gray-600 disabled:opacity-50'
                  }),
                  h('button', {
                    onClick: () => handleFieldChange('color', null),
                    disabled: testing,
                    className: 'text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-50'
                  }, 'Clear')
                )
              : h('button', {
                  onClick: () => {
                    const usedSet = new Set(existingColors.map(c => c?.toLowerCase()));
                    const available = INSTANCE_COLORS.filter(c => !usedSet.has(c.toLowerCase()));
                    const palette = available.length > 0 ? available : INSTANCE_COLORS;
                    handleFieldChange('color', palette[Math.floor(Math.random() * palette.length)]);
                  },
                  disabled: testing,
                  className: 'text-sm text-left text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 disabled:opacity-50'
                }, 'Set color...')
          ),

          // Instance ID
          h('div', { className: 'mb-4' },
            h('label', { className: 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1' }, 'Instance ID'),
            editClient && formState.id
              ? h('p', { className: 'text-sm text-gray-500 dark:text-gray-400 font-mono' }, formState.id)
              : h('p', { className: 'text-xs text-gray-400 dark:text-gray-500 italic' }, 'Auto-generated after save')
          ),

          // Separator
          h('hr', { className: 'border-gray-200 dark:border-gray-700' }),

          // Docker hint
          isDocker && h(AlertBox, { type: 'info' },
            h('p', {}, 'You are running in Docker. If ', typeLabel, ' is running on your host machine, use ',
              h('code', { className: 'bg-white dark:bg-gray-800 px-1 rounded' }, 'host.docker.internal'),
              ' as the hostname.')
          ),

          // Type-specific fields — shared renderer, same schema the wizard uses.
          h(ClientFieldsRenderer, {
            type: formState.type,
            fields,
            values: formState,
            onFieldChange: handleFieldChange,
            isFieldFromEnv,
            isEnabled,
            disabled: testing
          })
        )
      ),

      // Footer (only in step 2)
      step === 2 && h('div', { className: 'px-6 py-4 border-t border-gray-200 dark:border-gray-700' },
        // Test result inline
        testResult && h('div', { className: 'mb-3' },
          h(TestResultIndicator, {
            result: testResult,
            label: `${formState.name || typeLabel} Connection Test`
          })
        ),

        h('div', { className: 'flex justify-end gap-3' },
          h('button', {
            onClick: onClose,
            disabled: testing,
            className: 'px-4 py-2 text-sm font-medium rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors'
          }, 'Cancel'),
          h('button', {
            onClick: handleTestAndSave,
            disabled: testing || !canTest,
            className: `px-4 py-2 text-sm font-medium rounded-lg text-white disabled:opacity-50 transition-colors ${
              testing || !canTest
                ? 'bg-blue-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            }`
          },
            testing
              ? h('span', { className: 'flex items-center gap-2' },
                  h('span', { className: 'w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin' }),
                  'Testing...'
                )
              : 'Test & Apply'
          )
        )
      )
    )
  ));
};

export { CLIENT_FIELDS, TYPE_LABELS };
export default ClientInstanceModal;
