import { describe, it, expect, beforeEach } from 'vitest';
import { useSessionStore } from './sessionStore';

describe('sessionStore', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
  });

  it('has correct initial state', () => {
    const state = useSessionStore.getState();
    expect(state.sessionId).toBeNull();
    expect(state.previewUrl).toBeNull();
    expect(state.isScaffolding).toBe(false);
    expect(state.messages).toEqual([]);
    expect(state.refreshCounter).toBe(0);
    expect(state.agentStates).toEqual({
      designer: 'idle',
      artist: 'idle',
      developer: 'idle',
      qa: 'idle',
      orchestrator: 'idle',
    });
    expect(state.agentActivity).toBeNull();
    expect(state.totalCostUsd).toBe(0);
    expect(state.publishedUrl).toBeNull();
  });

  it('setSessionId updates sessionId', () => {
    useSessionStore.getState().setSessionId('abc-123');
    expect(useSessionStore.getState().sessionId).toBe('abc-123');
  });

  it('setPreviewUrl updates previewUrl', () => {
    useSessionStore.getState().setPreviewUrl('http://localhost:8100');
    expect(useSessionStore.getState().previewUrl).toBe('http://localhost:8100');
  });

  it('setIsScaffolding updates isScaffolding', () => {
    useSessionStore.getState().setIsScaffolding(true);
    expect(useSessionStore.getState().isScaffolding).toBe(true);
  });

  it('addMessage appends to messages array', () => {
    const msg = { role: 'user' as const, content: 'hello', timestamp: 1000 };
    useSessionStore.getState().addMessage(msg);
    expect(useSessionStore.getState().messages).toHaveLength(1);
    expect(useSessionStore.getState().messages[0]).toEqual(msg);

    const msg2 = {
      role: 'orchestrator' as const,
      content: 'hi back',
      timestamp: 2000,
    };
    useSessionStore.getState().addMessage(msg2);
    expect(useSessionStore.getState().messages).toHaveLength(2);
  });

  it('updateAgentStatus merges agent state', () => {
    useSessionStore.getState().updateAgentStatus('designer', 'working');
    const states = useSessionStore.getState().agentStates;
    expect(states.designer).toBe('working');
    expect(states.developer).toBe('idle');
  });

  it('incrementRefresh increments the counter', () => {
    useSessionStore.getState().incrementRefresh();
    expect(useSessionStore.getState().refreshCounter).toBe(1);
    useSessionStore.getState().incrementRefresh();
    expect(useSessionStore.getState().refreshCounter).toBe(2);
  });

  it('reset clears all state back to initial values', () => {
    useSessionStore.getState().setSessionId('test');
    useSessionStore.getState().setPreviewUrl('http://localhost:8100');
    useSessionStore.getState().setIsScaffolding(true);
    useSessionStore.getState().addMessage({
      role: 'user',
      content: 'test',
      timestamp: 1000,
    });
    useSessionStore.getState().incrementRefresh();

    useSessionStore.getState().setAgentActivity('Reading files...');
    useSessionStore.getState().setPublishedUrl('/games/test/');

    useSessionStore.getState().reset();

    const state = useSessionStore.getState();
    expect(state.sessionId).toBeNull();
    expect(state.previewUrl).toBeNull();
    expect(state.isScaffolding).toBe(false);
    expect(state.messages).toEqual([]);
    expect(state.refreshCounter).toBe(0);
    expect(state.agentActivity).toBeNull();
    expect(state.publishedUrl).toBeNull();
  });

  it('updateCost sets the cumulative cost', () => {
    useSessionStore.getState().updateCost(0.1234);
    expect(useSessionStore.getState().totalCostUsd).toBe(0.1234);

    useSessionStore.getState().updateCost(0.5678);
    expect(useSessionStore.getState().totalCostUsd).toBe(0.5678);
  });

  it('setAgentActivity updates and clears activity', () => {
    useSessionStore.getState().setAgentActivity('Reading player.ts');
    expect(useSessionStore.getState().agentActivity).toBe('Reading player.ts');

    useSessionStore.getState().setAgentActivity(null);
    expect(useSessionStore.getState().agentActivity).toBeNull();
  });

  it('setPublishedUrl sets and clears published URL', () => {
    useSessionStore.getState().setPublishedUrl('/games/test-id/');
    expect(useSessionStore.getState().publishedUrl).toBe('/games/test-id/');

    useSessionStore.getState().setPublishedUrl(null);
    expect(useSessionStore.getState().publishedUrl).toBeNull();
  });

  describe('restoreSession', () => {
    it('bulk-sets messages, agentStates, previewUrl, totalCostUsd, and publishedUrl', () => {
      useSessionStore.getState().restoreSession({
        messages: [
          { role: 'user', content: 'Hello', timestamp: 1000 },
          { role: 'designer', content: 'Created GDD', timestamp: 2000 },
        ],
        agentStates: {
          designer: 'idle',
          artist: 'idle',
          developer: 'working',
          qa: 'idle',
          orchestrator: 'idle',
        },
        previewUrl: 'http://localhost:8100',
        totalCostUsd: 0.4567,
        publishedUrl: '/games/abc-123/',
      });

      const state = useSessionStore.getState();
      expect(state.messages).toHaveLength(2);
      expect(state.messages[0].content).toBe('Hello');
      expect(state.messages[1].content).toBe('Created GDD');
      expect(state.agentStates.developer).toBe('working');
      expect(state.previewUrl).toBe('http://localhost:8100');
      expect(state.totalCostUsd).toBe(0.4567);
      expect(state.publishedUrl).toBe('/games/abc-123/');
    });

    it('replaces existing messages on restore', () => {
      useSessionStore.getState().addMessage({
        role: 'user',
        content: 'Old message',
        timestamp: 500,
      });

      useSessionStore.getState().restoreSession({
        messages: [
          { role: 'user', content: 'Restored message', timestamp: 1000 },
        ],
        agentStates: {
          designer: 'idle',
          artist: 'idle',
          developer: 'idle',
          qa: 'idle',
          orchestrator: 'idle',
        },
        previewUrl: null,
        totalCostUsd: 0,
        publishedUrl: null,
      });

      const state = useSessionStore.getState();
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0].content).toBe('Restored message');
    });
  });
});
