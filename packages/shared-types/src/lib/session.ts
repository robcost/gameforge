/**
 * Session lifecycle and state management types.
 *
 * @remarks
 * A session represents a single game creation workspace tied to one
 * game project. Sessions follow a state machine from creation through
 * the design → develop → test → feedback iteration loop.
 *
 * @packageDocumentation
 */

import type { AgentRole, AgentStatus } from './agents.js';
import type { GameDesignDocument, GameEngine } from './game.js';

/** States in the session lifecycle state machine. */
export type SessionState =
  | 'new'
  | 'scaffolding'
  | 'ready'
  | 'designing'
  | 'generating_assets'
  | 'generating_music'
  | 'developing'
  | 'testing'
  | 'awaiting_feedback'
  | 'iterating'
  | 'error'
  | 'closed';

/** All valid session states as a readonly array for runtime validation. */
export const SESSION_STATES: readonly SessionState[] = [
  'new',
  'scaffolding',
  'ready',
  'designing',
  'generating_assets',
  'generating_music',
  'developing',
  'testing',
  'awaiting_feedback',
  'iterating',
  'error',
  'closed',
] as const;

/** A single turn in the conversation history. */
export interface ConversationTurn {
  role: 'user' | AgentRole;
  content: string;
  timestamp: number;
}

/** Result of a QA test run. */
export interface QATestResult {
  id: string;
  timestamp: number;
  passed: boolean;
  screenshotBase64?: string;
  errors: string[];
  summary: string;
}

/**
 * The session data model — represents a single game creation workspace.
 *
 * @remarks
 * Sessions are created when a user starts a new game project and persist
 * for the duration of the creation process. In Circle 1, sessions are
 * ephemeral and do not survive server restarts.
 */
export interface Session {
  /** Unique session identifier (UUID). */
  id: string;
  createdAt: number;
  updatedAt: number;
  status: SessionState;
  engine: GameEngine;
  genre: string;

  /** Filesystem path to the game project (e.g. /sessions/{id}/game). */
  projectPath: string;
  /** Port number of the Vite dev server for this session. */
  vitePort: number | null;
  /** URL of the Vite dev server for this session. */
  viteUrl: string | null;

  /** Current Game Design Document, or null if not yet created. */
  gdd: GameDesignDocument | null;
  conversationHistory: ConversationTurn[];
  agentStates: Record<AgentRole, AgentStatus>;

  /** History of QA test runs for this session. */
  qaResults: QATestResult[];
  /** Number of feedback/iteration loops completed. */
  iterationCount: number;
  /** Cumulative API cost in USD for all agent calls in this session. */
  totalCostUsd: number;

  /** Timestamp when the game was published (production build), or null. */
  publishedAt: number | null;
  /** URL path where the published game is served (e.g. /games/{id}/), or null. */
  publishedUrl: string | null;
}

/**
 * Valid state transitions in the session state machine.
 *
 * @remarks
 * Used to validate that session state changes follow the expected flow.
 * The 'error' state can be reached from any state.
 */
export const VALID_STATE_TRANSITIONS: Record<SessionState, readonly SessionState[]> = {
  new: ['scaffolding', 'error', 'closed'],
  scaffolding: ['ready', 'error', 'closed'],
  ready: ['designing', 'error', 'closed'],
  designing: ['generating_assets', 'generating_music', 'developing', 'ready', 'error', 'closed'],
  generating_assets: ['generating_music', 'developing', 'designing', 'error', 'closed'],
  generating_music: ['developing', 'error', 'closed'],
  developing: ['testing', 'designing', 'error', 'closed'],
  testing: ['awaiting_feedback', 'developing', 'error', 'closed'],
  awaiting_feedback: ['iterating', 'error', 'closed'],
  iterating: ['designing', 'developing', 'error', 'closed'],
  error: ['ready', 'closed'],
  closed: [],
} as const;

/**
 * Checks whether a state transition is valid.
 *
 * @param from - The current session state.
 * @param to - The target session state.
 * @returns `true` if the transition is allowed.
 */
export function isValidTransition(from: SessionState, to: SessionState): boolean {
  return (VALID_STATE_TRANSITIONS[from] as readonly string[]).includes(to);
}

/**
 * Type guard that checks if a string is a valid {@link SessionState}.
 *
 * @param value - The string to check.
 * @returns `true` if the value is a valid SessionState.
 */
export function isSessionState(value: string): value is SessionState {
  return (SESSION_STATES as readonly string[]).includes(value);
}
