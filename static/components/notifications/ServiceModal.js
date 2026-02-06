/**
 * ServiceModal Component
 *
 * Modal for adding/editing notification services
 * Step 1: Select service type (when adding)
 * Step 2: Configure service fields
 */

import React from 'https://esm.sh/react@18.2.0';
import { Icon, AlertBox } from '../common/index.js';
import { PasswordField, EnableToggle } from '../settings/index.js';
import { getServiceTypeOptions, getServiceSchema, validateServiceConfig } from '../../utils/notificationServiceSchemas.js';

const { createElement: h, useState, useEffect } = React;

/**
 * ServiceTypeSelector - Grid of service type cards
 */
const ServiceTypeSelector = ({ onSelect }) => {
  const serviceTypes = getServiceTypeOptions();

  return h('div', { className: 'grid grid-cols-2 sm:grid-cols-3 gap-3' },
    serviceTypes.map(type =>
      h('button', {
        key: type.value,
        onClick: () => onSelect(type.value),
        className: 'flex flex-col items-center gap-2 p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors'
      },
        h('div', {
          className: 'w-12 h-12 rounded-2xl flex items-center justify-center',
          style: { backgroundColor: type.color }
        },
          type.logo
            ? h('img', { src: type.logo, alt: type.label, className: 'w-7 h-7', style: { filter: 'brightness(0) invert(1)' } })
            : h(Icon, { name: type.icon, size: 24, className: 'text-white' })
        ),
        h('span', { className: 'text-sm font-medium text-gray-900 dark:text-gray-100' }, type.label)
      )
    )
  );
};

/**
 * ServiceConfigForm - Dynamic form based on service type
 */
