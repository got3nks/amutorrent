/**
 * AboutModal Component
 *
 * Displays application information:
 * - App name and logo
 * - Current version and release date
 * - Expandable changelog
 * - Links to GitHub and Docker Hub
 * - Update notification if available
 */

import React from 'https://esm.sh/react@18.2.0';
import { useVersion } from '../../contexts/index.js';
import { Icon, Portal, Button } from '../common/index.js';
import { parseMarkdownBold } from '../../utils/index.js';

const { createElement: h, useState } = React;

/**
 * Changelog section component
 */
const ChangelogSection = ({ release, isExpanded, onToggle }) => {
  const { version, releaseDate, changes } = release;
  const hasChanges = Object.keys(changes).length > 0;

  return h('div', {
    className: 'border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden'
  },
    // Header
    h('button', {
      onClick: onToggle,
      className: 'w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left'
    },
      h('div', { className: 'flex items-center gap-2' },
        h('span', { className: 'font-semibold text-gray-900 dark:text-gray-100' }, `v${version}`),
        releaseDate && h('span', { className: 'text-xs text-gray-500 dark:text-gray-400' }, releaseDate)
      ),
      hasChanges && h(Icon, {
        name: isExpanded ? 'chevronUp' : 'chevronDown',
        size: 16,
        className: 'text-gray-500 dark:text-gray-400'
      })
    ),
    // Content
    isExpanded && hasChanges && h('div', { className: 'p-3 space-y-3' },
      Object.entries(changes).map(([category, items]) =>
        h('div', { key: category },
          h('h5', { className: 'text-sm font-medium text-gray-700 dark:text-gray-300 mb-1' }, category),
          h('ul', { className: 'text-xs text-gray-600 dark:text-gray-400 space-y-0.5 pl-4' },
            items.slice(0, 5).map((item, idx) =>
              h('li', { key: idx, className: 'list-disc' }, parseMarkdownBold(item))
            ),
            items.length > 5 && h('li', { className: 'text-gray-400 dark:text-gray-500 italic' },
              `... and ${items.length - 5} more`
            )
          )
        )
      )
    )
  );
};

/**
 * AboutModal component
 * @param {boolean} show - Whether to show the modal
 * @param {function} onClose - Close handler
 */
const AboutModal = ({ show, onClose }) => {
  const { versionInfo, updateAvailable, latestVersion, releaseUrl } = useVersion();
  const [expandedVersions, setExpandedVersions] = useState({ 0: true }); // First one expanded

  if (!show) return null;

  const toggleVersion = (index) => {
    setExpandedVersions(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const links = versionInfo?.links || {
    github: 'https://github.com/got3nks/amutorrent',
    dockerHub: 'https://hub.docker.com/r/g0t3nks/amutorrent',
  };

  return h(Portal, null,
    h('div', {
      className: 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-2 sm:p-4',
      onClick: onClose
    },
      h('div', {
        className: 'bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden',
        onClick: (e) => e.stopPropagation()
      },
        // Header
        h('div', { className: 'flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700' },
          h('div', { className: 'flex items-center gap-3' },
            h('img', {
              src: '/static/logo-amutorrent.png',
              alt: 'aMuTorrent',
              className: 'w-10 h-10 object-contain'
            }),
            h('div', null,
              h('h2', { className: 'text-lg font-semibold text-gray-900 dark:text-gray-100' },
                versionInfo?.appName || 'aMuTorrent'
              ),
              h('div', { className: 'flex items-center gap-2' },
                h('span', { className: 'text-sm text-gray-500 dark:text-gray-400' },
                  `Version ${versionInfo?.version || 'unknown'}`
                ),
                versionInfo?.releaseDate && h('span', {
                  className: 'text-xs text-gray-400 dark:text-gray-500'
                }, `(${versionInfo.releaseDate})`)
              )
            )
          ),
          h('button', {
            onClick: onClose,
            className: 'p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors'
          },
            h(Icon, { name: 'x', size: 20, className: 'text-gray-500 dark:text-gray-400' })
          )
        ),

        // Update notification
        updateAvailable && h('div', {
          className: 'mx-4 mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg'
        },
          h('div', { className: 'flex items-center justify-between gap-2' },
            h('div', { className: 'flex items-center gap-2' },
              h(Icon, { name: 'bell', size: 18, className: 'text-amber-600 dark:text-amber-400' }),
              h('span', { className: 'text-sm font-medium text-amber-800 dark:text-amber-200' },
                `New version ${latestVersion} available!`
              )
            ),
            h('a', {
              href: releaseUrl,
              target: '_blank',
              rel: 'noopener noreferrer',
              className: 'px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap'
            }, 'View Release')
          )
        ),

        // Content
        h('div', { className: 'flex-1 overflow-y-auto p-4 space-y-4' },
          // Quick links
          h('div', { className: 'flex flex-wrap gap-2' },
            h('a', {
              href: links.github,
              target: '_blank',
              rel: 'noopener noreferrer',
              className: 'inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 dark:bg-gray-700 text-white text-sm rounded-lg hover:bg-gray-800 dark:hover:bg-gray-600 transition-colors'
            },
              h(Icon, { name: 'github', size: 16 }),
              'GitHub'
            ),
            h('a', {
              href: links.dockerHub,
              target: '_blank',
              rel: 'noopener noreferrer',
              className: 'inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors'
            },
              h(Icon, { name: 'docker', size: 16 }),
              'Docker Hub'
            )
          ),

          // Changelog
          h('div', null,
            h('h3', { className: 'text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2' }, 'Changelog'),
            h('div', { className: 'space-y-2' },
              versionInfo?.changelog?.length > 0
                ? versionInfo.changelog.map((release, index) =>
                    h(ChangelogSection, {
                      key: release.version,
                      release,
                      isExpanded: !!expandedVersions[index],
                      onToggle: () => toggleVersion(index)
                    })
                  )
                : h('p', { className: 'text-sm text-gray-500 dark:text-gray-400' }, 'No changelog available')
            )
          )
        ),

        // Footer
        h('div', { className: 'p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end' },
          h(Button, {
            variant: 'secondary',
            onClick: onClose
          }, 'Close')
        )
      )
    )
  );
};

export default AboutModal;
