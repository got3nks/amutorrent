/**
 * Client-instance field schema + shared renderer.
 *
 * Single source of truth for the per-client-type field definitions used by
 * both `ClientInstanceModal` (edit an existing instance) and `SetupWizardView`
 * (initial installation flow). Adding a field here makes it show up in both
 * surfaces automatically — no more "did we remember to wire it in both
 * places?" bugs like the one that hit us with the notifications toggle.
 *
 * The renderer is intentionally shape-agnostic at its boundaries:
 *  - `onFieldChange(field, value)` — each surface passes its own thin adapter
 *    that bridges to its native setter (wizard's `updateField(type, field, val)`
 *    vs modal's `handleFieldChange(field, val)`).
 *  - `isFieldFromEnv(field) => bool` — each surface passes its own accessor
 *    over its native `fromEnv` state (wizard's flat prefixed keys vs modal's
 *    per-instance `_fromEnv` object).
 *
 * That keeps the schema and rendering identical while letting each surface
 * keep its native state model.
 */

import React from 'https://esm.sh/react@18.2.0';
import { AlertBox } from '../common/index.js';
import ConfigField from './ConfigField.js';
import PasswordField from './PasswordField.js';
import EnableToggle from './EnableToggle.js';

const { createElement: h } = React;

// Short-form client labels used for badges, buttons, and short descriptions.
export const TYPE_LABELS = {
  amule: 'aMule',
  rtorrent: 'rTorrent',
  qbittorrent: 'qBittorrent',
  deluge: 'Deluge',
  transmission: 'Transmission'
};

// Long-form daemon labels used in field descriptions ("qBittorrent WebUI host
// address"). Kept separate from TYPE_LABELS so short-form usage stays clean.
export const DAEMON_LABELS = {
  amule: 'aMule External Connection (EC)',
  rtorrent: 'rTorrent',
  qbittorrent: 'qBittorrent WebUI',
  deluge: 'Deluge Web UI',
  transmission: 'Transmission RPC'
};

/**
 * Field factories — parameterized by client type + (optional) overrides.
 *
 * Each returns a field-def object; callers pass an `extras` object as the last
 * argument to override any property (typically `hideWhen`, `required`, or
 * `defaultValue`). Kept minimal on purpose: fields whose call site would need
 * three or more property overrides are cleaner inlined than as heavily-
 * parameterized factories.
 */
const F = {
  host: (type, extras = {}) => ({
    field: 'host', label: 'Host',
    description: `${DAEMON_LABELS[type]} host address`,
    placeholder: '127.0.0.1', defaultValue: '127.0.0.1', required: true, ...extras
  }),
  port: (type, port, extras = {}) => ({
    field: 'port', label: 'Port',
    description: `${TYPE_LABELS[type]} port (default: ${port})`,
    placeholder: String(port), defaultValue: port, type: 'number', required: true,
    parseValue: v => parseInt(v, 10) || port, ...extras
  }),
  password: (type, extras = {}) => ({
    field: 'password', label: 'Password',
    description: `${DAEMON_LABELS[type]} password`,
    placeholder: `Enter ${TYPE_LABELS[type]} password`,
    sensitive: true, ...extras
  }),
  useSsl: (type, extras = {}) => ({
    field: 'useSsl', label: 'Use SSL (HTTPS)',
    description: `Connect to ${TYPE_LABELS[type]} using HTTPS`,
    toggle: true, ...extras
  }),
  reverseProxyPath: (example) => ({
    field: 'path', label: 'URL Path (Optional)',
    description: `Base path when behind a reverse proxy (e.g., ${example})`,
    placeholder: 'Leave empty if not using a reverse proxy'
  }),
  categorySync: (extraSentence = '') => ({
    field: 'categorySync', label: 'Category Sync',
    description: `When ON, this instance shares its categories with the central registry and accepts categories pushed from other clients. Turn OFF to keep this instance isolated.${extraSentence ? ' ' + extraSentence : ''}`,
    toggle: true, defaultValue: true
  }),
  notifications: () => ({
    field: 'notifications', label: 'Notifications',
    description: 'When ON, Apprise notifications (downloads added/finished, client availability) fire for events from this instance. Turn OFF to silence this client without touching global notification settings or event scripts.',
    toggle: true, defaultValue: true
  })
};

