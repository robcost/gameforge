/**
 * Google Gemini image generation service for game assets.
 *
 * @remarks
 * Wraps the {@link https://www.npmjs.com/package/@google/genai | @google/genai} SDK
 * to generate PNG game assets using the Nano Banana model
 * (`gemini-2.5-flash-image`). Supports style anchoring — the first asset
 * generated in a batch becomes the visual reference for all subsequent
 * generations to maintain style consistency.
 *
 * @packageDocumentation
 */

import { GoogleGenAI } from '@google/genai';
import * as fs from 'node:fs';
import * as path from 'node:path';
import sharp from 'sharp';
import type { ArtDirection, AssetCategory, AssetReference } from '@robcost/shared-types';

// ────────────────────────────────────────────────────────────────
// Configuration
// ────────────────────────────────────────────────────────────────

/** Default Gemini image model. Override via `GEMINI_IMAGE_MODEL` env var. */
const DEFAULT_MODEL = 'gemini-2.5-flash-image';

/** Default per-image cost in USD. Override via `GEMINI_IMAGE_COST_USD` env var. */
const DEFAULT_COST_USD = 0.039;

/** Minimum delay between Gemini API calls to stay within rate limits (ms). */
const RATE_LIMIT_DELAY_MS = 6_000;

/**
 * Asset categories that represent isolated sprites requiring transparent
 * backgrounds. Categories not in this set (e.g. 'background', 'platform')
 * are expected to fill their entire canvas area.
 */
const SPRITE_CATEGORIES: ReadonlySet<AssetCategory> = new Set([
  'character',
  'enemy',
  'collectible',
  'hazard',
  'ui',
  'effect',
]);

/**
 * Maximum per-channel colour distance (0-255) when comparing corner pixels
 * for background removal. Two colours are considered "the same" if every
 * channel differs by at most this value.
 */
const BG_COLOR_TOLERANCE = 30;

// ────────────────────────────────────────────────────────────────
// Request / Result types
// ────────────────────────────────────────────────────────────────

/**
 * Request to generate a single game asset image.
 *
 * @remarks
 * Passed to {@link AssetGenerator.generateAsset} along with the project
 * path where the PNG will be saved.
 */
export interface AssetGenerationRequest {
  /** Natural-language description of what to generate (e.g. 'a 2D pixel-art knight facing right'). */
  prompt: string;
  /** Unique asset key used to reference this asset in the game engine. */
  key: string;
  /** Desired width in pixels. */
  width: number;
  /** Desired height in pixels. */
  height: number;
  /** Asset category for organizational purposes. */
  category: AssetCategory;
  /** Art direction from the GDD, used to build a style-consistent prompt. */
  artDirection: ArtDirection;
}

/**
 * Result of a successful asset generation.
 *
 * @remarks
 * Contains the {@link AssetReference} for the GDD manifest, the absolute
 * file path where the PNG was saved, and the API cost.
 */
export interface AssetGenerationResult {
  /** Asset reference suitable for adding to the GDD's AssetManifest. */
  asset: AssetReference;
  /** Absolute path to the generated PNG file on disk. */
  filePath: string;
  /** Gemini API cost for this generation in USD. */
  costUsd: number;
}

/**
 * Progress callback fired during batch asset generation.
 *
 * @param key - The asset key being generated.
 * @param status - Current generation status.
 * @param result - The generation result (present on completion).
 */
export type AssetProgressCallback = (
  key: string,
  status: 'generating' | 'completed' | 'failed',
  result?: AssetGenerationResult,
) => void;

// ────────────────────────────────────────────────────────────────
// AssetGenerator class
// ────────────────────────────────────────────────────────────────

/**
 * Generates game assets via the Google Gemini image generation API.
 *
 * @remarks
 * Typical usage:
 * ```ts
 * const generator = new AssetGenerator(process.env.GOOGLE_AI_API_KEY!);
 * const result = await generator.generateAsset(request, '/path/to/project');
 * ```
 *
 * For batch generation with style consistency, use {@link AssetGenerator.generateBatch}
 * which automatically sets the first asset as the style anchor.
 */
