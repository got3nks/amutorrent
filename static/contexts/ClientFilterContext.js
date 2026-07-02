/**
 * ClientFilterContext
 *
 * Provides global client filter state for toggling visibility of instances.
 * Used by all views to filter data by instance.
 * Persists to localStorage.
 *
 * The filter operates on a single concept: disabledInstances (Set of instance IDs).
 * - ED2K/BT labels act as batch toggles (disable/enable all instances of that network type)
 * - Individual instance chips toggle a single instance
 * - When all instances of a network type are disabled, clicking one instance enables only that one
 *
 * Derived convenience booleans (isEd2kEnabled, isBittorrentEnabled) combine:
 * - User preference (not in disabledInstances)
 * - Connection status (instance.connected)
 */

import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from 'https://esm.sh/react@18.2.0';
import { useStaticData } from './StaticDataContext.js';

const { createElement: h } = React;

const ClientFilterContext = createContext(null);

const STORAGE_KEY = 'amule-client-filter';

/**
 * Load persisted filter state from localStorage with migration from old formats.
 * v1: { amule: bool, rtorrent: bool }
 * v2: { networkTypes: { ed2k: bool, bittorrent: bool }, disabledInstances: [] }
 * v3: { version: 3, disabledInstances: [] }
 */
function loadPersistedState() {
  if (typeof window === 'undefined') return null;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved);

    // Current format (v3) — instance-only
    if (parsed.version >= 3) {
      return {
        disabledInstances: Array.isArray(parsed.disabledInstances) ? parsed.disabledInstances : [],
        pendingDisabledTypes: null
      };
    }

    // Old format v2 with networkTypes — convert to pending type disables
    if (parsed.networkTypes) {
      const pendingDisabledTypes = [];
      if (parsed.networkTypes.ed2k === false) pendingDisabledTypes.push('ed2k');
      if (parsed.networkTypes.bittorrent === false) pendingDisabledTypes.push('bittorrent');
      return {
        disabledInstances: Array.isArray(parsed.disabledInstances) ? parsed.disabledInstances : [],
        pendingDisabledTypes: pendingDisabledTypes.length > 0 ? pendingDisabledTypes : null
      };
    }

    // Old format v1: { amule: bool, rtorrent: bool }
    if ('amule' in parsed || 'rtorrent' in parsed) {
      const pendingDisabledTypes = [];
      if (parsed.amule === false) pendingDisabledTypes.push('ed2k');
      if (parsed.rtorrent === false) pendingDisabledTypes.push('bittorrent');
      return {
        disabledInstances: [],
        pendingDisabledTypes: pendingDisabledTypes.length > 0 ? pendingDisabledTypes : null
      };
    }

    return null;
  } catch (err) {
    console.error('Failed to load client filter from localStorage:', err);
    return null;
  }
}

