/**
 * Google Lyria music generation service for game background music.
 *
 * @remarks
 * Wraps the {@link https://www.npmjs.com/package/@google/genai | @google/genai} SDK's
 * Lyria RealTime API to generate WAV background music tracks. The Musician agent
 * reads the GDD's music direction (genre, mood, tempo) and calls this service
 * to produce a loopable background track.
 *
 * The Lyria RealTime API streams raw 16-bit PCM audio at 48 kHz stereo via
 * WebSocket. This service accumulates PCM chunks for a configurable duration,
 * then wraps them in a standard WAV header and saves to the game's assets directory.
 *
 * @packageDocumentation
 */

import { GoogleGenAI } from '@google/genai';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { MusicDirection, AudioReference } from '@robcost/shared-types';

// ────────────────────────────────────────────────────────────────
// Configuration
// ────────────────────────────────────────────────────────────────

/** Default Lyria RealTime model. */
const DEFAULT_MODEL = 'models/lyria-realtime-exp';

/** Default stream duration in seconds. Override via `LYRIA_STREAM_DURATION` env var. */
const DEFAULT_STREAM_DURATION = 30;

/** Default per-track cost estimate in USD (currently free during experimental phase). */
const DEFAULT_COST_USD = 0;

/** Lyria output audio format: 48 kHz, 16-bit, stereo. */
const SAMPLE_RATE = 48_000;
const BITS_PER_SAMPLE = 16;
const NUM_CHANNELS = 2;

/** Default guidance value — controls how closely music follows prompts (0.0–6.0). */
const DEFAULT_GUIDANCE = 4.0;

// ────────────────────────────────────────────────────────────────
// Request / Result types
// ────────────────────────────────────────────────────────────────

/**
 * Request to generate a background music track.
 *
 * @remarks
 * Passed to {@link MusicGenerator.generateMusic} along with the project path
 * where the WAV file will be saved.
 */
export interface MusicGenerationRequest {
  /** Music direction from the GDD. */
  musicDirection: MusicDirection;
  /** Unique key for the audio asset (e.g. 'background-music'). */
  key: string;
}

/**
 * Result of a music generation request.
 *
 * @remarks
 * Returned by {@link MusicGenerator.generateMusic} on success.
 */
export interface MusicGenerationResult {
  /** Audio reference for the GDD manifest. */
  audio: AudioReference;
  /** Absolute filesystem path to the saved WAV file. */
  filePath: string;
  /** Estimated API cost in USD for this generation. */
  costUsd: number;
}

/**
 * Callback type for music generation progress updates.
 *
 * @param status - 'generating' when streaming starts, 'completed' on success, 'failed' on error.
 * @param result - The generation result (only on 'completed').
 */
export type MusicProgressCallback = (
  status: 'generating' | 'completed' | 'failed',
  result?: MusicGenerationResult,
) => void;

// ────────────────────────────────────────────────────────────────
// WAV encoding
// ────────────────────────────────────────────────────────────────

/**
 * Creates a 44-byte WAV file header for raw PCM data.
 *
 * @param dataLength - Length of the raw PCM data in bytes.
 * @param sampleRate - Sample rate in Hz (e.g. 48000).
 * @param channels - Number of audio channels (1=mono, 2=stereo).
 * @param bitsPerSample - Bits per sample (e.g. 16).
 * @returns A 44-byte Buffer containing the WAV header.
 */
export function createWavHeader(
  dataLength: number,
  sampleRate: number,
  channels: number,
  bitsPerSample: number,
): Buffer {
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const header = Buffer.alloc(44);

  // RIFF chunk descriptor
  header.write('RIFF', 0);                          // ChunkID
  header.writeUInt32LE(36 + dataLength, 4);          // ChunkSize (file size - 8)
  header.write('WAVE', 8);                           // Format

  // fmt sub-chunk
  header.write('fmt ', 12);                          // Subchunk1ID
  header.writeUInt32LE(16, 16);                      // Subchunk1Size (PCM = 16)
  header.writeUInt16LE(1, 20);                       // AudioFormat (PCM = 1)
  header.writeUInt16LE(channels, 22);                // NumChannels
  header.writeUInt32LE(sampleRate, 24);              // SampleRate
  header.writeUInt32LE(byteRate, 28);                // ByteRate
  header.writeUInt16LE(blockAlign, 32);              // BlockAlign
  header.writeUInt16LE(bitsPerSample, 34);           // BitsPerSample

  // data sub-chunk
  header.write('data', 36);                          // Subchunk2ID
  header.writeUInt32LE(dataLength, 40);              // Subchunk2Size

  return header;
}

// ────────────────────────────────────────────────────────────────
// MusicGenerator class
// ────────────────────────────────────────────────────────────────

/**
 * Generates background music tracks using the Google Lyria RealTime API.
 *
 * @remarks
 * Instantiated once at server startup when `GOOGLE_AI_API_KEY` is configured.
 * The Musician agent's MCP tool server delegates to this service. Each call
 * to {@link generateMusic} opens a WebSocket session, streams audio for
 * the configured duration, encodes to WAV, and saves to the game project.
 */
export class MusicGenerator {
  private readonly client: GoogleGenAI;
  private readonly model: string;
  private readonly streamDuration: number;
  private readonly costPerTrack: number;

