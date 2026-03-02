# Google Lyria RealTime - Music Generation API Research

**Date:** 2026-02-26
**Purpose:** Evaluate Google Lyria for integration into GameForge as a game music generation service
**Status:** Research Complete

---

## Executive Summary

Google Lyria RealTime is an **experimental** real-time streaming music generation model accessible through the Gemini API. It uses a **WebSocket connection** (not REST) to produce a continuous stream of instrumental music that can be steered in real-time via text prompts. It runs through the same `@google/genai` SDK already used for Gemini text/vision models. The model is currently **free to use** with no published pricing. Audio output is raw 16-bit PCM at 48kHz stereo, meaning conversion to game-friendly formats (OGG, MP3) would need to happen on our side.

**Key Takeaway for GameForge:** This is a real-time streaming API, not a "generate a 30-second clip" API. It produces an infinite audio stream that you steer. For game background music, we would need to: (1) stream audio for a set duration, (2) capture the raw PCM buffer, (3) encode it to a game-compatible format, and (4) serve it to the Phaser game. This is achievable but adds meaningful integration complexity compared to a simple request/response audio generation API.

---

## Technical Specifications

### Model Identity

| Property | Value |
|----------|-------|
| Model ID | `models/lyria-realtime-exp` |
| API Version | `v1alpha` |
| Connection Type | WebSocket (persistent, bidirectional, low-latency) |
| Status | Experimental |
| Last Updated | May 2025 |
| Control Latency | Max 2 seconds |

### Audio Output Format

| Property | Value |
|----------|-------|
| Format | Raw 16-bit PCM |
| Sample Rate | 48,000 Hz (stereo) |
| Channels | 2 (stereo) |
| Delivery | Base64-encoded chunks via WebSocket messages |
| Watermarking | All output is watermarked (SynthID) |
| Content Type | Instrumental only (no vocals in RealTime; Lyria 3 in Gemini app supports vocals) |

**Important:** The API does NOT return WAV, MP3, or OGG files. It streams raw PCM audio chunks. Each chunk is base64-encoded and delivered via the WebSocket `onmessage` callback. You must assemble and encode these yourself.

### Supported Audio Formats (Native)

- **Output:** Raw 16-bit PCM only
- **No native support for:** WAV, MP3, OGG, AAC
- **Conversion required:** Use ffmpeg, libopus, or a Node.js audio encoding library to convert PCM to game-friendly formats

---

## SDK Integration

### Package

```
npm install @google/genai
```

The music generation API is part of the **same** `@google/genai` SDK used for Gemini text models. No separate client needed.

### TypeScript/JavaScript Code Example

```typescript
import { GoogleGenAI } from "@google/genai";

const client = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  apiVersion: "v1alpha",  // Required - music API is alpha only
});

const session = await client.live.music.connect({
  model: "models/lyria-realtime-exp",
  callbacks: {
    onmessage: (message) => {
      if (message.serverContent?.audioChunks) {
        for (const chunk of message.serverContent.audioChunks) {
          // chunk.data is base64-encoded raw 16-bit PCM at 48kHz stereo
          const audioBuffer = Buffer.from(chunk.data, "base64");
          // Write to file, pipe to encoder, or buffer in memory
        }
      }
    },
    onerror: (error) => {
      console.error("Lyria error:", error);
    },
    onclose: () => {
      console.log("Session closed");
    },
  },
});

// Set musical direction
await session.setWeightedPrompts({
  prompts: [
    { text: "Ambient electronic with synth pads and gentle arpeggios", weight: 1.0 },
  ],
});

// Configure generation parameters
await session.setMusicGenerationConfig({
  config: {
    bpm: 120,
    temperature: 1.0,
    guidance: 4.0,
    brightness: 0.6,
    density: 0.4,
  },
});

// Start streaming
await session.play();

// Later: steer, pause, stop
await session.setWeightedPrompts({
  prompts: [
    { text: "Intense battle music with heavy drums and brass", weight: 1.0 },
  ],
});

// Stop when done
await session.stop();
```

### Session Lifecycle Methods

| Method | Description |
|--------|-------------|
| `session.play()` | Start music generation streaming |
| `session.pause()` | Pause the stream |
| `session.stop()` | Stop generation |
| `session.resetContext()` | Hard reset (required for BPM/scale changes) |
| `session.setWeightedPrompts()` | Update musical direction mid-stream |
| `session.setMusicGenerationConfig()` | Modify generation parameters |

---

## Configuration Parameters

### MusicGenerationConfig

