/**
 * useSearchProviderSelector Hook
 *
 * Generalizes useAmuleInstanceSelector to support any search network type.
 * Filters connected instances by networkType derived from searchType:
 *   - 'soulseek' -> networkType 'soulseek' (slskd instances)
 *   - everything else -> networkType 'ed2k' (aMule instances)
 *
 * Shows instance selector only when 2+ instances of that network are connected.
 */

import { useState, useMemo, useCallback } from 'https://esm.sh/react@18.2.0';
import { useStaticData } from '../contexts/StaticDataContext.js';

/**
 * Hook for search provider instance selection.
 * @param {Object} [options]
 * @param {string} [options.searchType]   - Active search type ('global','kad','soulseek',...)
 * @param {string} [options.selectedId]   - Externally controlled selected ID
 * @param {Function} [options.onSelect]   - External selection handler
 * @returns {Object} Instance selection state and helpers
 */
export function useSearchProviderSelector(options = {}) {
  const { instances } = useStaticData();
  const { searchType, selectedId: externalSelectedId, onSelect } = options;

  const networkType = searchType === 'soulseek' ? 'soulseek' : 'ed2k';

  const connectedInstances = useMemo(() => {
    return Object.entries(instances || {})
      .filter(([, inst]) => inst.connected && inst.networkType === networkType)
      .map(([id, inst]) => ({
        id,
        type: inst.type,
        name: inst.name || inst.type,
        color: inst.color,
        order: inst.order
      }))
      .sort((a, b) => a.order - b.order);
  }, [instances, networkType]);

  const showSelector = connectedInstances.length >= 2;

  const [internalSelectedId, setInternalSelectedId] = useState(null);

  const selectedId = externalSelectedId !== undefined ? externalSelectedId : internalSelectedId;
  const setSelectedId = onSelect || setInternalSelectedId;

  const effectiveId = useMemo(() => {
    if (selectedId && connectedInstances.some(c => c.id === selectedId)) {
      return selectedId;
    }
    return connectedInstances[0]?.id || null;
  }, [selectedId, connectedInstances]);

  const selectedInstance = useMemo(() => {
    return connectedInstances.find(c => c.id === effectiveId) || null;
  }, [connectedInstances, effectiveId]);

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

export default useSearchProviderSelector;
