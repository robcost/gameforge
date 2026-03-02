/**
 * Session-scoped MCP tool server for AI asset generation.
 *
 * @remarks
 * Provides MCP tools for the Artist agent to generate game assets via the
 * Google Gemini API. Each tool operates on a specific session's data.
 * The Artist agent uses these tools to generate sprites, backgrounds,
 * tilesets, and other visual assets based on the GDD's art direction.
 *
 * Tools provided:
 * - `generate_asset` — generates a single PNG asset via Gemini
 * - `generate_batch` — generates multiple assets sequentially
 * - `get_asset_manifest` — returns the current manifest of generated assets
 * - `set_style_anchor` — sets a previously generated asset as the style reference
 *
 * @packageDocumentation
 */

import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { AssetManifest } from '@robcost/shared-types';
import type { Session } from '@robcost/shared-types';
import type { SessionManager } from '../sessions/sessionManager.js';
import type {
  AssetGenerator,
  AssetGenerationRequest,
  AssetProgressCallback,
} from '../assets/assetGenerator.js';

/** Dependencies needed to create an asset tool server. */
export interface AssetToolServerDeps {
  sessionManager: SessionManager;
  assetGenerator: AssetGenerator;
  /** Callback fired when an asset's generation status changes. */
  onAssetProgress?: AssetProgressCallback;
}

/**
 * Zod schema for asset category values.
 */
const assetCategorySchema = z.enum([
  'character',
  'enemy',
  'collectible',
  'hazard',
  'platform',
  'background',
  'ui',
  'effect',
  'other',
]);

/**
 * Creates a session-scoped MCP tool server for asset generation.
 *
 * @param session - The session this server operates on.
 * @param deps - Dependencies (session manager, asset generator, progress callback).
 * @returns An MCP server config that can be passed to `query()` options.mcpServers.
 */
