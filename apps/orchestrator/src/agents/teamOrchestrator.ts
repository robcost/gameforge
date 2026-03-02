/**
 * Team orchestrator for coordinating agent pipeline execution.
 *
 * @remarks
 * The TeamOrchestrator is a TypeScript-based coordinator (not an AI agent)
 * that manages the sequential designer → developer → QA pipeline. It routes
 * user messages based on session state, executes each agent via the Claude
 * Agent SDK's `query()` function, and streams status updates back through
 * callbacks. QA failures trigger a single developer retry before proceeding.
 *
 * @packageDocumentation
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import * as fs from 'node:fs';
import type {
  AgentRole,
  AgentStatus,
  Session,
  SessionState,
} from '@robcost/shared-types';
import type { SessionManager } from '../sessions/sessionManager.js';
import type { ViteManager } from '../vite/viteManager.js';
import { createGameToolServer } from '../tools/gameToolServer.js';
import { createPlaywrightToolServer } from '../tools/playwrightToolServer.js';
import { createAssetToolServer } from '../tools/assetToolServer.js';
import { createMusicToolServer } from '../tools/musicToolServer.js';
import { buildDesignerPrompt } from './prompts/designerSystem.js';
import { buildArtistPrompt } from './prompts/artistSystem.js';
import { buildMusicianPrompt } from './prompts/musicianSystem.js';
import { buildDeveloperPrompt } from './prompts/developerSystem.js';
import { buildQAPrompt } from './prompts/qaSystem.js';
import { formatConversationContext } from './conversationHistory.js';
import type { AssetGenerator } from '../assets/assetGenerator.js';
import type { MusicGenerator } from '../music/musicGenerator.js';

/** Callbacks for streaming agent updates to the WebSocket client. */
export interface AgentCallbacks {
  /** Notifies the client of an agent's status change. */
  onAgentStatus: (agentRole: AgentRole, status: AgentStatus, detail?: string) => void;
  /** Sends an agent's text output to the client chat. */
  onAgentMessage: (agentRole: AgentRole, content: string) => void;
  /** Sends code activity (file being written) to the client for visual feedback. */
  onToolActivity: (agentRole: AgentRole, fileName: string, code: string) => void;
  /** Sends a QA screenshot to the client chat. */
  onQAScreenshot: (imageBase64: string, description: string) => void;
  /** Tells the client to refresh the game preview iframe. */
  onPreviewRefresh: () => void;
  /** Sends an error message to the client. */
  onError: (message: string) => void;
  /** Sends cumulative cost update to the client after each agent completes. */
  onCostUpdate: (totalCostUsd: number) => void;
  /** Sends asset generation progress to the client (Circle 2). */
  onAssetProgress: (assetKey: string, description: string, status: 'generating' | 'completed' | 'failed', imageBase64?: string) => void;
  /** Sends music generation progress to the client. */
  onMusicProgress: (description: string, status: 'generating' | 'completed' | 'failed', durationSeconds?: number) => void;
}

/** Dependencies injected into the TeamOrchestrator. */
export interface TeamOrchestratorDeps {
  sessionManager: SessionManager;
  viteManager: ViteManager;
  /** Asset generator for AI image generation (Circle 2). Null when no Google API key is configured. */
  assetGenerator: AssetGenerator | null;
  /** Music generator for AI music generation via Lyria. Null when no Google API key is configured. */
  musicGenerator: MusicGenerator | null;
}

/**
 * Per-role model defaults. Designer and QA use Haiku for speed;
 * Developer uses Sonnet for stronger code generation.
 * Each can be overridden via env vars (DESIGNER_MODEL, DEVELOPER_MODEL, QA_MODEL)
 * or all at once via AGENT_MODEL.
 */
const ROLE_MODELS: Record<'designer' | 'artist' | 'musician' | 'developer' | 'qa', string> = {
  designer: 'claude-haiku-4-5-20251001',
  artist: 'claude-haiku-4-5-20251001',
  musician: 'claude-haiku-4-5-20251001',
  developer: 'claude-sonnet-4-6',
  qa: 'claude-haiku-4-5-20251001',
};

/** Maximum number of agentic turns per query() call. */
const MAX_TURNS = 30;

