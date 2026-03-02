/**
 * DOM entry point for the Three.js game.
 *
 * @remarks
 * Waits for the DOM to be ready, then creates the renderer and
 * starts the game loop by initializing the MainScene.
 */

import { startGame } from './scenes/BootScene';

document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  startGame(canvas);
});