export const ClientFilterProvider = ({ children }) => {
  // Get instances metadata and derived helpers from StaticDataContext
  const { instances, isNetworkTypeConnected } = useStaticData();

  // Pure connection status (not affected by user filter preference)
  const ed2kConnected = isNetworkTypeConnected('ed2k');
  const bittorrentConnected = isNetworkTypeConnected('bittorrent');

  // Single source of truth: Set of disabled instance IDs
  const [disabledInstances, setDisabledInstances] = useState(() => {
    const persisted = loadPersistedState();
    return new Set(persisted?.disabledInstances || []);
  });

  // Migration: convert old networkTypes format to disabledInstances once instances arrive
  const pendingDisabledTypesRef = useRef(loadPersistedState()?.pendingDisabledTypes || null);

  useEffect(() => {
    if (!pendingDisabledTypesRef.current) return;
    const instanceEntries = Object.entries(instances);
    if (instanceEntries.length === 0) return;

    const typesToDisable = pendingDisabledTypesRef.current;
    pendingDisabledTypesRef.current = null;

    setDisabledInstances(prev => {
      const next = new Set(prev);
      for (const [id, inst] of instanceEntries) {
        if (typesToDisable.includes(inst.networkType)) {
          next.add(id);
        }
      }
      return next;
    });
  }, [instances]);

  // Persist to localStorage (v3 format)
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: 3,
        disabledInstances: Array.from(disabledInstances)
      }));
    } catch (err) {
      console.error('Failed to save client filter to localStorage:', err);
    }
  }, [disabledInstances]);

  // Batch toggle all connected instances of a network type
  const toggleNetworkType = useCallback((networkType) => {
    setDisabledInstances(prev => {
      const next = new Set(prev);
      const typeIds = Object.entries(instances)
        .filter(([, inst]) => inst.networkType === networkType && inst.connected)
        .map(([id]) => id);

      if (typeIds.length === 0) return prev;

      const anyEnabled = typeIds.some(id => !prev.has(id));

      if (anyEnabled) {
        // Disable all of this type
        for (const id of typeIds) next.add(id);

        // Safety: never disable ALL connected instances. If this toggle would,
        // keep this network type enabled (no-op). Works for any number of
        // network types, not just two.
        const allConnectedIds = Object.entries(instances)
          .filter(([, inst]) => inst.connected)
          .map(([id]) => id);
        if (allConnectedIds.every(id => next.has(id))) {
          return prev;
        }
      } else {
        // Enable all of this type
        for (const id of typeIds) next.delete(id);
      }

      return next;
    });
  }, [instances]);

  // Toggle an individual instance
  const toggleInstance = useCallback((instanceId) => {
    setDisabledInstances(prev => {
      const next = new Set(prev);
      if (next.has(instanceId)) {
        // Re-enabling — always allowed
        next.delete(instanceId);
      } else {
        // Disabling — prevent disabling ALL connected instances
        next.add(instanceId);
        const allConnectedIds = Object.entries(instances)
          .filter(([, inst]) => inst.connected)
          .map(([id]) => id);
        if (allConnectedIds.every(id => next.has(id))) {
          return prev;
        }
      }
      return next;
    });
  }, [instances]);

  // Check if a specific instance is enabled
  const isInstanceEnabled = useCallback((instanceId) => {
    if (!instances[instanceId]) return false;
    return !disabledInstances.has(instanceId);
  }, [instances, disabledInstances]);

  // Filter items by enabled instances
  const filterByEnabledClients = useCallback((items) => {
    if (!Array.isArray(items)) return items;
    if (disabledInstances.size === 0) return items; // Fast path
    return items.filter(item => {
      if (item.instanceId && disabledInstances.has(item.instanceId)) return false;
      return true;
    });
  }, [disabledInstances]);

  // Derived: is a network type enabled (any connected instance of that type is
  // not disabled). Generic over network type so it works for ed2k, rucio,
  // bittorrent, or any future network.
  const isNetworkTypeEnabled = useCallback((networkType) => {
    return Object.entries(instances).some(([id, inst]) =>
      inst.networkType === networkType && inst.connected && !disabledInstances.has(id)
    );
  }, [instances, disabledInstances]);

  // Back-compat convenience booleans (still consumed across the UI).
  const isEd2kEnabled = useMemo(() => isNetworkTypeEnabled('ed2k'), [isNetworkTypeEnabled]);
  const isBittorrentEnabled = useMemo(() => isNetworkTypeEnabled('bittorrent'), [isNetworkTypeEnabled]);
  const isRucioEnabled = useMemo(() => isNetworkTypeEnabled('rucio'), [isNetworkTypeEnabled]);
  const rucioConnected = isNetworkTypeConnected('rucio');

  // Memoize context value
  const value = useMemo(() => ({
    // Network type batch toggle
    toggleNetworkType,
    filterByEnabledClients,

    // Per-instance toggles
    disabledInstances,
    toggleInstance,
    isInstanceEnabled,

    // Connection state (pure, not affected by filter preference)
    ed2kConnected,
    bittorrentConnected,
    rucioConnected,

    // Convenience booleans: user preference AND connected
    isEd2kEnabled,
    isBittorrentEnabled,
    isRucioEnabled,
    isNetworkTypeEnabled,
    allClientsEnabled: isEd2kEnabled && isBittorrentEnabled && (rucioConnected ? isRucioEnabled : true)
  }), [toggleNetworkType, filterByEnabledClients,
    disabledInstances, toggleInstance, isInstanceEnabled,
    ed2kConnected, bittorrentConnected, rucioConnected,
    isEd2kEnabled, isBittorrentEnabled, isRucioEnabled, isNetworkTypeEnabled]);

  return h(ClientFilterContext.Provider, { value }, children);
};

export const useClientFilter = () => {
  const context = useContext(ClientFilterContext);
  if (!context) {
    throw new Error('useClientFilter must be used within ClientFilterProvider');
  }
  return context;
};
