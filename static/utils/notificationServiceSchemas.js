/**
 * Notification Service Type Definitions
 *
 * Defines the available notification services and their configuration fields
 * for the form-based UI.
 */

/**
 * Service type definitions with form fields and URL builders
 */
export const SERVICE_TYPES = {
  discord: {
    name: 'Discord',
    icon: 'bell',
    logo: '/static/service-icons/discord.svg',
    color: '#5865F2',
    description: 'Send notifications to a Discord channel via webhook',
    fields: [
      {
        key: 'webhook_id',
        label: 'Webhook ID',
        type: 'text',
        required: true,
        placeholder: '1234567890123456789',
        helpText: 'The ID from your Discord webhook URL'
      },
      {
        key: 'webhook_token',
        label: 'Webhook Token',
        type: 'password',
        required: true,
        placeholder: 'Your webhook token',
        helpText: 'The token from your Discord webhook URL'
      }
    ],
    helpUrl: 'https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks',
    helpText: 'Create a webhook in Discord (Server Settings > Integrations > Webhooks). The URL format is: discord.com/api/webhooks/{ID}/{TOKEN}'
  },

  telegram: {
    name: 'Telegram',
    icon: 'bell',
    logo: '/static/service-icons/telegram.svg',
    color: '#0088cc',
    description: 'Send notifications via Telegram Bot',
    fields: [
      {
        key: 'bot_token',
        label: 'Bot Token',
        type: 'password',
        required: true,
        placeholder: '123456789:ABCdefGHIjklMNOpqrsTUVwxyz',
        helpText: 'Token from @BotFather'
      },
      {
        key: 'chat_id',
        label: 'Chat ID',
        type: 'text',
        required: true,
        placeholder: '123456789',
        helpText: 'Your chat or group ID (use @userinfobot to find it)'
      }
    ],
    helpUrl: 'https://core.telegram.org/bots#how-do-i-create-a-bot',
    helpText: 'Create a bot via @BotFather, then get your chat ID using @userinfobot or @getidsbot'
  },

  slack: {
    name: 'Slack',
    icon: 'bell',
    logo: '/static/service-icons/slack.svg',
    color: '#4A154B',
    description: 'Send notifications to a Slack channel',
    fields: [
      {
        key: 'token_a',
        label: 'Token Part A',
        type: 'password',
        required: true,
        placeholder: 'T00000000',
        helpText: 'First part of your webhook token'
      },
      {
        key: 'token_b',
        label: 'Token Part B',
        type: 'password',
        required: true,
        placeholder: 'B00000000',
        helpText: 'Second part of your webhook token'
      },
      {
        key: 'token_c',
        label: 'Token Part C',
        type: 'password',
        required: true,
        placeholder: 'XXXXXXXXXXXXXXXXXXXXXXXX',
        helpText: 'Third part of your webhook token'
      },
      {
        key: 'channel',
        label: 'Channel (Optional)',
        type: 'text',
        required: false,
        placeholder: 'general',
        helpText: 'Channel name without # (default: webhook default channel)'
      }
    ],
    helpUrl: 'https://api.slack.com/messaging/webhooks',
    helpText: 'Create an Incoming Webhook app. URL format: hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX'
  },

  pushover: {
    name: 'Pushover',
    icon: 'bell',
    logo: '/static/service-icons/pushover.svg',
    color: '#249DF1',
    description: 'Send push notifications via Pushover',
    fields: [
      {
        key: 'user_key',
        label: 'User Key',
        type: 'text',
        required: true,
        placeholder: 'Your Pushover user key',
        helpText: 'Found on your Pushover dashboard'
      },
      {
        key: 'api_token',
        label: 'API Token',
        type: 'password',
        required: true,
        placeholder: 'Your application token',
        helpText: 'Create an application at pushover.net to get a token'
      }
    ],
    helpUrl: 'https://pushover.net/api',
    helpText: 'Sign up at pushover.net and create an application to get your API token'
  },

  ntfy: {
    name: 'ntfy',
    icon: 'bell',
    logo: '/static/service-icons/ntfy.svg',
    color: '#57a64a',
    description: 'Send notifications via ntfy.sh (self-hosted or public)',
    fields: [
      {
        key: 'topic',
        label: 'Topic',
        type: 'text',
        required: true,
        placeholder: 'my-topic-name',
        helpText: 'The topic to publish to'
      },
      {
        key: 'host',
        label: 'Host (Optional)',
        type: 'text',
        required: false,
        placeholder: 'ntfy.sh',
        helpText: 'Default: ntfy.sh (leave empty for public server)'
      }
    ],
    helpUrl: 'https://ntfy.sh/docs/',
    helpText: 'ntfy is a simple pub-sub notification service. Use the public server or self-host your own.'
  },

  gotify: {
    name: 'Gotify',
    icon: 'bell',
    logo: '/static/service-icons/gotify.svg',
    color: '#2196f3',
    description: 'Send notifications to your Gotify server',
    fields: [
      {
        key: 'host',
        label: 'Host',
        type: 'text',
        required: true,
        placeholder: 'gotify.example.com',
        helpText: 'Your Gotify server hostname (without https://)'
      },
      {
        key: 'token',
        label: 'Application Token',
        type: 'password',
        required: true,
        placeholder: 'Your Gotify app token',
        helpText: 'Create an application in Gotify to get a token'
      }
    ],
    helpUrl: 'https://gotify.net/docs/',
    helpText: 'Gotify is a self-hosted notification server. Create an application to get a token.'
  },

  email: {
    name: 'Email (SMTP)',
    icon: 'bell',
    logo: '/static/service-icons/smtp.svg',
    color: '#ea4335',
    description: 'Send email notifications via SMTP',
    fields: [
      {
        key: 'smtp_host',
        label: 'SMTP Host',
        type: 'text',
        required: true,
        placeholder: 'smtp.gmail.com',
        helpText: 'Your SMTP server hostname'
      },
      {
        key: 'smtp_port',
        label: 'SMTP Port',
        type: 'number',
        required: false,
        placeholder: '587',
        helpText: 'Default: 587 (TLS) or 465 (SSL)'
      },
      {
        key: 'smtp_user',
        label: 'Username',
        type: 'text',
        required: true,
        placeholder: 'your@email.com',
        helpText: 'SMTP authentication username (usually your email)'
      },
      {
        key: 'smtp_password',
        label: 'Password',
        type: 'password',
        required: false,
        placeholder: 'App password or SMTP password',
        helpText: 'For Gmail, use an App Password'
      },
      {
        key: 'to_email',
        label: 'Recipient Email',
        type: 'text',
        required: true,
        placeholder: 'recipient@email.com',
        helpText: 'Email address to send notifications to'
      },
      {
        key: 'smtp_secure',
        label: 'Use SSL/TLS',
        type: 'checkbox',
        required: false,
        helpText: 'Enable for port 465 (SSL)'
      }
    ],
    helpUrl: 'https://github.com/caronc/apprise/wiki/Notify_email',
    helpText: 'Configure your SMTP settings. For Gmail, enable 2FA and create an App Password.'
  },

  webhook: {
    name: 'Webhook (JSON)',
    icon: 'bell',
    logo: '/static/service-icons/webhook.svg',
    color: '#6366f1',
    description: 'Send JSON POST requests to a custom webhook URL',
    fields: [
      {
        key: 'url',
        label: 'Webhook URL',
        type: 'text',
        required: true,
        placeholder: 'https://your-webhook.example.com/notify',
        helpText: 'URL to POST JSON notifications to'
      }
    ],
    helpText: 'Notifications will be sent as JSON POST requests to your webhook endpoint.'
  },

  custom: {
    name: 'Custom Apprise URL',
    icon: 'settings',
    color: '#6b7280',
    description: 'Enter a custom Apprise URL for any supported service',
    fields: [
      {
        key: 'url',
        label: 'Apprise URL',
        type: 'text',
        required: true,
        placeholder: 'schema://user:password@host',
        helpText: 'Any valid Apprise URL'
      }
    ],
    helpUrl: 'https://github.com/caronc/apprise/wiki',
    helpText: 'Enter any valid Apprise URL. See the Apprise wiki for all supported services.'
  }
};

