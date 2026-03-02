/**
 * Main gameplay scene — starter shell.
 *
 * @remarks
 * This scene is intentionally minimal. The Developer agent writes all
 * game-specific code (entities, physics, input, etc.) based on the
 * Game Design Document. Only the basic scene/camera/lighting setup
 * and reset key handler are pre-wired.
 */

import * as THREE from 'three';
import { VIEWPORT, CONTROLS } from '../config';

/**
 * MainScene — the Developer agent implements all gameplay here.
 */
export class MainScene {
  /** The Three.js scene graph. */
  readonly scene: THREE.Scene;
  /** The perspective camera. */
  readonly camera: THREE.PerspectiveCamera;
  /** The WebGL renderer (managed externally). */
  private readonly renderer: THREE.WebGLRenderer;
  /** Animation frame ID for cleanup. */
  private animationFrameId: number | null = null;
  /** Set of currently pressed keys. */
  private readonly keysPressed = new Set<string>();

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;

    // Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(VIEWPORT.BACKGROUND_COLOR);

    // Camera setup — Developer agent adjusts position/FOV as needed
    const aspect = VIEWPORT.WIDTH / VIEWPORT.HEIGHT;
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
    this.camera.position.set(0, 5, 10);
    this.camera.lookAt(0, 0, 0);

    // Basic lighting — Developer agent may add/modify lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);

    const directional = new THREE.DirectionalLight(0xffffff, 0.8);
    directional.position.set(5, 10, 7);
    this.scene.add(directional);

    // Input handling
    window.addEventListener('keydown', (e) => this.keysPressed.add(e.code));
    window.addEventListener('keyup', (e) => this.keysPressed.delete(e.code));
  }

  /**
   * Starts the game loop.
   */
  start(): void {
    this.animate();
  }

  /**
   * Resets the scene to its initial state. Called when the reset
   * key is pressed. The Developer agent extends this to re-create
   * game entities.
   */
  reset(): void {
    // Remove all objects except lights
    const objectsToRemove = this.scene.children.filter(
      (child) => !(child instanceof THREE.Light)
    );
    for (const obj of objectsToRemove) {
      this.scene.remove(obj);
    }

    // Reset camera
    this.camera.position.set(0, 5, 10);
    this.camera.lookAt(0, 0, 0);
  }

  /**
   * Checks whether a key is currently pressed.
   *
   * @param code - The KeyboardEvent.code to check (e.g. 'KeyW', 'Space').
   * @returns true if the key is currently held down.
   */
  isKeyDown(code: string): boolean {
    return this.keysPressed.has(code);
  }

  /**
   * The animation loop. Called every frame via requestAnimationFrame.
   * The Developer agent adds game logic (movement, collisions, etc.) here.
   */
  private animate = (): void => {
    this.animationFrameId = requestAnimationFrame(this.animate);

    // Reset: restart the scene
    if (this.keysPressed.has(CONTROLS.RESET_KEY)) {
      this.keysPressed.delete(CONTROLS.RESET_KEY);
      this.reset();
    }

    // Developer agent adds per-frame update logic here

    this.renderer.render(this.scene, this.camera);
  };

  /**
   * Stops the animation loop and cleans up resources.
   */
  dispose(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }
}
