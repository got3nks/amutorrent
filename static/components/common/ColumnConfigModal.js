/**
 * ColumnConfigModal Component
 *
 * Modal for configuring table column visibility and order.
 * Uses native HTML5 drag-and-drop for reordering.
 */

import React from 'https://esm.sh/react@18.2.0';
import { Portal, Button, Icon } from './index.js';

const { createElement: h, useState, useCallback, useEffect, useRef } = React;

/**
 * Draggable column row component
 */
const ColumnRow = ({
  column,
  index,
  onToggleVisibility,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
  isDragging,
  isDropTarget
}) => {
  return h('div', {
    className: `
      flex items-center gap-3 px-3 py-2 rounded-lg transition-all
      ${isDragging ? 'opacity-50 bg-gray-100 dark:bg-gray-700' : ''}
      ${isDropTarget ? 'border-t-2 border-blue-500' : 'border-t-2 border-transparent'}
      ${column.visible ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-800/50'}
      hover:bg-gray-50 dark:hover:bg-gray-700/50
    `,
    draggable: true,
    onDragStart: (e) => onDragStart(e, index),
    onDragOver: (e) => onDragOver(e, index),
    onDragEnd,
    onDrop: (e) => onDrop(e, index)
  },
    // Drag handle
    h('div', {
      className: 'cursor-grab active:cursor-grabbing text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400'
    },
      h(Icon, { name: 'gripVertical', size: 16 })
    ),
    // Checkbox
    h('label', {
      className: 'flex items-center gap-2 flex-1 cursor-pointer select-none'
    },
      h('input', {
        type: 'checkbox',
        checked: column.visible,
        onChange: () => onToggleVisibility(column.key),
        className: 'w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 dark:bg-gray-700 dark:checked:bg-blue-600'
      }),
      h('span', {
        className: `text-sm ${column.visible ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}`
      }, column.label)
    )
  );
};

/**
 * ColumnConfigModal component
 *
 * @param {boolean} show - Whether to show the modal
 * @param {function} onClose - Close handler
 * @param {Array} columns - Array of { key, label, visible } objects
 * @param {function} onSave - Callback with new config { order, hidden, secondarySort }
 * @param {function} onReset - Callback to reset to defaults
 * @param {string} title - Modal title (default: "Table view configuration")
 * @param {Object} secondarySort - Current secondary sort config { sortBy, sortDirection }
 * @param {Object} defaultSecondarySort - Default secondary sort config
 * @param {Array} sortableColumns - Array of { key, label } for sortable columns
 */
