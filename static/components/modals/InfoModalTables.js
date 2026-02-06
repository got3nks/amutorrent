/**
 * InfoModalComponents - Shared components for info modals
 *
 * Reusable components used by both DownloadInfoModal and SharedFileInfoModal:
 * - InfoModalHeader: Modal header with icon, title, subtitle
 * - ExportLinkSection: Export link with copy button
 * - CategoryFieldsSection: Collapsible category fields
 * - CollapsibleTableSection: Collapsible section wrapper
 * - PeersTable: Peers table for rtorrent
 * - TrackersTable: Trackers table for rtorrent
 */

import React from 'https://esm.sh/react@18.2.0';
import { Icon, FlagIcon, Tooltip, IconButton } from '../common/index.js';
import { formatBytes } from '../../utils/index.js';
import { formatFieldName, formatFieldValue } from '../../utils/fieldFormatters.js';

const { createElement: h, useState, useMemo } = React;

/**
 * Sortable table header cell
 */
const SortableHeader = ({ label, sortKey, currentSort, onSort, align = 'left' }) => {
  const isActive = currentSort.key === sortKey;
  const alignClass = align === 'right' ? 'text-right justify-end' : align === 'center' ? 'text-center justify-center' : 'text-left';

  return h('th', {
    className: `px-2 py-1.5 font-medium text-gray-600 dark:text-gray-300 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600/50 select-none ${alignClass}`,
    onClick: () => onSort(sortKey)
  },
    h('div', { className: `flex items-center gap-1 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : ''}` },
      label,
      isActive && h(Icon, {
        name: currentSort.direction === 'asc' ? 'chevronUp' : 'chevronDown',
        size: 12,
        className: 'text-blue-500 dark:text-blue-400'
      })
    )
  );
};

/**
 * Color configurations for modal headers
 */
const HEADER_COLORS = {
  blue: {
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    text: 'text-blue-600 dark:text-blue-400'
  },
  green: {
    bg: 'bg-green-100 dark:bg-green-900/30',
    text: 'text-green-600 dark:text-green-400'
  }
};

/**
 * Modal header with icon badge, title, subtitle, and close button
 * @param {string} icon - Icon name
 * @param {string} title - Modal title
 * @param {string} subtitle - Subtitle (typically filename)
 * @param {string} color - Color theme ('blue' or 'green')
 * @param {function} onClose - Close handler
 */
export const InfoModalHeader = ({ icon, title, subtitle, color = 'blue', onClose }) => {
  const colorConfig = HEADER_COLORS[color] || HEADER_COLORS.blue;

  return h('div', { className: 'flex items-center justify-between gap-3 p-3 sm:p-4 border-b border-gray-200 dark:border-gray-700' },
    h('div', { className: 'flex items-center gap-2 sm:gap-3 min-w-0 flex-1' },
      h('div', { className: `flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-full ${colorConfig.bg} flex items-center justify-center` },
        h(Icon, { name: icon, size: 18, className: `${colorConfig.text} sm:hidden` }),
        h(Icon, { name: icon, size: 20, className: `${colorConfig.text} hidden sm:block` })
      ),
      h('div', { className: 'min-w-0 flex-1' },
        h('h2', {
          className: 'text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100 truncate',
          title: subtitle
        }, title),
        h('p', {
          className: 'text-xs sm:text-sm text-gray-500 dark:text-gray-400 truncate',
          title: subtitle
        }, subtitle)
      )
    ),
    h(IconButton, {
      variant: 'secondary',
      icon: 'x',
      iconSize: 20,
      onClick: onClose,
      title: 'Close',
      className: 'flex-shrink-0'
    })
  );
};

/**
 * Export link section with copy-to-clipboard functionality
 * @param {string} exportLink - The link to display and copy
 * @param {string} linkLabel - Label for the link type (e.g., "ED2K Link", "Magnet Link")
 * @param {string} copyStatus - Current copy status ('idle', 'success', 'error')
 * @param {function} onCopy - Copy handler function
 */
