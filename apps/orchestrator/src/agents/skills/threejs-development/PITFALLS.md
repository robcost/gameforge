# Three.js Common Pitfalls

## 1. Memory Leaks

The #1 Three.js problem. GPU resources are NOT garbage-collected — you must explicitly dispose geometry, materials, and textures.

```typescript
// BAD: Removing from scene without disposal leaks GPU memory
scene.remove(mesh);

// GOOD: Dispose before removing
mesh.geometry.dispose();
mesh.material.dispose();
scene.remove(mesh);
```

See [PERFORMANCE.md](PERFORMANCE.md) for the full recursive `disposeObject()` cleanup pattern.

## 2. Z-Fighting

Overlapping surfaces at the same depth flicker between each other. Four fix strategies:

```typescript
// Fix 1: Increase the near plane (most effective)
camera = new THREE.PerspectiveCamera(60, aspect, 0.5, 500);  // near=0.5, not 0.01

// Fix 2: Enable logarithmic depth buffer (slight perf cost)
renderer = new THREE.WebGLRenderer({ logarithmicDepthBuffer: true });

// Fix 3: Use polygonOffset on one of the overlapping materials
decalMaterial.polygonOffset = true;
decalMaterial.polygonOffsetFactor = -1;
decalMaterial.polygonOffsetUnits = -1;

// Fix 4: Separate overlapping geometry by a tiny amount
overlay.position.y += 0.01;
```

**Rule of thumb:** Keep `camera.far / camera.near` ratio under 10,000.

## 3. Transparency Sorting

Transparent objects must render back-to-front. Three.js sorts by object center, which can cause visual glitches.

```typescript
// For transparent materials
material.transparent = true;
material.opacity = 0.7;

// For additive particles, disable depth writing
particleMaterial.transparent = true;
particleMaterial.depthWrite = false;  // Prevents depth buffer artifacts
particleMaterial.blending = THREE.AdditiveBlending;
```

If transparent objects overlap incorrectly, try `material.depthTest = true` with `depthWrite = false`.

## 4. Coordinate System

Three.js uses a **right-handed Y-up** coordinate system: X=right, Y=up, Z=toward camera. Imported models from other tools (Blender uses Z-up) may need rotation.

```typescript
// Blender export often needs this
model.rotation.x = -Math.PI / 2;  // Rotate from Z-up to Y-up
```

## 5. Texture Gotchas

Texture properties must be set **before the first render** or the texture must be re-uploaded.

```typescript
const texture = new THREE.TextureLoader().load('/assets/player.png');

// Set these IMMEDIATELY after creation
texture.colorSpace = THREE.SRGBColorSpace;  // For color textures (not normal maps)
texture.flipY = true;                        // Default is true; set false for glTF textures
texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
```

## 6. MeshBasicMaterial Ignores Lighting

`MeshBasicMaterial` is unlit — it ignores all lights and shadows. If objects appear flat/unshaded, check the material type.

```typescript
// BAD: Won't respond to lights or cast/receive shadows
const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });

// GOOD: Responds to lights and shadows
const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });

// Material hierarchy (cheapest to most expensive):
// MeshBasicMaterial    — Unlit, no shadows, cheapest
// MeshLambertMaterial  — Diffuse only, no specular
// MeshPhongMaterial    — Diffuse + specular (per-fragment)
// MeshStandardMaterial — PBR, roughness/metalness (recommended default)
// MeshPhysicalMaterial — Full PBR, clearcoat, transmission (most expensive)
```

## 7. Pixel Ratio

Not capping pixel ratio causes massive performance drops on high-DPI displays (4K monitors render 4x pixels).

```typescript
// BAD: On a 4K display, renders at 4x resolution
renderer.setPixelRatio(window.devicePixelRatio);

// GOOD: Cap at 2 — beyond that, the visual gain is imperceptible
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
```

## 8. PointLight Shadows

Each PointLight with shadows requires **6 shadow map passes** (one per cube face). This is extremely expensive.

```typescript
// BAD: PointLight shadows = 6 passes per light per frame
const light = new THREE.PointLight(0xffffff, 1, 50);
light.castShadow = true;  // 6x shadow cost!

// GOOD: Use DirectionalLight or SpotLight for shadows (1 pass each)
const light = new THREE.DirectionalLight(0xffffff, 0.8);
light.castShadow = true;  // 1 pass

// Tune shadow map for quality vs performance
light.shadow.mapSize.set(1024, 1024);  // 512 for mobile, 1024-2048 for desktop
light.shadow.camera.near = 0.5;
light.shadow.camera.far = 50;
```

## 9. Allocations in the Render Loop

Creating objects inside `animate()` causes garbage collection stutters. Pre-allocate everything.

```typescript
// BAD: New objects every frame
function animate() {
  const ray = new THREE.Raycaster();              // GC pressure
  const mouse = new THREE.Vector2(mx, my);        // GC pressure
  ray.setFromCamera(mouse, camera);
}

// GOOD: Create once, reuse
const _raycaster = new THREE.Raycaster();
const _mouse = new THREE.Vector2();

function animate() {
  _mouse.set(mx, my);
  _raycaster.setFromCamera(_mouse, camera);
}
```
