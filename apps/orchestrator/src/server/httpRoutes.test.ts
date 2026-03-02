import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import { createServer, type Server } from 'http';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHttpRouter } from './httpRoutes.js';
import { SessionManager } from '../sessions/sessionManager.js';
import type { ViteManager } from '../vite/viteManager.js';

let server: Server;
let baseUrl: string;
let sessionManager: SessionManager;
let mockViteManager: ViteManager;
let mockBuildGameProject: ReturnType<typeof vi.fn>;

/** Creates a mock ViteManager with the methods used by httpRoutes. */
function createMockViteManager(): ViteManager {
  return {
    isRunning: vi.fn(() => false),
    stopDevServer: vi.fn(),
  } as unknown as ViteManager;
}

/** Start a test server with a fresh SessionManager on a random port. */
function startTestServer(opts?: { maxSessions?: number }): Promise<void> {
  return new Promise((resolvePromise) => {
    sessionManager = new SessionManager({ maxSessions: opts?.maxSessions });
    mockViteManager = createMockViteManager();
    mockBuildGameProject = vi.fn();
    const app = express();
    app.use(createHttpRouter({
      sessionManager,
      viteManager: mockViteManager,
      buildGameProject: mockBuildGameProject,
    }));
    server = createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      baseUrl = `http://127.0.0.1:${port}`;
      resolvePromise();
    });
  });
}

beforeEach(async () => {
  await startTestServer();
});

afterEach(() => {
  return new Promise<void>((resolve) => {
    if (server) {
      server.close(() => resolve());
    } else {
      resolve();
    }
  });
});

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
  });

  it('timestamp is a valid ISO string', async () => {
    const res = await fetch(`${baseUrl}/health`);
    const body = await res.json();
    const date = new Date(body.timestamp);
    expect(date.toISOString()).toBe(body.timestamp);
  });
});

describe('POST /api/sessions', () => {
  it('creates a session and returns 201', async () => {
    const res = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ engine: 'phaser', genre: 'platformer' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.sessionId).toBeDefined();
    expect(body.status).toBe('new');
    expect(body.engine).toBe('phaser');
    expect(body.genre).toBe('platformer');
  });

  it('returns 400 when engine is missing', async () => {
    const res = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ genre: 'platformer' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/required/i);
  });

  it('returns 400 when genre is missing', async () => {
    const res = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ engine: 'phaser' }),
    });
    expect(res.status).toBe(400);
  });

  it('created session is retrievable via SessionManager', async () => {
    const res = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ engine: 'phaser', genre: 'platformer' }),
    });
    const body = await res.json();
    const session = sessionManager.getSession(body.sessionId);
    expect(session).toBeDefined();
    expect(session!.engine).toBe('phaser');
  });
});