export const ExportLinkSection = ({ exportLink, linkLabel, copyStatus, onCopy }) => {
  if (!exportLink) return null;

  return h('div', { className: 'bg-gradient-to-r from-cyan-50 to-blue-50 dark:from-cyan-900/20 dark:to-blue-900/20 rounded-lg p-3 sm:p-4 border border-cyan-200 dark:border-cyan-800' },
    h('div', { className: 'flex items-center justify-between mb-2' },
      h('span', { className: 'text-xs sm:text-sm font-medium text-cyan-700 dark:text-cyan-300' }, linkLabel),
      h('button', {
        onClick: () => onCopy(exportLink),
        className: `px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all flex items-center gap-1.5 ${
          copyStatus === 'success'
            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
            : copyStatus === 'error'
              ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
              : 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-200 dark:hover:bg-cyan-900/50'
        }`
      },
        h(Icon, {
          name: copyStatus === 'success' ? 'check' : copyStatus === 'error' ? 'x' : 'share',
          size: 14
        }),
        copyStatus === 'success' ? 'Copied!' : copyStatus === 'error' ? 'Failed' : 'Copy'
      )
    ),
    h('div', { className: 'w-full overflow-hidden rounded' },
      h('div', {
        className: 'bg-white dark:bg-gray-900 p-2 rounded text-xs font-mono text-gray-600 dark:text-gray-400 overflow-x-auto whitespace-nowrap'
      }, exportLink)
    )
  );
};

/**
 * Collapsible category fields section
 * @param {string} category - Category name
 * @param {Array} fields - Array of [key, value] pairs
 * @param {boolean} expanded - Whether section is expanded
 * @param {function} onToggle - Toggle handler
 * @param {Array} categories - Categories list for formatting (optional)
 */
export const CategoryFieldsSection = ({ category, fields, expanded, onToggle, categories = [] }) => {
  // Filter out null values
  const validFields = fields.filter(([key, value]) => {
    const formatted = formatFieldValue(key, value, { categories });
    return formatted !== null;
  });

  if (validFields.length === 0) return null;

  return h('div', {
    className: 'border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden'
  },
    h('button', {
      onClick: onToggle,
      className: 'w-full flex items-center justify-between p-2 sm:p-3 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors'
    },
      h('span', { className: 'text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300' }, category),
      h(Icon, {
        name: expanded ? 'chevronUp' : 'chevronDown',
        size: 16,
        className: 'text-gray-500 dark:text-gray-400'
      })
    ),
    expanded && h('div', { className: 'divide-y divide-gray-200 dark:divide-gray-700' },
      validFields.map(([key, value]) => {
        const formattedValue = formatFieldValue(key, value, { categories });
        if (formattedValue === null) return null;

        return h('div', {
          key: key,
          className: 'p-2 sm:p-3 flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3'
        },
          h('span', { className: 'text-xs sm:text-sm text-gray-500 dark:text-gray-400 sm:w-48 flex-shrink-0' },
            formatFieldName(key)
          ),
          h('span', { className: 'text-xs sm:text-sm text-gray-900 dark:text-gray-100 break-words flex-1' },
            formattedValue
          )
        );
      })
    )
  );
};

/**
 * Collapsible section wrapper for tables
 * @param {string} title - Section title
 * @param {number} count - Item count to display
 * @param {boolean} expanded - Whether section is expanded
 * @param {function} onToggle - Toggle handler
 * @param {React.ReactNode} children - Table content
 */
export const CollapsibleTableSection = ({ title, count, expanded, onToggle, children }) => {
  return h('div', {
    className: 'border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden'
  },
    h('button', {
      onClick: onToggle,
      className: 'w-full flex items-center justify-between p-2 sm:p-3 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors'
    },
      h('span', { className: 'text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300' },
        `${title} (${count})`
      ),
      h(Icon, {
        name: expanded ? 'chevronUp' : 'chevronDown',
        size: 16,
        className: 'text-gray-500 dark:text-gray-400'
      })
    ),
    expanded && children
  );
};

