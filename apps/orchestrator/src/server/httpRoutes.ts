/**
 * HTTP route definitions for the orchestrator Express server.
 *
 * @remarks
 * Provides health check and session management REST endpoints.
 * The router accepts dependencies for session CRUD and Vite lifecycle.
 *
 * @packageDocumentation
 */

import { Router, json } from 'express';
import { resolve, relative } from 'node:path';
import { existsSync } from 'node:fs';
import type { SessionManager } from '../sessions/sessionManager.js';
import type { ViteManager } from '../vite/viteManager.js';
import { buildGameProject as defaultBuildGameProject } from '../publish/gamePublisher.js';

/** Dependencies injected into the HTTP router. */
export interface HttpRouterDeps {
  sessionManager: SessionManager;
  viteManager: ViteManager;
  /** Injected for testability; defaults to the real implementation. */
  buildGameProject?: (projectPath: string) => Promise<string>;
}

/**
 * Creates the HTTP router with health and session API endpoints.
 *
 * @param deps - Dependencies for session and Vite management.
 * @returns Express Router with registered routes.
 */
export function createHttpRouter(deps: HttpRouterDeps): Router;
/**
 * @deprecated Use the deps object overload instead.
 */
export function createHttpRouter(sessionManager: SessionManager): Router;
export function createHttpRouter(
  depsOrManager: HttpRouterDeps | SessionManager
): Router {
  const deps: HttpRouterDeps =
    'sessionManager' in depsOrManager
      ? depsOrManager
      : { sessionManager: depsOrManager, viteManager: null as unknown as ViteManager };

  const { sessionManager, viteManager, buildGameProject = defaultBuildGameProject } = deps;

  const router = Router();
  router.use(json());

  /**
   * GET /health — returns server health status.
   * Used by Docker health checks and monitoring.
   */
  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  /**
   * POST /api/sessions — creates a new game session.
   * Accepts { engine, genre } in the request body.
   * Returns the created session with 201 status, or 503 if at max capacity.
   */
  router.post('/api/sessions', (req, res) => {
    const { engine, genre } = req.body;

    if (!engine || !genre) {
      res.status(400).json({ error: 'engine and genre are required' });
      return;
    }

    const session = sessionManager.createSession(engine, genre);
    if (!session) {
      res.status(503).json({ error: 'Maximum number of sessions reached' });
      return;
    }

    res.status(201).json({
      sessionId: session.id,
      status: session.status,
      engine: session.engine,
      genre: session.genre,
      createdAt: session.createdAt,
    });
  });

  /**
   * GET /api/sessions — returns all active sessions.
   * Returns an array of session summaries sorted by updatedAt descending.
   */
  router.get('/api/sessions', (_req, res) => {
    const sessions = sessionManager.listSessions();
    const sorted = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);
    res.json(
      sorted.map((s) => ({
        id: s.id,
        status: s.status,
        engine: s.engine,
        genre: s.genre,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        messageCount: s.conversationHistory.length,
        gameTitle: s.gdd?.title ?? null,
        totalCostUsd: s.totalCostUsd,
      }))
    );
  });

  /**
   * GET /api/sessions/:id — returns a single session by ID.
   * Returns 404 if the session does not exist.
   */
  router.get('/api/sessions/:id', (req, res) => {
    const session = sessionManager.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json({
      id: session.id,
      status: session.status,
      engine: session.engine,
      genre: session.genre,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      viteUrl: session.viteUrl,
      gameTitle: session.gdd?.title ?? null,
      totalCostUsd: session.totalCostUsd,
    });
  });

  /**
   * DELETE /api/sessions/:id — deletes a session and cleans up resources.
   * Stops the Vite dev server, removes from registry.
   * Pass ?cleanup=true to also delete session files from disk.
   * Returns 200 on success, 404 if session not found.
   */
  router.delete('/api/sessions/:id', (req, res) => {
    const session = sessionManager.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    // Stop Vite dev server if running
    if (viteManager?.isRunning(session.id)) {
      viteManager.stopDevServer(session.id);
    }

    const projectPath = session.projectPath;

    // Remove from registry
    sessionManager.deleteSession(session.id);

    // Optionally clean up files on disk
    if (req.query.cleanup === 'true') {
      sessionManager.deleteSessionFiles(session.id, projectPath);
    }

    res.json({ deleted: true, id: session.id });
  });

  /**
   * POST /api/sessions/:id/publish — builds the game for production and
   * makes it available at a shareable URL.
   * Returns { publishedUrl } on success.
   */
  router.post('/api/sessions/:id/publish', async (req, res) => {
    const session = sessionManager.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    if (!existsSync(resolve(session.projectPath, 'package.json'))) {
      res.status(400).json({ error: 'Project not scaffolded yet' });
      return;
    }

    try {
      await buildGameProject(session.projectPath);
      const publishedUrl = `/games/${session.id}/`;
      session.publishedAt = Date.now();
      session.publishedUrl = publishedUrl;
      res.json({ publishedUrl });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Build failed';
      res.status(500).json({ error: message });
    }
  });

  /**
   * GET /games/:sessionId/* — serves published game static files.
   * Bare path /games/:sessionId/ serves index.html.
   * Includes path traversal protection.
   */
  router.get('/games/:sessionId/*', (req, res) => {
    const session = sessionManager.getSession(req.params.sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const distDir = resolve(session.projectPath, 'dist');
    // Express wildcard (*) captures go into params[0] (array in Express 5, string in Express 4)
    const rawParam = (req.params as unknown as Record<string, string | string[]>)[0];
    const wildcard = Array.isArray(rawParam) ? rawParam.join('/') : (rawParam || '');
    const filePath = wildcard || 'index.html';
    const resolved = resolve(distDir, filePath);

    // Path traversal protection: ensure resolved path is within dist
    const rel = relative(distDir, resolved);
    if (rel.startsWith('..') || resolve(distDir, rel) !== resolved) {
      res.status(400).json({ error: 'Invalid path' });
      return;
    }

    if (!existsSync(resolved)) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    res.sendFile(resolved);
  });

  /**
   * GET /games/:sessionId — redirect bare path to trailing slash.
   */
  router.get('/games/:sessionId', (req, res) => {
    res.redirect(301, `/games/${req.params.sessionId}/`);
  });

  return router;
}