const ServiceConfigForm = ({ type, name, enabled, config, onChange, schema }) => {
  if (!schema) return null;

  const updateConfig = (key, value) => {
    onChange({ config: { ...config, [key]: value } });
  };

  return h('div', { className: 'space-y-4' },
    // Service name
    h('div', {},
      h('label', { className: 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1' },
        'Service Name'
      ),
      h('input', {
        type: 'text',
        value: name,
        onChange: (e) => onChange({ name: e.target.value }),
        placeholder: `My ${schema.name}`,
        className: 'w-full h-10 px-3 rounded-lg text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
      })
    ),

    // Enabled toggle
    h(EnableToggle, {
      enabled,
      onChange: (value) => onChange({ enabled: value }),
      label: 'Enable Service',
      description: 'Send notifications through this service'
    }),

    // Separator
    h('hr', { className: 'border-gray-200 dark:border-gray-700' }),

    // Dynamic fields based on schema
    ...schema.fields.map(field => {
      if (field.type === 'checkbox') {
        return h('div', { key: field.key, className: 'flex items-center gap-3' },
          h('input', {
            type: 'checkbox',
            id: field.key,
            checked: config[field.key] === true,
            onChange: (e) => updateConfig(field.key, e.target.checked),
            className: 'rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500'
          }),
          h('label', { htmlFor: field.key, className: 'text-sm text-gray-700 dark:text-gray-300' },
            field.label,
            field.helpText && h('span', { className: 'block text-xs text-gray-500 dark:text-gray-400' }, field.helpText)
          )
        );
      }

      return h('div', { key: field.key },
        h('label', { className: 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1' },
          field.label,
          field.required && h('span', { className: 'text-red-500 ml-1' }, '*')
        ),
        field.type === 'password'
          ? h(PasswordField, {
              value: config[field.key] || '',
              onChange: (value) => updateConfig(field.key, value),
              placeholder: field.placeholder
            })
          : h('input', {
              type: field.type || 'text',
              value: config[field.key] || '',
              onChange: (e) => updateConfig(field.key, e.target.value),
              placeholder: field.placeholder,
              className: 'w-full h-10 px-3 rounded-lg text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
            }),
        field.helpText && h('p', { className: 'mt-1 text-xs text-gray-500 dark:text-gray-400' }, field.helpText)
      );
    }),

    // Help link
    schema.helpUrl && h('div', { className: 'pt-2' },
      h('a', {
        href: schema.helpUrl,
        target: '_blank',
        rel: 'noopener noreferrer',
        className: 'inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:underline'
      },
        h(Icon, { name: 'externalLink', size: 14 }),
        'Setup Instructions'
      )
    ),

    // Help text
    schema.helpText && h(AlertBox, { type: 'info' },
      h('p', { className: 'text-sm' }, schema.helpText)
    )
  );
};

/**
 * ServiceModal component
 * @param {boolean} isOpen - Whether modal is visible
 * @param {function} onClose - Called when modal should close
 * @param {function} onSave - Called with service data when saving
 * @param {Object|null} editService - Service to edit, or null for new
 */
const ServiceModal = ({ isOpen, onClose, onSave, editService = null }) => {
  const [step, setStep] = useState(1);
  const [type, setType] = useState('');
  const [name, setName] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [config, setConfig] = useState({});
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      if (editService) {
        // Editing existing service
        setStep(2);
        setType(editService.type);
        setName(editService.name);
        setEnabled(editService.enabled);
        setConfig(editService.config || {});
      } else {
        // Adding new service
        setStep(1);
        setType('');
        setName('');
        setEnabled(true);
        setConfig({});
      }
      setError(null);
    }
  }, [isOpen, editService]);

  const schema = getServiceSchema(type);

  const handleTypeSelect = (selectedType) => {
    setType(selectedType);
    const schema = getServiceSchema(selectedType);
    setName(`My ${schema?.name || selectedType}`);
    setConfig({});
    setStep(2);
  };

  const handleChange = (updates) => {
    if (updates.name !== undefined) setName(updates.name);
    if (updates.enabled !== undefined) setEnabled(updates.enabled);
    if (updates.config !== undefined) setConfig(updates.config);
  };

  const handleBack = () => {
    if (editService) {
      onClose();
    } else {
      setStep(1);
    }
  };

  const handleSave = async () => {
    setError(null);

    // Validate
    if (!name.trim()) {
      setError('Service name is required');
      return;
    }

    const validation = validateServiceConfig(type, config);
    if (!validation.valid) {
      setError(validation.errors.join(', '));
      return;
    }

    setSaving(true);
    try {
      await onSave({
        id: editService?.id,
        name: name.trim(),
        type,
        enabled,
        config
      });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return h('div', {
    className: 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50',
    onClick: (e) => e.target === e.currentTarget && onClose()
  },
    h('div', {
      className: 'w-full max-w-lg bg-white dark:bg-gray-800 rounded-xl shadow-xl overflow-hidden'
    },
      // Header
      h('div', { className: 'flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700' },
        h('div', { className: 'flex items-center gap-3' },
          step === 2 && !editService && h('button', {
            onClick: handleBack,
            className: 'p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          },
            h(Icon, { name: 'chevronLeft', size: 20 })
          ),
          h('h2', { className: 'text-lg font-semibold text-gray-900 dark:text-gray-100' },
            editService
              ? 'Edit Service'
              : step === 1
                ? 'Select Service Type'
                : `Configure ${schema?.name || type}`
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
      h('div', { className: 'px-6 py-4 max-h-[60vh] overflow-y-auto' },
        step === 1 && h(ServiceTypeSelector, { onSelect: handleTypeSelect }),
        step === 2 && h(ServiceConfigForm, {
          type,
          name,
          enabled,
          config,
          onChange: handleChange,
          schema
        }),
        error && h(AlertBox, { type: 'error', className: 'mt-4' },
          h('p', {}, error)
        )
      ),

      // Footer (only in step 2)
      step === 2 && h('div', { className: 'flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700' },
        h('button', {
          onClick: onClose,
          disabled: saving,
          className: 'px-4 py-2 text-sm font-medium rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors'
        }, 'Cancel'),
        h('button', {
          onClick: handleSave,
          disabled: saving,
          className: 'px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors'
        }, saving ? 'Saving...' : editService ? 'Save Changes' : 'Add Service')
      )
    )
  );
};

export default ServiceModal;
