/**
 * useAmuleInstanceSelector Hook
 *
 * Provides state and helpers for selecting which aMule instance
 * to use for ED2K operations (search, add downloads, servers, stats).
 *
 * Instance-aware: builds list from connected instances metadata.
 * Shows selection UI when 2+ ED2K instances are connected.
 */

import { useState, useMemo, useCallback } from 'https://esm.sh/react@18.2.0';
import { useStaticData } from '../contexts/StaticDataContext.js';
import { CLIENT_NAMES } from '../utils/constants.js';

/**
 * Hook for picking a connected instance for a feature. By default it lists
 * instances that accept a link scheme (ed2k:// — aMule and Rucio); pass
 * `capability` instead to list instances whose clientMeta capability is true
 * (e.g. an aMule-only page asking for `ed2kServers`/`statsTree`). Instance-
 * aware; shows a selector when 2+ matching instances are connected.
 * @param {Object} [options]
 * @param {string} [options.scheme='ed2k://'] - Link scheme the instance must accept (ignored when `capability` is set)
 * @param {string} [options.capability] - Capability the instance must have (true) — takes precedence over `scheme`
 * @param {string} [options.selectedId] - Externally controlled selected ID (overrides internal state)
 * @param {Function} [options.onSelect] - External selection handler (overrides internal state)
 * @returns {Object} Instance selection state and helpers
 */
export function useAmuleInstanceSelector(options = {}) {
  const { instances } = useStaticData();
  const scheme = options.scheme || 'ed2k://';
  const capability = options.capability || null;

  // Connected instances that match the requested feature (a clientMeta
  // capability, or accepting a link scheme), shipped via instances[id].
  // capabilities — a new client that qualifies appears here with no edit.
  const connectedInstances = useMemo(() => {
    const matches = capability
      ? (inst) => inst.capabilities?.[capability] === true
      : (inst) => (inst.capabilities?.linkSchemes || []).includes(scheme);
    return Object.entries(instances || {})
      .filter(([, inst]) => inst.connected && matches(inst))
      .map(([id, inst]) => ({
        id,
        type: inst.type,
        name: inst.name || CLIENT_NAMES[inst.type]?.name || inst.type,
        color: inst.color,
        order: inst.order
      }))
      .sort((a, b) => a.order - b.order);
  }, [instances, scheme, capability]);

  // Whether to show instance selector (2+ instances connected)
  const showSelector = connectedInstances.length >= 2;

  // Internal selection state (used when not externally controlled)
  const [internalSelectedId, setInternalSelectedId] = useState(null);

  // Use external or internal state
  const selectedId = options.selectedId !== undefined ? options.selectedId : internalSelectedId;
  const setSelectedId = options.onSelect || setInternalSelectedId;

  // Validate selection against connected instances, fall back to first
  const effectiveId = useMemo(() => {
    if (selectedId && connectedInstances.some(c => c.id === selectedId)) {
      return selectedId;
    }
    return connectedInstances[0]?.id || null;
  }, [selectedId, connectedInstances]);

  // Get the selected instance object
  const selectedInstance = useMemo(() => {
    return connectedInstances.find(c => c.id === effectiveId) || null;
  }, [connectedInstances, effectiveId]);

  // Handler to change selected instance
  const selectInstance = useCallback((id) => {
    setSelectedId(id);
  }, [setSelectedId]);

  return {
    connectedInstances,
    showSelector,
    selectedId: effectiveId,
    selectedInstance,
    selectInstance
  };
}

export default useAmuleInstanceSelector;
