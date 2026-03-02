import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Session, ArtDirection, AssetManifest } from '@robcost/shared-types';
import { SessionManager } from '../sessions/sessionManager.js';
import type { AssetGenerator, AssetGenerationResult } from '../assets/assetGenerator.js';
import { createAssetToolServer } from './assetToolServer.js';

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

const ART_DIRECTION: ArtDirection = {
  style: 'pixel-art-16bit',
  palette: ['#2d1b00', '#8b4513'],
  mood: 'adventurous',
};

/** Creates a mock AssetGenerator with spied methods. */
function createMockAssetGenerator(): AssetGenerator {
  return {
    generateAsset: vi.fn().mockResolvedValue({
      asset: {
        key: 'player',
        filename: 'player.png',
        width: 64,
        height: 64,
        description: 'a knight',
        category: 'character',
      },
      filePath: '/tmp/project/public/assets/player.png',
      costUsd: 0.039,
    } satisfies AssetGenerationResult),
    generateBatch: vi.fn().mockResolvedValue([
      {
        asset: {
          key: 'player',
          filename: 'player.png',
          width: 64,
          height: 64,
          description: 'a knight',
          category: 'character',
        },
        filePath: '/tmp/project/public/assets/player.png',
        costUsd: 0.039,
      },
    ] satisfies AssetGenerationResult[]),
    setStyleAnchor: vi.fn(),
    clearStyleAnchor: vi.fn(),
    buildPrompt: vi.fn().mockReturnValue('test prompt'),
  } as unknown as AssetGenerator;
}

/** Tool result type returned by MCP tool handlers. */
type ToolResult = { content: Array<{ type: string; text?: string }>; isError?: boolean };

/**
 * Extracts a tool handler from the MCP server's internal registry.
 * The SDK's `createSdkMcpServer` stores tools on `instance._registeredTools`.
 */
function getToolHandler(server: ReturnType<typeof createAssetToolServer>, toolName: string) {
  const instance = (server as unknown as { instance: { _registeredTools: Record<string, { handler: (args: Record<string, unknown>, ctx: Record<string, unknown>) => Promise<ToolResult> }> } }).instance;
  const toolEntry = instance._registeredTools[toolName];
  if (!toolEntry) throw new Error(`Tool "${toolName}" not found in server`);
  return toolEntry.handler;
}

// ────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────