| Parameter | Type | Range | Default | Notes |
|-----------|------|-------|---------|-------|
| `guidance` | float | 0.0 - 6.0 | 4.0 | How strictly to follow the prompt |
| `bpm` | int | 60 - 200 | Model choice | **Requires `resetContext()` to apply** |
| `density` | float | 0.0 - 1.0 | — | Sparse (0) to busy (1) |
| `brightness` | float | 0.0 - 1.0 | — | Dark (0) to bright (1) tonal quality |
| `scale` | Enum | See below | SCALE_UNSPECIFIED | **Requires `resetContext()` to apply** |
| `temperature` | float | 0.0 - 3.0 | 1.1 | Variation/randomness |
| `top_k` | int | 1 - 1000 | 40 | Sampling diversity |
| `seed` | int | 0 - 2,147,483,647 | Random | For reproducible output |
| `mute_bass` | bool | — | false | Mute bass instruments |
| `mute_drums` | bool | — | false | Mute drums |
| `only_bass_and_drums` | bool | — | false | Solo bass and drums |
| `music_generation_mode` | Enum | QUALITY, DIVERSITY, VOCALIZATION | QUALITY | Output focus mode |

### Scale Enum Values

All 12 chromatic keys as major/relative-minor pairs:
- `C_MAJOR_A_MINOR`, `D_FLAT_MAJOR_B_FLAT_MINOR`, `D_MAJOR_B_MINOR`
- `E_FLAT_MAJOR_C_MINOR`, `E_MAJOR_D_FLAT_MINOR`, `F_MAJOR_D_MINOR`
- `G_FLAT_MAJOR_E_FLAT_MINOR`, `G_MAJOR_E_MINOR`, `A_FLAT_MAJOR_F_MINOR`
- `A_MAJOR_G_FLAT_MINOR`, `B_FLAT_MAJOR_G_MINOR`, `B_MAJOR_A_FLAT_MINOR`
- `SCALE_UNSPECIFIED` (model decides)

### WeightedPrompt Format

```typescript
{ text: "description string", weight: 1.0 }
```

- Multiple prompts can be combined to blend musical influences
- Weight is any non-zero value; 1.0 recommended as baseline
- Prompts can be updated mid-stream for smooth transitions
- Drastic prompt changes cause abrupt transitions; use intermediate weights for cross-fading

---

## Prompt Capabilities

You can specify genre, mood, tempo, and instruments via natural language prompts. The documentation provides extensive keyword lists:

### Instruments (partial list)
303 Acid Bass, 808 Hip Hop Beat, Accordion, Alto Saxophone, Banjo, Cello, Clavichord, Djembe, Dulcimer, Flamenco Guitar, Funk Drums, Glockenspiel, Hang Drum, Harmonica, Harp, Harpsichord, Kalimba, Koto, Mandolin, Marimba, Mellotron, Moog Oscillations, Ocarina, Pipa, Ragtime Piano, Rhodes Piano, Shamisen, Sitar, Slide Guitar, Spacey Synths, Steel Drum, Synth Pads, Tabla, TR-909 Drum Machine, Trumpet, Vibraphone, Warm Acoustic Guitar, Woodwinds

### Genres (partial list)
Acid Jazz, Afrobeat, Baroque, Bluegrass, Blues Rock, Bossa Nova, Celtic Folk, Chiptune, Classic Rock, Contemporary R&B, Deep House, Disco Funk, Drum & Bass, Dubstep, EDM, Electro Swing, Funk Metal, Garage Rock, Grime, Hyperpop, Indian Classical, Indie Electronic, Indie Folk, Indie Pop, Jazz Fusion, Lo-Fi Hip Hop, Minimal Techno, Neo-Soul, Orchestral Score, Piano Ballad, Post-Punk, Psychedelic Rock, Psytrance, Reggae, Reggaeton, Salsa, Shoegaze, Ska, Surf Rock, Synthpop, Techno, Trance, Trap Beat, Trip Hop, Vaporwave

### Mood/Descriptors (partial list)
Ambient, Bright Tones, Chill, Crunchy Distortion, Danceable, Dreamy, Echo, Emotional, Ethereal Ambience, Experimental, Funky, Glitchy Effects, Lo-fi, Ominous Drone, Psychedelic, Rich Orchestration, Subdued Melody, Tight Groove, Unsettling, Upbeat, Virtuoso

---

## Rate Limits and Pricing

### Pricing

- **Currently free** during experimental phase
- No published pricing for Lyria RealTime on the Gemini API pricing page
- The pricing page lists Lyria in the navigation but has no pricing section for it
- Expect pricing to be introduced when the model exits experimental status

### Rate Limits

- **Not explicitly documented** for Lyria RealTime
- General Gemini API free tier: 5-15 RPM depending on model, up to 1,000 requests/day
- Since Lyria uses persistent WebSocket sessions (not request/response), standard RPM limits may apply to session creation rather than audio chunks
- Maximum session duration: Not documented
- **Recommendation:** Test empirically; expect conservative limits during experimental phase

### Duration Limits

- **No maximum duration documented** - the stream is conceptually infinite
- The model generates audio in ~2-second chunks continuously
- For game music, you would run the stream for your desired duration and stop

---

## Restrictions and Limitations

