import { describe, it, expect } from 'vitest';
import {
  CLIENT_MESSAGE_TYPES,
  SERVER_MESSAGE_TYPES,
  isClientMessage,
  isServerMessage,
} from './messages.js';

describe('messages', () => {
  describe('CLIENT_MESSAGE_TYPES', () => {
    it('contains the four client message types', () => {
      expect(CLIENT_MESSAGE_TYPES).toEqual([
        'user_message',
        'session_create',
        'session_resume',
        'preview_interaction',
      ]);
    });
  });

  describe('SERVER_MESSAGE_TYPES', () => {
    it('contains the thirteen server message types', () => {
      expect(SERVER_MESSAGE_TYPES).toHaveLength(13);
      expect(SERVER_MESSAGE_TYPES).toContain('agent_message');
      expect(SERVER_MESSAGE_TYPES).toContain('agent_status');
      expect(SERVER_MESSAGE_TYPES).toContain('preview_ready');
      expect(SERVER_MESSAGE_TYPES).toContain('session_created');
      expect(SERVER_MESSAGE_TYPES).toContain('session_restore');
      expect(SERVER_MESSAGE_TYPES).toContain('tool_activity');
      expect(SERVER_MESSAGE_TYPES).toContain('cost_update');
      expect(SERVER_MESSAGE_TYPES).toContain('asset_generation_progress');
      expect(SERVER_MESSAGE_TYPES).toContain('music_generation_progress');
      expect(SERVER_MESSAGE_TYPES).toContain('error');
    });
  });

  describe('isClientMessage', () => {
    it('returns true for valid client messages', () => {
      expect(isClientMessage({ type: 'user_message', content: 'hello' })).toBe(true);
      expect(
        isClientMessage({ type: 'session_create', engine: 'phaser', genre: 'platformer' })
      ).toBe(true);
      expect(isClientMessage({ type: 'session_resume', sessionId: 'abc-123' })).toBe(true);
      expect(
        isClientMessage({ type: 'preview_interaction', action: 'play' })
      ).toBe(true);
    });

    it('returns false for server message types', () => {
      expect(isClientMessage({ type: 'agent_message', content: 'hi' })).toBe(false);
      expect(isClientMessage({ type: 'preview_ready', url: '...' })).toBe(false);
    });

    it('returns false for invalid values', () => {
      expect(isClientMessage(null)).toBe(false);
      expect(isClientMessage(undefined)).toBe(false);
      expect(isClientMessage('string')).toBe(false);
      expect(isClientMessage(42)).toBe(false);
      expect(isClientMessage({})).toBe(false);
      expect(isClientMessage({ type: 123 })).toBe(false);
      expect(isClientMessage({ type: 'unknown_type' })).toBe(false);
    });
  });

  describe('isServerMessage', () => {
    it('returns true for valid server messages', () => {
      expect(
        isServerMessage({ type: 'agent_message', content: 'hi', agentRole: 'designer' })
      ).toBe(true);
      expect(
        isServerMessage({
          type: 'agent_status',
          agentRole: 'developer',
          status: 'working',
        })
      ).toBe(true);
      expect(isServerMessage({ type: 'preview_ready', url: 'http://localhost:5100' })).toBe(
        true
      );
      expect(isServerMessage({ type: 'error', message: 'something broke' })).toBe(true);
      expect(
        isServerMessage({
          type: 'session_restore',
          sessionId: 'abc',
          status: 'ready',
          conversationHistory: [],
          agentStates: {},
          previewUrl: null,
          iterationCount: 0,
          gameTitle: null,
          totalCostUsd: 0,
        })
      ).toBe(true);
      expect(
        isServerMessage({ type: 'cost_update', totalCostUsd: 0.1234 })
      ).toBe(true);
      expect(
        isServerMessage({
          type: 'asset_generation_progress',
          assetKey: 'player',
          description: 'Player sprite',
          status: 'completed',
        })
      ).toBe(true);
      expect(
        isServerMessage({
          type: 'music_generation_progress',
          description: 'Upbeat chiptune adventure music',
          status: 'completed',
          durationSeconds: 30,
        })
      ).toBe(true);
    });

    it('returns false for client message types', () => {
      expect(isServerMessage({ type: 'user_message', content: 'hi' })).toBe(false);
      expect(isServerMessage({ type: 'session_create' })).toBe(false);
    });

    it('returns false for invalid values', () => {
      expect(isServerMessage(null)).toBe(false);
      expect(isServerMessage(undefined)).toBe(false);
      expect(isServerMessage({})).toBe(false);
      expect(isServerMessage({ type: 'unknown' })).toBe(false);
    });
  });
});
