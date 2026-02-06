/**
 * DirectoryBrowserModal Component
 * Reusable modal for browsing and selecting directories
 */

import React from 'https://esm.sh/react@18.2.0';
import Portal from '../common/Portal.js';
import { Button, Icon, AlertBox } from '../common/index.js';

const { createElement: h, useState, useEffect, useCallback } = React;

const DirectoryBrowserModal = ({
  show,
  initialPath = '/',
  onSelect,
  onClose,
  title = 'Select Directory'
}) => {
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [directories, setDirectories] = useState([]);
  const [parentPath, setParentPath] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load directory contents when path changes
  const loadDirectory = useCallback(async (pathToLoad) => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/filesystem/browse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: pathToLoad })
      });

      if (res.ok) {
        const data = await res.json();
        setCurrentPath(data.path);
        setDirectories(data.directories || []);
        setParentPath(data.parent);
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(errData.message || 'Failed to load directory');
      }
    } catch (err) {
      setError('Network error: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load initial directory when modal opens
  useEffect(() => {
    if (show) {
      setCurrentPath(initialPath || '/');
      loadDirectory(initialPath || '/');
    }
  }, [show, initialPath, loadDirectory]);

  if (!show) return null;

  const handleNavigate = (dirName) => {
    const newPath = currentPath === '/' ? '/' + dirName : currentPath + '/' + dirName;
    loadDirectory(newPath);
  };

  const handleGoUp = () => {
    if (parentPath) {
      loadDirectory(parentPath);
    }
  };

  const handleSelect = () => {
    onSelect(currentPath);
    onClose();
  };

  // Build breadcrumb parts
  const pathParts = currentPath.split('/').filter(Boolean);

  return h(Portal, null,
    h('div', {
      className: 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4',
      onClick: onClose
    },
      h('div', {
        className: 'bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md flex flex-col max-h-[80vh]',
        onClick: (e) => e.stopPropagation()
      },
        // Header
        h('div', { className: 'p-4 border-b border-gray-200 dark:border-gray-700' },
          h('h3', { className: 'text-lg font-semibold text-gray-900 dark:text-gray-100' }, title)
        ),

        // Breadcrumb path display
        h('div', { className: 'px-4 py-2 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700' },
          h('div', { className: 'flex items-center gap-1 text-sm font-mono overflow-x-auto' },
            h('button', {
              onClick: () => loadDirectory('/'),
              className: 'text-blue-600 dark:text-blue-400 hover:underline flex-shrink-0'
            }, '/'),
            pathParts.map((part, idx) => [
              // Only show separator after the first part (root "/" already shown)
              idx > 0 && h('span', { key: `sep-${idx}`, className: 'text-gray-400' }, '/'),
              h('button', {
                key: `part-${idx}`,
                onClick: () => loadDirectory('/' + pathParts.slice(0, idx + 1).join('/')),
                className: idx === pathParts.length - 1
                  ? 'text-gray-900 dark:text-gray-100 font-medium'
                  : 'text-blue-600 dark:text-blue-400 hover:underline'
              }, part)
            ]).flat().filter(Boolean)
          )
        ),

        // Directory list
        h('div', { className: 'flex-1 overflow-y-auto min-h-[200px]' },
          loading && h('div', { className: 'flex items-center justify-center p-8' },
            h('div', { className: 'w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin' })
          ),

          error && h('div', { className: 'p-4' },
            h(AlertBox, { type: 'error' }, error)
          ),

          !loading && !error && h('div', null,
            // Go up button
            parentPath && h('button', {
              onClick: handleGoUp,
              className: 'w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 border-b border-gray-100 dark:border-gray-700'
            },
              h(Icon, { name: 'arrowUp', size: 16, className: 'text-gray-400' }),
              h('span', { className: 'text-sm text-gray-600 dark:text-gray-400' }, '..')
            ),

            // Directory list
            directories.length === 0 && !parentPath
              ? h('div', { className: 'p-4 text-center text-gray-500 dark:text-gray-400 text-sm' },
                  'No subdirectories'
                )
              : directories.map(dir =>
                  h('button', {
                    key: dir,
                    onClick: () => handleNavigate(dir),
                    className: 'w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2'
                  },
                    h(Icon, { name: 'folder', size: 16, className: 'text-yellow-500' }),
                    h('span', { className: 'text-sm text-gray-700 dark:text-gray-300 truncate' }, dir)
                  )
                )
          )
        ),

        // Footer with buttons
        h('div', { className: 'p-4 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center gap-3' },
          h('div', { className: 'text-xs text-gray-500 dark:text-gray-400 truncate flex-1 font-mono' },
            currentPath
          ),
          h('div', { className: 'flex gap-2' },
            h(Button, { variant: 'secondary', onClick: onClose }, 'Cancel'),
            h(Button, { variant: 'primary', onClick: handleSelect }, 'Select')
          )
        )
      )
    )
  );
};

export default DirectoryBrowserModal;
