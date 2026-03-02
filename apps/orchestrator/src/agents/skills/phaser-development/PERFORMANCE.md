# Phaser 3 Performance Optimization

## Object Pooling

Object pooling prevents GC pauses in action games. Never use `new` in the update loop.

```typescript
// Group-based object pool
class BulletPool extends Phaser.GameObjects.Group {
  constructor(scene: Phaser.Scene) {
    super(scene, {
      classType: Phaser.GameObjects.Image,
      maxSize: 200,
      runChildUpdate: false,
    });
  }

  spawn(x: number, y: number, texture: string): Phaser.GameObjects.Image | null {
    const bullet = this.get(x, y, texture) as Phaser.GameObjects.Image;
    if (!bullet) return null; // Pool exhausted

    bullet.setActive(true).setVisible(true).setAlpha(1).setScale(1);
    if (bullet.body) {
      (bullet.body as Phaser.Physics.Arcade.Body).enable = true;
    }
    return bullet;
  }

  despawn(bullet: Phaser.GameObjects.Image): void {
    this.killAndHide(bullet);
    if (bullet.body) {
      (bullet.body as Phaser.Physics.Arcade.Body).enable = false;
      (bullet.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    }
    this.scene.tweens.killTweensOf(bullet);
  }
}
```

**Pre-warm pools** to avoid first-frame allocation spikes:

```typescript
create(): void {
  this.bulletPool = new BulletPool(this);
  this.bulletPool.createMultiple({ key: 'bullet', quantity: 50, active: false, visible: false });
}
```

## BitmapText over Text

`this.add.text()` creates a canvas texture per instance — expensive to update. Use BitmapText for HUD elements that change frequently.

```typescript
// BAD: Re-renders canvas texture on every setText()
const label = this.add.text(10, 10, 'Score: 0', { fontSize: '24px' });

// GOOD: Uses pre-rendered font atlas, much cheaper
const label = this.add.bitmapText(10, 10, 'pixelFont', 'Score: 0', 24);
```

## GC Avoidance

```typescript
// BAD: Allocates a new Vector2 every frame
update(): void {
  const direction = new Phaser.Math.Vector2(targetX - this.x, targetY - this.y);
}

// GOOD: Reuse a pre-allocated vector
private _tempVec = new Phaser.Math.Vector2();

update(): void {
  this._tempVec.set(targetX - this.x, targetY - this.y).normalize();
}
```

**Swap-and-pop for unordered array removal:**

```typescript
// BAD: splice shifts all elements, generates garbage
this.activeEnemies.splice(index, 1);

// GOOD: Swap last element into the removed slot
const last = this.activeEnemies[this.activeEnemies.length - 1];
this.activeEnemies[index] = last;
this.activeEnemies.length--;
```

**Cache function references — bind once in create():**

```typescript
create(): void {
  this._handleClickBound = this.handleClick.bind(this);
  this.input.on('pointerdown', this._handleClickBound);
}
```

## Camera Culling

Only run expensive logic (AI, pathfinding) for on-screen entities:

```typescript
update(): void {
  const bounds = this.cameras.main.worldView;

  this.enemies.children.iterate((enemy: Phaser.GameObjects.Sprite) => {
    const onScreen = bounds.contains(enemy.x, enemy.y);
    enemy.setActive(onScreen);
    if (enemy.body) {
      (enemy.body as Phaser.Physics.Arcade.Body).enable = onScreen;
    }
  });
}
```

## Particle Lifecycle

Cap particle count and clean up emitters when owners die:

```typescript
const emitter = this.add.particles(x, y, 'particleTexture', {
  speed: { min: 50, max: 150 },
  lifespan: 800,
  maxParticles: 30,
  frequency: 50,
  emitting: false,
});

// Fire burst instead of continuous stream
emitter.explode(20, x, y);

// Clean up on owner death
function onEnemyDeath(enemy: Phaser.GameObjects.Sprite): void {
  const emitter = enemy.getData('emitter') as Phaser.GameObjects.Particles.ParticleEmitter;
  if (emitter) {
    emitter.stop();
    emitter.destroy();
    enemy.setData('emitter', null);
  }
}
```

## Render Pipeline

- **Group same-texture sprites** together in the display list to minimize draw calls
- **Avoid interleaving blend modes** — each change flushes the WebGL batch
- Use `NORMAL` blend mode by default; group any `ADD` blend sprites together

**Pixel art games** — explicitly set in config:

```typescript
const config: Phaser.Types.Core.GameConfig = {
  pixelArt: true,      // Disables anti-aliasing
  roundPixels: true,   // v3.85+ defaults to false — enable for pixel art
};
```