export class AssetGenerator {
  private readonly ai: GoogleGenAI;
  private readonly model: string;
  private readonly costPerImage: number;
  private styleAnchorBase64: string | null = null;

  /**
   * Creates an AssetGenerator instance.
   *
   * @param apiKey - Google AI API key for Gemini access.
   * @param model - Gemini model ID. Defaults to `GEMINI_IMAGE_MODEL` env var
   *                or `gemini-2.5-flash-image`.
   * @param costPerImage - Per-image cost in USD. Defaults to `GEMINI_IMAGE_COST_USD`
   *                       env var or `0.039`.
   */
  constructor(
    apiKey: string,
    model?: string,
    costPerImage?: number,
  ) {
    this.ai = new GoogleGenAI({ apiKey });
    this.model = model ?? process.env['GEMINI_IMAGE_MODEL'] ?? DEFAULT_MODEL;
    this.costPerImage =
      costPerImage ??
      (process.env['GEMINI_IMAGE_COST_USD']
        ? Number(process.env['GEMINI_IMAGE_COST_USD'])
        : DEFAULT_COST_USD);
  }

  /**
   * Generates a single game asset image and saves it as a PNG.
   *
   * @param request - The asset generation request describing what to create.
   * @param projectPath - Absolute path to the game project root. The PNG is
   *                      saved to `{projectPath}/public/assets/{key}.png`.
   * @returns The generation result including the saved file path and cost.
   * @throws If the Gemini API returns no image data or the request fails.
   */
  async generateAsset(
    request: AssetGenerationRequest,
    projectPath: string,
  ): Promise<AssetGenerationResult> {
    const prompt = this.buildPrompt(request);
    const contents = this.buildContents(prompt);

    const response = await this.ai.models.generateContent({
      model: this.model,
      contents,
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    });

    const rawBuffer = this.extractImage(response);

    // Post-process: remove background for sprite categories, then resize
    const isSprite = SPRITE_CATEGORIES.has(request.category);
    const bgRemoved = isSprite
      ? await this.removeBackground(rawBuffer)
      : rawBuffer;
    // Sprites use 'contain' (fit within bounds, transparent padding).
    // Backgrounds and platforms use 'cover' (crop to fill, no bars).
    const fit = isSprite ? 'contain' : 'cover';
    const finalBuffer = await this.resizeImage(
      bgRemoved,
      request.width,
      request.height,
      fit,
    );

    const filename = `${request.key}.png`;
    const assetsDir = path.join(projectPath, 'public', 'assets');
    const filePath = path.join(assetsDir, filename);

    // Ensure the output directory exists
    fs.mkdirSync(assetsDir, { recursive: true });
    fs.writeFileSync(filePath, finalBuffer);

    const asset: AssetReference = {
      key: request.key,
      filename,
      width: request.width,
      height: request.height,
      description: request.prompt,
      category: request.category,
    };

    return {
      asset,
      filePath,
      costUsd: this.costPerImage,
    };
  }

  /**
   * Generates multiple assets sequentially with rate-limit delays.
   *
   * @remarks
   * The first successfully generated asset automatically becomes the style
   * anchor — its image is sent as a reference in subsequent generation
   * calls to maintain visual consistency.
   *
   * @param requests - Array of asset generation requests.
   * @param projectPath - Absolute path to the game project root.
   * @param onProgress - Optional callback fired for each asset's status change.
   * @returns Array of results for successfully generated assets. Failed assets
   *          are reported via `onProgress` but not included in the results.
   */
  async generateBatch(
    requests: AssetGenerationRequest[],
    projectPath: string,
    onProgress?: AssetProgressCallback,
  ): Promise<AssetGenerationResult[]> {
    const results: AssetGenerationResult[] = [];

    for (let i = 0; i < requests.length; i++) {
      const request = requests[i];
      onProgress?.(request.key, 'generating');

      try {
        const result = await this.generateAsset(request, projectPath);
        results.push(result);

        // Set the first asset as the style anchor for subsequent generations
        if (i === 0) {
          this.setStyleAnchor(result.filePath);
        }

        onProgress?.(request.key, 'completed', result);
      } catch (error) {
        onProgress?.(request.key, 'failed');
      }

      // Rate-limit delay between API calls (skip after last request)
      if (i < requests.length - 1) {
        await this.delay(RATE_LIMIT_DELAY_MS);
      }
    }

    return results;
  }

