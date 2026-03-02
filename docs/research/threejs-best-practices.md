# Three.js Game & 3D Application Development Best Practices (2025-2026)

> Comprehensive reference for production-grade Three.js development.
> Targets Three.js r160+ through r182 (current stable as of December 2025).
> Covers WebGL 2 and the new production-ready WebGPU renderer (r171+).

---

## Table of Contents

1. [Performance Optimization](#1-performance-optimization)
2. [Geometry & Materials](#2-geometry--materials)
3. [Lighting & Shadows](#3-lighting--shadows)
4. [Physics Integration](#4-physics-integration)
5. [Camera & Controls](#5-camera--controls)
6. [Asset Loading](#6-asset-loading)
7. [Memory Management](#7-memory-management)
8. [Animation](#8-animation)
9. [Common Pitfalls](#9-common-pitfalls)
10. [WebGPU Migration Guide](#10-webgpu-migration-guide)
11. [Migration Guide: Breaking Changes r160-r173](#11-migration-guide-breaking-changes-r160-r173)

---

## 1. Performance Optimization

### 1.1 Draw Call Reduction

**Golden rule: Target under 100 draw calls per frame for smooth 60fps.**
Monitor via `renderer.info.render.calls`.

#### InstancedMesh (Same Geometry, Same Material)

Use when rendering many copies of the same geometry (trees, particles, props). Reduces N draw calls to 1.

```typescript
// 1,000 individual trees = 1,000 draw calls
// InstancedMesh = 1 draw call
const COUNT = 1000;
const mesh = new THREE.InstancedMesh(geometry, material, COUNT);
const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const rotation = new THREE.Euler();
const quaternion = new THREE.Quaternion();
const scale = new THREE.Vector3(1, 1, 1);

for (let i = 0; i < COUNT; i++) {
  position.set(Math.random() * 100, 0, Math.random() * 100);
  rotation.set(0, Math.random() * Math.PI * 2, 0);
  quaternion.setFromEuler(rotation);
  matrix.compose(position, quaternion, scale);
  mesh.setMatrixAt(i, matrix);
}
mesh.instanceMatrix.needsUpdate = true;
scene.add(mesh);
```

**When InstancedMesh is worth it:** Generally 10+ identical objects. Below that, the overhead may not justify it.

**Limitation:** Single geometry only. For per-instance visibility control, consider `InstancedMesh2` from `@three.ez/instanced-mesh` which adds `setVisibleAt`, frustum culling, and LOD support.

#### BatchedMesh (Different Geometries, Same Material)

Use when combining multiple distinct geometries that share a material. Available since r156. Uses WebGL `multiDraw` extension internally.

```typescript
const batchedMesh = new THREE.BatchedMesh(
  maxInstanceCount,    // max number of instances
  maxVertexCount,      // max total vertices across all geometries
  maxIndexCount,       // max total indices across all geometries
  material
);

// Add different geometries
const boxGeoId = batchedMesh.addGeometry(boxGeometry);
const sphereGeoId = batchedMesh.addGeometry(sphereGeometry);
const cylinderGeoId = batchedMesh.addGeometry(cylinderGeometry);

// Add instances of those geometries (r166+ requires explicit addInstance call)
const boxInstanceId = batchedMesh.addInstance(boxGeoId);
const sphereInstanceId = batchedMesh.addInstance(sphereGeoId);

// Position instances
const matrix = new THREE.Matrix4();
matrix.setPosition(10, 0, 0);
batchedMesh.setMatrixAt(boxInstanceId, matrix);

// Visibility control (BatchedMesh advantage over InstancedMesh)
batchedMesh.setVisibleAt(sphereInstanceId, false);

scene.add(batchedMesh);
```

**Decision matrix:**
- Single geometry, many instances --> `InstancedMesh`
- 2-4 distinct geometries --> Separate `InstancedMesh` per geometry
- 5+ distinct geometries, same material --> `BatchedMesh`
- 100k+ instances of single geometry --> `InstancedMesh` (multiDraw degrades at very high instance counts)

#### Static Geometry Merging

For objects that never move independently, merge into a single BufferGeometry:

```typescript
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const geometries: THREE.BufferGeometry[] = [];

for (const mesh of staticMeshes) {
  const cloned = mesh.geometry.clone();
  cloned.applyMatrix4(mesh.matrixWorld); // bake world transform
  geometries.push(cloned);
}

const mergedGeometry = mergeGeometries(geometries);
const mergedMesh = new THREE.Mesh(mergedGeometry, sharedMaterial);
scene.add(mergedMesh);

// Clean up source geometries
geometries.forEach(g => g.dispose());
```

**Trade-off:** You lose per-object transforms, raycasting granularity, and individual culling. Use only for truly static scenery.

#### Material Sharing

Three.js batches meshes with identical materials. Create materials once, reuse references:

```typescript
// BAD: creates a new material per mesh (no batching)
meshes.forEach(mesh => {
  mesh.material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
});

// GOOD: share a single material instance
const sharedMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });
meshes.forEach(mesh => {
  mesh.material = sharedMaterial;
});
```

### 1.2 Level of Detail (LOD)

LOD can improve frame rates by 30-40% in large scenes.

```typescript
const lod = new THREE.LOD();

// High detail: 0-20 units from camera
lod.addLevel(highDetailMesh, 0);
// Medium detail: 20-50 units
lod.addLevel(mediumDetailMesh, 20);
// Low detail: 50+ units
lod.addLevel(lowDetailMesh, 50);

scene.add(lod);

// Must call update in render loop
function animate() {
  lod.update(camera);
  renderer.render(scene, camera);
}
```

**Combine LOD with InstancedMesh:** Use multiple InstancedMesh objects (one per LOD level), swap instances between levels based on distance. This pattern nearly doubled frame rate in real-world tests.

### 1.3 Frustum Culling

Three.js automatically culls objects outside the camera frustum -- they generate zero draw calls. This is on by default.

```typescript
// Disable only when you know the object should always render
// (e.g., skybox, full-screen quad)
mesh.frustumCulled = false; // default is true

// For InstancedMesh, frustum culling applies to the bounding sphere
// of the entire instance set, not per-instance.
// Use InstancedMesh2 or manual BVH for per-instance culling.
```

### 1.4 Render Loop Efficiency

```typescript
// PREFERRED: Use setAnimationLoop (handles XR automatically)
renderer.setAnimationLoop(animate);

function animate(time: number) {
  // Use THREE.Timer or Clock for delta time
  const delta = timer.getDelta();

  // Only update what changed
  if (controlsChanged) {
    controls.update();
  }

  renderer.render(scene, camera);
}

// For static/infrequently changing scenes:
// Render on demand instead of every frame
let needsRender = true;

renderer.setAnimationLoop(() => {
  if (needsRender) {
    renderer.render(scene, camera);
    needsRender = false;
  }
});

function invalidate() {
  needsRender = true;
}
```

### 1.5 Avoiding Unnecessary Matrix Recalculations

```typescript
// If an object doesn't move, disable auto matrix updates
staticMesh.matrixAutoUpdate = false;
staticMesh.updateMatrix(); // compute once

// For entire subtrees of static objects
staticGroup.matrixAutoUpdate = false;
staticGroup.updateMatrixWorld(true); // compute once, recursively

// Re-enable when you need to move it
staticMesh.matrixAutoUpdate = true;
```

### 1.6 Shader Optimization

```typescript
// Use mediump on mobile (roughly 2x faster than highp)
const material = new THREE.ShaderMaterial({
  precision: 'mediump', // or detect: renderer.capabilities.precision

  vertexShader: `...`,
  fragmentShader: `...`,
});

// Replace conditionals with step/mix (avoids GPU branching)
// BAD in GLSL:
// if (value > 0.5) color = colorA; else color = colorB;

// GOOD in GLSL:
// color = mix(colorB, colorA, step(0.5, value));

// Keep varyings under 3 for mobile; pack data into vec4
// Avoid dynamic loop bounds -- fixed bounds allow GPU optimization
// Reuse shader programs: identical uniforms = shared programs
```

### 1.7 Texture Compression

```typescript
// KTX2 textures: ~10x VRAM reduction vs PNG/JPEG
// Textures stay compressed on GPU (PNG/JPEG fully decompress)
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

const ktx2Loader = new KTX2Loader()
  .setTranscoderPath('/basis/')  // path to basis transcoder WASM
  .detectSupport(renderer);

ktx2Loader.load('texture.ktx2', (texture) => {
  material.map = texture;
  material.needsUpdate = true;
});

// Compression method selection:
// UASTC -- higher quality, larger files. Use for normal maps, hero textures.
// ETC1S -- smaller files. Use for diffuse maps, secondary textures.
```

### 1.8 Performance Monitoring

```typescript
// Check renderer.info every frame during development
// Values should stay stable; growth indicates leaks
console.log({
  drawCalls: renderer.info.render.calls,
  triangles: renderer.info.render.triangles,
  geometries: renderer.info.memory.geometries,
  textures: renderer.info.memory.textures,
});

// Use stats-gl for real-time FPS/CPU/GPU metrics (works with both WebGL and WebGPU)
// Use Spector.js browser extension for WebGL frame capture
// Use r3f-perf for React Three Fiber projects
```

---

## 2. Geometry & Materials

### 2.1 BufferGeometry Best Practices

```typescript
// Always use BufferGeometry (legacy Geometry was removed in r125)

// Creating custom geometry
const geometry = new THREE.BufferGeometry();

const vertices = new Float32Array([
  -1, -1, 0,
   1, -1, 0,
   1,  1, 0,
]);
const normals = new Float32Array([
  0, 0, 1,
  0, 0, 1,
  0, 0, 1,
]);
const uvs = new Float32Array([
  0, 0,
  1, 0,
  1, 1,
]);

geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

// For dynamic geometry that updates every frame:
const posAttr = new THREE.BufferAttribute(vertices, 3);
posAttr.setUsage(THREE.DynamicDrawUsage); // hint to WebGL
geometry.setAttribute('position', posAttr);

// After updating values:
posAttr.needsUpdate = true;

// Use indexed geometry to share vertices (reduces memory, improves cache)
const indices = new Uint16Array([0, 1, 2, 2, 3, 0]);
geometry.setIndex(new THREE.BufferAttribute(indices, 1));
```

### 2.2 Material Sharing and Reuse

```typescript
// Material cache pattern
class MaterialCache {
  private cache = new Map<string, THREE.Material>();

  get(key: string, factory: () => THREE.Material): THREE.Material {
    if (!this.cache.has(key)) {
      this.cache.set(key, factory());
    }
    return this.cache.get(key)!;
  }

  dispose(): void {
    this.cache.forEach(mat => mat.dispose());
    this.cache.clear();
  }
}

const materials = new MaterialCache();
const redStandard = materials.get('red-standard', () =>
  new THREE.MeshStandardMaterial({ color: 0xff0000 })
);
```

### 2.3 ShaderMaterial vs RawShaderMaterial

```typescript
// ShaderMaterial: Three.js injects built-in uniforms and attributes
// (projectionMatrix, modelViewMatrix, position, uv, normal, etc.)
// Easier to use; Three.js handles the boilerplate.
const shaderMat = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
  },
  vertexShader: `
    uniform float uTime;
    void main() {
      vec3 pos = position; // 'position' is auto-injected
      pos.y += sin(pos.x + uTime) * 0.1;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `,
  fragmentShader: `
    void main() {
      gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
    }
  `,
});

// RawShaderMaterial: No auto-injected code. You must declare everything.
// Use when you need full control, or porting existing GLSL.
// NOTE: Despite expectations, RawShaderMaterial is NOT necessarily faster
// than ShaderMaterial. Benchmarks show ShaderMaterial can be faster due to
// internal optimizations. Prefer ShaderMaterial unless you have a specific reason.

// For extending PBR materials with custom shaders, use THREE-CustomShaderMaterial:
// https://github.com/FarazzShaikh/THREE-CustomShaderMaterial
// Lets you add custom vertex/fragment code while keeping PBR lighting.
```

### 2.4 PBR Material Tuning

```typescript
// MeshStandardMaterial = metallic-roughness PBR
// MeshPhysicalMaterial = extends Standard with clearcoat, sheen, transmission, etc.
// MeshPhysicalMaterial is more expensive; use only when you need its extra features.

const material = new THREE.MeshStandardMaterial({
  map: diffuseTexture,
  normalMap: normalTexture,
  roughnessMap: roughnessTexture,
  metalnessMap: metalnessTexture,
  envMap: environmentMap,         // critical for realistic PBR
  envMapIntensity: 1.0,          // per-material env attenuation (r163+)
});

// scene.environmentIntensity controls global env map attenuation (r163+)
// This is separate from material.envMapIntensity

// Performance tip: MeshBasicMaterial for objects that don't need lighting
// MeshLambertMaterial for cheap diffuse-only lighting
// MeshPhongMaterial for cheap specular
// MeshStandardMaterial for PBR (most common choice)
```

### 2.5 Texture Atlas Usage

```typescript
// Combine multiple textures into a single atlas to reduce texture binds
// Modify UV coordinates to reference sub-regions of the atlas

const atlasTexture = textureLoader.load('atlas.png');

// For a 4x4 grid atlas, tile at row 2, col 1:
const tileSize = 1 / 4; // each tile is 0.25 of the total
const offsetU = 1 * tileSize; // col 1
const offsetV = 2 * tileSize; // row 2

// Remap UVs of the geometry
const uvAttribute = geometry.getAttribute('uv');
for (let i = 0; i < uvAttribute.count; i++) {
  const u = uvAttribute.getX(i) * tileSize + offsetU;
  const v = uvAttribute.getY(i) * tileSize + offsetV;
  uvAttribute.setXY(i, u, v);
}
uvAttribute.needsUpdate = true;

// IMPORTANT: Use half-pixel inset to prevent atlas bleeding at edges
// Especially visible with mipmapping enabled
atlasTexture.minFilter = THREE.LinearFilter; // or add padding between tiles
```

---

## 3. Lighting & Shadows

### 3.1 Light Performance Hierarchy (Best to Worst)

1. **AmbientLight** -- No shadows, near-zero cost
2. **HemisphereLight** -- No shadows, very cheap
3. **DirectionalLight** (no shadows) -- Cheap
4. **DirectionalLight** (with shadows) -- 1 additional full-scene render pass
5. **SpotLight** (no shadows) -- Moderate
6. **SpotLight** (with shadows) -- 1 additional render pass
7. **PointLight** (no shadows) -- Moderate
8. **PointLight** (with shadows) -- **6 additional render passes** (one per cube face)

**Rule: Limit active lights to 3 or fewer.** Beyond that, use baked lighting or environment maps.

**Never use shadow-casting PointLights in production.** Two PointLights with shadows on 10 objects = 120 extra draw calls.

### 3.2 Shadow Map Optimization

```typescript
const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
directionalLight.castShadow = true;

// Shadow map sizing:
// Mobile: 512-1024
// Desktop: 1024-2048
// Quality (cinematics): 4096
directionalLight.shadow.mapSize.width = 1024;
directionalLight.shadow.mapSize.height = 1024;

// CRITICAL: Tighten the shadow camera frustum
// Default frustum is huge and wastes resolution
directionalLight.shadow.camera.left = -20;
directionalLight.shadow.camera.right = 20;
directionalLight.shadow.camera.top = 20;
directionalLight.shadow.camera.bottom = -20;
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 100;

// Shadow bias tuning to reduce shadow acne
directionalLight.shadow.bias = -0.001;    // start here, adjust per scene
directionalLight.shadow.normalBias = 0.02; // helps with curved surfaces

// PCFSoftShadowMap for softer shadows (moderate cost)
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// Selective shadow casting
scene.traverse((child) => {
  if (child instanceof THREE.Mesh) {
    // Only main characters/important objects cast shadows
    child.castShadow = child.userData.important ?? false;
    // Most objects can receive shadows cheaply
    child.receiveShadow = true;
  }
});
```

### 3.3 Static Scene Shadow Optimization

```typescript
// Disable auto-update for scenes where shadows don't change every frame
renderer.shadowMap.autoUpdate = false;

// Manually trigger shadow map update when something moves
function onObjectMove() {
  renderer.shadowMap.needsUpdate = true;
}

// Or update periodically (e.g., every second)
setInterval(() => {
  renderer.shadowMap.needsUpdate = true;
}, 1000);
```

### 3.4 Cascaded Shadow Maps (Large Scenes)

```typescript
import { CSM } from 'three-csm';

// Desktop configuration
const csm = new CSM({
  maxFar: 2000,
  cascades: 4,            // 4 frustum splits
  shadowMapSize: 2048,
  lightDirection: new THREE.Vector3(-1, -1, -1).normalize(),
  camera: camera,
  parent: scene,
});

// Mobile-friendly configuration
const csmMobile = new CSM({
  maxFar: 500,
  cascades: 2,            // fewer cascades
  shadowMapSize: 512,
  lightDirection: new THREE.Vector3(-1, -1, -1).normalize(),
  camera: camera,
  parent: scene,
});

// Must update in render loop
function animate() {
  csm.update();           // syncs cascades with camera
  renderer.render(scene, camera);
}

// Apply CSM material to receiving meshes
csm.setupMaterial(groundMaterial);
```

### 3.5 Baked Lighting

```typescript
// Bake lightmaps in Blender or use @react-three/lightmap for runtime baking.
// Apply as second UV channel (uv2) to MeshStandardMaterial.lightMap.

const material = new THREE.MeshStandardMaterial({
  map: diffuseTexture,
  lightMap: bakedLightmapTexture,
  lightMapIntensity: 1.0,
});

// Ensure the mesh has a second UV set (uv2) for lightmap coordinates
// Most GLTF exporters can generate this automatically

// Fake shadows: ultra-cheap alternative for simple contact shadows
const shadowTexture = textureLoader.load('radial-gradient.png');
const shadowMaterial = new THREE.MeshBasicMaterial({
  map: shadowTexture,
  transparent: true,
  depthWrite: false,
  opacity: 0.4,
});
const shadowPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  shadowMaterial
);
shadowPlane.rotation.x = -Math.PI / 2;
shadowPlane.position.y = 0.01; // slightly above ground to avoid z-fighting
```

### 3.6 Environment Maps for Ambient Light

```typescript
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

const rgbeLoader = new RGBELoader();
rgbeLoader.load('environment.hdr', (texture) => {
  texture.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = texture;    // global PBR environment
  scene.background = texture;     // optional: use as skybox too
  scene.environmentIntensity = 1.0; // global intensity (r163+)
});

// Much cheaper than multiple lights for ambient fill
// Provides realistic reflections on PBR materials
```

---

## 4. Physics Integration

### 4.1 Library Comparison (2025)

| Library | Language | Performance | Ease of Use | Best For |
|---------|----------|-------------|-------------|----------|
| **Rapier** | Rust/WASM | Highest (2-5x faster than JS engines) | Moderate | Production games, complex simulations |
| **cannon-es** | JavaScript | Good (~800 rigid bodies at 60fps) | Easy | Prototyping, simpler games |
| **ammo.js** | C++/WASM | High (Bullet physics port) | Hard | Realism-critical simulations |
| **Jolt** | C++/WASM | High | Moderate | Feature-rich alternative to Rapier |

**Recommendation: Use Rapier for production Three.js games.** Written in Rust, compiled to WASM. Best performance-to-ergonomics ratio.

### 4.2 Rapier Integration Pattern

```typescript
import RAPIER from '@dimforge/rapier3d-compat';

// Initialize (async -- WASM loading)
await RAPIER.init();

const gravity = new RAPIER.Vector3(0.0, -9.81, 0.0);
const world = new RAPIER.World(gravity);

// Create a dynamic rigid body
const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
  .setTranslation(0, 10, 0);
const rigidBody = world.createRigidBody(bodyDesc);

// Attach a collider
const colliderDesc = RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5)
  .setRestitution(0.5)
  .setFriction(0.8);
world.createCollider(colliderDesc, rigidBody);

// Sync Three.js mesh with physics body
function syncMeshToBody(mesh: THREE.Mesh, body: RAPIER.RigidBody) {
  const position = body.translation();
  const rotation = body.rotation();
  mesh.position.set(position.x, position.y, position.z);
  mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
}
```

### 4.3 Fixed Timestep with Interpolation

This is the most important pattern for smooth physics rendering. Physics runs at a fixed rate; rendering runs as fast as possible; interpolation bridges the gap.

```typescript
const FIXED_TIMESTEP = 1 / 60; // 60 Hz physics
let accumulator = 0;
let previousTime = performance.now();

// Store previous and current positions for interpolation
interface PhysicsObject {
  body: RAPIER.RigidBody;
  mesh: THREE.Mesh;
  previousPosition: THREE.Vector3;
  previousQuaternion: THREE.Quaternion;
  currentPosition: THREE.Vector3;
  currentQuaternion: THREE.Quaternion;
}

const objects: PhysicsObject[] = [];

function gameLoop(currentTime: number) {
  let deltaTime = (currentTime - previousTime) / 1000;
  previousTime = currentTime;

  // Cap delta to prevent spiral of death
  deltaTime = Math.min(deltaTime, 0.1);

  accumulator += deltaTime;

  // Fixed timestep physics updates
  while (accumulator >= FIXED_TIMESTEP) {
    // Save previous state for interpolation
    for (const obj of objects) {
      obj.previousPosition.copy(obj.currentPosition);
      obj.previousQuaternion.copy(obj.currentQuaternion);
    }

    // Step physics
    world.step();

    // Read new state
    for (const obj of objects) {
      const pos = obj.body.translation();
      const rot = obj.body.rotation();
      obj.currentPosition.set(pos.x, pos.y, pos.z);
      obj.currentQuaternion.set(rot.x, rot.y, rot.z, rot.w);
    }

    accumulator -= FIXED_TIMESTEP;
  }

  // Interpolation alpha: how far between previous and current state
  const alpha = accumulator / FIXED_TIMESTEP;

  // Interpolate visual positions
  for (const obj of objects) {
    obj.mesh.position.lerpVectors(
      obj.previousPosition,
      obj.currentPosition,
      alpha
    );
    obj.mesh.quaternion.slerpQuaternions(
      obj.previousQuaternion,
      obj.currentQuaternion,
      alpha
    );
  }

  renderer.render(scene, camera);
  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
```

### 4.4 Sleep States

```typescript
// Enable sleeping to skip simulation for stationary bodies
// Rapier enables this by default; configure thresholds:
const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
  .setCanSleep(true)             // default: true
  .setLinearDamping(0.5)         // helps bodies come to rest
  .setAngularDamping(0.5);

// Wake a sleeping body (e.g., when player interacts)
rigidBody.wakeUp();

// Check sleep state
if (rigidBody.isSleeping()) {
  // Skip mesh sync for sleeping bodies
}
```

---

## 5. Camera & Controls

### 5.1 OrbitControls Tuning

```typescript
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const controls = new OrbitControls(camera, renderer.domElement);

// Smooth damping (MUST call controls.update() in animation loop)
controls.enableDamping = true;
controls.dampingFactor = 0.05;     // lower = more inertia

// Constrain rotation
controls.minPolarAngle = 0;                     // prevent looking from below
controls.maxPolarAngle = Math.PI / 2 - 0.01;   // prevent flipping past horizon

// Constrain distance
controls.minDistance = 2;
controls.maxDistance = 100;

// Constrain panning
controls.enablePan = true;
controls.panSpeed = 0.5;
controls.screenSpacePanning = true; // pan parallel to screen plane

// Zoom speed
controls.zoomSpeed = 0.5;

// Auto-rotate (good for product viewers)
controls.autoRotate = true;
controls.autoRotateSpeed = 2.0;

// IMPORTANT: Must update in render loop when using damping
function animate() {
  controls.update();
  renderer.render(scene, camera);
}
```

### 5.2 Follow Camera (Third-Person)

```typescript
class FollowCamera {
  private offset: THREE.Vector3;
  private lookAtOffset: THREE.Vector3;
  private smoothSpeed: number;
  private camera: THREE.PerspectiveCamera;
  private currentLookAt = new THREE.Vector3();

  constructor(
    camera: THREE.PerspectiveCamera,
    offset = new THREE.Vector3(0, 5, -10),
    lookAtOffset = new THREE.Vector3(0, 1, 0),
    smoothSpeed = 0.05
  ) {
    this.camera = camera;
    this.offset = offset;
    this.lookAtOffset = lookAtOffset;
    this.smoothSpeed = smoothSpeed;
  }

  update(target: THREE.Object3D, delta: number): void {
    // Desired camera position (offset in target's local space)
    const desiredPosition = this.offset.clone()
      .applyQuaternion(target.quaternion)
      .add(target.position);

    // Smooth follow with frame-rate independent lerp
    const t = 1 - Math.pow(1 - this.smoothSpeed, delta * 60);
    this.camera.position.lerp(desiredPosition, t);

    // Smooth look-at
    const lookAtTarget = target.position.clone().add(this.lookAtOffset);
    this.currentLookAt.lerp(lookAtTarget, t);
    this.camera.lookAt(this.currentLookAt);
  }
}
```

### 5.3 Smooth Camera Transitions

```typescript
// Using camera-controls library for production-grade transitions
// npm install camera-controls
import CameraControls from 'camera-controls';
CameraControls.install({ THREE });

const cameraControls = new CameraControls(camera, renderer.domElement);

// Smooth transition to new position + target
await cameraControls.setLookAt(
  5, 3, 5,    // camera position
  0, 0, 0,    // look-at target
  true         // enable transition (false = instant)
);

// Tune transition speed
cameraControls.smoothTime = 0.5;   // seconds to reach target
cameraControls.restThreshold = 0.01;

// IMPORTANT: Disable controls during scripted animations
// to prevent user input fighting the animation
cameraControls.enabled = false;
await animateCamera();
cameraControls.enabled = true;

// Update in render loop
function animate(delta: number) {
  cameraControls.update(delta);
  renderer.render(scene, camera);
}
```

### 5.4 Camera Collision/Clipping

```typescript
// Prevent camera from clipping through geometry
function preventCameraClip(
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3,
  scene: THREE.Scene,
  maxDistance: number
): void {
  const raycaster = new THREE.Raycaster();
  const direction = camera.position.clone().sub(target).normalize();

  raycaster.set(target, direction);
  raycaster.far = maxDistance;

  const intersects = raycaster.intersectObjects(scene.children, true);

  if (intersects.length > 0) {
    const hitDistance = intersects[0].distance;
    if (hitDistance < camera.position.distanceTo(target)) {
      // Move camera to just before the hit point
      camera.position.copy(target).addScaledVector(direction, hitDistance - 0.3);
    }
  }
}

// For production: use three-mesh-bvh for much faster raycasting
// against complex geometry (orders of magnitude faster)
```

---

## 6. Asset Loading

### 6.1 GLTFLoader with Draco + KTX2

```typescript
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

// Configure Draco decoder (90-95% geometry size reduction)
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('/draco/');  // path to draco decoder files
dracoLoader.preload();                  // start loading decoder early

// Configure KTX2 transcoder (~10x VRAM reduction)
const ktx2Loader = new KTX2Loader();
ktx2Loader.setTranscoderPath('/basis/'); // path to basis transcoder
ktx2Loader.detectSupport(renderer);      // detect GPU compression support

// Configure GLTF loader with both
const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);
gltfLoader.setKTX2Loader(ktx2Loader);

// Load model
gltfLoader.load(
  'model.glb',
  (gltf) => {
    scene.add(gltf.scene);
    // Process animations if present
    if (gltf.animations.length > 0) {
      const mixer = new THREE.AnimationMixer(gltf.scene);
      gltf.animations.forEach(clip => mixer.clipAction(clip).play());
    }
  },
  (progress) => {
    console.log(`Loading: ${(progress.loaded / progress.total * 100).toFixed(1)}%`);
  },
  (error) => {
    console.error('GLTF load error:', error);
  }
);
```

### 6.2 Compression Pipeline (Build-time)

```bash
# Install gltf-transform CLI
npm install -g @gltf-transform/cli

# Full optimization pipeline:
# - Draco geometry compression
# - KTX2 texture compression
# - Remove unused data
# - Merge duplicates
gltf-transform optimize model.glb optimized.glb \
  --texture-compress ktx2 \
  --compress draco

# Or step by step:
gltf-transform draco model.glb draco-model.glb
gltf-transform ktx2 draco-model.glb final-model.glb

# Consider meshopt as alternative to Draco:
# Similar compression, faster decompression
gltf-transform meshopt model.glb meshopt-model.glb
```

### 6.3 Progressive Loading Pattern

```typescript
// Show placeholder immediately, load high-quality in background
class ProgressiveModelLoader {
  private gltfLoader: GLTFLoader;

  async loadProgressive(
    lowResUrl: string,
    highResUrl: string,
    scene: THREE.Scene
  ): Promise<THREE.Group> {
    // Load low-res immediately
    const lowRes = await this.loadAsync(lowResUrl);
    scene.add(lowRes.scene);

    // Load high-res in background
    const highRes = await this.loadAsync(highResUrl);

    // Swap
    scene.remove(lowRes.scene);
    this.disposeModel(lowRes.scene);
    scene.add(highRes.scene);

    return highRes.scene;
  }

  private loadAsync(url: string): Promise<GLTF> {
    return new Promise((resolve, reject) => {
      this.gltfLoader.load(url, resolve, undefined, reject);
    });
  }

  private disposeModel(object: THREE.Object3D): void {
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
  }
}
```

### 6.4 Texture Caching

```typescript
class TextureCache {
  private cache = new Map<string, THREE.Texture>();
  private loader = new THREE.TextureLoader();

  load(url: string): THREE.Texture {
    if (this.cache.has(url)) {
      return this.cache.get(url)!;
    }
    const texture = this.loader.load(url);
    this.cache.set(url, texture);
    return texture;
  }

  dispose(url?: string): void {
    if (url) {
      this.cache.get(url)?.dispose();
      this.cache.delete(url);
    } else {
      this.cache.forEach(t => t.dispose());
      this.cache.clear();
    }
  }
}
```

### 6.5 Loading Manager

```typescript
const manager = new THREE.LoadingManager();

manager.onStart = (url, itemsLoaded, itemsTotal) => {
  console.log(`Started loading: ${url} (${itemsLoaded}/${itemsTotal})`);
};

manager.onProgress = (url, itemsLoaded, itemsTotal) => {
  const percent = (itemsLoaded / itemsTotal * 100).toFixed(0);
  updateLoadingBar(Number(percent));
};

manager.onLoad = () => {
  hideLoadingScreen();
};

manager.onError = (url) => {
  console.error(`Failed to load: ${url}`);
};

// Use with all loaders
const textureLoader = new THREE.TextureLoader(manager);
const gltfLoader = new GLTFLoader(manager);
```

---

## 7. Memory Management

### 7.1 The Disposal Problem

Three.js does NOT auto-garbage-collect GPU resources. JavaScript's GC only frees CPU-side references. GPU-side buffers (geometry, textures, materials, render targets) must be explicitly disposed or they leak VRAM.

### 7.2 Comprehensive Scene Cleanup

```typescript
function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    // Dispose geometry
    if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.Points) {
      if (child.geometry) {
        child.geometry.dispose();
      }

      // Dispose material(s)
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];

      for (const material of materials) {
        if (!material) continue;

        // Dispose all texture properties
        const textureProperties = [
          'map', 'normalMap', 'roughnessMap', 'metalnessMap',
          'aoMap', 'emissiveMap', 'displacementMap', 'alphaMap',
          'envMap', 'lightMap', 'bumpMap', 'specularMap',
          'clearcoatMap', 'clearcoatNormalMap', 'clearcoatRoughnessMap',
          'sheenColorMap', 'sheenRoughnessMap', 'transmissionMap',
          'thicknessMap', 'iridescenceMap', 'iridescenceThicknessMap',
          'anisotropyMap',
        ] as const;

        for (const prop of textureProperties) {
          const texture = (material as any)[prop] as THREE.Texture | null;
          if (texture) {
            texture.dispose();
            // GLTF textures loaded as ImageBitmap need extra cleanup
            if (texture.source?.data && 'close' in texture.source.data) {
              (texture.source.data as ImageBitmap).close();
            }
          }
        }

        material.dispose();
      }
    }
  });
}

function clearScene(scene: THREE.Scene): void {
  while (scene.children.length > 0) {
    const child = scene.children[0];
    scene.remove(child);
    disposeObject(child);
  }
}
```

### 7.3 Resource Tracker Pattern

```typescript
class ResourceTracker {
  private resources = new Set<{ dispose: () => void }>();

  track<T extends { dispose: () => void }>(resource: T): T {
    this.resources.add(resource);
    return resource;
  }

  trackObject(object: THREE.Object3D): THREE.Object3D {
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        this.track(child.geometry);
        const materials = Array.isArray(child.material)
          ? child.material
          : [child.material];
        materials.forEach(m => {
          this.track(m);
          // Track textures on material
          for (const key of Object.keys(m)) {
            const value = (m as any)[key];
            if (value instanceof THREE.Texture) {
              this.track(value);
            }
          }
        });
      }
    });
    return object;
  }

  dispose(): void {
    for (const resource of this.resources) {
      resource.dispose();
    }
    this.resources.clear();
  }
}

// Usage: track everything related to a loaded model
const tracker = new ResourceTracker();
gltfLoader.load('model.glb', (gltf) => {
  tracker.trackObject(gltf.scene);
  scene.add(gltf.scene);
});

// Later: clean up everything at once
function unloadModel() {
  scene.remove(model);
  tracker.dispose();
}
```

### 7.4 Render Target Disposal

```typescript
// Render targets allocate framebuffer memory -- always dispose
const renderTarget = new THREE.WebGLRenderTarget(1024, 1024);

// When done:
renderTarget.dispose();

// For WebGPU storage buffers:
// storageBuffer.destroy();
```

### 7.5 Object Pooling

```typescript
// Pre-allocate objects; toggle visibility instead of create/destroy
// Avoids GC pauses and GPU resource allocation overhead
class ObjectPool<T extends THREE.Object3D> {
  private pool: T[] = [];
  private active = new Set<T>();

  constructor(factory: () => T, size: number) {
    for (let i = 0; i < size; i++) {
      const obj = factory();
      obj.visible = false;
      this.pool.push(obj);
    }
  }

  acquire(): T | undefined {
    const obj = this.pool.pop();
    if (obj) {
      obj.visible = true;
      this.active.add(obj);
    }
    return obj;
  }

  release(obj: T): void {
    obj.visible = false;
    this.active.delete(obj);
    this.pool.push(obj);
  }

  getAllActive(): ReadonlySet<T> {
    return this.active;
  }
}
```

### 7.6 Monitoring GPU Memory

```typescript
// Check renderer.info.memory -- values should stay stable
// Growing values indicate a leak
function checkForLeaks(): void {
  const info = renderer.info;
  console.table({
    geometries: info.memory.geometries,
    textures: info.memory.textures,
    drawCalls: info.render.calls,
    triangles: info.render.triangles,
  });
}

// Call periodically during development
setInterval(checkForLeaks, 5000);
```

### 7.7 Handling WebGL Context Loss

```typescript
const canvas = renderer.domElement;

canvas.addEventListener('webglcontextlost', (event) => {
  event.preventDefault(); // allows restoration
  // Pause animation loop
  renderer.setAnimationLoop(null);
  console.warn('WebGL context lost. Attempting recovery...');
}, false);

canvas.addEventListener('webglcontextrestored', () => {
  // Re-initialize renderer state
  // Reload textures and rebuild GPU resources
  console.log('WebGL context restored.');
  initScene();
  renderer.setAnimationLoop(animate);
}, false);
```

---

## 8. Animation

### 8.1 AnimationMixer Patterns

```typescript
import * as THREE from 'three';

const mixer = new THREE.AnimationMixer(model);
const clock = new THREE.Clock();

// Play a specific clip
const clip = THREE.AnimationClip.findByName(gltf.animations, 'Walk');
const action = mixer.clipAction(clip);
action.play();

// Update in render loop
function animate() {
  const delta = clock.getDelta();
  mixer.update(delta);
  renderer.render(scene, camera);
}

// Control playback
action.timeScale = 1.5;         // speed up
action.setLoop(THREE.LoopRepeat, Infinity);
action.clampWhenFinished = true; // hold last frame when done
```

### 8.2 Animation Blending (Crossfade)

```typescript
class AnimationController {
  private mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private currentAction: THREE.AnimationAction | null = null;

  constructor(model: THREE.Object3D, animations: THREE.AnimationClip[]) {
    this.mixer = new THREE.AnimationMixer(model);

    for (const clip of animations) {
      const action = this.mixer.clipAction(clip);
      this.actions.set(clip.name, action);
    }
  }

  play(name: string, fadeDuration = 0.3): void {
    const nextAction = this.actions.get(name);
    if (!nextAction || nextAction === this.currentAction) return;

    nextAction.reset();
    nextAction.setEffectiveTimeScale(1);
    nextAction.setEffectiveWeight(1);

    if (this.currentAction) {
      // Crossfade from current to next
      nextAction.crossFadeFrom(this.currentAction, fadeDuration, true);
    }

    nextAction.play();
    this.currentAction = nextAction;
  }

  update(delta: number): void {
    this.mixer.update(delta);
  }
}

// Usage
const animController = new AnimationController(character, gltf.animations);
animController.play('Idle');

// On movement:
animController.play('Walk', 0.25); // 0.25s crossfade
```

### 8.3 Skeletal Animation Performance

```typescript
// For skeletons with many bones (>64), Three.js encodes bone matrices
// into a DataTexture for more efficient GPU upload. This is automatic.

// Performance tips:
// 1. Reduce bone count where possible (< 64 is ideal)
// 2. Use LOD for animated characters (simpler rig at distance)
// 3. Only update AnimationMixer for visible characters
// 4. Pause mixer for off-screen characters: action.paused = true

// Share skeleton data between identical characters
const skeleton = originalModel.skeleton;
const clone = THREE.SkeletonUtils.clone(originalModel);
// Each clone gets its own skeleton instance but shares geometry
```

### 8.4 Morph Targets

```typescript
// Morph targets are great for facial expressions, shape keys
// Each influence is 0-1

const mesh = model.getObjectByName('Face') as THREE.Mesh;

// Access morph target influences
const smileIndex = mesh.morphTargetDictionary?.['smile'];
if (smileIndex !== undefined) {
  mesh.morphTargetInfluences![smileIndex] = 0.8; // 80% smile
}

// Animate morph targets with AnimationMixer
// (GLTF morph target animations are loaded automatically)

// Performance: morph targets add per-vertex cost
// Limit morph target count on mobile
// Use morphTargetsRelative for additive blending
```

### 8.5 Procedural Animation

```typescript
// Frame-rate independent procedural animation
function proceduralBob(
  object: THREE.Object3D,
  time: number,
  amplitude = 0.1,
  frequency = 2
): void {
  object.position.y += Math.sin(time * frequency) * amplitude;
}

function proceduralSway(
  object: THREE.Object3D,
  time: number,
  amplitude = 0.05
): void {
  object.rotation.z = Math.sin(time * 1.5) * amplitude;
  object.rotation.x = Math.cos(time * 1.2) * amplitude * 0.5;
}

// Wind effect on vegetation (per-vertex in shader is better for many objects)
// Use ShaderMaterial with vertex displacement based on world position + time
```

---

## 9. Common Pitfalls

### 9.1 Memory Leaks (The #1 Problem)

```typescript
// PITFALL: Not disposing resources when removing objects
scene.remove(mesh); // GPU memory still allocated!

// FIX: Always dispose after removing
scene.remove(mesh);
mesh.geometry.dispose();
mesh.material.dispose();
mesh.material.map?.dispose();

// PITFALL: Creating materials/geometries in loops or render function
function animate() {
  // BAD: new material every frame = massive leak
  mesh.material = new THREE.MeshBasicMaterial({ color: Math.random() * 0xffffff });
}

// FIX: Reuse and update
const material = new THREE.MeshBasicMaterial();
function animate() {
  material.color.setHex(Math.random() * 0xffffff);
}
```

### 9.2 Z-Fighting

```typescript
// PITFALL: Two surfaces at the exact same position
const floor = new THREE.Mesh(planeGeo, floorMat);
const decal = new THREE.Mesh(planeGeo, decalMat);
// Both at y=0 --> z-fighting flicker

// FIX Option 1: Small offset
decal.position.y = 0.001;

// FIX Option 2: polygonOffset (works for polygons, NOT lines)
decalMat.polygonOffset = true;
decalMat.polygonOffsetFactor = -1;
decalMat.polygonOffsetUnits = -1;

// FIX Option 3: renderOrder (for overlapping transparent objects)
decal.renderOrder = 1;

// FIX Option 4: Adjust camera near/far ratio
// A very small near with very large far reduces depth buffer precision
// BAD: camera.near = 0.001; camera.far = 100000;
// GOOD: camera.near = 0.1; camera.far = 1000;
// Rule: keep far/near ratio under 10,000
```

### 9.3 Transparency Sorting

```typescript
// PITFALL: Transparent objects render in wrong order
// Three.js sorts transparent objects by distance to camera (center point),
// but this fails for overlapping, intersecting, or large transparent objects.

// FIX Option 1: Set renderOrder explicitly
transparentMeshA.renderOrder = 1;
transparentMeshB.renderOrder = 2; // renders on top

// FIX Option 2: Disable depth writing for transparent objects
transparentMat.depthWrite = false;
transparentMat.transparent = true;

// FIX Option 3: For complex cases, use custom sort
renderer.setOpaqueSort((a, b) => a.z - b.z);
renderer.setTransparentSort((a, b) => b.z - a.z);

// PITFALL: Opaque and transparent objects rendering order
// WebGLRenderer renders opaque objects first, then transparent.
// Setting transparent: true on a material that doesn't need it
// can cause unexpected sorting behavior.
```

### 9.4 Coordinate System Gotchas

```typescript
// Three.js uses RIGHT-HANDED coordinate system:
// X = right, Y = up, Z = toward viewer (out of screen)
// This differs from some game engines (Unity: left-handed)

// PITFALL: Importing models from tools with different conventions
// Blender: matches Three.js (right-handed, Y-up)
// Unity exports: may need axis conversion
// Some CAD tools: Z-up instead of Y-up

// FIX: Rotate imported models
model.rotation.x = -Math.PI / 2; // Convert Z-up to Y-up

// PITFALL: Euler angle order matters
// Three.js default is 'XYZ' -- if your tool exports 'ZYX', set it:
object.rotation.order = 'ZYX';

// PITFALL: Quaternion vs Euler
// Euler angles suffer from gimbal lock
// Use quaternions for interpolation and complex rotations
object.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
```

### 9.5 Texture Issues

```typescript
// PITFALL: Texture appears washed out or too dark
// Three.js applies sRGB encoding to color textures by default (r152+)
// But you must set it explicitly for textures loaded outside GLTF:
texture.colorSpace = THREE.SRGBColorSpace; // for color/diffuse maps
normalMap.colorSpace = THREE.LinearSRGBColorSpace; // for data textures

// PITFALL: Texture is upside down
// WebGL texture coordinate origin is bottom-left, not top-left
texture.flipY = true; // default for TextureLoader
// GLTF textures: flipY is false (handled by the format)

// PITFALL: Textures look blurry
// Default minFilter uses mipmapping which can blur at angles
texture.minFilter = THREE.LinearFilter; // sharper but no mipmaps
// Or use anisotropic filtering:
texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

// PITFALL: Power-of-two texture requirement
// WebGL 2 removed this requirement for most cases, but mipmapping
// still works best with power-of-two textures (256, 512, 1024, 2048)
```

### 9.6 Performance Anti-Patterns

```typescript
// PITFALL: Creating objects inside the render loop
function animate() {
  const v = new THREE.Vector3(); // GC pressure every frame!
  renderer.render(scene, camera);
}

// FIX: Allocate once, reuse
const _tempVec3 = new THREE.Vector3();
function animate() {
  _tempVec3.set(1, 2, 3); // reuse
  renderer.render(scene, camera);
}

// PITFALL: Calling .clone() frequently
// Clone creates new GPU resources -- avoid in hot paths

// PITFALL: Unnecessary matrix updates
// scene.updateMatrixWorld() is called automatically by renderer.render()
// Don't call it manually unless you need matrices before render

// PITFALL: Overusing .needsUpdate = true
// Only set when you actually changed the data
// Setting it every frame re-uploads to GPU every frame
```

### 9.7 Material-Specific Gotchas

```typescript
// PITFALL: MeshBasicMaterial doesn't receive shadows
// It ignores all lighting. Use MeshStandardMaterial or MeshLambertMaterial.

// PITFALL: Material side
// Default is THREE.FrontSide -- backfaces are invisible
// For two-sided rendering:
material.side = THREE.DoubleSide; // costs roughly 2x
// Better: use THREE.BackSide for inner surfaces of closed objects

// PITFALL: Forgetting material.needsUpdate after changing certain properties
material.map = newTexture;
material.needsUpdate = true; // required for texture/shader-affecting changes
// Color changes don't need this -- they update automatically
```

### 9.8 Renderer Setup Mistakes

```typescript
// PITFALL: Not setting pixel ratio
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
// Cap at 2 -- Retina 3x is wasteful for 3D

// PITFALL: Not handling resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// PITFALL: antialias + post-processing
// If using post-processing, disable native AA (it's wasted work):
const renderer = new THREE.WebGLRenderer({
  antialias: false,   // post-processing bypasses this
  stencil: false,     // save memory if not using stencil
  depth: false,       // save memory if post-processing handles depth
});
// Add FXAA or SMAA as final post-processing pass instead

// PITFALL: tone mapping interactions
// Output encoding and tone mapping interact in subtle ways
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
// If using post-processing, set toneMapping on the pass, not the renderer
```

---

## 10. WebGPU Migration Guide

### 10.1 Current State (Late 2025)

Since Three.js r171 (September 2025), WebGPU is production-ready:
- Chrome/Edge: v113+ (May 2023)
- Firefox: v141+ Windows, v145+ macOS ARM (June 2025)
- Safari: v26+ including iOS (September 2025)
- **All major browsers now support WebGPU.**

### 10.2 Migration Steps

```typescript
// STEP 1: Update to Three.js r171+
// npm install three@latest

// STEP 2: Change imports
// BEFORE:
import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: true });

// AFTER:
import * as THREE from 'three/webgpu';
const renderer = new THREE.WebGPURenderer({ antialias: true });
await renderer.init(); // CRITICAL: must await before use

// STEP 3: WebGPU auto-falls back to WebGL 2
// No separate code paths needed. WebGPURenderer handles this.

// STEP 4: Post-processing migration
import { bloom, pass } from 'three/tsl';
const postProcessing = new THREE.PostProcessing(renderer);
// TSL-based pipeline: pass(scene, camera).pipe(bloom()).pipe(fxaa())

// STEP 5: Custom shaders --> TSL (Three Shader Language)
// GLSL shaders won't work with WebGPU backend
import { Fn, uv, vec4 } from 'three/tsl';
const colorNode = Fn(() => vec4(uv(), 0.5, 1.0));
// TSL compiles to both WGSL (WebGPU) and GLSL (WebGL fallback)

// STEP 6: React Three Fiber integration
// gl={async (canvas) => {
//   const r = new WebGPURenderer({ canvas });
//   await r.init();
//   return r;
// }}
```

### 10.3 When to Migrate

Migrate to WebGPU when you need:
- **Draw-call-heavy scenes** (2-10x improvement)
- **Compute shaders** (GPU physics, particle systems, terrain generation)
- **Complex post-processing** pipelines
- **Future-proofing** (WebGPU is the successor to WebGL)

Stay on WebGL when:
- Your app already runs well
- You rely heavily on custom GLSL that would take time to port
- You need older browser support

### 10.4 Key Performance Wins

- GPU compute shaders: millions of particles (vs ~50K with CPU)
- Workgroup shared memory: 10-100x faster than global memory for repeated access
- Indirect draws: GPU-driven rendering where compute shaders decide what to render
- `instancedArray()` for GPU-persistent buffers (eliminates CPU-GPU transfer)

---

## 11. Migration Guide: Breaking Changes r160-r173

### r160 to r161
- **Build files removed:** `build/three.js` and `build/three.min.js` no longer exist. Use ES modules.
- Equirectangular environment maps auto-converted to cube format (larger texture, memory trade-off).

### r161 to r162
- **`WebGLMultipleRenderTargets` removed.** Use the `count` property on render target classes.
- `HTMLImageElement` textures now use `naturalWidth`/`naturalHeight`.

### r162 to r163
- **WebGL 1 support removed.** WebGLRenderer is WebGL 2 only.
- `stencil` context attribute now `false` by default.
- `TextGeometry` `height` parameter renamed to `depth`.
- `Scene.environmentIntensity` introduced; `material.envMapIntensity` now only attenuates material-specific `envMap`.

### r163 to r164
- `lightmap_fragment` shader chunk removed. Inline GLSL if you were patching it.
- Legacy `WebGLNodeBuilder` removed; node materials require `WebGPURenderer`.

### r165 to r166
- **`BatchedMesh.addGeometry()` no longer auto-creates instances.** Must call `addInstance()` explicitly.
- `copyTextureToTexture()` and `copyFramebufferToTexture()` signatures changed.

### r167 to r168
- **TSL chaining syntax removed.** Use functional syntax: `fxaa(outputPass)` not `outputPass.fxaa()`.
- `viewportTopLeft` renamed to `viewportUV`.
- `uniforms()` renamed to `uniformArray()`.
- `DragControls.activate()`/`deactivate()` renamed to `connect()`/`disconnect()`.
- `PointerLockControls.getObject()` removed; use `controls.object`.
- `LogLuvLoader` removed; use `UltraHDRLoader`.

### r168 to r169
- **`TransformControls` changed.** Must use `scene.add(controls.getHelper())` instead of `scene.add(controls)`.
- `EXRExporter.parse()`, `KTX2Exporter.parse()`, `LightProbeGenerator.fromCubeRenderTarget()` are now **async**.
- `CinematicCamera` removed.

### r169 to r170
- `Material.type` is now **static and read-only**.
- Non-PBR material exports: `metallicFactor` now `0`, `roughnessFactor` now `1`.
- `WebGLRenderer.copyTextureToTexture3D()` deprecated; use `copyTextureToTexture()`.
- MMD modules deprecated.

### r170 to r171
- **Import path changes:** Use `three/webgpu` for WebGPU/NodeMaterial; `three/tsl` for TSL.
- Blending functions renamed: `burn()` to `blendBurn()`, `dodge()` to `blendDodge()`, `screen()` to `blendScreen()`, `overlay()` to `blendOverlay()`.
- `storageObject()` deprecated; use `storage().setPBO(true)`.

### r171 to r172
- `TextureNode.uv()` renamed to `TextureNode.sample()`.
- Fog functions deprecated: use `fog(color, rangeFogFactor(near, far))`.
- `materialAOMap` renamed to `materialAO`.
- `shadowWorldPosition` renamed to `shadowPositionWorld`.
- `PostProcessingUtils` renamed to `RendererUtils`.

### r172 to r173
- `Timer` no longer auto-uses Page Visibility API; call `timer.connect(document)`.
- `RenderTarget.clone()` now performs full structural cloning.

---

## Key Performance Numbers Summary

| Metric | Target/Value |
|--------|-------------|
| Draw calls per frame | Under 100 for 60fps |
| Draco compression | 90-95% geometry size reduction |
| KTX2 texture compression | ~10x VRAM reduction vs PNG/JPEG |
| LOD improvement | 30-40% frame rate gain |
| WebGPU vs WebGL | 2-10x in draw-call-heavy scenes |
| CPU particles | ~50K practical limit |
| GPU compute particles | Millions |
| PointLight shadow cost | 6 render passes per light |
| Active light limit | 3 or fewer |
| Camera near/far ratio | Under 10,000 |
| Pixel ratio cap | 2 (Retina 3x is wasteful) |
| Shadow map sizes | Mobile: 512-1024, Desktop: 1024-2048, Quality: 4096 |
| Bone count (ideal) | Under 64 per skeleton |
| Raycasting with BVH | 80,000+ polygons at 60fps |

---

## Essential Libraries (2025)

| Library | Purpose |
|---------|---------|
| `three-mesh-bvh` | Fast raycasting and spatial queries (orders of magnitude faster) |
| `camera-controls` | Production-grade camera with smooth transitions |
| `@dimforge/rapier3d-compat` | High-performance WASM physics (Rust) |
| `gltf-transform` | CLI for GLTF compression and optimization |
| `THREE-CustomShaderMaterial` | Extend PBR materials with custom shaders |
| `three-csm` | Cascaded Shadow Maps for large scenes |
| `stats-gl` | Real-time WebGL/WebGPU performance monitoring |
| `lil-gui` | Live parameter tweaking panels |
| `@three.ez/instanced-mesh` | Enhanced InstancedMesh with visibility, culling, LOD |
| `postprocessing` (pmndrs) | Efficient post-processing (auto-merges passes) |

---

## Research Sources

- Three.js Official Documentation: https://threejs.org/docs/
- Three.js Migration Guide: https://github.com/mrdoob/three.js/wiki/Migration-Guide
- Three.js Releases: https://github.com/mrdoob/three.js/releases
- 100 Three.js Tips (2026): https://www.utsubo.com/blog/threejs-best-practices-100-tips
- What Changed in Three.js 2026: https://www.utsubo.com/blog/threejs-2026-what-changed
- WebGPU Migration Guide: https://www.utsubo.com/blog/webgpu-threejs-migration-guide
- Three.js Performance Guide (GitHub Gist): https://gist.github.com/iErcann/2a9dfa51ed9fc44854375796c8c24d92
- Rapier Physics Documentation: https://rapier.rs/docs/user_guides/javascript/getting_started_js/
- three-mesh-bvh: https://github.com/gkjohnson/three-mesh-bvh
- camera-controls: https://github.com/yomotsu/camera-controls
- Three.js Forum: https://discourse.threejs.org/