  /**
   * Creates a new MusicGenerator instance.
   *
   * @param apiKey - Google AI API key.
   * @param streamDuration - Duration to stream audio in seconds. Defaults to 30.
   * @param costPerTrack - Estimated cost per track in USD. Defaults to 0 (free during experimental).
   */
  constructor(apiKey: string, streamDuration?: number, costPerTrack?: number) {
    this.client = new GoogleGenAI({
      apiKey,
      apiVersion: 'v1alpha',
    });
    this.model = process.env['LYRIA_MODEL'] ?? DEFAULT_MODEL;
    this.streamDuration = streamDuration
      ?? (process.env['LYRIA_STREAM_DURATION']
        ? Number(process.env['LYRIA_STREAM_DURATION'])
        : DEFAULT_STREAM_DURATION);
    this.costPerTrack = costPerTrack ?? DEFAULT_COST_USD;
  }

  /**
   * Generates a background music track and saves it as a WAV file.
   *
   * @param request - The music generation request with direction and key.
   * @param projectPath - Absolute path to the game project directory.
   * @param onProgress - Optional callback for progress updates.
   * @returns The generation result with audio reference and file path.
   * @throws Error if the Lyria session fails to connect or stream.
   */
  async generateMusic(
    request: MusicGenerationRequest,
    projectPath: string,
    onProgress?: MusicProgressCallback,
  ): Promise<MusicGenerationResult> {
    onProgress?.('generating');

    const pcmChunks: Buffer[] = [];
    let setupComplete = false;

    try {
      // Open Lyria WebSocket session
      const session = await this.client.live.music.connect({
        model: this.model,
        callbacks: {
          onmessage: (message) => {
            if (message.setupComplete) {
              setupComplete = true;
              return;
            }
            // Accumulate PCM audio chunks
            const chunk = message.audioChunk;
            if (chunk?.data) {
              pcmChunks.push(Buffer.from(chunk.data, 'base64'));
            }
          },
          onerror: (e) => {
            console.error('[music-generator] WebSocket error:', e);
          },
        },
      });

      // Wait for setup to complete
      await this.waitForSetup(() => setupComplete);

      // Set music generation config
      const { musicDirection } = request;
      const prompts = this.buildWeightedPrompts(musicDirection);

      await session.setWeightedPrompts({ weightedPrompts: prompts });

      if (musicDirection.tempo || DEFAULT_GUIDANCE) {
        await session.setMusicGenerationConfig({
          musicGenerationConfig: {
            bpm: musicDirection.tempo,
            guidance: DEFAULT_GUIDANCE,
          },
        });
      }

      // Start streaming and accumulate for the configured duration
      session.play();
      await this.sleep(this.streamDuration * 1_000);
      session.stop();

      // Small buffer to let final chunks arrive
      await this.sleep(500);
      session.close();

      // Encode PCM to WAV
      const pcmBuffer = Buffer.concat(pcmChunks);
      const wavHeader = createWavHeader(pcmBuffer.length, SAMPLE_RATE, NUM_CHANNELS, BITS_PER_SAMPLE);
      const wavBuffer = Buffer.concat([wavHeader, pcmBuffer]);

      // Save to project assets
      const assetsDir = path.join(projectPath, 'public', 'assets');
      fs.mkdirSync(assetsDir, { recursive: true });
      const filename = `${request.key}.wav`;
      const filePath = path.join(assetsDir, filename);
      fs.writeFileSync(filePath, wavBuffer);

      const durationSeconds = pcmBuffer.length / (SAMPLE_RATE * NUM_CHANNELS * (BITS_PER_SAMPLE / 8));
      const description = this.buildDescription(musicDirection);

      const result: MusicGenerationResult = {
        audio: {
          key: request.key,
          filename,
          durationSeconds: Math.round(durationSeconds * 10) / 10,
          description,
        },
        filePath,
        costUsd: this.costPerTrack,
      };

      onProgress?.('completed', result);
      return result;
    } catch (error) {
      onProgress?.('failed');
      throw error;
    }
  }

  /**
   * Builds weighted prompts from the music direction.
   *
   * @param direction - The music direction from the GDD.
   * @returns An array of weighted prompts for the Lyria API.
   */
  buildWeightedPrompts(direction: MusicDirection): Array<{ text: string; weight: number }> {
    const parts: string[] = [];

    // Core style
    parts.push(`${direction.genre} music`);
    parts.push(`${direction.mood} mood`);

    // Instruments
    if (direction.instruments && direction.instruments.length > 0) {
      parts.push(`featuring ${direction.instruments.join(', ')}`);
    }

    // Additional notes
    if (direction.notes) {
      parts.push(direction.notes);
    }

    // Game context
    parts.push('video game background music, loopable');

    return [{ text: parts.join(', '), weight: 1.0 }];
  }

  /**
   * Builds a human-readable description of the generated music.
   *
   * @param direction - The music direction used for generation.
   * @returns A short description string.
   */
  private buildDescription(direction: MusicDirection): string {
    const parts = [
      direction.mood.charAt(0).toUpperCase() + direction.mood.slice(1),
      direction.genre,
      'background music',
    ];
    if (direction.tempo) {
      parts.push(`at ${direction.tempo} BPM`);
    }
    return parts.join(' ');
  }

  /**
   * Waits for the Lyria setup handshake to complete.
   *
   * @param isReady - Function that returns true when setup is complete.
   * @param timeoutMs - Maximum time to wait in milliseconds.
   */
  private async waitForSetup(isReady: () => boolean, timeoutMs = 10_000): Promise<void> {
    const start = Date.now();
    while (!isReady()) {
      if (Date.now() - start > timeoutMs) {
        throw new Error('Lyria session setup timed out');
      }
      await this.sleep(100);
    }
  }

  /** Async sleep helper. */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
