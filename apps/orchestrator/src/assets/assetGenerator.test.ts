import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import sharp from 'sharp';
import { AssetGenerator } from './assetGenerator.js';
import type { AssetGenerationRequest, AssetProgressCallback } from './assetGenerator.js';
import type { ArtDirection } from '@robcost/shared-types';

// ────────────────────────────────────────────────────────────────
// Mock @google/genai
// ────────────────────────────────────────────────────────────────

const mockGenerateContent = vi.hoisted(() => vi.fn());

vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: class {
      models = { generateContent: mockGenerateContent };
    },
  };
});

// ────────────────────────────────────────────────────────────────
// Test helpers
// ────────────────────────────────────────────────────────────────

/** 1x1 transparent PNG as base64 (smallest valid PNG). */
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const DEFAULT_ART_DIRECTION: ArtDirection = {
  style: 'pixel-art-16bit',
  palette: ['#2d1b00', '#8b4513', '#daa520'],
  mood: 'adventurous',
};

function makeRequest(overrides?: Partial<AssetGenerationRequest>): AssetGenerationRequest {
  return {
    prompt: 'a knight in silver armor',
    key: 'player',
    width: 64,
    height: 64,
    category: 'character',
    artDirection: DEFAULT_ART_DIRECTION,
    ...overrides,
  };
}

/** Creates a mock Gemini response with an image part. */
function mockImageResponse(base64 = TINY_PNG_BASE64) {
  return {
    candidates: [
      {
        content: {
          parts: [
            { text: 'Here is your game asset.' },
            {
              inlineData: {
                data: base64,
                mimeType: 'image/png',
              },
            },
          ],
        },
      },
    ],
  };
}

/** Creates a mock Gemini response with text only (no image). */
function mockTextOnlyResponse() {
  return {
    candidates: [
      {
        content: {
          parts: [{ text: 'I cannot generate that image.' }],
        },
      },
    ],
  };
}

/** Creates a mock Gemini response with no candidates. */
function mockEmptyResponse() {
  return { candidates: [] };
}

// ────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────

