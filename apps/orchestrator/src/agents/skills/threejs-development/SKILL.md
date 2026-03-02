---
name: threejs-development
description: Three.js TypeScript 3D game development patterns including scene architecture, geometry, manual physics, input handling, camera, lighting, and HUD. Use when implementing or modifying a Three.js 3D game.
---

# Three.js 3D Game Development Patterns

## Project Structure

The Three.js game project uses Vite + TypeScript with this layout:

```
src/
  config.ts           - Game constants (VIEWPORT, CONTROLS, plus everything from GDD)
  main.ts             - DOM entry point, gets canvas element, calls startGame()
  scenes/
    BootScene.ts      - Creates WebGLRenderer, initializes MainScene, starts loop
    MainScene.ts      - Scene, Camera, Lights, animate loop, reset key - all gameplay here
```

## Config-Driven Design

- **All game constants** (dimensions, speeds, colors, physics values) go in `src/config.ts`
- Scenes import from config - never hardcode values in scene files
- Colors are hex numbers (e.g. `0x4fc3f7`) for Three.js materials

## Scene Architecture

- `MainScene` is a class with a Three.js `Scene`, `PerspectiveCamera`, and `WebGLRenderer`
- The animate loop uses `requestAnimationFrame` with delta time
- Input is tracked via a `keysPressed` Set - use `isKeyDown(code)` to check
- Camera and lighting are pre-configured in the template - modify as needed

```typescript
// Typical MainScene structure
class MainScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  keysPressed: Set<string>;

  animate(time: number) {
    const delta = (time - this.lastTime) / 1000;
    this.lastTime = time;
    this.update(delta);
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame((t) => this.animate(t));
  }
}
```

## Creating Game Objects (Geometric Primitives)

- Use `THREE.BoxGeometry`, `THREE.SphereGeometry`, `THREE.CylinderGeometry` for entities
- Wrap in `THREE.Mesh` with `THREE.MeshStandardMaterial` for lit appearance
- Add to scene: `this.scene.add(mesh)`

```typescript
// Create a colored box
const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshStandardMaterial({ color: 0x4fc3f7 });
const cube = new THREE.Mesh(geometry, material);
cube.position.set(0, 0.5, 0);
this.scene.add(cube);

// Create a sphere
const sphereGeo = new THREE.SphereGeometry(0.5, 16, 16);
const sphereMat = new THREE.MeshStandardMaterial({ color: 0xff5722 });
const sphere = new THREE.Mesh(sphereGeo, sphereMat);
this.scene.add(sphere);
```

## Physics (Manual - No Engine)

Three.js has no built-in physics. Implement simple physics in the `animate` loop:

- **Gravity:** `velocity.y -= gravity * deltaTime`
- **Collision:** AABB checks using `mesh.position` and bounding boxes
- **Movement:** `mesh.position.add(velocity.clone().multiplyScalar(deltaTime))`
- For complex physics, the GDD may specify adding a library (cannon-es), but start with manual physics

```typescript
// Simple gravity and ground collision
const velocity = new THREE.Vector3(0, 0, 0);

function update(delta: number) {
  // Apply gravity
  velocity.y -= CONFIG.GRAVITY * delta;

  // Apply velocity
  player.position.y += velocity.y * delta;

  // Ground collision
  if (player.position.y <= CONFIG.GROUND_Y) {
    player.position.y = CONFIG.GROUND_Y;
    velocity.y = 0;
    onGround = true;
  }
}
```

### AABB Collision Detection

```typescript
function checkCollision(a: THREE.Mesh, b: THREE.Mesh): boolean {
  const aBox = new THREE.Box3().setFromObject(a);
  const bBox = new THREE.Box3().setFromObject(b);
  return aBox.intersectsBox(bBox);
}
```

## Input Handling

- The template tracks key state via `keysPressed` Set
- Check keys: `this.isKeyDown('KeyW')`, `this.isKeyDown('Space')`
- Key codes use `KeyboardEvent.code` format: `KeyW`, `KeyA`, `Space`, `ArrowLeft`, etc.

```typescript
// Movement with input checking
if (this.isKeyDown('KeyA') || this.isKeyDown('ArrowLeft')) {
  player.position.x -= CONFIG.PLAYER_SPEED * delta;
}
if (this.isKeyDown('KeyD') || this.isKeyDown('ArrowRight')) {
  player.position.x += CONFIG.PLAYER_SPEED * delta;
}
if (this.isKeyDown('Space') && onGround) {
  velocity.y = CONFIG.JUMP_FORCE;
  onGround = false;
}
```

## Camera

- Default: `PerspectiveCamera(60, aspect, 0.1, 1000)` at position (0, 5, 10) looking at origin
- Adjust based on game type: overhead for top-down, behind-player for third-person
- Camera follow: update `camera.position` in animate loop relative to player

```typescript
// Third-person camera follow
camera.position.set(
  player.position.x,
  player.position.y + 5,
  player.position.z + 10
);
camera.lookAt(player.position);
```

## Lighting

- Template includes ambient (0.6) + directional (0.8) lights
- Add point lights, spot lights as needed for atmosphere
- Use `MeshStandardMaterial` for objects that should respond to light

```typescript
// Additional point light for atmosphere
const pointLight = new THREE.PointLight(0xff6600, 1, 20);
pointLight.position.set(5, 3, 0);
this.scene.add(pointLight);
```

## HUD / UI

- Use HTML/CSS overlay or `CSS2DRenderer` for score/lives/text
- Simple approach: create DOM elements positioned absolutely over the canvas

```typescript
// HTML overlay HUD
const hud = document.createElement('div');
hud.style.position = 'absolute';
hud.style.top = '10px';
hud.style.left = '10px';
hud.style.color = 'white';
hud.style.fontFamily = 'monospace';
hud.textContent = 'Score: 0';
document.body.appendChild(hud);
```

## Mandatory Controls

- **Every game MUST include a reset key**: The template already handles 'KeyR' for reset
- Do NOT remove or modify the existing reset key handler

## Asset Loading and Audio

For texture loading, sprite rendering, and background music integration, see [ASSETS.md](ASSETS.md).

## Performance Optimization

For draw call reduction, InstancedMesh, disposal patterns, and render loop efficiency, see [PERFORMANCE.md](PERFORMANCE.md).

## Common Pitfalls

For memory leaks, z-fighting, transparency sorting, and other common mistakes, see [PITFALLS.md](PITFALLS.md).
