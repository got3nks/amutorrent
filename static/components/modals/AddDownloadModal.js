/**
 * AddDownloadModal Component
 *
 * Modal for adding downloads via ED2K links, magnet links, or .torrent files
 * Supports both aMule (ED2K) and rtorrent (magnet/torrent)
 */

import React from 'https://esm.sh/react@18.2.0';
import Portal from '../common/Portal.js';
import { Button, Select, Textarea, Icon, Input, IconButton, ClientIcon } from '../common/index.js';
import { useClientFilter } from '../../contexts/ClientFilterContext.js';
import { useStaticData } from '../../contexts/StaticDataContext.js';

const { createElement: h, useState, useRef, useCallback } = React;

/**
 * Add download modal
 * @param {boolean} show - Whether to show the modal
 * @param {function} onAddEd2kLinks - Handler for ED2K links (links, categoryId)
 * @param {function} onAddMagnetLinks - Handler for magnet links (links, label)
 * @param {function} onAddTorrentFile - Handler for .torrent file (file, label)
 * @param {function} onClose - Close handler
 */
const AddDownloadModal = ({
  show,
  onAddEd2kLinks,
  onAddMagnetLinks,
  onAddTorrentFile,
  onClose
}) => {
  // Get client connection status from context
  const { amuleConnected, rtorrentConnected } = useClientFilter();
  // Get unified categories from context
  const { dataCategories: categories } = useStaticData();
  // State
  const [links, setLinks] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Default');
  const [customCategory, setCustomCategory] = useState('');
  const [useCustomCategory, setUseCustomCategory] = useState(false);
  const [torrentFile, setTorrentFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const fileInputRef = useRef(null);

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
  const hasMagnetLinks = magnetLinks.length > 0 && rtorrentConnected;
  const hasTorrentFile = torrentFile && rtorrentConnected;
  const canSubmit = hasEd2kLinks || hasMagnetLinks || hasTorrentFile;

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

    // Add ED2K links if any (use category name - backend will resolve to amuleId)
    if (ed2kLinks.length > 0 && amuleConnected && onAddEd2kLinks) {
      // Find category by name to get ID for legacy API
      const cat = categories.find(c => (c.name || c.title) === finalCategory);
      const categoryId = cat?.id ?? 0;
      onAddEd2kLinks(ed2kLinks, categoryId);
    }

    // Add magnet links if any (use label from category name)
    if (magnetLinks.length > 0 && rtorrentConnected && onAddMagnetLinks) {
      onAddMagnetLinks(magnetLinks, finalLabel);
    }

    // Add torrent file if any
    if (torrentFile && rtorrentConnected && onAddTorrentFile) {
      onAddTorrentFile(torrentFile, finalLabel);
    }

    // Reset and close
    setLinks('');
    setTorrentFile(null);
    setSelectedCategory('Default');
    setCustomCategory('');
    setUseCustomCategory(false);
    setShowOptions(false);
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
    const file = e.target.files?.[0];
    if (file && file.name.endsWith('.torrent')) {
      setTorrentFile(file);
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
    const file = e.dataTransfer.files?.[0];
    if (file && file.name.endsWith('.torrent')) {
      setTorrentFile(file);
    }
  };

  const removeTorrentFile = () => {
    setTorrentFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Summary of what will be added
  const getSummary = () => {
    const parts = [];
    const finalCategory = getFinalCategory();
    if (ed2kLinks.length > 0) {
      let ed2kPart = `${ed2kLinks.length} ED2K link${ed2kLinks.length > 1 ? 's' : ''}`;
      if (!amuleConnected) {
        ed2kPart += ' (aMule offline)';
      } else if (finalCategory && finalCategory !== 'Default') {
        ed2kPart += ` → ${finalCategory}`;
      }
      parts.push(ed2kPart);
    }
    if (magnetLinks.length > 0) {
      let magnetPart = `${magnetLinks.length} magnet link${magnetLinks.length > 1 ? 's' : ''}`;
      if (!rtorrentConnected) {
        magnetPart += ' (rtorrent offline)';
      } else {
        const finalLabel = getFinalLabel();
        if (finalLabel) magnetPart += ` → ${finalLabel}`;
      }
      parts.push(magnetPart);
    }
    if (torrentFile) {
      let torrentPart = '1 torrent file';
      if (!rtorrentConnected) {
        torrentPart += ' (rtorrent offline)';
      } else {
        const finalLabel = getFinalLabel();
        if (finalLabel) torrentPart += ` → ${finalLabel}`;
      }
      parts.push(torrentPart);
    }
    if (invalidLinks.length > 0) {
      parts.push(`${invalidLinks.length} invalid link${invalidLinks.length > 1 ? 's' : ''}`);
    }
    return parts.join(', ');
  };

  return h(Portal, null,
    h('div', {
      className: 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4',
      onClick: onClose
    },
      h('div', {
        className: 'bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full p-6',
        onClick: (e) => e.stopPropagation()
      },
        h('h3', { className: 'text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4' },
          'Add Download'
        ),

        // Connection status indicators with network icons
        h('div', { className: 'flex gap-2 mb-4' },
          h('span', {
            className: `flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium ${
              amuleConnected
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
            }`,
            title: `aMule: ${amuleConnected ? 'Connected' : 'Offline'}`
          },
            h(ClientIcon, { client: 'amule', size: 14, title: '' }),
            amuleConnected ? 'Connected' : 'Offline'
          ),
          h('span', {
            className: `flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium ${
              rtorrentConnected
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
            }`,
            title: `rtorrent: ${rtorrentConnected ? 'Connected' : 'Offline'}`
          },
            h(ClientIcon, { client: 'rtorrent', size: 14, title: '' }),
            rtorrentConnected ? 'Connected' : 'Offline'
          )
        ),

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

          // Torrent file upload (only if rtorrent is connected)
          rtorrentConnected && h('div', null,
            h('label', { className: 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1' },
              'Or upload .torrent file'
            ),
            torrentFile
              ? h('div', {
                  className: 'flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg'
                },
                  h(Icon, { name: 'file', size: 20, className: 'text-blue-600 dark:text-blue-400' }),
                  h('span', { className: 'flex-1 text-sm text-gray-900 dark:text-gray-100 truncate' },
                    torrentFile.name
                  ),
                  h(IconButton, {
                    variant: 'secondary',
                    icon: 'x',
                    iconSize: 16,
                    onClick: removeTorrentFile,
                    title: 'Remove file',
                    className: '!h-7 !w-7'
                  })
                )
              : h('div', {
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
                    'Drop .torrent file here or click to browse'
                  ),
                  h('input', {
                    ref: fileInputRef,
                    type: 'file',
                    accept: '.torrent',
                    onChange: handleFileSelect,
                    className: 'hidden'
                  })
                )
          ),

          // Category options toggle - only show when content is entered and at least one client is connected
          (() => {
            const hasDownloads = ed2kLinks.length > 0 || magnetLinks.length > 0 || torrentFile;
            const hasConnectedClient = amuleConnected || rtorrentConnected;
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

            return h('div', null,
              !showOptions
                ? h(Button, {
                    variant: 'secondary',
                    onClick: () => setShowOptions(true),
                    icon: 'folder',
                    className: 'w-full'
                  }, 'Select Category')
                : h('div', { className: 'space-y-3' },
                    // Header with collapse button
                    h('div', { className: 'flex items-center justify-between' },
                      h('span', { className: 'text-sm font-medium text-gray-700 dark:text-gray-300' },
                        'Download Options'
                      ),
                      h(IconButton, {
                        variant: 'secondary',
                        icon: 'chevronUp',
                        iconSize: 16,
                        onClick: () => setShowOptions(false),
                        title: 'Hide options',
                        className: '!h-7 !w-7'
                      })
                    ),
                    // Unified category selector (applies to both ED2K and rtorrent)
                    h('div', null,
                      h('label', { className: 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1' },
                        'Category'
                      ),
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
                  )
            );
          })(),

          // Summary
          (links.trim() || torrentFile) && h('div', {
            className: 'text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 rounded p-2'
          }, getSummary())
        ),

        // Action buttons
        h('div', { className: 'flex gap-3 justify-end mt-6' },
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
      )
    )
  );
};

export default AddDownloadModal;
