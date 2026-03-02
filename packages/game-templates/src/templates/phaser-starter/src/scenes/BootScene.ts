/**
 * Boot scene — handles asset preloading and game initialization.
 *
 * @remarks
 * In Circle 1, all visual assets are generated programmatically as
 * colored rectangles using Phaser's Graphics API. No external image
 * files are loaded. The Developer agent adds texture generation calls
 * to `preload()` based on the Game Design Document.
 */

import Phaser from 'phaser';
import { MainScene } from './MainScene';
import { VIEWPORT } from '../config';

/**
 * BootScene generates placeholder textures and transitions to MainScene.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  /**
   * The Developer agent adds `generateTexture()` calls here for each
   * visual entity defined in the GDD.
   */
  preload(): void {
    // Developer agent adds texture generation here based on GDD
  }

  /**
   * Transitions to the main gameplay scene after textures are generated.
   */
  create(): void {
    this.scene.start('MainScene');
  }

  /**
   * Generates a colored rectangle texture and registers it with the texture manager.
   *
   * @param key - The texture key used to reference this texture.
   * @param width - Width in pixels.
   * @param height - Height in pixels.
   * @param color - Fill color as a hex number (e.g. 0x4fc3f7).
   */
  generateTexture(key: string, width: number, height: number, color: number): void {
    const gfx = this.make.graphics({ x: 0, y: 0, add: false });
    gfx.fillStyle(color);
    gfx.fillRect(0, 0, width, height);
    gfx.generateTexture(key, width, height);
    gfx.destroy();
  }
}

/**
 * Creates and returns a new Phaser.Game instance.
 *
 * @param parent - The ID of the DOM element to mount the canvas into.
 * @returns The Phaser.Game instance.
 */
export function startGame(parent: string): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    width: VIEWPORT.WIDTH,
    height: VIEWPORT.HEIGHT,
    backgroundColor: VIEWPORT.BACKGROUND_COLOR,
    parent,
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { x: 0, y: 0 },
        debug: false,
      },
    },
    scene: [BootScene, MainScene],
  });
}
