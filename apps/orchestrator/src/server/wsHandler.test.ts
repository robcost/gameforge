import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import { createServer, type Server } from 'http';
import WebSocket from 'ws';
import { attachWebSocketHandler, type WsHandlerDeps } from './wsHandler.js';
import { SessionManager } from '../sessions/sessionManager.js';
import { ViteManager } from '../vite/viteManager.js';
import type { TeamOrchestrator } from '../agents/teamOrchestrator.js';
import type { AgentCallbacks } from '../agents/teamOrchestrator.js';

let server: Server;
let port: number;
let sessionManager: SessionManager;
let mockViteManager: ViteManager & { isRunning: ReturnType<typeof vi.fn> };
let deps: WsHandlerDeps;
let mockHandleUserMessage: ReturnType<typeof vi.fn>;

/** Receive the next message from a WebSocket client. */
function nextMessage(ws: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    ws.once('message', (data: Buffer) => {
      resolve(JSON.parse(data.toString()));
    });
  });
}

/** Collect N messages from a WebSocket client. */
function collectMessages(ws: WebSocket, count: number): Promise<Record<string, unknown>[]> {
  return new Promise((resolve) => {
    const messages: Record<string, unknown>[] = [];
    const handler = (data: Buffer) => {
      messages.push(JSON.parse(data.toString()));
      if (messages.length >= count) {
        ws.off('message', handler);
        resolve(messages);
      }
    };
    ws.on('message', handler);
  });
}

/** Start an HTTP server with the WS handler on a random port. */
function startWsServer(): Promise<void> {
  return new Promise((resolve) => {
    sessionManager = new SessionManager();

    // Mock orchestrator that calls onAgentMessage so the WS client gets a reply
    mockHandleUserMessage = vi.fn().mockImplementation(
      async (
        _session: unknown,
        _message: string,
        callbacks: AgentCallbacks
      ) => {
        callbacks.onAgentMessage('orchestrator', 'Processing your request...');
      }
    );

    // Create a real ViteManager but spy on isRunning
    mockViteManager = new ViteManager() as ViteManager & { isRunning: ReturnType<typeof vi.fn> };
    vi.spyOn(mockViteManager, 'isRunning');

    deps = {
      sessionManager,
      viteManager: mockViteManager,
      scaffoldProject: vi.fn().mockResolvedValue(undefined),
      teamOrchestrator: {
        handleUserMessage: mockHandleUserMessage,
      } as unknown as TeamOrchestrator,
    };
    const app = express();
    server = createServer(app);
    attachWebSocketHandler(server, deps);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve();
    });
  });
}

