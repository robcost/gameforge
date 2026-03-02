# Three.js Performance Optimization

## Draw Call Monitoring

Target under 100 draw calls per frame for smooth 60fps. Monitor with:

```typescript
console.log('Draw calls:', renderer.info.render.calls);
console.log('Triangles:', renderer.info.render.triangles);
console.log('Textures:', renderer.info.memory.textures);
console.log('Geometries:', renderer.info.memory.geometries);
```

## InstancedMesh

Renders many copies of the same geometry in a single draw call. Use for repeated objects (trees, particles, coins, decorations).

```typescript
const COUNT = 500;
const mesh = new THREE.InstancedMesh(geometry, material, COUNT);
const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const scale = new THREE.Vector3(1, 1, 1);

for (let i = 0; i < COUNT; i++) {
  position.set(Math.random() * 100, 0, Math.random() * 100);
  matrix.compose(position, new THREE.Quaternion(), scale);
  mesh.setMatrixAt(i, matrix);
}
mesh.instanceMatrix.needsUpdate = true;
scene.add(mesh);
```

## Proper Disposal (CRITICAL)

Three.js does NOT garbage-collect GPU resources. You must manually dispose geometry, materials, and textures or memory leaks silently degrade performance.

```typescript
function disposeObject(obj: THREE.Object3D): void {
  if (obj instanceof THREE.Mesh) {
    obj.geometry.dispose();

    if (Array.isArray(obj.material)) {
      obj.material.forEach((mat) => disposeMaterial(mat));
    } else {
      disposeMaterial(obj.material);
    }
  }

  // Recurse into children
  while (obj.children.length > 0) {
    disposeObject(obj.children[0]);
    obj.remove(obj.children[0]);
  }
}

function disposeMaterial(material: THREE.Material): void {
  // Dispose all texture properties
  for (const key of Object.keys(material)) {
    const value = (material as Record<string, unknown>)[key];
    if (value instanceof THREE.Texture) {
      value.dispose();
    }
  }
  material.dispose();
}

// Use when cleaning up a scene
function clearScene(scene: THREE.Scene): void {
  while (scene.children.length > 0) {
    disposeObject(scene.children[0]);
    scene.remove(scene.children[0]);
  }
}
```

## Render Loop Efficiency

Never allocate objects inside the animate loop. Pre-allocate reusable temporaries.

```typescript
// BAD: Allocates every frame — triggers GC
function animate() {
  const direction = new THREE.Vector3();  // GC pressure
  const box = new THREE.Box3();           // GC pressure
  player.position.add(direction.subVectors(target, player.position).normalize());
}

// GOOD: Pre-allocate once, reuse every frame
const _direction = new THREE.Vector3();
const _box = new THREE.Box3();

function animate() {
  _direction.subVectors(target, player.position).normalize();
  player.position.add(_direction.multiplyScalar(speed * delta));
}
```

## Static Object Optimization

Disable automatic matrix recalculation for objects that never move:

```typescript
// For platforms, terrain, decorations — set once, freeze
const platform = new THREE.Mesh(geometry, material);
platform.position.set(10, 0, 5);
platform.updateMatrix();               // Compute matrix once
platform.matrixAutoUpdate = false;      // Skip per-frame recalculation
scene.add(platform);
```

## Texture Optimization

```typescript
// Always set colorSpace for color textures (not normal/bump maps)
texture.colorSpace = THREE.SRGBColorSpace;

// Cap anisotropy to device maximum
texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

// Use power-of-2 dimensions (256, 512, 1024) for best GPU performance
// Non-power-of-2 textures work but may be padded internally

// For pixel art: disable filtering
texture.magFilter = THREE.NearestFilter;
texture.minFilter = THREE.NearestFilter;
```

## Material Sharing

Reuse materials across meshes that share the same appearance:

```typescript
// BAD: Creates a new material per mesh
for (let i = 0; i < 100; i++) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
  const mesh = new THREE.Mesh(geometry, mat);
}

// GOOD: Share one material instance
const sharedMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
for (let i = 0; i < 100; i++) {
  const mesh = new THREE.Mesh(geometry, sharedMaterial);
}
```
