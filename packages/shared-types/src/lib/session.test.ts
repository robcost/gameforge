import { describe, it, expect } from 'vitest';
import {
  SESSION_STATES,
  VALID_STATE_TRANSITIONS,
  isValidTransition,
  isSessionState,
} from './session.js';

describe('session', () => {
  describe('SESSION_STATES', () => {
    it('contains all twelve session states', () => {
      expect(SESSION_STATES).toHaveLength(12);
      expect(SESSION_STATES).toContain('new');
      expect(SESSION_STATES).toContain('scaffolding');
      expect(SESSION_STATES).toContain('ready');
      expect(SESSION_STATES).toContain('designing');
      expect(SESSION_STATES).toContain('generating_assets');
      expect(SESSION_STATES).toContain('generating_music');
      expect(SESSION_STATES).toContain('developing');
      expect(SESSION_STATES).toContain('testing');
      expect(SESSION_STATES).toContain('awaiting_feedback');
      expect(SESSION_STATES).toContain('iterating');
      expect(SESSION_STATES).toContain('error');
      expect(SESSION_STATES).toContain('closed');
    });
  });

  describe('isSessionState', () => {
    it('returns true for valid session states', () => {
      expect(isSessionState('new')).toBe(true);
      expect(isSessionState('ready')).toBe(true);
      expect(isSessionState('closed')).toBe(true);
    });

    it('returns false for invalid strings', () => {
      expect(isSessionState('running')).toBe(false);
      expect(isSessionState('')).toBe(false);
      expect(isSessionState('NEW')).toBe(false);
    });
  });

  describe('isValidTransition', () => {
    it('allows new → scaffolding', () => {
      expect(isValidTransition('new', 'scaffolding')).toBe(true);
    });

    it('allows scaffolding → ready', () => {
      expect(isValidTransition('scaffolding', 'ready')).toBe(true);
    });

    it('allows ready → designing', () => {
      expect(isValidTransition('ready', 'designing')).toBe(true);
    });

    it('allows the full happy path: designing → developing → testing → awaiting_feedback', () => {
      expect(isValidTransition('designing', 'developing')).toBe(true);
      expect(isValidTransition('developing', 'testing')).toBe(true);
      expect(isValidTransition('testing', 'awaiting_feedback')).toBe(true);
    });

    it('allows the asset generation path: designing → generating_assets → developing', () => {
      expect(isValidTransition('designing', 'generating_assets')).toBe(true);
      expect(isValidTransition('generating_assets', 'developing')).toBe(true);
    });

    it('allows generating_assets → designing (fallback)', () => {
      expect(isValidTransition('generating_assets', 'designing')).toBe(true);
    });

    it('allows the music generation path: generating_assets → generating_music → developing', () => {
      expect(isValidTransition('generating_assets', 'generating_music')).toBe(true);
      expect(isValidTransition('generating_music', 'developing')).toBe(true);
    });

    it('allows designing → generating_music (music without art)', () => {
      expect(isValidTransition('designing', 'generating_music')).toBe(true);
    });

    it('allows iteration loop: awaiting_feedback → iterating → designing', () => {
      expect(isValidTransition('awaiting_feedback', 'iterating')).toBe(true);
      expect(isValidTransition('iterating', 'designing')).toBe(true);
    });

    it('allows error recovery: error → ready', () => {
      expect(isValidTransition('error', 'ready')).toBe(true);
    });

    it('allows any active state to transition to error', () => {
      const activeStates = SESSION_STATES.filter(
        (s) => s !== 'closed' && s !== 'error'
      );
      for (const state of activeStates) {
        expect(isValidTransition(state, 'error')).toBe(true);
      }
    });

    it('allows any state to transition to closed (except closed itself)', () => {
      const statesExceptClosed = SESSION_STATES.filter((s) => s !== 'closed');
      for (const state of statesExceptClosed) {
        expect(isValidTransition(state, 'closed')).toBe(true);
      }
    });

    it('disallows closed → anything', () => {
      for (const state of SESSION_STATES) {
        expect(isValidTransition('closed', state)).toBe(false);
      }
    });

    it('disallows invalid transitions', () => {
      expect(isValidTransition('new', 'designing')).toBe(false);
      expect(isValidTransition('ready', 'testing')).toBe(false);
      expect(isValidTransition('scaffolding', 'developing')).toBe(false);
    });
  });

  describe('VALID_STATE_TRANSITIONS', () => {
    it('has an entry for every session state', () => {
      for (const state of SESSION_STATES) {
        expect(VALID_STATE_TRANSITIONS).toHaveProperty(state);
      }
    });
  });
});
