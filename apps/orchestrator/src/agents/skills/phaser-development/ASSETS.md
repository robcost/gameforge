# Phaser 3 Asset Loading and Audio Integration

## Loading Image Assets

When the GDD has an `assetManifest`, load images in BootScene's `preload()` instead of using `generateTexture()`:

```typescript
// In BootScene.preload()
this.load.image('player', '/assets/player.png');
this.load.image('enemy-goblin', '/assets/enemy-goblin.png');
this.load.image('background', '/assets/background.png');
```

Use `this.add.image(x, y, key)` or `this.physics.add.sprite(x, y, key)` to display loaded assets.

## Scaling Assets (CRITICAL)

After creating ANY sprite or image from a loaded asset, ALWAYS call `setDisplaySize(width, height)` using the dimensions from the asset manifest or GDD entity definition. AI-generated images may not match the exact pixel dimensions specified.

```typescript
// After creating a sprite from a loaded asset
const player = this.physics.add.sprite(x, y, 'player');
player.setDisplaySize(64, 64); // Use width/height from asset manifest or GDD

// For static images (backgrounds, UI)
const bg = this.add.image(400, 250, 'background');
bg.setDisplaySize(800, 500); // Match viewport dimensions
```

## Platform Rendering (CRITICAL)

When the assetManifest includes a platform texture, the visual texture MUST align exactly with the physics body for EVERY platform. Each platform in the GDD has specific x, y, width, and height values.

For each platform:
1. Create the physics static body at the GDD position and size
2. Create the visual at the SAME position with `setDisplaySize(width, height)` matching the physics body
3. The physics body and visual MUST overlap perfectly - the player walks ON what they SEE

```typescript
// CORRECT: Visual matches physics body exactly
const platform = this.physics.add.staticImage(x, y, 'platform');
platform.setDisplaySize(platformWidth, platformHeight);
platform.body.setSize(platformWidth, platformHeight);
platform.body.setOffset(0, 0);
platform.refreshBody();

// Or with a static group:
const plat = platforms.create(x, y, 'platform');
plat.setDisplaySize(platformWidth, platformHeight);
plat.refreshBody();
```

Do NOT place platform images at fixed positions that differ from the physics bodies.

## Texture Fallback

If the GDD has entities without matching assetManifest entries, generate textures for those using the existing `generateTexture()` pattern in BootScene:

```typescript
// In BootScene.preload() - fallback for entities without assets
this.generateTexture('collectible', 16, 16, 0xFFD700);
```

## Background Music

When the GDD has `audio.musicTrack`, load and play background music:

**Loading:** In BootScene's `preload()`:
```typescript
this.load.audio('bgm', '/assets/music.wav');
```

**Playing:** In MainScene's `create()`, after all setup:
```typescript
this.sound.play('bgm', { loop: true, volume: 0.5 });
```

- Start music in `create()`, not `preload()`
- Use `loop: true` for continuous background music
- Keep volume at 0.5 or lower so it doesn't overpower gameplay
