/**
 * Zustand store for the active game session state.
 *
 * @remarks
 * Tracks the session ID, preview URL, scaffolding status, chat messages,
 * agent states, code activity, and iframe refresh counter. Updated by the
 * WebSocket hook in response to server messages.
 *
 * @packageDocumentation
 */

import { create } from 'zustand';
import type { AgentRole, AgentStatus } from '@robcost/shared-types';

/** A chat message displayed in the chat panel. */
export interface ChatMessage {
  role: 'user' | AgentRole;
  content: string;
  timestamp: number;
  /** Optional base64-encoded screenshot image (PNG). Rendered directly, not via markdown. */
  imageBase64?: string;
}

/** Shape of the session store state. */
export interface SessionState {
  /** The current session UUID, or null if no session is active. */
  sessionId: string | null;
  /** The Vite dev server URL for the game preview iframe, or null. */
  previewUrl: string | null;
  /** Whether the project is currently being scaffolded. */
  isScaffolding: boolean;
  /** Chat messages between the user and agents. */
  messages: ChatMessage[];
  /** Current status of each agent role. */
  agentStates: Record<AgentRole, AgentStatus>;
  /** Latest code activity from the working agent, or null when idle. */
  codeActivity: { fileName: string; code: string; timestamp: number } | null;
  /** Human-readable description of what the working agent is currently doing. */
  agentActivity: string | null;
  /** Counter incremented to force iframe reload. */
  refreshCounter: number;
  /** Cumulative API cost in USD for this session. */
  totalCostUsd: number;
  /** URL path where the published game is served, or null if not published. */
  publishedUrl: string | null;
}

/** Data needed to restore a session after reconnect. */
export interface RestoreSessionData {
  messages: ChatMessage[];
  agentStates: Record<AgentRole, AgentStatus>;
  previewUrl: string | null;
  totalCostUsd: number;
  publishedUrl: string | null;
}

/** Shape of the session store actions. */
export interface SessionActions {
  setSessionId: (id: string | null) => void;
  setPreviewUrl: (url: string | null) => void;
  setIsScaffolding: (value: boolean) => void;
  addMessage: (message: ChatMessage) => void;
  updateAgentStatus: (role: AgentRole, status: AgentStatus) => void;
  setCodeActivity: (fileName: string, code: string) => void;
  clearCodeActivity: () => void;
  setAgentActivity: (detail: string | null) => void;
  incrementRefresh: () => void;
  /** Update the cumulative session cost. */
  updateCost: (totalCostUsd: number) => void;
  /** Set the published game URL. */
  setPublishedUrl: (url: string | null) => void;
  /** Bulk restore session state from server data. */
  restoreSession: (data: RestoreSessionData) => void;
  reset: () => void;
}

/** Initial state values. */
const initialState: SessionState = {
  sessionId: null,
  previewUrl: null,
  isScaffolding: false,
  messages: [],
  agentStates: {
    designer: 'idle',
    artist: 'idle',
    musician: 'idle',
    developer: 'idle',
    qa: 'idle',
    orchestrator: 'idle',
  },
  codeActivity: null,
  agentActivity: null,
  refreshCounter: 0,
  totalCostUsd: 0,
  publishedUrl: null,
};

/** The Zustand session store instance. */
export const useSessionStore = create<SessionState & SessionActions>((set) => ({
  ...initialState,

  setSessionId: (id) => set({ sessionId: id }),

  setPreviewUrl: (url) => set({ previewUrl: url }),

  setIsScaffolding: (value) => set({ isScaffolding: value }),

  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),

  updateAgentStatus: (role, status) =>
    set((state) => ({
      agentStates: { ...state.agentStates, [role]: status },
    })),

  setCodeActivity: (fileName, code) =>
    set({ codeActivity: { fileName, code, timestamp: Date.now() } }),

  clearCodeActivity: () => set({ codeActivity: null }),

  setAgentActivity: (detail) => set({ agentActivity: detail }),

  incrementRefresh: () =>
    set((state) => ({ refreshCounter: state.refreshCounter + 1 })),

  updateCost: (totalCostUsd) => set({ totalCostUsd }),

  setPublishedUrl: (url) => set({ publishedUrl: url }),

  restoreSession: (data) =>
    set({
      messages: data.messages,
      agentStates: data.agentStates,
      previewUrl: data.previewUrl,
      totalCostUsd: data.totalCostUsd,
      publishedUrl: data.publishedUrl,
    }),

  reset: () => set(initialState),
}));
