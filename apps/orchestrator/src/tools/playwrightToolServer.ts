/**
 * Session-scoped MCP tool server for Playwright-based game testing.
 *
 * @remarks
 * Creates an MCP server with tools that let the QA agent interact with a
 * game running in a headless Chromium browser. Each tool server manages
 * its own browser lifecycle — the browser is launched lazily on first
 * tool call and closed via {@link PlaywrightToolServerResult.dispose}.
 *
 * Tools provided:
 * - `navigate_to_game` — navigates to the session's Vite dev server URL
 * - `take_screenshot` — captures a PNG screenshot as base64
 * - `press_key` — simulates a single keyboard key press or hold
 * - `press_keys_sequence` — simulates a sequence of keyboard actions
 * - `wait` — waits for a specified duration (ms)
 * - `get_console_errors` — returns console errors captured since navigation
 * - `evaluate_js` — evaluates JavaScript in the game's browser context
 * - `submit_qa_results` — saves structured QA test results to the session
 *
 * @packageDocumentation
 */

import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';
import { randomUUID } from 'node:crypto';
import type { Session, ConsoleError } from '@robcost/shared-types';
import type { SessionManager } from '../sessions/sessionManager.js';

/** Dependencies needed to create a Playwright tool server. */
export interface PlaywrightToolServerDeps {
  sessionManager: SessionManager;
  /** Called when the QA agent takes a screenshot, relaying it to the client. */
  onScreenshot?: (imageBase64: string, description: string) => void;
}

/** Return value from {@link createPlaywrightToolServer}. */
export interface PlaywrightToolServerResult {
  /** The MCP server instance to pass to `query()` options.mcpServers. */
  server: ReturnType<typeof createSdkMcpServer>;
  /** Closes the browser and cleans up resources. Must be called after QA finishes. */
  dispose: () => Promise<void>;
}

/**
 * Creates a session-scoped Playwright MCP tool server for QA agent browser automation.
 *
 * @param session - The session this server operates on (provides viteUrl).
 * @param deps - Dependencies (session manager for persistence, optional screenshot callback).
 * @returns An object with the MCP server config and a dispose function.
 */
