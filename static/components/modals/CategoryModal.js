/**
 * CategoryModal Component
 *
 * Modal for creating and editing categories
 */

import React from 'https://esm.sh/react@18.2.0';
import { categoryColorToHex, hexToCategoryColor } from '../../utils/index.js';
import Portal from '../common/Portal.js';
import { Button, Input, Select, AlertBox, IconButton } from '../common/index.js';
import { useStaticData } from '../../contexts/StaticDataContext.js';
import { useModal } from '../../hooks/useModal.js';
import DirectoryBrowserModal from './DirectoryBrowserModal.js';

const { createElement: h, useState, useEffect, useCallback, useRef } = React;

// Debounce delay for path validation (ms)
const PATH_CHECK_DEBOUNCE = 500;

/**
 * Category create/edit modal
 * @param {boolean} show - Whether to show the modal
 * @param {string} mode - 'create' or 'edit'
 * @param {object} category - Category object (for edit mode)
 * @param {object} formData - Form data state
 * @param {function} onFormDataChange - Form data change handler
 * @param {function} onCreate - Create handler
 * @param {function} onUpdate - Update handler
 * @param {function} onClose - Close handler
 * @param {function} setError - Error setter function
 * @param {boolean} isDocker - Whether running in Docker
 */
const CategoryModal = ({
  show,
  mode,
  category,
  formData,
  onFormDataChange,
  onCreate,
  onUpdate,
  onClose,
  setError,
  isDocker = false
}) => {
  // Get client connection status and default paths from StaticData
  const { clientsConnected, clientDefaultPaths } = useStaticData();
  const isAmuleEnabled = clientsConnected?.amule === true;
  const isRtorrentEnabled = clientsConnected?.rtorrent === true;
  const isQbittorrentEnabled = clientsConnected?.qbittorrent === true;

  // Local state for path mapping
  const [enablePathMapping, setEnablePathMapping] = useState(false);
  const [pathMappings, setPathMappings] = useState({ amule: '', rtorrent: '', qbittorrent: '' });

  // Path permission warning state
  const [pathWarning, setPathWarning] = useState(null);
  const [mappingWarnings, setMappingWarnings] = useState({ amule: null, rtorrent: null, qbittorrent: null });

  // Track if we're in the initialization phase (to prevent clearing warnings on init)
  const isInitializingRef = useRef(false);

  // Debounce timers for path validation
  const pathDebounceRef = useRef(null);
  const amuleDebounceRef = useRef(null);
  const rtorrentDebounceRef = useRef(null);
  const qbittorrentDebounceRef = useRef(null);

  // Directory browser modal state
  const {
    modal: browserModal,
    open: openBrowserModal,
    close: closeBrowserModal
  } = useModal({ target: null, initialPath: '' });

  // Handle path mapping changes
  const handleMappingChange = useCallback((clientType, value) => {
    setPathMappings(prev => ({
      ...prev,
      [clientType]: value
    }));
  }, []);

  // Check path permissions (called on blur or after debounce)
  const checkPathPermissionsImmediate = useCallback(async (pathToCheck, warningKey = null) => {
    const setWarning = warningKey
      ? (msg) => setMappingWarnings(prev => ({ ...prev, [warningKey]: msg }))
      : setPathWarning;

    if (!pathToCheck?.trim()) {
      setWarning(null);
      return;
    }

    try {
      const res = await fetch('/api/config/check-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: pathToCheck.trim() })
      });

      if (res.ok) {
        const result = await res.json();
        if (!result.exists) {
          const dockerHint = result.isDocker
            ? ' When running in Docker, ensure the path is mounted as a volume or enable path mapping below.'
            : '';
          setWarning(`Directory not found. The app won't be able to manage files in this location.${dockerHint}`);
        } else if (!result.readable || !result.writable) {
          const missing = [];
          if (!result.readable) missing.push('read');
          if (!result.writable) missing.push('write');
          const dockerHint = result.isDocker
            ? ' When running in Docker, check the volume mount permissions.'
            : '';
          setWarning(`Missing ${missing.join(' and ')} permission. The app won't be able to manage files in this location.${dockerHint}`);
        } else {
          setWarning(null);
        }
      }
    } catch (err) {
      // Silently fail - don't block the user
      console.error('Failed to check path:', err);
    }
  }, []);

  // Debounced path permission check - waits until user stops typing
  const checkPathPermissionsDebounced = useCallback((pathToCheck, warningKey = null) => {
    // Choose the appropriate debounce ref based on warningKey
    const debounceRef = warningKey === 'amule' ? amuleDebounceRef
      : warningKey === 'rtorrent' ? rtorrentDebounceRef
      : warningKey === 'qbittorrent' ? qbittorrentDebounceRef
      : pathDebounceRef;

    // Clear existing timer
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Set new timer
    debounceRef.current = setTimeout(() => {
      checkPathPermissionsImmediate(pathToCheck, warningKey);
      debounceRef.current = null;
    }, PATH_CHECK_DEBOUNCE);
  }, [checkPathPermissionsImmediate]);

  // Immediate check (for blur and browser selection)
  const checkPathPermissions = useCallback((pathToCheck, warningKey = null) => {
    // Cancel any pending debounced check
    const debounceRef = warningKey === 'amule' ? amuleDebounceRef
      : warningKey === 'rtorrent' ? rtorrentDebounceRef
      : warningKey === 'qbittorrent' ? qbittorrentDebounceRef
      : pathDebounceRef;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    // Check immediately
    checkPathPermissionsImmediate(pathToCheck, warningKey);
  }, [checkPathPermissionsImmediate]);

  // Handle path selection from browser
  const handlePathSelected = useCallback((selectedPath) => {
    if (browserModal.target === 'path') {
      onFormDataChange({ ...formData, path: selectedPath });
      // Check path permissions immediately after selection
      checkPathPermissions(selectedPath);
    } else if (browserModal.target === 'amule') {
      handleMappingChange('amule', selectedPath);
      // Check path permissions immediately after selection
      checkPathPermissions(selectedPath, 'amule');
    } else if (browserModal.target === 'rtorrent') {
      handleMappingChange('rtorrent', selectedPath);
      // Check path permissions immediately after selection
      checkPathPermissions(selectedPath, 'rtorrent');
    } else if (browserModal.target === 'qbittorrent') {
      handleMappingChange('qbittorrent', selectedPath);
      // Check path permissions immediately after selection
      checkPathPermissions(selectedPath, 'qbittorrent');
    }
  }, [browserModal.target, formData, onFormDataChange, handleMappingChange, checkPathPermissions]);

  // Cleanup debounce timers when modal closes
  useEffect(() => {
    if (!show) {
      if (pathDebounceRef.current) clearTimeout(pathDebounceRef.current);
      if (amuleDebounceRef.current) clearTimeout(amuleDebounceRef.current);
      if (rtorrentDebounceRef.current) clearTimeout(rtorrentDebounceRef.current);
      if (qbittorrentDebounceRef.current) clearTimeout(qbittorrentDebounceRef.current);
    }
  }, [show]);

  // Initialize path mapping state and warnings when modal opens or category changes
  useEffect(() => {
    if (show) {
      // Mark as initializing to prevent clear effects from wiping warnings
      isInitializingRef.current = true;

      if (category?.pathMappings) {
        setEnablePathMapping(true);
        setPathMappings({
          amule: category.pathMappings.amule || '',
          rtorrent: category.pathMappings.rtorrent || '',
          qbittorrent: category.pathMappings.qbittorrent || ''
        });
      } else {
        setEnablePathMapping(false);
        setPathMappings({ amule: '', rtorrent: '', qbittorrent: '' });
      }

      // Reset warnings - will be re-checked via API below
      setPathWarning(null);
      setMappingWarnings({ amule: null, rtorrent: null, qbittorrent: null });

      // Clear initialization flag after a tick (after clear effects have run)
      setTimeout(() => {
        isInitializingRef.current = false;
      }, 0);
    }
  }, [show, category]);

  // Re-check path permissions when modal opens (to get fresh warnings with Docker hints)
  // Note: Only runs on modal open, not on every path keystroke
  useEffect(() => {
    if (show && mode === 'edit' && category) {
      const isDefaultCategory = category.name === 'Default' || category.title === 'Default';
      const hasPathMappings = category.pathMappings && (category.pathMappings.amule || category.pathMappings.rtorrent);

      // Check main path (only for non-Default categories without path mapping)
      // Use category.path (original value) not formData.path to avoid re-running on every keystroke
      if (!isDefaultCategory && category.path?.trim() && !hasPathMappings) {
        checkPathPermissions(category.path);
      }

      // Check path mappings if enabled (qBittorrent excluded - uses native API)
      if (hasPathMappings) {
        if (category.pathMappings.amule) {
          checkPathPermissions(category.pathMappings.amule, 'amule');
        }
        if (category.pathMappings.rtorrent) {
          checkPathPermissions(category.pathMappings.rtorrent, 'rtorrent');
        }
      }
    }
  }, [show, mode, category, checkPathPermissions]);

  // Reset path mapping when path is cleared (for non-Default categories)
  useEffect(() => {
    const isDefaultCategory = category?.name === 'Default' || category?.title === 'Default';
    if (!isDefaultCategory && !formData.path?.trim()) {
      setEnablePathMapping(false);
      setPathMappings({ amule: '', rtorrent: '', qbittorrent: '' });
    }
  }, [formData.path, category]);

  // Clear warnings when paths change or path mapping is enabled (but not during initialization)
  useEffect(() => {
    if (!isInitializingRef.current) {
      setPathWarning(null);
    }
  }, [formData.path, enablePathMapping]);

  useEffect(() => {
    if (!isInitializingRef.current) {
      setMappingWarnings(prev => ({ ...prev, amule: null }));
    }
  }, [pathMappings.amule]);

  useEffect(() => {
    if (!isInitializingRef.current) {
      setMappingWarnings(prev => ({ ...prev, rtorrent: null }));
    }
  }, [pathMappings.rtorrent]);

  useEffect(() => {
    if (!isInitializingRef.current) {
      setMappingWarnings(prev => ({ ...prev, qbittorrent: null }));
    }
  }, [pathMappings.qbittorrent]);

  if (!show) return null;

  const isEdit = mode === 'edit';
  const isDefault = isEdit && (category?.name === 'Default' || category?.title === 'Default');
  // Show path mapping section only for Default category or when a custom path is specified
  const showPathMapping = isDefault || !!formData.path?.trim();

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      setError('Category title is required');
      return;
    }

    // Build pathMappings object if enabled (and path mapping section is visible)
    let finalPathMappings = null;
    const canHavePathMapping = isDefault || !!formData.path?.trim();
    if (enablePathMapping && canHavePathMapping) {
      const mappings = {};
      if (pathMappings.amule?.trim()) {
        mappings.amule = pathMappings.amule.trim();
      }
      if (pathMappings.rtorrent?.trim()) {
        mappings.rtorrent = pathMappings.rtorrent.trim();
      }
      if (pathMappings.qbittorrent?.trim()) {
        mappings.qbittorrent = pathMappings.qbittorrent.trim();
      }
      if (Object.keys(mappings).length > 0) {
        finalPathMappings = mappings;
      }
    }

    if (isEdit) {
      onUpdate(
        category.id,
        formData.title,
        formData.path,
        formData.comment,
        formData.color,
        formData.priority,
        finalPathMappings
      );
    } else {
      onCreate(
        formData.title,
        formData.path,
        formData.comment,
        formData.color,
        formData.priority,
        finalPathMappings
      );
    }
  };

  return h(Portal, null,
    h('div', {
      className: 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-2 sm:p-4',
      onClick: onClose
    },
      h('div', {
        className: 'bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full max-h-[85vh] sm:max-h-[90vh] flex flex-col overflow-hidden',
        onClick: (e) => e.stopPropagation()
      },
      // Header
      h('div', { className: 'p-3 sm:p-4 pb-0' },
        h('h3', { className: 'text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100' },
          isEdit ? 'Edit Category' : 'Create New Category'
        )
      ),
      // Scrollable content
      h('div', { className: 'flex-1 overflow-y-auto p-3 sm:p-4' },
      h('form', { onSubmit: handleSubmit, className: 'space-y-3 sm:space-y-4' },
        // Title (not editable for Default category)
        h('div', null,
          h('label', { className: 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1' },
            'Title *'
          ),
          h(Input, {
            type: 'text',
            value: formData.title,
            onChange: (e) => onFormDataChange({ ...formData, title: e.target.value }),
            placeholder: 'e.g., Movies, Music, Software',
            className: 'w-full',
            required: true,
            disabled: isDefault
          }),
          isDefault && h('p', { className: 'text-xs text-gray-500 dark:text-gray-400 mt-1' },
            'The Default category cannot be renamed'
          )
        ),

        // Download Path (not editable for Default category)
        h('div', null,
          h('label', { className: 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1' },
            'Download Path'
          ),
          isDefault
            ? h('div', { className: 'space-y-2' },
                h('p', { className: 'text-sm text-gray-600 dark:text-gray-400 italic' },
                  'Each client uses its own configured default path:'
                ),
                isAmuleEnabled && h('div', { className: 'flex items-center gap-2 text-sm' },
                  h('span', { className: 'font-medium text-gray-500 dark:text-gray-400' }, 'aMule:'),
                  h('span', { className: 'font-mono text-gray-600 dark:text-gray-400' },
                    clientDefaultPaths?.amule || '(not available)'
                  )
                ),
                isRtorrentEnabled && h('div', { className: 'flex items-center gap-2 text-sm' },
                  h('span', { className: 'font-medium text-gray-500 dark:text-gray-400' }, 'rTorrent:'),
                  h('span', { className: 'font-mono text-gray-600 dark:text-gray-400' },
                    clientDefaultPaths?.rtorrent || '(not available)'
                  )
                ),
                isQbittorrentEnabled && h('div', { className: 'flex items-center gap-2 text-sm' },
                  h('span', { className: 'font-medium text-gray-500 dark:text-gray-400' }, 'qBittorrent:'),
                  h('span', { className: 'font-mono text-gray-600 dark:text-gray-400' },
                    clientDefaultPaths?.qbittorrent || '(not available)'
                  )
                )
              )
            : h('div', null,
                h('div', { className: 'flex gap-2' },
                  h(Input, {
                    type: 'text',
                    value: formData.path,
                    onChange: (e) => {
                      onFormDataChange({ ...formData, path: e.target.value });
                      // Debounced validation while typing (only when path mapping is disabled)
                      if (!enablePathMapping) {
                        checkPathPermissionsDebounced(e.target.value);
                      }
                    },
                    onBlur: enablePathMapping ? undefined : (e) => checkPathPermissions(e.target.value),
                    placeholder: '/path/to/downloads (leave empty for default)',
                    className: 'flex-1 font-mono'
                  }),
                  // Only show browse button when not in Docker (path is for download clients, not this app)
                  !isDocker && h(IconButton, {
                    type: 'button',
                    icon: 'folder',
                    variant: 'secondary',
                    onClick: () => openBrowserModal({ target: 'path', initialPath: formData.path || '/' }),
                    title: 'Browse directories'
                  })
                ),
                h('p', { className: 'text-xs text-gray-500 dark:text-gray-400 mt-1' },
                  'This is the path as seen by the download clients'
                ),
                !enablePathMapping && pathWarning && h(AlertBox, { type: 'warning', className: 'mt-2' }, pathWarning)
              )
        ),

        // Path Mapping Section (only show for Default category or when path is specified)
        showPathMapping && h('div', { className: 'border-t border-gray-200 dark:border-gray-700 pt-4' },
          // Path mapping checkbox
          h('label', { className: 'flex items-center gap-2 cursor-pointer' },
            h('input', {
              type: 'checkbox',
              checked: enablePathMapping,
              onChange: (e) => setEnablePathMapping(e.target.checked),
              className: 'w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 ' +
                'dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600'
            }),
            h('span', { className: 'text-sm font-medium text-gray-700 dark:text-gray-300' },
              'Enable path mapping (for Docker/container environments)'
            )
          ),

          // Info box (show when checkbox is checked)
          enablePathMapping && h(AlertBox, { type: 'info', className: 'mt-3 mb-0' },
            h('p', { className: 'font-medium mb-1' }, 'Path Mapping'),
            h('p', { className: 'text-sm' },
              isDefault
                ? 'For Default category files, specify where this app can find each client\'s default download directory. ' +
                  'The app will use these paths when checking file permissions or deleting files.'
                : 'Use this if your download clients and this app see different paths to the same files. ' +
                  'This is common when running in Docker containers with different volume mounts. ' +
                  'Each client can have its own mapping if they use different mount points.'
            )
          ),

          // Per-client path inputs (shown when checkbox enabled)
          enablePathMapping && h('div', { className: 'mt-3 space-y-3' },
            // aMule mapping (if aMule enabled)
            isAmuleEnabled && h('div', null,
              h('label', { className: 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1' },
                'aMule → App path'
              ),
              h('div', { className: 'flex gap-2' },
                h(Input, {
                  type: 'text',
                  value: pathMappings.amule,
                  onChange: (e) => {
                    handleMappingChange('amule', e.target.value);
                    checkPathPermissionsDebounced(e.target.value, 'amule');
                  },
                  onBlur: (e) => checkPathPermissions(e.target.value, 'amule'),
                  placeholder: isDefault ? '/mnt/amule-incoming' : '/mnt/amule-data/category-path',
                  className: 'flex-1 font-mono'
                }),
                h(IconButton, {
                  type: 'button',
                  icon: 'folder',
                  variant: 'secondary',
                  onClick: () => openBrowserModal({ target: 'amule', initialPath: pathMappings.amule || '/' }),
                  title: 'Browse directories'
                })
              ),
              h('p', { className: 'text-xs text-gray-500 dark:text-gray-400 mt-1' },
                isDefault
                  ? 'Path where this app can access aMule\'s default incoming directory'
                  : 'Path as this app sees aMule files for this category'
              ),
              mappingWarnings.amule && h(AlertBox, { type: 'warning', className: 'mt-2' }, mappingWarnings.amule)
            ),

            // rTorrent mapping (if rTorrent enabled)
            isRtorrentEnabled && h('div', null,
              h('label', { className: 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1' },
                'rTorrent → App path'
              ),
              h('div', { className: 'flex gap-2' },
                h(Input, {
                  type: 'text',
                  value: pathMappings.rtorrent,
                  onChange: (e) => {
                    handleMappingChange('rtorrent', e.target.value);
                    checkPathPermissionsDebounced(e.target.value, 'rtorrent');
                  },
                  onBlur: (e) => checkPathPermissions(e.target.value, 'rtorrent'),
                  placeholder: isDefault ? '/mnt/rtorrent-downloads' : '/mnt/rtorrent-data/category-path',
                  className: 'flex-1 font-mono'
                }),
                h(IconButton, {
                  type: 'button',
                  icon: 'folder',
                  variant: 'secondary',
                  onClick: () => openBrowserModal({ target: 'rtorrent', initialPath: pathMappings.rtorrent || '/' }),
                  title: 'Browse directories'
                })
              ),
              h('p', { className: 'text-xs text-gray-500 dark:text-gray-400 mt-1' },
                isDefault
                  ? 'Path where this app can access rTorrent\'s default download directory'
                  : 'Path as this app sees rTorrent files for this category'
              ),
              mappingWarnings.rtorrent && h(AlertBox, { type: 'warning', className: 'mt-2' }, mappingWarnings.rtorrent)
            ),

            // qBittorrent info message (shown when qBittorrent is enabled)
            isQbittorrentEnabled && h('div', null,
              h('label', { className: 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1' },
                'qBittorrent → App path'
              ),
              h('p', { className: 'text-sm text-gray-600 dark:text-gray-400 italic' },
                'Not required — file operations use qBittorrent\'s native API.'
              )
            ),

            // Message if no clients need path mapping
            !isAmuleEnabled && !isRtorrentEnabled && !isQbittorrentEnabled && h('p', {
              className: 'text-sm text-gray-500 dark:text-gray-400 italic'
            }, 'No download clients connected. Connect clients to configure path mappings.')
          )
        ),

        // Divider before Comment (only show when path mapping section is shown)
        showPathMapping && h('div', { className: 'border-t border-gray-200 dark:border-gray-700' }),

        // Comment
        h('div', null,
          h('label', { className: 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1' },
            'Comment'
          ),
          h(Input, {
            type: 'text',
            value: formData.comment,
            onChange: (e) => onFormDataChange({ ...formData, comment: e.target.value }),
            placeholder: 'Optional description',
            className: 'w-full'
          })
        ),

        // Color
        h('div', null,
          h('label', { className: 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1' },
            'Color'
          ),
          h('div', { className: 'flex gap-2' },
            h('input', {
              type: 'color',
              value: categoryColorToHex(formData.color),
              onChange: (e) => {
                onFormDataChange({ ...formData, color: hexToCategoryColor(e.target.value) });
              },
              className: 'w-16 h-9 sm:h-10 rounded-lg border border-gray-300 dark:border-gray-600 cursor-pointer'
            }),
            h(Input, {
              type: 'text',
              value: categoryColorToHex(formData.color).toUpperCase(),
              readOnly: true,
              className: 'flex-1 font-mono bg-gray-50 dark:bg-gray-700'
            })
          )
        ),

        // Priority (not editable for Default category)
        h('div', null,
          h('label', { className: 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1' },
            'Priority'
          ),
          h(Select, {
            value: formData.priority,
            onChange: (e) => onFormDataChange({ ...formData, priority: parseInt(e.target.value) }),
            options: [
              { value: 0, label: 'Normal' },
              { value: 1, label: 'High' },
              { value: 2, label: 'Low' },
              { value: 3, label: 'Auto' }
            ],
            className: 'w-full',
            disabled: isDefault
          }),
          isDefault && h('p', { className: 'text-xs text-gray-500 dark:text-gray-400 mt-1' },
            'Priority is managed by each client for the Default category'
          )
        ),

        // Buttons
        h('div', { className: 'flex gap-3 justify-end pt-4' },
          h(Button, {
            type: 'button',
            variant: 'secondary',
            onClick: onClose
          }, 'Cancel'),
          h(Button, {
            type: 'submit',
            variant: 'primary'
          }, isEdit ? 'Update Category' : 'Create Category')
        )
      )
      ), // Close scrollable content div

      // Directory browser modal
      h(DirectoryBrowserModal, {
        show: browserModal.show,
        initialPath: browserModal.initialPath,
        onSelect: handlePathSelected,
        onClose: closeBrowserModal,
        title: 'Select Directory'
      })
    )
  ));
};

export default CategoryModal;
