/**
 * WebSocket message handler for orchestrator-studio communication.
 *
 * @remarks
 * Handles session resumption (triggering the scaffold-and-preview pipeline),
 * user chat messages, and preview interaction commands. Each connection
 * tracks its associated session ID.
 *
 * @packageDocumentation
 */

import type { Server as HttpServer } from 'http';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import type {
  ClientMessage,
  ServerMessage,
  Session,
} from '@robcost/shared-types';
import { isClientMessage } from '@robcost/shared-types';
import type { SessionManager } from '../sessions/sessionManager.js';
import type { ViteManager } from '../vite/viteManager.js';
import type { TeamOrchestrator, AgentCallbacks } from '../agents/teamOrchestrator.js';

/** Dependencies injected into the WebSocket handler. */
export interface WsHandlerDeps {
  sessionManager: SessionManager;
  viteManager: ViteManager;
  scaffoldProject: (
    session: Session,
    options?: { skipInstall?: boolean }
  ) => Promise<void>;
  teamOrchestrator: TeamOrchestrator;
}

/**
 * Sends a typed server message to a WebSocket client.
 *
 * @param ws - The WebSocket connection.
 * @param message - The server message to send.
 */
function sendMessage(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

/**
 * Sends the full session state to the client for restoration after reconnect.
 *
 * @param ws - The WebSocket connection.
 * @param session - The session to restore.
 */
function sendSessionRestore(ws: WebSocket, session: Session): void {
  sendMessage(ws, {
    type: 'session_restore',
    sessionId: session.id,
    status: session.status,
    conversationHistory: session.conversationHistory,
    agentStates: session.agentStates,
    previewUrl: session.viteUrl,
    iterationCount: session.iterationCount,
    gameTitle: session.gdd?.title ?? null,
    totalCostUsd: session.totalCostUsd,
    publishedUrl: session.publishedUrl,
  });
}

/**
 * Restarts the Vite dev server for a restored session where the project
 * exists on disk but the Vite process is no longer running.
 *
 * @param ws - The WebSocket connection.
 * @param session - The session needing Vite restart.
 * @param deps - The injected dependencies.
 */
async function restartViteForSession(
  ws: WebSocket,
  session: Session,
  deps: WsHandlerDeps
): Promise<void> {
  try {
    sendMessage(ws, {
      type: 'agent_status',
      agentRole: 'orchestrator',
      status: 'working',
      detail: 'Restarting preview server...',
    });

    const { port, url } = await deps.viteManager.startDevServer(
      session.id,
      session.projectPath
    );
    deps.sessionManager.updateSession(session.id, {
      vitePort: port,
      viteUrl: url,
    });

    sendMessage(ws, {
      type: 'agent_status',
      agentRole: 'orchestrator',
      status: 'idle',
      detail: 'Preview server ready',
    });

    sendMessage(ws, { type: 'preview_ready', url });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ws] vite restart error for ${session.id}:`, message);
    sendMessage(ws, { type: 'error', message: `Preview restart failed: ${message}` });
  }
}

/**
 * Checks whether a session's game project has been scaffolded on disk.
 *
 * @param session - The session to check.
 * @returns true if the project's package.json exists.
 */
function isProjectScaffolded(session: Session): boolean {
  return existsSync(join(session.projectPath, 'package.json'));
}

/**
 * Runs the scaffold-then-preview pipeline for a session.
 * Transitions state, scaffolds the project, starts Vite, and
 * notifies the client when the preview is ready.
 *
 * @param ws - The WebSocket connection to send status updates to.
 * @param session - The session to scaffold.
 * @param deps - The injected dependencies.
 */
async function runScaffoldPipeline(
  ws: WebSocket,
  session: Session,
  deps: WsHandlerDeps
): Promise<void> {
  try {
    deps.sessionManager.transitionState(session.id, 'scaffolding');

    sendMessage(ws, {
      type: 'agent_status',
      agentRole: 'orchestrator',
      status: 'working',
      detail: 'Setting up workspace...',
    });

    await deps.scaffoldProject(session);

    sendMessage(ws, {
      type: 'agent_status',
      agentRole: 'orchestrator',
      status: 'working',
      detail: 'Starting preview server...',
    });

    const { port, url } = await deps.viteManager.startDevServer(
      session.id,
      session.projectPath
    );
    deps.sessionManager.updateSession(session.id, {
      vitePort: port,
      viteUrl: url,
    });

    deps.sessionManager.transitionState(session.id, 'ready');

    sendMessage(ws, {
      type: 'agent_status',
      agentRole: 'orchestrator',
      status: 'idle',
      detail: 'Workspace ready',
    });

    sendMessage(ws, { type: 'preview_ready', url });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ws] scaffold pipeline error for ${session.id}:`, message);

    try {
      deps.sessionManager.transitionState(session.id, 'error');
    } catch {
      // Already in error state or session not found
    }

    sendMessage(ws, { type: 'error', message: `Setup failed: ${message}` });
  }
}

/**
 * Attaches a WebSocket server to the given HTTP server with message routing.
 *
 * @param server - The HTTP server to attach WebSocket handling to.
 * @param deps - Dependencies for session management, Vite lifecycle, and scaffolding.
 * @returns The created WebSocketServer instance.
 */
