# Three.js Asset Loading and Audio Integration

## Loading Texture Assets

When the GDD has an `assetManifest`, use `THREE.TextureLoader` to load PNG assets:

```typescript
const loader = new THREE.TextureLoader();
const playerTexture = loader.load('/assets/player.png');
const material = new THREE.MeshStandardMaterial({ map: playerTexture });
const mesh = new THREE.Mesh(geometry, material);
```

## Sprite-Like Entities

For 2D-style sprites in a 3D world, use `THREE.PlaneGeometry` with the texture applied:

```typescript
const texture = loader.load('/assets/player.png');
const spriteMaterial = new THREE.MeshStandardMaterial({
  map: texture,
  transparent: true,
  side: THREE.DoubleSide,
});
const sprite = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  spriteMaterial
);
this.scene.add(sprite);
```

Set `transparent: true` for PNG sprites with alpha channels. Use `DoubleSide` if the sprite should be visible from both directions.

## Background Textures

Load background textures and apply to a large plane behind the scene:

```typescript
// As scene background
const bgTexture = loader.load('/assets/background.png');
this.scene.background = bgTexture;

// Or as a backdrop plane
const bgMaterial = new THREE.MeshBasicMaterial({ map: bgTexture });
const bgPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(50, 30),
  bgMaterial
);
bgPlane.position.z = -20;
this.scene.add(bgPlane);
```

## Background Music

When the GDD has `audio.musicTrack`, load and play background music using Three.js audio:

```typescript
// Create audio listener and attach to camera
const listener = new THREE.AudioListener();
camera.add(listener);

// Create audio source
const sound = new THREE.Audio(listener);
const audioLoader = new THREE.AudioLoader();

// Load and play
audioLoader.load('/assets/music.wav', (buffer) => {
  sound.setBuffer(buffer);
  sound.setLoop(true);
  sound.setVolume(0.5);
  sound.play();
});
```

- Create the `AudioListener` and attach to the camera
- Use `setLoop(true)` for continuous background music
- Keep volume at 0.5 or lower so it doesn't overpower gameplay
- Start audio loading during scene initialization
