/**
 * MobileStatusTabs Component
 *
 * Horizontal chip-style status filter tabs for mobile views.
 * Automatically shows tabs for statuses that exist in the data (via statusCounts).
 * Supports custom tabs via statusOptions prop for special cases (e.g., server-side filtering).
 */

import React from 'https://esm.sh/react@18.2.0';
import { STATUS_LABELS } from '../../utils/index.js';

const { createElement: h } = React;

// Preferred order for status tabs (statuses not in this list appear at the end)
const STATUS_ORDER = ['all', 'downloading', 'seeding', 'stalled', 'active', 'paused', 'stopped', 'checking', 'queued', 'hashing', 'error', 'completed', 'missing', 'deleted'];

/**
 * MobileStatusTabs component
 * @param {string} activeTab - Currently active tab key
 * @param {Object} statusCounts - Map of status key to count (e.g., { downloading: 5, seeding: 2 })
 * @param {function} onTabChange - Handler for tab selection (receives status key)
 * @param {number} totalCount - Total item count for "All" tab
 * @param {Array} statusOptions - Optional custom status options [{value, label}] for server-side filtering
 * @param {boolean} showAllTabs - If true, show all tabs regardless of count (for server-side filtering)
 * @param {ReactNode} leadingContent - Optional content to render before the tabs (e.g., filter button)
 * @param {ReactNode} trailingContent - Optional content to render after the tabs
 */
const MobileStatusTabs = ({ activeTab, statusCounts = {}, onTabChange, totalCount = 0, statusOptions, showAllTabs = false, leadingContent, trailingContent }) => {
  // Build tabs from statusCounts (statuses that exist in data), or use statusOptions for custom definitions
  let tabs;

  if (statusOptions) {
    // Custom status options provided (e.g., HistoryView with server-side filtering)
    tabs = statusOptions.map(opt => ({
      key: opt.value,
      label: opt.label.replace(/\s*\(\d+\)$/, ''), // Strip any count from label
      count: opt.value === 'all' ? totalCount : (statusCounts[opt.value] || 0)
    }));
  } else {
    // Build tabs dynamically from statusCounts
    const statusKeys = Object.keys(statusCounts);

    // Sort by preferred order
    statusKeys.sort((a, b) => {
      const aIdx = STATUS_ORDER.indexOf(a);
      const bIdx = STATUS_ORDER.indexOf(b);
      if (aIdx === -1 && bIdx === -1) return a.localeCompare(b);
      if (aIdx === -1) return 1;
      if (bIdx === -1) return -1;
      return aIdx - bIdx;
    });

    // Build tabs array with 'all' first
    tabs = [
      { key: 'all', label: 'All', count: totalCount },
      ...statusKeys.map(key => ({
        key,
        label: STATUS_LABELS[key] || key.charAt(0).toUpperCase() + key.slice(1),
        count: statusCounts[key]
      }))
    ];
  }

  return h('div', {
    className: 'xl:hidden flex gap-1.5 py-2 border-b border-gray-200 dark:border-gray-700 overflow-x-auto',
    style: { scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }
  },
    leadingContent,
    ...tabs.map(tab => {
      // Only show tabs with count > 0 (always show "all"), unless showAllTabs is true
      if (!showAllTabs && tab.key !== 'all' && tab.count === 0) return null;

      const isActive = activeTab === tab.key;

      // Don't show counts when using showAllTabs (server-side filtering has no client-side counts)
      const displayText = showAllTabs ? tab.label : `${tab.label} (${tab.count})`;

      return h('button', {
        key: tab.key,
        onClick: () => onTabChange(tab.key),
        className: `px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
          isActive
            ? 'bg-blue-600 text-white'
            : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
        }`
      }, displayText);
    }),
    trailingContent
  );
};

export default MobileStatusTabs;