/** Connect a WebSocket client to the test server. */
function connectClient(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

beforeEach(async () => {
  await startWsServer();
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

describe('WebSocket Handler', () => {
  it('accepts a WebSocket connection', async () => {
    const ws = await connectClient();
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  it('returns error for invalid JSON', async () => {
    const ws = await connectClient();
    const response = nextMessage(ws);
    ws.send('not json {{{');
    const msg = await response;
    expect(msg.type).toBe('error');
    expect(msg.message).toBe('Invalid JSON');
    ws.close();
  });

  it('returns error for unknown message type', async () => {
    const ws = await connectClient();
    const response = nextMessage(ws);
    ws.send(JSON.stringify({ type: 'unknown_type' }));
    const msg = await response;
    expect(msg.type).toBe('error');
    expect(msg.message).toContain('Unknown message type');
    ws.close();
  });

  describe('session_resume', () => {
    it('returns error for unknown session', async () => {
      const ws = await connectClient();
      const response = nextMessage(ws);
      ws.send(
        JSON.stringify({ type: 'session_resume', sessionId: 'nonexistent' })
      );
      const msg = await response;
      expect(msg.type).toBe('error');
      expect(msg.message).toContain('Session not found');
      ws.close();
    });

    it('sends session_restore then agent_status when resuming a new session', async () => {
      const session = sessionManager.createSession('phaser', 'platformer');
      const ws = await connectClient();

      // Expect two messages: session_restore + agent_status (from scaffold pipeline)
      const messages = collectMessages(ws, 2);
      ws.send(
        JSON.stringify({ type: 'session_resume', sessionId: session.id })
      );

      const [restore, status] = await messages;
      expect(restore.type).toBe('session_restore');
      expect(restore.sessionId).toBe(session.id);
      expect(restore.status).toBe('new');

      expect(status.type).toBe('agent_status');
      expect(status.agentRole).toBe('orchestrator');
      expect(status.detail).toContain('Setting up workspace');
      ws.close();
    });

    it('sends session_restore with conversation history', async () => {
      const session = sessionManager.createSession('phaser', 'platformer');
      session.conversationHistory.push(
        { role: 'user', content: 'Make a platformer', timestamp: 1000 },
        { role: 'designer', content: 'Created GDD', timestamp: 2000 }
      );

      const ws = await connectClient();
      const response = nextMessage(ws);
      ws.send(
        JSON.stringify({ type: 'session_resume', sessionId: session.id })
      );

      const msg = await response;
      expect(msg.type).toBe('session_restore');
      expect(msg.conversationHistory).toHaveLength(2);
      ws.close();
    });

    it('sends preview_ready when resuming a ready session with Vite running', async () => {
      const session = sessionManager.createSession('phaser', 'platformer');
      sessionManager.transitionState(session.id, 'scaffolding');
      sessionManager.transitionState(session.id, 'ready');
      sessionManager.updateSession(session.id, {
        viteUrl: 'http://localhost:8100',
      });

      // Mock Vite as running for this session
      mockViteManager.isRunning = vi.fn().mockReturnValue(true);

      const ws = await connectClient();
      const messages = collectMessages(ws, 2);
      ws.send(
        JSON.stringify({ type: 'session_resume', sessionId: session.id })
      );

      const [restore, preview] = await messages;
      expect(restore.type).toBe('session_restore');
      expect(preview.type).toBe('preview_ready');
      expect(preview.url).toBe('http://localhost:8100');
      ws.close();
    });

    it('sends session_restore for error state sessions', async () => {
      const session = sessionManager.createSession('phaser', 'platformer');
      sessionManager.transitionState(session.id, 'error');
      session.conversationHistory.push(
        { role: 'user', content: 'Hello', timestamp: 1000 }
      );

      const ws = await connectClient();
      const response = nextMessage(ws);
      ws.send(
        JSON.stringify({ type: 'session_resume', sessionId: session.id })
      );

      const msg = await response;
      expect(msg.type).toBe('session_restore');
      expect(msg.status).toBe('error');
      expect(msg.conversationHistory).toHaveLength(1);
      ws.close();
    });
  });

  describe('user_message', () => {
    it('returns error when no session is associated', async () => {
      const ws = await connectClient();
      const response = nextMessage(ws);
      ws.send(
        JSON.stringify({ type: 'user_message', content: 'hello' })
      );
      const msg = await response;
      expect(msg.type).toBe('error');
      expect(msg.message).toContain('session_resume first');
      ws.close();
    });

    it('dispatches to team orchestrator after session_resume', async () => {
      const session = sessionManager.createSession('phaser', 'platformer');
      sessionManager.transitionState(session.id, 'scaffolding');
      sessionManager.transitionState(session.id, 'ready');
      sessionManager.updateSession(session.id, {
        viteUrl: 'http://localhost:8100',
      });

      // Mock Vite as running
      mockViteManager.isRunning = vi.fn().mockReturnValue(true);

      const ws = await connectClient();

      // Resume session — collect both session_restore and preview_ready
      const resumeMessages = collectMessages(ws, 2);
      ws.send(
        JSON.stringify({ type: 'session_resume', sessionId: session.id })
      );
      await resumeMessages;

      // Now send a user message
      const msgResponse = nextMessage(ws);
      ws.send(
        JSON.stringify({ type: 'user_message', content: 'make a red ball' })
      );
      const msg = await msgResponse;

      // Verify the mock orchestrator was called
      expect(mockHandleUserMessage).toHaveBeenCalledWith(
        expect.objectContaining({ id: session.id }),
        'make a red ball',
        expect.objectContaining({
          onAgentStatus: expect.any(Function),
          onAgentMessage: expect.any(Function),
          onToolActivity: expect.any(Function),
          onQAScreenshot: expect.any(Function),
          onPreviewRefresh: expect.any(Function),
          onError: expect.any(Function),
        })
      );

      // Verify the mock's callback sent a WS message
      expect(msg.type).toBe('agent_message');
      expect(msg.agentRole).toBe('orchestrator');
      ws.close();
    });

    it('adds user message to conversation history before dispatching', async () => {
      const session = sessionManager.createSession('phaser', 'platformer');
      sessionManager.transitionState(session.id, 'scaffolding');
      sessionManager.transitionState(session.id, 'ready');
      sessionManager.updateSession(session.id, {
        viteUrl: 'http://localhost:8100',
      });

      // Mock Vite as running
      mockViteManager.isRunning = vi.fn().mockReturnValue(true);

      const ws = await connectClient();

      const resumeMessages = collectMessages(ws, 2);
      ws.send(
        JSON.stringify({ type: 'session_resume', sessionId: session.id })
      );
      await resumeMessages;

      // Send a user message and wait for the mock orchestrator's response
      const msgResponse = nextMessage(ws);
      ws.send(
        JSON.stringify({ type: 'user_message', content: 'add a jump button' })
      );
      await msgResponse;

      const updated = sessionManager.getSession(session.id)!;
      expect(updated.conversationHistory).toHaveLength(1);
      expect(updated.conversationHistory[0].role).toBe('user');
      expect(updated.conversationHistory[0].content).toBe('add a jump button');
      ws.close();
    });
  });

  describe('preview_interaction', () => {
    it('sends preview_refresh on reset action', async () => {
      const ws = await connectClient();
      const response = nextMessage(ws);
      ws.send(
        JSON.stringify({ type: 'preview_interaction', action: 'reset' })
      );
      const msg = await response;
      expect(msg.type).toBe('preview_refresh');
      ws.close();
    });
  });

  it('handles client disconnect gracefully', async () => {
    const ws = await connectClient();
    const closed = new Promise<void>((resolve) => {
      ws.on('close', () => resolve());
    });
    ws.close();
    await closed;
    expect(ws.readyState).toBe(WebSocket.CLOSED);
  });
});