describe('assetToolServer', () => {
  let sessionManager: SessionManager;
  let session: Session;
  let mockGenerator: AssetGenerator;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionManager = new SessionManager();
    session = sessionManager.createSession('phaser', 'platformer');

    // Advance to ready state
    sessionManager.transitionState(session.id, 'scaffolding');
    sessionManager.transitionState(session.id, 'ready');

    // Set up GDD with artDirection
    sessionManager.updateSession(session.id, {
      gdd: {
        title: 'Test Game',
        description: 'A test game',
        genre: 'platformer',
        engine: 'phaser',
        viewport: { width: 800, height: 500, backgroundColor: '#1a1a2e' },
        physics: { gravity: 800, playerSpeed: 200 },
        player: {
          width: 64,
          height: 64,
          color: '#4fc3f7',
          startPosition: { x: 100, y: 400 },
          abilities: ['move', 'jump'],
        },
        ui: { showScore: true, showLives: true, showHealth: false, showTimer: false },
        audio: { enabled: false },
        artDirection: ART_DIRECTION,
      },
    });

    mockGenerator = createMockAssetGenerator();
  });

  describe('createAssetToolServer', () => {
    it('creates a server without throwing', () => {
      const server = createAssetToolServer(session, {
        sessionManager,
        assetGenerator: mockGenerator,
      });
      expect(server).toBeDefined();
    });
  });

  describe('generate_asset tool', () => {
    it('calls assetGenerator.generateAsset with correct parameters', async () => {
      const onProgress = vi.fn();
      const server = createAssetToolServer(session, {
        sessionManager,
        assetGenerator: mockGenerator,
        onAssetProgress: onProgress,
      });

      const handler = getToolHandler(server, 'generate_asset');

      const result = await handler({
        prompt: 'a pixel-art knight',
        key: 'player',
        width: 64,
        height: 64,
        category: 'character',
        description: 'Player character',
      }, {});

      expect(vi.mocked(mockGenerator.generateAsset)).toHaveBeenCalledOnce();
      expect(result).toHaveProperty('content');

      // Verify progress callbacks were fired
      expect(onProgress).toHaveBeenCalledWith('player', 'generating');
      expect(onProgress).toHaveBeenCalledWith('player', 'completed', expect.any(Object));
    });

    it('updates session asset manifest after generation', async () => {
      const server = createAssetToolServer(session, {
        sessionManager,
        assetGenerator: mockGenerator,
      });

      const handler = getToolHandler(server, 'generate_asset');
      await handler({
        prompt: 'a knight',
        key: 'player',
        width: 64,
        height: 64,
        category: 'character',
        description: 'Player',
      }, {});

      const updated = sessionManager.getSession(session.id)!;
      expect(updated.gdd?.assetManifest?.assets).toHaveLength(1);
      expect(updated.gdd?.assetManifest?.assets[0].key).toBe('player');
      expect(updated.gdd?.assetManifest?.assetCostUsd).toBe(0.039);
    });

    it('returns error when no art direction in GDD', async () => {
      // Remove artDirection
      sessionManager.updateSession(session.id, {
        gdd: { ...sessionManager.getSession(session.id)!.gdd!, artDirection: undefined },
      });

      const server = createAssetToolServer(session, {
        sessionManager,
        assetGenerator: mockGenerator,
      });

      const handler = getToolHandler(server, 'generate_asset');
      const result = await handler({
        prompt: 'test',
        key: 'test',
        width: 32,
        height: 32,
        category: 'other',
        description: 'test',
      }, {});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No art direction');
    });

    it('fires failed progress on generator error', async () => {
      const onProgress = vi.fn();
      vi.mocked(mockGenerator.generateAsset).mockRejectedValueOnce(new Error('Rate limit'));

      const server = createAssetToolServer(session, {
        sessionManager,
        assetGenerator: mockGenerator,
        onAssetProgress: onProgress,
      });

      const handler = getToolHandler(server, 'generate_asset');
      const result = await handler({
        prompt: 'test',
        key: 'fail-asset',
        width: 32,
        height: 32,
        category: 'other',
        description: 'test',
      }, {});

      expect(onProgress).toHaveBeenCalledWith('fail-asset', 'failed');
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Rate limit');
    });
  });

  describe('generate_batch tool', () => {
    it('calls assetGenerator.generateBatch with parsed requests', async () => {
      const server = createAssetToolServer(session, {
        sessionManager,
        assetGenerator: mockGenerator,
      });

      const handler = getToolHandler(server, 'generate_batch');
      const result = await handler({
        assets_json: JSON.stringify([
          { prompt: 'a knight', key: 'player', width: 64, height: 64, category: 'character', description: 'Player' },
        ]),
      }, {});

      expect(vi.mocked(mockGenerator.generateBatch)).toHaveBeenCalledOnce();
      const parsed = JSON.parse(result.content[0].text!);
      expect(parsed.status).toBe('success');
      expect(parsed.generated).toBe(1);
    });

    it('returns error for invalid JSON', async () => {
      const server = createAssetToolServer(session, {
        sessionManager,
        assetGenerator: mockGenerator,
      });

      const handler = getToolHandler(server, 'generate_batch');
      const result = await handler({
        assets_json: 'not json',
      }, {});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid JSON');
    });

    it('returns error for empty array', async () => {
      const server = createAssetToolServer(session, {
        sessionManager,
        assetGenerator: mockGenerator,
      });

      const handler = getToolHandler(server, 'generate_batch');
      const result = await handler({
        assets_json: '[]',
      }, {});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('non-empty');
    });
  });

  describe('get_asset_manifest tool', () => {
    it('returns "no assets" when manifest is empty', async () => {
      const server = createAssetToolServer(session, {
        sessionManager,
        assetGenerator: mockGenerator,
      });

      const handler = getToolHandler(server, 'get_asset_manifest');
      const result = await handler({}, {});

      expect(result.content[0].text).toContain('No assets');
    });

    it('returns manifest JSON when assets exist', async () => {
      // Add an asset to the manifest
      const manifest: AssetManifest = {
        assets: [{
          key: 'player',
          filename: 'player.png',
          width: 64,
          height: 64,
          description: 'Player sprite',
          category: 'character',
        }],
        styleAnchorPath: null,
        assetCostUsd: 0.039,
      };

      sessionManager.updateSession(session.id, {
        gdd: { ...sessionManager.getSession(session.id)!.gdd!, assetManifest: manifest },
      });

      const server = createAssetToolServer(session, {
        sessionManager,
        assetGenerator: mockGenerator,
      });

      const handler = getToolHandler(server, 'get_asset_manifest');
      const result = await handler({}, {});

      const parsed = JSON.parse(result.content[0].text!);
      expect(parsed.assets).toHaveLength(1);
      expect(parsed.assets[0].key).toBe('player');
    });
  });

  describe('set_style_anchor tool', () => {
    it('calls assetGenerator.setStyleAnchor with the correct path', async () => {
      // First add an asset to the manifest
      const manifest: AssetManifest = {
        assets: [{
          key: 'player',
          filename: 'player.png',
          width: 64,
          height: 64,
          description: 'Player sprite',
          category: 'character',
        }],
        styleAnchorPath: null,
        assetCostUsd: 0.039,
      };

      sessionManager.updateSession(session.id, {
        gdd: { ...sessionManager.getSession(session.id)!.gdd!, assetManifest: manifest },
      });

      const server = createAssetToolServer(session, {
        sessionManager,
        assetGenerator: mockGenerator,
      });

      const handler = getToolHandler(server, 'set_style_anchor');
      const result = await handler({ asset_key: 'player' }, {});

      expect(vi.mocked(mockGenerator.setStyleAnchor)).toHaveBeenCalledOnce();
      expect(result.content[0].text).toContain('Style anchor set');
    });

    it('returns error for unknown asset key', async () => {
      const manifest: AssetManifest = {
        assets: [{
          key: 'player',
          filename: 'player.png',
          width: 64,
          height: 64,
          description: 'Player sprite',
          category: 'character',
        }],
        styleAnchorPath: null,
        assetCostUsd: 0.039,
      };

      sessionManager.updateSession(session.id, {
        gdd: { ...sessionManager.getSession(session.id)!.gdd!, assetManifest: manifest },
      });

      const server = createAssetToolServer(session, {
        sessionManager,
        assetGenerator: mockGenerator,
      });

      const handler = getToolHandler(server, 'set_style_anchor');
      const result = await handler({ asset_key: 'nonexistent' }, {});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not found');
    });

    it('returns error when no manifest exists', async () => {
      const server = createAssetToolServer(session, {
        sessionManager,
        assetGenerator: mockGenerator,
      });

      const handler = getToolHandler(server, 'set_style_anchor');
      const result = await handler({ asset_key: 'anything' }, {});

      expect(result.isError).toBe(true);
    });
  });
});