/** Max output tokens for agent responses (overrides the 32000 default). */
const MAX_OUTPUT_TOKENS = '65536';

/** Maximum number of QA → Developer fix retries before proceeding. */
const MAX_QA_RETRIES = 1;

/**
 * Generates a human-readable description of a tool_use block for progress display.
 *
 * @param toolName - The tool name from the SDK message.
 * @param input - The tool input parameters.
 * @returns A short description string for the UI.
 */
function describeToolUse(toolName: string, input: Record<string, unknown>): string {
  // Extract short filename from a full path
  const shortPath = (path: unknown): string => {
    if (typeof path !== 'string') return '';
    return path.split('/').pop() ?? path;
  };

  switch (toolName) {
    case 'Read':
      return `Reading ${shortPath(input['file_path'])}`;
    case 'Write':
      return `Writing ${shortPath(input['file_path'])}`;
    case 'Edit':
      return `Editing ${shortPath(input['file_path'])}`;
    case 'Glob':
      return `Searching for ${input['pattern'] ?? 'files'}`;
    case 'Grep':
      return `Searching code for "${input['pattern'] ?? '...'}"`;
    default: {
      // Handle MCP tools: mcp__server__tool_name → readable name
      if (toolName.startsWith('mcp__')) {
        const parts = toolName.split('__');
        const tool = parts[parts.length - 1] ?? toolName;
        return tool.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
      }
      return `Using ${toolName}`;
    }
  }
}

/**
 * Extracts a string field value from partial JSON being streamed.
 *
 * @remarks
 * Used during streaming to extract code content from Write/Edit tool
 * inputs as they arrive token-by-token. Handles escaped characters
 * and incomplete values gracefully.
 *
 * @param partialJson - The accumulated JSON string (may be incomplete).
 * @param fieldName - The JSON key to extract (e.g., 'content', 'file_path').
 * @returns The unescaped field value, or null if the field hasn't started yet.
 */
function extractStreamingField(partialJson: string, fieldName: string): string | null {
  // Match the field as a JSON key (preceded by { or ,) to avoid matching inside values
  const pattern = new RegExp(`[,{]\\s*"${fieldName}"\\s*:\\s*"`);
  const match = pattern.exec(partialJson);
  if (!match) return null;

  const valueStart = match.index + match[0].length;
  let value = partialJson.slice(valueStart);

  // Find the unescaped closing quote (if value is complete)
  let closeIdx = -1;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '\\') {
      i++; // skip escaped character
    } else if (value[i] === '"') {
      closeIdx = i;
      break;
    }
  }

  if (closeIdx !== -1) {
    value = value.slice(0, closeIdx);
  }

  // Unescape JSON string escapes
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

/**
 * Allowed built-in and MCP tools for the Designer agent.
 * The designer can read files and manage the Game Design Document.
 */
const DESIGNER_TOOLS = [
  'Read',
  'Glob',
  'Grep',
  'mcp__game-tools__get_design_document',
  'mcp__game-tools__set_design_document',
  'mcp__game-tools__get_project_structure',
  'mcp__game-tools__get_session_info',
];

/**
 * Allowed built-in and MCP tools for the Developer agent.
 * The developer can read/write files but cannot modify the GDD.
 */
const DEVELOPER_TOOLS = [
  'Skill',
  'Read',
  'Write',
  'Edit',
  'Glob',
  'Grep',
  'mcp__game-tools__get_design_document',
  'mcp__game-tools__get_project_structure',
  'mcp__game-tools__get_session_info',
];

/**
 * Allowed built-in and MCP tools for the QA agent.
 * The QA agent can read files and use Playwright browser tools.
 */
const QA_TOOLS = [
  'Read',
  'Glob',
  'Grep',
  'mcp__game-tools__get_design_document',
  'mcp__game-tools__get_project_structure',
  'mcp__game-tools__get_session_info',
  'mcp__playwright__navigate_to_game',
  'mcp__playwright__take_screenshot',
  'mcp__playwright__press_key',
  'mcp__playwright__press_keys_sequence',
  'mcp__playwright__wait',
  'mcp__playwright__get_console_errors',
  'mcp__playwright__evaluate_js',
  'mcp__playwright__submit_qa_results',
];

