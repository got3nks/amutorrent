/**
 * IntegrationConfigInfo Component
 *
 * Displays configuration instructions for Sonarr/Radarr integration
 */

import React from 'https://esm.sh/react@18.2.0';
import { AlertBox } from '../common/index.js';

const { createElement: h } = React;

/**
 * IntegrationConfigInfo component
 * @param {string} title - Title of the integration (e.g., "Sonarr Integration Configuration")
 * @param {number} port - Server port number
 * @param {boolean} authEnabled - Whether authentication is enabled
 * @param {boolean} amuleEnabled - Whether aMule integration is enabled
 * @param {string} className - Optional additional CSS classes
 */
const IntegrationConfigInfo = ({ title, port, authEnabled, amuleEnabled = true, className = '' }) => {
  return h(AlertBox, { type: 'info', className: className || 'mt-4' },
    h('div', {},
      h('p', { className: 'font-medium mb-2' }, title),
      h('p', { className: 'text-sm mb-3' }, 'aMuTorrent provides Torznab-compatible and qBittorrent-compatible APIs to integrate aMule with *arr apps (Sonarr, Radarr, etc.).'),
      !amuleEnabled
        ? h('p', { className: 'text-sm italic' }, 'Enable aMule integration to see connection details.')
        : h('div', { className: 'space-y-3' },
            h('div', {},
              h('p', { className: 'font-medium mb-1' }, 'Torznab Indexer Settings:'),
              h('ul', { className: 'list-disc list-inside space-y-1 ml-2' },
                h('li', {}, h('strong', {}, 'URL: '), h('code', { className: 'bg-white dark:bg-gray-800 px-1 rounded' }, `http://<host>:${port}/indexer/amule`), ' (<host> can be IP address or container name)'),
                authEnabled
                  ? h('li', {}, h('strong', {}, 'API Key: '), 'Your web UI password')
                  : h('li', {}, h('strong', {}, 'API Key: '), 'Leave empty (authentication is disabled)')
              )
            ),
            h('div', {},
              h('p', { className: 'font-medium mb-1' }, 'qBittorrent Download Client Settings:'),
              h('ul', { className: 'list-disc list-inside space-y-1 ml-2' },
                h('li', {}, h('strong', {}, 'Host: '), h('code', { className: 'bg-white dark:bg-gray-800 px-1 rounded' }, '<host>'), ' (IP address or container name)'),
                h('li', {}, h('strong', {}, 'Port: '), h('code', { className: 'bg-white dark:bg-gray-800 px-1 rounded' }, String(port))),
                authEnabled
                  ? [
                      h('li', { key: 'username' }, h('strong', {}, 'Username: '), 'Any username is accepted'),
                      h('li', { key: 'password' }, h('strong', {}, 'Password: '), 'Your web UI password')
                    ]
                  : h('li', {}, h('strong', {}, 'Username/Password: '), 'Any username and password accepted (authentication is disabled)')
              )
            )
          )
    )
  );
};

export default IntegrationConfigInfo;
