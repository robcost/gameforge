/**
 * WebSocket message type definitions for client-server communication.
 *
 * @remarks
 * All communication between the studio frontend and the orchestrator
 * backend flows through WebSocket messages. Each message has a `type`
 * discriminant for type-safe handling.
 *
 * @packageDocumentation
 */

import type { AgentRole, AgentStatus } from './agents.js';
import type { GameEngine } from './game.js';
import type { SessionState, ConversationTurn } from './session.js';

/** Build error reported by the Vite dev server. */
export interface BuildError {
  file: string;
  line: number;
  column: number;
  message: string;
}

// ────────────────────────────────────────────────────────────────
// Client → Server messages
// ────────────────────────────────────────────────────────────────

/** User sends a chat message to the agent team. */
export interface UserMessagePayload {
  type: 'user_message';
  content: string;
}

/** User requests creation of a new game session. */
export interface SessionCreatePayload {
  type: 'session_create';
  engine: GameEngine;
  genre: string;
}

/** User requests to resume an existing session. */
export interface SessionResumePayload {
  type: 'session_resume';
  sessionId: string;
}

/** User interacts with the game preview controls. */
export interface PreviewInteractionPayload {
  type: 'preview_interaction';
  action: 'play' | 'pause' | 'reset';
}

/** Union of all messages the client can send to the server. */
export type ClientMessage =
  | UserMessagePayload
  | SessionCreatePayload
  | SessionResumePayload
  | PreviewInteractionPayload;

// ────────────────────────────────────────────────────────────────
// Server → Client messages
// ────────────────────────────────────────────────────────────────

/** Agent sends a chat message to the user. */
export interface AgentMessagePayload {
  type: 'agent_message';
  content: string;
  agentRole: AgentRole;
}

/** Agent status change notification. */
export interface AgentStatusPayload {
  type: 'agent_status';
  agentRole: AgentRole;
  status: AgentStatus;
  detail?: string;
}

/** Game preview is ready at the given URL. */
export interface PreviewReadyPayload {
  type: 'preview_ready';
  url: string;
}

/** Game preview should refresh (code has changed). */
export interface PreviewRefreshPayload {
  type: 'preview_refresh';
}

/** Build error occurred in the game project. */
export interface BuildErrorPayload {
  type: 'build_error';
  errors: BuildError[];
}

/** QA agent captured a screenshot during testing. */
export interface QAScreenshotPayload {
  type: 'qa_screenshot';
  imageBase64: string;
  description: string;
}

/** Session was successfully created. */
export interface SessionCreatedPayload {
  type: 'session_created';
  sessionId: string;
  previewUrl: string;
}

/** Agent tool activity notification (file being read/written). */
export interface ToolActivityPayload {
  type: 'tool_activity';
  agentRole: AgentRole;
  fileName: string;
  code: string;
}

/** Full session state sent to client on reconnect/resume. */
export interface SessionRestorePayload {
  type: 'session_restore';
  sessionId: string;
  status: SessionState;
  conversationHistory: ConversationTurn[];
  agentStates: Record<AgentRole, AgentStatus>;
  previewUrl: string | null;
  iterationCount: number;
  /** Game title from GDD, or null if GDD not yet created. */
  gameTitle: string | null;
  /** Cumulative API cost in USD. */
  totalCostUsd: number;
  /** URL path where the published game is served, or null if not published. */
  publishedUrl: string | null;
}

/** Cumulative session cost update sent after each agent completes. */
export interface CostUpdatePayload {
  type: 'cost_update';
  /** Cumulative total cost in USD for the entire session. */
  totalCostUsd: number;
}

/** Artist agent asset generation progress notification (Circle 2). */
export interface AssetGenerationProgressPayload {
  type: 'asset_generation_progress';
  /** The asset key being generated. */
  assetKey: string;
  /** Human-readable description of the asset. */
  description: string;
  /** Current status of the generation. */
  status: 'generating' | 'completed' | 'failed';
  /** Base64-encoded PNG preview (sent on completion). */
  imageBase64?: string;
}

/** Musician agent music generation progress notification. */
export interface MusicGenerationProgressPayload {
  type: 'music_generation_progress';
  /** Human-readable description of the music being generated. */
  description: string;
  /** Current status of the generation. */
  status: 'generating' | 'completed' | 'failed';
  /** Duration of the generated track in seconds (sent on completion). */
  durationSeconds?: number;
}

/** Generic error message from the server. */
export interface ErrorPayload {
  type: 'error';
  message: string;
}

/** Union of all messages the server can send to the client. */
export type ServerMessage =
  | AgentMessagePayload
  | AgentStatusPayload
  | PreviewReadyPayload
  | PreviewRefreshPayload
  | BuildErrorPayload
  | QAScreenshotPayload
  | SessionCreatedPayload
  | SessionRestorePayload
  | ToolActivityPayload
  | CostUpdatePayload
  | AssetGenerationProgressPayload
  | MusicGenerationProgressPayload
  | ErrorPayload;

// ────────────────────────────────────────────────────────────────
// Type guards
// ────────────────────────────────────────────────────────────────

/** All valid client message types. */
export const CLIENT_MESSAGE_TYPES = [
  'user_message',
  'session_create',
  'session_resume',
  'preview_interaction',
] as const;

/** All valid server message types. */
export const SERVER_MESSAGE_TYPES = [
  'agent_message',
  'agent_status',
  'preview_ready',
  'preview_refresh',
  'build_error',
  'qa_screenshot',
  'session_created',
  'session_restore',
  'tool_activity',
  'cost_update',
  'asset_generation_progress',
  'music_generation_progress',
  'error',
] as const;

/**
 * Type guard that checks if an object is a valid {@link ClientMessage}.
 *
 * @param value - The value to check.
 * @returns `true` if the value has a valid client message type.
 */
export function isClientMessage(value: unknown): value is ClientMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof (value as { type: unknown }).type === 'string' &&
    (CLIENT_MESSAGE_TYPES as readonly string[]).includes(
      (value as { type: string }).type
    )
  );
}

/**
 * Type guard that checks if an object is a valid {@link ServerMessage}.
 *
 * @param value - The value to check.
 * @returns `true` if the value has a valid server message type.
 */
export function isServerMessage(value: unknown): value is ServerMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof (value as { type: unknown }).type === 'string' &&
    (SERVER_MESSAGE_TYPES as readonly string[]).includes(
      (value as { type: string }).type
    )
  );
}