// Field definitions per client type. defaultValue is the source of truth for
// new instance defaults. Mirrors server/lib/clientMeta.js connectionDefaults.
export const CLIENT_FIELDS = {
  amule: [
    F.host('amule'),
    F.port('amule', 4712),
    // Inlined — three properties (description, placeholder, required) all
    // differ from the F.password template, not worth the override overhead.
    { field: 'password', label: 'Password', description: 'aMule EC password (set in aMule preferences)', placeholder: 'Enter aMule EC password', required: true, sensitive: true },
    { field: 'sharedFilesReloadIntervalHours', label: 'Shared Files Auto-Reload Interval (hours)', description: 'Hours between automatic shared files reload (0 = disabled, default: 3). This makes aMule rescan shared directories periodically.', placeholder: '3', type: 'number', parseValue: v => parseInt(v) || 0, defaultValue: 3 },
    F.categorySync('Useful when foreign categories from BitTorrent clients would create stray directories in aMule.'),
    F.notifications()
  ],
  rtorrent: [
    { field: 'mode', label: 'Connection Mode', description: 'HTTP: Connect via XML-RPC HTTP proxy (nginx/ruTorrent). SCGI: Connect directly to rTorrent via SCGI TCP. SCGI Socket: Connect via Unix domain socket.', select: true, options: [{ value: 'http', label: 'HTTP (XML-RPC proxy)' }, { value: 'scgi', label: 'SCGI (direct TCP)' }, { value: 'scgi-socket', label: 'SCGI (Unix socket)' }], defaultValue: 'http' },
    F.host('rtorrent', { hideWhen: form => (form.mode || 'http') === 'scgi-socket' }),
    F.port('rtorrent', 8000, { hideWhen: form => (form.mode || 'http') === 'scgi-socket' }),
    { field: 'socketPath', label: 'Socket Path', description: 'Path to rTorrent SCGI Unix socket', placeholder: '/path/to/rtorrent.sock', required: true, hideWhen: form => (form.mode || 'http') !== 'scgi-socket' },
    { field: 'path', label: 'XML-RPC Path', description: 'Path for XML-RPC endpoint (default: /RPC2)', placeholder: '/RPC2', defaultValue: '/RPC2', hideWhen: form => (form.mode || 'http') !== 'http' },
    // rTorrent's HTTP basic auth username/password have "Optional" semantics
    // distinct from the daemon's own password field — inlined.
    { field: 'username', label: 'Username (Optional)', description: 'Username for HTTP basic authentication (if required)', placeholder: 'Leave empty if not required', hideWhen: form => (form.mode || 'http') !== 'http' },
    { field: 'password', label: 'Password (Optional)', description: 'Password for HTTP basic authentication (if required)', placeholder: 'Leave empty if not required', sensitive: true, hideWhen: form => (form.mode || 'http') !== 'http' },
    F.useSsl('rtorrent', { hideWhen: form => (form.mode || 'http') !== 'http' }),
    F.categorySync(),
    F.notifications()
  ],
  qbittorrent: [
    F.host('qbittorrent'),
    F.port('qbittorrent', 8080),
    F.reverseProxyPath('/qbittorrent'),
    { field: 'username', label: 'Username', description: 'qBittorrent WebUI username (default: admin)', placeholder: 'admin', defaultValue: 'admin' },
    F.password('qbittorrent'),
    F.useSsl('qbittorrent'),
    F.categorySync(),
    F.notifications()
  ],
  deluge: [
    F.host('deluge'),
    F.port('deluge', 8112),
    F.reverseProxyPath('/deluge'),
    F.password('deluge'),
    F.useSsl('deluge'),
    F.categorySync(),
    F.notifications()
  ],
  transmission: [
    F.host('transmission'),
    F.port('transmission', 9091),
    { field: 'path', label: 'RPC Path', description: 'Path for RPC endpoint (default: /transmission/rpc)', placeholder: '/transmission/rpc', defaultValue: '/transmission/rpc' },
    { field: 'username', label: 'Username', description: 'Transmission RPC username', placeholder: 'Enter username' },
    F.password('transmission'),
    F.useSsl('transmission'),
    F.categorySync(),
    F.notifications()
  ]
};

// Derived: per-type default values for the form — used by wizard/modal to seed
// new instances. defaultValue if set, '' for sensitive fields, false for
// toggles, '' otherwise.
export const TYPE_DEFAULTS = Object.fromEntries(
  Object.entries(CLIENT_FIELDS).map(([type, fields]) => [
    type,
    Object.fromEntries(fields.map(f => [
      f.field,
      f.defaultValue !== undefined ? f.defaultValue : f.sensitive ? '' : f.toggle ? false : ''
    ]))
  ])
);

