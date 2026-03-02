# Phaser 3 Game Development Best Practices (2025-2026)

> **Research Date:** 2026-02-27
> **Phaser Version Coverage:** 3.60 through 3.90.0 "Tsugumi" (latest stable, May 2025)
> **Note:** v3.90 is likely the final Phaser 3 release; all future development targets Phaser v4.

---

## Table of Contents

1. [Version-Specific Updates and Deprecations](#1-version-specific-updates-and-deprecations)
2. [Performance Optimization](#2-performance-optimization)
3. [Physics Best Practices](#3-physics-best-practices)
4. [State Management](#4-state-management)
5. [Animation and Tweens](#5-animation-and-tweens)
6. [Input Handling](#6-input-handling)
7. [Audio Best Practices](#7-audio-best-practices)
8. [Memory Management](#8-memory-management)
9. [Common Pitfalls](#9-common-pitfalls)

---

## 1. Version-Specific Updates and Deprecations

### Current Version: 3.90.0 "Tsugumi" (May 2025)

Developers building on Phaser 3 today must be aware of the following version progression and what changed:

### Key Changes by Version

**v3.60 "Miku" (April 2023):**
- Added FX shader pipeline (Barrel, Bloom, Blur, Bokeh, Circle effects)
- Added DynamicTexture for compositing multiple GameObjects into one texture
- Added ESM support via `phaser.esm.js`
- Added `Game.pause()` / `Game.resume()` for full game suspension
- ParticleEmitterManager removed; emitters are now direct GameObjects on the display list
- WebGL compressed texture support added

**v3.80 "Nino" (February 2024):**
- WebGL Context Restore: game survives GPU context loss without full reload
- Native base64 / Data URI support in the Loader
- Loader can now load base64-encoded images, audio, and text directly

**v3.85 "Itsuki" (September 2024):**
- `roundPixels` now defaults to `false` (was `true`). If your game relied on pixel rounding, explicitly set `roundPixels: true` in game config
- Pixel rounding moved from GPU shader (`uRoundPixels` uniform removed) to CPU-level per-object
- Input system completely rewritten for edge-case stability
- MatterJS updated to 0.20.0 with native `wrap()` and `attractors` (plugins no longer needed)
- Loader `maxRetries` property added (default: 2) for network resilience

**Deprecated in v3.85 (removed in v3.88+):**
- `Phaser.Struct.Map` and `Phaser.Struct.Set` -- use native JS `Map`/`Set`
- `Create.GenerateTexture` and all Palettes
- `Geom.Point` class -- use `Vector2` instead
- Spine 3/4 plugins -- migrate to official Esoteric Software Spine plugin
- IE9 polyfills and `phaser-ie9.js` entry point

**v3.88 "Minami" (February 2025):**
- `mousedown`/`mouseup` handlers added for earlier Web Audio unlock on desktop
- Background color applied immediately on canvas creation (eliminates color flash)
- iOS 17.5.1+ Safari audio fix for sound dropout after focus loss/gain
- Fixed Matter.World.update browser hang with large delta during tab dormancy
- `DynamicTexture.forceEven` property (default: true) rounds dimensions to even values
- Tween duration minimum enforced at 0.01ms to prevent NaN errors

**v3.90.0 "Tsugumi" (May 2025):**
- Arcade Physics collision category checks fixed for individual objects within groups
- Animation frame duration regression from v3.88 fixed
- Chained tween persistence after `stop()` corrected
- Chrome 134+ RTL text rendering fix
- Firefox Web Audio fallback for missing `positionX/Y/Z` on AudioListener
- Particle emitter color array and custom `moveTo` function fixes
- EXPAND scale mode now clamps on ultra-wide displays

---

## 2. Performance Optimization

### 2.1 Object Pooling

Object pooling is the single most impactful optimization for action games. Every `new` in your update loop triggers memory allocation that eventually causes GC pauses.

**Pattern: Group-Based Object Pool**

```typescript
class BulletPool extends Phaser.GameObjects.Group {
  constructor(scene: Phaser.Scene) {
    super(scene, {
      classType: Phaser.GameObjects.Image,
      maxSize: 200,       // Cap pool size to prevent unbounded growth
      runChildUpdate: false // Only enable if children need per-frame updates
    });
  }

  spawn(x: number, y: number, texture: string): Phaser.GameObjects.Image {
    // get() pulls from inactive pool or creates new if under maxSize
    const bullet = this.get(x, y, texture) as Phaser.GameObjects.Image;
    if (!bullet) return null; // Pool exhausted

    bullet.setActive(true);
    bullet.setVisible(true);
    // Reset any modified properties
    bullet.setAlpha(1);
    bullet.setScale(1);
    bullet.setAngle(0);

    // Re-enable physics body if using physics
    if (bullet.body) {
      (bullet.body as Phaser.Physics.Arcade.Body).enable = true;
    }

    return bullet;
  }

  despawn(bullet: Phaser.GameObjects.Image): void {
    this.killAndHide(bullet); // Sets active=false, visible=false

    // Disable physics body to remove from collision checks
    if (bullet.body) {
      (bullet.body as Phaser.Physics.Arcade.Body).enable = false;
      (bullet.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    }

    // Stop any attached tweens or particle emitters
    this.scene.tweens.killTweensOf(bullet);
  }
}
```

**Pre-warming the pool to avoid first-frame allocation spikes:**

```typescript
create(): void {
  this.bulletPool = new BulletPool(this);
  // Pre-create 50 bullets in inactive state
  this.bulletPool.createMultiple({
    key: 'bullet',
    quantity: 50,
    active: false,
    visible: false
  });
}
```

### 2.2 Texture Atlas Usage

Texture atlases reduce draw calls dramatically. Phaser 3.50+ supports multi-texture batching, which means the entire game can render in a single draw call if textures are managed properly.

**Key rules:**
- Pack related sprites into a single atlas (use TexturePacker, ShoeBox, or free-texture-packer)
- A "spritesheet" in Phaser = uniform grid cells; an "atlas" = arbitrary frame positions/sizes
- Avoid mixing blend modes within a batch -- each new blend mode forces a WebGL batch flush
- Keep atlas dimensions as powers of 2 when targeting WebGL compressed textures (v3.60+)

```typescript
// Preload atlas (JSON Hash or JSON Array format)
preload(): void {
  this.load.atlas('gameSprites', 'sprites/game.png', 'sprites/game.json');
}

// Use specific frames from the atlas
create(): void {
  const player = this.add.sprite(100, 100, 'gameSprites', 'player_idle_01');
  // Animation using atlas frames
  this.anims.create({
    key: 'player_run',
    frames: this.anims.generateFrameNames('gameSprites', {
      prefix: 'player_run_',
      start: 1,
      end: 8,
      zeroPad: 2
    }),
    frameRate: 12,
    repeat: -1
  });
}
```

### 2.3 Particle System Efficiency

Since v3.60, ParticleEmitterManager is gone. Emitters are now direct GameObjects, which simplifies the display list but means you must manage their lifecycle explicitly.

```typescript
// Create emitter with bounded particle count
const emitter = this.add.particles(x, y, 'particleTexture', {
  speed: { min: 50, max: 150 },
  lifespan: 800,
  maxParticles: 30,        // Hard cap prevents runaway allocation
  frequency: 50,           // ms between emissions
  emitting: false          // Start paused, trigger manually
});

// Fire burst instead of continuous stream when possible
emitter.explode(20, x, y);

// CRITICAL: Stop and nullify emitters when their owner dies
function onEnemyDeath(enemy: Phaser.GameObjects.Sprite): void {
  if (enemy.getData('emitter')) {
    const emitter = enemy.getData('emitter') as Phaser.GameObjects.Particles.ParticleEmitter;
    emitter.stop();
    emitter.destroy();      // Remove from display list and scene
    enemy.setData('emitter', null);
  }
}
```

### 2.4 Render Pipeline Optimization

**Minimize draw call breaks:**
- Group sprites using the same texture together in the display list
- Avoid interleaving sprites from different atlases
- Blend mode changes flush the WebGL batch -- use `NORMAL` blend mode by default and group any `ADD` blend mode sprites together
- Each unique shader/pipeline also triggers a batch break

**BitmapText over Text:**
```typescript
// BAD: Text creates a canvas texture per instance, expensive to update
const label = this.add.text(10, 10, 'Score: 0', { fontSize: '24px' });

// GOOD: BitmapText uses pre-rendered font atlas, much cheaper
const label = this.add.bitmapText(10, 10, 'pixelFont', 'Score: 0', 24);
```

**Resolution management:**
```typescript
const config: Phaser.Types.Core.GameConfig = {
  width: 800,
  height: 600,
  // Lower resolution renders faster; scale up with CSS
  // Avoid 1920x1080 native if targeting mobile
  pixelArt: true,           // Disables anti-aliasing for pixel art games
  roundPixels: true,        // v3.85+ defaults to false; enable explicitly for pixel art
  fps: {
    target: 60,
    forceSetTimeOut: false   // Use requestAnimationFrame (default)
  }
};
```

### 2.5 Camera Culling

Phaser's camera automatically culls GameObjects outside the viewport, but only for objects added to the display list normally. Objects that are always "on screen" (UI elements) should live in a separate scene or use `setScrollFactor(0)`.

```typescript
// TilemapLayer culling is automatic -- only visible tiles render
// For custom culling of large numbers of sprites:
update(): void {
  const camera = this.cameras.main;
  const bounds = camera.worldView; // Phaser.Geom.Rectangle of visible area

  this.enemies.children.iterate((enemy: Phaser.GameObjects.Sprite) => {
    // Only run expensive logic (AI, pathfinding) for on-screen enemies
    const onScreen = bounds.contains(enemy.x, enemy.y);
    enemy.setActive(onScreen);
    // Physics bodies for off-screen entities can be disabled
    if (enemy.body) {
      (enemy.body as Phaser.Physics.Arcade.Body).enable = onScreen;
    }
  });
}
```

### 2.6 Tilemap Optimization

**Minimize layer count:** Each tilemap layer is a separate render pass. Flatten decorative layers where possible.

**RenderTexture caching for static layers:**
```typescript
// Pre-render static background layers into a single RenderTexture
create(): void {
  const rt = this.add.renderTexture(0, 0, this.map.widthInPixels, this.map.heightInPixels);
  rt.draw(this.backgroundLayer);
  rt.draw(this.decorationLayer);
  // Now destroy the original layers -- rt is cheaper to render
  this.backgroundLayer.destroy();
  this.decorationLayer.destroy();
}
```

**Tilemap collision gotcha:** The `collideTiles` method skips Phaser's "interesting faces" optimization for tilemap layers. This means players can snag on internal tile edges in a row of solid tiles. Use `layer.setCollision()` or `layer.setCollisionByProperty()` on TilemapLayers instead of raw `collideTiles`.

### 2.7 Avoiding GC Spikes

**Pre-allocate reusable objects outside the update loop:**

```typescript
// BAD: Allocates a new Vector2 every frame
update(): void {
  const direction = new Phaser.Math.Vector2(targetX - this.x, targetY - this.y);
  direction.normalize();
}

// GOOD: Reuse a pre-allocated vector
private _tempVec = new Phaser.Math.Vector2();

update(): void {
  this._tempVec.set(targetX - this.x, targetY - this.y).normalize();
}
```

**Avoid Array.splice in hot paths:**
```typescript
// BAD: splice is slow and generates garbage
this.activeEnemies.splice(index, 1);

// GOOD: Swap-and-pop for unordered arrays
const last = this.activeEnemies[this.activeEnemies.length - 1];
this.activeEnemies[index] = last;
this.activeEnemies.length--;
```

**Cache function references:**
```typescript
// BAD: Creates a new closure every frame
this.input.on('pointerdown', (pointer) => { this.handleClick(pointer); });

// GOOD: Bind once in create()
create(): void {
  this.handleClickBound = this.handleClick.bind(this);
  this.input.on('pointerdown', this.handleClickBound);
}
```

---

## 3. Physics Best Practices

### 3.1 Arcade Physics Body Size vs Display Size

The physics body and the visual sprite are independent. `setSize()` changes the physics body dimensions without affecting the displayed image. This is a major source of bugs.

```typescript
create(): void {
  const player = this.physics.add.sprite(100, 100, 'player');

  // Sprite is 64x64 pixels, but we want a tighter hitbox
  player.body.setSize(32, 56);   // Physics body is 32x56
  player.body.setOffset(16, 8);  // Center the smaller body on the sprite

  // ALWAYS enable debug mode during development to see body shapes
  // debug: true in physics config shows green rectangles/circles
}
```

**Common mistake:** Calling `setSize()` on the sprite instead of the body. `sprite.setSize()` changes the game object's size; `sprite.body.setSize()` changes the physics body.

**For circular bodies:**
```typescript
player.body.setCircle(16);          // Radius 16
player.body.setOffset(16, 16);     // Offset to center on 64x64 sprite
```

### 3.2 Collision Optimization with Collision Categories (v3.70+)

Collision categories are bitmask-based filters that prevent the physics engine from checking pairs that can never collide. This is far more efficient than process callbacks.

```typescript
create(): void {
  const CATEGORY = {
    PLAYER:       (1 << 0),  // 1
    ENEMY:        (1 << 1),  // 2
    PLAYER_BULLET:(1 << 2),  // 4
    ENEMY_BULLET: (1 << 3),  // 8
    WALL:         (1 << 4),  // 16
    PICKUP:       (1 << 5),  // 32
  };

  // Player collides with enemies, enemy bullets, walls, pickups
  player.setCollisionCategory(CATEGORY.PLAYER);
  player.setCollidesWith([
    CATEGORY.ENEMY,
    CATEGORY.ENEMY_BULLET,
    CATEGORY.WALL,
    CATEGORY.PICKUP
  ]);

  // Player bullets collide with enemies and walls only
  playerBulletGroup.children.iterate((bullet) => {
    bullet.setCollisionCategory(CATEGORY.PLAYER_BULLET);
    bullet.setCollidesWith([CATEGORY.ENEMY, CATEGORY.WALL]);
  });

  // Enemy bullets collide with player and walls only
  enemyBulletGroup.children.iterate((bullet) => {
    bullet.setCollisionCategory(CATEGORY.ENEMY_BULLET);
    bullet.setCollidesWith([CATEGORY.PLAYER, CATEGORY.WALL]);
  });
}
```

**v3.90 fix:** Collision categories now work correctly for individual objects within physics groups (was broken in earlier versions).

### 3.3 RTree Tuning

The RTree spatial index accelerates collision detection for moderate counts of dynamic bodies. However, it has crossover points:

```typescript
const config: Phaser.Types.Core.GameConfig = {
  physics: {
    default: 'arcade',
    arcade: {
      // Disable RTree for 5000+ dynamic bodies (brute force becomes faster)
      useTree: false,

      // Or tune the RTree node capacity for your object count
      // Default maxEntries is 16; increase for denser worlds
      // maxEntries: 32,

      // Static bodies ALWAYS use RTree (never cleared per frame) -- free benefit
    }
  }
};
```

### 3.4 Overlap vs Collider

```typescript
// COLLIDER: Detects collision AND separates bodies (physical response)
this.physics.add.collider(player, platforms);

// OVERLAP: Detects collision WITHOUT separation (trigger zones, pickups)
this.physics.add.overlap(player, coins, collectCoin, null, this);

// PROCESS CALLBACK: Conditional collision (return false to skip)
this.physics.add.collider(player, oneWayPlatform, null,
  (player, platform) => {
    // Only collide when falling down onto platform
    return (player.body as Phaser.Physics.Arcade.Body).velocity.y > 0;
  }, this
);
```

### 3.5 Immovable vs Static vs Pushable

```typescript
// STATIC BODY: Never moves, always in RTree, most efficient for platforms/walls
const platform = this.physics.add.staticSprite(400, 500, 'platform');
// Must call refreshBody() after repositioning a static body
platform.setPosition(400, 300);
platform.refreshBody();

// IMMOVABLE DYNAMIC: Has velocity/acceleration but ignores collision forces
const movingPlatform = this.physics.add.sprite(200, 400, 'platform');
movingPlatform.setImmovable(true);  // Collisions don't push it
movingPlatform.setVelocityX(100);   // But it can still move by code

// PUSHABLE (v3.70+): Controls whether collision forces transfer
const heavyEnemy = this.physics.add.sprite(300, 300, 'tank');
heavyEnemy.setPushable(false);       // Reflects all incoming velocity
heavyEnemy.setMass(5);               // Also affects momentum exchange

// SLIDE FACTOR (v3.70+): How much velocity a body retains after being pushed
player.setSlideFactor(0.5, 1.0);     // Keep 50% horizontal, 100% vertical velocity on push
```

### 3.6 Velocity Clamping and Tunneling Prevention

Fast-moving objects can pass through thin colliders (tunneling). Arcade physics has no built-in continuous collision detection.

```typescript
// Set max velocity to prevent physics explosion
player.setMaxVelocity(400, 600);

// For projectiles: make colliders thick enough relative to speed
// Rule of thumb: collider thickness > (maxVelocity * deltaTime)
// At 60fps, delta ~16ms: 400 velocity * 0.016 = ~6.4 pixels/frame
// So walls should be at least 8-10px thick

// Alternative: use overlap check with raycasting for very fast objects
update(time: number, delta: number): void {
  this.bullets.children.iterate((bullet: Phaser.GameObjects.Sprite) => {
    if (!bullet.active) return;
    const body = bullet.body as Phaser.Physics.Arcade.Body;
    // If bullet moved more than 32px in one frame, raycast
    if (body.speed > 2000) {
      const line = new Phaser.Geom.Line(
        body.prev.x, body.prev.y,
        body.position.x, body.position.y
      );
      const tiles = this.wallLayer.getTilesWithinShape(line);
      if (tiles.some(t => t.collides)) {
        this.bulletPool.despawn(bullet);
      }
    }
  });
}
```

### 3.7 Direct Control Mode (v3.70+)

When moving physics bodies via tweens or manual position changes, velocity calculations break. Direct control fixes this:

```typescript
// Moving a physics body via tween without directControl = broken velocity
// The body won't collide properly because velocity is 0

// CORRECT approach:
const draggable = this.physics.add.sprite(100, 100, 'block');
draggable.setDirectControl(true); // Body calculates velocity from position delta
// Now you can tween or drag it and collisions will work correctly
this.tweens.add({
  targets: draggable,
  x: 500,
  duration: 2000,
  ease: 'Sine.easeInOut'
});
```

---

## 4. State Management

### 4.1 Scene Lifecycle

Understanding scene states prevents the most common Phaser bugs:

| State | Active | Visible | Input | Enters Via |
|-------|--------|---------|-------|------------|
| PENDING | No | No | No | Before added to SceneManager |
| INIT | No | No | No | First boot |
| LOADING | No | Yes | Yes | preload() called |
| CREATING | Yes | Yes | Yes | create() called |
| RUNNING | Yes | Yes | Yes | create() completes |
| PAUSED | No | Yes | No | `scene.pause()` |
| SLEEPING | No | No | No | `scene.sleep()` |
| SHUTDOWN | No | No | No | `scene.stop()` |
| DESTROYED | No | No | No | `scene.remove()` |

**Shutdown vs Destroy:**
- `scene.stop()` / SHUTDOWN: Frees game objects, scene can be restarted. Use for scenes you revisit.
- `scene.remove()` / DESTROYED: Permanently removed. Cannot be reused. Use for one-time scenes.

### 4.2 The init() Reset Pattern

The single most common scene bug is state persisting across restarts. Variables set in the constructor or at class level persist because the scene instance is reused.

```typescript
class GameScene extends Phaser.Scene {
  private score: number;
  private lives: number;
  private enemies: Phaser.GameObjects.Group;

  // DO NOT initialize state here or in the constructor
  // score = 0;  // BAD -- persists across scene restarts

  init(data: { difficulty: string }): void {
    // ALWAYS reset mutable state in init()
    this.score = 0;
    this.lives = 3;
    // data parameter comes from scene.start('Game', { difficulty: 'hard' })
  }

  create(): void {
    this.enemies = this.add.group();
    // Scene-specific setup...

    // CRITICAL: Register shutdown handler to clean up
    this.events.on('shutdown', this.onShutdown, this);
  }

  private onShutdown(): void {
    // Clean up event listeners YOU registered (not Phaser's internal ones)
    this.input.off('pointerdown', this.handleClickBound);
    // Stop all tweens to prevent them running on dead objects
    this.tweens.killAll();
    // Clear references
    this.enemies = null;
  }
}
```

### 4.3 Data Persistence Between Scenes

**Option 1: Game Registry (recommended for global state)**

```typescript
// In any scene -- data is instantly available everywhere
this.registry.set('highScore', 9500);
this.registry.set('playerName', 'Rob');
this.registry.set('settings', { sfxVolume: 0.8, musicVolume: 0.5 });

// In another scene
const highScore = this.registry.get('highScore');

// React to changes across scenes
this.registry.events.on('changedata-highScore', (parent, value, previousValue) => {
  this.updateScoreboard(value);
});
```

**Option 2: Scene Data Manager (for scene-local state)**

```typescript
// Scoped to a single scene -- lost on shutdown unless manually preserved
this.data.set('waveNumber', 1);
const wave = this.data.get('waveNumber');

// Data change events
this.data.events.on('changedata-waveNumber', (parent, value) => {
  this.startWave(value);
});
```

**Option 3: Passing data between scenes via start/launch**

```typescript
// Scene A
this.scene.start('LevelComplete', {
  score: this.score,
  timeElapsed: this.elapsedTime,
  level: this.currentLevel
});

// Scene B -- receives in init()
init(data: { score: number; timeElapsed: number; level: number }): void {
  this.finalScore = data.score;
}
```

### 4.4 Event-Driven Communication

**Within a scene (scene events):**

```typescript
// Emit from anywhere in the scene
this.events.emit('player-damaged', { damage: 10, source: 'enemy' });

// Listen in another component
this.events.on('player-damaged', (data: { damage: number; source: string }) => {
  this.health -= data.damage;
  this.playHitAnimation();
});
```

**Cross-scene communication:**

```typescript
// Method 1: Registry events (fully decoupled)
this.registry.set('score', newScore);
// Any scene listening to registry changes gets notified

// Method 2: Scene event bridge (when scenes run in parallel)
const hudScene = this.scene.get('HUD') as HUDScene;
hudScene.events.emit('updateScore', this.score);

// Method 3: Direct call (tight coupling, use sparingly)
const hudScene = this.scene.get('HUD') as HUDScene;
hudScene.updateScore(this.score);
```

**Best practice:** Always access scenes through `this.scene.get()` (the Scene Plugin), never through `this.game.scene` directly.

### 4.5 HUD/UI as Parallel Scene

```typescript
// Game config -- HUD renders on top
const config: Phaser.Types.Core.GameConfig = {
  scene: [BootScene, GameScene, HUDScene]
};

// In GameScene.create():
this.scene.launch('HUD'); // Runs HUD in parallel

// HUD scrolls with nothing (stays fixed on screen)
class HUDScene extends Phaser.Scene {
  create(): void {
    // All elements here are screen-fixed by default
    // because this scene's camera has no scroll
    this.scoreText = this.add.bitmapText(10, 10, 'font', 'Score: 0');

    // Listen to game scene events
    const gameScene = this.scene.get('Game');
    gameScene.events.on('scoreChanged', (score: number) => {
      this.scoreText.setText(`Score: ${score}`);
    });

    // Clean up when game scene shuts down
    gameScene.events.on('shutdown', () => {
      this.scene.stop(); // Stop HUD too
    });
  }
}
```

---

## 5. Animation and Tweens

### 5.1 Sprite Animation Best Practices

```typescript
// Define animations once, ideally in a boot/preload scene
class BootScene extends Phaser.Scene {
  create(): void {
    // Global animations available to all sprites using this texture
    this.anims.create({
      key: 'player_idle',
      frames: this.anims.generateFrameNames('playerAtlas', {
        prefix: 'idle_',
        start: 0,
        end: 5,
        zeroPad: 2
      }),
      frameRate: 8,
      repeat: -1
    });

    this.anims.create({
      key: 'player_run',
      frames: this.anims.generateFrameNames('playerAtlas', {
        prefix: 'run_',
        start: 0,
        end: 7,
        zeroPad: 2
      }),
      frameRate: 12,
      repeat: -1
    });

    // Aseprite import (if using Aseprite for animation authoring)
    this.anims.createFromAseprite('characterSprite');
    // Creates all tagged animations automatically
  }
}
```

**Play with ignoreIfPlaying to prevent restart stutter:**
```typescript
update(): void {
  if (this.cursors.left.isDown) {
    this.player.play('player_run', true); // true = ignoreIfPlaying
    this.player.setFlipX(true);
  } else if (this.cursors.right.isDown) {
    this.player.play('player_run', true);
    this.player.setFlipX(false);
  } else {
    this.player.play('player_idle', true);
  }
}
```

**Animation mixing (transition blending):**
```typescript
// Define mix durations between animation pairs
this.anims.addMix('player_run', 'player_idle', 100);   // 100ms transition
this.anims.addMix('player_idle', 'player_jump', 50);    // 50ms transition
// Now when switching from run to idle, Phaser waits 100ms before starting idle
```

**Chaining animations:**
```typescript
// Queue animations to play in sequence
player.play('player_attack');
player.chain('player_idle');  // Plays after attack completes

// Clear the chain
player.chain().stop();
```

### 5.2 Animation State Machine Pattern

For complex characters, implement a state machine rather than if/else chains:

```typescript
type PlayerState = 'idle' | 'running' | 'jumping' | 'falling' | 'attacking' | 'hurt';

class PlayerAnimController {
  private sprite: Phaser.GameObjects.Sprite;
  private currentState: PlayerState = 'idle';

  private readonly stateAnimMap: Record<PlayerState, string> = {
    idle: 'player_idle',
    running: 'player_run',
    jumping: 'player_jump',
    falling: 'player_fall',
    attacking: 'player_attack',
    hurt: 'player_hurt'
  };

  private readonly transitions: Record<PlayerState, PlayerState[]> = {
    idle: ['running', 'jumping', 'attacking', 'hurt'],
    running: ['idle', 'jumping', 'attacking', 'hurt'],
    jumping: ['falling', 'hurt'],
    falling: ['idle', 'running', 'hurt'],  // Landing transitions
    attacking: ['idle', 'running', 'hurt'],
    hurt: ['idle']
  };

  constructor(sprite: Phaser.GameObjects.Sprite) {
    this.sprite = sprite;
  }

  transition(newState: PlayerState): boolean {
    if (newState === this.currentState) return false;
    if (!this.transitions[this.currentState]?.includes(newState)) return false;

    this.currentState = newState;
    const animKey = this.stateAnimMap[newState];
    this.sprite.play(animKey, true);

    // Handle one-shot animations (attack, hurt)
    if (newState === 'attacking' || newState === 'hurt') {
      this.sprite.once('animationcomplete', () => {
        this.transition('idle');
      });
    }

    return true;
  }

  getState(): PlayerState {
    return this.currentState;
  }
}
```

### 5.3 Tween Patterns for Game Feel

**Juice effects using tweens:**

```typescript
// Screen shake via camera
hitScreenShake(scene: Phaser.Scene, intensity = 5, duration = 100): void {
  scene.cameras.main.shake(duration, intensity / 1000);
}

// Sprite flash on damage
flashSprite(sprite: Phaser.GameObjects.Sprite, scene: Phaser.Scene): void {
  scene.tweens.add({
    targets: sprite,
    alpha: { from: 0.2, to: 1 },
    duration: 80,
    repeat: 3,
    yoyo: true
  });
}

// Scale pop on collect (satisfying pickup feel)
collectPop(sprite: Phaser.GameObjects.Sprite, scene: Phaser.Scene): void {
  scene.tweens.add({
    targets: sprite,
    scale: { from: 1, to: 1.5 },
    alpha: { from: 1, to: 0 },
    duration: 200,
    ease: 'Back.easeIn',
    onComplete: () => {
      sprite.setActive(false);
      sprite.setVisible(false);
    }
  });
}

// Bounce landing (squash and stretch)
landingSquash(sprite: Phaser.GameObjects.Sprite, scene: Phaser.Scene): void {
  scene.tweens.add({
    targets: sprite,
    scaleX: { from: 1.3, to: 1 },
    scaleY: { from: 0.7, to: 1 },
    duration: 150,
    ease: 'Bounce.easeOut'
  });
}
```

**Tween chaining with timelines:**

```typescript
// Sequential animation chain
const chain = this.tweens.chain({
  targets: boss,
  tweens: [
    { y: '-=100', duration: 500, ease: 'Sine.easeOut' },       // Rise up
    { angle: 360, duration: 300, ease: 'Linear' },              // Spin
    { y: '+=100', duration: 300, ease: 'Bounce.easeOut' },      // Slam down
    { scaleX: 1.5, scaleY: 0.5, duration: 100, yoyo: true }    // Impact squash
  ],
  loop: -1,
  loopDelay: 2000
});
```

**Staggered group animations:**

```typescript
// Stagger menu items appearing
this.tweens.add({
  targets: menuItems,           // Array of game objects
  y: { from: -50, to: 0 },     // Slide in from above (relative to each item's position)
  alpha: { from: 0, to: 1 },
  duration: 400,
  ease: 'Back.easeOut',
  delay: this.tweens.stagger(100) // 0ms, 100ms, 200ms, 300ms...
});
```

**Key easing functions for game feel:**
- `Back.easeOut` -- overshoot and settle (UI elements appearing)
- `Bounce.easeOut` -- bouncy landing
- `Elastic.easeOut` -- springy, wobbly settle (notifications)
- `Sine.easeInOut` -- smooth looping motion (hovering items)
- `Cubic.easeIn` -- accelerating (falling, charging)
- `Expo.easeOut` -- fast start, gradual stop (dash movement)

### 5.4 Tween Counter for Non-Object Animations

```typescript
// Animate a numeric value (for score counting, health bars, etc.)
this.tweens.addCounter({
  from: oldScore,
  to: newScore,
  duration: 500,
  ease: 'Linear',
  onUpdate: (tween) => {
    const value = Math.round(tween.getValue());
    this.scoreText.setText(`Score: ${value}`);
  }
});
```

---

## 6. Input Handling

### 6.1 Unified Input Abstraction

The key pattern for multi-platform games is an input abstraction layer that normalizes keyboard, gamepad, and touch into a single interface:

```typescript
interface GameInput {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  jump: boolean;
  attack: boolean;
  justJumped: boolean;
  justAttacked: boolean;
  aimX: number;  // -1 to 1
  aimY: number;  // -1 to 1
}

class InputManager {
  private scene: Phaser.Scene;
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys: { [key: string]: Phaser.Input.Keyboard.Key };
  private gamepad: Phaser.Input.Gamepad.Gamepad | null = null;
  private input: GameInput;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.cursors = scene.input.keyboard.createCursorKeys();
    this.keys = {
      W: scene.input.keyboard.addKey('W'),
      A: scene.input.keyboard.addKey('A'),
      S: scene.input.keyboard.addKey('S'),
      D: scene.input.keyboard.addKey('D'),
      SPACE: scene.input.keyboard.addKey('SPACE'),
      Z: scene.input.keyboard.addKey('Z'),
    };
    this.input = this.createEmptyInput();

    // Listen for gamepad connection
    scene.input.gamepad.once('connected', (pad: Phaser.Input.Gamepad.Gamepad) => {
      this.gamepad = pad;
    });
  }

  private createEmptyInput(): GameInput {
    return {
      left: false, right: false, up: false, down: false,
      jump: false, attack: false,
      justJumped: false, justAttacked: false,
      aimX: 0, aimY: 0
    };
  }

  /** Call at the START of each update() before game logic */
  poll(): GameInput {
    const kb = this.readKeyboard();
    const gp = this.readGamepad();

    // Merge: either source can trigger an action
    this.input = {
      left:   kb.left   || gp.left,
      right:  kb.right  || gp.right,
      up:     kb.up     || gp.up,
      down:   kb.down   || gp.down,
      jump:   kb.jump   || gp.jump,
      attack: kb.attack || gp.attack,
      justJumped:   kb.justJumped   || gp.justJumped,
      justAttacked: kb.justAttacked || gp.justAttacked,
      // Prefer gamepad aim if stick is active, otherwise use keyboard direction
      aimX: Math.abs(gp.aimX) > 0.2 ? gp.aimX : (kb.right ? 1 : kb.left ? -1 : 0),
      aimY: Math.abs(gp.aimY) > 0.2 ? gp.aimY : (kb.down ? 1 : kb.up ? -1 : 0)
    };

    return this.input;
  }

  private readKeyboard(): GameInput {
    return {
      left:   this.cursors.left.isDown  || this.keys.A.isDown,
      right:  this.cursors.right.isDown || this.keys.D.isDown,
      up:     this.cursors.up.isDown    || this.keys.W.isDown,
      down:   this.cursors.down.isDown  || this.keys.S.isDown,
      jump:   this.keys.SPACE.isDown,
      attack: this.keys.Z.isDown,
      justJumped:   Phaser.Input.Keyboard.JustDown(this.keys.SPACE),
      justAttacked: Phaser.Input.Keyboard.JustDown(this.keys.Z),
      aimX: 0, aimY: 0
    };
  }

  private readGamepad(): GameInput {
    const empty = this.createEmptyInput();
    if (!this.gamepad) return empty;

    const pad = this.gamepad;
    const deadzone = 0.2;
    const leftX = pad.axes.length > 0 ? pad.axes[0].getValue() : 0;
    const leftY = pad.axes.length > 1 ? pad.axes[1].getValue() : 0;

    return {
      left:   leftX < -deadzone || pad.left,
      right:  leftX > deadzone  || pad.right,
      up:     leftY < -deadzone || pad.up,
      down:   leftY > deadzone  || pad.down,
      jump:   pad.A,
      attack: pad.X,
      justJumped:   pad.A, // Gamepad lacks JustDown; see input buffering below
      justAttacked: pad.X,
      aimX: Math.abs(leftX) > deadzone ? leftX : 0,
      aimY: Math.abs(leftY) > deadzone ? leftY : 0
    };
  }
}
```

**Gamepad L2/R2 gotcha:** L2 and R2 (triggers) report as analog axes (0 to 1), not boolean buttons. Threshold them:

```typescript
const l2Pressed = pad.L2 > 0.9; // Treat as button press above 90%
```

### 6.2 Input Buffering for Action Games

Input buffering stores recent inputs for a short window, allowing players to press a button slightly before the action is possible (e.g., pressing jump just before landing). This makes games feel far more responsive.

```typescript
class InputBuffer {
  private buffer: Map<string, number> = new Map();
  private readonly bufferWindowMs: number;

  constructor(bufferWindowMs = 100) {
    this.bufferWindowMs = bufferWindowMs;
  }

  /** Record that an action was pressed this frame */
  press(action: string, time: number): void {
    this.buffer.set(action, time);
  }

  /** Check if action was pressed within the buffer window */
  consume(action: string, time: number): boolean {
    const pressTime = this.buffer.get(action);
    if (pressTime !== undefined && (time - pressTime) < this.bufferWindowMs) {
      this.buffer.delete(action); // Consume the input (one-shot)
      return true;
    }
    return false;
  }

  clear(): void {
    this.buffer.clear();
  }
}

// Usage in update():
update(time: number, delta: number): void {
  const input = this.inputManager.poll();

  // Record buffered inputs on justPressed
  if (input.justJumped) {
    this.inputBuffer.press('jump', time);
  }

  // Consume buffered jump when player lands
  if (this.player.body.onFloor() && this.inputBuffer.consume('jump', time)) {
    this.player.setVelocityY(-400);
    this.animController.transition('jumping');
  }
}
```

### 6.3 Touch / Virtual Joystick for Mobile

The recommended plugin is `rexVirtualJoystick` from the rexrainbow plugin suite:

```typescript
// Using rexrainbow virtual joystick plugin
preload(): void {
  this.load.plugin(
    'rexvirtualjoystickplugin',
    'https://raw.githubusercontent.com/rexrainbow/phaser3-rex-notes/master/dist/rexvirtualjoystickplugin.min.js',
    true
  );
}

create(): void {
  // Only create joystick on touch devices
  if (!this.sys.game.device.input.touch) return;

  this.joystick = (this.plugins.get('rexvirtualjoystickplugin') as any).add(this, {
    x: 150,
    y: this.scale.height - 150,
    radius: 80,
    base: this.add.circle(0, 0, 80, 0x888888, 0.5),
    thumb: this.add.circle(0, 0, 40, 0xcccccc, 0.8),
    dir: '8dir',     // 4dir, 8dir, or up&down or left&right
    forceMin: 16,    // Minimum force to register
    enable: true
  });
}

// Read in update -- exposes cursorKeys-compatible interface
update(): void {
  if (this.joystick) {
    const left = this.joystick.left;
    const right = this.joystick.right;
    const force = this.joystick.force; // 0 to radius
    const angle = this.joystick.angle; // degrees
  }
}
```

### 6.4 Input Best Practices

- Only enable `setInteractive()` on objects that need click/touch detection -- each interactive object adds overhead to the input hit-test loop
- Use `topOnly: true` (default) to stop pointer events from propagating through overlapping objects
- `pixelPerfect` hit detection is expensive -- use geometric hit areas instead unless absolutely necessary
- Disable scene input during transitions: `this.input.enabled = false`

---

## 7. Audio Best Practices

### 7.1 Handling Browser Autoplay Restrictions

Modern browsers block audio until user interaction. Phaser handles this automatically, but you need to design around it:

```typescript
create(): void {
  // Check if audio is locked (waiting for user interaction)
  if (this.sound.locked) {
    // Show a "tap to start" overlay
    const overlay = this.add.text(400, 300, 'Tap to Start', {
      fontSize: '32px'
    }).setOrigin(0.5).setInteractive();

    // Listen for unlock event
    this.sound.once(Phaser.Sound.Events.UNLOCKED, () => {
      overlay.destroy();
      this.startGame();
    });
  } else {
    // Audio already unlocked (desktop with prior interaction)
    this.startGame();
  }
}

private startGame(): void {
  this.bgMusic = this.sound.add('bgMusic', { loop: true, volume: 0.5 });
  this.bgMusic.play();
}
```

**The "1 AudioContext was not allowed to start" console warning is normal and expected.** Do not try to suppress it.

### 7.2 iOS Safari Audio Focus Handling

iOS has specific issues with audio when the browser loses/gains focus:

```typescript
create(): void {
  // Disable Phaser's automatic pause-on-blur (broken on iOS)
  this.sound.pauseOnBlur = false;

  // Manually handle focus changes with BOTH events
  this.game.events.on(Phaser.Core.Events.BLUR, this.onBlur, this);
  document.addEventListener('visibilitychange', this.onVisibilityChange.bind(this));
}

private onBlur(): void {
  if (this.bgMusic?.isPlaying) {
    this.bgMusic.pause();
    this.showPauseOverlay();
  }
}

private onVisibilityChange(): void {
  if (document.hidden) {
    this.onBlur();
  }
  // Do NOT auto-resume -- let the player tap to resume
}
```

**v3.88 fix:** iOS 17.5.1+ Safari sound dropout after focus loss/gain has been fixed.

### 7.3 Audio Sprite Pattern

Combine multiple short sound effects into a single audio file with a JSON marker map. Reduces HTTP requests and loading time.

```typescript
preload(): void {
  // Audio sprite: single file with multiple sounds
  this.load.audioSprite('sfx', 'audio/sfx.json', [
    'audio/sfx.ogg',
    'audio/sfx.mp3'
  ]);
}

create(): void {
  // Play a specific marker from the audio sprite
  this.sound.playAudioSprite('sfx', 'explosion');
  this.sound.playAudioSprite('sfx', 'coin_pickup');
  this.sound.playAudioSprite('sfx', 'jump');
}
```

The JSON format follows the audiosprite tool convention (https://github.com/tonistiigi/audiosprite).

### 7.4 Music Crossfading

```typescript
crossfadeMusic(fromKey: string, toKey: string, duration = 1000): void {
  const oldMusic = this.sound.get(fromKey);
  const newMusic = this.sound.add(toKey, { loop: true, volume: 0 });
  newMusic.play();

  // Fade out old
  if (oldMusic) {
    this.tweens.add({
      targets: oldMusic,
      volume: 0,
      duration: duration,
      onComplete: () => {
        oldMusic.stop();
        oldMusic.destroy();
      }
    });
  }

  // Fade in new
  this.tweens.add({
    targets: newMusic,
    volume: 0.5,
    duration: duration
  });
}
```

### 7.5 Spatial Audio (Web Audio Only)

```typescript
const config: Phaser.Types.Core.GameConfig = {
  audio: {
    // Ensure Web Audio is used (default, but be explicit)
    disableWebAudio: false
  }
};

create(): void {
  // Set listener position (typically the player/camera)
  this.sound.setListenerPosition(this.player.x, this.player.y);

  // Create sound with spatial properties
  const explosionSound = this.sound.add('explosion', {
    source: {
      x: enemyX,
      y: enemyY,
      refDistance: 100,    // Distance at which volume is 100%
      maxDistance: 1000,   // Beyond this, volume is 0
      rolloffFactor: 1,   // How quickly volume drops with distance
      panningModel: 'equalpower' // or 'HRTF' for 3D audio
    }
  });
}

update(): void {
  // Update listener position to follow player
  this.sound.setListenerPosition(this.player.x, this.player.y);
}
```

### 7.6 Audio Format Recommendations

- **MP3**: Broadest compatibility, good default
- **OGG**: Better compression, not supported on Safari/iOS
- **Provide both formats** and let Phaser pick: `this.load.audio('bgm', ['bgm.ogg', 'bgm.mp3'])`
- Mismatched formats fail silently -- always provide a fallback format

---

## 8. Memory Management

### 8.1 Texture Cleanup

Textures are the biggest memory consumers. Phaser's TextureManager does not automatically free textures when scenes change.

```typescript
// Remove a specific texture
this.textures.remove('temporaryTexture');

// Remove all textures loaded for this scene
// WARNING: Don't remove textures shared with other scenes
private onShutdown(): void {
  const sceneTextures = ['level5_bg', 'level5_enemies', 'level5_props'];
  sceneTextures.forEach(key => {
    if (this.textures.exists(key)) {
      this.textures.remove(key);
    }
  });
}
```

**Known issue:** Even after calling `textures.remove()`, the browser may not immediately reclaim the memory. The GL texture is deleted, but the JavaScript GC needs to collect the associated objects. This is especially noticeable in Safari, which can hold onto Canvas references from RenderTextures.

### 8.2 Scene Shutdown vs Destroy Cleanup

```typescript
class GameScene extends Phaser.Scene {
  create(): void {
    // Register cleanup handlers
    this.events.on('shutdown', this.handleShutdown, this);
    this.events.on('destroy', this.handleDestroy, this);
  }

  /** Called on scene.stop() -- scene can be restarted */
  private handleShutdown(): void {
    // 1. Remove custom event listeners
    this.input.off('pointerdown');
    this.registry.events.off('changedata-score', this.onScoreChange, this);

    // 2. Stop all scene tweens
    this.tweens.killAll();

    // 3. Stop particle emitters (they continue running otherwise)
    this.children.list.forEach(child => {
      if (child instanceof Phaser.GameObjects.Particles.ParticleEmitter) {
        child.stop();
      }
    });

    // 4. Stop all timers
    this.time.removeAllEvents();

    // 5. Nullify references to allow GC
    this.player = null;
    this.enemies = null;
  }

  /** Called on scene.remove() -- scene is permanently destroyed */
  private handleDestroy(): void {
    // Remove textures only used by this scene
    this.textures.remove('level_specific_atlas');
    // Remove audio only used by this scene
    this.cache.audio.remove('level_music');
  }
}
```

### 8.3 Asset Loading Strategies

**Lazy loading by level/scene:**

```typescript
class Level1Scene extends Phaser.Scene {
  preload(): void {
    // Only load assets needed for this level
    this.load.atlas('level1_sprites', 'level1/sprites.png', 'level1/sprites.json');
    this.load.tilemapTiledJSON('level1_map', 'level1/map.json');
    this.load.audio('level1_music', ['level1/music.ogg', 'level1/music.mp3']);
  }
}

// In a boot scene, load only shared/global assets
class BootScene extends Phaser.Scene {
  preload(): void {
    // Shared assets persist across all scenes
    this.load.atlas('ui', 'shared/ui.png', 'shared/ui.json');
    this.load.atlas('player', 'shared/player.png', 'shared/player.json');
    this.load.bitmapFont('mainFont', 'shared/font.png', 'shared/font.fnt');
    this.load.audioSprite('sfx', 'shared/sfx.json', ['shared/sfx.ogg', 'shared/sfx.mp3']);
  }
}
```

**Loading screen with progress:**

```typescript
class LoadScene extends Phaser.Scene {
  preload(): void {
    const progressBar = this.add.graphics();
    const progressBox = this.add.graphics();
    progressBox.fillStyle(0x222222, 0.8);
    progressBox.fillRect(240, 270, 320, 50);

    this.load.on('progress', (value: number) => {
      progressBar.clear();
      progressBar.fillStyle(0xffffff, 1);
      progressBar.fillRect(250, 280, 300 * value, 30);
    });

    this.load.on('complete', () => {
      progressBar.destroy();
      progressBox.destroy();
      this.scene.start('Game');
    });

    // Queue all assets for the next scene
    this.load.atlas('level1', 'assets/level1.png', 'assets/level1.json');
    // ...
  }
}
```

### 8.4 Event Listener Memory Leak Prevention

The most common memory leak in Phaser 3 is unremoved event listeners. Every `.on()` call without a corresponding `.off()` in the shutdown handler is a potential leak.

```typescript
class GameScene extends Phaser.Scene {
  // Store bound references so we can remove them later
  private onScoreChangeBound: Function;
  private onEnemyDeathBound: Function;

  create(): void {
    // Bind once, store reference
    this.onScoreChangeBound = this.onScoreChange.bind(this);
    this.onEnemyDeathBound = this.onEnemyDeath.bind(this);

    // Register listeners
    this.registry.events.on('changedata-score', this.onScoreChangeBound);
    this.events.on('enemyDeath', this.onEnemyDeathBound);

    // Use .once() for one-shot listeners (auto-removes after first call)
    this.input.once('pointerdown', this.handleFirstClick, this);

    // ALWAYS clean up in shutdown
    this.events.on('shutdown', () => {
      this.registry.events.off('changedata-score', this.onScoreChangeBound);
      this.events.off('enemyDeath', this.onEnemyDeathBound);
    });
  }

  private onScoreChange(): void { /* ... */ }
  private onEnemyDeath(): void { /* ... */ }
  private handleFirstClick(): void { /* ... */ }
}
```

**Rule:** Only remove listeners that you explicitly created. Do not remove Phaser's internal listeners.

---

## 9. Common Pitfalls

### 9.1 State Not Resetting on Scene Restart

**Problem:** Class-level property initializers run once (in the constructor). When a scene restarts via `scene.restart()`, `init()` and `create()` are called again, but the constructor is not.

```typescript
// BUG: score persists across restarts
class GameScene extends Phaser.Scene {
  private score = 0; // Only set once, in constructor
}

// FIX: Reset in init()
class GameScene extends Phaser.Scene {
  private score: number;
  init(): void {
    this.score = 0;
  }
}
```

### 9.2 Operating on Destroyed Objects

**Problem:** Callbacks (tweens, timers, physics) fire after scene shutdown, referencing destroyed objects.

```typescript
// BUG: Timer fires after scene is stopped, sprite no longer exists
this.time.delayedCall(2000, () => {
  this.player.setAlpha(1); // TypeError: Cannot read property of null
});

// FIX: Guard callbacks or clean up timers
this.time.delayedCall(2000, () => {
  if (this.player?.active) {
    this.player.setAlpha(1);
  }
});
// AND in shutdown handler:
this.time.removeAllEvents();
```

### 9.3 Physics Body vs Sprite Size Confusion

**Problem:** `sprite.setSize()` vs `sprite.body.setSize()` do different things.

```typescript
// sprite.setSize(w, h) -- changes the game object's internal size
// sprite.body.setSize(w, h) -- changes the physics body dimensions
// These are completely independent

// Always use body methods for physics:
player.body.setSize(32, 48);
player.body.setOffset(16, 16);
```

### 9.4 Static Body Not Updating After Position Change

```typescript
// BUG: Static body doesn't move with the sprite
platform.setPosition(newX, newY);
// Physics body is still at old position!

// FIX: Call refreshBody() after any position change
platform.setPosition(newX, newY);
platform.refreshBody();
```

### 9.5 Tilemap Tile Edge Snagging

**Problem:** Players get stuck on internal edges of adjacent solid tiles when using raw collision methods.

```typescript
// BAD: collideTiles skips "interesting faces" optimization
this.physics.collideTiles(player, tiles);

// GOOD: Use TilemapLayer collision methods
this.wallLayer.setCollisionByProperty({ collides: true });
this.physics.add.collider(player, this.wallLayer);
// Phaser automatically handles interesting faces, preventing edge snagging
```

### 9.6 Text Rendering Performance

```typescript
// BAD: Text objects create a canvas texture, expensive to update frequently
update(): void {
  this.scoreText.setText(`Score: ${this.score}`); // Creates new texture every call
}

// GOOD: Use BitmapText for frequently updated text
this.scoreText = this.add.bitmapText(10, 10, 'pixelFont', '', 16);
// BitmapText uses a pre-rendered atlas, updates are just geometry changes

// ALTERNATIVE: Only update Text when value actually changes
update(): void {
  if (this.score !== this.lastDisplayedScore) {
    this.scoreText.setText(`Score: ${this.score}`);
    this.lastDisplayedScore = this.score;
  }
}
```

### 9.7 Blend Mode Batch Flush

```typescript
// BAD: Alternating blend modes causes constant batch flushes
// sprite1 (NORMAL) -> sprite2 (ADD) -> sprite3 (NORMAL) -> sprite4 (ADD)
// = 4 draw calls

// GOOD: Group same blend modes together on the display list
// sprite1 (NORMAL) -> sprite3 (NORMAL) -> sprite2 (ADD) -> sprite4 (ADD)
// = 2 draw calls

// Use setDepth() to control render order without physical reordering
normalSprites.forEach(s => s.setDepth(0));
additiveSprites.forEach(s => s.setDepth(1));
```

### 9.8 Creating Objects in update()

```typescript
// BAD: Creating new objects every frame
update(): void {
  const trail = this.add.image(this.player.x, this.player.y, 'trail');
  this.tweens.add({ targets: trail, alpha: 0, duration: 300 });
  // MEMORY LEAK: trail objects accumulate, textures never freed
}

// GOOD: Use object pool
update(): void {
  const trail = this.trailPool.spawn(this.player.x, this.player.y, 'trail');
  this.tweens.add({
    targets: trail,
    alpha: 0,
    duration: 300,
    onComplete: () => this.trailPool.despawn(trail)
  });
}
```

### 9.9 Forgetting to Handle delta in update()

```typescript
// BAD: Frame-rate dependent movement
update(): void {
  this.player.x += 5; // 300 px/s at 60fps, 150 px/s at 30fps
}

// GOOD: Delta-time based movement
update(time: number, delta: number): void {
  const speed = 300; // pixels per second
  this.player.x += speed * (delta / 1000);
  // Consistent 300 px/s regardless of frame rate
}

// NOTE: Physics bodies handle this automatically via velocity
// Only use delta manually for non-physics movement
```

### 9.10 roundPixels Behavior Change in v3.85+

```typescript
// Pre-v3.85: roundPixels defaulted to true
// Post-v3.85: roundPixels defaults to false

// If your pixel art game looks blurry after upgrading:
const config: Phaser.Types.Core.GameConfig = {
  pixelArt: true,       // Disables anti-aliasing
  roundPixels: true,    // Must explicitly enable now
};
```

---

## Sources

- [How I optimized my Phaser 3 action game in 2025](https://phaser.io/news/2025/03/how-i-optimized-my-phaser-3-action-game-in-2025)
- [Object Pooling in Phaser 3 (Ourcade)](https://blog.ourcade.co/posts/2020/phaser-3-optimization-object-pool-class/)
- [Phaser 3 Scenes Documentation](https://docs.phaser.io/phaser/concepts/scenes)
- [Cross-Scene Communication](https://docs.phaser.io/phaser/concepts/scenes/cross-scene-communication)
- [Phaser 3 Data Manager](https://docs.phaser.io/phaser/concepts/data-manager)
- [Scene Lifecycle (DeepWiki)](https://deepwiki.com/phaserjs/phaser/3.1-scene-lifecycle)
- [Phaser 3 Arcade Physics](https://docs.phaser.io/phaser/concepts/physics/arcade)
- [Arcade Physics World API](https://docs.phaser.io/api-documentation/class/physics-arcade-world)
- [Phaser 3 Audio Documentation](https://docs.phaser.io/phaser/concepts/audio)
- [Web Audio Best Practices (Ourcade)](https://blog.ourcade.co/posts/2020/phaser-3-web-audio-best-practices-games/)
- [Phaser 3 Input Guide](https://docs.phaser.io/phaser/concepts/input)
- [Phaser 3 Animations](https://docs.phaser.io/phaser/concepts/animations)
- [Phaser 3 Tweens (Rex Notes)](https://rexrainbow.github.io/phaser3-rex-notes/docs/site/tween/)
- [Phaser v3.90.0 Release](https://github.com/phaserjs/phaser/discussions/7149)
- [Phaser v3.88 Release](https://github.com/phaserjs/phaser/blob/master/changelog/3.88/CHANGELOG-v3.88.md)
- [Phaser v3.85 Changelog](https://github.com/phaserjs/phaser/blob/master/changelog/3.85/CHANGELOG-v3.85.md)
- [Tips on Speeding Up Phaser Games](https://gist.github.com/MarcL/748f29faecc6e3aa679a385bffbdf6fe)
- [Phaser 3 Best/Bad Practices (Forum)](https://phaser.discourse.group/t/what-are-phaser-3-bad-best-practices/5088)
- [Phaser 3 Performance Discussion](https://phaser.discourse.group/t/best-way-to-increase-performance-in-general/5948)
- [Event Listener Disposal (Forum)](https://phaser.discourse.group/t/do-i-need-to-manually-dispose-of-event-listeners/13429)
- [Phaser 3 Memory Leak Issues](https://github.com/photonstorm/phaser/issues/5456)
- [Merged Input Plugin (Keyboard + Gamepad)](https://github.com/GaryStanton/phaser3-merged-input)
- [Handling Inputs in Phaser 3 (khutchins)](https://blog.khutchins.com/posts/phaser-3-inputs-2/)
- [Virtual Joystick Plugin (Rex)](https://rexrainbow.github.io/phaser3-rex-notes/docs/site/virtualjoystick/)
- [Tilemap Performance Discussion](https://phaser.discourse.group/t/performance-of-really-big-tile-maps/1192)
- [Phaser Download (v3.90.0)](https://phaser.io/download/stable)
