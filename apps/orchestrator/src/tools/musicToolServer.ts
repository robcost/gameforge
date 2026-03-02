/**
 * Session-scoped MCP tool server for AI music generation.
 *
 * @remarks
 * Provides MCP tools for the Musician agent to generate background music via the
 * Google Lyria RealTime API. Each tool operates on a specific session's data.
 * The Musician agent uses these tools to generate a background music track
 * based on the GDD's music direction.
 *
 * Tools provided:
 * - `generate_music` — generates a WAV background music track via Lyria
 * - `get_music_status` — returns the current music track info or null
 *
 * @packageDocumentation
 */

import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { Session } from '@robcost/shared-types';
import type { SessionManager } from '../sessions/sessionManager.js';
import type {
  MusicGenerator,
  MusicProgressCallback,
} from '../music/musicGenerator.js';

/** Dependencies needed to create a music tool server. */
export interface MusicToolServerDeps {
  sessionManager: SessionManager;
  musicGenerator: MusicGenerator;
  /** Callback fired when music generation status changes. */
  onMusicProgress?: MusicProgressCallback;
}

/**
 * Creates a session-scoped MCP tool server for music generation.
 *
 * @param session - The session this server operates on.
 * @param deps - Dependencies (session manager, music generator, progress callback).
 * @returns An MCP server config that can be passed to `query()` options.mcpServers.
 */
export function createMusicToolServer(session: Session, deps: MusicToolServerDeps) {
  return createSdkMcpServer({
    name: 'music-tools',
    version: '1.0.0',
    tools: [
      tool(
        'generate_music',
        'Generate a background music track using AI music generation. The track will be saved as a WAV file in the project\'s public/assets/ directory. Returns the audio reference on success.',
        {
          prompt: z.string().describe(
            'Description of the music to generate (e.g. "upbeat chiptune adventure theme with bright arpeggios")'
          ),
          genre: z.string().describe('Music genre (e.g. "chiptune", "orchestral", "lo-fi-hip-hop", "synthwave")'),
          mood: z.string().describe('Musical mood (e.g. "upbeat", "mysterious", "peaceful", "intense")'),
          tempo: z.number().optional().describe('Beats per minute (60-200). Optional.'),
          instruments: z.string().optional().describe(
            'Comma-separated list of instruments (e.g. "piano, strings, synth pad"). Optional.'
          ),
        },
        async (args) => {
          const currentSession = deps.sessionManager.getSession(session.id);
          if (!currentSession?.gdd) {
            return {
              content: [{ type: 'text' as const, text: 'Error: No GDD found. Cannot generate music without a game design document.' }],
              isError: true,
            };
          }

          // Check if music already exists
          if (currentSession.gdd.audio?.musicTrack) {
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  status: 'already_exists',
                  audio: currentSession.gdd.audio.musicTrack,
                  message: 'A music track has already been generated for this session.',
                }, null, 2),
              }],
            };
          }

          try {
            const instruments = args.instruments
              ? args.instruments.split(',').map((s: string) => s.trim())
              : undefined;

            const result = await deps.musicGenerator.generateMusic(
              {
                musicDirection: {
                  genre: args.genre,
                  mood: args.mood,
                  tempo: args.tempo,
                  instruments,
                  notes: args.prompt,
                },
                key: 'background-music',
              },
              currentSession.projectPath,
              deps.onMusicProgress,
            );

            // Update the session's audio config with the generated track
            const updatedAudio = {
              ...currentSession.gdd.audio,
              enabled: true,
              musicTrack: result.audio,
            };

            deps.sessionManager.updateSession(session.id, {
              gdd: {
                ...currentSession.gdd,
                audio: updatedAudio,
              },
            });

            // Track cost in session total
            if (result.costUsd > 0) {
              deps.sessionManager.updateSession(session.id, {
                totalCostUsd: currentSession.totalCostUsd + result.costUsd,
              });
            }

            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  status: 'success',
                  audio: result.audio,
                  filePath: result.filePath,
                  costUsd: result.costUsd,
                }, null, 2),
              }],
            };
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            deps.onMusicProgress?.('failed');

            return {
              content: [{ type: 'text' as const, text: `Music generation failed: ${message}` }],
              isError: true,
            };
          }
        }
      ),

      tool(
        'get_music_status',
        'Get the current music track information for this session. Returns the audio reference if a track has been generated, or null.',
        {},
        async () => {
          const currentSession = deps.sessionManager.getSession(session.id);
          const musicTrack = currentSession?.gdd?.audio?.musicTrack;

          if (!musicTrack) {
            return {
              content: [{ type: 'text' as const, text: 'No music track has been generated yet.' }],
            };
          }

          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                status: 'exists',
                audio: musicTrack,
              }, null, 2),
            }],
          };
        }
      ),
    ],
  });
}
