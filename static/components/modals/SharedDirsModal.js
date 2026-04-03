/**
 * SharedDirsModal Component (Experimental)
 *
 * Modal for managing aMule's shareddir.dat file.
 * Shows root shared directories with add/remove and automatic subdirectory expansion.
 */

import React from 'https://esm.sh/react@18.2.0';
import Portal from '../common/Portal.js';
import { Button, Icon, IconButton, AlertBox, LoadingSpinner, AmuleInstanceSelector, Tooltip, Input } from '../common/index.js';
import DirectoryBrowserModal from './DirectoryBrowserModal.js';
import { useAmuleInstanceSelector } from '../../hooks/useAmuleInstanceSelector.js';

const { createElement: h, useState, useEffect, useCallback } = React;

/**
 * @param {boolean} show
 * @param {function} onClose
 */
const SharedDirsModal = ({ show, onClose }) => {
  const {
    connectedInstances: amuleInstances,
    showSelector: showAmuleSelector,
    selectedId: instanceId,
    selectInstance: selectAmuleInstance
  } = useAmuleInstanceSelector();

  // State
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Config state (for unconfigured instances)
  const [configured, setConfigured] = useState(false);
  const [datPath, setDatPath] = useState('');
  const [canWrite, setCanWrite] = useState(true);
  const [isDocker, setIsDocker] = useState(false);
  const [configInput, setConfigInput] = useState('');

  // Directories state
  const [roots, setRoots] = useState([]);
  const [inaccessibleRoots, setInaccessibleRoots] = useState([]);
  const [dirty, setDirty] = useState(false);

  // Add directory input
  const [newDir, setNewDir] = useState('');
  // Edit path mode
  const [editingPath, setEditingPath] = useState(false);
  // Directory browser modals
  const [showFileBrowser, setShowFileBrowser] = useState(false);
  const [showDirBrowser, setShowDirBrowser] = useState(false);

  // Clear messages after timeout
  useEffect(() => {
    if (successMessage) {
      const t = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(t);
    }
  }, [successMessage]);

  // Fetch data when modal opens or instance changes
  const fetchData = useCallback(async () => {
    if (!instanceId) return;
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    setDirty(false);
    try {
      const res = await fetch(`/api/amule/shared-dirs?instanceId=${encodeURIComponent(instanceId)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setConfigured(data.configured);
      setDatPath(data.path || '');
      setCanWrite(data.canWrite !== false);
      setIsDocker(data.isDocker || false);
      setRoots(data.roots || []);
      setInaccessibleRoots(data.inaccessibleRoots || []);
    } catch (err) {
      setError(`Failed to load: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [instanceId]);

  useEffect(() => {
    if (show && instanceId) fetchData();
  }, [show, instanceId, fetchData]);

  // Configure path
  const handleConfigure = async () => {
    if (!configInput.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/amule/shared-dirs/config?instanceId=${encodeURIComponent(instanceId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sharedDirDatPath: configInput.trim() })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `HTTP ${res.status}`);
      }
      // Refresh state
      await fetchData();
      setConfigInput('');
      setEditingPath(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Remove configuration
  const handleRemoveConfig = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/amule/shared-dirs/config?instanceId=${encodeURIComponent(instanceId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sharedDirDatPath: '' })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `HTTP ${res.status}`);
      }
      await fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Add directory
  const handleAddDir = () => {
    const dir = newDir.trim();
    if (!dir) return;

    // Check if it's a child of an existing root
    const parent = roots.find(r => dir.startsWith(r + '/'));
    if (parent) {
      setError(`"${dir}" is already covered by "${parent}"`);
      return;
    }

    // Check if it's a parent of existing roots — collapse children
    const children = roots.filter(r => r.startsWith(dir + '/'));
    const updated = roots.filter(r => !r.startsWith(dir + '/'));
    updated.push(dir);
    updated.sort();
    setRoots(updated);
    setDirty(true);
    setNewDir('');
    setError(null);

    if (children.length > 0) {
      setSuccessMessage(`Added "${dir}" and collapsed ${children.length} subdirector${children.length === 1 ? 'y' : 'ies'}`);
    }
  };

  // Remove directory
  const handleRemoveDir = (dir) => {
    setRoots(prev => prev.filter(r => r !== dir));
    setDirty(true);
  };

  // Save directories
  const handleSave = async () => {
    if (roots.length === 0) {
      setError('Add at least one directory');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/amule/shared-dirs?instanceId=${encodeURIComponent(instanceId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directories: roots })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
      setDirty(false);
      setSuccessMessage(`Saved ${data.roots} root(s) expanded to ${data.totalDirs} directories. aMule shared files reloaded.`);
      if (data.warnings?.length) {
        setError(`Warnings: ${data.warnings.join('; ')}`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Rescan & Reload
  const handleRescan = async () => {
    setReloading(true);
    setError(null);
    try {
      const res = await fetch(`/api/amule/shared-dirs/reload?instanceId=${encodeURIComponent(instanceId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
      let msg = 'Shared files reloaded.';
      if (data.added > 0 || data.removed > 0) {
        const parts = [];
        if (data.added > 0) parts.push(`${data.added} new`);
        if (data.removed > 0) parts.push(`${data.removed} removed`);
        msg = `Rescanned: ${parts.join(', ')} subdirector${data.added + data.removed === 1 ? 'y' : 'ies'}. Total: ${data.totalDirs} dirs.`;
      }
      setSuccessMessage(msg);
      if (data.warnings?.length) {
        setError(`Warnings: ${data.warnings.join('; ')}`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setReloading(false);
    }
  };

  if (!show) return null;

  const isWorking = loading || saving || reloading;

  // Info box content
  const infoBox = h(AlertBox, { type: 'info', className: 'mb-4' },
    h('p', { className: 'text-xs' },
      'Shared directories must be accessible by both aMuTorrent and aMule at the same path. ',
      'aMule sets shareddir.dat to read-only — aMuTorrent must run as the same user to modify it.',
      isDocker && h('span', null,
        h('br'),
        'In Docker, both containers must use the same UID (e.g. PUID=1000) and share identical volume mount paths for the shared directories.'
      )
    )
  );

  // Unconfigured state
  const setupView = h('div', { className: 'space-y-4' },
    infoBox,
    h('p', { className: 'text-sm text-gray-600 dark:text-gray-400' },
      'Enter the path to your aMule shareddir.dat file to enable shared directory management.'
    ),
    h('div', { className: 'flex items-center gap-2' },
      h(Input, {
        value: configInput,
        onChange: (e) => setConfigInput(e.target.value),
        onKeyDown: (e) => e.key === 'Enter' && handleConfigure(),
        placeholder: '/home/amule/.aMule/shareddir.dat',
        className: 'flex-1 font-mono',
        disabled: saving
      }),
      h(IconButton, {
        variant: 'secondary',
        icon: 'folder',
        iconSize: 14,
        onClick: () => setShowFileBrowser(true),
        title: 'Browse'
      }),
      h(Button, {
        variant: 'primary',
        onClick: handleConfigure,
        disabled: !configInput.trim() || saving
      }, saving ? 'Saving...' : 'Configure')
    )
  );

  // Configured state
  const managementView = h('div', { className: 'space-y-4' },
    infoBox,

    // Path display / edit
    !editingPath
      ? h('div', { className: 'flex items-center gap-2' },
          h('span', { className: 'text-xs text-gray-500 dark:text-gray-500 font-mono truncate' }, datPath),
          h(IconButton, {
            variant: 'secondary',
            icon: 'edit',
            iconSize: 12,
            onClick: () => { setEditingPath(true); setConfigInput(datPath); },
            title: 'Change path',
            className: '!h-5 !w-5 flex-shrink-0'
          }),
          h(IconButton, {
            variant: 'secondary',
            icon: 'x',
            iconSize: 12,
            onClick: handleRemoveConfig,
            title: 'Remove configuration',
            className: '!h-5 !w-5 flex-shrink-0',
            disabled: isWorking
          })
        )
      : h('div', { className: 'flex items-center gap-2' },
          h(Input, {
            value: configInput,
            onChange: (e) => setConfigInput(e.target.value),
            onKeyDown: (e) => {
              if (e.key === 'Enter') { handleConfigure(); setEditingPath(false); }
              if (e.key === 'Escape') setEditingPath(false);
            },
            className: 'flex-1 font-mono',
            autoFocus: true
          }),
          h(Button, {
            variant: 'primary',
            onClick: () => { handleConfigure(); setEditingPath(false); },
            disabled: !configInput.trim() || saving,
            className: '!py-1 !px-2 text-xs'
          }, 'Save'),
          h(Button, {
            variant: 'secondary',
            onClick: () => setEditingPath(false),
            className: '!py-1 !px-2 text-xs'
          }, 'Cancel')
        ),

    // UID mismatch warning
    !canWrite && h(AlertBox, { type: 'warning', className: 'mt-2' },
      h('p', { className: 'text-xs' },
        'The file is read-only and owned by a different user. Both containers must run with the same UID (e.g. PUID=1000) for aMuTorrent to modify it.'
      )
    ),

    // Directory list
    roots.length > 0
      ? h('div', { className: 'space-y-1' },
          h('label', { className: 'block text-sm font-medium text-gray-700 dark:text-gray-300' },
            `Shared directories (${roots.length})`
          ),
          h('div', { className: 'max-h-60 overflow-y-auto space-y-1' },
            roots.map(dir => {
              const isInaccessible = inaccessibleRoots.includes(dir);
              return h('div', {
                key: dir,
                className: `flex items-center gap-2 px-3 py-2 rounded-lg group ${
                  isInaccessible
                    ? 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'
                    : 'bg-gray-50 dark:bg-gray-700/50'
                }`
              },
                h(Icon, { name: 'folder', size: 14, className: isInaccessible ? 'text-yellow-500 flex-shrink-0' : 'text-gray-400 flex-shrink-0' }),
                h('span', { className: `flex-1 text-sm font-mono truncate ${isInaccessible ? 'text-yellow-700 dark:text-yellow-300' : 'text-gray-900 dark:text-gray-100'}` }, dir),
                isInaccessible && h(Tooltip, { content: 'Path not accessible from aMuTorrent container. It will be preserved when saving.', position: 'top' },
                  h('span', { className: 'flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400 flex-shrink-0 cursor-help' },
                    h(Icon, { name: 'alertTriangle', size: 12 }), 'Path not found'
                  )
                ),
                h(IconButton, {
                  variant: 'secondary',
                  icon: 'x',
                  iconSize: 14,
                  onClick: () => handleRemoveDir(dir),
                  title: isInaccessible ? 'Remove directory (will also remove from aMule)' : 'Remove directory',
                  className: '!h-6 !w-6 opacity-0 group-hover:opacity-100 transition-opacity',
                  disabled: isWorking
                })
              );
            })
          )
        )
      : !loading && h('p', { className: 'text-sm text-gray-500 dark:text-gray-400 italic' },
          'No shared directories configured.'
        ),

    // Add directory
    h('p', { className: 'text-xs text-gray-500 dark:text-gray-400 italic' },
      'Add root directories only — all subdirectories will be automatically scanned and shared.'
    ),
    h('div', { className: 'flex items-center gap-2' },
      h(Input, {
        value: newDir,
        onChange: (e) => setNewDir(e.target.value),
        onKeyDown: (e) => e.key === 'Enter' && handleAddDir(),
        placeholder: '/path/to/shared/directory',
        className: 'flex-1 font-mono',
        disabled: isWorking
      }),
      h(IconButton, {
        variant: 'secondary',
        icon: 'folder',
        iconSize: 14,
        onClick: () => setShowDirBrowser(true),
        title: 'Browse'
      }),
      h(Button, {
        variant: 'secondary',
        onClick: handleAddDir,
        disabled: !newDir.trim() || isWorking
      }, 'Add')
    ),

    // Success message
    successMessage && h(AlertBox, { type: 'success' },
      h('p', { className: 'text-xs' }, successMessage)
    )
  );

  return h(React.Fragment, null,
    h(Portal, null,
    h('div', {
      className: 'fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/50',
      onClick: (e) => e.target === e.currentTarget && !dirty && onClose()
    },
      h('div', {
        className: 'modal-full w-full max-w-lg bg-white dark:bg-gray-800 rounded-lg shadow-xl max-h-[85vh] sm:max-h-[90vh] flex flex-col overflow-hidden'
      },
        // Header
        h('div', { className: 'flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700' },
          h('div', { className: 'flex items-center gap-3' },
            h('h2', { className: 'text-lg font-semibold text-gray-900 dark:text-gray-100' }, 'Manage Shared Dirs'),
            h('span', { className: 'px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300' }, 'Experimental')
          ),
          h('button', {
            onClick: onClose,
            className: 'p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          }, h(Icon, { name: 'x', size: 20 }))
        ),

        // Instance selector (multi-instance only)
        showAmuleSelector && h('div', { className: 'px-6 pt-4' },
          h(AmuleInstanceSelector, {
            connectedInstances: amuleInstances,
            selectedId: instanceId,
            onSelect: selectAmuleInstance,
            showSelector: showAmuleSelector,
            label: 'aMule Instance'
          })
        ),

        // Content
        h('div', { className: 'flex-1 overflow-y-auto px-6 py-4' },
          loading
            ? h('div', { className: 'flex items-center justify-center py-8' },
                h(LoadingSpinner, { size: 24 }),
                h('span', { className: 'ml-2 text-sm text-gray-500' }, 'Loading...')
              )
            : !instanceId
              ? h('p', { className: 'text-sm text-gray-500 dark:text-gray-400' }, 'No aMule instance connected.')
              : configured ? managementView : setupView,

          // Error
          error && h(AlertBox, { type: 'error', className: 'mt-4' },
            h('p', { className: 'text-xs' }, error)
          )
        ),

        // Footer (only when configured)
        configured && h('div', { className: 'px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-between' },
          h('div', null,
            h(Button, {
              variant: 'secondary',
              onClick: handleRescan,
              disabled: isWorking,
              icon: 'refresh'
            }, reloading ? 'Rescanning...' : 'Rescan & Reload')
          ),
          h('div', { className: 'flex gap-3' },
            h(Button, {
              variant: 'secondary',
              onClick: onClose
            }, 'Cancel'),
            h(Button, {
              variant: 'success',
              onClick: handleSave,
              disabled: !dirty || isWorking || roots.length === 0
            }, saving ? 'Saving...' : 'Save')
          )
        )
      )
    )
    ), // close Portal

    // File browser for shareddir.dat path selection
    h(DirectoryBrowserModal, {
      show: showFileBrowser,
      mode: 'file',
      initialPath: (() => {
        const p = configInput || datPath || '/';
        const lastSlash = p.lastIndexOf('/');
        return lastSlash > 0 ? p.substring(0, lastSlash) : '/';
      })(),
      title: 'Select shareddir.dat',
      onSelect: (filePath) => {
        setConfigInput(filePath);
        setShowFileBrowser(false);
      },
      onClose: () => setShowFileBrowser(false)
    }),

    // Directory browser for adding shared directories
    h(DirectoryBrowserModal, {
      show: showDirBrowser,
      mode: 'directory',
      initialPath: roots.length > 0 ? roots[roots.length - 1] : '/',
      title: 'Select shared directory',
      onSelect: (dirPath) => {
        setNewDir(dirPath);
        setShowDirBrowser(false);
      },
      onClose: () => setShowDirBrowser(false)
    })
  );
};

export default SharedDirsModal;
