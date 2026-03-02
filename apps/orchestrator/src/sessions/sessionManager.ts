/**
 * In-memory session registry with optional file-based persistence.
 *
 * @remarks
 * Sessions live in an in-memory Map for fast access. When a `persistenceDir`
 * is provided, sessions are also saved to disk as `{id}/session.json` files
 * using debounced writes to avoid I/O thrashing during pipeline runs.
 * On startup, persisted sessions can be loaded back into memory.
 *
 * @packageDocumentation
 */

import { randomUUID } from 'node:crypto';
import { existsSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type {
  Session,
  SessionState,
  GameEngine,
} from '@robcost/shared-types';
import {
  isValidTransition,
  createDefaultAgentStates,
} from '@robcost/shared-types';
import {
  saveSessionSync,
  saveSessionAsync,
  loadAllSessions,
} from './sessionPersistence.js';

/** Delay in milliseconds before flushing a debounced save. */
const DEBOUNCE_MS = 2000;

/**
 * Resolves the workspace root directory.
 * The orchestrator is always launched via `nx serve` from the monorepo root,
 * so `process.cwd()` reliably returns the workspace root.
 */
function getWorkspaceRoot(): string {
  return process.cwd();
}

/** Options for constructing a SessionManager. */
export interface SessionManagerOptions {
  /** Directory containing session subdirectories. Enables file persistence when set. */
  persistenceDir?: string;
  /** Maximum number of sessions allowed. createSession returns null when at limit. Default: unlimited. */
  maxSessions?: number;
}

/**
 * Manages the lifecycle of game creation sessions.
 * Backed by an in-memory Map with optional file-based persistence.
 */
export class SessionManager {
  private sessions = new Map<string, Session>();
  private readonly persistenceDir: string | null;
  private readonly maxSessions: number;
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(options?: SessionManagerOptions) {
    this.persistenceDir = options?.persistenceDir ?? null;
    this.maxSessions = options?.maxSessions ?? Infinity;
  }

  /**
   * Returns the current number of sessions in the registry.
   */
  get sessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Creates a new session with the given engine and genre.
   *
   * @param engine - The game engine to use (e.g. 'phaser').
   * @param genre - The game genre (e.g. 'platformer').
   * @returns The newly created Session object.
   */
  createSession(engine: GameEngine, genre: string): Session | null {
    if (this.sessions.size >= this.maxSessions) {
      return null;
    }

    const id = randomUUID();
    const now = Date.now();
    const projectPath = resolve(getWorkspaceRoot(), 'sessions', id, 'game');

    const session: Session = {
      id,
      createdAt: now,
      updatedAt: now,
      status: 'new',
      engine,
      genre,
      projectPath,
      vitePort: null,
      viteUrl: null,
      gdd: null,
      conversationHistory: [],
      agentStates: createDefaultAgentStates(),
      qaResults: [],
      iterationCount: 0,
      totalCostUsd: 0,
      publishedAt: null,
      publishedUrl: null,
    };

    this.sessions.set(id, session);

    // Immediate save for new sessions (first write)
    if (this.persistenceDir) {
      saveSessionSync(session, this.persistenceDir);
    }

    return session;
  }

  /**
   * Retrieves a session by ID.
   *
   * @param id - The session UUID.
   * @returns The session, or undefined if not found.
   */
  getSession(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  /**
   * Returns all active sessions.
   */
  listSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Merges a partial update into an existing session.
   *
   * @param id - The session UUID.
   * @param update - Partial session fields to merge.
   * @throws If the session does not exist.
   */
  updateSession(id: string, update: Partial<Omit<Session, 'id'>>): void {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error(`Session not found: ${id}`);
    }
    Object.assign(session, update, { updatedAt: Date.now() });
    this.scheduleSave(session);
  }

  /**
   * Transitions a session to a new state, validating against the state machine.
   *
   * @param id - The session UUID.
   * @param newState - The target state.
   * @throws If the session does not exist or the transition is invalid.
   */
  transitionState(id: string, newState: SessionState): void {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error(`Session not found: ${id}`);
    }
    if (!isValidTransition(session.status, newState)) {
      throw new Error(
        `Invalid state transition: ${session.status} -> ${newState}`
      );
    }
    session.status = newState;
    session.updatedAt = Date.now();
    this.scheduleSave(session);
  }

  /**
   * Removes a session from the registry and cancels any pending save.
   *
   * @param id - The session UUID.
   */
  deleteSession(id: string): void {
    this.cancelDebounce(id);
    this.sessions.delete(id);
  }

  /**
   * Deletes the session directory and all its files from disk.
   * The session directory is the parent of the projectPath (e.g. `sessions/{id}/`).
   *
   * @param id - The session UUID.
   * @param projectPath - The session's project path (used to derive the session directory).
   * @returns true if the directory existed and was deleted, false otherwise.
   */
  deleteSessionFiles(id: string, projectPath: string): boolean {
    // projectPath is sessions/{id}/game — go up one level to get sessions/{id}
    const sessionDir = dirname(projectPath);
    if (!existsSync(sessionDir)) {
      return false;
    }
    rmSync(sessionDir, { recursive: true, force: true });
    return true;
  }

  /**
   * Loads persisted sessions from the persistence directory into the in-memory Map.
   * Should be called at server startup.
   *
   * @returns The number of sessions loaded.
   */
  loadPersistedSessions(): number {
    if (!this.persistenceDir) return 0;

    const loaded = loadAllSessions(this.persistenceDir);
    for (const session of loaded) {
      this.sessions.set(session.id, session);
    }
    return loaded.length;
  }

  /**
   * Flushes all pending debounced saves synchronously.
   * Should be called during graceful shutdown.
   */
  flushAll(): void {
    if (!this.persistenceDir) return;

    // Cancel all pending debounce timers
    for (const [id, timer] of this.debounceTimers) {
      clearTimeout(timer);
      this.debounceTimers.delete(id);
    }

    // Write all sessions synchronously
    for (const session of this.sessions.values()) {
      saveSessionSync(session, this.persistenceDir);
    }
  }

  /**
   * Schedules a debounced save for the given session.
   * Resets the timer if a save is already pending.
   */
  private scheduleSave(session: Session): void {
    if (!this.persistenceDir) return;

    this.cancelDebounce(session.id);

    const dir = this.persistenceDir;
    const timer = setTimeout(() => {
      this.debounceTimers.delete(session.id);
      saveSessionAsync(session, dir).catch((err) => {
        console.error(`[session] failed to persist ${session.id}:`, err);
      });
    }, DEBOUNCE_MS);

    this.debounceTimers.set(session.id, timer);
  }

  /** Cancels a pending debounce timer for the given session ID. */
  private cancelDebounce(id: string): void {
    const existing = this.debounceTimers.get(id);
    if (existing) {
      clearTimeout(existing);
      this.debounceTimers.delete(id);
    }
  }
}
