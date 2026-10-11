/**
 * useBitTorrentClientSelector Hook
 *
 * Provides state and helpers for selecting which BitTorrent client instance
 * to use when adding downloads (magnet links, torrent files, search results).
 *
 * Instance-aware: builds list from connected instances metadata.
 * Shows selection UI when 2+ BT instances are connected (even same type).
 */

import { useState, useMemo, useCallback } from 'https://esm.sh/react@18.2.0';
import { useStaticData } from '../contexts/StaticDataContext.js';
import { CLIENT_NAMES, MAGNET_SCHEME } from '../utils/constants.js';

/**
 * Hook for BitTorrent client instance selection
 * @returns {Object} Client selection state and helpers
 */
export function useBitTorrentClientSelector() {
  const { instances, instancesAcceptingScheme } = useStaticData();

  // Connected instances that take magnet links (and so torrents)
  const connectedClients = useMemo(() => {
    return instancesAcceptingScheme(MAGNET_SCHEME)
      .map(id => [id, instances[id]])
      .map(([id, inst]) => ({
        id,           // instanceId (e.g., 'rtorrent-seedbox-5000')
        type: inst.type,
        name: inst.name || CLIENT_NAMES[inst.type]?.name || inst.type,
        shortName: inst.name || CLIENT_NAMES[inst.type]?.shortName || inst.type,
        color: inst.color,
        order: inst.order
      }))
      .sort((a, b) => a.order - b.order)
  }, [instances, instancesAcceptingScheme]);

  // Whether any BitTorrent client is available
  const hasBitTorrentClient = connectedClients.length > 0;

  // Whether to show client selector (2+ instances connected)
  const showClientSelector = connectedClients.length >= 2;

  // Selected client - default to first available
  const [selectedClientId, setSelectedClientId] = useState(null);

  // Validate selection against connected clients, fall back to first
  const effectiveClientId = useMemo(() => {
    if (selectedClientId && connectedClients.some(c => c.id === selectedClientId)) {
      return selectedClientId;
    }
    return connectedClients[0]?.id || null;
  }, [selectedClientId, connectedClients]);

  // Get the selected client object
  const selectedClient = useMemo(() => {
    return connectedClients.find(c => c.id === effectiveClientId) || null;
  }, [connectedClients, effectiveClientId]);

  // Handler to change selected client
  const selectClient = useCallback((clientId) => {
    setSelectedClientId(clientId);
  }, []);

  return {
    // List of connected BitTorrent client instances
    connectedClients,
    // Whether any BitTorrent client is available
    hasBitTorrentClient,
    // Whether to show client selector UI (2+ instances)
    showClientSelector,
    // Currently selected instance ID (validated)
    selectedClientId: effectiveClientId,
    // Currently selected client object (with name, type, color, etc.)
    selectedClient,
    // Function to change selection
    selectClient
  };
}

export default useBitTorrentClientSelector;