/**
 * Peers table component for rtorrent downloads/shared files and aMule uploads
 * @param {Array} peers - Array of peer objects
 * @param {boolean} isAmule - If true, hide rtorrent-specific columns (Done, Downloaded, DL)
 */
export const PeersTable = ({ peers, isAmule = false }) => {
  const [sort, setSort] = useState({ key: 'uploadRate', direction: 'desc' });

  const handleSort = (key) => {
    setSort(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const sortedPeers = useMemo(() => {
    if (!peers || peers.length === 0) return [];

    return [...peers].sort((a, b) => {
      let aVal, bVal;

      switch (sort.key) {
        case 'address':
          aVal = a.hostname || a.address || '';
          bVal = b.hostname || b.address || '';
          break;
        case 'client':
          aVal = a.client || a.software || '';
          bVal = b.client || b.software || '';
          break;
        case 'country':
          aVal = a.geoData?.country || '';
          bVal = b.geoData?.country || '';
          break;
        case 'completedPercent':
          aVal = a.completedPercent || 0;
          bVal = b.completedPercent || 0;
          break;
        case 'downloadTotal':
          aVal = a.downloadTotal || 0;
          bVal = b.downloadTotal || 0;
          break;
        case 'uploadTotal':
          aVal = a.uploadTotal || 0;
          bVal = b.uploadTotal || 0;
          break;
        case 'uploadSession':
          aVal = a.uploadSession || 0;
          bVal = b.uploadSession || 0;
          break;
        case 'downloadRate':
          aVal = a.downloadRate || 0;
          bVal = b.downloadRate || 0;
          break;
        case 'uploadRate':
          aVal = a.uploadRate || 0;
          bVal = b.uploadRate || 0;
          break;
        case 'peerDownloadRate':
          aVal = a.peerDownloadRate || 0;
          bVal = b.peerDownloadRate || 0;
          break;
        case 'peerDownloadTotal':
          aVal = a.peerDownloadTotal || 0;
          bVal = b.peerDownloadTotal || 0;
          break;
        default:
          return 0;
      }

      if (typeof aVal === 'string') {
        const result = aVal.localeCompare(bVal);
        return sort.direction === 'asc' ? result : -result;
      }
      return sort.direction === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [peers, sort]);

  if (!peers || peers.length === 0) return null;

  return h('div', { className: 'overflow-x-auto' },
    h('table', { className: 'w-full text-xs' },
      h('thead', null,
        h('tr', { className: 'bg-gray-50 dark:bg-gray-700/50' },
          h(SortableHeader, { label: 'Address', sortKey: 'address', currentSort: sort, onSort: handleSort }),
          h(SortableHeader, { label: 'Client', sortKey: 'client', currentSort: sort, onSort: handleSort }),
          // Flags column (rtorrent only)
          !isAmule && h('th', { className: 'px-2 py-1.5 text-center font-medium text-gray-600 dark:text-gray-300' }, 'Flags'),
          // Done column (rtorrent only - peer's download progress)
          !isAmule && h(SortableHeader, { label: 'Done', sortKey: 'completedPercent', currentSort: sort, onSort: handleSort, align: 'right' }),
          // Downloaded column (rtorrent only - bytes downloaded from peer)
          !isAmule && h(SortableHeader, { label: 'Downloaded', sortKey: 'downloadTotal', currentSort: sort, onSort: handleSort, align: 'right' }),
          // Session upload (aMule only)
          isAmule && h(SortableHeader, { label: 'Session', sortKey: 'uploadSession', currentSort: sort, onSort: handleSort, align: 'right' }),
          h(SortableHeader, { label: 'Uploaded', sortKey: 'uploadTotal', currentSort: sort, onSort: handleSort, align: 'right' }),
          // DL rate column (rtorrent only)
          !isAmule && h(SortableHeader, { label: 'DL', sortKey: 'downloadRate', currentSort: sort, onSort: handleSort, align: 'right' }),
          h(SortableHeader, { label: 'UL', sortKey: 'uploadRate', currentSort: sort, onSort: handleSort, align: 'right' }),
          // Peer's own download stats (rtorrent only)
          !isAmule && h(SortableHeader, { label: 'Peer DL', sortKey: 'peerDownloadRate', currentSort: sort, onSort: handleSort, align: 'right' }),
          !isAmule && h(SortableHeader, { label: 'Peer Total', sortKey: 'peerDownloadTotal', currentSort: sort, onSort: handleSort, align: 'right' })
        )
      ),
      h('tbody', { className: 'divide-y divide-gray-200 dark:divide-gray-700' },
        sortedPeers.map((peer, idx) => {
          const ipPort = `${peer.address}:${peer.port}`;
          const geoTitle = [peer.geoData?.city, peer.geoData?.country].filter(Boolean).join(', ');

          return h('tr', {
            key: `${peer.address}-${peer.port}-${idx}`,
            className: 'hover:bg-gray-50 dark:hover:bg-gray-700/30'
          },
            // Address column with flag, hostname/IP, and optional city
            h('td', { className: 'px-2 py-1.5 text-gray-900 dark:text-gray-100' },
              h('div', { className: 'flex items-center gap-1.5' },
                // Country flag
                peer.geoData?.countryCode && h(FlagIcon, {
                  countryCode: peer.geoData.countryCode,
                  size: 14,
                  title: geoTitle || peer.geoData.countryCode
                }),
                // Hostname (with IP tooltip) or IP:port
                peer.hostname
                  ? h(Tooltip, { content: ipPort, position: 'top' },
                      h('span', { className: 'font-mono cursor-help' }, peer.hostname)
                    )
                  : h('span', { className: 'font-mono' }, ipPort),
                // City (if available and no hostname shown)
                !peer.hostname && peer.geoData?.city && h('span', {
                  className: 'text-gray-500 dark:text-gray-400 text-[10px]'
                }, `(${peer.geoData.city})`)
              )
            ),
            h('td', {
              className: 'px-2 py-1.5 text-gray-600 dark:text-gray-400 truncate max-w-[150px]',
              title: peer.client || peer.software
            }, peer.client || peer.software || 'Unknown'),
            // Flags column (rtorrent only)
            !isAmule && h('td', { className: 'px-2 py-1.5 text-center' },
              peer.flags && h('span', {
                className: 'px-1.5 py-0.5 rounded text-xs font-mono bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
                title: `${peer.isEncrypted ? 'Encrypted' : ''}${peer.isEncrypted && peer.isIncoming ? ', ' : ''}${peer.isIncoming ? 'Incoming' : ''}`
              }, peer.flags)
            ),
            // Done column (rtorrent only)
            !isAmule && h('td', { className: 'px-2 py-1.5 text-right text-gray-600 dark:text-gray-400' },
              peer.completedPercent != null ? `${peer.completedPercent}%` : '-'
            ),
            // Downloaded column (rtorrent only)
            !isAmule && h('td', { className: 'px-2 py-1.5 text-right text-gray-600 dark:text-gray-400' },
              formatBytes(peer.downloadTotal)
            ),
            // Session upload column (aMule only)
            isAmule && h('td', { className: 'px-2 py-1.5 text-right text-gray-600 dark:text-gray-400' },
              formatBytes(peer.uploadSession || 0)
            ),
            h('td', { className: 'px-2 py-1.5 text-right text-gray-600 dark:text-gray-400' },
              formatBytes(peer.uploadTotal)
            ),
            // DL rate column (rtorrent only)
            !isAmule && h('td', { className: 'px-2 py-1.5 text-right' },
              peer.downloadRate > 0
                ? h('span', { className: 'text-green-600 dark:text-green-400' },
                    `${formatBytes(peer.downloadRate)}/s`
                  )
                : h('span', { className: 'text-gray-400' }, '-')
            ),
            h('td', { className: 'px-2 py-1.5 text-right' },
              peer.uploadRate > 0
                ? h('span', { className: 'text-blue-600 dark:text-blue-400' },
                    `${formatBytes(peer.uploadRate)}/s`
                  )
                : h('span', { className: 'text-gray-400' }, '-')
            ),
            // Peer's own download rate (rtorrent only)
            !isAmule && h('td', { className: 'px-2 py-1.5 text-right' },
              peer.peerDownloadRate > 0
                ? h('span', { className: 'text-purple-600 dark:text-purple-400' },
                    `${formatBytes(peer.peerDownloadRate)}/s`
                  )
                : h('span', { className: 'text-gray-400' }, '-')
            ),
            // Peer's total downloaded (rtorrent only)
            !isAmule && h('td', { className: 'px-2 py-1.5 text-right text-gray-600 dark:text-gray-400' },
              formatBytes(peer.peerDownloadTotal)
            )
          );
        })
      )
    )
  );
};

/**
 * Build tree structure from flat file list
 * @param {Array} files - Flat array of file objects with path property
 * @returns {Object} Tree structure with nested children
 */
const buildFileTree = (files) => {
  const root = { name: '', children: {}, files: [] };

  files.forEach(file => {
    const parts = file.path.split('/');
    let current = root;

    // Navigate/create folders
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current.children[part]) {
        current.children[part] = { name: part, children: {}, files: [] };
      }
      current = current.children[part];
    }

    // Add file to current folder
    current.files.push({
      ...file,
      name: parts[parts.length - 1]
    });
  });

  return root;
};

/**
 * Recursive tree node component
 */
const TreeNode = ({ node, depth = 0, defaultExpanded = true }) => {
  const [expanded, setExpanded] = useState(defaultExpanded);

  // Calculate folder stats
  const folderStats = useMemo(() => {
    const calculateStats = (n) => {
      let totalSize = 0;
      let downloadedSize = 0;

      n.files.forEach(f => {
        totalSize += f.size;
        downloadedSize += f.size * (f.progress / 100);
      });

      Object.values(n.children).forEach(child => {
        const childStats = calculateStats(child);
        totalSize += childStats.totalSize;
        downloadedSize += childStats.downloadedSize;
      });

      return { totalSize, downloadedSize };
    };

    const stats = calculateStats(node);
    return {
      ...stats,
      progress: stats.totalSize > 0 ? (stats.downloadedSize / stats.totalSize) * 100 : 0
    };
  }, [node]);

  // Sort children: folders first, then files
  const sortedChildren = useMemo(() => {
    const folders = Object.values(node.children).sort((a, b) => a.name.localeCompare(b.name));
    const files = [...node.files].sort((a, b) => a.name.localeCompare(b.name));
    return { folders, files };
  }, [node]);

  if (!node.name && depth === 0) {
    // Root node - render children directly
    return h('div', { className: 'space-y-0.5' },
      sortedChildren.folders.map(child =>
        h(TreeNode, { key: child.name, node: child, depth: 0, defaultExpanded })
      ),
      sortedChildren.files.map(file =>
        h(TreeNode, { key: file.path, node: { name: file.name, children: {}, files: [], file }, depth: 0, defaultExpanded })
      )
    );
  }

  // Single file node
  if (node.file) {
    const file = node.file;
    const priorityLabel = file.priority === 0 ? 'Off' : file.priority === 2 ? 'High' : '';
    const isComplete = file.progress >= 100;

    return h('div', {
      className: 'flex items-center gap-2 py-1 px-2 hover:bg-gray-50 dark:hover:bg-gray-700/30 rounded',
      style: { paddingLeft: `${depth * 16 + 8}px` }
    },
      h(Icon, {
        name: 'file',
        size: 14,
        className: isComplete ? 'text-green-500 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'
      }),
      h('span', {
        className: 'flex-1 text-xs text-gray-800 dark:text-gray-200 truncate',
        title: file.name
      }, file.name),
      priorityLabel && h('span', {
        className: `text-[10px] px-1.5 py-0.5 rounded ${
          file.priority === 0
            ? 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
            : 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400'
        }`
      }, priorityLabel),
      h('span', {
        className: 'text-xs text-gray-500 dark:text-gray-400 font-mono whitespace-nowrap'
      }, formatBytes(file.size)),
      h('div', { className: 'w-16 flex items-center gap-1' },
        h('div', { className: 'flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden' },
          h('div', {
            className: `h-full rounded-full ${isComplete ? 'bg-green-500' : 'bg-blue-500'}`,
            style: { width: `${file.progress}%` }
          })
        ),
        h('span', {
          className: `text-[10px] font-mono ${isComplete ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`
        }, `${Math.round(file.progress)}%`)
      )
    );
  }

  // Folder node
  const isComplete = folderStats.progress >= 100;

  return h('div', null,
    h('div', {
      className: 'flex items-center gap-2 py-1 px-2 hover:bg-gray-50 dark:hover:bg-gray-700/30 rounded cursor-pointer',
      style: { paddingLeft: `${depth * 16 + 8}px` },
      onClick: () => setExpanded(!expanded)
    },
      h(Icon, {
        name: expanded ? 'chevronDown' : 'chevronRight',
        size: 12,
        className: 'text-gray-400 dark:text-gray-500 flex-shrink-0'
      }),
      h(Icon, {
        name: expanded ? 'folderOpen' : 'folder',
        size: 14,
        className: isComplete ? 'text-green-500 dark:text-green-400' : 'text-yellow-500 dark:text-yellow-400'
      }),
      h('span', {
        className: 'flex-1 text-xs font-medium text-gray-800 dark:text-gray-200 truncate',
        title: node.name
      }, node.name),
      h('span', {
        className: 'text-xs text-gray-500 dark:text-gray-400 font-mono whitespace-nowrap'
      }, formatBytes(folderStats.totalSize)),
      h('div', { className: 'w-16 flex items-center gap-1' },
        h('div', { className: 'flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden' },
          h('div', {
            className: `h-full rounded-full ${isComplete ? 'bg-green-500' : 'bg-blue-500'}`,
            style: { width: `${folderStats.progress}%` }
          })
        ),
        h('span', {
          className: `text-[10px] font-mono ${isComplete ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`
        }, `${Math.round(folderStats.progress)}%`)
      )
    ),
    expanded && h('div', null,
      sortedChildren.folders.map(child =>
        h(TreeNode, { key: child.name, node: child, depth: depth + 1, defaultExpanded: false })
      ),
      sortedChildren.files.map(file =>
        h(TreeNode, { key: file.path, node: { name: file.name, children: {}, files: [], file }, depth: depth + 1, defaultExpanded: false })
      )
    )
  );
};

/**
 * Files tree section for multi-file torrents
 * @param {Array} files - Array of file objects with path, size, progress
 * @param {boolean} loading - Whether files are being loaded
 * @param {string} error - Error message if loading failed
 */
export const FilesTreeSection = ({ files, loading, error }) => {
  const tree = useMemo(() => files ? buildFileTree(files) : null, [files]);

  if (loading) {
    return h('div', { className: 'flex items-center justify-center py-8' },
      h('div', { className: 'loader' })
    );
  }

  if (error) {
    return h('div', { className: 'text-center py-4 text-red-500 dark:text-red-400 text-xs' }, error);
  }

  if (!files || files.length === 0) {
    return h('div', { className: 'text-center py-4 text-gray-500 dark:text-gray-400 text-xs' }, 'No files');
  }

  return h('div', { className: 'p-2' },
    h(TreeNode, { node: tree, defaultExpanded: true })
  );
};

/**
 * Trackers table component for rtorrent downloads/shared files
 * @param {Array} trackers - Array of tracker objects
 */
export const TrackersTable = ({ trackers }) => {
  const [sort, setSort] = useState({ key: 'scrapeComplete', direction: 'desc' });

  const handleSort = (key) => {
    setSort(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const sortedTrackers = useMemo(() => {
    if (!trackers || trackers.length === 0) return [];

    return [...trackers].sort((a, b) => {
      let aVal, bVal;

      switch (sort.key) {
        case 'url':
          aVal = a.url || '';
          bVal = b.url || '';
          break;
        case 'enabled':
          aVal = a.enabled ? 1 : 0;
          bVal = b.enabled ? 1 : 0;
          break;
        case 'scrapeComplete':
          aVal = a.scrapeComplete >= 0 ? a.scrapeComplete : -1;
          bVal = b.scrapeComplete >= 0 ? b.scrapeComplete : -1;
          break;
        case 'scrapeIncomplete':
          aVal = a.scrapeIncomplete >= 0 ? a.scrapeIncomplete : -1;
          bVal = b.scrapeIncomplete >= 0 ? b.scrapeIncomplete : -1;
          break;
        case 'scrapeDownloaded':
          aVal = a.scrapeDownloaded >= 0 ? a.scrapeDownloaded : -1;
          bVal = b.scrapeDownloaded >= 0 ? b.scrapeDownloaded : -1;
          break;
        default:
          return 0;
      }

      if (typeof aVal === 'string') {
        const result = aVal.localeCompare(bVal);
        return sort.direction === 'asc' ? result : -result;
      }
      return sort.direction === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [trackers, sort]);

  if (!trackers || trackers.length === 0) return null;

  return h('div', { className: 'overflow-x-auto' },
    h('table', { className: 'w-full text-xs' },
      h('thead', null,
        h('tr', { className: 'bg-gray-50 dark:bg-gray-700/50' },
          h(SortableHeader, { label: 'URL', sortKey: 'url', currentSort: sort, onSort: handleSort }),
          h(SortableHeader, { label: 'Status', sortKey: 'enabled', currentSort: sort, onSort: handleSort, align: 'center' }),
          h(SortableHeader, { label: 'Seeds', sortKey: 'scrapeComplete', currentSort: sort, onSort: handleSort, align: 'right' }),
          h(SortableHeader, { label: 'Leechers', sortKey: 'scrapeIncomplete', currentSort: sort, onSort: handleSort, align: 'right' }),
          h(SortableHeader, { label: 'Downloads', sortKey: 'scrapeDownloaded', currentSort: sort, onSort: handleSort, align: 'right' })
        )
      ),
      h('tbody', { className: 'divide-y divide-gray-200 dark:divide-gray-700' },
        sortedTrackers.map((tracker, idx) =>
          h('tr', {
            key: `${tracker.url}-${idx}`,
            className: 'hover:bg-gray-50 dark:hover:bg-gray-700/30'
          },
            h('td', {
              className: 'px-2 py-1.5 text-gray-900 dark:text-gray-100 truncate max-w-[300px]',
              title: tracker.url
            }, tracker.url),
            h('td', { className: 'px-2 py-1.5 text-center' },
              h('span', {
                className: `px-1.5 py-0.5 rounded text-xs font-medium ${
                  tracker.enabled
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                }`
              }, tracker.enabled ? 'Active' : 'Disabled')
            ),
            h('td', { className: 'px-2 py-1.5 text-right text-gray-600 dark:text-gray-400' },
              tracker.scrapeComplete >= 0 ? tracker.scrapeComplete : '-'
            ),
            h('td', { className: 'px-2 py-1.5 text-right text-gray-600 dark:text-gray-400' },
              tracker.scrapeIncomplete >= 0 ? tracker.scrapeIncomplete : '-'
            ),
            h('td', { className: 'px-2 py-1.5 text-right text-gray-600 dark:text-gray-400' },
              tracker.scrapeDownloaded >= 0 ? tracker.scrapeDownloaded : '-'
            )
          )
        )
      )
    )
  );
};
