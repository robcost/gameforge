import { describe, it, expect } from 'vitest';
import { buildDesignerPrompt } from './designerSystem.js';
import { buildDeveloperPrompt } from './developerSystem.js';
import { buildQAPrompt } from './qaSystem.js';
import { buildArtistPrompt } from './artistSystem.js';
import type { Session } from '@robcost/shared-types';
import { createDefaultAgentStates, createDefaultGDD } from '@robcost/shared-types';

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

function createTestSession(engine: 'phaser' | 'threejs' = 'phaser'): Session {
  return {
    id: 'test-session',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: 'ready',
    engine,
    genre: 'platformer',
    projectPath: '/tmp/test-project',
    vitePort: 9000,
    viteUrl: 'http://localhost:9000',
    gdd: null,
    conversationHistory: [],
    agentStates: createDefaultAgentStates(),
    qaResults: [],
    iterationCount: 0,
    totalCostUsd: 0,
  };
}

function createSessionWithAssets(engine: 'phaser' | 'threejs' = 'phaser'): Session {
  const session = createTestSession(engine);
  const gdd = createDefaultGDD();
  gdd.artDirection = {
    style: 'pixel-art-16bit',
    palette: ['#2d1b00', '#8b4513'],
    mood: 'adventurous',
  };
  gdd.assetManifest = {
    assets: [
      {
        key: 'player',
        filename: 'player.png',
        width: 64,
        height: 64,
        description: 'Player sprite',
        category: 'character',
      },
    ],
    styleAnchorPath: null,
    assetCostUsd: 0.039,
  };
  session.gdd = gdd;
  return session;
}

// ────────────────────────────────────────────────────────────────
// Designer Prompt
// ────────────────────────────────────────────────────────────────

describe('buildDesignerPrompt', () => {
  it('mentions Phaser 3 for phaser engine', () => {
    const prompt = buildDesignerPrompt(createTestSession('phaser'));
    expect(prompt).toContain('Phaser 3 2D');
  });

  it('mentions Three.js for threejs engine', () => {
    const prompt = buildDesignerPrompt(createTestSession('threejs'));
    expect(prompt).toContain('Three.js 3D');
  });

  it('includes 3D genre guidelines for threejs', () => {
    const prompt = buildDesignerPrompt(createTestSession('threejs'));
    expect(prompt).toContain('3D Genre Guidelines');
    expect(prompt).toContain('First-Person');
  });

  it('does not include 3D genre guidelines for phaser', () => {
    const prompt = buildDesignerPrompt(createTestSession('phaser'));
    expect(prompt).not.toContain('3D Genre Guidelines');
  });

  it('includes art direction section', () => {
    const prompt = buildDesignerPrompt(createTestSession('phaser'));
    expect(prompt).toContain('Art Direction');
    expect(prompt).toContain('artDirection');
    expect(prompt).toContain('assetKey');
  });

  it('includes iteration context for existing GDD', () => {
    const session = createTestSession();
    session.gdd = createDefaultGDD();
    session.iterationCount = 2;
    const prompt = buildDesignerPrompt(session);
    expect(prompt).toContain('iteration #3');
  });
});

// ────────────────────────────────────────────────────────────────
// Developer Prompt
// ────────────────────────────────────────────────────────────────

