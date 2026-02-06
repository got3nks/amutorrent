/**
 * StatsTree Component
 *
 * Displays hierarchical statistics tree with expand/collapse functionality
 */

import React from 'https://esm.sh/react@18.2.0';
import Icon from './Icon.js';
import { Button } from './FormControls.js';
import { formatStatsValue, VIEW_TITLE_STYLES } from '../../utils/index.js';

const { createElement: h, useState, useEffect, useRef } = React;

/**
 * Format node label with value placeholders
 */
const formatNodeLabel = (label, value) => {
  if (value === undefined || value === null) return label;

  if (typeof value === 'object' && value._value !== undefined && value.EC_TAG_STAT_NODE_VALUE !== undefined) {
    const sessionValue = value._value;
    const totalValue = formatStatsValue(value.EC_TAG_STAT_NODE_VALUE);
    return label.replace(/%s|%i|%llu|%g|%.2f%%/g, () => `${sessionValue} (${totalValue})`);
  } else if (Array.isArray(value)) {
    let valueIndex = 0;
    return label.replace(/%s|%i|%llu|%g|%.2f%%/g, () => value[valueIndex++] || '');
  } else {
    return label.replace(/%s|%i|%llu|%g|%.2f%%/g, formatStatsValue(value));
  }
};

/**
 * StatsTree component
 * @param {object} statsTree - Statistics tree data
 * @param {boolean} loading - Loading state
 * @param {boolean} showHeader - Whether to show the header (default: true)
 * @param {object} expandedNodes - Controlled expanded nodes state (optional)
 * @param {function} onExpandedNodesChange - Handler for expanded nodes changes (optional)
 */