/**
 * Allowed built-in and MCP tools for the Artist agent.
 * The artist reads the GDD and generates assets via the asset tool server.
 */
const ARTIST_TOOLS = [
  'Read',
  'Glob',
  'mcp__game-tools__get_design_document',
  'mcp__game-tools__get_project_structure',
  'mcp__game-tools__get_session_info',
  'mcp__asset-tools__generate_asset',
  'mcp__asset-tools__generate_batch',
  'mcp__asset-tools__get_asset_manifest',
  'mcp__asset-tools__set_style_anchor',
];

/**
 * Allowed built-in and MCP tools for the Musician agent.
 * The musician reads the GDD and generates background music via the music tool server.
 */
const MUSICIAN_TOOLS = [
  'Read',
  'Glob',
  'mcp__game-tools__get_design_document',
  'mcp__game-tools__get_session_info',
  'mcp__music-tools__generate_music',
  'mcp__music-tools__get_music_status',
];

/**
 * Coordinates the designer → developer → QA agent pipeline.
 *
 * @remarks
 * Routes user messages based on session state, runs agents sequentially,
 * and manages state transitions throughout the pipeline. Each agent call
 * uses the Claude Agent SDK's `query()` function with role-specific
 * system prompts, tool allowlists, and session-scoped MCP servers.
 * QA failures trigger a developer retry (up to {@link MAX_QA_RETRIES}).
 */
export class TeamOrchestrator {
  private deps: TeamOrchestratorDeps;

  constructor(deps: TeamOrchestratorDeps) {
    this.deps = deps;
  }

  /**
   * Main entry point — routes a user message to the appropriate agent pipeline.
   *
   * @param session - The current session.
   * @param message - The user's chat message.
   * @param callbacks - Callbacks for streaming updates to the client.
   */
  async handleUserMessage(
    session: Session,
    message: string,
    callbacks: AgentCallbacks
  ): Promise<void> {
    const { status } = session;
    console.log(`[orchestrator] handleUserMessage: status=${status}, message="${message.slice(0, 80)}"`);

    switch (status) {
      case 'ready':
      case 'iterating': {
        await this.runPipeline(session, message, callbacks);
        break;
      }

      case 'awaiting_feedback': {
        this.deps.sessionManager.transitionState(session.id, 'iterating');
        await this.runPipeline(session, message, callbacks);
        break;
      }

      case 'error': {
        // Recover from error — transition back to ready and re-run the pipeline
        this.deps.sessionManager.transitionState(session.id, 'ready');
        callbacks.onAgentMessage(
          'orchestrator',
          'Recovering from error. Retrying with your message...'
        );
        await this.runPipeline(session, message, callbacks);
        break;
      }

      case 'designing':
      case 'generating_assets':
      case 'generating_music':
      case 'developing':
      case 'testing': {
        callbacks.onError(
          'An agent is currently working. Please wait for it to finish.'
        );
        break;
      }

      default: {
        callbacks.onError(
          `Cannot process messages in "${status}" state.`
        );
      }
    }
  }