export function attachWebSocketHandler(
  server: HttpServer,
  deps: WsHandlerDeps
): WebSocketServer {
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws: WebSocket) => {
    let sessionId: string | null = null;

    ws.on('message', (data: Buffer) => {
      const raw = data.toString();
      let parsed: unknown;

      try {
        parsed = JSON.parse(raw);
      } catch {
        sendMessage(ws, { type: 'error', message: 'Invalid JSON' });
        return;
      }

      if (!isClientMessage(parsed)) {
        sendMessage(ws, {
          type: 'error',
          message: `Unknown message type: ${(parsed as { type?: string }).type ?? 'undefined'}`,
        });
        return;
      }

      const msg = parsed as ClientMessage;

      switch (msg.type) {
        case 'session_resume': {
          const session = deps.sessionManager.getSession(msg.sessionId);
          if (!session) {
            sendMessage(ws, {
              type: 'error',
              message: `Session not found: ${msg.sessionId}`,
            });
            return;
          }

          sessionId = session.id;

          // Update Vite idle tracking on reconnect
          deps.viteManager.touchSession(session.id);

          // Always send full session state for restoration
          sendSessionRestore(ws, session);

          if (session.status === 'new') {
            runScaffoldPipeline(ws, session, deps);
          } else if (
            (session.status === 'ready' || session.status === 'awaiting_feedback' || session.status === 'error') &&
            !deps.viteManager.isRunning(session.id)
          ) {
            // Session was restored from disk — Vite needs restarting
            if (isProjectScaffolded(session)) {
              restartViteForSession(ws, session, deps);
            } else {
              // Project directory missing — need full scaffold
              runScaffoldPipeline(ws, session, deps);
            }
          } else if (
            (session.status === 'ready' || session.status === 'awaiting_feedback') &&
            session.viteUrl
          ) {
            // Vite is already running — just send the preview URL
            sendMessage(ws, { type: 'preview_ready', url: session.viteUrl });
          } else if (session.status === 'scaffolding') {
            sendMessage(ws, {
              type: 'agent_status',
              agentRole: 'orchestrator',
              status: 'working',
              detail: 'Setting up workspace...',
            });
          }
          break;
        }

        case 'user_message': {
          if (!sessionId) {
            sendMessage(ws, {
              type: 'error',
              message: 'No session associated. Send session_resume first.',
            });
            return;
          }

          const session = deps.sessionManager.getSession(sessionId);
          if (!session) {
            sendMessage(ws, { type: 'error', message: 'Session not found' });
            return;
          }

          // Update Vite idle tracking on user activity
          deps.viteManager.touchSession(session.id);

          session.conversationHistory.push({
            role: 'user',
            content: msg.content,
            timestamp: Date.now(),
          });

          // Create callbacks that map to WebSocket messages
          const agentCallbacks: AgentCallbacks = {
            onAgentStatus: (role, status, detail) =>
              sendMessage(ws, { type: 'agent_status', agentRole: role, status, detail }),
            onAgentMessage: (role, content) =>
              sendMessage(ws, { type: 'agent_message', agentRole: role, content }),
            onToolActivity: (role, fileName, code) =>
              sendMessage(ws, { type: 'tool_activity', agentRole: role, fileName, code }),
            onQAScreenshot: (imageBase64, description) =>
              sendMessage(ws, { type: 'qa_screenshot', imageBase64, description }),
            onPreviewRefresh: () =>
              sendMessage(ws, { type: 'preview_refresh' }),
            onError: (errorMsg) =>
              sendMessage(ws, { type: 'error', message: errorMsg }),
            onCostUpdate: (totalCostUsd) =>
              sendMessage(ws, { type: 'cost_update', totalCostUsd }),
            onAssetProgress: (assetKey, description, status, imageBase64) =>
              sendMessage(ws, { type: 'asset_generation_progress', assetKey, description, status, imageBase64 }),
            onMusicProgress: (description, status, durationSeconds) =>
              sendMessage(ws, { type: 'music_generation_progress', description, status, durationSeconds }),
          };

          // Fire-and-forget — agent pipeline runs asynchronously
          deps.teamOrchestrator
            .handleUserMessage(session, msg.content, agentCallbacks)
            .catch((err: unknown) => {
              const errorMsg = err instanceof Error ? err.message : String(err);
              sendMessage(ws, { type: 'error', message: errorMsg });
            });
          break;
        }

        case 'preview_interaction': {
          if (msg.action === 'reset') {
            sendMessage(ws, { type: 'preview_refresh' });
          }
          break;
        }

        case 'session_create': {
          const newSession = deps.sessionManager.createSession(
            msg.engine,
            msg.genre
          );
          if (!newSession) {
            sendMessage(ws, {
              type: 'error',
              message: 'Maximum number of sessions reached',
            });
            return;
          }
          sessionId = newSession.id;

          sendMessage(ws, {
            type: 'session_created',
            sessionId: newSession.id,
            previewUrl: '',
          });

          runScaffoldPipeline(ws, newSession, deps);
          break;
        }
      }
    });

    ws.on('close', () => {
      sessionId = null;
    });

    ws.on('error', (err: Error) => {
      console.error('[ws] error:', err.message);
    });
  });

  return wss;
}