export function createAssetToolServer(session: Session, deps: AssetToolServerDeps) {
  return createSdkMcpServer({
    name: 'asset-tools',
    version: '1.0.0',
    tools: [
      tool(
        'generate_asset',
        'Generate a single PNG game asset using AI image generation. The asset will be saved to the project\'s public/assets/ directory. Returns the asset reference on success.',
        {
          prompt: z.string().describe('Description of what to generate (e.g. "a 2D pixel-art knight facing right")'),
          key: z.string().describe('Unique asset key used to reference this asset in the game engine (e.g. "player", "enemy-goblin")'),
          width: z.number().describe('Desired width in pixels'),
          height: z.number().describe('Desired height in pixels'),
          category: assetCategorySchema.describe('Asset category'),
          description: z.string().describe('Human-readable description of what this asset represents'),
        },
        async (args) => {
          const currentSession = deps.sessionManager.getSession(session.id);
          if (!currentSession?.gdd?.artDirection) {
            return {
              content: [{ type: 'text' as const, text: 'Error: No art direction found in GDD. Cannot generate assets without art direction.' }],
              isError: true,
            };
          }

          deps.onAssetProgress?.(args.key, 'generating');

          try {
            const request: AssetGenerationRequest = {
              prompt: args.prompt,
              key: args.key,
              width: args.width,
              height: args.height,
              category: args.category,
              artDirection: currentSession.gdd.artDirection,
            };

            const result = await deps.assetGenerator.generateAsset(
              request,
              currentSession.projectPath,
            );

            // Update the session's asset manifest
            const manifest = currentSession.gdd.assetManifest ?? {
              assets: [],
              styleAnchorPath: null,
              assetCostUsd: 0,
            };
            manifest.assets.push(result.asset);
            manifest.assetCostUsd += result.costUsd;

            deps.sessionManager.updateSession(session.id, {
              gdd: {
                ...currentSession.gdd,
                assetManifest: manifest,
              },
            });

            // Track Gemini cost in session total
            deps.sessionManager.updateSession(session.id, {
              totalCostUsd: currentSession.totalCostUsd + result.costUsd,
            });

            deps.onAssetProgress?.(args.key, 'completed', result);

            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  status: 'success',
                  asset: result.asset,
                  filePath: result.filePath,
                  costUsd: result.costUsd,
                }, null, 2),
              }],
            };
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            deps.onAssetProgress?.(args.key, 'failed');

            return {
              content: [{ type: 'text' as const, text: `Asset generation failed: ${message}` }],
              isError: true,
            };
          }
        }
      ),

      tool(
        'generate_batch',
        'Generate multiple PNG game assets in sequence. Each asset is generated via AI and saved to public/assets/. Includes rate-limit delays between generations. Returns results for all successfully generated assets.',
        {
          assets_json: z.string().describe(
            'JSON array of asset specifications. Each element: { prompt, key, width, height, category, description }'
          ),
        },
        async (args) => {
          const currentSession = deps.sessionManager.getSession(session.id);
          if (!currentSession?.gdd?.artDirection) {
            return {
              content: [{ type: 'text' as const, text: 'Error: No art direction found in GDD.' }],
              isError: true,
            };
          }

          let assets: Array<{
            prompt: string;
            key: string;
            width: number;
            height: number;
            category: string;
            description: string;
          }>;

          try {
            assets = JSON.parse(args.assets_json);
          } catch {
            return {
              content: [{ type: 'text' as const, text: 'Invalid JSON in assets_json parameter.' }],
              isError: true,
            };
          }

          if (!Array.isArray(assets) || assets.length === 0) {
            return {
              content: [{ type: 'text' as const, text: 'assets_json must be a non-empty JSON array.' }],
              isError: true,
            };
          }

          const requests: AssetGenerationRequest[] = assets.map((a) => ({
            prompt: a.prompt,
            key: a.key,
            width: a.width,
            height: a.height,
            category: a.category as AssetGenerationRequest['category'],
            artDirection: currentSession.gdd!.artDirection!,
          }));

          const results = await deps.assetGenerator.generateBatch(
            requests,
            currentSession.projectPath,
            deps.onAssetProgress,
          );

          // Update the session manifest with all successful results
          const latestSession = deps.sessionManager.getSession(session.id)!;
          const manifest: AssetManifest = latestSession.gdd?.assetManifest ?? {
            assets: [],
            styleAnchorPath: null,
            assetCostUsd: 0,
          };

          let batchCost = 0;
          for (const r of results) {
            manifest.assets.push(r.asset);
            manifest.assetCostUsd += r.costUsd;
            batchCost += r.costUsd;
          }

          // Set style anchor from first result if not already set
          if (!manifest.styleAnchorPath && results.length > 0) {
            manifest.styleAnchorPath = results[0].filePath;
          }

          deps.sessionManager.updateSession(session.id, {
            gdd: { ...latestSession.gdd!, assetManifest: manifest },
            totalCostUsd: latestSession.totalCostUsd + batchCost,
          });

          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                status: 'success',
                generated: results.length,
                requested: requests.length,
                failed: requests.length - results.length,
                totalCostUsd: batchCost,
                assets: results.map((r) => r.asset),
              }, null, 2),
            }],
          };
        }
      ),

      tool(
        'get_asset_manifest',
        'Get the current asset manifest for this session. Shows all generated assets, their keys, filenames, and total generation cost.',
        {},
        async () => {
          const currentSession = deps.sessionManager.getSession(session.id);
          const manifest = currentSession?.gdd?.assetManifest;

          if (!manifest || manifest.assets.length === 0) {
            return {
              content: [{ type: 'text' as const, text: 'No assets have been generated yet.' }],
            };
          }

          return {
            content: [{ type: 'text' as const, text: JSON.stringify(manifest, null, 2) }],
          };
        }
      ),

      tool(
        'set_style_anchor',
        'Set a previously generated asset as the style reference for subsequent generations. This helps maintain visual consistency across all game assets.',
        {
          asset_key: z.string().describe('The key of an already-generated asset to use as the style anchor'),
        },
        async (args) => {
          const currentSession = deps.sessionManager.getSession(session.id);
          const manifest = currentSession?.gdd?.assetManifest;

          if (!manifest) {
            return {
              content: [{ type: 'text' as const, text: 'No assets have been generated yet.' }],
              isError: true,
            };
          }

          const asset = manifest.assets.find((a) => a.key === args.asset_key);
          if (!asset) {
            return {
              content: [{
                type: 'text' as const,
                text: `Asset "${args.asset_key}" not found in manifest. Available keys: ${manifest.assets.map((a) => a.key).join(', ')}`,
              }],
              isError: true,
            };
          }

          const { join } = await import('node:path');
          const anchorPath = join(currentSession!.projectPath, 'public', 'assets', asset.filename);

          deps.assetGenerator.setStyleAnchor(anchorPath);

          // Update manifest
          deps.sessionManager.updateSession(session.id, {
            gdd: {
              ...currentSession!.gdd!,
              assetManifest: { ...manifest, styleAnchorPath: anchorPath },
            },
          });

          return {
            content: [{
              type: 'text' as const,
              text: `Style anchor set to "${args.asset_key}" (${asset.filename}). Subsequent generations will reference this asset's visual style.`,
            }],
          };
        }
      ),
    ],
  });
}