// Env prefix used for sensitive-field env-var name display ("aMule EC password
// is set via AMULE_PASSWORD"). Kept in one place to avoid drift.
const ENV_PREFIX = { amule: 'AMULE', rtorrent: 'RTORRENT', qbittorrent: 'QBITTORRENT', deluge: 'DELUGE', transmission: 'TRANSMISSION' };
const ENV_SUFFIX = { password: 'PASSWORD', username: 'USERNAME' };

/**
 * Shared field renderer used by both `ClientInstanceModal` and the per-client
 * sections of `SetupWizardView`. The exact same DOM the modal was rendering
 * inline; the wizard's per-client sections wrap this with their own chrome
 * (enable toggle, intro text, test button).
 *
 * @param {Object} props
 * @param {string} props.type - Client type key (used for env-name display on sensitive fields)
 * @param {Array} props.fields - Field definitions (typically `CLIENT_FIELDS[type]`)
 * @param {Object} props.values - Current form state for this client
 * @param {Function} props.onFieldChange - `(field, value) => void` — write the value back
 * @param {Function} props.isFieldFromEnv - `(field) => bool` — is this field env-provided?
 * @param {boolean} [props.isEnabled=true] - Whether the parent section is enabled (affects the `required` attribute so browser validation only kicks in when the client is on)
 * @param {boolean} [props.disabled=false] - Disable all inputs (e.g. during a test-connection call)
 */
export const ClientFieldsRenderer = ({
  type,
  fields,
  values,
  onFieldChange,
  isFieldFromEnv,
  isEnabled = true,
  disabled = false
}) => {
  return h(React.Fragment, {},
    fields
      .filter(fieldDef => !fieldDef.hideWhen || !fieldDef.hideWhen(values))
      .map(fieldDef => {
        // Select dropdown fields
        if (fieldDef.select) {
          const value = values[fieldDef.field] ?? fieldDef.defaultValue ?? '';
          return h(ConfigField, {
            key: fieldDef.field,
            label: fieldDef.label,
            description: fieldDef.description
          },
            h('select', {
              value,
              onChange: (e) => onFieldChange(fieldDef.field, e.target.value),
              disabled: disabled || isFieldFromEnv(fieldDef.field),
              className: 'w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50'
            },
              fieldDef.options.map(opt =>
                h('option', { key: opt.value, value: opt.value }, opt.label)
              )
            )
          );
        }

        // Toggle fields — fall through to `defaultValue` (instead of false) so
        // toggles declared as `defaultValue: true` show ON when the field is
        // absent from a legacy saved config.
        if (fieldDef.toggle) {
          return h(EnableToggle, {
            key: fieldDef.field,
            label: fieldDef.label,
            description: fieldDef.description,
            enabled: values[fieldDef.field] ?? fieldDef.defaultValue ?? false,
            onChange: (value) => onFieldChange(fieldDef.field, value)
          });
        }

        // Sensitive fields — env-provided shows an AlertBox, otherwise a
        // PasswordField in a ConfigField wrapper.
        if (fieldDef.sensitive) {
          const envProvided = isFieldFromEnv(fieldDef.field);
          const prefix = ENV_PREFIX[type];
          const suffix = ENV_SUFFIX[fieldDef.field];
          const envName = prefix && suffix ? `${prefix}_${suffix}` : null;

          return h('div', { key: fieldDef.field },
            envProvided
              ? h(AlertBox, { type: 'warning' },
                  h('p', {}, `${fieldDef.label} is set via ${envName || 'environment variable'} and cannot be changed here.`)
                )
              : h(ConfigField, {
                  label: fieldDef.label,
                  description: fieldDef.description,
                  required: fieldDef.required && isEnabled
                },
                  h(PasswordField, {
                    value: values[fieldDef.field] || '',
                    onChange: (value) => onFieldChange(fieldDef.field, value),
                    placeholder: fieldDef.placeholder,
                    disabled
                  })
                )
          );
        }

        // Default: text/number field.
        const value = values[fieldDef.field] ?? fieldDef.defaultValue ?? '';
        return h(ConfigField, {
          key: fieldDef.field,
          label: fieldDef.label,
          description: fieldDef.description,
          value,
          onChange: (val) => {
            const parsed = fieldDef.parseValue ? fieldDef.parseValue(val) : val;
            onFieldChange(fieldDef.field, parsed);
          },
          type: fieldDef.type || 'text',
          placeholder: fieldDef.placeholder,
          required: fieldDef.required && isEnabled,
          fromEnv: isFieldFromEnv(fieldDef.field)
        });
      })
  );
};

export default ClientFieldsRenderer;