const StatsTree = ({
  statsTree,
  loading,
  showHeader = true,
  expandedNodes: controlledExpandedNodes,
  onExpandedNodesChange
}) => {
  // Support both controlled and uncontrolled modes
  const [internalExpandedNodes, setInternalExpandedNodes] = useState({});
  const isControlled = controlledExpandedNodes !== undefined;
  const expandedNodes = isControlled ? controlledExpandedNodes : internalExpandedNodes;
  const setExpandedNodes = isControlled ? onExpandedNodesChange : setInternalExpandedNodes;

  const hasUserInteracted = useRef(false);

  // Auto-expand first level of stats tree when loaded (only in uncontrolled mode or when controlled state is empty)
  useEffect(() => {
    if (hasUserInteracted.current) return;
    if (!statsTree || !statsTree.EC_TAG_STATTREE_NODE) return;
    // Skip auto-expand if controlled and already has expanded nodes
    if (isControlled && Object.keys(controlledExpandedNodes).length > 0) return;

    const firstLevelKeys = {};

    const collectFirstLevel = (node, level = 0, parentKey = 'root') => {
      if (!node || level >= 1) return;

      const nodes = Array.isArray(node) ? node : [node];

      for (let idx = 0; idx < nodes.length; idx++) {
        const item = nodes[idx];
        if (!item) continue;

        const children = item.EC_TAG_STATTREE_NODE;
        if (!children) continue;

        const hasChildren = Array.isArray(children) ? children.length > 0 : true;

        if (hasChildren) {
          const nodeKey = `${parentKey}-${level}-${idx}`;
          firstLevelKeys[nodeKey] = true;
          collectFirstLevel(children, level + 1, nodeKey);
        }
      }
    };

    collectFirstLevel(statsTree.EC_TAG_STATTREE_NODE);
    setExpandedNodes(firstLevelKeys);
  }, [statsTree, isControlled, controlledExpandedNodes, setExpandedNodes]);

  const toggleNode = (nodeKey) => {
    hasUserInteracted.current = true;
    if (isControlled) {
      onExpandedNodesChange({
        ...expandedNodes,
        [nodeKey]: !expandedNodes[nodeKey]
      });
    } else {
      setExpandedNodes(prev => ({
        ...prev,
        [nodeKey]: !prev[nodeKey]
      }));
    }
  };

  const expandAll = () => {
    hasUserInteracted.current = true;
    const allKeys = {};
    const collectKeys = (node, level = 0, parentKey = 'root') => {
      if (!node) return;
      const nodes = Array.isArray(node) ? node : [node];
      for (let idx = 0; idx < nodes.length; idx++) {
        const item = nodes[idx];
        if (!item) continue;
        const children = item.EC_TAG_STATTREE_NODE;
        const hasChildren = children && ((Array.isArray(children) && children.length > 0) || (!Array.isArray(children)));
        if (hasChildren) {
          const nodeKey = `${parentKey}-${level}-${idx}`;
          allKeys[nodeKey] = true;
          collectKeys(children, level + 1, nodeKey);
        }
      }
    };
    collectKeys(statsTree?.EC_TAG_STATTREE_NODE);
    setExpandedNodes(allKeys);
  };

  const collapseAll = () => {
    hasUserInteracted.current = true;
    setExpandedNodes({});
  };

  const renderNode = (node, level = 0, parentKey = 'root') => {
    if (!node) return null;
    const nodes = Array.isArray(node) ? node : [node];

    return nodes.map((item, idx) => {
      if (!item) return null;

      const label = item._value || '';
      const value = item.EC_TAG_STAT_NODE_VALUE;
      const children = item.EC_TAG_STATTREE_NODE;
      const displayText = formatNodeLabel(label, value);

      const hasChildren = children && ((Array.isArray(children) && children.length > 0) || (!Array.isArray(children)));
      const nodeKey = `${parentKey}-${level}-${idx}`;
      const isExpanded = !!expandedNodes[nodeKey];

      return h('div', { key: nodeKey, className: 'mb-1' },
        h('div', {
          className: `py-1 px-2 rounded text-sm flex items-center gap-2 ${
            hasChildren
              ? 'font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer'
              : 'text-gray-600 dark:text-gray-300'
          }`,
          style: { paddingLeft: `${level * 20 + 8}px` },
          onClick: hasChildren ? () => toggleNode(nodeKey) : undefined
        },
          hasChildren && h(Icon, {
            name: isExpanded ? 'chevronDown' : 'chevronRight',
            size: 16,
            className: 'flex-shrink-0'
          }),
          h('span', { className: 'flex-1' }, displayText)
        ),
        hasChildren && isExpanded && renderNode(children, level + 1, nodeKey)
      );
    });
  };

  return h('div', { className: 'space-y-3' },
    // Header (optional)
    showHeader && h('div', { className: 'flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3' },
      h('h2', { className: VIEW_TITLE_STYLES.desktop }, 'Statistics Tree'),
      h('div', { className: 'flex gap-2 w-full sm:w-auto' },
        h(Button, {
          variant: 'secondary',
          onClick: expandAll,
          className: 'flex-1 sm:flex-none'
        }, 'Expand All'),
        h(Button, {
          variant: 'secondary',
          onClick: collapseAll,
          className: 'flex-1 sm:flex-none'
        }, 'Collapse All')
      )
    ),

    // Expand/Collapse buttons when header is hidden
    !showHeader && h('div', { className: 'flex gap-2 justify-end' },
      h(Button, {
        variant: 'secondary',
        onClick: expandAll,
        size: 'sm'
      }, 'Expand All'),
      h(Button, {
        variant: 'secondary',
        onClick: collapseAll,
        size: 'sm'
      }, 'Collapse All')
    ),

    h('div', { className: `bg-gray-50 dark:bg-gray-700 rounded-lg p-3 ${showHeader ? 'max-h-[calc(100vh-200px)]' : 'max-h-[calc(100vh-280px)]'} overflow-y-auto` },
      statsTree && statsTree.EC_TAG_STATTREE_NODE
        ? renderNode(statsTree.EC_TAG_STATTREE_NODE)
        : h('div', { className: 'text-center py-6 text-xs sm:text-sm text-gray-500 dark:text-gray-400' },
            loading ? 'Loading statistics...' : 'No statistics available'
          )
    )
  );
};

// Memoize to prevent unnecessary re-renders
export default React.memo(StatsTree);
