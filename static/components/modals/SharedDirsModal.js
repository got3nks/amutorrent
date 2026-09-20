/**
 * SharedDirsModal Component
 *
 * Manages aMule's shared folders over the EC protocol (amule-org/amule#530).
 * aMule owns the list, validates the paths and expands recursive roots itself,
 * so this is a straight read/edit/write of what the daemon reports.
 *
 * Cores predating #530 cannot be configured this way at all - the API answers
 * supported:false and the editor is replaced by an explanation.
 */

import React from 'https://esm.sh/react@18.2.0';
import Portal from '../common/Portal.js';
import { Button, Icon, IconButton, AlertBox, LoadingSpinner, AmuleInstanceSelector, Tooltip, Input } from '../common/index.js';
import DirectoryBrowserModal from './DirectoryBrowserModal.js';
import { useAmuleInstanceSelector } from '../../hooks/useAmuleInstanceSelector.js';

const { createElement: h, useState, useEffect, useCallback } = React;

// EC_TAG_SHAREDDIR_ERROR values. Numeric on the wire so the daemon's locale
// never reaches this UI, which means the wording belongs here.
const REJECTION_REASON = {
  1: 'not found, or not a directory',
  2: 'not readable by aMule'
};
const describeRejection = (code) => REJECTION_REASON[code] || `refused (code ${code})`;

/**
 * @param {boolean} show
 * @param {function} onClose
 * @param {string} [initialInstanceId] - Pre-select this instance when opened from Settings
 */