  /**
   * Sets the style anchor image used as a visual reference in subsequent
   * generation calls.
   *
   * @param imagePath - Absolute path to a PNG image file.
   */
  setStyleAnchor(imagePath: string): void {
    const imageData = fs.readFileSync(imagePath);
    this.styleAnchorBase64 = imageData.toString('base64');
  }

  /**
   * Clears the current style anchor, if any.
   */
  clearStyleAnchor(): void {
    this.styleAnchorBase64 = null;
  }

  /**
   * Builds a Gemini prompt from the asset request and art direction.
   *
   * @param request - The asset generation request.
   * @returns A prompt string incorporating style, palette, mood, and dimensions.
   */
  buildPrompt(request: AssetGenerationRequest): string {
    const { artDirection, width, height, category, prompt } = request;

    const palette = Array.isArray(artDirection.palette)
      ? artDirection.palette.join(', ')
      : artDirection.palette;

    const isSprite = SPRITE_CATEGORIES.has(category);

    const parts = [
      `Create a 2D game asset (${category}):`,
      `- Style: ${artDirection.style}`,
      `- Color palette: ${palette}`,
      `- Mood: ${artDirection.mood}`,
      `- Dimensions: ${width}x${height} pixels`,
      `- Description: ${prompt}`,
    ];

    if (isSprite) {
      parts.push(
        '- IMPORTANT: Generate ONLY the subject with absolutely nothing else in the image',
        '- The subject must FILL the frame — draw it large, taking up most of the image area',
        '- The subject must be completely isolated on a solid magenta (#FF00FF) background',
        '- Do NOT include any ground, shadows, scene elements, environmental objects, or other characters',
        '- No decorative borders, frames, or vignettes',
        '- Clean edges on the subject suitable for use as a game sprite',
      );
    } else if (category === 'background') {
      parts.push(
        '- This is a BACKGROUND ONLY — distant scenery, sky, environment atmosphere',
        '- Do NOT include any game characters, players, enemies, platforms, collectibles, or interactive game elements',
        '- Do NOT draw any platforms, ground tiles, or surfaces that look like they could be stood on',
        '- The background should be purely decorative environment art (sky, distant mountains, trees, clouds, etc.)',
        '- Fill the entire canvas edge-to-edge with no borders or margins',
      );
    } else {
      // platform, other
      parts.push(
        '- This is a tileable surface texture that fills the entire canvas',
        '- Do NOT include any characters, enemies, collectibles, or other game entities',
        '- Game-ready asset with clean edges suitable for tiling or stretching',
      );
    }

    if (artDirection.notes) {
      parts.push(`- Additional notes: ${artDirection.notes}`);
    }

    if (this.styleAnchorBase64) {
      parts.push(
        '- Match the visual style of the reference image provided',
      );
    }

    return parts.join('\n');
  }

