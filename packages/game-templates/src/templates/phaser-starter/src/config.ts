/**
 * Centralized game configuration constants.
 *
 * @remarks
 * The Developer agent populates this file with values from the Game
 * Design Document. Only viewport and controls are pre-defined; all
 * game-specific constants (physics, entities, etc.) are added by the
 * Developer based on the GDD.
 */

/** Game viewport dimensions. */
export const VIEWPORT = {
  WIDTH: 800,
  HEIGHT: 500,
  BACKGROUND_COLOR: '#1a1a2e',
} as const;

/** Keyboard controls configuration. */
export const CONTROLS = {
  /** Key code for restarting the current scene. */
  RESET_KEY: 'R',
} as const;
