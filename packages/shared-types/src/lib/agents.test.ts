import { describe, it, expect } from 'vitest';
import {
  AGENT_ROLES,
  AGENT_STATUSES,
  isAgentRole,
  isAgentStatus,
  createDefaultAgentStates,
} from './agents.js';

describe('agents', () => {
  describe('AGENT_ROLES', () => {
    it('contains all six agent roles', () => {
      expect(AGENT_ROLES).toEqual(['designer', 'artist', 'musician', 'developer', 'qa', 'orchestrator']);
    });
  });

  describe('AGENT_STATUSES', () => {
    it('contains all five agent statuses', () => {
      expect(AGENT_STATUSES).toEqual(['idle', 'thinking', 'working', 'done', 'error']);
    });
  });

  describe('isAgentRole', () => {
    it('returns true for valid agent roles', () => {
      expect(isAgentRole('designer')).toBe(true);
      expect(isAgentRole('artist')).toBe(true);
      expect(isAgentRole('musician')).toBe(true);
      expect(isAgentRole('developer')).toBe(true);
      expect(isAgentRole('qa')).toBe(true);
      expect(isAgentRole('orchestrator')).toBe(true);
    });

    it('returns false for invalid strings', () => {
      expect(isAgentRole('unknown')).toBe(false);
      expect(isAgentRole('')).toBe(false);
      expect(isAgentRole('DESIGNER')).toBe(false);
    });
  });

  describe('isAgentStatus', () => {
    it('returns true for valid agent statuses', () => {
      expect(isAgentStatus('idle')).toBe(true);
      expect(isAgentStatus('thinking')).toBe(true);
      expect(isAgentStatus('working')).toBe(true);
      expect(isAgentStatus('done')).toBe(true);
      expect(isAgentStatus('error')).toBe(true);
    });

    it('returns false for invalid strings', () => {
      expect(isAgentStatus('running')).toBe(false);
      expect(isAgentStatus('')).toBe(false);
    });
  });

  describe('createDefaultAgentStates', () => {
    it('returns all agents set to idle', () => {
      const states = createDefaultAgentStates();
      expect(states).toEqual({
        designer: 'idle',
        artist: 'idle',
        musician: 'idle',
        developer: 'idle',
        qa: 'idle',
        orchestrator: 'idle',
      });
    });

    it('returns a new object each time', () => {
      const a = createDefaultAgentStates();
      const b = createDefaultAgentStates();
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });
});
