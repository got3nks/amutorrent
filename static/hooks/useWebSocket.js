/**
 * useWebSocket Hook
 *
 * Manages WebSocket connection with automatic reconnection
 */

import { useState, useEffect, useRef, useCallback } from 'https://esm.sh/react@18.2.0';
import { WS_INITIAL_RECONNECT_DELAY, WS_MAX_RECONNECT_DELAY } from '../utils/index.js';

/**
 * Custom hook for WebSocket connection management
 * @param {function} onMessage - Message handler function
 * @returns {object} { ws, wsConnected, sendMessage }
 */
export const useWebSocket = (onMessage) => {
  const [ws, setWs] = useState(null);
  const [wsConnected, setWsConnected] = useState(false);
  const reconnectRef = useRef({ timer: null, interval: WS_INITIAL_RECONNECT_DELAY });
  const onMessageRef = useRef(onMessage);
  const wsRef = useRef(null);

  // Always use the latest onMessage callback
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  // Keep wsRef in sync with ws state
  useEffect(() => {
    wsRef.current = ws;
  }, [ws]);

  /**
   * Schedule a reconnection attempt
   */
  const scheduleReconnect = useCallback(() => {
    if (!reconnectRef.current.timer) {
      reconnectRef.current.timer = setTimeout(() => {
        console.log('Attempting WebSocket reconnect...');
        reconnectRef.current.interval = Math.min(
          reconnectRef.current.interval * 2,
          WS_MAX_RECONNECT_DELAY
        );
        reconnectRef.current.timer = null;
        connectWebSocket();
      }, reconnectRef.current.interval);
    }
  }, []);

  /**
   * Connect to WebSocket server
   */
  const connectWebSocket = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const websocket = new WebSocket(`${protocol}://${window.location.host}`);

    websocket.onopen = () => {
      console.log('WebSocket connected');
      setWsConnected(true);
      reconnectRef.current.interval = WS_INITIAL_RECONNECT_DELAY;
      if (reconnectRef.current.timer) {
        clearTimeout(reconnectRef.current.timer);
        reconnectRef.current.timer = null;
      }
    };

    websocket.onclose = () => {
      console.warn('WebSocket disconnected, scheduling reconnect...');
      setWsConnected(false);
      scheduleReconnect();
    };

    websocket.onerror = (err) => {
      console.error('WebSocket error:', err);
      websocket.close(); // trigger onclose
    };

    websocket.onmessage = (event) => {
      if (onMessageRef.current) {
        const data = JSON.parse(event.data);
        onMessageRef.current(data);
      }
    };

    setWs(websocket);
  }, [scheduleReconnect]);

  /**
   * Send a message via WebSocket
   * @param {object} message - Message object to send
   */
  const sendMessage = useCallback((message) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  // Connect on mount
  useEffect(() => {
    connectWebSocket();

    // Cleanup on unmount
    return () => {
      if (ws) ws.close();
      if (reconnectRef.current.timer) {
        clearTimeout(reconnectRef.current.timer);
      }
    };
  }, []);

  return {
    ws,
    wsConnected,
    sendMessage
  };
};
