/**
 * Session-scoped MCP tool server for game development operations.
 *
 * @remarks
 * Creates an MCP server with tools that operate on a specific session's data.
 * Each `query()` call to the Agent SDK gets a fresh server instance with the
 * session context baked in — agents don't need to pass session IDs.
 *
 * Tools provided:
 * - `get_design_document` — reads the current GDD from session state
 * - `set_design_document` — validates and saves a GDD to the session
 * - `get_project_structure` — lists the file tree of the game project
 * - `get_session_info` — returns session metadata (status, engine, genre, etc.)
 *
 * @packageDocumentation
 */

import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { GameDesignDocument } from '@robcost/shared-types';
import type { Session } from '@robcost/shared-types';
import type { SessionManager } from '../sessions/sessionManager.js';

/** Dependencies needed to create a game tool server. */
export interface GameToolServerDeps {
  sessionManager: SessionManager;
}

/**
 * Recursively builds a file tree string for a directory.
 * Ignores `node_modules` and hidden directories.
 *
 * @param dirPath - Absolute path to the directory.
 * @param basePath - The root path to compute relative paths from.
 * @param indent - Current indentation string for nested display.
 * @returns A formatted string representation of the file tree.
 */
function buildFileTree(dirPath: string, basePath: string, indent = ''): string {
  let result = '';

  try {
    const entries = readdirSync(dirPath, { withFileTypes: true })
      .filter(e => e.name !== 'node_modules' && !e.name.startsWith('.'))
      .sort((a, b) => {
        // Directories first, then files
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);

      if (entry.isDirectory()) {
        result += `${indent}${entry.name}/\n`;
        result += buildFileTree(fullPath, basePath, indent + '  ');
      } else {
        const size = statSync(fullPath).size;
        result += `${indent}${entry.name} (${size} bytes)\n`;
      }
    }
  } catch {
    result += `${indent}(unable to read directory)\n`;
  }

  return result;
}

/**
 * Validates a parsed object against the expected GDD structure.
 * Performs basic type and field checks without a full Zod schema
 * to keep the tool input simple (GDD is passed as JSON string).
 *
 * @param obj - The parsed JSON object to validate.
 * @returns The object cast as GameDesignDocument if valid, or an error string.
 */
function validateGDD(obj: unknown): GameDesignDocument | string {
  if (!obj || typeof obj !== 'object') {
    return 'GDD must be a JSON object';
  }

  const gdd = obj as Record<string, unknown>;

  // Check required top-level string fields
  const requiredStrings = ['title', 'description', 'genre', 'engine'];
  for (const field of requiredStrings) {
    if (typeof gdd[field] !== 'string') {
      return `GDD missing or invalid field: ${field} (expected string)`;
    }
  }

  // Check required object fields
  const requiredObjects = ['viewport', 'physics', 'player', 'ui', 'audio'];
  for (const field of requiredObjects) {
    if (!gdd[field] || typeof gdd[field] !== 'object') {
      return `GDD missing or invalid field: ${field} (expected object)`;
    }
  }

  // Check optional array fields — validate type only if present
  const optionalArrays = ['enemies', 'collectibles', 'hazards', 'levels'];
  for (const field of optionalArrays) {
    if (gdd[field] !== undefined && !Array.isArray(gdd[field])) {
      return `GDD invalid field: ${field} (expected array)`;
    }
  }

  return gdd as unknown as GameDesignDocument;
}

/**
 * Creates a session-scoped MCP tool server for use with Agent SDK `query()` calls.
 *
 * @param session - The session this server operates on.
 * @param deps - Dependencies (session manager for persistence).
 * @returns An MCP server config that can be passed to `query()` options.mcpServers.
 */
export function createGameToolServer(session: Session, deps: GameToolServerDeps) {
  return createSdkMcpServer({
    name: 'game-tools',
    version: '1.0.0',
    tools: [
      tool(
        'get_design_document',
        'Get the current Game Design Document (GDD) for this session. Returns the GDD as JSON, or a message if no GDD has been created yet.',
        {},
        async () => {
          const current = deps.sessionManager.getSession(session.id);
          if (!current?.gdd) {
            return {
              content: [{ type: 'text' as const, text: 'No Game Design Document has been created yet.' }],
            };
          }
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(current.gdd, null, 2) }],
          };
        }
      ),

      tool(
        'set_design_document',
        'Save or update the Game Design Document (GDD) for this session. The GDD must be a valid JSON string containing all required fields: title, description, genre, engine, viewport, physics, player, enemies, collectibles, hazards, levels, ui, audio.',
        {
          gdd_json: z.string().describe(
            'The complete Game Design Document as a JSON string. Must include all required fields.'
          ),
        },
        async (args) => {
          let parsed: unknown;
          try {
            parsed = JSON.parse(args.gdd_json);
          } catch (err) {
            return {
              content: [{ type: 'text' as const, text: `Invalid JSON: ${(err as Error).message}` }],
              isError: true,
            };
          }

          const result = validateGDD(parsed);
          if (typeof result === 'string') {
            return {
              content: [{ type: 'text' as const, text: `GDD validation failed: ${result}` }],
              isError: true,
            };
          }

          deps.sessionManager.updateSession(session.id, { gdd: result });
          return {
            content: [{ type: 'text' as const, text: `Game Design Document saved successfully. Title: "${result.title}"` }],
          };
        }
      ),

      tool(
        'get_project_structure',
        'Get the file tree structure of the game project directory. Shows all files and directories (excluding node_modules and hidden files).',
        {},
        async () => {
          const tree = buildFileTree(session.projectPath, session.projectPath);
          if (!tree.trim()) {
            return {
              content: [{ type: 'text' as const, text: 'Project directory is empty or does not exist.' }],
            };
          }
          return {
            content: [{ type: 'text' as const, text: tree }],
          };
        }
      ),

      tool(
        'get_session_info',
        'Get metadata about the current game creation session, including status, engine, genre, and preview URL.',
        {},
        async () => {
          const current = deps.sessionManager.getSession(session.id);
          if (!current) {
            return {
              content: [{ type: 'text' as const, text: 'Session not found.' }],
              isError: true,
            };
          }
          const info = {
            id: current.id,
            status: current.status,
            engine: current.engine,
            genre: current.genre,
            viteUrl: current.viteUrl,
            iterationCount: current.iterationCount,
            hasGDD: current.gdd !== null,
          };
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(info, null, 2) }],
          };
        }
      ),
    ],
  });
}