/**
 * Get list of service types for selection
 * @returns {Array} Array of { value, label, description, color }
 */
export const getServiceTypeOptions = () => {
  return Object.entries(SERVICE_TYPES).map(([value, def]) => ({
    value,
    label: def.name,
    description: def.description,
    color: def.color,
    icon: def.icon,
    logo: def.logo
  }));
};

/**
 * Get service schema by type
 * @param {string} type - Service type
 * @returns {Object|null} Service schema or null
 */
export const getServiceSchema = (type) => {
  return SERVICE_TYPES[type] || null;
};

/**
 * Validate service config against schema
 * @param {string} type - Service type
 * @param {Object} config - Service config
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export const validateServiceConfig = (type, config) => {
  const schema = SERVICE_TYPES[type];
  if (!schema) {
    return { valid: false, errors: ['Unknown service type'] };
  }

  const errors = [];

  schema.fields.forEach(field => {
    if (field.required) {
      const value = config[field.key];
      if (value === undefined || value === null || value === '') {
        errors.push(`${field.label} is required`);
      }
    }
  });

  return {
    valid: errors.length === 0,
    errors
  };
};

/**
 * Event type definitions
 */
export const EVENT_TYPES = {
  downloadAdded: {
    label: 'Download Added',
    description: 'When a new download is started'
  },
  downloadFinished: {
    label: 'Download Finished',
    description: 'When a download completes successfully'
  },
  categoryChanged: {
    label: 'Category Changed',
    description: 'When a file\'s category/label is changed'
  },
  fileMoved: {
    label: 'File Moved',
    description: 'When a file is moved to a new location'
  },
  fileDeleted: {
    label: 'File Deleted',
    description: 'When a file is deleted from the client'
  }
};

/**
 * Get event types as array
 * @returns {Array} Array of { key, label, description }
 */
export const getEventTypeOptions = () => {
  return Object.entries(EVENT_TYPES).map(([key, def]) => ({
    key,
    label: def.label,
    description: def.description
  }));
};
