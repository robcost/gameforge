import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { Session } from '@robcost/shared-types';
import { createDefaultAgentStates } from '@robcost/shared-types';
import {
  serializeSession,
  normalizeLoadedSession,
  saveSessionSync,
  saveSessionAsync,
  loadSession,
  loadAllSessions,
} from './sessionPersistence.js';

/** Creates a minimal valid session for testing. */
function createTestSession(overrides: Partial<Session> = {}): Session {
  const id = randomUUID();
  return {
    id,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: 'ready',
    engine: 'phaser',
    genre: 'platformer',
    projectPath: `/sessions/${id}/game`,
    vitePort: 8100,
    viteUrl: 'http://localhost:8100',
    gdd: null,
    conversationHistory: [],
    agentStates: createDefaultAgentStates(),
    qaResults: [],
    iterationCount: 0,
    totalCostUsd: 0,
    ...overrides,
  };
}

/** Temporary directory for test file operations. */
let testDir: string;

describe('sessionPersistence', () => {
  beforeEach(() => {
    testDir = join(tmpdir(), `gameforge-test-${randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('serializeSession', () => {
    it('strips vitePort and viteUrl', () => {
      const session = createTestSession({ vitePort: 8100, viteUrl: 'http://localhost:8100' });
      const serialized = serializeSession(session);
      expect(serialized.vitePort).toBeNull();
      expect(serialized.viteUrl).toBeNull();
    });

    it('strips screenshotBase64 from qaResults', () => {
      const session = createTestSession({
        qaResults: [
          {
            id: 'qa-1',
            timestamp: Date.now(),
            passed: true,
            screenshotBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAUA',
            errors: [],
            summary: 'All tests passed',
          },
        ],
      });
      const serialized = serializeSession(session);
      const results = serialized.qaResults as Array<Record<string, unknown>>;
      expect(results[0]).not.toHaveProperty('screenshotBase64');
      expect(results[0].summary).toBe('All tests passed');
    });

    it('includes totalCostUsd', () => {
      const session = createTestSession({ totalCostUsd: 0.5678 });
      const serialized = serializeSession(session);
      expect(serialized.totalCostUsd).toBe(0.5678);
    });

    it('preserves conversationHistory', () => {
      const session = createTestSession({
        conversationHistory: [
          { role: 'user', content: 'Make a platformer', timestamp: 1000 },
          { role: 'designer', content: 'Created GDD', timestamp: 2000 },
        ],
      });
      const serialized = serializeSession(session);
      expect(serialized.conversationHistory).toHaveLength(2);
    });
  });

  describe('normalizeLoadedSession', () => {
    it('normalizes transient states to error', () => {
      const transientStates = ['scaffolding', 'designing', 'developing', 'testing', 'iterating'] as const;
      for (const status of transientStates) {
        const session = createTestSession({ status });
        const normalized = normalizeLoadedSession(session);
        expect(normalized.status).toBe('error');
      }
    });

    it('preserves stable states', () => {
      const stableStates = ['new', 'ready', 'awaiting_feedback', 'error', 'closed'] as const;
      for (const status of stableStates) {
        const session = createTestSession({ status });
        const normalized = normalizeLoadedSession(session);
        expect(normalized.status).toBe(status);
      }
    });

    it('clears vitePort and viteUrl', () => {
      const session = createTestSession({ vitePort: 8100, viteUrl: 'http://localhost:8100' });
      const normalized = normalizeLoadedSession(session);
      expect(normalized.vitePort).toBeNull();
      expect(normalized.viteUrl).toBeNull();
    });

    it('defaults totalCostUsd to 0 when missing (backward compat)', () => {
      const session = createTestSession();
      // Simulate an old persisted session without totalCostUsd
      delete (session as Record<string, unknown>).totalCostUsd;
      const normalized = normalizeLoadedSession(session);
      expect(normalized.totalCostUsd).toBe(0);
    });
  });

  describe('saveSessionSync / loadSession', () => {
    it('round-trips a session through save and load', () => {
      const session = createTestSession({
        conversationHistory: [
          { role: 'user', content: 'Hello', timestamp: 1000 },
        ],
        iterationCount: 3,
      });

      saveSessionSync(session, testDir);

      const sessionDir = join(testDir, session.id);
      const loaded = loadSession(sessionDir);

      expect(loaded).not.toBeNull();
      expect(loaded!.id).toBe(session.id);
      expect(loaded!.status).toBe('ready');
      expect(loaded!.conversationHistory).toHaveLength(1);
      expect(loaded!.iterationCount).toBe(3);
      // Runtime fields should be null
      expect(loaded!.vitePort).toBeNull();
      expect(loaded!.viteUrl).toBeNull();
    });

    it('creates directory if it does not exist', () => {
      const session = createTestSession();
      const nestedDir = join(testDir, 'nested', 'path');
      saveSessionSync(session, nestedDir);

      const filePath = join(nestedDir, session.id, 'session.json');
      expect(existsSync(filePath)).toBe(true);
    });
  });

  describe('saveSessionAsync', () => {
    it('writes session file asynchronously', async () => {
      const session = createTestSession();
      await saveSessionAsync(session, testDir);

      const filePath = join(testDir, session.id, 'session.json');
      expect(existsSync(filePath)).toBe(true);

      const raw = readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw);
      expect(data.id).toBe(session.id);
    });
  });

  describe('loadSession', () => {
    it('returns null for missing directory', () => {
      const result = loadSession(join(testDir, 'nonexistent'));
      expect(result).toBeNull();
    });

    it('returns null for corrupt JSON', () => {
      const sessionDir = join(testDir, 'corrupt');
      mkdirSync(sessionDir, { recursive: true });
      writeFileSync(join(sessionDir, 'session.json'), '{invalid json!!!');

      const result = loadSession(sessionDir);
      expect(result).toBeNull();
    });

    it('returns null for JSON missing required fields', () => {
      const sessionDir = join(testDir, 'incomplete');
      mkdirSync(sessionDir, { recursive: true });
      writeFileSync(join(sessionDir, 'session.json'), JSON.stringify({ foo: 'bar' }));

      const result = loadSession(sessionDir);
      expect(result).toBeNull();
    });

    it('normalizes transient states on load', () => {
      const session = createTestSession({ status: 'designing' });
      saveSessionSync(session, testDir);

      const loaded = loadSession(join(testDir, session.id));
      expect(loaded!.status).toBe('error');
    });
  });

  describe('loadAllSessions', () => {
    it('loads all valid sessions from directory', () => {
      const s1 = createTestSession();
      const s2 = createTestSession();
      saveSessionSync(s1, testDir);
      saveSessionSync(s2, testDir);

      const loaded = loadAllSessions(testDir);
      expect(loaded).toHaveLength(2);

      const ids = loaded.map((s) => s.id).sort();
      expect(ids).toEqual([s1.id, s2.id].sort());
    });

    it('skips directories without session.json', () => {
      const s1 = createTestSession();
      saveSessionSync(s1, testDir);

      // Create a directory without session.json (like a bare game project)
      mkdirSync(join(testDir, 'no-session-file'), { recursive: true });

      const loaded = loadAllSessions(testDir);
      expect(loaded).toHaveLength(1);
    });

    it('returns empty array for nonexistent directory', () => {
      const loaded = loadAllSessions(join(testDir, 'does-not-exist'));
      expect(loaded).toEqual([]);
    });

    it('returns empty array for empty directory', () => {
      const loaded = loadAllSessions(testDir);
      expect(loaded).toEqual([]);
    });
  });
});
