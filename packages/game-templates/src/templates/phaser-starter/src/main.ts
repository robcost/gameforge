/**
 * DOM entry point for the Phaser game.
 *
 * @remarks
 * Waits for the DOM to be ready, then creates and mounts the Phaser
 * game instance into the #game-container div.
 */

import { startGame } from './scenes/BootScene';

document.addEventListener('DOMContentLoaded', () => {
  startGame('game-container');
});