const ColumnConfigModal = ({
  show,
  onClose,
  columns,
  onSave,
  onReset,
  title = 'Table view configuration',
  secondarySort = null,
  defaultSecondarySort = null,
  sortableColumns = []
}) => {
  // Local state for editing
  const [localColumns, setLocalColumns] = useState([]);
  const [dragIndex, setDragIndex] = useState(null);
  const [dropTargetIndex, setDropTargetIndex] = useState(null);
  const [localSecondarySort, setLocalSecondarySort] = useState(null);

  // Track previous show state to detect open transition
  const prevShowRef = useRef(false);

  // Initialize local state only when modal opens (not on every columns change)
  useEffect(() => {
    const wasOpen = prevShowRef.current;
    prevShowRef.current = show;

    // Only initialize when transitioning from closed to open
    if (show && !wasOpen) {
      if (columns) setLocalColumns([...columns]);
      setLocalSecondarySort(secondarySort ?? defaultSecondarySort);
    }
  }, [show, columns, secondarySort, defaultSecondarySort]);

  // Toggle column visibility
  const handleToggleVisibility = useCallback((key) => {
    setLocalColumns(prev => {
      // Count currently visible columns
      const visibleCount = prev.filter(c => c.visible).length;
      const column = prev.find(c => c.key === key);

      // Don't allow hiding the last visible column
      if (column?.visible && visibleCount <= 1) {
        return prev;
      }

      return prev.map(col =>
        col.key === key ? { ...col, visible: !col.visible } : col
      );
    });
  }, []);

  // Drag and drop handlers
  const handleDragStart = useCallback((e, index) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
  }, []);

  const handleDragOver = useCallback((e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragIndex !== null && index !== dragIndex) {
      setDropTargetIndex(index);
    }
  }, [dragIndex]);

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDropTargetIndex(null);
  }, []);

  const handleDrop = useCallback((e, dropIndex) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === dropIndex) {
      handleDragEnd();
      return;
    }

    setLocalColumns(prev => {
      const newColumns = [...prev];
      const [removed] = newColumns.splice(dragIndex, 1);
      // If dropping at end (dropIndex === prev.length), just push to end
      // Otherwise, adjust index based on whether we're moving up or down
      let insertIndex;
      if (dropIndex >= prev.length) {
        // Dropping at the end
        insertIndex = newColumns.length;
      } else if (dropIndex > dragIndex) {
        insertIndex = dropIndex - 1;
      } else {
        insertIndex = dropIndex;
      }
      newColumns.splice(insertIndex, 0, removed);
      return newColumns;
    });

    handleDragEnd();
  }, [dragIndex, handleDragEnd]);

  // Save handler
  const handleSave = useCallback(() => {
    const order = localColumns.map(col => col.key);
    const hidden = localColumns.filter(col => !col.visible).map(col => col.key);
    onSave({ order, hidden, secondarySort: localSecondarySort });
  }, [localColumns, localSecondarySort, onSave]);

  // Reset handler
  const handleReset = useCallback(() => {
    onReset();
  }, [onReset]);

  if (!show) return null;

  return h(Portal, null,
    h('div', {
      className: 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-2 sm:p-4',
      onClick: onClose
    },
      h('div', {
        className: 'bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full max-h-[85vh] flex flex-col overflow-hidden',
        onClick: (e) => e.stopPropagation()
      },
        // Header
        h('div', { className: 'flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700' },
          h('h2', { className: 'flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-gray-100' },
            h(Icon, { name: 'tableConfig', size: 20, className: 'text-gray-500 dark:text-gray-400' }),
            title
          ),
          h('button', {
            onClick: onClose,
            className: 'p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors'
          },
            h(Icon, { name: 'x', size: 20, className: 'text-gray-500 dark:text-gray-400' })
          )
        ),

        // Content - scrollable list of columns
        h('div', { className: 'flex-1 overflow-y-auto p-4' },
          // Help text (moved to top)
          h('p', { className: 'mb-3 text-xs text-gray-500 dark:text-gray-400' },
            'Drag rows to reorder. Uncheck to hide columns.'
          ),
          h('div', { className: 'space-y-1' },
            localColumns.map((column, index) =>
              h(ColumnRow, {
                key: column.key,
                column,
                index,
                onToggleVisibility: handleToggleVisibility,
                onDragStart: handleDragStart,
                onDragOver: handleDragOver,
                onDragEnd: handleDragEnd,
                onDrop: handleDrop,
                isDragging: dragIndex === index,
                isDropTarget: dropTargetIndex === index
              })
            ),
            // End drop zone - allows dropping to last position
            dragIndex !== null && h('div', {
              key: 'end-drop-zone',
              className: `h-8 rounded-lg transition-all border-2 border-dashed ${
                dropTargetIndex === localColumns.length
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-transparent'
              }`,
              onDragOver: (e) => { e.preventDefault(); setDropTargetIndex(localColumns.length); },
              onDragLeave: () => setDropTargetIndex(null),
              onDrop: (e) => handleDrop(e, localColumns.length)
            })
          ),

          // Secondary sort configuration (only show if sortableColumns provided)
          sortableColumns.length > 0 && h('div', { className: 'mt-4 pt-4 border-t border-gray-200 dark:border-gray-700' },
            h('label', { className: 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2' },
              'Secondary Sort'
            ),
            h('div', { className: 'flex gap-2' },
              // Column select
              h('select', {
                value: localSecondarySort?.sortBy || '',
                onChange: (e) => {
                  const value = e.target.value;
                  if (value) {
                    setLocalSecondarySort(prev => ({
                      sortBy: value,
                      sortDirection: prev?.sortDirection || 'desc'
                    }));
                  } else {
                    setLocalSecondarySort(null);
                  }
                },
                className: 'flex-1 h-9 px-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100'
              },
                h('option', { value: '' }, 'None'),
                sortableColumns.map(col =>
                  h('option', { key: col.key, value: col.key }, col.label)
                )
              ),
              // Direction toggle (only show when a column is selected)
              localSecondarySort?.sortBy && h('button', {
                onClick: () => setLocalSecondarySort(prev => ({
                  ...prev,
                  sortDirection: prev.sortDirection === 'asc' ? 'desc' : 'asc'
                })),
                className: 'h-9 px-3 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors flex items-center gap-1',
                title: `Sort ${localSecondarySort.sortDirection === 'asc' ? 'ascending' : 'descending'}`
              },
                h(Icon, {
                  name: localSecondarySort.sortDirection === 'asc' ? 'arrowUp' : 'arrowDown',
                  size: 16
                }),
                localSecondarySort.sortDirection === 'asc' ? 'ASC' : 'DESC'
              )
            ),
            h('p', { className: 'mt-1 text-xs text-gray-500 dark:text-gray-400' },
              'Used when primary sort values are equal'
            )
          )
        ),

        // Footer
        h('div', { className: 'flex items-center justify-between p-4 border-t border-gray-200 dark:border-gray-700' },
          h(Button, {
            variant: 'secondary',
            onClick: handleReset
          }, 'Reset to Default'),
          h('div', { className: 'flex gap-2' },
            h(Button, {
              variant: 'secondary',
              onClick: onClose
            }, 'Cancel'),
            h(Button, {
              variant: 'primary',
              onClick: handleSave
            }, 'Done')
          )
        )
      )
    )
  );
};

export default ColumnConfigModal;
