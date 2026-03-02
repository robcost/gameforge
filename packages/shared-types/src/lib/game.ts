/**
 * Game design document and entity type definitions.
 *
 * @remarks
 * The Game Design Document (GDD) is the structured specification that
 * the Designer agent creates and the Developer agent implements.
 * It serves as the single source of truth for what a game should contain.
 *
 * @packageDocumentation
 */

/** Supported game genres. */
export type GameGenre = 'platformer' | 'shooter' | 'arcade' | 'puzzle' | 'topdown' | 'racing' | 'other';

/** Supported game engines. */
export type GameEngine = 'phaser' | 'threejs';

/** A 2D coordinate used for entity placement. */
export interface Position {
  x: number;
  y: number;
}

/** Viewport configuration for the game canvas. */
export interface ViewportConfig {
  width: number;
  height: number;
  backgroundColor: string;
}

/** Physics configuration for the game world and player. */
export interface PhysicsConfig {
  gravity: number;
  playerSpeed: number;
  /** Jump force — only relevant for games with jumping mechanics. */
  playerJumpForce?: number;
  /** Whether double-jump is enabled — only relevant for platformers. */
  doubleJump?: boolean;
  /** Whether wall-jump is enabled — only relevant for platformers. */
  wallJump?: boolean;
}

/** Player entity definition within the GDD. */
export interface PlayerDefinition {
  width: number;
  height: number;
  /** Placeholder color (hex string, e.g. '#4fc3f7'). */
  color: string;
  startPosition: Position;
  abilities: string[];
  health?: number;
  lives?: number;
  /** Asset key for the generated sprite (Circle 2). When set, replaces the color rectangle. */
  assetKey?: string;
}

/** Definition of an enemy type that can be placed in levels. */
export interface EnemyDefinition {
  id: string;
  name: string;
  width: number;
  height: number;
  color: string;
  speed: number;
  behavior: 'patrol' | 'chase' | 'stationary';
  damage: number;
  /** Asset key for the generated sprite (Circle 2). When set, replaces the color rectangle. */
  assetKey?: string;
}

/** Placement of an enemy instance within a level. */
export interface EnemyPlacement {
  enemyId: string;
  position: Position;
  /** Optional patrol bounds for patrol-behavior enemies. */
  patrolRange?: { min: number; max: number };
}

/** Definition of a collectible item type. */
export interface CollectibleDefinition {
  id: string;
  name: string;
  width: number;
  height: number;
  color: string;
  value: number;
  /** Asset key for the generated sprite (Circle 2). When set, replaces the color rectangle. */
  assetKey?: string;
}

/** Placement of a collectible instance within a level. */
export interface CollectiblePlacement {
  collectibleId: string;
  position: Position;
}

/** Definition of a hazard type (e.g. spikes, lava). */
export interface HazardDefinition {
  id: string;
  name: string;
  width: number;
  height: number;
  color: string;
  damage: number;
  /** Asset key for the generated sprite (Circle 2). When set, replaces the color rectangle. */
  assetKey?: string;
}

/** Placement of a hazard instance within a level. */
export interface HazardPlacement {
  hazardId: string;
  position: Position;
}

/** Definition of a platform within a level. */
export interface PlatformDefinition {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  /** Whether this platform moves. */
  moving?: boolean;
  /** Movement range for moving platforms. */
  moveRange?: { axis: 'x' | 'y'; min: number; max: number; speed: number };
  /** Asset key for the generated sprite (Circle 2). When set, replaces the color rectangle. */
  assetKey?: string;
}

/** A background layer for parallax scrolling. */
export interface BackgroundLayer {
  color: string;
  scrollFactor: number;
  y: number;
  height: number;
}

// ────────────────────────────────────────────────────────────────
// Circle 2: Art direction and asset generation types
// ────────────────────────────────────────────────────────────────

/** Category of a generated asset. */
export type AssetCategory =
  | 'character'
  | 'enemy'
  | 'collectible'
  | 'hazard'
  | 'platform'
  | 'background'
  | 'ui'
  | 'effect'
  | 'other';

/**
 * Art style direction for AI-generated assets.
 *
 * @remarks
 * When present in the GDD, the Artist agent generates PNG image assets
 * using Google Gemini. When absent, the game uses colored rectangles
 * via the engine's graphics API (Circle 1 behavior).
 */
export interface ArtDirection {
  /** Visual style descriptor (e.g. 'pixel-art-16bit', 'hand-painted', 'cartoon', 'realistic'). */
  style: string;
  /** Color palette descriptor or hex values (e.g. 'warm earth tones' or ['#2d1b00', '#8b4513']). */
  palette: string | string[];
  /** Overall visual mood (e.g. 'cheerful', 'dark', 'dreamy', 'retro'). */
  mood: string;
  /** Additional style notes for the Artist agent. */
  notes?: string;
}

/**
 * Reference to a generated asset file.
 *
 * @remarks
 * Each asset is a PNG file stored in the session's `public/assets/` directory.
 * The `key` is used by the game engine to reference the asset at runtime.
 */
export interface AssetReference {
  /** Unique key used to load this asset in the game engine. */
  key: string;
  /** Filename relative to public/assets/ (e.g. 'player.png'). */
  filename: string;
  /** Width in pixels. */
  width: number;
  /** Height in pixels. */
  height: number;
  /** What this asset represents (e.g. 'player sprite', 'enemy-goblin', 'background-sky'). */
  description: string;
  /** Asset category for organizational purposes. */
  category: AssetCategory;
}

