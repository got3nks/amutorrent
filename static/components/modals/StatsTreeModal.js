/**
 * StatsTreeModal Component
 *
 * Modal dialog for displaying the ED2K Statistics Tree
 */

import React from 'https://esm.sh/react@18.2.0';
import { StatsTree, Icon, ClientIcon } from '../common/index.js';

const { createElement: h, useEffect } = React;

/**
 * Stats Tree Modal component
 * @param {boolean} show - Whether to show the modal
 * @param {function} onClose - Close handler
 * @param {object} statsTree - Statistics tree data
 * @param {boolean} loading - Loading state
 * @param {object} expandedNodes - Controlled expanded nodes state
 * @param {function} onExpandedNodesChange - Handler for expanded nodes changes
 */
const StatsTreeModal = ({ show, onClose, statsTree, loading, expandedNodes, onExpandedNodesChange }) => {
  // Handle escape key
  useEffect(() => {
    if (!show) return;

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [show, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (show) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [show]);

  if (!show) return null;

  return h('div', {
    className: 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50',
    onClick: (e) => {
      if (e.target === e.currentTarget) onClose();
    }
  },
    h('div', {
      className: 'bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col'
    },
      // Header
      h('div', {
        className: 'flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700'
      },
        h('div', { className: 'flex items-center gap-2' },
          h(ClientIcon, { client: 'amule', size: 24 }),
          h('h2', { className: 'text-lg font-semibold text-gray-800 dark:text-gray-100' },
            'ED2K Statistics Tree'
          )
        ),
        h('button', {
          onClick: onClose,
          className: 'p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors'
        },
          h(Icon, { name: 'x', size: 20, className: 'text-gray-500 dark:text-gray-400' })
        )
      ),

      // Content - scrollable
      h('div', { className: 'flex-1 overflow-y-auto p-4' },
        h(StatsTree, {
          statsTree,
          loading,
          showHeader: false,
          expandedNodes,
          onExpandedNodesChange
        })
      )
    )
  );
};

export default StatsTreeModal;
