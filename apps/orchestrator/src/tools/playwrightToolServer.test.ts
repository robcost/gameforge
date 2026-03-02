import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionManager } from '../sessions/sessionManager.js';
import type { Session } from '@robcost/shared-types';

/** Tool result type returned by MCP tool handlers. */
type ToolResult = { content: Array<{ type: string; text?: string }>; isError?: boolean };

// ── Playwright mocks (hoisted so vi.mock factory can reference them) ──

const {
  mockScreenshot,
  mockGoto,
  mockKeyboardPress,
  mockKeyboardDown,
  mockKeyboardUp,
  mockWaitForTimeout,
  mockEvaluate,
  mockBrowserClose,
  mockPageOn,
  mockNewPage,
  mockNewContext,
  mockLaunch,
  mockWaitForSelector,
  mockClick,
  mockLocatorFocus,
  mockLocator,
} = vi.hoisted(() => {
  const mockScreenshot = vi.fn().mockResolvedValue(Buffer.from('fake-png-data'));
  const mockGoto = vi.fn().mockResolvedValue(undefined);
  const mockKeyboardPress = vi.fn().mockResolvedValue(undefined);
  const mockKeyboardDown = vi.fn().mockResolvedValue(undefined);
  const mockKeyboardUp = vi.fn().mockResolvedValue(undefined);
  const mockWaitForTimeout = vi.fn().mockResolvedValue(undefined);
  const mockEvaluate = vi.fn().mockResolvedValue({ x: 100, y: 200 });
  const mockBrowserClose = vi.fn().mockResolvedValue(undefined);
  const mockPageOn = vi.fn();
  const mockWaitForSelector = vi.fn().mockResolvedValue(undefined);
  const mockClick = vi.fn().mockResolvedValue(undefined);
  const mockLocatorFocus = vi.fn().mockResolvedValue(undefined);
  const mockLocator = vi.fn().mockReturnValue({ focus: mockLocatorFocus });

  const mockPage = {
    goto: mockGoto,
    screenshot: mockScreenshot,
    keyboard: {
      press: mockKeyboardPress,
      down: mockKeyboardDown,
      up: mockKeyboardUp,
    },
    waitForTimeout: mockWaitForTimeout,
    evaluate: mockEvaluate,
    on: mockPageOn,
    waitForSelector: mockWaitForSelector,
    click: mockClick,
    locator: mockLocator,
  };

  const mockNewPage = vi.fn().mockResolvedValue(mockPage);
  const mockNewContext = vi.fn().mockResolvedValue({ newPage: mockNewPage });

  const mockBrowser = {
    newContext: mockNewContext,
    close: mockBrowserClose,
  };

  const mockLaunch = vi.fn().mockResolvedValue(mockBrowser);

  return {
    mockScreenshot,
    mockGoto,
    mockKeyboardPress,
    mockKeyboardDown,
    mockKeyboardUp,
    mockWaitForTimeout,
    mockEvaluate,
    mockBrowserClose,
    mockPageOn,
    mockNewPage,
    mockNewContext,
    mockLaunch,
    mockWaitForSelector,
    mockClick,
    mockLocatorFocus,
    mockLocator,
  };
});

vi.mock('playwright', () => ({
  chromium: {
    launch: mockLaunch,
  },
}));

import { createPlaywrightToolServer } from './playwrightToolServer.js';
import type { PlaywrightToolServerDeps } from './playwrightToolServer.js';

/** Registered console listeners. */
let consoleListeners: Array<(msg: unknown) => void> = [];

/**
 * Extracts a tool handler from the MCP server's internal registry.
 * The SDK's `createSdkMcpServer` stores tools on `instance._registeredTools`.
 */
function getToolHandler(
  server: ReturnType<typeof createPlaywrightToolServer>['server'],
  toolName: string
) {
  const instance = (
    server as unknown as {
      instance: {
        _registeredTools: Record<
          string,
          { handler: (args: Record<string, unknown>) => Promise<ToolResult> }
        >;
      };
    }
  ).instance;
  const toolEntry = instance._registeredTools[toolName];
  if (!toolEntry) throw new Error(`Tool "${toolName}" not found in server`);
  return toolEntry.handler;
}

