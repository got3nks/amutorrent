/**
 * useStatusFilter Hook
 *
 * Extracts the status filter pattern used by DownloadsView (and reusable by SharedView, etc.).
 * Manages status filter state, computes counts/options, and returns filtered data.
 */

import React from 'https://esm.sh/react@18.2.0';
import { getItemStatusInfo, STATUS_LABELS } from '../utils/index.js';

const { useState, useMemo } = React;

/**
 * @param {Object} options
 * @param {Array} options.data - Pre-filtered data to compute counts from and filter
 * @param {function} [options.getStatusKey] - Optional (item) => string; defaults to getItemStatusInfo(item).key
 * @returns {{ statusFilter, setStatusFilter, statusCounts, statusOptions, filteredData }}
 */
export function useStatusFilter({ data, getStatusKey }) {
  const [statusFilter, setStatusFilter] = useState('all');

  const resolveKey = getStatusKey || ((item) => getItemStatusInfo(item).key);

  // Normalize status key - merge "sharing" into "seeding"
  const normalizeKey = (key) => key === 'sharing' ? 'seeding' : key;

  // Compute status counts from the input data
  const statusCounts = useMemo(() => {
    const counts = {};
    data.forEach(item => {
      const key = normalizeKey(resolveKey(item));
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [data, resolveKey]);

  // Build dropdown options with counts
  const statusOptions = useMemo(() => {
    const options = [{ value: 'all', label: 'Status' }];
    Object.entries(statusCounts).forEach(([key, count]) => {
      options.push({ value: key, label: `${STATUS_LABELS[key] || key} (${count})` });
    });
    return options;
  }, [statusCounts]);

  // Apply status filter (uses normalized keys so "seeding" matches both seeding and sharing)
  const filteredData = useMemo(() => {
    if (statusFilter === 'all') return data;
    return data.filter(item => normalizeKey(resolveKey(item)) === statusFilter);
  }, [data, statusFilter, resolveKey]);

  return {
    statusFilter,
    setStatusFilter,
    statusCounts,
    statusOptions,
    filteredData
  };
}
