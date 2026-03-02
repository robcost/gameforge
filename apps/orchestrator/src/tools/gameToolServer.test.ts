import { describe, it, expect, beforeEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { SessionManager } from '../sessions/sessionManager.js';
import { createGameToolServer } from './gameToolServer.js';
import type { Session } from '@robcost/shared-types';
import { createDefaultGDD } from '@robcost/shared-types';

/** Tool result type returned by MCP tool handlers. */
type ToolResult = { content: Array<{ type: string; text?: string }>; isError?: boolean };

/**
 * Extracts a tool handler from the MCP server's internal registry.
 * The SDK's `createSdkMcpServer` stores tools on `instance._registeredTools`.
 */
function getToolHandler(server: ReturnType<typeof createGameToolServer>, toolName: string) {
  const instance = (server as unknown as { instance: { _registeredTools: Record<string, { handler: (args: Record<string, unknown>) => Promise<ToolResult> }> } }).instance;
  const toolEntry = instance._registeredTools[toolName];
  if (!toolEntry) throw new Error(`Tool "${toolName}" not found in server`);
  return toolEntry.handler;
}

describe('gameToolServer', () => {
  let sessionManager: SessionManager;
  let session: Session;
  let projectPath: string;

  beforeEach(() => {
    sessionManager = new SessionManager();
    session = sessionManager.createSession('phaser', 'platformer');

    // Create a temp project directory with some files
    projectPath = join(tmpdir(), `gameforge-test-${randomUUID()}`);
    mkdirSync(join(projectPath, 'src', 'scenes'), { recursive: true });
    writeFileSync(join(projectPath, 'package.json'), '{"name": "test-game"}');
    writeFileSync(join(projectPath, 'index.html'), '<html></html>');
    writeFileSync(join(projectPath, 'src', 'main.ts'), 'console.log("hello")');
    writeFileSync(join(projectPath, 'src', 'scenes', 'MainScene.ts'), 'class MainScene {}');

    // Update session with the real project path
    sessionManager.updateSession(session.id, { projectPath });
    session = sessionManager.getSession(session.id)!;
  });

  describe('get_design_document', () => {
    it('returns "no GDD" message when session has no GDD', async () => {
      const server = createGameToolServer(session, { sessionManager });
      const handler = getToolHandler(server, 'get_design_document');
      const result = await handler({}, {});
      expect(result.content[0].text).toContain('No Game Design Document');
    });

    it('returns the GDD as JSON when one exists', async () => {
      const gdd = createDefaultGDD();
      gdd.title = 'Space Cats';
      sessionManager.updateSession(session.id, { gdd });

      const server = createGameToolServer(session, { sessionManager });
      const handler = getToolHandler(server, 'get_design_document');
      const result = await handler({}, {});

      const parsed = JSON.parse(result.content[0].text!);
      expect(parsed.title).toBe('Space Cats');
      expect(parsed.genre).toBe('other');
    });
  });

  describe('set_design_document', () => {
    it('saves a valid GDD to the session', async () => {
      const server = createGameToolServer(session, { sessionManager });
      const handler = getToolHandler(server, 'set_design_document');

      const gdd = createDefaultGDD();
      gdd.title = 'Dog vs Cats';
      const result = await handler({ gdd_json: JSON.stringify(gdd) }, {});

      expect(result.content[0].text).toContain('saved successfully');
      expect(result.content[0].text).toContain('Dog vs Cats');

      const updated = sessionManager.getSession(session.id)!;
      expect(updated.gdd?.title).toBe('Dog vs Cats');
    });

    it('rejects invalid JSON', async () => {
      const server = createGameToolServer(session, { sessionManager });
      const handler = getToolHandler(server, 'set_design_document');

      const result = await handler({ gdd_json: 'not json' }, {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid JSON');
    });

    it('rejects a GDD missing required fields', async () => {
      const server = createGameToolServer(session, { sessionManager });
      const handler = getToolHandler(server, 'set_design_document');

      const result = await handler({ gdd_json: JSON.stringify({ title: 'Test' }) }, {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('validation failed');
    });

    it('rejects a GDD with wrong field types', async () => {
      const server = createGameToolServer(session, { sessionManager });
      const handler = getToolHandler(server, 'set_design_document');

      const gdd = createDefaultGDD();
      (gdd as unknown as Record<string, unknown>).enemies = 'not an array';
      const result = await handler({ gdd_json: JSON.stringify(gdd) }, {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('expected array');
    });
  });

  describe('get_project_structure', () => {
    it('returns the file tree of the project directory', async () => {
      const server = createGameToolServer(session, { sessionManager });
      const handler = getToolHandler(server, 'get_project_structure');

      const result = await handler({}, {});
      const text = result.content[0].text!;

      expect(text).toContain('src/');
      expect(text).toContain('package.json');
      expect(text).toContain('index.html');
      expect(text).toContain('main.ts');
      expect(text).toContain('MainScene.ts');
    });

    it('excludes node_modules from the tree', async () => {
      mkdirSync(join(projectPath, 'node_modules', 'some-pkg'), { recursive: true });
      writeFileSync(join(projectPath, 'node_modules', 'some-pkg', 'index.js'), '');

      const server = createGameToolServer(session, { sessionManager });
      const handler = getToolHandler(server, 'get_project_structure');

      const result = await handler({}, {});
      expect(result.content[0].text).not.toContain('node_modules');
    });

    it('handles non-existent directory gracefully', async () => {
      // Clean up the temp dir
      rmSync(projectPath, { recursive: true, force: true });

      const server = createGameToolServer(session, { sessionManager });
      const handler = getToolHandler(server, 'get_project_structure');

      const result = await handler({}, {});
      expect(result.content[0].text).toContain('unable to read');
    });
  });

  describe('get_session_info', () => {
    it('returns session metadata', async () => {
      const server = createGameToolServer(session, { sessionManager });
      const handler = getToolHandler(server, 'get_session_info');

      const result = await handler({}, {});
      const info = JSON.parse(result.content[0].text!);

      expect(info.id).toBe(session.id);
      expect(info.status).toBe('new');
      expect(info.engine).toBe('phaser');
      expect(info.genre).toBe('platformer');
      expect(info.hasGDD).toBe(false);
    });

    it('reflects updated GDD status', async () => {
      sessionManager.updateSession(session.id, { gdd: createDefaultGDD() });

      const server = createGameToolServer(session, { sessionManager });
      const handler = getToolHandler(server, 'get_session_info');

      const result = await handler({}, {});
      const info = JSON.parse(result.content[0].text!);
      expect(info.hasGDD).toBe(true);
    });
  });
});
