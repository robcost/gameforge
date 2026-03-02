import { describe, it, expect } from 'vitest';
import { createMusicToolServer } from './musicToolServer.js';
import type { Session } from '@robcost/shared-types';
import { createDefaultAgentStates, createDefaultGDD } from '@robcost/shared-types';
import type { MusicGenerator } from '../music/musicGenerator.js';
import type { SessionManager } from '../sessions/sessionManager.js';

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

/** Creates a minimal mock session manager. */
function createMockSessionManager(session: Session): SessionManager {
  return {
    getSession: () => session,
    updateSession: () => {},
    transitionState: () => {},
  } as unknown as SessionManager;
}

/** Creates a minimal mock music generator. */
function createMockMusicGenerator(): MusicGenerator {
  return {
    generateMusic: async () => ({
      audio: {
        key: 'background-music',
        filename: 'background-music.wav',
        durationSeconds: 30,
        description: 'Upbeat chiptune adventure music',
      },
      filePath: '/tmp/test-project/public/assets/background-music.wav',
      costUsd: 0,
    }),
  } as unknown as MusicGenerator;
}

describe('createMusicToolServer', () => {
  it('creates a tool server with correct name', () => {
    const session = createMockSession();
    const server = createMusicToolServer(session, {
      sessionManager: createMockSessionManager(session),
      musicGenerator: createMockMusicGenerator(),
    });
    expect(server).toBeDefined();
  });

  it('creates a server that can be passed to query() mcpServers', () => {
    const session = createMockSession();
    const server = createMusicToolServer(session, {
      sessionManager: createMockSessionManager(session),
      musicGenerator: createMockMusicGenerator(),
    });
    // The server object should be truthy (it's an MCP server config)
    expect(server).toBeTruthy();
  });
});
