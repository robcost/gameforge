import { describe, it, expect } from 'vitest';
import { buildMusicianPrompt } from './musicianSystem.js';
import type { Session } from '@robcost/shared-types';
import { createDefaultAgentStates, createDefaultGDD } from '@robcost/shared-types';

/** Creates a minimal mock session for testing. */
function createMockSession(overrides?: Partial<Session>): Session {
  return {
    id: 'test-session-id',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: 'generating_music',
    engine: 'phaser',
    genre: 'platformer',
    projectPath: '/tmp/test-project',
    vitePort: 5100,
    viteUrl: 'http://localhost:5100',
    gdd: createDefaultGDD(),
    conversationHistory: [],
    agentStates: createDefaultAgentStates(),
    qaResults: [],
    iterationCount: 0,
    totalCostUsd: 0,
    ...overrides,
  };
}

describe('buildMusicianPrompt', () => {
  it('returns a non-empty string', () => {
    const session = createMockSession();
    const prompt = buildMusicianPrompt(session);
    expect(prompt).toBeTruthy();
    expect(typeof prompt).toBe('string');
  });

  it('includes Phaser 2D for phaser engine sessions', () => {
    const session = createMockSession({ engine: 'phaser' });
    const prompt = buildMusicianPrompt(session);
    expect(prompt).toContain('Phaser 2D');
  });

  it('includes Three.js 3D for threejs engine sessions', () => {
    const session = createMockSession({ engine: 'threejs' });
    const prompt = buildMusicianPrompt(session);
    expect(prompt).toContain('Three.js 3D');
  });

  it('references the generate_music tool', () => {
    const session = createMockSession();
    const prompt = buildMusicianPrompt(session);
    expect(prompt).toContain('generate_music');
  });

  it('references the get_music_status tool', () => {
    const session = createMockSession();
    const prompt = buildMusicianPrompt(session);
    expect(prompt).toContain('get_music_status');
  });

  it('references the get_design_document tool', () => {
    const session = createMockSession();
    const prompt = buildMusicianPrompt(session);
    expect(prompt).toContain('get_design_document');
  });

  it('includes genre to music style mapping guidance', () => {
    const session = createMockSession();
    const prompt = buildMusicianPrompt(session);
    expect(prompt).toContain('Pixel art');
    expect(prompt).toContain('chiptune');
    expect(prompt).toContain('orchestral');
  });

  it('includes game genre to tempo guidance', () => {
    const session = createMockSession();
    const prompt = buildMusicianPrompt(session);
    expect(prompt).toContain('Platformers');
    expect(prompt).toContain('BPM');
  });

  it('instructs to always include "loopable" in prompts', () => {
    const session = createMockSession();
    const prompt = buildMusicianPrompt(session);
    expect(prompt).toContain('loopable');
  });

  it('includes engine name in constraints', () => {
    const session = createMockSession({ engine: 'phaser' });
    const prompt = buildMusicianPrompt(session);
    expect(prompt).toContain('Engine is always "phaser"');
  });
});