  /**
   * Builds the `contents` parameter for the Gemini API call.
   *
   * @remarks
   * When a style anchor is set, the contents include the reference image
   * as an inline data part alongside the text prompt.
   *
   * @param prompt - The text prompt for image generation.
   * @returns Contents suitable for `ai.models.generateContent()`.
   */
  private buildContents(prompt: string): string | Array<{ role: string; parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> }> {
    if (!this.styleAnchorBase64) {
      return prompt;
    }

    // Include the style anchor image as a reference
    return [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: 'image/png',
              data: this.styleAnchorBase64,
            },
          },
          { text: prompt },
        ],
      },
    ];
  }

  /**
   * Extracts the PNG image buffer from a Gemini API response.
   *
   * @param response - The generateContent response from Gemini.
   * @returns A Buffer containing the PNG image data.
   * @throws If the response contains no image data.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractImage(response: any): Buffer {
    const candidates = response.candidates;
    if (!candidates || candidates.length === 0) {
      throw new Error('Gemini returned no candidates');
    }

    const parts = candidates[0].content?.parts;
    if (!parts) {
      throw new Error('Gemini returned no content parts');
    }

    for (const part of parts) {
      if (part.inlineData?.data) {
        return Buffer.from(part.inlineData.data, 'base64');
      }
    }

    throw new Error('Gemini returned no image data in response');
  }

  /**
   * Removes a solid-colour background from a PNG image by sampling corner
   * pixels. If at least 3 of the 4 corners share the same colour (within
   * {@link BG_COLOR_TOLERANCE}), that colour is made fully transparent.
   *
   * @remarks
   * Google Gemini often ignores transparent-background requests and returns
   * sprites on a solid white, grey, or magenta background. This method
   * detects such backgrounds and replaces them with transparency so the
   * sprite can be composited correctly in the game.
   *
   * @param imageBuffer - Raw PNG buffer from Gemini.
   * @returns A PNG buffer with the background colour made transparent,
   *          or the original buffer if no uniform background was detected.
   */
  private async removeBackground(imageBuffer: Buffer): Promise<Buffer> {
    const image = sharp(imageBuffer).ensureAlpha();
    const { width, height } = await image.metadata();

    if (!width || !height) {
      return imageBuffer;
    }

    // Extract raw RGBA pixel data
    const { data } = await image.raw().toBuffer({ resolveWithObject: true });

    // Sample the 4 corner pixels (RGBA)
    const pixelAt = (x: number, y: number) => {
      const offset = (y * width + x) * 4;
      return {
        r: data[offset],
        g: data[offset + 1],
        b: data[offset + 2],
        a: data[offset + 3],
      };
    };

    const corners = [
      pixelAt(0, 0),
      pixelAt(width - 1, 0),
      pixelAt(0, height - 1),
      pixelAt(width - 1, height - 1),
    ];

    // Check if colours are within tolerance
    const colorsMatch = (
      a: { r: number; g: number; b: number },
      b: { r: number; g: number; b: number },
    ) =>
      Math.abs(a.r - b.r) <= BG_COLOR_TOLERANCE &&
      Math.abs(a.g - b.g) <= BG_COLOR_TOLERANCE &&
      Math.abs(a.b - b.b) <= BG_COLOR_TOLERANCE;

    // Find the most common corner colour — count matches for each corner
    let bestRef = corners[0];
    let bestCount = 0;
    for (const ref of corners) {
      const count = corners.filter((c) => colorsMatch(c, ref)).length;
      if (count > bestCount) {
        bestCount = count;
        bestRef = ref;
      }
    }

    // Need at least 3 of 4 corners matching to consider it a background
    if (bestCount < 3) {
      return imageBuffer;
    }

    // Replace every pixel matching the background colour with transparent
    const bgColor = { r: bestRef.r, g: bestRef.g, b: bestRef.b };
    for (let i = 0; i < data.length; i += 4) {
      const pixel = { r: data[i], g: data[i + 1], b: data[i + 2] };
      if (colorsMatch(pixel, bgColor)) {
        data[i + 3] = 0; // Set alpha to 0 (transparent)
      }
    }

    return sharp(data, { raw: { width, height, channels: 4 } })
      .png()
      .toBuffer();
  }

  /**
   * Resizes an image buffer to the target dimensions.
   *
   * @remarks
   * - `contain` — fits within the bounding box, transparent padding. Used for
   *   sprites so the subject isn't cropped.
   * - `cover` — scales to fill the bounding box, cropping overflow. Used for
   *   backgrounds and platforms so there are no transparent bars.
   *
   * @param imageBuffer - The PNG buffer to resize.
   * @param width - Target width in pixels.
   * @param height - Target height in pixels.
   * @param fit - Sharp fit strategy: 'contain' for sprites, 'cover' for backgrounds.
   * @returns A Buffer containing the resized PNG image.
   */
  private async resizeImage(
    imageBuffer: Buffer,
    width: number,
    height: number,
    fit: 'contain' | 'cover' = 'contain',
  ): Promise<Buffer> {
    return sharp(imageBuffer)
      .resize(width, height, {
        fit,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
  }

  /** Waits for the specified number of milliseconds. */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
