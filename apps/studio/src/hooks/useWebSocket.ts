/**
 * React hook for WebSocket communication with the orchestrator.
 *
 * @remarks
 * Opens a WebSocket connection to the orchestrator, sends a `session_resume`
 * message on connect, and dispatches incoming server messages to the Zustand
 * session store. Automatically reconnects with exponential backoff on
 * connection loss. Cleans up the connection on unmount.
 *
 * @packageDocumentation
 */

'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import type { ClientMessage, ServerMessage } from '@robcost/shared-types';
import { isServerMessage } from '@robcost/shared-types';
import { useSessionStore } from '../stores/sessionStore';

/** Default WebSocket URL for the orchestrator. */
const DEFAULT_WS_URL = 'ws://localhost:4000';

/** Maximum number of reconnection attempts before giving up. */
const MAX_RECONNECT_ATTEMPTS = 10;

/** Initial delay between reconnection attempts in milliseconds. */
const BASE_DELAY_MS = 1000;

/** Maximum delay between reconnection attempts in milliseconds. */
const MAX_DELAY_MS = 30000;

/** Connection state for the WebSocket. */
export type ConnectionState = 'connected' | 'disconnected' | 'reconnecting';

/** Return type of the useWebSocket hook. */
export interface UseWebSocketReturn {
  /** Sends a typed client message to the orchestrator. */
  sendMessage: (msg: ClientMessage) => void;
  /** Current WebSocket connection state. */
  connectionState: ConnectionState;
}

/**
 * Manages a WebSocket connection to the orchestrator for the given session.
 * Includes automatic reconnection with exponential backoff on connection loss.
 *
 * @param sessionId - The session UUID to resume on connect.
 * @returns Object with `sendMessage` function and `connectionState` status.
 */
export function useWebSocket(sessionId: string): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');

  const setPreviewUrl = useSessionStore((s) => s.setPreviewUrl);
  const setIsScaffolding = useSessionStore((s) => s.setIsScaffolding);
  const addMessage = useSessionStore((s) => s.addMessage);
  const updateAgentStatus = useSessionStore((s) => s.updateAgentStatus);
  const setCodeActivity = useSessionStore((s) => s.setCodeActivity);
  const clearCodeActivity = useSessionStore((s) => s.clearCodeActivity);
  const setAgentActivity = useSessionStore((s) => s.setAgentActivity);
  const incrementRefresh = useSessionStore((s) => s.incrementRefresh);
  const updateCost = useSessionStore((s) => s.updateCost);
  const restoreSession = useSessionStore((s) => s.restoreSession);

  useEffect(() => {
    const wsUrl =
      process.env.NEXT_PUBLIC_ORCHESTRATOR_WS_URL ?? DEFAULT_WS_URL;

    let reconnectAttempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let shouldReconnect = true;

    /** Creates a WebSocket connection and sets up event handlers. */
    function connect() {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionState('connected');
        reconnectAttempt = 0;
        // Resume session on connect
        ws.send(JSON.stringify({ type: 'session_resume', sessionId }));
      };

      ws.onmessage = (event) => {
        let data: unknown;
        try {
          data = JSON.parse(event.data as string);
        } catch {
          return;
        }

        if (!isServerMessage(data)) return;

        const msg = data as ServerMessage;

        switch (msg.type) {
          case 'session_created':
            // Session was created via WS (alternative to HTTP POST)
            break;

          case 'session_restore':
            restoreSession({
              messages: msg.conversationHistory.map((turn) => ({
                role: turn.role,
                content: turn.content,
                timestamp: turn.timestamp,
              })),
              agentStates: msg.agentStates,
              previewUrl: msg.previewUrl,
              totalCostUsd: msg.totalCostUsd,
              publishedUrl: msg.publishedUrl,
            });
            break;

          case 'agent_message':
            addMessage({
              role: msg.agentRole,
              content: msg.content,
              timestamp: Date.now(),
            });
            break;

          case 'agent_status':
            updateAgentStatus(msg.agentRole, msg.status);
            if (msg.detail?.includes('Setting up')) {
              setIsScaffolding(true);
            }
            if (msg.status === 'idle' && msg.detail?.includes('ready')) {
              setIsScaffolding(false);
            }
            // Update activity detail when agent is working
            if (msg.status === 'working' && msg.detail) {
              setAgentActivity(msg.detail);
            }
            // Clear code activity and agent activity when agent finishes
            if (msg.status === 'done' || msg.status === 'idle') {
              clearCodeActivity();
              setAgentActivity(null);
            }
            break;

          case 'preview_ready':
            setPreviewUrl(msg.url);
            setIsScaffolding(false);
            break;

          case 'preview_refresh':
            incrementRefresh();
            break;

          case 'tool_activity':
            setCodeActivity(msg.fileName, msg.code);
            break;

          case 'error':
            addMessage({
              role: 'orchestrator',
              content: msg.message,
              timestamp: Date.now(),
            });
            setIsScaffolding(false);
            clearCodeActivity();
            break;

          case 'build_error':
            addMessage({
              role: 'orchestrator',
              content: `Build error: ${msg.errors.map((e) => e.message).join(', ')}`,
              timestamp: Date.now(),
            });
            break;

          case 'qa_screenshot':
            addMessage({
              role: 'qa',
              content: msg.description,
              imageBase64: msg.imageBase64,
              timestamp: Date.now(),
            });
            break;

          case 'cost_update':
            updateCost(msg.totalCostUsd);
            break;

          case 'asset_generation_progress':
            // Add a chat message when an asset is completed with an image preview
            if (msg.status === 'completed' && msg.imageBase64) {
              addMessage({
                role: 'artist',
                content: `Generated asset: ${msg.description}`,
                imageBase64: msg.imageBase64,
                timestamp: Date.now(),
              });
            }
            break;

          case 'music_generation_progress':
            // Add a chat message when music generation completes
            if (msg.status === 'completed') {
              const duration = msg.durationSeconds ? ` (${msg.durationSeconds}s)` : '';
              addMessage({
                role: 'musician',
                content: `Generated background music: ${msg.description}${duration}`,
                timestamp: Date.now(),
              });
            }
            break;
        }
      };

      ws.onclose = () => {
        if (shouldReconnect && reconnectAttempt < MAX_RECONNECT_ATTEMPTS) {
          setConnectionState('reconnecting');
          const delay = Math.min(BASE_DELAY_MS * 2 ** reconnectAttempt, MAX_DELAY_MS);
          reconnectTimer = setTimeout(() => {
            reconnectAttempt++;
            connect();
          }, delay);
        } else {
          setConnectionState('disconnected');
        }
      };

      ws.onerror = () => {
        // onclose will fire after onerror — reconnection handled there
      };
    }

    connect();

    return () => {
      shouldReconnect = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [
    sessionId,
    addMessage,
    updateAgentStatus,
    setPreviewUrl,
    setIsScaffolding,
    setCodeActivity,
    clearCodeActivity,
    setAgentActivity,
    incrementRefresh,
    updateCost,
    restoreSession,
  ]);

  const sendMessage = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  return { sendMessage, connectionState };
}