  /**
   * Runs the full designer → developer → QA pipeline with retry logic.
   *
   * @param session - The current session.
   * @param userMessage - The user's chat message.
   * @param callbacks - Callbacks for streaming updates to the client.
   */
  private async runPipeline(
    session: Session,
    userMessage: string,
    callbacks: AgentCallbacks
  ): Promise<void> {
    try {
      // Step 1: Designer agent creates/updates the GDD
      await this.runAgent('designer', session, userMessage, callbacks);

      // Check if Designer produced a GDD — if not, it's still gathering requirements
      const afterDesigner = this.deps.sessionManager.getSession(session.id)!;
      if (!afterDesigner.gdd) {
        console.log('[orchestrator] Designer did not set GDD — pausing for user input');
        this.deps.sessionManager.transitionState(session.id, 'ready');
        return;
      }

      // Step 2 (conditional): Artist agent generates assets if GDD has artDirection
      if (afterDesigner.gdd.artDirection && this.deps.assetGenerator) {
        console.log('[orchestrator] GDD has artDirection — running Artist agent');
        await this.runAgent('artist', session, 'Generate game assets based on the GDD art direction.', callbacks);
      }

      // Step 3 (conditional): Musician agent generates background music if GDD has musicDirection
      const afterArtist = this.deps.sessionManager.getSession(session.id)!;
      if (afterArtist.gdd?.audio?.musicDirection && this.deps.musicGenerator) {
        console.log('[orchestrator] GDD has musicDirection — running Musician agent');
        await this.runAgent('musician', session, 'Generate background music based on the GDD music direction.', callbacks);
      }

      // Step 4: Developer agent implements the GDD in code
      await this.runAgent(
        'developer',
        session,
        'Implement the game according to the GDD.',
        callbacks
      );

      // Step 3: QA agent tests the game with retry loop
      let qaPass = false;
      let qaAttempt = 0;

      while (!qaPass && qaAttempt <= MAX_QA_RETRIES) {
        await this.runAgent(
          'qa',
          session,
          'Test the game and report your findings.',
          callbacks
        );

        // Check QA results from the submit_qa_results tool
        const afterQA = this.deps.sessionManager.getSession(session.id)!;
        const latestResult = afterQA.qaResults[afterQA.qaResults.length - 1];

        // Record QA results in conversation history for context in future iterations
        if (latestResult) {
          const qaHistoryEntry = latestResult.passed
            ? `QA testing passed. ${latestResult.summary}`
            : `QA testing failed. Issues: ${latestResult.errors?.join('; ') ?? 'unknown'}. ${latestResult.summary}`;

          afterQA.conversationHistory.push({
            role: 'qa',
            content: qaHistoryEntry,
            timestamp: Date.now(),
          });
        }

        if (latestResult?.passed) {
          qaPass = true;
        } else if (qaAttempt < MAX_QA_RETRIES) {
          // Loop back to developer with QA report
          const qaReport = latestResult?.summary ?? 'QA testing found issues.';
          const qaErrors = latestResult?.errors?.join('\n- ') ?? '';

          callbacks.onAgentMessage(
            'orchestrator',
            `QA found issues. Sending back to Developer for fixes (attempt ${qaAttempt + 1}/${MAX_QA_RETRIES})...`
          );

          await this.runAgent(
            'developer',
            session,
            `The QA agent found these issues with the game:\n\n${qaReport}\n\nSpecific errors:\n- ${qaErrors}\n\nFix these issues.`,
            callbacks
          );
        }

        qaAttempt++;
      }

      // Transition to awaiting_feedback (whether QA passed or not)
      this.deps.sessionManager.transitionState(session.id, 'awaiting_feedback');

      // Notify client to refresh the preview
      callbacks.onPreviewRefresh();

      // Increment iteration count
      const currentSession = this.deps.sessionManager.getSession(session.id)!;
      this.deps.sessionManager.updateSession(session.id, {
        iterationCount: currentSession.iterationCount + 1,
      });

      if (qaPass) {
        callbacks.onAgentMessage(
          'orchestrator',
          "Your game passed QA testing! Try it in the preview and let me know what you'd like to change."
        );
      } else {
        callbacks.onAgentMessage(
          'orchestrator',
          "Your game is ready, but QA found some issues that couldn't be automatically fixed. Check the QA report above and let me know what you'd like to adjust."
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[orchestrator] pipeline error:', message);

      try {
        this.deps.sessionManager.transitionState(session.id, 'error');
      } catch {
        // Already in error state or invalid transition
      }

      callbacks.onError(`Pipeline failed: ${message}`);
    }
  }

  /**
   * Executes a single agent via the Claude Agent SDK's `query()` function.
   *
   * @param role - Which agent to run ('designer', 'artist', 'musician', 'developer', or 'qa').
   * @param session - The current session.
   * @param userMessage - The prompt to send to the agent.
   * @param callbacks - Callbacks for streaming updates to the client.
   */
  private async runAgent(
    role: 'designer' | 'artist' | 'musician' | 'developer' | 'qa',
    session: Session,
    userMessage: string,
    callbacks: AgentCallbacks
  ): Promise<void> {
    // Transition session state
    const stateMap: Record<string, SessionState> = {
      designer: 'designing',
      artist: 'generating_assets',
      musician: 'generating_music',
      developer: 'developing',
      qa: 'testing',
    };
    const targetState = stateMap[role];
    this.deps.sessionManager.transitionState(session.id, targetState);
    console.log(`[orchestrator] ${role} agent starting (session ${session.id})`);

    // Update agent status
    const freshSession = this.deps.sessionManager.getSession(session.id)!;
    this.deps.sessionManager.updateSession(session.id, {
      agentStates: { ...freshSession.agentStates, [role]: 'working' as AgentStatus },
    });
    callbacks.onAgentStatus(role, 'working');

    // Create session-scoped MCP tool server (shared by all agents)
    const toolServer = createGameToolServer(
      this.deps.sessionManager.getSession(session.id)!,
      { sessionManager: this.deps.sessionManager }
    );

    // Build role-specific system prompt
    const currentSession = this.deps.sessionManager.getSession(session.id)!;
    const promptMap: Record<string, (s: Session) => string> = {
      designer: buildDesignerPrompt,
      artist: buildArtistPrompt,
      musician: buildMusicianPrompt,
      developer: buildDeveloperPrompt,
      qa: buildQAPrompt,
    };
    const systemPrompt = promptMap[role](currentSession);

    // Select tools based on role
    const toolMap: Record<string, string[]> = {
      designer: DESIGNER_TOOLS,
      artist: ARTIST_TOOLS,
      musician: MUSICIAN_TOOLS,
      developer: DEVELOPER_TOOLS,
      qa: QA_TOOLS,
    };
    const allowedTools = toolMap[role];

    // Resolve model from env or default
    const envKey = `${role.toUpperCase()}_MODEL`;
    const model = process.env[envKey] || process.env['AGENT_MODEL'] || ROLE_MODELS[role];

    // Build MCP servers map — QA gets Playwright tools in addition to game tools
    const mcpServers: Record<string, ReturnType<typeof createGameToolServer>> = {
      'game-tools': toolServer,
    };

    let playwrightDispose: (() => Promise<void>) | undefined;

    if (role === 'artist' && this.deps.assetGenerator) {
      const assetServer = createAssetToolServer(
        this.deps.sessionManager.getSession(session.id)!,
        {
          sessionManager: this.deps.sessionManager,
          assetGenerator: this.deps.assetGenerator,
          onAssetProgress: (key, status, result) => {
            const asset = result?.asset;
            // Read the generated image file and encode as base64 for chat display
            let imageBase64: string | undefined;
            if (status === 'completed' && result?.filePath) {
              try {
                imageBase64 = fs.readFileSync(result.filePath).toString('base64');
              } catch {
                // Non-critical — image just won't appear in chat
              }
            }
            callbacks.onAssetProgress(
              key,
              asset?.description ?? key,
              status,
              imageBase64,
            );
          },
        }
      );
      mcpServers['asset-tools'] = assetServer;
    }

    if (role === 'musician' && this.deps.musicGenerator) {
      const musicServer = createMusicToolServer(
        this.deps.sessionManager.getSession(session.id)!,
        {
          sessionManager: this.deps.sessionManager,
          musicGenerator: this.deps.musicGenerator,
          onMusicProgress: (status, result) => {
            const description = result?.audio?.description ?? 'Background music';
            const durationSeconds = result?.audio?.durationSeconds;
            callbacks.onMusicProgress(description, status, durationSeconds);
          },
        }
      );
      mcpServers['music-tools'] = musicServer;
    }

    if (role === 'qa') {
      const pw = createPlaywrightToolServer(
        this.deps.sessionManager.getSession(session.id)!,
        {
          sessionManager: this.deps.sessionManager,
          onScreenshot: (imageBase64, description) => {
            callbacks.onQAScreenshot(imageBase64, description);
          },
        }
      );
      mcpServers['playwright'] = pw.server;
      playwrightDispose = pw.dispose;
    }

    // Build the full prompt with conversation context for agent memory
    const contextSession = this.deps.sessionManager.getSession(session.id)!;
    const context = formatConversationContext(contextSession.conversationHistory);
    const fullPrompt = context
      ? `${context}\n\n## Current Task\n${userMessage}`
      : userMessage;

    console.log(`[orchestrator] ${role} agent query — model=${model}`);

    try {
      // Execute the agent
      const agentQuery = query({
        prompt: fullPrompt,
        options: {
          systemPrompt,
          model,
          cwd: session.projectPath,
          settingSources: ['project'],
          permissionMode: 'bypassPermissions',
          allowDangerouslySkipPermissions: true,
          allowedTools,
          mcpServers,
          maxTurns: MAX_TURNS,
          includePartialMessages: true,
          env: { ...process.env, CLAUDE_CODE_MAX_OUTPUT_TOKENS: MAX_OUTPUT_TOKENS },
          stderr: (data: string) => {
            console.error(`[${role}:stderr] ${data.trimEnd()}`);
          },
        },
      });

      // Streaming state for throttled delta forwarding
      let streamTextBuffer = '';
      let streamLastEmit = 0;
      let currentStreamToolName: string | null = null;
      let toolInputBuffer = '';
      const STREAM_THROTTLE_MS = 300;

      // Accumulate agent text output for conversation history
      let agentOutput = '';

      for await (const message of agentQuery) {

        if (message.type === 'assistant') {
          const content = (
            message as { message?: { content?: Array<{ type: string; text?: string; name?: string; input?: Record<string, unknown> }> } }
          ).message?.content;

          if (Array.isArray(content)) {
            // Extract text blocks for chat messages
            const textParts = content
              .filter((block) => block.type === 'text')
              .map((block) => block.text ?? '')
              .filter(Boolean);

            if (textParts.length > 0) {
              const text = textParts.join('\n');
              agentOutput += text + '\n';
              callbacks.onAgentMessage(role, text);
            }

            // Extract tool_use blocks for activity streaming
            for (const block of content) {
              if (block.type !== 'tool_use' || !block.input) continue;
              const input = block.input;

              // Emit human-readable progress for every tool call
              const detail = describeToolUse(block.name ?? 'unknown', input);
              callbacks.onAgentStatus(role, 'working', detail);

              // Stream code content for Write/Edit (shows code preview in UI)
              if (block.name === 'Write' && typeof input['content'] === 'string' && typeof input['file_path'] === 'string') {
                callbacks.onToolActivity(role, input['file_path'] as string, input['content'] as string);
              } else if (block.name === 'Edit' && typeof input['new_string'] === 'string' && typeof input['file_path'] === 'string') {
                callbacks.onToolActivity(role, input['file_path'] as string, input['new_string'] as string);
              }
            }
          }
        } else if (message.type === 'user') {
          // Tool result returned — the LLM is now processing it
          callbacks.onAgentStatus(role, 'working', 'Thinking...');
        } else if (message.type === 'stream_event') {
          // Fires per-token as the LLM generates — stream text and code deltas
          const streamEvent = message as {
            event: {
              type: string;
              content_block?: { type: string; name?: string };
              delta?: { type: string; text?: string; thinking?: string; partial_json?: string };
            };
          };
          const evt = streamEvent.event;

          if (evt.type === 'content_block_start' && evt.content_block) {
            if (evt.content_block.type === 'text' || evt.content_block.type === 'thinking') {
              streamTextBuffer = '';
              callbacks.onAgentStatus(role, 'working', 'Thinking...');
            } else if (evt.content_block.type === 'tool_use') {
              currentStreamToolName = evt.content_block.name ?? null;
              toolInputBuffer = '';
              if (currentStreamToolName) {
                callbacks.onAgentStatus(role, 'working', `Preparing ${currentStreamToolName}...`);
              }
            }
          } else if (evt.type === 'content_block_delta' && evt.delta) {
            const now = Date.now();
            const shouldEmit = now - streamLastEmit >= STREAM_THROTTLE_MS;

            // Handle both text_delta and thinking_delta (extended thinking)
            const streamText = evt.delta.type === 'text_delta' ? evt.delta.text
              : evt.delta.type === 'thinking_delta' ? evt.delta.thinking
              : null;

            if (streamText) {
              // Accumulate streaming text and throttle-emit as activity
              streamTextBuffer += streamText;
              if (shouldEmit) {
                streamLastEmit = now;
                const preview = streamTextBuffer.length > 120
                  ? '...' + streamTextBuffer.slice(-120)
                  : streamTextBuffer;
                const cleaned = preview.replace(/\n/g, ' ').trim();
                callbacks.onAgentStatus(role, 'working', cleaned || 'Thinking...');
              }
            } else if (evt.delta.type === 'input_json_delta' && evt.delta.partial_json) {
              // Accumulate tool input JSON for all tools
              toolInputBuffer += evt.delta.partial_json;
              if (shouldEmit) {
                streamLastEmit = now;

                if (currentStreamToolName === 'Write' || currentStreamToolName === 'Edit') {
                  // Stream code content for Write/Edit tools (live code preview)
                  const fieldName = currentStreamToolName === 'Edit' ? 'new_string' : 'content';
                  const code = extractStreamingField(toolInputBuffer, fieldName);
                  if (code) {
                    const filePath = extractStreamingField(toolInputBuffer, 'file_path');
                    callbacks.onToolActivity(role, filePath ?? 'unknown', code);
                  }
                } else if (currentStreamToolName) {
                  // For other tools (Read, Glob, Grep, etc.), show what tool is doing
                  const filePath = extractStreamingField(toolInputBuffer, 'file_path');
                  const pattern = extractStreamingField(toolInputBuffer, 'pattern');
                  const detail = filePath
                    ? describeToolUse(currentStreamToolName, { file_path: filePath })
                    : pattern
                    ? describeToolUse(currentStreamToolName, { pattern })
                    : `Using ${currentStreamToolName}...`;
                  callbacks.onAgentStatus(role, 'working', detail);
                }
              }
            }
          } else if (evt.type === 'content_block_stop') {
            // Reset streaming state for next content block
            currentStreamToolName = null;
            toolInputBuffer = '';
            streamTextBuffer = '';
          }
        } else if (message.type === 'tool_progress') {
          // Fires during long-running tool execution with elapsed time
          const progress = message as {
            tool_name: string;
            elapsed_time_seconds: number;
          };
          const detail = `Running ${progress.tool_name} (${Math.round(progress.elapsed_time_seconds)}s)`;
          callbacks.onAgentStatus(role, 'working', detail);
        } else if (message.type === 'tool_use_summary') {
          // Human-readable summary of tool usage between turns
          const summary = message as { summary: string };
          if (summary.summary) {
            callbacks.onAgentStatus(role, 'working', summary.summary);
          }
        } else if (message.type === 'result') {
          const result = message as {
            is_error: boolean;
            errors?: string[];
            total_cost_usd?: number;
            num_turns?: number;
          };

          console.log(
            `[orchestrator] ${role} result: is_error=${result.is_error}, turns=${result.num_turns ?? '?'}, cost=$${result.total_cost_usd?.toFixed(4) ?? '?'}`
          );

          // Accumulate cost on the session
          if (result.total_cost_usd && result.total_cost_usd > 0) {
            const currentSession = this.deps.sessionManager.getSession(session.id);
            if (currentSession) {
              const newTotal = currentSession.totalCostUsd + result.total_cost_usd;
              this.deps.sessionManager.updateSession(session.id, {
                totalCostUsd: newTotal,
              });
              callbacks.onCostUpdate(newTotal);
            }
          }

          if (result.is_error) {
            const errors = result.errors ?? [];
            throw new Error(
              `Agent ${role} failed: ${errors.join(', ') || 'unknown error'}`
            );
          }
        }
      }

      console.log(`[orchestrator] ${role} agent finished`);

      // Mark agent as done
      const doneSession = this.deps.sessionManager.getSession(session.id)!;
      this.deps.sessionManager.updateSession(session.id, {
        agentStates: { ...doneSession.agentStates, [role]: 'done' as AgentStatus },
      });
      callbacks.onAgentStatus(role, 'done');

      // Record in conversation history
      doneSession.conversationHistory.push({
        role,
        content: agentOutput.trim() || `[${role} completed work silently]`,
        timestamp: Date.now(),
      });
    } finally {
      // Clean up Playwright browser if this was a QA run
      if (playwrightDispose) {
        await playwrightDispose();
      }
    }
  }
}
