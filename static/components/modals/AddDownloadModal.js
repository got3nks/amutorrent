/**
 * AddDownloadModal Component
 *
 * Modal for adding downloads via ED2K links, magnet links, or .torrent files
 * Supports aMule (ED2K) and BitTorrent clients (rTorrent, qBittorrent)
 */

import React from 'https://esm.sh/react@18.2.0';
import Portal from '../common/Portal.js';
import { Button, Select, Textarea, Icon, Input, IconButton, ClientIcon, BitTorrentClientSelector, AmuleInstanceSelector, PathPicker } from '../common/index.js';
import { useClientFilter } from '../../contexts/ClientFilterContext.js';
import { useStaticData } from '../../contexts/StaticDataContext.js';
import { useBitTorrentClientSelector } from '../../hooks/useBitTorrentClientSelector.js';
import { useAmuleInstanceSelector } from '../../hooks/useAmuleInstanceSelector.js';

const { createElement: h, useState, useRef, useCallback, useEffect } = React;

/**
 * Add download modal
 * @param {boolean} show - Whether to show the modal
 * @param {function} onAddEd2kLinks - Handler for ED2K links (links, categoryName)
 * @param {function} onAddMagnetLinks - Handler for magnet links (links, label, clientId)
 * @param {function} onAddTorrentFile - Handler for .torrent file (file, label, clientId)
 * @param {function} onClose - Close handler
 * @param {File[]} initialTorrentFiles - Pre-loaded .torrent files (e.g. from global drag-and-drop)
 */
