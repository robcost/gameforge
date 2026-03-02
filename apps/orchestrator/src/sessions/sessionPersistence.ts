/**
 * File-based persistence for game sessions.
 *
 * @remarks
 * Reads and writes `session.json` files alongside each game project directory.
 * Sessions are stored at `sessions/{id}/session.json`. Runtime-only fields
 * (vitePort, viteUrl) and large binary data (QA screenshots) are stripped
 * during serialization. Transient pipeline states are normalized to `error`
 * on load since those pipeline runs were interrupted.
 *
 * @packageDocumentation
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Session, SessionState, QATestResult } from '@robcost/shared-types';

/** The filename used for persisted session data. */
const SESSION_FILE = 'session.json';

/**
 * States that represent an in-progress pipeline run.
 * Sessions loaded from disk in these states are normalized to `error`
 * since the pipeline was interrupted by a server restart.
 */
const TRANSIENT_STATES: readonly SessionState[] = [
  'scaffolding',
  'designing',
  'developing',
  'testing',
  'iterating',
];

/**
 * Prepares a session for serialization by stripping runtime-only fields
 * and large binary data.
 *
 * @param session - The session to serialize.
 * @returns A plain object safe for JSON.stringify.
 */
export function serializeSession(session: Session): Record<string, unknown> {
  return {
    id: session.id,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    status: session.status,
    engine: session.engine,
    genre: session.genre,
    projectPath: session.projectPath,
    vitePort: null,
    viteUrl: null,
    gdd: session.gdd,
    conversationHistory: session.conversationHistory,
    agentStates: session.agentStates,
    qaResults: session.qaResults.map(stripScreenshot),
    iterationCount: session.iterationCount,
    totalCostUsd: session.totalCostUsd,
  };
}

/**
 * Strips the screenshotBase64 field from a QA test result to reduce file size.
 */
function stripScreenshot(result: QATestResult): QATestResult {
  const { screenshotBase64: _, ...rest } = result;
  return rest;
}

/**
 * Normalizes a session loaded from disk. Transient pipeline states are
 * set to `error` since the pipeline was interrupted by a restart.
 *
 * @param session - The deserialized session object.
 * @returns The normalized session.
 */
export function normalizeLoadedSession(session: Session): Session {
  if ((TRANSIENT_STATES as readonly string[]).includes(session.status)) {
    session.status = 'error';
  }
  // Runtime fields are always null after a restart
  session.vitePort = null;
  session.viteUrl = null;
  // Backward compat: sessions persisted before cost tracking was added
  if (session.totalCostUsd === undefined) {
    session.totalCostUsd = 0;
  }
  return session;
}

/**
 * Writes a session to disk synchronously. Used during graceful shutdown
 * to ensure all pending state is flushed before the process exits.
 *
 * @param session - The session to persist.
 * @param sessionsRoot - Root directory containing all session directories.
 */
export function saveSessionSync(session: Session, sessionsRoot: string): void {
  const dir = join(sessionsRoot, session.id);
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, SESSION_FILE);
  writeFileSync(filePath, JSON.stringify(serializeSession(session), null, 2));
}

/**
 * Writes a session to disk asynchronously. Used for debounced saves
 * during normal operation.
 *
 * @param session - The session to persist.
 * @param sessionsRoot - Root directory containing all session directories.
 */
export async function saveSessionAsync(session: Session, sessionsRoot: string): Promise<void> {
  const dir = join(sessionsRoot, session.id);
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, SESSION_FILE);
  await writeFile(filePath, JSON.stringify(serializeSession(session), null, 2));
}

/**
 * Loads a session from a session directory on disk.
 *
 * @param sessionDir - The directory containing `session.json` (e.g. `sessions/{id}`).
 * @returns The parsed and normalized session, or null if the file is missing or corrupt.
 */
export function loadSession(sessionDir: string): Session | null {
  const filePath = join(sessionDir, SESSION_FILE);
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const raw = readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw) as Session;

    // Basic validation — must have an id and status
    if (!data.id || !data.status) {
      return null;
    }

    return normalizeLoadedSession(data);
  } catch {
    return null;
  }
}

/**
 * Scans the sessions root directory and loads all valid session files.
 *
 * @param sessionsRoot - Root directory containing session subdirectories.
 * @returns Array of loaded and normalized sessions.
 */
export function loadAllSessions(sessionsRoot: string): Session[] {
  if (!existsSync(sessionsRoot)) {
    return [];
  }

  const entries = readdirSync(sessionsRoot, { withFileTypes: true });
  const sessions: Session[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const session = loadSession(join(sessionsRoot, entry.name));
    if (session) {
      sessions.push(session);
    }
  }

  return sessions;
}