describe('AssetGenerator', () => {
  let tmpDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gameforge-assets-'));
    mockGenerateContent.mockResolvedValue(mockImageResponse());
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('constructor', () => {
    it('creates an AssetGenerator without throwing', () => {
      const generator = new AssetGenerator('test-api-key');
      expect(generator).toBeInstanceOf(AssetGenerator);
    });
  });

  describe('generateAsset', () => {
    it('calls Gemini with correct model and responseModalities', async () => {
      const generator = new AssetGenerator('key', 'gemini-2.5-flash-image');
      await generator.generateAsset(makeRequest(), tmpDir);

      expect(mockGenerateContent).toHaveBeenCalledOnce();
      const call = mockGenerateContent.mock.calls[0][0];
      expect(call.model).toBe('gemini-2.5-flash-image');
      expect(call.config.responseModalities).toEqual(['TEXT', 'IMAGE']);
    });

    it('creates the public/assets directory if it does not exist', async () => {
      const generator = new AssetGenerator('key');
      await generator.generateAsset(makeRequest(), tmpDir);

      const assetsDir = path.join(tmpDir, 'public', 'assets');
      expect(fs.existsSync(assetsDir)).toBe(true);
    });

    it('writes a correctly-sized PNG file to public/assets/{key}.png', async () => {
      const generator = new AssetGenerator('key');
      const result = await generator.generateAsset(makeRequest({ key: 'hero', width: 64, height: 64 }), tmpDir);

      const expectedPath = path.join(tmpDir, 'public', 'assets', 'hero.png');
      expect(result.filePath).toBe(expectedPath);
      expect(fs.existsSync(expectedPath)).toBe(true);

      // Verify the file is a valid PNG with correct dimensions
      const metadata = await sharp(expectedPath).metadata();
      expect(metadata.format).toBe('png');
      expect(metadata.width).toBe(64);
      expect(metadata.height).toBe(64);
    });

    it('returns a correct AssetReference', async () => {
      const generator = new AssetGenerator('key');
      const result = await generator.generateAsset(
        makeRequest({
          key: 'goblin',
          width: 48,
          height: 48,
          category: 'enemy',
          prompt: 'a green goblin',
        }),
        tmpDir,
      );

      expect(result.asset).toEqual({
        key: 'goblin',
        filename: 'goblin.png',
        width: 48,
        height: 48,
        description: 'a green goblin',
        category: 'enemy',
      });
    });

    it('returns the configured cost per image', async () => {
      const generator = new AssetGenerator('key', undefined, 0.05);
      const result = await generator.generateAsset(makeRequest(), tmpDir);
      expect(result.costUsd).toBe(0.05);
    });

    it('uses default cost when none specified', async () => {
      const generator = new AssetGenerator('key');
      const result = await generator.generateAsset(makeRequest(), tmpDir);
      expect(result.costUsd).toBe(0.039);
    });

    it('throws when Gemini returns no candidates', async () => {
      mockGenerateContent.mockResolvedValueOnce(mockEmptyResponse());
      const generator = new AssetGenerator('key');

      await expect(
        generator.generateAsset(makeRequest(), tmpDir),
      ).rejects.toThrow('Gemini returned no candidates');
    });

    it('throws when Gemini returns text-only response (no image)', async () => {
      mockGenerateContent.mockResolvedValueOnce(mockTextOnlyResponse());
      const generator = new AssetGenerator('key');

      await expect(
        generator.generateAsset(makeRequest(), tmpDir),
      ).rejects.toThrow('Gemini returned no image data in response');
    });

    it('throws when Gemini API rejects', async () => {
      mockGenerateContent.mockRejectedValueOnce(new Error('Rate limit exceeded'));
      const generator = new AssetGenerator('key');

      await expect(
        generator.generateAsset(makeRequest(), tmpDir),
      ).rejects.toThrow('Rate limit exceeded');
    });
  });

  describe('image processing pipeline', () => {
    it('resizes oversized Gemini output to requested dimensions', async () => {
      // Create a 256x256 red PNG to simulate oversized Gemini output
      const oversizedPng = await sharp({
        create: { width: 256, height: 256, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 255 } },
      }).png().toBuffer();

      mockGenerateContent.mockResolvedValueOnce(
        mockImageResponse(oversizedPng.toString('base64')),
      );

      const generator = new AssetGenerator('key');
      const result = await generator.generateAsset(
        makeRequest({ key: 'resized', width: 64, height: 64 }),
        tmpDir,
      );

      const metadata = await sharp(result.filePath).metadata();
      expect(metadata.width).toBe(64);
      expect(metadata.height).toBe(64);
    });

    it('preserves aspect ratio with transparent padding for non-square source', async () => {
      // Create a 200x100 (2:1) wide image, request 64x64
      const widePng = await sharp({
        create: { width: 200, height: 100, channels: 4, background: { r: 0, g: 255, b: 0, alpha: 255 } },
      }).png().toBuffer();

      mockGenerateContent.mockResolvedValueOnce(
        mockImageResponse(widePng.toString('base64')),
      );

      const generator = new AssetGenerator('key');
      const result = await generator.generateAsset(
        makeRequest({ key: 'padded', width: 64, height: 64 }),
        tmpDir,
      );

      const metadata = await sharp(result.filePath).metadata();
      expect(metadata.width).toBe(64);
      expect(metadata.height).toBe(64);
      expect(metadata.format).toBe('png');
      expect(metadata.hasAlpha).toBe(true);
    });

    it('handles undersized source images (upscale case)', async () => {
      const smallPng = await sharp({
        create: { width: 16, height: 16, channels: 4, background: { r: 0, g: 0, b: 255, alpha: 255 } },
      }).png().toBuffer();

      mockGenerateContent.mockResolvedValueOnce(
        mockImageResponse(smallPng.toString('base64')),
      );

      const generator = new AssetGenerator('key');
      const result = await generator.generateAsset(
        makeRequest({ key: 'upscaled', width: 64, height: 64 }),
        tmpDir,
      );

      const metadata = await sharp(result.filePath).metadata();
      expect(metadata.width).toBe(64);
      expect(metadata.height).toBe(64);
    });

    it('removes uniform background colour for sprite categories', async () => {
      // Create a 100x100 image: white background with a red centre block
      const size = 100;
      const buf = Buffer.alloc(size * size * 4);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const offset = (y * size + x) * 4;
          const isCentre = x >= 30 && x < 70 && y >= 30 && y < 70;
          buf[offset] = isCentre ? 255 : 255;     // R
          buf[offset + 1] = isCentre ? 0 : 255;   // G
          buf[offset + 2] = isCentre ? 0 : 255;   // B
          buf[offset + 3] = 255;                    // A
        }
      }
      const whiteBgPng = await sharp(buf, { raw: { width: size, height: size, channels: 4 } })
        .png()
        .toBuffer();

      mockGenerateContent.mockResolvedValueOnce(
        mockImageResponse(whiteBgPng.toString('base64')),
      );

      const generator = new AssetGenerator('key');
      const result = await generator.generateAsset(
        makeRequest({ key: 'sprite', width: 64, height: 64, category: 'character' }),
        tmpDir,
      );

      // The output should have transparency (background removed)
      const { data, info } = await sharp(result.filePath)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      // Check a corner pixel (was white background) is now transparent
      expect(data[3]).toBe(0); // First pixel alpha = 0 (transparent)
    });

    it('skips background removal for background category assets', async () => {
      // Create a solid white 100x100 image (all corners match) and request same size
      const whitePng = await sharp({
        create: { width: 100, height: 100, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 255 } },
      }).png().toBuffer();

      mockGenerateContent.mockResolvedValueOnce(
        mockImageResponse(whitePng.toString('base64')),
      );

      const generator = new AssetGenerator('key');
      const result = await generator.generateAsset(
        makeRequest({ key: 'bg', width: 100, height: 100, category: 'background' }),
        tmpDir,
      );

      // Background category: no background removal, so white pixels should remain opaque
      const { data } = await sharp(result.filePath)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      // First pixel alpha should be 255 (fully opaque — not removed)
      expect(data[3]).toBe(255);
    });

    it('uses cover fit for backgrounds so there are no transparent bars', async () => {
      // Create a 100x100 square image, request 200x100 (wide viewport)
      // With 'cover', the image crops to fill — no transparent padding
      const squarePng = await sharp({
        create: { width: 100, height: 100, channels: 4, background: { r: 100, g: 150, b: 200, alpha: 255 } },
      }).png().toBuffer();

      mockGenerateContent.mockResolvedValueOnce(
        mockImageResponse(squarePng.toString('base64')),
      );

      const generator = new AssetGenerator('key');
      const result = await generator.generateAsset(
        makeRequest({ key: 'bg-wide', width: 200, height: 100, category: 'background' }),
        tmpDir,
      );

      const metadata = await sharp(result.filePath).metadata();
      expect(metadata.width).toBe(200);
      expect(metadata.height).toBe(100);

      // With 'cover', all pixels should be opaque (no transparent padding bars)
      const { data } = await sharp(result.filePath)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      // Check corner pixels are opaque (not transparent padding)
      expect(data[3]).toBe(255); // Top-left alpha
      const lastPixelAlpha = data[(200 * 100 - 1) * 4 + 3];
      expect(lastPixelAlpha).toBe(255); // Bottom-right alpha
    });

    it('does not remove background when corners are not uniform', async () => {
      // Create a 100x100 image where each corner is a different colour
      const size = 100;
      const buf = Buffer.alloc(size * size * 4, 128); // Grey fill
      // Set alpha to 255 everywhere
      for (let i = 3; i < buf.length; i += 4) buf[i] = 255;
      // Top-left corner: red
      buf[0] = 255; buf[1] = 0; buf[2] = 0;
      // Top-right corner: green
      const trOffset = (size - 1) * 4;
      buf[trOffset] = 0; buf[trOffset + 1] = 255; buf[trOffset + 2] = 0;
      // Bottom-left corner: blue
      const blOffset = ((size - 1) * size) * 4;
      buf[blOffset] = 0; buf[blOffset + 1] = 0; buf[blOffset + 2] = 255;
      // Bottom-right corner: yellow
      const brOffset = ((size - 1) * size + (size - 1)) * 4;
      buf[brOffset] = 255; buf[brOffset + 1] = 255; buf[brOffset + 2] = 0;

      const variedPng = await sharp(buf, { raw: { width: size, height: size, channels: 4 } })
        .png()
        .toBuffer();

      mockGenerateContent.mockResolvedValueOnce(
        mockImageResponse(variedPng.toString('base64')),
      );

      const generator = new AssetGenerator('key');
      const result = await generator.generateAsset(
        makeRequest({ key: 'noremove', width: 64, height: 64, category: 'character' }),
        tmpDir,
      );

      // Corners are different, so background removal should not activate
      // Check that the image still has opaque pixels
      const { data } = await sharp(result.filePath)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      // The image should still have opaque pixels (alpha = 255)
      expect(data[3]).toBe(255);
    });
  });

  describe('buildPrompt', () => {
    it('includes style, palette, mood, and dimensions', () => {
      const generator = new AssetGenerator('key');
      const prompt = generator.buildPrompt(makeRequest());

      expect(prompt).toContain('pixel-art-16bit');
      expect(prompt).toContain('#2d1b00, #8b4513, #daa520');
      expect(prompt).toContain('adventurous');
      expect(prompt).toContain('64x64');
      expect(prompt).toContain('a knight in silver armor');
    });

    it('includes the asset category', () => {
      const generator = new AssetGenerator('key');
      const prompt = generator.buildPrompt(makeRequest({ category: 'background' }));

      expect(prompt).toContain('background');
    });

    it('includes art direction notes when present', () => {
      const generator = new AssetGenerator('key');
      const prompt = generator.buildPrompt(
        makeRequest({
          artDirection: {
            ...DEFAULT_ART_DIRECTION,
            notes: 'Use dithering for shadows',
          },
        }),
      );

      expect(prompt).toContain('Use dithering for shadows');
    });

    it('handles palette as a string', () => {
      const generator = new AssetGenerator('key');
      const prompt = generator.buildPrompt(
        makeRequest({
          artDirection: {
            ...DEFAULT_ART_DIRECTION,
            palette: 'warm earth tones',
          },
        }),
      );

      expect(prompt).toContain('warm earth tones');
    });

    it('mentions style anchor reference when set', () => {
      const generator = new AssetGenerator('key');

      // Write a temporary image to use as style anchor
      const anchorPath = path.join(tmpDir, 'anchor.png');
      fs.writeFileSync(anchorPath, Buffer.from(TINY_PNG_BASE64, 'base64'));
      generator.setStyleAnchor(anchorPath);

      const prompt = generator.buildPrompt(makeRequest());
      expect(prompt).toContain('reference image');
    });

    it('does not mention style anchor when not set', () => {
      const generator = new AssetGenerator('key');
      const prompt = generator.buildPrompt(makeRequest());
      expect(prompt).not.toContain('reference image');
    });

    it('includes isolation instructions for sprite categories', () => {
      const generator = new AssetGenerator('key');
      const prompt = generator.buildPrompt(makeRequest({ category: 'character' }));

      expect(prompt).toContain('ONLY the subject');
      expect(prompt).toContain('magenta');
      expect(prompt).toContain('Do NOT include any ground');
    });

    it('uses background-specific language for background category', () => {
      const generator = new AssetGenerator('key');
      const prompt = generator.buildPrompt(makeRequest({ category: 'background' }));

      expect(prompt).toContain('BACKGROUND ONLY');
      expect(prompt).toContain('Do NOT include any game characters');
      expect(prompt).not.toContain('ONLY the subject');
    });

    it('uses tileable surface language for platform category', () => {
      const generator = new AssetGenerator('key');
      const prompt = generator.buildPrompt(makeRequest({ category: 'platform' }));

      expect(prompt).toContain('tileable surface texture');
      expect(prompt).not.toContain('ONLY the subject');
    });

    it('includes fill-the-frame instruction for sprite categories', () => {
      const generator = new AssetGenerator('key');
      const prompt = generator.buildPrompt(makeRequest({ category: 'enemy' }));

      expect(prompt).toContain('FILL the frame');
    });
  });

  describe('setStyleAnchor', () => {
    it('reads the image file and stores it as base64', () => {
      const generator = new AssetGenerator('key');
      const anchorPath = path.join(tmpDir, 'style.png');
      fs.writeFileSync(anchorPath, Buffer.from(TINY_PNG_BASE64, 'base64'));

      generator.setStyleAnchor(anchorPath);

      // Subsequent generateAsset call should include the style anchor
      // We verify by checking that the contents sent to Gemini include inlineData
      // This is tested indirectly through the buildContents path
    });

    it('includes the style anchor in subsequent API calls', async () => {
      const generator = new AssetGenerator('key');
      const anchorPath = path.join(tmpDir, 'style.png');
      fs.writeFileSync(anchorPath, Buffer.from(TINY_PNG_BASE64, 'base64'));

      generator.setStyleAnchor(anchorPath);
      await generator.generateAsset(makeRequest(), tmpDir);

      const call = mockGenerateContent.mock.calls[0][0];
      // When style anchor is set, contents should be an array with inline data
      expect(Array.isArray(call.contents)).toBe(true);
      expect(call.contents[0].parts[0].inlineData).toBeDefined();
      expect(call.contents[0].parts[0].inlineData.mimeType).toBe('image/png');
      expect(call.contents[0].parts[0].inlineData.data).toBe(TINY_PNG_BASE64);
    });

    it('sends plain text contents when no style anchor is set', async () => {
      const generator = new AssetGenerator('key');
      await generator.generateAsset(makeRequest(), tmpDir);

      const call = mockGenerateContent.mock.calls[0][0];
      expect(typeof call.contents).toBe('string');
    });
  });

  describe('clearStyleAnchor', () => {
    it('removes the style anchor so subsequent calls use plain text', async () => {
      const generator = new AssetGenerator('key');
      const anchorPath = path.join(tmpDir, 'style.png');
      fs.writeFileSync(anchorPath, Buffer.from(TINY_PNG_BASE64, 'base64'));

      generator.setStyleAnchor(anchorPath);
      generator.clearStyleAnchor();

      await generator.generateAsset(makeRequest(), tmpDir);

      const call = mockGenerateContent.mock.calls[0][0];
      expect(typeof call.contents).toBe('string');
    });
  });

  describe('generateBatch', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    /** Runs a batch call while advancing fake timers so rate-limit delays resolve. */
    async function runBatchWithTimers<T>(batchPromise: Promise<T>): Promise<T> {
      // Advance timers in a loop until the batch promise resolves.
      // Each iteration advances past one rate-limit delay (6s).
      let resolved = false;
      let result!: T;
      const awaiter = batchPromise.then((r) => {
        resolved = true;
        result = r;
      });

      while (!resolved) {
        await vi.advanceTimersByTimeAsync(7_000);
      }

      await awaiter;
      return result;
    }

    it('generates multiple assets sequentially', async () => {
      const generator = new AssetGenerator('key');
      const requests = [
        makeRequest({ key: 'player' }),
        makeRequest({ key: 'enemy', category: 'enemy' }),
        makeRequest({ key: 'coin', category: 'collectible' }),
      ];

      const results = await runBatchWithTimers(
        generator.generateBatch(requests, tmpDir),
      );

      expect(results).toHaveLength(3);
      expect(results[0].asset.key).toBe('player');
      expect(results[1].asset.key).toBe('enemy');
      expect(results[2].asset.key).toBe('coin');
      expect(mockGenerateContent).toHaveBeenCalledTimes(3);
    });

    it('sets the first asset as style anchor for subsequent calls', async () => {
      const generator = new AssetGenerator('key');
      const requests = [
        makeRequest({ key: 'player' }),
        makeRequest({ key: 'enemy' }),
      ];

      await runBatchWithTimers(generator.generateBatch(requests, tmpDir));

      // First call should be plain text (no style anchor yet)
      const firstCall = mockGenerateContent.mock.calls[0][0];
      expect(typeof firstCall.contents).toBe('string');

      // Second call should include inline data (style anchor set from first)
      const secondCall = mockGenerateContent.mock.calls[1][0];
      expect(Array.isArray(secondCall.contents)).toBe(true);
    });

    it('fires progress callbacks for each asset', async () => {
      const generator = new AssetGenerator('key');
      const onProgress = vi.fn();
      const requests = [
        makeRequest({ key: 'player' }),
        makeRequest({ key: 'enemy' }),
      ];

      await runBatchWithTimers(
        generator.generateBatch(requests, tmpDir, onProgress),
      );

      // Each asset fires 'generating' then 'completed'
      expect(onProgress).toHaveBeenCalledTimes(4);
      expect(onProgress).toHaveBeenCalledWith('player', 'generating');
      expect(onProgress).toHaveBeenCalledWith(
        'player',
        'completed',
        expect.objectContaining({ asset: expect.objectContaining({ key: 'player' }) }),
      );
      expect(onProgress).toHaveBeenCalledWith('enemy', 'generating');
      expect(onProgress).toHaveBeenCalledWith(
        'enemy',
        'completed',
        expect.objectContaining({ asset: expect.objectContaining({ key: 'enemy' }) }),
      );
    });

    it('reports failed assets via progress callback and continues', async () => {
      // First call succeeds, second fails, third succeeds
      mockGenerateContent
        .mockResolvedValueOnce(mockImageResponse())
        .mockRejectedValueOnce(new Error('Safety filter'))
        .mockResolvedValueOnce(mockImageResponse());

      const generator = new AssetGenerator('key');
      const onProgress = vi.fn();
      const requests = [
        makeRequest({ key: 'player' }),
        makeRequest({ key: 'badword' }),
        makeRequest({ key: 'coin' }),
      ];

      const results = await runBatchWithTimers(
        generator.generateBatch(requests, tmpDir, onProgress),
      );

      // Only 2 successful results
      expect(results).toHaveLength(2);
      expect(results[0].asset.key).toBe('player');
      expect(results[1].asset.key).toBe('coin');

      // Failed asset reported via callback
      expect(onProgress).toHaveBeenCalledWith('badword', 'generating');
      expect(onProgress).toHaveBeenCalledWith('badword', 'failed');
    });

    it('handles empty requests array', async () => {
      const generator = new AssetGenerator('key');
      const results = await generator.generateBatch([], tmpDir);

      expect(results).toEqual([]);
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it('writes all assets to the same output directory', async () => {
      const generator = new AssetGenerator('key');
      const requests = [
        makeRequest({ key: 'a' }),
        makeRequest({ key: 'b' }),
      ];

      await runBatchWithTimers(generator.generateBatch(requests, tmpDir));

      const assetsDir = path.join(tmpDir, 'public', 'assets');
      expect(fs.existsSync(path.join(assetsDir, 'a.png'))).toBe(true);
      expect(fs.existsSync(path.join(assetsDir, 'b.png'))).toBe(true);
    });
  });
});