export function createPlaywrightToolServer(
  session: Session,
  deps: PlaywrightToolServerDeps
): PlaywrightToolServerResult {
  // ── Browser lifecycle (managed by closure) ──────────────────────
  let browser: Browser | null = null;
  let page: Page | null = null;
  const consoleErrors: ConsoleError[] = [];

  /**
   * Lazily launches the browser and creates a page on first tool call.
   * Subsequent calls return the existing page.
   */
  async function ensureBrowser(): Promise<Page> {
    if (!page) {
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        viewport: { width: 800, height: 600 },
      });
      page = await context.newPage();

      // Capture console errors for get_console_errors tool
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push({
            message: msg.text(),
            source: msg.location().url ?? '',
            line: msg.location().lineNumber ?? 0,
            timestamp: Date.now(),
          });
        }
      });
    }
    return page;
  }

  /** Closes the browser and resets state. */
  async function dispose(): Promise<void> {
    if (browser) {
      await browser.close();
      browser = null;
      page = null;
    }
  }

  // ── MCP Server with 8 tools ─────────────────────────────────────
  const server = createSdkMcpServer({
    name: 'playwright',
    version: '1.0.0',
    tools: [
      tool(
        'navigate_to_game',
        'Navigate the browser to the game URL. Defaults to the session Vite dev server URL if no URL is provided.',
        {
          url: z.string().optional().describe(
            'The URL to navigate to. Defaults to the session Vite dev server URL.'
          ),
        },
        async (args) => {
          const targetUrl = args.url ?? session.viteUrl;
          if (!targetUrl) {
            return {
              content: [{ type: 'text' as const, text: 'No game URL available. The Vite dev server may not be running.' }],
              isError: true,
            };
          }

          try {
            const p = await ensureBrowser();
            await p.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });

            // Phaser 3 requires the canvas element to be focused for keyboard input.
            // Without this click, page.keyboard events don't reach Phaser's KeyboardPlugin.
            try {
              await p.waitForSelector('canvas', { timeout: 10000 });
              await p.click('canvas');
            } catch {
              // Canvas not found — game may not have loaded; QA agent will detect via evaluate_js
            }

            return {
              content: [{ type: 'text' as const, text: `Navigated to ${targetUrl} successfully. Canvas focused.` }],
            };
          } catch (err) {
            return {
              content: [{ type: 'text' as const, text: `Navigation failed: ${(err as Error).message}` }],
              isError: true,
            };
          }
        }
      ),

      tool(
        'take_screenshot',
        'Capture a PNG screenshot of the current browser viewport. The screenshot is relayed to the user in chat.',
        {
          description: z.string().describe(
            'A short description of what this screenshot shows (e.g. "Initial game state", "After moving right").'
          ),
        },
        async (args) => {
          try {
            const p = await ensureBrowser();
            const buffer = await p.screenshot({ type: 'png' });
            const imageBase64 = buffer.toString('base64');

            // Relay to client via callback
            deps.onScreenshot?.(imageBase64, args.description);

            return {
              content: [{ type: 'text' as const, text: `Screenshot captured: "${args.description}" (${buffer.length} bytes)` }],
            };
          } catch (err) {
            return {
              content: [{ type: 'text' as const, text: `Screenshot failed: ${(err as Error).message}` }],
              isError: true,
            };
          }
        }
      ),

      tool(
        'press_key',
        'Simulate a keyboard key press. Optionally hold the key for a specified duration in milliseconds.',
        {
          key: z.string().describe(
            'The key to press (e.g. "ArrowRight", "Space", "KeyR", "ArrowUp").'
          ),
          duration: z.number().optional().describe(
            'Duration to hold the key in milliseconds. If omitted, performs a single press.'
          ),
        },
        async (args) => {
          try {
            const p = await ensureBrowser();

            // Re-focus the canvas before each key event in case focus was lost
            try { await p.locator('canvas').focus(); } catch { /* canvas may not exist */ }

            if (args.duration && args.duration > 0) {
              await p.keyboard.down(args.key);
              await p.waitForTimeout(args.duration);
              await p.keyboard.up(args.key);
            } else {
              await p.keyboard.press(args.key);
            }
            return {
              content: [{ type: 'text' as const, text: `Key "${args.key}" pressed${args.duration ? ` for ${args.duration}ms` : ''}.` }],
            };
          } catch (err) {
            return {
              content: [{ type: 'text' as const, text: `Key press failed: ${(err as Error).message}` }],
              isError: true,
            };
          }
        }
      ),

      tool(
        'press_keys_sequence',
        'Execute a sequence of keyboard actions. Each action has a key, an action type (down/up/press), and an optional hold duration.',
        {
          keys_json: z.string().describe(
            'JSON array of key actions. Each object has: key (string), action ("down"|"up"|"press"), holdMs (optional number). Example: [{"key":"ArrowRight","action":"press"},{"key":"Space","action":"press"}]'
          ),
        },
        async (args) => {
          let actions: Array<{ key: string; action: 'down' | 'up' | 'press'; holdMs?: number }>;
          try {
            actions = JSON.parse(args.keys_json);
          } catch {
            return {
              content: [{ type: 'text' as const, text: 'Invalid JSON in keys_json.' }],
              isError: true,
            };
          }

          if (!Array.isArray(actions)) {
            return {
              content: [{ type: 'text' as const, text: 'keys_json must be a JSON array.' }],
              isError: true,
            };
          }

          try {
            const p = await ensureBrowser();

            // Re-focus the canvas before executing the key sequence
            try { await p.locator('canvas').focus(); } catch { /* canvas may not exist */ }

            for (const action of actions) {
              if (action.action === 'down') {
                await p.keyboard.down(action.key);
                if (action.holdMs) await p.waitForTimeout(action.holdMs);
              } else if (action.action === 'up') {
                await p.keyboard.up(action.key);
              } else {
                await p.keyboard.press(action.key);
              }
            }
            return {
              content: [{ type: 'text' as const, text: `Executed ${actions.length} key actions.` }],
            };
          } catch (err) {
            return {
              content: [{ type: 'text' as const, text: `Key sequence failed: ${(err as Error).message}` }],
              isError: true,
            };
          }
        }
      ),

      tool(
        'wait',
        'Wait for a specified duration in milliseconds. Useful for waiting for game animations or state changes.',
        {
          milliseconds: z.number().describe(
            'Number of milliseconds to wait (max 10000).'
          ),
        },
        async (args) => {
          const ms = Math.min(args.milliseconds, 10000);
          try {
            const p = await ensureBrowser();
            await p.waitForTimeout(ms);
            return {
              content: [{ type: 'text' as const, text: `Waited ${ms}ms.` }],
            };
          } catch (err) {
            return {
              content: [{ type: 'text' as const, text: `Wait failed: ${(err as Error).message}` }],
              isError: true,
            };
          }
        }
      ),

      tool(
        'get_console_errors',
        'Get all console errors captured from the browser since navigation. Returns an array of error objects with message, source, line, and timestamp.',
        {},
        async () => {
          return {
            content: [{
              type: 'text' as const,
              text: consoleErrors.length === 0
                ? 'No console errors captured.'
                : JSON.stringify(consoleErrors, null, 2),
            }],
          };
        }
      ),

      tool(
        'evaluate_js',
        'Evaluate a JavaScript expression in the game browser context. Use this to read game state, check DOM elements, or inspect Phaser objects.',
        {
          script: z.string().describe(
            'JavaScript code to evaluate in the browser. Example: "document.querySelector(\'canvas\') !== null"'
          ),
        },
        async (args) => {
          try {
            const p = await ensureBrowser();
            const result = await p.evaluate(args.script);
            return {
              content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
            };
          } catch (err) {
            return {
              content: [{ type: 'text' as const, text: `Evaluate failed: ${(err as Error).message}` }],
              isError: true,
            };
          }
        }
      ),

      tool(
        'submit_qa_results',
        'Save structured QA test results to the session. The orchestrator uses these to determine pass/fail status.',
        {
          passed: z.boolean().describe('Whether the overall QA test passed.'),
          errors: z.array(z.string()).describe('List of error descriptions found during testing.'),
          summary: z.string().describe('A brief user-facing summary of QA findings (2-4 sentences).'),
          screenshot_base64: z.string().optional().describe('Optional base64-encoded screenshot to include with the result.'),
        },
        async (args) => {
          const qaResult = {
            id: randomUUID(),
            timestamp: Date.now(),
            passed: args.passed,
            screenshotBase64: args.screenshot_base64,
            errors: args.errors,
            summary: args.summary,
          };

          const currentSession = deps.sessionManager.getSession(session.id);
          if (!currentSession) {
            return {
              content: [{ type: 'text' as const, text: 'Session not found.' }],
              isError: true,
            };
          }

          deps.sessionManager.updateSession(session.id, {
            qaResults: [...currentSession.qaResults, qaResult],
          });

          return {
            content: [{
              type: 'text' as const,
              text: `QA results saved. Passed: ${args.passed}. ${args.errors.length} error(s) found.`,
            }],
          };
        }
      ),
    ],
  });

  return { server, dispose };
}
