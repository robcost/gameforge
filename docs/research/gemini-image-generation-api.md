# Google Gemini Image & Video Generation API Research

**Date:** 2026-02-25
**Status:** Current as of February 2026
**Purpose:** Technical reference for integrating AI image/video generation into GameForge

---

## Table of Contents

1. [Image Generation Models Overview](#1-image-generation-models-overview)
2. [SDK & Authentication](#2-sdk--authentication)
3. [API Usage - Image Generation](#3-api-usage---image-generation)
4. [Image Generation Capabilities for Game Assets](#4-image-generation-capabilities-for-game-assets)
5. [Style Consistency & Reference Images](#5-style-consistency--reference-images)
6. [Veo 3 Video Generation](#6-veo-3-video-generation)
7. [Pricing](#7-pricing)
8. [Rate Limits](#8-rate-limits)
9. [Integration Approach for GameForge](#9-integration-approach-for-gameforge)

---

## 1. Image Generation Models Overview

Google offers three distinct image generation pathways through the Gemini API:

### Nano Banana (Gemini 2.5 Flash Image)

- **Model ID:** `gemini-2.5-flash-image`
- **Codename:** Nano Banana
- **Strengths:** Fast, cost-effective, good for high-volume creative workflows
- **Capabilities:** Text-to-image, image editing, multi-image fusion, character consistency
- **Resolution:** Up to 1K (1024x1024), outputs 1290 tokens per image
- **Use case:** Rapid prototyping, iterative design, batch asset generation

### Nano Banana Pro (Gemini 3 Pro Image)

- **Model ID:** `gemini-3-pro-image-preview`
- **Codename:** Nano Banana Pro
- **Status:** Paid preview (GA since November 2025)
- **Strengths:** Studio-quality output, advanced reasoning, complex prompt understanding
- **Capabilities:** 4K generation, precise text rendering in images, up to 14 reference images, multi-turn conversational editing, grounded generation via Google Search
- **Resolution:** 1K, 2K, and 4K (up to 4096x4096)
- **Context:** 65K input tokens, 32K output tokens
- **Use case:** Professional asset production, complex compositions, brand-consistent assets

### Imagen 4

- **Model IDs:**
  - `imagen-4.0-generate-001` (standard)
  - `imagen-4.0-fast-generate-001` (fast)
  - `imagen-4.0-ultra-generate-001` (ultra quality)
- **Strengths:** Dedicated image generation model (not multimodal chat), highest fidelity
- **Capabilities:** Text-to-image only (no editing), up to 4 images per request, aspect ratio control
- **Resolution:** Up to 2K
- **Use case:** High-fidelity standalone image generation, batch production

### Model Comparison for Game Assets

| Feature | Nano Banana | Nano Banana Pro | Imagen 4 |
|---------|-------------|-----------------|----------|
| Speed | Fast | Moderate | Fast (Fast variant) |
| Max Resolution | 1K | 4K | 2K |
| Image Editing | Yes | Yes | No |
| Reference Images | Multi-image input | Up to 14 | No |
| Multi-turn Editing | Yes | Yes (with Thought Signatures) | No |
| Text in Images | Basic | Excellent | Good |
| Price per Image | ~$0.039 | $0.134 (1K/2K), $0.24 (4K) | $0.02-0.06 |
| Batch Generation | 1 at a time | 1 at a time | Up to 4 |

---

## 2. SDK & Authentication

### Package

```bash
npm install @google/genai
```

- **Package:** `@google/genai` (unified SDK, replaces older `@google/generative-ai`)
- **Latest version:** ~1.42.0 (as of Feb 2026)
- **GitHub:** https://github.com/googleapis/js-genai
- **Supports:** Both Google AI Studio (API key) and Vertex AI (service account)

### Authentication

```typescript
import { GoogleGenAI } from "@google/genai";

// Option 1: API Key (Google AI Studio) - simplest for development
const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY });

// Option 2: Vertex AI (enterprise, service account)
// Uses Application Default Credentials (ADC)
const ai = new GoogleGenAI({
  vertexai: true,
  project: "your-project-id",
  location: "us-central1",
});
```

### Getting an API Key

1. Go to https://aistudio.google.com/apikey
2. Create or select a Google Cloud project
3. Generate an API key
4. Store in `.env.local` as `GOOGLE_AI_API_KEY`

---

## 3. API Usage - Image Generation

### Gemini Native Image Generation (Nano Banana / Nano Banana Pro)

Uses `generateContent` -- the same chat/completion endpoint, with `responseModalities` including `"IMAGE"`.

```typescript
import { GoogleGenAI } from "@google/genai";
import * as fs from "node:fs";

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY });

// --- Text-to-Image Generation ---
async function generateImage(prompt: string, outputPath: string): Promise<void> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",  // or "gemini-3-pro-image-preview"
    contents: prompt,
    config: {
      responseModalities: ["TEXT", "IMAGE"],
      // For Nano Banana Pro, you can specify resolution:
      imageConfig: {
        aspectRatio: "1:1",    // "1:1", "16:9", "4:3", "3:4", "9:16"
        imageSize: "1K",       // "1K", "2K", "4K" (Pro only for 4K)
      },
    },
  });

  // Extract image from response parts
  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      const buffer = Buffer.from(part.inlineData.data, "base64");
      fs.writeFileSync(outputPath, buffer);
      console.log(`Image saved to ${outputPath}`);
    }
    if (part.text) {
      console.log("Model response:", part.text);
    }
  }
}

// --- Image-to-Image Editing ---
async function editImage(
  imagePath: string,
  editPrompt: string,
  outputPath: string
): Promise<void> {
  const imageData = fs.readFileSync(imagePath);
  const base64Image = imageData.toString("base64");

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: "image/png",
              data: base64Image,
            },
          },
          { text: editPrompt },
        ],
      },
    ],
    config: {
      responseModalities: ["TEXT", "IMAGE"],
    },
  });

  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      const buffer = Buffer.from(part.inlineData.data, "base64");
      fs.writeFileSync(outputPath, buffer);
    }
  }
}
```

### Imagen 4 (Dedicated Image Generation)

Uses `generateImages` -- a separate endpoint specifically for image generation.

```typescript
import { GoogleGenAI } from "@google/genai";
import * as fs from "node:fs";

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY });

async function generateWithImagen(prompt: string): Promise<Buffer[]> {
  const response = await ai.models.generateImages({
    model: "imagen-4.0-generate-001",  // or "imagen-4.0-fast-generate-001"
    prompt: prompt,
    config: {
      numberOfImages: 4,         // 1-4 images per request
      aspectRatio: "1:1",        // "1:1", "3:4", "4:3", "9:16", "16:9"
      imageSize: "1K",           // "1K" or "2K"
      personGeneration: "dont_allow",  // "dont_allow", "allow_adult", "allow_all"
      includeRaiReason: true,
    },
  });

  const images: Buffer[] = [];
  for (const generatedImage of response.generatedImages) {
    const buffer = Buffer.from(generatedImage.image.imageBytes, "base64");
    images.push(buffer);
  }
  return images;
}
```

### Key API Differences

| Feature | `generateContent` (Nano Banana) | `generateImages` (Imagen) |
|---------|--------------------------------|--------------------------|
| Method | `ai.models.generateContent()` | `ai.models.generateImages()` |
| Input | Text + images (multimodal) | Text prompt only |
| Output | Mixed text + image parts | Image bytes array |
| Editing | Yes (send image + edit prompt) | No |
| Multi-turn | Yes (conversation history) | No |
| Batch | 1 image per call | Up to 4 per call |

---

## 4. Image Generation Capabilities for Game Assets

### What It Can Generate

| Asset Type | Recommended Model | Quality | Notes |
|------------|------------------|---------|-------|
| Character sprites | Nano Banana Pro | Excellent | Use reference images for consistency |
| Sprite sheets | Nano Banana / Pro | Good | Request specific frame layouts |
| Backgrounds | Nano Banana Pro | Excellent | 4K support for high-res backgrounds |
| Tilesets | Nano Banana Pro | Good | Specify seamless tiling in prompt |
| UI elements | Imagen 4 | Good | Clean, isolated elements |
| Item icons | Imagen 4 Fast | Good | Fast batch generation |
| Pixel art | Nano Banana | Good | Specify "pixel art 16-bit" style |
| Concept art | Nano Banana Pro | Excellent | Best for complex scenes |

### Supported Output

- **Formats:** PNG (with transparency support), JPEG
- **Resolutions:**
  - Nano Banana: up to 1024x1024
  - Nano Banana Pro: up to 4096x4096 (1K, 2K, 4K)
  - Imagen 4: up to 2048x2048
- **Aspect ratios:** 1:1, 16:9, 9:16, 4:3, 3:4
- **No SVG support** -- all output is rasterized bitmap

### Prompt Engineering for Game Assets

```typescript
// Sprite generation prompt template
const spritePrompt = `Create a 2D game character sprite:
- Style: pixel art, 32x32 pixels, 16-bit color palette
- Character: a knight in silver armor with a blue cape
- Pose: idle standing, facing right
- Background: transparent (solid white)
- No anti-aliasing, clean pixel edges
- Game-ready asset, consistent proportions`;

// Tileset prompt template
const tilesetPrompt = `Create a seamless 2D game tileset:
- Style: top-down RPG, 16-bit pixel art
- Theme: forest floor with grass and dirt path
- Layout: 4x4 grid of 32x32 pixel tiles
- Each tile must connect seamlessly with adjacent tiles
- Consistent lighting from top-left
- Clean pixel edges, no gradients`;

// Background prompt template
const backgroundPrompt = `Create a 2D side-scrolling game background:
- Style: hand-painted watercolor, parallax-ready
- Scene: enchanted forest with glowing mushrooms
- Aspect ratio: 16:9
- Color palette: deep greens, purples, soft blue light
- No characters or UI elements
- Suitable for layered parallax scrolling`;
```

---

## 5. Style Consistency & Reference Images

### Nano Banana Pro Reference Image System

Gemini 3 Pro Image supports up to **14 reference images** in a single request:
- Up to **6 high-fidelity object** reference images
- Up to **5 human subject** reference images
- Remaining slots for general style/scene references

```typescript
// Multi-reference image generation for style consistency
async function generateConsistentAsset(
  referenceImages: { path: string; mimeType: string }[],
  prompt: string
): Promise<Buffer> {
  const parts: any[] = [];

  // Add reference images
  for (const ref of referenceImages) {
    const imageData = fs.readFileSync(ref.path);
    parts.push({
      inlineData: {
        mimeType: ref.mimeType,
        data: imageData.toString("base64"),
      },
    });
  }

  // Add the generation prompt
  parts.push({
    text: `Using the visual style and character design from the reference images above, ${prompt}`,
  });

  const response = await ai.models.generateContent({
    model: "gemini-3-pro-image-preview",
    contents: [{ role: "user", parts }],
    config: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: {
        aspectRatio: "1:1",
        imageSize: "2K",
      },
    },
  });

  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      return Buffer.from(part.inlineData.data, "base64");
    }
  }
  throw new Error("No image generated");
}
```

### Style Consistency Techniques

1. **Reference images:** Provide 1-5 existing assets as style references in each generation call
2. **Multi-turn conversation:** Use the same chat session to maintain context via Thought Signatures
3. **Detailed style prompts:** Include explicit style descriptors in every prompt
4. **Seed management:** Not directly exposed in API, but consistent prompts + reference images yield consistent results
5. **Iterative refinement:** Generate initial batch, pick best, use as reference for remaining assets

### Recommended Workflow for Game Asset Pipeline

```
1. Generate "style anchor" image with detailed prompt
2. Use style anchor as reference for all subsequent assets
3. Generate in batches by category (characters, environments, items)
4. Use multi-turn editing to refine individual assets
5. Maintain a style guide prompt prefix for all generations
```

---

## 6. Veo 3 Video Generation

### Models

| Model | ID | Status | Cost/sec |
|-------|-----|--------|----------|
| Veo 3 | `veo-3.0-generate-preview` | Paid Preview | $0.75/sec |
| Veo 3.1 | `veo-3.1-generate-preview` | Paid Preview | $0.40/sec |
| Veo 3.1 Fast | (variant) | Paid Preview | $0.15/sec |

### Capabilities

- **Resolution:** 720p, 1080p, 4K
- **Duration:** 4, 6, or 8 seconds per clip
- **Audio:** Native audio generation (dialogue, SFX, music) synchronized to video
- **Input:** Text prompt, optional first/last frame images, up to 3 reference images (Veo 3.1)
- **Aspect ratios:** 16:9 (default), 9:16

### TypeScript Usage

```typescript
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY });

async function generateVideo(prompt: string): Promise<string> {
  // Start generation (returns an operation to poll)
  let operation = await ai.models.generateVideos({
    model: "veo-3.1-generate-preview",
    prompt: prompt,
    config: {
      numberOfVideos: 1,
      aspectRatio: "16:9",
      resolution: "1080p",
      durationSeconds: 8,
      negativePrompt: "blurry, low quality, distorted",
    },
  });

  // Poll until complete (video generation takes time)
  while (!operation.done) {
    await new Promise((resolve) => setTimeout(resolve, 10000)); // 10s poll
    operation = await ai.operations.getVideosOperation({ operation });
  }

  // Get the video URI
  const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!videoUri) throw new Error("No video generated");
  return videoUri;
}
```

### Current Assessment for GameForge

- **Status:** Paid preview only, not GA
- **Readiness:** Usable for prototyping but expensive ($3.20 for an 8-sec clip at Veo 3.1 standard)
- **Game relevance:** Could generate trailer/cutscene content, not real-time game assets
- **Recommendation:** Monitor but defer integration until GA and prices stabilize. Focus on image generation for Circle 1.

---

## 7. Pricing

### Image Generation (per image)

| Model | Tier | 1K | 2K | 4K |
|-------|------|-----|-----|-----|
| Nano Banana (gemini-2.5-flash-image) | Standard | $0.039 | -- | -- |
| Nano Banana (gemini-2.5-flash-image) | Batch | $0.0195 | -- | -- |
| Nano Banana Pro (gemini-3-pro-image-preview) | Standard | $0.134 | $0.134 | $0.24 |
| Nano Banana Pro (gemini-3-pro-image-preview) | Batch | $0.067 | $0.067 | $0.12 |
| Imagen 4 Fast | Standard | $0.02 | -- | -- |
| Imagen 4 Standard | Standard | $0.04 | $0.04 | -- |
| Imagen 4 Ultra | Standard | $0.06 | $0.06 | -- |

### Video Generation (per second)

| Model | Cost per Second | 8-sec Video |
|-------|----------------|-------------|
| Veo 3 | $0.75 | $6.00 |
| Veo 3.1 | $0.40 | $3.20 |
| Veo 3.1 Fast | $0.15 | $1.20 |

### Free Tier

Image generation is **NOT available** on the free tier. A paid billing account is required for all image generation models.

### Cost Estimation for GameForge

For a typical game session generating ~20 assets:
- Using Nano Banana: 20 x $0.039 = **$0.78 per session**
- Using Nano Banana Pro (2K): 20 x $0.134 = **$2.68 per session**
- Using Imagen 4 Fast: 20 x $0.02 = **$0.40 per session**

---

## 8. Rate Limits

### By Tier

| Tier | Qualification | Image RPM | IPM (est.) |
|------|--------------|-----------|------------|
| Free | None | N/A | Image gen not available |
| Tier 1 | Paid billing | ~150 RPM | ~10 IPM |
| Tier 2 | >$250 spend, 30+ days | ~300 RPM | ~20 IPM |
| Tier 3 (Enterprise) | >$1,000 spend, 30+ days | Custom | ~100+ IPM |

### Important Notes

- **IPM (Images Per Minute)** is a separate quota dimension from RPM/TPM, specifically for image generation
- Rate limits are project-level and viewable in Google AI Studio
- December 2025 quota adjustments reduced some tiers -- watch for 429 errors
- Imagen 4 has separate IPM quotas from Nano Banana models
- Use batch API for large-scale generation at lower cost (50% discount)

### Tier Upgrade Path

1. **Tier 1:** Create paid billing account (automatic)
2. **Tier 2:** Spend >$250, wait 30 days after first successful payment
3. **Tier 3:** Spend >$1,000, wait 30 days after first successful payment

---

## 9. Integration Approach for GameForge

### Recommended Architecture

```
GameForge Orchestrator
  |
  +-- AssetGenerationService
  |     |
  |     +-- GoogleGenAI client (@google/genai)
  |     |
  |     +-- generateSprite(prompt, styleRef?)
  |     +-- generateBackground(prompt, styleRef?)
  |     +-- generateTileset(prompt, styleRef?)
  |     +-- editAsset(image, editPrompt)
  |     +-- generateWithImagen(prompt, count)
  |     |
  |     +-- StyleManager
  |           +-- styleAnchorImage: Buffer
  |           +-- stylePromptPrefix: string
  |           +-- referenceImages: Buffer[]
  |
  +-- Session asset storage (sessions/{id}/assets/)
```

### Recommended Model Strategy

| Use Case | Model | Rationale |
|----------|-------|-----------|
| Rapid prototyping / iteration | Nano Banana | Cheapest ($0.039), fastest |
| Final quality assets | Nano Banana Pro | Best quality, 4K, reference images |
| Batch icon/item generation | Imagen 4 Fast | $0.02/image, up to 4 per call |
| Style-consistent sets | Nano Banana Pro | 14 reference images, multi-turn |

### Environment Variables

```env
# .env.local
GOOGLE_AI_API_KEY=your-api-key-here
```

### Dependencies

```json
{
  "dependencies": {
    "@google/genai": "^1.42.0"
  }
}
```

### Key Technical Considerations

1. **No SVG output** -- all images are raster (PNG/JPEG). For vector assets, would need a separate pipeline.
2. **No seed control** -- cannot set explicit random seeds for reproducibility. Use reference images instead.
3. **SynthID watermarks** -- all generated images include invisible SynthID watermarks.
4. **Safety filters** -- may reject some game-related prompts (violence, weapons). Test early.
5. **Latency** -- Nano Banana: ~2-5 seconds, Nano Banana Pro: ~5-15 seconds, Imagen 4: ~2-8 seconds.
6. **No real-time generation** -- not suitable for runtime game asset generation, only build-time.

---

## Sources

- [Gemini API Models](https://ai.google.dev/gemini-api/docs/models)
- [Nano Banana Image Generation Docs](https://ai.google.dev/gemini-api/docs/image-generation)
- [Imagen API Docs](https://ai.google.dev/gemini-api/docs/imagen)
- [Gemini 3 Developer Guide](https://ai.google.dev/gemini-api/docs/gemini-3)
- [Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini API Rate Limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- [Veo 3 Video Generation Docs](https://ai.google.dev/gemini-api/docs/video)
- [@google/genai npm](https://www.npmjs.com/package/@google/genai)
- [@google/genai GitHub](https://github.com/googleapis/js-genai)
- [Gemini 2.5 Flash Image Announcement](https://developers.googleblog.com/introducing-gemini-2-5-flash-image/)
- [Nano Banana Pro Announcement](https://blog.google/technology/ai/nano-banana-pro/)
- [Veo 3 API Announcement](https://developers.googleblog.com/veo-3-now-available-gemini-api/)
- [Nano Banana Pro Game Assets Guide](https://help.apiyi.com/nano-banana-pro-game-assets-generation-en.html)
- [Sprite Sheet Generation with Gemini](https://lab.rosebud.ai/blog/how-to-create-a-sprite-sheet-with-ai-using-google-gemini-and-nano-banana-easy-guide)