const AddDownloadModal = ({
  show,
  onAddEd2kLinks,
  onAddMagnetLinks,
  onAddTorrentFile,
  onClose,
  initialTorrentFiles = []
}) => {
  // Get aMule connection status from context
  const { ed2kConnected: amuleConnected } = useClientFilter();
  // Get BitTorrent client selection state (instance-aware)
  const {
    connectedClients: btClients,
    hasBitTorrentClient,
    showClientSelector,
    selectedClientId,
    selectedClient,
    selectClient
  } = useBitTorrentClientSelector();
  // Get unified categories and instance metadata from context
  const { dataCategories: categories, instances, isTypeConnected } = useStaticData();

  // Build per-instance connection badges from instances metadata
  const instanceBadges = React.useMemo(() => {
    return Object.entries(instances || {})
      .filter(([, inst]) => inst.connected)
      .map(([id, inst]) => ({ id, name: inst.name || id, type: inst.type, color: inst.color, order: inst.order }))
      .sort((a, b) => a.order - b.order);
  }, [instances]);

  // aMule instance selector for ED2K links
  const {
    connectedInstances: amuleInstances,
    showSelector: showAmuleSelector,
    selectedId: effectiveAmuleInstance,
    selectedInstance: selectedAmuleObj,
    selectInstance: selectAmuleInstance
  } = useAmuleInstanceSelector();

  // State
  const [links, setLinks] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Default');
  const [customCategory, setCustomCategory] = useState('');
  const [useCustomCategory, setUseCustomCategory] = useState(false);
  const [torrentFiles, setTorrentFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [showSavePath, setShowSavePath] = useState(false);
  const [customSavePath, setCustomSavePath] = useState('');
  const fileInputRef = useRef(null);

  // Seed torrent files from global drag-and-drop
  useEffect(() => {
    if (initialTorrentFiles.length > 0) {
      setTorrentFiles(initialTorrentFiles);
    }
  }, [initialTorrentFiles]);

  // Parse links to determine types
  const parseLinks = useCallback((text) => {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const ed2kLinks = [];
    const magnetLinks = [];
    const invalidLinks = [];

    lines.forEach(line => {
      if (line.toLowerCase().startsWith('ed2k://')) {
        ed2kLinks.push(line);
      } else if (line.toLowerCase().startsWith('magnet:?')) {
        magnetLinks.push(line);
      } else if (line.length > 0) {
        invalidLinks.push(line);
      }
    });

    return { ed2kLinks, magnetLinks, invalidLinks };
  }, []);

  // Early return AFTER all hooks are called (React rules of hooks)
  if (!show) return null;

  const { ed2kLinks, magnetLinks, invalidLinks } = parseLinks(links);

  // Check if we can submit
  const hasEd2kLinks = ed2kLinks.length > 0 && amuleConnected;
  const hasMagnetLinks = magnetLinks.length > 0 && hasBitTorrentClient;
  const hasTorrentFiles = torrentFiles.length > 0 && hasBitTorrentClient;
  const canSubmit = hasEd2kLinks || hasMagnetLinks || hasTorrentFiles;

  // Check if selected BT client supports custom save path
  const selectedClientCaps = selectedClient ? (instances[selectedClientId]?.capabilities || {}) : {};
  const supportsCustomPath = selectedClientCaps.customSavePath === true;

  // Category paths for PathPicker quick links
  const categoryPaths = categories
    .filter(c => c.path && c.name !== 'Default')
    .map(c => ({ name: c.title || c.name, path: c.path }));

  // Get final category name (for both ED2K and rtorrent)
  const getFinalCategory = () => useCustomCategory ? customCategory.trim() : selectedCategory;
  // For rtorrent, use category name as label (Default means empty label)
  const getFinalLabel = () => {
    const cat = getFinalCategory();
    return cat === 'Default' ? '' : cat;
  };

  const handleSubmit = () => {
    const finalCategory = getFinalCategory();
    const finalLabel = getFinalLabel();
    // Custom save path: only send if user explicitly set one and client supports it
    const effectiveSavePath = (showSavePath && customSavePath && supportsCustomPath) ? customSavePath : null;

    // Add ED2K links if any (send category name - backend resolves to per-instance amuleId)
    if (ed2kLinks.length > 0 && amuleConnected && onAddEd2kLinks) {
      onAddEd2kLinks(ed2kLinks, finalCategory, false, effectiveAmuleInstance);
    }

    // Add magnet links if any (pass instanceId + clientType + optional savePath)
    if (magnetLinks.length > 0 && hasBitTorrentClient && onAddMagnetLinks) {
      onAddMagnetLinks(magnetLinks, finalLabel, selectedClientId, selectedClient?.type, effectiveSavePath);
    }

    // Add torrent files if any (pass instanceId + clientType + optional savePath)
    if (torrentFiles.length > 0 && hasBitTorrentClient && onAddTorrentFile) {
      torrentFiles.forEach(file => {
        onAddTorrentFile(file, finalLabel, selectedClientId, selectedClient?.type, effectiveSavePath);
      });
    }

    // Reset and close
    setLinks('');
    setTorrentFiles([]);
    setSelectedCategory('Default');
    setCustomCategory('');
    setUseCustomCategory(false);
    setShowSavePath(false);
    setCustomSavePath('');
    onClose();
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    // Normalize spaces in URLs
    const normalizedText = pastedText.replace(/ /g, '%20');

    const target = e.target;
    const { selectionStart, selectionEnd } = target;

    const newValue =
      target.value.slice(0, selectionStart) +
      normalizedText +
      target.value.slice(selectionEnd);

    setLinks(newValue);

    requestAnimationFrame(() => {
      const pos = selectionStart + normalizedText.length;
      target.setSelectionRange(pos, pos);
    });
  };

  const handleCategoryChange = (e) => {
    const value = e.target.value;
    if (value === '__custom__') {
      setUseCustomCategory(true);
      setSelectedCategory('__custom__');
    } else {
      setUseCustomCategory(false);
      setSelectedCategory(value);
    }
  };

  // File handling
  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter(file => file.name.endsWith('.torrent'));
    if (validFiles.length > 0) {
      setTorrentFiles(prev => [...prev, ...validFiles]);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files || []);
    const validFiles = files.filter(file => file.name.endsWith('.torrent'));
    if (validFiles.length > 0) {
      setTorrentFiles(prev => [...prev, ...validFiles]);
    }
  };

  const removeTorrentFile = (index) => {
    setTorrentFiles(prev => prev.filter((_, i) => i !== index));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Summary of what will be added (returns array of strings, one per line)
  const getSummaryParts = () => {
    const parts = [];
    const finalCategory = getFinalCategory();
    const selectedClientName = selectedClient?.name || 'BitTorrent';
    const effectiveAmuleName = selectedAmuleObj?.name || 'aMule';

    if (ed2kLinks.length > 0) {
      let ed2kPart = `${ed2kLinks.length} ED2K link${ed2kLinks.length > 1 ? 's' : ''}`;
      if (!amuleConnected) {
        ed2kPart += ' (aMule offline)';
      } else {
        ed2kPart += ` → ${effectiveAmuleName}`;
        if (finalCategory && finalCategory !== 'Default') {
          ed2kPart += ` (${finalCategory})`;
        }
      }
      parts.push(ed2kPart);
    }
    // Resolve effective save path: custom override → category path → null
    const effectiveCustomPath = (showSavePath && customSavePath) ? customSavePath : null;
    const btCategoryPath = (() => {
      const cat = categories.find(c => (c.name || c.title) === getFinalCategory());
      return cat?.path || null;
    })();
    const btSavePath = effectiveCustomPath || btCategoryPath;

    if (magnetLinks.length > 0) {
      let prefix = `${magnetLinks.length} magnet link${magnetLinks.length > 1 ? 's' : ''}`;
      if (!hasBitTorrentClient) {
        parts.push(`${prefix} (no BitTorrent client)`);
      } else {
        const finalLabel = getFinalLabel();
        prefix += ` → ${selectedClientName}`;
        if (finalLabel) prefix += ` (${finalLabel})`;
        if (btSavePath) {
          parts.push(h('span', null, `${prefix} → `, h('b', { className: 'font-mono' }, btSavePath)));
        } else {
          parts.push(prefix);
        }
      }
    }
    if (torrentFiles.length > 0) {
      let prefix = `${torrentFiles.length} torrent file${torrentFiles.length > 1 ? 's' : ''}`;
      if (!hasBitTorrentClient) {
        parts.push(`${prefix} (no BitTorrent client)`);
      } else {
        const finalLabel = getFinalLabel();
        prefix += ` → ${selectedClientName}`;
        if (finalLabel) prefix += ` (${finalLabel})`;
        if (btSavePath) {
          parts.push(h('span', null, `${prefix} → `, h('b', { className: 'font-mono' }, btSavePath)));
        } else {
          parts.push(prefix);
        }
      }
    }
    if (invalidLinks.length > 0) {
      parts.push(`${invalidLinks.length} invalid link${invalidLinks.length > 1 ? 's' : ''}`);
    }
    return parts;
  };

  return h(Portal, null,
    h('div', {
      className: 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4',
      onClick: onClose
    },
      h('div', {
        className: 'modal-full bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full flex flex-col overflow-hidden',
        onClick: (e) => e.stopPropagation()
      },
        // Header
        h('div', { className: 'px-6 py-4 border-b border-gray-200 dark:border-gray-700' },
          h('h3', { className: 'text-lg font-semibold text-gray-900 dark:text-gray-100' },
            'Add Download'
          ),

          // Connection status indicators — per-instance badges
          h('div', { className: 'flex flex-wrap gap-2 mt-3' },
          // Show connected instances; if none, show offline placeholders per type
          instanceBadges.length > 0
            ? instanceBadges.map(inst =>
                h('span', {
                  key: inst.id,
                  className: 'flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
                  title: `${inst.name}: Connected`
                },
                  h(ClientIcon, { client: inst.type, size: 14, title: '' }),
                  inst.name
                )
              )
            : [...new Set(Object.values(instances || {}).map(i => i.type))]
                .filter(type => !isTypeConnected(type))
                .map(type =>
                  h('span', {
                    key: type,
                    className: 'flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400',
                    title: `${type}: Offline`
                  },
                    h(ClientIcon, { client: type, size: 14, title: '' }),
                    'Offline'
                  )
                )
        )
        ), // Close header div

        // Body - scrollable
        h('div', { className: 'flex-1 overflow-y-auto px-6 py-4' },
        h('div', { className: 'space-y-4' },
          // Links textarea
          h('div', null,
            h('label', { className: 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1' },
              'Links'
            ),
            h(Textarea, {
              value: links,
              onChange: (e) => setLinks(e.target.value),
              onPaste: handlePaste,
              placeholder: 'Paste ED2K and/or magnet links\n\ned2k://|file|...\nmagnet:?xt=urn:btih:...',
              rows: 4,
              className: 'resize-y font-mono text-sm',
              autoFocus: true
            })
          ),

          // Torrent file upload (only if any BitTorrent client is connected)
          hasBitTorrentClient && h('div', null,
            h('label', { className: 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1' },
              'Or upload .torrent file(s)'
            ),
            // Show selected files
            torrentFiles.length > 0 && h('div', { className: 'space-y-2 mb-2' },
              torrentFiles.map((file, index) =>
                h('div', {
                  key: index,
                  className: 'flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg'
                },
                  h(Icon, { name: 'file', size: 16, className: 'text-blue-600 dark:text-blue-400 flex-shrink-0' }),
                  h('span', { className: 'flex-1 text-sm text-gray-900 dark:text-gray-100 truncate' },
                    file.name
                  ),
                  h(IconButton, {
                    variant: 'secondary',
                    icon: 'x',
                    iconSize: 14,
                    onClick: () => removeTorrentFile(index),
                    title: 'Remove file',
                    className: '!h-6 !w-6'
                  })
                )
              )
            ),
            // Drop zone (always visible to allow adding more files)
            h('div', {
              className: `border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                isDragging
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500'
              }`,
              onClick: () => fileInputRef.current?.click(),
              onDragOver: handleDragOver,
              onDragLeave: handleDragLeave,
              onDrop: handleDrop
            },
              h(Icon, { name: 'upload', size: 24, className: 'mx-auto mb-2 text-gray-400' }),
              h('p', { className: 'text-sm text-gray-600 dark:text-gray-400' },
                torrentFiles.length > 0
                  ? 'Drop more .torrent files or click to add'
                  : 'Drop .torrent files here or click to browse'
              ),
              h('input', {
                ref: fileInputRef,
                type: 'file',
                accept: '.torrent',
                multiple: true,
                onChange: handleFileSelect,
                className: 'hidden'
              })
            )
          ),

          // BitTorrent client selector - visible when 2+ BT instances and BT downloads
          (() => {
            const hasBtDownloads = magnetLinks.length > 0 || torrentFiles.length > 0;
            if (!hasBtDownloads || !showClientSelector) return null;

            return h('div', null,
              h('label', { className: 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1' },
                'BitTorrent Client'
              ),
              h(BitTorrentClientSelector, {
                connectedClients: btClients,
                selectedClientId,
                onSelectClient: selectClient,
                showSelector: showClientSelector,
                variant: 'buttons',
                label: null,
                showFullName: true
              })
            );
          })(),

          // aMule instance selector - visible when 2+ aMule instances and ED2K links
          ed2kLinks.length > 0 && h('div', null,
            showAmuleSelector && h('label', { className: 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1' },
              'aMule Instance'
            ),
            h(AmuleInstanceSelector, {
              connectedInstances: amuleInstances,
              selectedId: effectiveAmuleInstance,
              onSelect: selectAmuleInstance,
              showSelector: showAmuleSelector,
              label: null
            })
          ),

          // Category options toggle - only show when content is entered and at least one client is connected
          (() => {
            const hasDownloads = ed2kLinks.length > 0 || magnetLinks.length > 0 || torrentFiles.length > 0;
            const hasConnectedClient = amuleConnected || hasBitTorrentClient;
            const showOptionsSection = hasDownloads && hasConnectedClient;

            if (!showOptionsSection) return null;

            // Sort categories: Default first, then alphabetically
            const sortedCategories = [...categories].sort((a, b) => {
              const nameA = a.name || a.title || '';
              const nameB = b.name || b.title || '';
              if (nameA === 'Default') return -1;
              if (nameB === 'Default') return 1;
              return nameA.localeCompare(nameB);
            });

            return h('div', { className: 'space-y-3' },
                    h('span', { className: 'text-sm font-medium text-gray-700 dark:text-gray-300' },
                      'Category'
                    ),
                    // Unified category selector (applies to both ED2K and rtorrent)
                    h('div', null,
                      h(Select, {
                        value: useCustomCategory ? '__custom__' : selectedCategory,
                        onChange: handleCategoryChange,
                        options: [
                          ...sortedCategories.map(cat => ({
                            value: cat.name || cat.title,
                            label: cat.name || cat.title
                          })),
                          { value: '__custom__', label: '+ Create new category...' }
                        ],
                        className: 'w-full'
                      })
                    ),
                    // Custom category input (shown below when needed)
                    useCustomCategory && h(Input, {
                      type: 'text',
                      value: customCategory,
                      onChange: (e) => setCustomCategory(e.target.value),
                      placeholder: 'Enter new category name',
                      className: 'w-full'
                    })
            );
          })(),

          // Custom save path — independent section (only for capable BT clients with BT downloads)
          (() => {
            const hasBtDownloads = magnetLinks.length > 0 || torrentFiles.length > 0;
            if (!supportsCustomPath || !hasBtDownloads) return null;

            if (!showSavePath) {
              return h(Button, {
                variant: 'secondary',
                onClick: () => {
                  setShowSavePath(true);
                  // Pre-fill with selected category's path
                  const cat = categories.find(c => (c.name || c.title) === getFinalCategory());
                  if (cat?.path) setCustomSavePath(cat.path);
                },
                icon: 'folderOpen',
                className: 'w-full'
              }, 'Edit Save Path');
            }

            return h('div', { className: 'space-y-2' },
              h('div', { className: 'flex items-center justify-between' },
                h('span', { className: 'text-sm font-medium text-gray-700 dark:text-gray-300' },
                  'Save Path'
                ),
                h(IconButton, {
                  variant: 'secondary',
                  icon: 'chevronUp',
                  iconSize: 16,
                  onClick: () => { setShowSavePath(false); setCustomSavePath(''); },
                  title: 'Use category default',
                  className: '!h-7 !w-7'
                })
              ),
              h(PathPicker, {
                value: customSavePath,
                onChange: setCustomSavePath,
                categoryPaths,
                label: 'Path',
                hint: 'Path as seen by the download client'
              })
            );
          })(),

          // Summary (one line per network type)
          (links.trim() || torrentFiles.length > 0) && h('div', {
            className: 'text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 rounded p-2 space-y-0.5'
          }, getSummaryParts().map((part, i) => h('div', { key: i }, part)))
        )
        ), // Close body scrollable div

        // Footer
        h('div', { className: 'px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex gap-3 justify-end' },
          h(Button, {
            variant: 'secondary',
            onClick: onClose
          }, 'Cancel'),
          h(Button, {
            variant: 'success',
            onClick: handleSubmit,
            disabled: !canSubmit
          }, 'Add Download')
        )
      ) // Close modal box
    ) // Close overlay
  );
};

export default AddDownloadModal;
