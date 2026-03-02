import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Session } from '@robcost/shared-types';
import { SessionManager } from '../sessions/sessionManager.js';
import { ViteManager } from '../vite/viteManager.js';
import type { AgentCallbacks } from './teamOrchestrator.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

/** Mock the Agent SDK — query() is replaced with a vi.fn(). */
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}));

/** Mock the game tool server factory to avoid real MCP server creation. */
vi.mock('../tools/gameToolServer.js', () => ({
  createGameToolServer: vi.fn().mockReturnValue({
    type: 'sdk',
    name: 'game-tools',
    instance: { _registeredTools: {} },
  }),
}));

/** Mock the Playwright tool server factory to avoid launching browsers. */
vi.mock('../tools/playwrightToolServer.js', () => ({
  createPlaywrightToolServer: vi.fn().mockReturnValue({
    server: {
      type: 'sdk',
      name: 'playwright',
      instance: { _registeredTools: {} },
    },
    dispose: vi.fn().mockResolvedValue(undefined),
  }),
}));

/** Mock the asset tool server factory to avoid real Gemini API calls. */
vi.mock('../tools/assetToolServer.js', () => ({
  createAssetToolServer: vi.fn().mockReturnValue({
    type: 'sdk',
    name: 'asset-tools',
    instance: { _registeredTools: {} },
  }),
}));

// Import after mocks are defined
import { query } from '@anthropic-ai/claude-agent-sdk';
import { TeamOrchestrator } from './teamOrchestrator.js';
import { createPlaywrightToolServer } from '../tools/playwrightToolServer.js';

const mockQuery = vi.mocked(query);
const mockCreatePlaywrightToolServer = vi.mocked(createPlaywrightToolServer);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a mock async generator that yields the given messages.
 * Cast to the query() return type for mock compatibility.
 */
function mockAgentResponse(messages: unknown[]): ReturnType<typeof query> {
  return (async function* () {
    for (const msg of messages) {
      yield msg;
    }
  })() as unknown as ReturnType<typeof query>;
}

/** Shorthand for a successful agent run that emits one text block. */
function successMessages(text: string) {
  return [
    {
      type: 'assistant',
      message: { content: [{ type: 'text', text }] },
    },
    {
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: text,
    },
  ];
}

/** Creates spied AgentCallbacks with a recorded call log. */
function createMockCallbacks(): AgentCallbacks {
  return {
    onAgentStatus: vi.fn(),
    onAgentMessage: vi.fn(),
    onToolActivity: vi.fn(),
    onQAScreenshot: vi.fn(),
    onPreviewRefresh: vi.fn(),
    onError: vi.fn(),
    onCostUpdate: vi.fn(),
    onAssetProgress: vi.fn(),
  };
}

/**
 * Advances a session to the 'ready' state for testing.
 * (new → scaffolding → ready)
 */
function advanceToReady(sessionManager: SessionManager, sessionId: string): void {
  sessionManager.transitionState(sessionId, 'scaffolding');
  sessionManager.transitionState(sessionId, 'ready');
}

/**
 * Advances a session to the 'awaiting_feedback' state for testing.
 * (new → scaffolding → ready → designing → developing → testing → awaiting_feedback)
 */
function advanceToAwaitingFeedback(
  sessionManager: SessionManager,
  sessionId: string
): void {
  advanceToReady(sessionManager, sessionId);
  sessionManager.transitionState(sessionId, 'designing');
  sessionManager.transitionState(sessionId, 'developing');
  sessionManager.transitionState(sessionId, 'testing');
  sessionManager.transitionState(sessionId, 'awaiting_feedback');
}

/**
 * Sets up mockQuery to return successful responses for the full pipeline
 * (designer + developer + QA pass). Adds a passing QA result to the
 * session so the pipeline sees QA as passed.
 */
function setupPassingPipeline(sessionManager: SessionManager, sessionId: string): void {
  mockQuery
    .mockImplementationOnce(() => {
      // Designer mock — simulate setting the GDD so pipeline continues
      sessionManager.updateSession(sessionId, {
        gdd: { title: 'Test Game' } as Session['gdd'],
      });
      return mockAgentResponse(successMessages('Designed!'));
    })
    .mockReturnValueOnce(mockAgentResponse(successMessages('Built!')))
    .mockImplementationOnce(() => {
      // QA agent mock — simulate adding a passing QA result
      sessionManager.updateSession(sessionId, {
        qaResults: [
          ...sessionManager.getSession(sessionId)!.qaResults,
          {
            id: 'qa-test-1',
            timestamp: Date.now(),
            passed: true,
            errors: [],
            summary: 'All tests passed.',
          },
        ],
      });
      return mockAgentResponse(successMessages('QA passed!'));
    });
}

/**
 * Sets up mockQuery to return successful responses where QA fails,
 * triggering a developer retry, then QA passes on the retry.
 */
