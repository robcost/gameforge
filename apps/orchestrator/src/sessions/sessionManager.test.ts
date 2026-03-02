import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { SessionManager } from './sessionManager.js';
import { saveSessionSync } from './sessionPersistence.js';
import type { Session } from '@robcost/shared-types';
import { createDefaultAgentStates } from '@robcost/shared-types';

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager();
  });

  describe('createSession', () => {
    it('returns a session with a valid UUID', () => {
      const session = manager.createSession('phaser', 'platformer');
      expect(session.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });

    it('sets correct defaults', () => {
      const session = manager.createSession('phaser', 'platformer');
      expect(session.status).toBe('new');
      expect(session.engine).toBe('phaser');
      expect(session.genre).toBe('platformer');
      expect(session.vitePort).toBeNull();
      expect(session.viteUrl).toBeNull();
      expect(session.gdd).toBeNull();
      expect(session.conversationHistory).toEqual([]);
      expect(session.qaResults).toEqual([]);
      expect(session.iterationCount).toBe(0);
      expect(session.totalCostUsd).toBe(0);
    });

    it('sets projectPath containing the session ID', () => {
      const session = manager.createSession('phaser', 'platformer');
      expect(session.projectPath).toContain(session.id);
      expect(session.projectPath).toContain('sessions');
      expect(session.projectPath).toContain('game');
    });

    it('initializes agent states to idle', () => {
      const session = manager.createSession('phaser', 'platformer');
      expect(session.agentStates.designer).toBe('idle');
      expect(session.agentStates.developer).toBe('idle');
      expect(session.agentStates.qa).toBe('idle');
      expect(session.agentStates.orchestrator).toBe('idle');
    });
  });

  describe('getSession', () => {
    it('returns the session by ID', () => {
      const created = manager.createSession('phaser', 'platformer');
      const fetched = manager.getSession(created.id);
      expect(fetched).toBe(created);
    });

    it('returns undefined for unknown ID', () => {
      expect(manager.getSession('nonexistent')).toBeUndefined();
    });
  });

  describe('listSessions', () => {
    it('returns all sessions', () => {
      manager.createSession('phaser', 'platformer');
      manager.createSession('phaser', 'puzzle');
      expect(manager.listSessions()).toHaveLength(2);
    });

    it('returns empty array when no sessions exist', () => {
      expect(manager.listSessions()).toEqual([]);
    });
  });

  describe('updateSession', () => {
    it('merges partial updates', () => {
      const session = manager.createSession('phaser', 'platformer');
      manager.updateSession(session.id, { vitePort: 8100 });
      expect(manager.getSession(session.id)?.vitePort).toBe(8100);
    });

    it('bumps updatedAt on update', () => {
      const session = manager.createSession('phaser', 'platformer');
      const originalUpdatedAt = session.updatedAt;
      manager.updateSession(session.id, { genre: 'puzzle' });
      expect(manager.getSession(session.id)!.updatedAt).toBeGreaterThanOrEqual(
        originalUpdatedAt
      );
    });

    it('throws for unknown session', () => {
      expect(() => manager.updateSession('bad-id', {})).toThrow(
        'Session not found'
      );
    });
  });

  describe('transitionState', () => {
    it('transitions from new to scaffolding', () => {
      const session = manager.createSession('phaser', 'platformer');
      manager.transitionState(session.id, 'scaffolding');
      expect(manager.getSession(session.id)?.status).toBe('scaffolding');
    });

    it('transitions from scaffolding to ready', () => {
      const session = manager.createSession('phaser', 'platformer');
      manager.transitionState(session.id, 'scaffolding');
      manager.transitionState(session.id, 'ready');
      expect(manager.getSession(session.id)?.status).toBe('ready');
    });

    it('rejects invalid transitions', () => {
      const session = manager.createSession('phaser', 'platformer');
      expect(() =>
        manager.transitionState(session.id, 'developing')
      ).toThrow('Invalid state transition: new -> developing');
    });

    it('throws for unknown session', () => {
      expect(() => manager.transitionState('bad-id', 'scaffolding')).toThrow(
        'Session not found'
      );
    });
  });

  describe('deleteSession', () => {
    it('removes the session', () => {
      const session = manager.createSession('phaser', 'platformer')!;
      manager.deleteSession(session.id);
      expect(manager.getSession(session.id)).toBeUndefined();
    });

    it('does not throw for unknown ID', () => {
      expect(() => manager.deleteSession('nonexistent')).not.toThrow();
    });
  });

  describe('sessionCount', () => {
    it('returns 0 when no sessions exist', () => {
      expect(manager.sessionCount).toBe(0);
    });

    it('returns the number of sessions', () => {
      manager.createSession('phaser', 'platformer');
      manager.createSession('phaser', 'puzzle');
      expect(manager.sessionCount).toBe(2);
    });

    it('decrements after deleteSession', () => {
      const session = manager.createSession('phaser', 'platformer')!;
      manager.createSession('phaser', 'puzzle');
      expect(manager.sessionCount).toBe(2);
      manager.deleteSession(session.id);
      expect(manager.sessionCount).toBe(1);
    });
  });

  describe('maxSessions', () => {
    it('returns null when at the limit', () => {
      const limited = new SessionManager({ maxSessions: 2 });
      expect(limited.createSession('phaser', 'platformer')).not.toBeNull();
      expect(limited.createSession('phaser', 'puzzle')).not.toBeNull();
      expect(limited.createSession('phaser', 'shooter')).toBeNull();
    });

    it('allows creation again after deleting a session', () => {
      const limited = new SessionManager({ maxSessions: 1 });
      const session = limited.createSession('phaser', 'platformer')!;
      expect(limited.createSession('phaser', 'puzzle')).toBeNull();
      limited.deleteSession(session.id);
      expect(limited.createSession('phaser', 'puzzle')).not.toBeNull();
    });

    it('defaults to unlimited when maxSessions is not set', () => {
      const unlimited = new SessionManager();
      for (let i = 0; i < 25; i++) {
        expect(unlimited.createSession('phaser', `genre-${i}`)).not.toBeNull();
      }
      expect(unlimited.sessionCount).toBe(25);
    });
  });

  describe('deleteSessionFiles', () => {
    let testDir: string;

    beforeEach(() => {
      testDir = join(tmpdir(), `gameforge-sm-cleanup-${randomUUID()}`);
    });

    afterEach(() => {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    it('deletes the session directory from disk', () => {
      // Create a fake session directory structure: testDir/{id}/game/
      const sessionId = randomUUID();
      const sessionDir = join(testDir, sessionId);
      const projectPath = join(sessionDir, 'game');
      mkdirSync(projectPath, { recursive: true });
      writeFileSync(join(projectPath, 'index.html'), '<html></html>');

      expect(existsSync(sessionDir)).toBe(true);
      const result = manager.deleteSessionFiles(sessionId, projectPath);
      expect(result).toBe(true);
      expect(existsSync(sessionDir)).toBe(false);
    });

    it('returns false when the directory does not exist', () => {
      const projectPath = join(testDir, 'nonexistent', 'game');
      const result = manager.deleteSessionFiles('fake-id', projectPath);
      expect(result).toBe(false);
    });
  });
});

// ── Persistence tests ────────────────────────────────────────────────────

describe('SessionManager persistence', () => {
  let testDir: string;

  beforeEach(() => {
    vi.useFakeTimers();
    testDir = join(tmpdir(), `gameforge-sm-test-${randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('does not persist when persistenceDir is not set', () => {
    const manager = new SessionManager();
    const session = manager.createSession('phaser', 'platformer');
    const filePath = join(testDir, session.id, 'session.json');
    expect(existsSync(filePath)).toBe(false);
  });

  it('immediately saves on createSession', () => {
    const manager = new SessionManager({ persistenceDir: testDir });
    const session = manager.createSession('phaser', 'platformer');
    const filePath = join(testDir, session.id, 'session.json');
    expect(existsSync(filePath)).toBe(true);

    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    expect(data.id).toBe(session.id);
    expect(data.status).toBe('new');
  });

  it('does not immediately write on updateSession (debounced)', () => {
    const manager = new SessionManager({ persistenceDir: testDir });
    const session = manager.createSession('phaser', 'platformer');
    const initialData = JSON.parse(readFileSync(join(testDir, session.id, 'session.json'), 'utf-8'));

    // Update session — schedules a debounced save, not immediate
    manager.updateSession(session.id, { genre: 'puzzle' });

    // File should still have old data (debounce hasn't fired)
    const dataAfterUpdate = JSON.parse(readFileSync(join(testDir, session.id, 'session.json'), 'utf-8'));
    expect(dataAfterUpdate.genre).toBe(initialData.genre);
  });

  it('flushAll captures pending updateSession changes', () => {
    const manager = new SessionManager({ persistenceDir: testDir });
    const session = manager.createSession('phaser', 'platformer');

    manager.updateSession(session.id, { genre: 'puzzle' });
    manager.flushAll();

    const data = JSON.parse(readFileSync(join(testDir, session.id, 'session.json'), 'utf-8'));
    expect(data.genre).toBe('puzzle');
  });

  it('flushAll captures pending transitionState changes', () => {
    const manager = new SessionManager({ persistenceDir: testDir });
    const session = manager.createSession('phaser', 'platformer');

    manager.transitionState(session.id, 'scaffolding');
    manager.flushAll();

    const data = JSON.parse(readFileSync(join(testDir, session.id, 'session.json'), 'utf-8'));
    expect(data.status).toBe('scaffolding');
  });

  it('flushAll writes all sessions synchronously', () => {
    const manager = new SessionManager({ persistenceDir: testDir });
    const s1 = manager.createSession('phaser', 'platformer');
    const s2 = manager.createSession('phaser', 'puzzle');

    // Modify sessions (creates pending debounced saves)
    manager.transitionState(s1.id, 'scaffolding');
    manager.transitionState(s2.id, 'scaffolding');

    // Flush without waiting for debounce
    manager.flushAll();

    const data1 = JSON.parse(readFileSync(join(testDir, s1.id, 'session.json'), 'utf-8'));
    const data2 = JSON.parse(readFileSync(join(testDir, s2.id, 'session.json'), 'utf-8'));
    expect(data1.status).toBe('scaffolding');
    expect(data2.status).toBe('scaffolding');
  });

  it('loadPersistedSessions restores sessions into memory', () => {
    // Create a persisted session on disk manually
    const id = randomUUID();
    const session: Session = {
      id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: 'ready',
      engine: 'phaser',
      genre: 'platformer',
      projectPath: `/sessions/${id}/game`,
      vitePort: null,
      viteUrl: null,
      gdd: null,
      conversationHistory: [{ role: 'user', content: 'Hello', timestamp: 1000 }],
      agentStates: createDefaultAgentStates(),
      qaResults: [],
      iterationCount: 0,
      totalCostUsd: 0,
    };
    saveSessionSync(session, testDir);

    // Load into a fresh manager
    const manager = new SessionManager({ persistenceDir: testDir });
    const count = manager.loadPersistedSessions();

    expect(count).toBe(1);
    const loaded = manager.getSession(id);
    expect(loaded).toBeDefined();
    expect(loaded!.genre).toBe('platformer');
    expect(loaded!.conversationHistory).toHaveLength(1);
  });

  it('loadPersistedSessions returns 0 when persistence not configured', () => {
    const manager = new SessionManager();
    expect(manager.loadPersistedSessions()).toBe(0);
  });
});