describe('GET /api/sessions', () => {
  it('returns empty array when no sessions exist', async () => {
    const res = await fetch(`${baseUrl}/api/sessions`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it('returns created sessions with updatedAt and messageCount', async () => {
    sessionManager.createSession('phaser', 'platformer');
    sessionManager.createSession('phaser', 'shooter');

    const res = await fetch(`${baseUrl}/api/sessions`);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0]).toHaveProperty('id');
    expect(body[0]).toHaveProperty('status');
    expect(body[0]).toHaveProperty('engine');
    expect(body[0]).toHaveProperty('genre');
    expect(body[0]).toHaveProperty('createdAt');
    expect(body[0]).toHaveProperty('updatedAt');
    expect(body[0]).toHaveProperty('messageCount');
    expect(body[0].messageCount).toBe(0);
    expect(body[0]).toHaveProperty('gameTitle');
    expect(body[0].gameTitle).toBeNull();
    expect(body[0]).toHaveProperty('totalCostUsd');
    expect(body[0].totalCostUsd).toBe(0);
  });

  it('sorts sessions by updatedAt descending', async () => {
    const older = sessionManager.createSession('phaser', 'platformer');
    const newer = sessionManager.createSession('phaser', 'shooter');
    // Directly set updatedAt to ensure deterministic ordering
    // (updateSession overrides updatedAt with Date.now())
    const olderSession = sessionManager.getSession(older.id)!;
    const newerSession = sessionManager.getSession(newer.id)!;
    olderSession.updatedAt = 1000;
    newerSession.updatedAt = 2000;

    const res = await fetch(`${baseUrl}/api/sessions`);
    const body = await res.json();
    expect(body[0].id).toBe(newer.id);
    expect(body[1].id).toBe(older.id);
  });

  it('returns correct messageCount', async () => {
    const session = sessionManager.createSession('phaser', 'platformer');
    session.conversationHistory.push(
      { role: 'user', content: 'Hello', timestamp: 1000 },
      { role: 'designer', content: 'Hi there', timestamp: 2000 }
    );

    const res = await fetch(`${baseUrl}/api/sessions`);
    const body = await res.json();
    expect(body[0].messageCount).toBe(2);
  });
});

describe('GET /api/sessions/:id', () => {
  it('returns a session by ID', async () => {
    const session = sessionManager.createSession('phaser', 'platformer');

    const res = await fetch(`${baseUrl}/api/sessions/${session.id}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(session.id);
    expect(body.engine).toBe('phaser');
    expect(body.genre).toBe('platformer');
    expect(body.status).toBe('new');
    expect(body.gameTitle).toBeNull();
    expect(body.totalCostUsd).toBe(0);
  });

  it('returns 404 for unknown session', async () => {
    const res = await fetch(`${baseUrl}/api/sessions/nonexistent-id`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });
});

describe('DELETE /api/sessions/:id', () => {
  it('deletes an existing session and returns 200', async () => {
    const session = sessionManager.createSession('phaser', 'platformer')!;
    const res = await fetch(`${baseUrl}/api/sessions/${session.id}`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(true);
    expect(body.id).toBe(session.id);
    expect(sessionManager.getSession(session.id)).toBeUndefined();
  });

  it('returns 404 for unknown session', async () => {
    const res = await fetch(`${baseUrl}/api/sessions/nonexistent-id`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });

  it('stops Vite dev server if running', async () => {
    const session = sessionManager.createSession('phaser', 'platformer')!;
    vi.mocked(mockViteManager.isRunning).mockReturnValue(true);

    const res = await fetch(`${baseUrl}/api/sessions/${session.id}`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(200);
    expect(mockViteManager.stopDevServer).toHaveBeenCalledWith(session.id);
  });

  it('does not call stopDevServer when Vite is not running', async () => {
    const session = sessionManager.createSession('phaser', 'platformer')!;
    vi.mocked(mockViteManager.isRunning).mockReturnValue(false);

    await fetch(`${baseUrl}/api/sessions/${session.id}`, { method: 'DELETE' });
    expect(mockViteManager.stopDevServer).not.toHaveBeenCalled();
  });
});

describe('POST /api/sessions — max sessions limit', () => {
  beforeEach(async () => {
    // Restart with a limited server
    await new Promise<void>((resolve) => {
      if (server) server.close(() => resolve());
      else resolve();
    });
    await startTestServer({ maxSessions: 2 });
  });

  it('returns 503 when at the session limit', async () => {
    // Create 2 sessions (at limit)
    await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ engine: 'phaser', genre: 'platformer' }),
    });
    await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ engine: 'phaser', genre: 'puzzle' }),
    });

    // Third should be rejected
    const res = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ engine: 'phaser', genre: 'shooter' }),
    });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/maximum/i);
  });
});

describe('POST /api/sessions/:id/publish', () => {
  it('returns 404 for unknown session', async () => {
    const res = await fetch(`${baseUrl}/api/sessions/nonexistent/publish`, {
      method: 'POST',
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 when project is not scaffolded', async () => {
    const session = sessionManager.createSession('phaser', 'platformer')!;
    // projectPath points to a non-existent directory by default

    const res = await fetch(`${baseUrl}/api/sessions/${session.id}/publish`, {
      method: 'POST',
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/not scaffolded/i);
  });

  it('returns 200 with publishedUrl on successful build', async () => {
    // Create a session with a real temp directory containing package.json
    const session = sessionManager.createSession('phaser', 'platformer')!;
    const tempDir = resolve(tmpdir(), `gameforge-test-publish-${session.id}`);
    mkdirSync(tempDir, { recursive: true });
    writeFileSync(resolve(tempDir, 'package.json'), '{}');
    session.projectPath = tempDir;

    mockBuildGameProject.mockResolvedValue(resolve(tempDir, 'dist'));

    const res = await fetch(`${baseUrl}/api/sessions/${session.id}/publish`, {
      method: 'POST',
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.publishedUrl).toBe(`/games/${session.id}/`);
    expect(session.publishedAt).toBeGreaterThan(0);
    expect(session.publishedUrl).toBe(`/games/${session.id}/`);

    // Cleanup
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns 500 on build failure', async () => {
    const session = sessionManager.createSession('phaser', 'platformer')!;
    const tempDir = resolve(tmpdir(), `gameforge-test-fail-${session.id}`);
    mkdirSync(tempDir, { recursive: true });
    writeFileSync(resolve(tempDir, 'package.json'), '{}');
    session.projectPath = tempDir;

    mockBuildGameProject.mockRejectedValue(new Error('Vite build failed: syntax error'));

    const res = await fetch(`${baseUrl}/api/sessions/${session.id}/publish`, {
      method: 'POST',
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/Vite build failed/);

    // Cleanup
    rmSync(tempDir, { recursive: true, force: true });
  });
});

describe('GET /games/:sessionId/*', () => {
  let tempDir: string;
  let testSession: ReturnType<SessionManager['createSession']>;

  beforeEach(() => {
    testSession = sessionManager.createSession('phaser', 'platformer')!;
    tempDir = resolve(tmpdir(), `gameforge-test-static-${testSession.id}`);
    const distDir = resolve(tempDir, 'dist');
    mkdirSync(resolve(distDir, 'assets'), { recursive: true });
    writeFileSync(resolve(distDir, 'index.html'), '<html>game</html>');
    writeFileSync(resolve(distDir, 'assets', 'main.js'), 'console.log("game")');
    testSession.projectPath = tempDir;
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('serves index.html for bare path with trailing slash', async () => {
    const res = await fetch(`${baseUrl}/games/${testSession!.id}/`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe('<html>game</html>');
  });

  it('serves asset files from dist', async () => {
    const res = await fetch(`${baseUrl}/games/${testSession!.id}/assets/main.js`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe('console.log("game")');
  });

  it('returns 404 for unknown session', async () => {
    const res = await fetch(`${baseUrl}/games/nonexistent/index.html`);
    expect(res.status).toBe(404);
  });

  it('returns 404 for non-existent file', async () => {
    const res = await fetch(`${baseUrl}/games/${testSession!.id}/missing.js`);
    expect(res.status).toBe(404);
  });

  it('redirects bare path without trailing slash', async () => {
    const res = await fetch(`${baseUrl}/games/${testSession!.id}`, {
      redirect: 'manual',
    });
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe(`/games/${testSession!.id}/`);
  });
});