describe('playwrightToolServer', () => {
  let sessionManager: SessionManager;
  let session: Session;
  let onScreenshot: ReturnType<typeof vi.fn>;
  let deps: PlaywrightToolServerDeps;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleListeners = [];

    // Restore default mock implementations after clearAllMocks
    mockScreenshot.mockResolvedValue(Buffer.from('fake-png-data'));
    mockGoto.mockResolvedValue(undefined);
    mockKeyboardPress.mockResolvedValue(undefined);
    mockKeyboardDown.mockResolvedValue(undefined);
    mockKeyboardUp.mockResolvedValue(undefined);
    mockWaitForTimeout.mockResolvedValue(undefined);
    mockEvaluate.mockResolvedValue({ x: 100, y: 200 });
    mockBrowserClose.mockResolvedValue(undefined);
    mockWaitForSelector.mockResolvedValue(undefined);
    mockClick.mockResolvedValue(undefined);
    mockLocatorFocus.mockResolvedValue(undefined);
    mockLocator.mockReturnValue({ focus: mockLocatorFocus });

    // Capture console listeners registered by the tool server
    mockPageOn.mockImplementation((event: string, handler: (msg: unknown) => void) => {
      if (event === 'console') {
        consoleListeners.push(handler);
      }
    });

    sessionManager = new SessionManager();
    session = sessionManager.createSession('phaser', 'platformer');
    sessionManager.updateSession(session.id, {
      viteUrl: 'http://localhost:8100',
    });
    session = sessionManager.getSession(session.id)!;

    onScreenshot = vi.fn();
    deps = { sessionManager, onScreenshot };
  });

  describe('navigate_to_game', () => {
    it('navigates to session viteUrl by default', async () => {
      const { server } = createPlaywrightToolServer(session, deps);
      const handler = getToolHandler(server, 'navigate_to_game');

      const result = await handler({});
      expect(mockGoto).toHaveBeenCalledWith(
        'http://localhost:8100',
        expect.objectContaining({ waitUntil: 'networkidle' })
      );
      expect(result.content[0].text).toContain('Navigated to');
    });

    it('navigates to a custom URL when provided', async () => {
      const { server } = createPlaywrightToolServer(session, deps);
      const handler = getToolHandler(server, 'navigate_to_game');

      await handler({ url: 'http://localhost:9999' });
      expect(mockGoto).toHaveBeenCalledWith(
        'http://localhost:9999',
        expect.objectContaining({ waitUntil: 'networkidle' })
      );
    });

    it('returns error when no viteUrl is available', async () => {
      sessionManager.updateSession(session.id, { viteUrl: null });
      const noUrlSession = sessionManager.getSession(session.id)!;

      const { server } = createPlaywrightToolServer(noUrlSession, deps);
      const handler = getToolHandler(server, 'navigate_to_game');

      const result = await handler({});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No game URL');
    });

    it('returns error on navigation failure', async () => {
      mockGoto.mockRejectedValueOnce(new Error('Navigation timeout'));
      const { server } = createPlaywrightToolServer(session, deps);
      const handler = getToolHandler(server, 'navigate_to_game');

      const result = await handler({});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Navigation failed');
    });

    it('clicks canvas after navigation to establish focus', async () => {
      const { server } = createPlaywrightToolServer(session, deps);
      const handler = getToolHandler(server, 'navigate_to_game');

      await handler({});
      expect(mockWaitForSelector).toHaveBeenCalledWith('canvas', { timeout: 10000 });
      expect(mockClick).toHaveBeenCalledWith('canvas');
    });

    it('succeeds even if canvas is not found after navigation', async () => {
      mockWaitForSelector.mockRejectedValueOnce(new Error('Timeout'));
      const { server } = createPlaywrightToolServer(session, deps);
      const handler = getToolHandler(server, 'navigate_to_game');

      const result = await handler({});
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('Navigated to');
    });
  });

  describe('take_screenshot', () => {
    it('captures a screenshot and returns confirmation', async () => {
      const { server } = createPlaywrightToolServer(session, deps);
      const handler = getToolHandler(server, 'take_screenshot');

      const result = await handler({ description: 'Initial game state' });
      expect(mockScreenshot).toHaveBeenCalledWith({ type: 'png' });
      expect(result.content[0].text).toContain('Screenshot captured');
      expect(result.content[0].text).toContain('Initial game state');
    });

    it('calls onScreenshot callback with base64 data', async () => {
      const { server } = createPlaywrightToolServer(session, deps);
      const handler = getToolHandler(server, 'take_screenshot');

      await handler({ description: 'Test shot' });
      expect(onScreenshot).toHaveBeenCalledWith(
        Buffer.from('fake-png-data').toString('base64'),
        'Test shot'
      );
    });

    it('returns error on screenshot failure', async () => {
      mockScreenshot.mockRejectedValueOnce(new Error('Page not loaded'));
      const { server } = createPlaywrightToolServer(session, deps);
      const handler = getToolHandler(server, 'take_screenshot');

      const result = await handler({ description: 'fail' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Screenshot failed');
    });
  });

  describe('press_key', () => {
    it('presses a key without duration', async () => {
      const { server } = createPlaywrightToolServer(session, deps);
      const handler = getToolHandler(server, 'press_key');

      const result = await handler({ key: 'Space' });
      expect(mockKeyboardPress).toHaveBeenCalledWith('Space');
      expect(result.content[0].text).toContain('Key "Space" pressed');
    });

    it('holds a key for a duration', async () => {
      const { server } = createPlaywrightToolServer(session, deps);
      const handler = getToolHandler(server, 'press_key');

      await handler({ key: 'ArrowRight', duration: 500 });
      expect(mockKeyboardDown).toHaveBeenCalledWith('ArrowRight');
      expect(mockWaitForTimeout).toHaveBeenCalledWith(500);
      expect(mockKeyboardUp).toHaveBeenCalledWith('ArrowRight');
    });

    it('focuses canvas before pressing key', async () => {
      const { server } = createPlaywrightToolServer(session, deps);
      const handler = getToolHandler(server, 'press_key');

      await handler({ key: 'ArrowRight' });
      expect(mockLocator).toHaveBeenCalledWith('canvas');
      expect(mockLocatorFocus).toHaveBeenCalled();
    });
  });

  describe('press_keys_sequence', () => {
    it('executes a sequence of key actions', async () => {
      const { server } = createPlaywrightToolServer(session, deps);
      const handler = getToolHandler(server, 'press_keys_sequence');

      const keys = [
        { key: 'ArrowRight', action: 'press' },
        { key: 'Space', action: 'press' },
      ];
      const result = await handler({ keys_json: JSON.stringify(keys) });

      expect(mockKeyboardPress).toHaveBeenCalledWith('ArrowRight');
      expect(mockKeyboardPress).toHaveBeenCalledWith('Space');
      expect(result.content[0].text).toContain('2 key actions');
    });

    it('handles down action with holdMs', async () => {
      const { server } = createPlaywrightToolServer(session, deps);
      const handler = getToolHandler(server, 'press_keys_sequence');

      const keys = [{ key: 'ArrowLeft', action: 'down', holdMs: 300 }];
      await handler({ keys_json: JSON.stringify(keys) });

      expect(mockKeyboardDown).toHaveBeenCalledWith('ArrowLeft');
      expect(mockWaitForTimeout).toHaveBeenCalledWith(300);
    });

    it('returns error for invalid JSON', async () => {
      const { server } = createPlaywrightToolServer(session, deps);
      const handler = getToolHandler(server, 'press_keys_sequence');

      const result = await handler({ keys_json: 'not json' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid JSON');
    });

    it('returns error for non-array JSON', async () => {
      const { server } = createPlaywrightToolServer(session, deps);
      const handler = getToolHandler(server, 'press_keys_sequence');

      const result = await handler({ keys_json: '{"key":"Space"}' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('must be a JSON array');
    });

    it('focuses canvas before executing sequence', async () => {
      const { server } = createPlaywrightToolServer(session, deps);
      const handler = getToolHandler(server, 'press_keys_sequence');

      await handler({ keys_json: '[{"key":"Space","action":"press"}]' });
      expect(mockLocator).toHaveBeenCalledWith('canvas');
      expect(mockLocatorFocus).toHaveBeenCalled();
    });
  });

  describe('wait', () => {
    it('waits for specified milliseconds', async () => {
      const { server } = createPlaywrightToolServer(session, deps);
      const handler = getToolHandler(server, 'wait');

      const result = await handler({ milliseconds: 2000 });
      expect(mockWaitForTimeout).toHaveBeenCalledWith(2000);
      expect(result.content[0].text).toContain('Waited 2000ms');
    });

    it('caps wait at 10000ms', async () => {
      const { server } = createPlaywrightToolServer(session, deps);
      const handler = getToolHandler(server, 'wait');

      await handler({ milliseconds: 99999 });
      expect(mockWaitForTimeout).toHaveBeenCalledWith(10000);
    });
  });

  describe('get_console_errors', () => {
    it('returns "no errors" when none captured', async () => {
      const { server } = createPlaywrightToolServer(session, deps);
      const handler = getToolHandler(server, 'get_console_errors');

      const result = await handler({});
      expect(result.content[0].text).toContain('No console errors');
    });

    it('returns captured errors after console events', async () => {
      const { server } = createPlaywrightToolServer(session, deps);

      // Trigger browser initialization so console listener is registered
      const navHandler = getToolHandler(server, 'navigate_to_game');
      await navHandler({});

      // Simulate a console error via the registered listener
      expect(consoleListeners.length).toBeGreaterThan(0);
      consoleListeners[0]({
        type: () => 'error',
        text: () => 'Uncaught TypeError: Cannot read property',
        location: () => ({ url: 'game.js', lineNumber: 42 }),
      });

      const handler = getToolHandler(server, 'get_console_errors');
      const result = await handler({});
      const errors = JSON.parse(result.content[0].text!);

      expect(errors).toHaveLength(1);
      expect(errors[0].message).toBe('Uncaught TypeError: Cannot read property');
      expect(errors[0].source).toBe('game.js');
      expect(errors[0].line).toBe(42);
    });
  });

  describe('evaluate_js', () => {
    it('evaluates JavaScript and returns the result', async () => {
      const { server } = createPlaywrightToolServer(session, deps);
      const handler = getToolHandler(server, 'evaluate_js');

      const result = await handler({ script: 'document.title' });
      expect(mockEvaluate).toHaveBeenCalledWith('document.title');
      expect(result.content[0].text).toContain('100');
    });

    it('returns error on evaluation failure', async () => {
      mockEvaluate.mockRejectedValueOnce(new Error('ReferenceError: x is not defined'));
      const { server } = createPlaywrightToolServer(session, deps);
      const handler = getToolHandler(server, 'evaluate_js');

      const result = await handler({ script: 'x.y.z' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Evaluate failed');
    });
  });

  describe('submit_qa_results', () => {
    it('saves QA results to the session', async () => {
      const { server } = createPlaywrightToolServer(session, deps);
      const handler = getToolHandler(server, 'submit_qa_results');

      const result = await handler({
        passed: true,
        errors: [],
        summary: 'All tests passed. Game loads and plays correctly.',
      });

      expect(result.content[0].text).toContain('QA results saved');
      expect(result.content[0].text).toContain('Passed: true');

      const updated = sessionManager.getSession(session.id)!;
      expect(updated.qaResults).toHaveLength(1);
      expect(updated.qaResults[0].passed).toBe(true);
      expect(updated.qaResults[0].summary).toBe('All tests passed. Game loads and plays correctly.');
    });

    it('saves failing QA results with errors', async () => {
      const { server } = createPlaywrightToolServer(session, deps);
      const handler = getToolHandler(server, 'submit_qa_results');

      await handler({
        passed: false,
        errors: ['Player falls through platforms', 'No enemies visible'],
        summary: 'Game has collision issues.',
      });

      const updated = sessionManager.getSession(session.id)!;
      expect(updated.qaResults[0].passed).toBe(false);
      expect(updated.qaResults[0].errors).toEqual([
        'Player falls through platforms',
        'No enemies visible',
      ]);
    });

    it('includes optional screenshot in results', async () => {
      const { server } = createPlaywrightToolServer(session, deps);
      const handler = getToolHandler(server, 'submit_qa_results');

      await handler({
        passed: true,
        errors: [],
        summary: 'Passed.',
        screenshot_base64: 'abc123',
      });

      const updated = sessionManager.getSession(session.id)!;
      expect(updated.qaResults[0].screenshotBase64).toBe('abc123');
    });
  });

  describe('dispose', () => {
    it('closes the browser when called', async () => {
      const { server, dispose } = createPlaywrightToolServer(session, deps);

      // Trigger browser init by navigating
      const handler = getToolHandler(server, 'navigate_to_game');
      await handler({});

      await dispose();
      expect(mockBrowserClose).toHaveBeenCalled();
    });

    it('does nothing if browser was never launched', async () => {
      const { dispose } = createPlaywrightToolServer(session, deps);
      await dispose();
      expect(mockBrowserClose).not.toHaveBeenCalled();
    });
  });

  describe('lazy initialization', () => {
    it('does not launch browser until a tool is called', () => {
      mockLaunch.mockClear();
      createPlaywrightToolServer(session, deps);
      expect(mockLaunch).not.toHaveBeenCalled();
    });

    it('launches browser on first tool call', async () => {
      mockLaunch.mockClear();
      const { server } = createPlaywrightToolServer(session, deps);
      const handler = getToolHandler(server, 'navigate_to_game');
      await handler({});

      expect(mockLaunch).toHaveBeenCalledWith({ headless: true });
    });

    it('reuses browser across multiple tool calls', async () => {
      mockLaunch.mockClear();
      const { server } = createPlaywrightToolServer(session, deps);
      const navHandler = getToolHandler(server, 'navigate_to_game');
      const ssHandler = getToolHandler(server, 'take_screenshot');

      await navHandler({});
      await ssHandler({ description: 'test' });

      expect(mockLaunch).toHaveBeenCalledTimes(1);
    });
  });
});