1. **Experimental status** - API surface may change without notice; `v1alpha` version required
2. **Instrumental only** - No vocal generation via RealTime API (Lyria 3 in Gemini app does vocals, but that is a different product)
3. **SynthID watermarking** - All output is watermarked; unclear if this affects audio quality perceptibly
4. **Raw PCM only** - No encoded format output; must convert to WAV/MP3/OGG yourself
5. **WebSocket only** - No REST endpoint for "generate clip and return"; must manage a streaming session
6. **BPM/Scale changes require `resetContext()`** - Causes a hard transition in the audio
7. **Safety filtering** - Prompts can be filtered; filtered prompts are silently ignored (with explanation in `filtered_prompt` field)
8. **No conversation/chat** - Unlike the Live API for Gemini text, this is music-only; no natural language Q&A
9. **2-second control latency** - Prompt changes take up to 2 seconds to take effect in the audio stream

---

## Quality Assessment (Community Feedback)

### Strengths
- High audio fidelity for an AI model
- Granular real-time control (BPM, scale, density, brightness, instrument muting)
- Good at pop, afrobeat, R&B, light hip-hop, electronic genres
- Professional musicians praised the creative control capabilities
- Coherent output that maintains rhythm and structure

### Weaknesses
- Struggles with specific or unusual genre requests
- Not yet competitive with Suno or Udio for full song generation (those are offline/batch models)
- Drastic prompt changes cause audible artifacts without careful cross-fading
- Experimental status means reliability is not guaranteed
- Launch-day reports of broken entry points and friction

### Verdict
Suitable for background game music generation where the prompt can be carefully crafted for common genres. Not suitable if you need precise, reproducible, professionally-mixed tracks. The real-time steering is a unique differentiator that could enable dynamic game soundtracks.

---

## Integration Architecture for GameForge

### Approach: "Generate and Capture" Pipeline

Since Lyria is a streaming API but games need finite audio files, the integration pattern would be:

```
1. Designer Agent crafts music prompt (genre, mood, tempo for the game)
2. Orchestrator opens Lyria WebSocket session
3. Stream runs for N seconds (e.g., 30-60 seconds for a looping track)
4. Raw PCM chunks accumulated in a Buffer
5. Convert PCM buffer to OGG/MP3 using ffmpeg or fluent-ffmpeg
6. Save encoded file to session's game assets directory
7. Phaser game loads the audio file normally
```

### Key Integration Decisions

| Decision | Recommendation | Rationale |
|----------|---------------|-----------|
| When to generate | During Developer Agent phase | Music is a game asset, generated alongside code |
| Audio format | OGG Vorbis | Best Phaser compatibility + compression |
| Track duration | 30-60 seconds, looped | Standard for game background music |
| Prompt source | Designer Agent output | Designer describes the game's mood/atmosphere |
| Fallback | Ship with default template music | Lyria is experimental; must handle failures gracefully |

### Dependencies Required

```json
{
  "@google/genai": "^1.42.0",
  "fluent-ffmpeg": "^2.1.0"
}
```

Plus system dependency: `ffmpeg` installed on the host machine for PCM-to-OGG conversion.

### Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| API goes offline / changes | High | Fallback to template music; abstract behind interface |
| Audio quality insufficient | Medium | Let user regenerate with different prompt; provide manual upload option |
| Rate limits too restrictive | Medium | Cache generated tracks; reuse across similar sessions |
| Watermarking audible | Low | Test empirically; SynthID is designed to be imperceptible |
| Pricing introduced | Medium | Budget for it; offer as premium feature if costs are high |
| WebSocket complexity | Medium | Robust error handling; timeout-based session management |

---

## Alternative: Vertex AI Lyria (Non-RealTime)

There is also a **non-streaming Lyria API on Vertex AI** that generates 30-second clips via a standard REST request (returns base64 WAV). This is a simpler integration pattern but requires a GCP project and Vertex AI setup rather than just a Gemini API key. The Vertex AI version may be more suitable for GameForge's "generate a music clip" use case since it is request/response rather than streaming.

**Vertex AI Lyria endpoint:** `POST https://{REGION}-aiplatform.googleapis.com/v1/projects/{PROJECT}/locations/{REGION}/publishers/google/models/lyria:predict`

This would be worth investigating as an alternative if the streaming complexity of Lyria RealTime proves excessive for our use case.

---

## Recommendation

**Feasibility: Yes, with caveats.**

Lyria RealTime can generate game-quality background music from text prompts, and it integrates through the same `@google/genai` SDK. However, the streaming WebSocket architecture adds complexity for a use case that really just needs "give me a 30-second music clip."

**Recommended next steps:**

1. **Prototype first** - Build a minimal Node.js script that connects to Lyria, streams for 30 seconds, captures PCM, and converts to OGG
2. **Evaluate the Vertex AI REST endpoint** as a simpler alternative for clip generation
3. **Test audio quality** across game-relevant genres (chiptune, orchestral score, ambient, action)
4. **Design the prompt pipeline** - how the Designer Agent's game description maps to Lyria music prompts
5. **Implement behind an abstraction** - `MusicGenerationService` interface so the provider can be swapped

This should be treated as a **Circle 2 feature** given the experimental status and integration complexity. For Circle 1, template/default music with an option for manual upload would be more reliable.