describe('buildDeveloperPrompt', () => {
  it('returns Phaser-specific content for phaser engine', () => {
    const prompt = buildDeveloperPrompt(createTestSession('phaser'));
    expect(prompt).toContain('Phaser 3 TypeScript');
    expect(prompt).toContain('generateTexture');
    expect(prompt).toContain('phaser-development');
  });

  it('returns Three.js-specific content for threejs engine', () => {
    const prompt = buildDeveloperPrompt(createTestSession('threejs'));
    expect(prompt).toContain('Three.js TypeScript');
    expect(prompt).toContain('threejs-development');
  });

  it('does not contain Phaser content for threejs engine', () => {
    const prompt = buildDeveloperPrompt(createTestSession('threejs'));
    expect(prompt).not.toContain('Phaser.Scene');
    expect(prompt).not.toContain('generateTexture');
  });

  it('does not contain Three.js content for phaser engine', () => {
    const prompt = buildDeveloperPrompt(createTestSession('phaser'));
    expect(prompt).not.toContain('THREE.BoxGeometry');
    expect(prompt).not.toContain('PerspectiveCamera');
  });

  it('references asset skill when GDD has assetManifest (phaser)', () => {
    const session = createSessionWithAssets('phaser');
    const prompt = buildDeveloperPrompt(session);
    expect(prompt).toContain('phaser-development');
    expect(prompt).toContain('ASSETS.md');
  });

  it('references asset skill when GDD has assetManifest (threejs)', () => {
    const session = createSessionWithAssets('threejs');
    const prompt = buildDeveloperPrompt(session);
    expect(prompt).toContain('threejs-development');
    expect(prompt).toContain('ASSETS.md');
  });

  it('mentions colored rectangles when no assets (phaser)', () => {
    const prompt = buildDeveloperPrompt(createTestSession('phaser'));
    expect(prompt).toContain('colored rectangles');
  });

  it('mentions colored 3D shapes when no assets (threejs)', () => {
    const prompt = buildDeveloperPrompt(createTestSession('threejs'));
    expect(prompt).toContain('colored 3D shapes');
  });

  it('includes project path in constraints', () => {
    const session = createTestSession();
    const prompt = buildDeveloperPrompt(session);
    expect(prompt).toContain(session.projectPath);
  });
});

// ────────────────────────────────────────────────────────────────
// QA Prompt
// ────────────────────────────────────────────────────────────────

describe('buildQAPrompt', () => {
  it('mentions Phaser 3 for phaser engine', () => {
    const prompt = buildQAPrompt(createTestSession('phaser'));
    expect(prompt).toContain('Phaser 3');
  });

  it('mentions Three.js for threejs engine', () => {
    const prompt = buildQAPrompt(createTestSession('threejs'));
    expect(prompt).toContain('Three.js');
  });

  it('includes Phaser introspection for phaser engine', () => {
    const prompt = buildQAPrompt(createTestSession('phaser'));
    expect(prompt).toContain('scene?.scenes');
    expect(prompt).toContain('scene?.player');
  });

  it('includes Three.js introspection for threejs engine', () => {
    const prompt = buildQAPrompt(createTestSession('threejs'));
    expect(prompt).toContain('window.game');
    expect(prompt).toContain('scene?.children');
    expect(prompt).toContain('renderer?.info');
  });

  it('includes the vite URL', () => {
    const prompt = buildQAPrompt(createTestSession());
    expect(prompt).toContain('http://localhost:9000');
  });
});

// ────────────────────────────────────────────────────────────────
// Artist Prompt
// ────────────────────────────────────────────────────────────────

describe('buildArtistPrompt', () => {
  it('mentions Phaser 2D for phaser engine', () => {
    const prompt = buildArtistPrompt(createTestSession('phaser'));
    expect(prompt).toContain('Phaser 2D');
  });

  it('mentions Three.js 3D for threejs engine', () => {
    const prompt = buildArtistPrompt(createTestSession('threejs'));
    expect(prompt).toContain('Three.js 3D');
  });

  it('includes Phaser asset instructions for phaser engine', () => {
    const prompt = buildArtistPrompt(createTestSession('phaser'));
    expect(prompt).toContain('Character sprites');
    expect(prompt).toContain('Tile sprites');
  });

  it('includes Three.js asset instructions for threejs engine', () => {
    const prompt = buildArtistPrompt(createTestSession('threejs'));
    expect(prompt).toContain('Character textures');
    expect(prompt).toContain('Skybox panels');
  });

  it('mentions generate_asset tool', () => {
    const prompt = buildArtistPrompt(createTestSession());
    expect(prompt).toContain('generate_asset');
    expect(prompt).toContain('generate_batch');
  });
});
