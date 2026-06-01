/**
 * useSlskdDirectoryBrowse Hook
 *
 * Provides directory expansion for slskd search results.
 * Uses the dynamic WS message handler so it doesn't disturb the global
 * batch-update / search-results pipeline.
 *
 * Usage:
 *   const { expandDirectory, isExpanding, expandedFiles, expandError } =
 *     useSlskdDirectoryBrowse(instanceId);
 *
 *   expandDirectory(username, directory) — fires a WS action and waits for
 *   a 'slskd-directory-contents' or 'slskd-directory-error' reply.
 *   Results are keyed by `${username}|${directory}`.
 */
import React from 'https://esm.sh/react@18.2.0';
import { useWebSocketConnection } from '../contexts/WebSocketContext.js';

const { useCallback, useEffect, useRef, useState } = React;

function makeKey(username, directory) {
  return `${username}|${directory}`;
}

export function useSlskdDirectoryBrowse(instanceId) {
  const { sendMessage, addMessageHandler, removeMessageHandler } = useWebSocketConnection();

  // Map<key, files[]>
  const [expandedFiles, setExpandedFiles] = useState({});
  // Set<key>
  const [expandingKeys, setExpandingKeys] = useState(new Set());
  // Map<key, errorMessage>
  const [expandErrors, setExpandErrors] = useState({});

  // Stable ref so the WS handler sees latest state without re-subscribing
  const pendingRef = useRef(new Map()); // key → requestId

  const handleMessage = useCallback((msg) => {
    if (msg.type === 'slskd-directory-contents') {
      const key = makeKey(msg.username, msg.directory);
      pendingRef.current.delete(key);
      setExpandedFiles(prev => ({ ...prev, [key]: msg.files || [] }));
      setExpandingKeys(prev => { const s = new Set(prev); s.delete(key); return s; });
    } else if (msg.type === 'slskd-directory-error') {
      const key = makeKey(msg.username, msg.directory);
      pendingRef.current.delete(key);
      setExpandErrors(prev => ({ ...prev, [key]: msg.error || 'Failed to browse directory' }));
      setExpandingKeys(prev => { const s = new Set(prev); s.delete(key); return s; });
    }
  }, []);

  useEffect(() => {
    addMessageHandler(handleMessage);
    return () => removeMessageHandler(handleMessage);
  }, [addMessageHandler, removeMessageHandler, handleMessage]);

  const expandDirectory = useCallback((username, directory) => {
    const key = makeKey(username, directory);
    if (expandingKeys.has(key) || key in expandedFiles) return;

    const requestId = `browse-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    pendingRef.current.set(key, requestId);
    setExpandingKeys(prev => new Set([...prev, key]));
    setExpandErrors(prev => { const n = { ...prev }; delete n[key]; return n; });

    sendMessage({
      action: 'browseSlskdDirectory',
      username,
      directory,
      requestId,
      ...(instanceId && { instanceId })
    });
  }, [expandingKeys, expandedFiles, sendMessage, instanceId]);

  const collapseDirectory = useCallback((username, directory) => {
    const key = makeKey(username, directory);
    setExpandedFiles(prev => { const n = { ...prev }; delete n[key]; return n; });
    setExpandErrors(prev => { const n = { ...prev }; delete n[key]; return n; });
  }, []);

  const isExpanding = useCallback((username, directory) =>
    expandingKeys.has(makeKey(username, directory)), [expandingKeys]);

  const isExpanded = useCallback((username, directory) =>
    makeKey(username, directory) in expandedFiles, [expandedFiles]);

  const getFiles = useCallback((username, directory) =>
    expandedFiles[makeKey(username, directory)] || [], [expandedFiles]);

  const getError = useCallback((username, directory) =>
    expandErrors[makeKey(username, directory)] || null, [expandErrors]);

  return { expandDirectory, collapseDirectory, isExpanding, isExpanded, getFiles, getError };
}