const SharedDirsModal = ({ show, onClose, initialInstanceId = null }) => {
  const [controlledId, setControlledId] = useState(initialInstanceId);
  useEffect(() => {
    if (initialInstanceId) setControlledId(initialInstanceId);
  }, [initialInstanceId]);

  const selectorOptions = initialInstanceId
    ? { selectedId: controlledId, onSelect: setControlledId }
    : {};

  const {
    connectedInstances: amuleInstances,
    showSelector: showAmuleSelector,
    selectedId: instanceId,
    selectedInstance,
    selectInstance: selectAmuleInstance
  } = useAmuleInstanceSelector(selectorOptions);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Whether this daemon advertises EC_TAG_CAN_SHAREDDIRS_CONFIG.
  const [supported, setSupported] = useState(true);
  const [unsupportedReason, setUnsupportedReason] = useState(null);

  // [{ path, recursive }] exactly as aMule reports it.
  const [dirs, setDirs] = useState([]);
  const [rejected, setRejected] = useState([]);
  const [dirty, setDirty] = useState(false);

  const [newDir, setNewDir] = useState('');
  const [showDirBrowser, setShowDirBrowser] = useState(false);

  // Switching instances reloads from the newly selected daemon, which would
  // silently drop unsaved edits - each instance has its own folder list.
  const selectInstance = useCallback((id) => {
    if (id === instanceId) return;
    if (dirty && !window.confirm('Discard unsaved changes to this instance?')) return;
    setDirty(false);
    selectAmuleInstance(id);
  }, [instanceId, dirty, selectAmuleInstance]);

  const load = useCallback(async () => {
    if (!instanceId) return;
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    setRejected([]);
    try {
      const res = await fetch(`/api/amule/shared-dirs?instanceId=${encodeURIComponent(instanceId)}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Failed to load shared folders');
      const data = body.data || body;
      setSupported(data.supported !== false);
      setUnsupportedReason(data.supported === false ? data.reason : null);
      setDirs(Array.isArray(data.dirs) ? data.dirs : []);
      setDirty(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [instanceId]);

  useEffect(() => {
    if (show && instanceId) load();
  }, [show, instanceId, load]);

  const addDir = () => {
    const path = newDir.trim().replace(/\/+$/, '') || '/';
    if (!path) return;
    if (dirs.some(d => d.path === path)) {
      setError(`"${path}" is already shared`);
      return;
    }
    setDirs([...dirs, { path, recursive: false }]);
    setNewDir('');
    setError(null);
    setDirty(true);
  };

  const removeDir = (path) => {
    setDirs(dirs.filter(d => d.path !== path));
    setDirty(true);
  };

  const toggleRecursive = (path) => {
    setDirs(dirs.map(d => (d.path === path ? { ...d, recursive: !d.recursive } : d)));
    setDirty(true);
  };

  const save = async () => {
    // aMule replaces the whole list, so an empty one unshares everything. The
    // API refuses that without an explicit acknowledgement.
    let confirmUnshareAll = false;
    if (dirs.length === 0) {
      if (!window.confirm('This will stop sharing every folder. Continue?')) return;
      confirmUnshareAll = true;
    }

    setSaving(true);
    setError(null);
    setSuccessMessage(null);
    setRejected([]);
    try {
      const res = await fetch('/api/amule/shared-dirs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceId, dirs, confirmUnshareAll })
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Failed to save shared folders');
      const data = body.data || body;

      // A non-empty `rejected` is a partial apply, not a failure: everything
      // that validated was still saved.
      setRejected(data.rejected || []);
      setSuccessMessage(
        `Saved ${data.applied} of ${data.total} folder${data.total === 1 ? '' : 's'}.`
        + ' aMule will rescan shortly.'
      );
      setDirty(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const reload = async () => {
    setReloading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await fetch('/api/amule/shared-dirs/reload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceId })
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Reload failed');
      setSuccessMessage('aMule is rescanning its shared folders.');
    } catch (err) {
      setError(err.message);
    } finally {
      setReloading(false);
    }
  };

  if (!show) return null;

  const isWorking = loading || saving || reloading;

  // Too old to configure: explain what is actually missing rather than telling
  // the user to update and leaving them to guess whether it helped.
  const unsupportedView = h('div', { className: 'space-y-4' },
    h(AlertBox, { type: 'warning' },
      h('p', { className: 'text-sm font-medium mb-1' }, 'Shared folder management is not available'),
      h('p', { className: 'text-xs' },
        unsupportedReason
          || 'This aMule build does not support configuring shared folders over the EC protocol.'
      ),
      h('p', { className: 'text-xs mt-2' },
        'Support was added to aMule after 3.0.1 and is not in a released version yet, so an ',
        'up-to-date release will not necessarily have it. Until your core includes it, edit ',
        'shared folders in aMule itself.'
      )
    )
  );

  const editorView = h('div', { className: 'space-y-4' },
    h(AlertBox, { type: 'info' },
      h('p', { className: 'text-xs' },
        'These paths are read by aMule, on the machine aMule runs on. ',
        'Mark a folder recursive to share everything beneath it - aMule expands it itself.'
      )
    ),

    rejected.length > 0 && h(AlertBox, { type: 'warning' },
      h('p', { className: 'text-xs font-medium mb-1' },
        `aMule refused ${rejected.length} folder${rejected.length === 1 ? '' : 's'}; the rest were saved:`
      ),
      h('ul', { className: 'text-xs space-y-0.5' },
        rejected.map((r, i) => h('li', { key: i, className: 'font-mono' },
          `${r.path} - ${describeRejection(r.error)}`
        ))
      )
    ),

    h('div', { className: 'flex items-center gap-2' },
      h(Input, {
        value: newDir,
        onChange: (e) => setNewDir(e.target.value),
        onKeyDown: (e) => e.key === 'Enter' && addDir(),
        placeholder: '/path/to/share',
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
      h(Button, { variant: 'primary', onClick: addDir, disabled: !newDir.trim() || isWorking }, 'Add')
    ),

    dirs.length > 0
      ? h('div', null,
          h('div', { className: 'text-xs font-medium text-gray-500 dark:text-gray-400 mb-1' },
            `Shared folders (${dirs.length})`
          ),
          h('ul', { className: 'divide-y divide-gray-200 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded' },
            dirs.map(dir => h('li', {
              key: dir.path,
              className: 'flex items-center gap-2 px-3 py-2'
            },
              h('span', { className: 'flex-1 text-xs font-mono truncate', title: dir.path }, dir.path),
              h(Tooltip, { content: dir.recursive ? 'Sharing all subfolders' : 'Sharing this folder only' },
                h('label', { className: 'flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400 cursor-pointer' },
                  h('input', {
                    type: 'checkbox',
                    checked: dir.recursive === true,
                    onChange: () => toggleRecursive(dir.path),
                    disabled: isWorking,
                    className: 'w-3.5 h-3.5 rounded border-gray-300 text-purple-600'
                  }),
                  'Subfolders'
                )
              ),
              h(IconButton, {
                variant: 'secondary',
                icon: 'trash',
                iconSize: 12,
                onClick: () => removeDir(dir.path),
                title: 'Remove',
                className: '!h-6 !w-6 flex-shrink-0'
              })
            ))
          )
        )
      : h('p', { className: 'text-sm text-gray-500 dark:text-gray-400 py-4 text-center' },
          'aMule is not sharing any folders.'
        )
  );

  return h(React.Fragment, null,
    h(Portal, null,
      h('div', {
        className: 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4',
        onClick: (e) => e.target === e.currentTarget && !dirty && onClose()
      },
        h('div', {
          className: 'bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col'
        },
          h('div', { className: 'flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700' },
            h('div', { className: 'flex items-center gap-3' },
              h(Icon, { name: 'folder', size: 20, className: 'text-purple-600 dark:text-purple-400' }),
              h('div', null,
                h('h3', { className: 'text-lg font-semibold text-gray-900 dark:text-gray-100' }, 'Shared Folders'),
                selectedInstance && h('p', { className: 'text-xs text-gray-500 dark:text-gray-400' },
                  selectedInstance.name)
              )
            ),
            h(IconButton, { variant: 'secondary', icon: 'x', iconSize: 16, onClick: onClose, title: 'Close' })
          ),

          showAmuleSelector && h('div', { className: 'px-6 pt-4' },
            h(AmuleInstanceSelector, {
              connectedInstances: amuleInstances,
              selectedId: instanceId,
              onSelect: selectInstance,
              showSelector: showAmuleSelector,
              label: 'aMule Instance'
            })
          ),

          h('div', { className: 'flex-1 overflow-y-auto px-6 py-4' },
            error && h(AlertBox, { type: 'error', className: 'mb-4' }, error),
            successMessage && h(AlertBox, { type: 'success', className: 'mb-4' }, successMessage),
            loading
              ? h('div', { className: 'flex items-center justify-center py-8' }, h(LoadingSpinner))
              : (supported ? editorView : unsupportedView)
          ),

          h('div', { className: 'px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-between' },
            // Rescan is the long-standing shared-files reload, not part of
            // amule#530, so it works on every core - including one too old to
            // have its folder list edited here, where it is the only thing on
            // offer and often the reason the modal was opened.
            h('div', null,
              h(Button, { variant: 'secondary', onClick: reload, disabled: isWorking },
                reloading ? 'Rescanning...' : 'Rescan now')
            ),
            h('div', { className: 'flex gap-3' },
              h(Button, { variant: 'secondary', onClick: onClose }, dirty ? 'Discard' : 'Close'),
              supported && h(Button, { variant: 'primary', onClick: save, disabled: !dirty || isWorking },
                saving ? 'Saving...' : 'Save')
            )
          )
        )
      )
    ),

    h(DirectoryBrowserModal, {
      show: showDirBrowser,
      mode: 'directory',
      initialPath: dirs.length > 0 ? dirs[dirs.length - 1].path : '/',
      title: 'Select shared folder',
      onSelect: (dirPath) => { setNewDir(dirPath); setShowDirBrowser(false); },
      onClose: () => setShowDirBrowser(false)
    })
  );
};

export default SharedDirsModal;
