import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWebSocket } from './useWebSocket';
import { useSessionStore } from '../stores/sessionStore';

/** Captured WebSocket instances for test control. */
let mockInstances: MockWebSocket[];

/** Mock WebSocket with controllable events. */
class MockWebSocket {
  static readonly OPEN = 1;
  static readonly CLOSED = 3;

  readyState = MockWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
  });

  constructor(_url: string) {
    mockInstances.push(this);
    // Simulate async connect
    setTimeout(() => this.onopen?.(), 0);
  }

  /** Simulate receiving a message from the server. */
  receiveMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  /** Simulate connection closing (from server side). */
  simulateClose() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }
}

// Replace global WebSocket with mock
vi.stubGlobal('WebSocket', MockWebSocket);

describe('useWebSocket', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockInstances = [];
    useSessionStore.getState().reset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('sends session_resume on connect', async () => {
    const { unmount } = renderHook(() => useWebSocket('test-session-123'));

    // Wait for the async onopen
    await act(async () => { vi.advanceTimersByTime(10); });

    expect(mockInstances).toHaveLength(1);
    expect(mockInstances[0].send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'session_resume', sessionId: 'test-session-123' })
    );

    unmount();
  });

  it('dispatches agent_message to store', async () => {
    const { unmount } = renderHook(() => useWebSocket('test-session'));

    await act(async () => { vi.advanceTimersByTime(10); });

    act(() => {
      mockInstances[0].receiveMessage({
        type: 'agent_message',
        content: 'Hello from agent',
        agentRole: 'orchestrator',
      });
    });

    const messages = useSessionStore.getState().messages;
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe('Hello from agent');
    expect(messages[0].role).toBe('orchestrator');

    unmount();
  });

  it('dispatches preview_ready to store', async () => {
    const { unmount } = renderHook(() => useWebSocket('test-session'));

    await act(async () => { vi.advanceTimersByTime(10); });

    act(() => {
      mockInstances[0].receiveMessage({
        type: 'preview_ready',
        url: 'http://localhost:8100',
      });
    });

    expect(useSessionStore.getState().previewUrl).toBe(
      'http://localhost:8100'
    );
    expect(useSessionStore.getState().isScaffolding).toBe(false);

    unmount();
  });

  it('dispatches preview_refresh to store', async () => {
    const { unmount } = renderHook(() => useWebSocket('test-session'));

    await act(async () => { vi.advanceTimersByTime(10); });

    act(() => {
      mockInstances[0].receiveMessage({ type: 'preview_refresh' });
    });

    expect(useSessionStore.getState().refreshCounter).toBe(1);

    unmount();
  });

  it('sendMessage serializes and sends JSON', async () => {
    const { result, unmount } = renderHook(() => useWebSocket('test-session'));

    await act(async () => { vi.advanceTimersByTime(10); });

    act(() => {
      result.current.sendMessage({
        type: 'user_message',
        content: 'make a red ball',
      });
    });

    expect(mockInstances[0].send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'user_message', content: 'make a red ball' })
    );

    unmount();
  });

  it('cleans up WebSocket on unmount', async () => {
    const { unmount } = renderHook(() => useWebSocket('test-session'));

    await act(async () => { vi.advanceTimersByTime(10); });

    const ws = mockInstances[0];
    unmount();

    expect(ws.close).toHaveBeenCalled();
  });

  it('dispatches error messages to store', async () => {
    const { unmount } = renderHook(() => useWebSocket('test-session'));

    await act(async () => { vi.advanceTimersByTime(10); });

    act(() => {
      mockInstances[0].receiveMessage({
        type: 'error',
        message: 'Something went wrong',
      });
    });

    const messages = useSessionStore.getState().messages;
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe('Something went wrong');

    unmount();
  });

  // ── Session Restore ─────────────────────────────────────────────

  it('dispatches session_restore to store', async () => {
    const { unmount } = renderHook(() => useWebSocket('test-session'));

    await act(async () => { vi.advanceTimersByTime(10); });

    act(() => {
      mockInstances[0].receiveMessage({
        type: 'session_restore',
        sessionId: 'test-session',
        status: 'ready',
        conversationHistory: [
          { role: 'user', content: 'Make a platformer', timestamp: 1000 },
          { role: 'designer', content: 'Created GDD', timestamp: 2000 },
        ],
        agentStates: {
          designer: 'idle',
          artist: 'idle',
          developer: 'idle',
          qa: 'idle',
          orchestrator: 'idle',
        },
        previewUrl: 'http://localhost:8100',
        iterationCount: 1,
        gameTitle: 'My Game',
        totalCostUsd: 0.1234,
      });
    });

    const state = useSessionStore.getState();
    expect(state.messages).toHaveLength(2);
    expect(state.messages[0].content).toBe('Make a platformer');
    expect(state.messages[0].role).toBe('user');
    expect(state.messages[1].content).toBe('Created GDD');
    expect(state.messages[1].role).toBe('designer');
    expect(state.previewUrl).toBe('http://localhost:8100');
    expect(state.totalCostUsd).toBe(0.1234);

    unmount();
  });

  it('dispatches asset_generation_progress completed to store as artist message', async () => {
    const { unmount } = renderHook(() => useWebSocket('test-session'));

    await act(async () => { vi.advanceTimersByTime(10); });

    act(() => {
      mockInstances[0].receiveMessage({
        type: 'asset_generation_progress',
        assetKey: 'player',
        description: 'Player sprite',
        status: 'completed',
        imageBase64: 'iVBORw0KGgoAAAA...',
      });
    });

    const messages = useSessionStore.getState().messages;
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('artist');
    expect(messages[0].content).toContain('Player sprite');
    expect(messages[0].imageBase64).toBe('iVBORw0KGgoAAAA...');

    unmount();
  });

  it('does not add message for non-completed asset_generation_progress', async () => {
    const { unmount } = renderHook(() => useWebSocket('test-session'));

    await act(async () => { vi.advanceTimersByTime(10); });

    act(() => {
      mockInstances[0].receiveMessage({
        type: 'asset_generation_progress',
        assetKey: 'player',
        description: 'Player sprite',
        status: 'generating',
      });
    });

    expect(useSessionStore.getState().messages).toHaveLength(0);

    unmount();
  });

  it('dispatches cost_update to store', async () => {
    const { unmount } = renderHook(() => useWebSocket('test-session'));

    await act(async () => { vi.advanceTimersByTime(10); });

    act(() => {
      mockInstances[0].receiveMessage({
        type: 'cost_update',
        totalCostUsd: 0.5678,
      });
    });

    expect(useSessionStore.getState().totalCostUsd).toBe(0.5678);

    unmount();
  });

  // ── Connection State ──────────────────────────────────────────────

  it('reports connected state after successful connection', async () => {
    const { result, unmount } = renderHook(() => useWebSocket('test-session'));

    await act(async () => { vi.advanceTimersByTime(10); });

    expect(result.current.connectionState).toBe('connected');

    unmount();
  });

  it('reports reconnecting state when connection drops', async () => {
    const { result, unmount } = renderHook(() => useWebSocket('test-session'));

    await act(async () => { vi.advanceTimersByTime(10); });
    expect(result.current.connectionState).toBe('connected');

    // Simulate connection drop
    act(() => {
      mockInstances[0].simulateClose();
    });

    expect(result.current.connectionState).toBe('reconnecting');

    unmount();
  });

  it('reconnects with exponential backoff after connection drops', async () => {
    const { unmount } = renderHook(() => useWebSocket('test-session'));

    await act(async () => { vi.advanceTimersByTime(10); });
    expect(mockInstances).toHaveLength(1);

    // First disconnect — should schedule reconnect after 1s (BASE_DELAY_MS)
    act(() => {
      mockInstances[0].simulateClose();
    });

    // Before 1s — no new connection
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(mockInstances).toHaveLength(1);

    // After 1s — new connection attempt
    await act(async () => { vi.advanceTimersByTime(600); });
    expect(mockInstances).toHaveLength(2);

    unmount();
  });

  it('resets reconnect counter on successful connection', async () => {
    const { result, unmount } = renderHook(() => useWebSocket('test-session'));

    await act(async () => { vi.advanceTimersByTime(10); });

    // Drop and reconnect
    act(() => { mockInstances[0].simulateClose(); });
    await act(async () => { vi.advanceTimersByTime(1100); }); // Wait for reconnect
    expect(mockInstances).toHaveLength(2);

    // Second connection opens
    await act(async () => { vi.advanceTimersByTime(10); });
    expect(result.current.connectionState).toBe('connected');

    // Drop again — should use initial delay (1s), not doubled (2s)
    act(() => { mockInstances[1].simulateClose(); });
    await act(async () => { vi.advanceTimersByTime(1100); });
    expect(mockInstances).toHaveLength(3);

    unmount();
  });

  it('does not reconnect after unmount', async () => {
    const { unmount } = renderHook(() => useWebSocket('test-session'));

    await act(async () => { vi.advanceTimersByTime(10); });

    unmount();

    // Even after time passes, no new connections
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(mockInstances).toHaveLength(1);
  });
});