/**
 * Manifest of all generated assets for a session.
 *
 * @remarks
 * Populated by the Artist agent during the asset generation phase.
 * The Developer agent reads this manifest to load the correct assets.
 */
export interface AssetManifest {
  /** All generated assets. */
  assets: AssetReference[];
  /** Filesystem path to the style anchor image (first generated asset), or null. */
  styleAnchorPath: string | null;
  /** Gemini API cost for all asset generations in this session. */
  assetCostUsd: number;
}

/** HUD/UI configuration. */
export interface UIConfig {
  showScore: boolean;
  showLives: boolean;
  showHealth: boolean;
  showTimer: boolean;
}

/**
 * Music style direction for AI-generated background music.
 *
 * @remarks
 * When present in the GDD's audio config, the Musician agent generates
 * background music using Google Lyria. When absent, the game has no music.
 * Parallels {@link ArtDirection} for visual assets.
 */
export interface MusicDirection {
  /** Music genre descriptor (e.g. 'chiptune', 'orchestral', 'lo-fi-hip-hop', 'synthwave', 'ambient'). */
  genre: string;
  /** Overall musical mood (e.g. 'upbeat', 'mysterious', 'peaceful', 'intense'). */
  mood: string;
  /** Beats per minute (60-200). Optional — inferred from genre if not specified. */
  tempo?: number;
  /** Preferred instruments (e.g. ['piano', 'strings', 'synth pad']). */
  instruments?: string[];
  /** Additional context for the Musician agent. */
  notes?: string;
}

/**
 * Reference to a generated audio file.
 *
 * @remarks
 * Each audio asset is a WAV file stored in the session's `public/assets/` directory.
 * The `key` is used by the game engine to reference the audio at runtime.
 */
export interface AudioReference {
  /** Unique key used to load this audio in the game engine (e.g. 'background-music'). */
  key: string;
  /** Filename relative to public/assets/ (e.g. 'music.wav'). */
  filename: string;
  /** Duration in seconds. */
  durationSeconds: number;
  /** What this audio represents (e.g. 'Upbeat chiptune adventure theme'). */
  description: string;
}

/** Audio configuration for the game. */
export interface AudioConfig {
  enabled: boolean;
  /** Music direction for AI-generated background music. When present, triggers the Musician agent. */
  musicDirection?: MusicDirection;
  /** Music track populated by the Musician agent after generation. */
  musicTrack?: AudioReference;
}

/** Definition of a single game level. */
export interface LevelDefinition {
  id: string;
  name: string;
  /** Level width in pixels. */
  width: number;
  /** Level height in pixels. */
  height: number;
  platforms: PlatformDefinition[];
  enemyPlacements: EnemyPlacement[];
  collectiblePlacements: CollectiblePlacement[];
  hazardPlacements: HazardPlacement[];
  playerStart: Position;
  exitPosition: Position;
  backgroundLayers?: BackgroundLayer[];
}

/**
 * The Game Design Document — the structured specification of a game.
 *
 * @remarks
 * Created by the Designer agent, consumed by the Developer agent.
 * This is the single source of truth for what a game should be.
 */
export interface GameDesignDocument {
  title: string;
  description: string;
  genre: GameGenre;
  engine: GameEngine;
  viewport: ViewportConfig;
  physics: PhysicsConfig;
  player: PlayerDefinition;
  /** Enemy definitions — optional for genres without enemies (e.g. puzzle). */
  enemies?: EnemyDefinition[];
  /** Collectible definitions — optional for genres without collectibles. */
  collectibles?: CollectibleDefinition[];
  /** Hazard definitions — optional for genres without hazards. */
  hazards?: HazardDefinition[];
  /** Level/stage definitions — optional for wave-based or single-screen games. */
  levels?: LevelDefinition[];
  ui: UIConfig;
  audio: AudioConfig;
  /** Genre-specific game mechanics (e.g. shooting config, wave definitions, grid rules). */
  mechanics?: Record<string, unknown>;
  /** Input control descriptions mapping key names to actions (e.g. { "ArrowLeft": "move left", "Space": "shoot" }). */
  controls?: Record<string, string>;
  /** Art direction for AI-generated assets (Circle 2). When absent, colored rectangles are used. */
  artDirection?: ArtDirection;
  /** Asset manifest populated by the Artist agent (Circle 2). */
  assetManifest?: AssetManifest;
}

/**
 * Creates a default GDD with genre-neutral defaults.
 *
 * @returns A GameDesignDocument with minimal defaults suitable for any genre.
 */
export function createDefaultGDD(): GameDesignDocument {
  return {
    title: 'Untitled Game',
    description: 'A 2D game.',
    genre: 'other',
    engine: 'phaser',
    viewport: { width: 800, height: 500, backgroundColor: '#1a1a2e' },
    physics: {
      gravity: 0,
      playerSpeed: 200,
    },
    player: {
      width: 32,
      height: 32,
      color: '#4fc3f7',
      startPosition: { x: 400, y: 300 },
      abilities: ['move'],
      lives: 3,
    },
    ui: { showScore: true, showLives: true, showHealth: false, showTimer: false },
    audio: { enabled: false },
  };
}