function setupFailThenPassPipeline(sessionManager: SessionManager, sessionId: string): void {
  mockQuery
    .mockImplementationOnce(() => {
      // Designer mock — simulate setting the GDD so pipeline continues
      sessionManager.updateSession(sessionId, {
        gdd: { title: 'Test Game' } as Session['gdd'],
      });
      return mockAgentResponse(successMessages('Designed!'));
    })
    .mockReturnValueOnce(mockAgentResponse(successMessages('Built!')))
    .mockImplementationOnce(() => {
      // First QA run — fails
      sessionManager.updateSession(sessionId, {
        qaResults: [
          ...sessionManager.getSession(sessionId)!.qaResults,
          {
            id: 'qa-fail-1',
            timestamp: Date.now(),
            passed: false,
            errors: ['Player falls through platform'],
            summary: 'Collision issues found.',
          },
        ],
      });
      return mockAgentResponse(successMessages('QA found issues.'));
    })
    .mockReturnValueOnce(mockAgentResponse(successMessages('Fixed!'))) // Developer fix
    .mockImplementationOnce(() => {
      // Second QA run — passes
      sessionManager.updateSession(sessionId, {
        qaResults: [
          ...sessionManager.getSession(sessionId)!.qaResults,
          {
            id: 'qa-pass-1',
            timestamp: Date.now(),
            passed: true,
            errors: [],
            summary: 'All issues fixed.',
          },
        ],
      });
      return mockAgentResponse(successMessages('QA passed!'));
    });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TeamOrchestrator', () => {
  let sessionManager: SessionManager;
  let orchestrator: TeamOrchestrator;
  let callbacks: AgentCallbacks;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionManager = new SessionManager();
    orchestrator = new TeamOrchestrator({
      sessionManager,
      viteManager: new ViteManager(),
      assetGenerator: null,
    });
    callbacks = createMockCallbacks();
  });

  afterEach(() => {
    delete process.env['AGENT_MODEL'];
  });

  // ── Routing ──────────────────────────────────────────────────────────

  describe('handleUserMessage routing', () => {
    it('runs pipeline for a session in "ready" state', async () => {
      const session = sessionManager.createSession('phaser', 'platformer');
      advanceToReady(sessionManager, session.id);
      setupPassingPipeline(sessionManager, session.id);

      await orchestrator.handleUserMessage(session, 'make a platformer', callbacks);

      // designer + developer + qa = 3 calls
      expect(mockQuery).toHaveBeenCalledTimes(3);
    });

    it('runs pipeline for a session in "awaiting_feedback" state', async () => {
      const session = sessionManager.createSession('phaser', 'platformer');
      advanceToAwaitingFeedback(sessionManager, session.id);
      setupPassingPipeline(sessionManager, session.id);

      await orchestrator.handleUserMessage(session, 'make the player faster', callbacks);

      expect(mockQuery).toHaveBeenCalledTimes(3);
    });

    it('runs pipeline for a session in "iterating" state', async () => {
      const session = sessionManager.createSession('phaser', 'platformer');
      advanceToAwaitingFeedback(sessionManager, session.id);
      sessionManager.transitionState(session.id, 'iterating');
      setupPassingPipeline(sessionManager, session.id);

      await orchestrator.handleUserMessage(session, 'add enemies', callbacks);

      expect(mockQuery).toHaveBeenCalledTimes(3);
    });

    it('rejects messages when an agent is currently working (designing)', async () => {
      const session = sessionManager.createSession('phaser', 'platformer');
      advanceToReady(sessionManager, session.id);
      sessionManager.transitionState(session.id, 'designing');

      await orchestrator.handleUserMessage(session, 'do something', callbacks);

      expect(callbacks.onError).toHaveBeenCalledWith(
        'An agent is currently working. Please wait for it to finish.'
      );
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('rejects messages when an agent is currently working (developing)', async () => {
      const session = sessionManager.createSession('phaser', 'platformer');
      advanceToReady(sessionManager, session.id);
      sessionManager.transitionState(session.id, 'designing');
      sessionManager.transitionState(session.id, 'developing');

      await orchestrator.handleUserMessage(session, 'do something', callbacks);

      expect(callbacks.onError).toHaveBeenCalledWith(
        'An agent is currently working. Please wait for it to finish.'
      );
    });

    it('recovers from error state when user sends a message', async () => {
      const session = sessionManager.createSession('phaser', 'platformer');
      advanceToReady(sessionManager, session.id);
      // Manually transition to error state
      sessionManager.transitionState(session.id, 'error');

      setupPassingPipeline(sessionManager, session.id);

      await orchestrator.handleUserMessage(session, 'try again', callbacks);

      // Should have run the pipeline (3 agent calls)
      expect(mockQuery).toHaveBeenCalledTimes(3);

      // Should have sent recovery message
      expect(callbacks.onAgentMessage).toHaveBeenCalledWith(
        'orchestrator',
        'Recovering from error. Retrying with your message...'
      );
    });

    it('transitions error → ready → designing when recovering', async () => {
      const session = sessionManager.createSession('phaser', 'platformer');
      advanceToReady(sessionManager, session.id);
      sessionManager.transitionState(session.id, 'error');

      setupPassingPipeline(sessionManager, session.id);

      await orchestrator.handleUserMessage(session, 'try again', callbacks);

      // After full pipeline, should be in awaiting_feedback
      const updated = sessionManager.getSession(session.id)!;
      expect(updated.status).toBe('awaiting_feedback');
    });

    it('rejects messages in invalid states (new)', async () => {
      const session = sessionManager.createSession('phaser', 'platformer');

      await orchestrator.handleUserMessage(session, 'do something', callbacks);

      expect(callbacks.onError).toHaveBeenCalledWith(
        'Cannot process messages in "new" state.'
      );
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  // ── Pipeline Execution ───────────────────────────────────────────────

  describe('pipeline execution', () => {
    it('sends agent status callbacks in correct order', async () => {
      const session = sessionManager.createSession('phaser', 'platformer');
      advanceToReady(sessionManager, session.id);
      setupPassingPipeline(sessionManager, session.id);

      await orchestrator.handleUserMessage(session, 'make a game', callbacks);

      const statusCalls = (callbacks.onAgentStatus as ReturnType<typeof vi.fn>).mock.calls;
      expect(statusCalls[0]).toEqual(['designer', 'working']);
      expect(statusCalls[1]).toEqual(['designer', 'done']);
      expect(statusCalls[2]).toEqual(['developer', 'working']);
      expect(statusCalls[3]).toEqual(['developer', 'done']);
      expect(statusCalls[4]).toEqual(['qa', 'working']);
      expect(statusCalls[5]).toEqual(['qa', 'done']);
    });

    it('forwards agent text blocks as messages', async () => {
      const session = sessionManager.createSession('phaser', 'platformer');
      advanceToReady(sessionManager, session.id);
      setupPassingPipeline(sessionManager, session.id);

      await orchestrator.handleUserMessage(session, 'make a game', callbacks);

      expect(callbacks.onAgentMessage).toHaveBeenCalledWith(
        'designer',
        'Designed!'
      );
      expect(callbacks.onAgentMessage).toHaveBeenCalledWith(
        'developer',
        'Built!'
      );
      expect(callbacks.onAgentMessage).toHaveBeenCalledWith(
        'qa',
        'QA passed!'
      );
    });

    it('skips tool_use blocks in assistant messages', async () => {
      const session = sessionManager.createSession('phaser', 'platformer');
      advanceToReady(sessionManager, session.id);
      sessionManager.updateSession(session.id, { gdd: { title: 'Test' } as Session['gdd'] });

      mockQuery
        .mockReturnValueOnce(
          mockAgentResponse([
            {
              type: 'assistant',
              message: {
                content: [
                  { type: 'tool_use', id: 'tool_1', name: 'set_design_document' },
                  { type: 'text', text: 'Saved the GDD' },
                ],
              },
            },
            { type: 'result', subtype: 'success', is_error: false },
          ])
        )
        .mockReturnValueOnce(mockAgentResponse(successMessages('Built!')))
        .mockImplementationOnce(() => {
          sessionManager.updateSession(session.id, {
            qaResults: [{
              id: 'qa-1', timestamp: Date.now(), passed: true, errors: [], summary: 'OK',
            }],
          });
          return mockAgentResponse(successMessages('QA OK'));
        });

      await orchestrator.handleUserMessage(session, 'make a game', callbacks);

      // Should only get the text part, not the tool_use
      expect(callbacks.onAgentMessage).toHaveBeenCalledWith(
        'designer',
        'Saved the GDD'
      );
    });

    it('transitions session to awaiting_feedback on success', async () => {
      const session = sessionManager.createSession('phaser', 'platformer');
      advanceToReady(sessionManager, session.id);
      setupPassingPipeline(sessionManager, session.id);

      await orchestrator.handleUserMessage(session, 'make a game', callbacks);

      const updated = sessionManager.getSession(session.id)!;
      expect(updated.status).toBe('awaiting_feedback');
    });

    it('sends preview_refresh after pipeline completes', async () => {
      const session = sessionManager.createSession('phaser', 'platformer');
      advanceToReady(sessionManager, session.id);
      setupPassingPipeline(sessionManager, session.id);

      await orchestrator.handleUserMessage(session, 'make a game', callbacks);

      expect(callbacks.onPreviewRefresh).toHaveBeenCalledTimes(1);
    });

    it('increments iteration count after pipeline', async () => {
      const session = sessionManager.createSession('phaser', 'platformer');
      advanceToReady(sessionManager, session.id);
      setupPassingPipeline(sessionManager, session.id);

      await orchestrator.handleUserMessage(session, 'make a game', callbacks);

      const updated = sessionManager.getSession(session.id)!;
      expect(updated.iterationCount).toBe(1);
    });

    it('extracts Write tool_use blocks as tool activity', async () => {
      const session = sessionManager.createSession('phaser', 'platformer');
      advanceToReady(sessionManager, session.id);
      sessionManager.updateSession(session.id, { gdd: { title: 'Test' } as Session['gdd'] });

      mockQuery
        .mockReturnValueOnce(
          mockAgentResponse([
            {
              type: 'assistant',
              message: {
                content: [
                  {
                    type: 'tool_use',
                    id: 'tool_1',
                    name: 'Write',
                    input: { file_path: 'src/scenes/MainScene.ts', content: 'export class MainScene {}' },
                  },
                ],
              },
            },
            { type: 'result', subtype: 'success', is_error: false },
          ])
        )
        .mockReturnValueOnce(mockAgentResponse(successMessages('Built!')))
        .mockImplementationOnce(() => {
          sessionManager.updateSession(session.id, {
            qaResults: [{
              id: 'qa-1', timestamp: Date.now(), passed: true, errors: [], summary: 'OK',
            }],
          });
          return mockAgentResponse(successMessages('QA OK'));
        });

      await orchestrator.handleUserMessage(session, 'make a game', callbacks);

      expect(callbacks.onToolActivity).toHaveBeenCalledWith(
        'designer',
        'src/scenes/MainScene.ts',
        'export class MainScene {}'
      );
    });

    it('extracts Edit tool_use blocks as tool activity', async () => {
      const session = sessionManager.createSession('phaser', 'platformer');
      advanceToReady(sessionManager, session.id);
      sessionManager.updateSession(session.id, { gdd: { title: 'Test' } as Session['gdd'] });

      mockQuery
        .mockReturnValueOnce(mockAgentResponse(successMessages('Designed!')))
        .mockReturnValueOnce(
          mockAgentResponse([
            {
              type: 'assistant',
              message: {
                content: [
                  {
                    type: 'tool_use',
                    id: 'tool_2',
                    name: 'Edit',
                    input: { file_path: 'src/config.ts', old_string: 'x', new_string: 'const SPEED = 200;' },
                  },
                ],
              },
            },
            { type: 'result', subtype: 'success', is_error: false },
          ])
        )
        .mockImplementationOnce(() => {
          sessionManager.updateSession(session.id, {
            qaResults: [{
              id: 'qa-1', timestamp: Date.now(), passed: true, errors: [], summary: 'OK',
            }],
          });
          return mockAgentResponse(successMessages('QA OK'));
        });

      await orchestrator.handleUserMessage(session, 'make a game', callbacks);

      expect(callbacks.onToolActivity).toHaveBeenCalledWith(
        'developer',
        'src/config.ts',
        'const SPEED = 200;'
      );
    });

    it('sends final orchestrator "passed QA" message when QA passes', async () => {
      const session = sessionManager.createSession('phaser', 'platformer');
      advanceToReady(sessionManager, session.id);
      setupPassingPipeline(sessionManager, session.id);

      await orchestrator.handleUserMessage(session, 'make a game', callbacks);

      expect(callbacks.onAgentMessage).toHaveBeenCalledWith(
        'orchestrator',
        expect.stringContaining('passed QA testing')
      );
    });

    it('stops pipeline after designer when no GDD is set', async () => {
      const session = sessionManager.createSession('phaser', 'platformer');
      advanceToReady(sessionManager, session.id);

      // Designer responds conversationally without setting GDD
      mockQuery.mockReturnValueOnce(
        mockAgentResponse(successMessages('What kind of game would you like?'))
      );

      await orchestrator.handleUserMessage(session, 'hello', callbacks);

      // Only designer was called — pipeline stopped
      expect(mockQuery).toHaveBeenCalledTimes(1);

      // Session transitions back to ready (not awaiting_feedback)
      const updated = sessionManager.getSession(session.id)!;
      expect(updated.status).toBe('ready');

      // No preview refresh or completion message
      expect(callbacks.onPreviewRefresh).not.toHaveBeenCalled();
    });
  });

  // ── QA Pipeline ────────────────────────────────────────────────────

  describe('QA pipeline', () => {
    it('runs designer → developer → qa for a passing pipeline', async () => {
      const session = sessionManager.createSession('phaser', 'platformer');
      advanceToReady(sessionManager, session.id);
      setupPassingPipeline(sessionManager, session.id);

      await orchestrator.handleUserMessage(session, 'make a game', callbacks);

      expect(mockQuery).toHaveBeenCalledTimes(3);
      const updated = sessionManager.getSession(session.id)!;
      expect(updated.status).toBe('awaiting_feedback');
    });

    it('retries developer on QA failure, then passes on retry', async () => {
      const session = sessionManager.createSession('phaser', 'platformer');
      advanceToReady(sessionManager, session.id);
      setupFailThenPassPipeline(sessionManager, session.id);

      await orchestrator.handleUserMessage(session, 'make a game', callbacks);

      // designer(1) + developer(2) + qa_fail(3) + developer_fix(4) + qa_pass(5)
      expect(mockQuery).toHaveBeenCalledTimes(5);

      // Should have sent retry notification
      expect(callbacks.onAgentMessage).toHaveBeenCalledWith(
        'orchestrator',
        expect.stringContaining('QA found issues')
      );

      // Final message should indicate QA passed
      expect(callbacks.onAgentMessage).toHaveBeenCalledWith(
        'orchestrator',
        expect.stringContaining('passed QA testing')
      );
    });

    it('proceeds with warning when QA fails after all retries', async () => {
      const session = sessionManager.createSession('phaser', 'platformer');
      advanceToReady(sessionManager, session.id);
      sessionManager.updateSession(session.id, { gdd: { title: 'Test' } as Session['gdd'] });

      mockQuery
        .mockReturnValueOnce(mockAgentResponse(successMessages('Designed!')))
        .mockReturnValueOnce(mockAgentResponse(successMessages('Built!')))
        .mockImplementationOnce(() => {
          // First QA fail
          sessionManager.updateSession(session.id, {
            qaResults: [{
              id: 'qa-fail-1', timestamp: Date.now(), passed: false,
              errors: ['Bug 1'], summary: 'Failed.',
            }],
          });
          return mockAgentResponse(successMessages('QA failed.'));
        })
        .mockReturnValueOnce(mockAgentResponse(successMessages('Tried fixing.')))
        .mockImplementationOnce(() => {
          // Second QA fail
          const current = sessionManager.getSession(session.id)!;
          sessionManager.updateSession(session.id, {
            qaResults: [...current.qaResults, {
              id: 'qa-fail-2', timestamp: Date.now(), passed: false,
              errors: ['Bug 1 still present'], summary: 'Still failing.',
            }],
          });
          return mockAgentResponse(successMessages('QA still failing.'));
        });

      await orchestrator.handleUserMessage(session, 'make a game', callbacks);

      // designer(1) + developer(2) + qa_fail(3) + developer_fix(4) + qa_fail(5)
      expect(mockQuery).toHaveBeenCalledTimes(5);

      // Final message should indicate QA issues remain
      expect(callbacks.onAgentMessage).toHaveBeenCalledWith(
        'orchestrator',
        expect.stringContaining("couldn't be automatically fixed")
      );

      // Should still transition to awaiting_feedback
      const updated = sessionManager.getSession(session.id)!;
      expect(updated.status).toBe('awaiting_feedback');
    });

    it('creates and disposes Playwright tool server for QA runs', async () => {
      const session = sessionManager.createSession('phaser', 'platformer');
      advanceToReady(sessionManager, session.id);
      setupPassingPipeline(sessionManager, session.id);

      await orchestrator.handleUserMessage(session, 'make a game', callbacks);

      // Playwright tool server should be created for QA
      expect(mockCreatePlaywrightToolServer).toHaveBeenCalledTimes(1);

      // dispose() should have been called after QA finished
      const mockResult = mockCreatePlaywrightToolServer.mock.results[0].value;
      expect(mockResult.dispose).toHaveBeenCalled();
    });

    it('does not create Playwright tool server for designer or developer', async () => {
      const session = sessionManager.createSession('phaser', 'platformer');
      advanceToReady(sessionManager, session.id);
      setupPassingPipeline(sessionManager, session.id);

      await orchestrator.handleUserMessage(session, 'make a game', callbacks);

      // Only called once (for QA), not for designer or developer
      expect(mockCreatePlaywrightToolServer).toHaveBeenCalledTimes(1);
    });

    it('disposes Playwright even if QA agent throws', async () => {
      const session = sessionManager.createSession('phaser', 'platformer');
      advanceToReady(sessionManager, session.id);
      sessionManager.updateSession(session.id, { gdd: { title: 'Test' } as Session['gdd'] });

      mockQuery
        .mockReturnValueOnce(mockAgentResponse(successMessages('Designed!')))
        .mockReturnValueOnce(mockAgentResponse(successMessages('Built!')))
        .mockImplementationOnce(() => {
          throw new Error('QA process crashed');
        });

      await orchestrator.handleUserMessage(session, 'make a game', callbacks);

      // Even though QA threw, dispose should still be called (via finally)
      expect(mockCreatePlaywrightToolServer).toHaveBeenCalledTimes(1);
      const mockResult = mockCreatePlaywrightToolServer.mock.results[0].value;
      expect(mockResult.dispose).toHaveBeenCalled();
    });
  });

  // ── Error Handling ───────────────────────────────────────────────────

  describe('error handling', () => {
    it('handles agent result errors gracefully', async () => {
      const session = sessionManager.createSession('phaser', 'platformer');
      advanceToReady(sessionManager, session.id);

      mockQuery.mockReturnValueOnce(
        mockAgentResponse([
          {
            type: 'result',
            subtype: 'error_during_execution',
            is_error: true,
            errors: ['Connection timed out'],
          },
        ])
      );

      await orchestrator.handleUserMessage(session, 'make a game', callbacks);

      expect(callbacks.onError).toHaveBeenCalledWith(
        expect.stringContaining('Pipeline failed')
      );
      expect(callbacks.onError).toHaveBeenCalledWith(
        expect.stringContaining('Connection timed out')
      );
    });

    it('transitions session to error state on failure', async () => {
      const session = sessionManager.createSession('phaser', 'platformer');
      advanceToReady(sessionManager, session.id);

      mockQuery.mockReturnValueOnce(
        mockAgentResponse([
          {
            type: 'result',
            subtype: 'error_during_execution',
            is_error: true,
            errors: ['Agent crashed'],
          },
        ])
      );

      await orchestrator.handleUserMessage(session, 'make a game', callbacks);

      const updated = sessionManager.getSession(session.id)!;
      expect(updated.status).toBe('error');
    });

    it('handles max turns exceeded', async () => {
      const session = sessionManager.createSession('phaser', 'platformer');
      advanceToReady(sessionManager, session.id);

      mockQuery.mockReturnValueOnce(
        mockAgentResponse([
          {
            type: 'result',
            subtype: 'error_max_turns',
            is_error: true,
            errors: ['Exceeded maximum turns'],
          },
        ])
      );

      await orchestrator.handleUserMessage(session, 'make a game', callbacks);

      expect(callbacks.onError).toHaveBeenCalledWith(
        expect.stringContaining('Pipeline failed')
      );
    });

    it('handles thrown errors from query()', async () => {
      const session = sessionManager.createSession('phaser', 'platformer');
      advanceToReady(sessionManager, session.id);

      // query() itself throws (e.g. process spawn failure)
      mockQuery.mockImplementationOnce(() => {
        throw new Error('Failed to spawn process');
      });

      await orchestrator.handleUserMessage(session, 'make a game', callbacks);

      expect(callbacks.onError).toHaveBeenCalledWith(
        expect.stringContaining('Failed to spawn process')
      );
    });
  });

  // ── Agent Configuration ──────────────────────────────────────────────

  describe('agent configuration', () => {
    it('uses AGENT_MODEL env var when set', async () => {
      process.env['AGENT_MODEL'] = 'claude-opus-4-6';

      const session = sessionManager.createSession('phaser', 'platformer');
      advanceToReady(sessionManager, session.id);
      setupPassingPipeline(sessionManager, session.id);

      await orchestrator.handleUserMessage(session, 'make a game', callbacks);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({ model: 'claude-opus-4-6' }),
        })
      );
    });

    it('falls back to default model when env var not set', async () => {
      delete process.env['AGENT_MODEL'];

      const session = sessionManager.createSession('phaser', 'platformer');
      advanceToReady(sessionManager, session.id);
      setupPassingPipeline(sessionManager, session.id);

      await orchestrator.handleUserMessage(session, 'make a game', callbacks);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            model: 'claude-sonnet-4-6',
          }),
        })
      );
    });

    it('restricts designer to read-only tools + GDD management', async () => {
      const session = sessionManager.createSession('phaser', 'platformer');
      advanceToReady(sessionManager, session.id);
      setupPassingPipeline(sessionManager, session.id);

      await orchestrator.handleUserMessage(session, 'make a game', callbacks);

      const designerCall = mockQuery.mock.calls[0];
      const designerOpts = designerCall[0].options!;
      expect(designerOpts.allowedTools).toContain('Read');
      expect(designerOpts.allowedTools).toContain('Glob');
      expect(designerOpts.allowedTools).toContain('Grep');
      expect(designerOpts.allowedTools).toContain('mcp__game-tools__set_design_document');
      expect(designerOpts.allowedTools).not.toContain('Write');
      expect(designerOpts.allowedTools).not.toContain('Edit');
    });

    it('gives developer write access but not set_design_document', async () => {
      const session = sessionManager.createSession('phaser', 'platformer');
      advanceToReady(sessionManager, session.id);
      setupPassingPipeline(sessionManager, session.id);

      await orchestrator.handleUserMessage(session, 'make a game', callbacks);

      const devCall = mockQuery.mock.calls[1];
      const devOpts = devCall[0].options!;
      expect(devOpts.allowedTools).toContain('Write');
      expect(devOpts.allowedTools).toContain('Edit');
      expect(devOpts.allowedTools).toContain('mcp__game-tools__get_design_document');
      expect(devOpts.allowedTools).not.toContain(
        'mcp__game-tools__set_design_document'
      );
    });

    it('gives developer access to Skill tool for progressive disclosure', async () => {
      const session = sessionManager.createSession('phaser', 'platformer');
      advanceToReady(sessionManager, session.id);
      setupPassingPipeline(sessionManager, session.id);

      await orchestrator.handleUserMessage(session, 'make a game', callbacks);

      const devCall = mockQuery.mock.calls[1];
      const devOpts = devCall[0].options!;
      expect(devOpts.allowedTools).toContain('Skill');
    });

    it('enables project settingSources for Skill discovery', async () => {
      const session = sessionManager.createSession('phaser', 'platformer');
      advanceToReady(sessionManager, session.id);
      setupPassingPipeline(sessionManager, session.id);

      await orchestrator.handleUserMessage(session, 'make a game', callbacks);

      // All agent calls should have settingSources: ['project']
      for (const call of mockQuery.mock.calls) {
        expect(call[0].options!.settingSources).toEqual(['project']);
      }
    });

    it('gives QA agent Playwright tools and read-only access', async () => {
      const session = sessionManager.createSession('phaser', 'platformer');
      advanceToReady(sessionManager, session.id);
      setupPassingPipeline(sessionManager, session.id);

      await orchestrator.handleUserMessage(session, 'make a game', callbacks);

      const qaCall = mockQuery.mock.calls[2];
      const qaOpts = qaCall[0].options!;
      expect(qaOpts.allowedTools).toContain('Read');
      expect(qaOpts.allowedTools).toContain('mcp__playwright__navigate_to_game');
      expect(qaOpts.allowedTools).toContain('mcp__playwright__take_screenshot');
      expect(qaOpts.allowedTools).toContain('mcp__playwright__press_key');
      expect(qaOpts.allowedTools).toContain('mcp__playwright__evaluate_js');
      expect(qaOpts.allowedTools).toContain('mcp__playwright__submit_qa_results');
      expect(qaOpts.allowedTools).not.toContain('Write');
      expect(qaOpts.allowedTools).not.toContain('Edit');
    });

    it('gives QA agent both game-tools and playwright MCP servers', async () => {
      const session = sessionManager.createSession('phaser', 'platformer');
      advanceToReady(sessionManager, session.id);
      setupPassingPipeline(sessionManager, session.id);

      await orchestrator.handleUserMessage(session, 'make a game', callbacks);

      const qaCall = mockQuery.mock.calls[2];
      const qaOpts = qaCall[0].options!;
      expect(qaOpts.mcpServers).toHaveProperty('game-tools');
      expect(qaOpts.mcpServers).toHaveProperty('playwright');
    });

    it('sets cwd to the session project path', async () => {
      const session = sessionManager.createSession('phaser', 'platformer');
      advanceToReady(sessionManager, session.id);
      setupPassingPipeline(sessionManager, session.id);

      await orchestrator.handleUserMessage(session, 'make a game', callbacks);

      const designerOpts = mockQuery.mock.calls[0][0].options!;
      expect(designerOpts.cwd).toBe(session.projectPath);
    });

    it('passes MCP game-tools server', async () => {
      const session = sessionManager.createSession('phaser', 'platformer');
      advanceToReady(sessionManager, session.id);
      setupPassingPipeline(sessionManager, session.id);

      await orchestrator.handleUserMessage(session, 'make a game', callbacks);

      const designerOpts = mockQuery.mock.calls[0][0].options!;
      expect(designerOpts.mcpServers).toHaveProperty('game-tools');
    });
  });

  // ── Conversation Context ────────────────────────────────────────────

  describe('conversation context', () => {
    it('passes plain user message when conversation history is empty', async () => {
      const session = sessionManager.createSession('phaser', 'platformer');
      advanceToReady(sessionManager, session.id);
      setupPassingPipeline(sessionManager, session.id);

      await orchestrator.handleUserMessage(session, 'make a platformer', callbacks);

      // First call (designer) — history was empty before the user message was pushed
      // by wsHandler, but since we bypass wsHandler in tests, history is empty
      const designerPrompt = mockQuery.mock.calls[0][0].prompt;
      expect(designerPrompt).toBe('make a platformer');
      expect(designerPrompt).not.toContain('## Recent Conversation');
    });

    it('includes conversation context when history has entries', async () => {
      const session = sessionManager.createSession('phaser', 'platformer');
      advanceToReady(sessionManager, session.id);

      // Simulate prior conversation history (as wsHandler would do)
      session.conversationHistory.push(
        { role: 'user', content: 'make a platformer', timestamp: Date.now() },
        { role: 'designer', content: 'Created GDD with 2 levels', timestamp: Date.now() },
      );

      setupPassingPipeline(sessionManager, session.id);

      await orchestrator.handleUserMessage(session, 'add double jump', callbacks);

      // Designer should receive conversation context + current task
      const designerPrompt = mockQuery.mock.calls[0][0].prompt;
      expect(designerPrompt).toContain('## Recent Conversation');
      expect(designerPrompt).toContain('[User]: make a platformer');
      expect(designerPrompt).toContain('[Designer]: Created GDD with 2 levels');
      expect(designerPrompt).toContain('## Current Task');
      expect(designerPrompt).toContain('add double jump');
    });

    it('records actual agent text output in conversation history', async () => {
      const session = sessionManager.createSession('phaser', 'platformer');
      advanceToReady(sessionManager, session.id);
      setupPassingPipeline(sessionManager, session.id);

      await orchestrator.handleUserMessage(session, 'make a game', callbacks);

      const updated = sessionManager.getSession(session.id)!;
      // The designer should have its text output recorded, not "[designer completed work]"
      const designerEntry = updated.conversationHistory.find(
        (t) => t.role === 'designer'
      );
      expect(designerEntry).toBeDefined();
      expect(designerEntry!.content).toBe('Designed!');
      expect(designerEntry!.content).not.toContain('completed work');
    });

    it('records fallback message when agent produces no text output', async () => {
      const session = sessionManager.createSession('phaser', 'platformer');
      advanceToReady(sessionManager, session.id);
      sessionManager.updateSession(session.id, { gdd: { title: 'Test' } as Session['gdd'] });

      // Designer produces only tool_use, no text blocks
      mockQuery
        .mockReturnValueOnce(
          mockAgentResponse([
            {
              type: 'assistant',
              message: {
                content: [
                  { type: 'tool_use', id: 'tool_1', name: 'set_design_document' },
                ],
              },
            },
            { type: 'result', subtype: 'success', is_error: false },
          ])
        )
        .mockReturnValueOnce(mockAgentResponse(successMessages('Built!')))
        .mockImplementationOnce(() => {
          sessionManager.updateSession(session.id, {
            qaResults: [{
              id: 'qa-1', timestamp: Date.now(), passed: true, errors: [], summary: 'OK',
            }],
          });
          return mockAgentResponse(successMessages('QA OK'));
        });

      await orchestrator.handleUserMessage(session, 'make a game', callbacks);

      const updated = sessionManager.getSession(session.id)!;
      const designerEntry = updated.conversationHistory.find(
        (t) => t.role === 'designer'
      );
      expect(designerEntry).toBeDefined();
      expect(designerEntry!.content).toBe('[designer completed work silently]');
    });

    it('records QA pass result in conversation history', async () => {
      const session = sessionManager.createSession('phaser', 'platformer');
      advanceToReady(sessionManager, session.id);
      setupPassingPipeline(sessionManager, session.id);

      await orchestrator.handleUserMessage(session, 'make a game', callbacks);

      const updated = sessionManager.getSession(session.id)!;
      // Find the QA result entry (distinct from the agent output entry)
      const qaResultEntries = updated.conversationHistory.filter(
        (t) => t.role === 'qa' && t.content.includes('QA testing passed')
      );
      expect(qaResultEntries.length).toBeGreaterThanOrEqual(1);
      expect(qaResultEntries[0].content).toContain('All tests passed');
    });

    it('records QA fail result with error details in conversation history', async () => {
      const session = sessionManager.createSession('phaser', 'platformer');
      advanceToReady(sessionManager, session.id);
      setupFailThenPassPipeline(sessionManager, session.id);

      await orchestrator.handleUserMessage(session, 'make a game', callbacks);

      const updated = sessionManager.getSession(session.id)!;
      // Should have recorded the first QA failure
      const qaFailEntry = updated.conversationHistory.find(
        (t) => t.role === 'qa' && t.content.includes('QA testing failed')
      );
      expect(qaFailEntry).toBeDefined();
      expect(qaFailEntry!.content).toContain('Player falls through platform');
    });

    it('includes accumulated context for subsequent agents in pipeline', async () => {
      const session = sessionManager.createSession('phaser', 'platformer');
      advanceToReady(sessionManager, session.id);

      // Add prior history
      session.conversationHistory.push(
        { role: 'user', content: 'make a platformer', timestamp: Date.now() },
      );

      setupPassingPipeline(sessionManager, session.id);

      await orchestrator.handleUserMessage(session, 'add enemies', callbacks);

      // Developer (2nd call) should have more context since designer output
      // was recorded in conversation history after designer finished
      const devPrompt = mockQuery.mock.calls[1][0].prompt;
      expect(devPrompt).toContain('## Recent Conversation');
    });
  });
});
