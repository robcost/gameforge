/**
 * Boot scene — handles renderer setup and game initialization.
 *
 * @remarks
 * Creates the WebGL renderer, sets up the initial Three.js scene
 * and camera, then hands off to MainScene for gameplay. The Developer
 * agent may add asset preloading (textures, models) here.
 */

import * as THREE from 'three';
import { MainScene } from './MainScene';
import { VIEWPORT } from '../config';

/**
 * Creates the WebGL renderer, initializes MainScene, and starts the
 * game loop.
 *
 * @param canvas - The canvas element to render into.
 * @returns The MainScene instance (exposed as window.game for QA).
 */
export function startGame(canvas: HTMLCanvasElement): MainScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(VIEWPORT.WIDTH, VIEWPORT.HEIGHT);
  renderer.setPixelRatio(window.devicePixelRatio);

  const mainScene = new MainScene(renderer);
  mainScene.start();

  // Expose for QA agent introspection
  (window as unknown as { game: MainScene }).game = mainScene;

  return mainScene;
}
