/**
 * Main gameplay scene — starter shell.
 *
 * @remarks
 * This scene is intentionally empty. The Developer agent writes all
 * game-specific code (player, enemies, physics, input, etc.) based on
 * the Game Design Document. Only the reset key handler is pre-wired.
 */

import Phaser from 'phaser';
import { VIEWPORT, CONTROLS } from '../config';

/**
 * MainScene — the Developer agent implements all gameplay here.
 */
export class MainScene extends Phaser.Scene {
  /** Key object for the reset/restart control. */
  private resetKey!: Phaser.Input.Keyboard.Key;

  constructor() {
    super({ key: 'MainScene' });
  }

  /**
   * Sets up the scene. The Developer agent adds game objects,
   * physics, colliders, input, and camera here.
   */
  create(): void {
    // --- Reset key (mandatory for all games) ---
    this.resetKey = this.input.keyboard!.addKey(CONTROLS.RESET_KEY);

    // --- Reset hint HUD (fixed to camera, top-right) ---
    this.add
      .text(VIEWPORT.WIDTH - 16, 16, `Press ${CONTROLS.RESET_KEY} to restart`, {
        fontSize: '12px',
        color: '#94a3b8',
        fontFamily: 'monospace',
      })
      .setScrollFactor(0)
      .setOrigin(1, 0);
  }

  /**
   * Called every frame. The Developer agent adds movement,
   * collision checks, and game logic here.
   */
  update(): void {
    // Reset: restart the current scene
    if (Phaser.Input.Keyboard.JustDown(this.resetKey)) {
      this.scene.restart();
      return;
    }
  }
}
