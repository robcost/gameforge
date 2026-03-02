# Phaser 3 Common Pitfalls

## 1. State Not Resetting on Scene Restart

The #1 Phaser 3 bug. Scene instances are reused — variables set at class level persist across restarts.

```typescript
// BAD: score persists when scene restarts
class GameScene extends Phaser.Scene {
  private score = 0;  // Set once, never reset
}

// GOOD: Reset all mutable state in init()
class GameScene extends Phaser.Scene {
  private score!: number;
  private lives!: number;

  init(): void {
    this.score = 0;
    this.lives = 3;
  }
}
```

**Also register a shutdown handler** to clean up event listeners and tweens:

```typescript
create(): void {
  this.events.on('shutdown', () => {
    this.input.off('pointerdown', this._handleClickBound);
    this.tweens.killAll();
  });
}
```

## 2. Operating on Destroyed Objects

Callbacks can fire after a sprite is destroyed, causing null reference errors.

```typescript
// BAD: enemy may be destroyed before callback fires
this.time.delayedCall(500, () => {
  enemy.setTint(0xffffff);  // Crash if enemy was destroyed
});

// GOOD: Guard with active check
this.time.delayedCall(500, () => {
  if (enemy.active) enemy.setTint(0xffffff);
});
```

## 3. Physics Body vs Display Size Confusion

`sprite.setSize()` changes the game object. `sprite.body.setSize()` changes the physics hitbox.

```typescript
// BAD: Changes display size, not physics body
player.setSize(32, 56);

// GOOD: Change physics body and center it on the sprite
player.body.setSize(32, 56);
player.body.setOffset(16, 4);  // Center smaller body on 64x64 sprite
```

## 4. Forgetting refreshBody() on Static Bodies

Static bodies cache their position in the RTree. Moving them without refresh breaks collision.

```typescript
// BAD: Platform moves but collision stays at old position
platform.setPosition(400, 300);

// GOOD: Always refresh after moving or resizing
platform.setPosition(400, 300);
platform.refreshBody();
```

## 5. Text Rendering Performance

Every `setText()` re-renders a canvas texture. This is expensive for frequently updated HUD elements.

```typescript
// BAD: Calls setText() every frame
update(): void {
  this.scoreText.setText(`Score: ${this.score}`);
}

// GOOD: Only update when value changes
update(): void {
  if (this.score !== this._lastScore) {
    this.scoreText.setText(`Score: ${this.score}`);
    this._lastScore = this.score;
  }
}

// BEST: Use BitmapText for frequently changing text
const scoreText = this.add.bitmapText(10, 10, 'pixelFont', 'Score: 0', 24);
```

## 6. Blend Mode Batch Flushing

Each blend mode change forces a WebGL batch flush. Interleaving normal and additive sprites kills performance.

```typescript
// BAD: Alternating blend modes causes constant flushing
group.children.iterate((child) => {
  child.setBlendMode(i % 2 === 0 ? 'NORMAL' : 'ADD');
});

// GOOD: Group sprites by blend mode in the display list
// Render all NORMAL sprites first, then all ADD sprites
this.normalGroup = this.add.group();
this.glowGroup = this.add.group();  // All ADD blend mode
```

## 7. Creating Objects in update()

Never allocate objects in the update loop — it triggers garbage collection spikes.

```typescript
// BAD: New bullet created every frame
update(): void {
  if (this.input.activePointer.isDown) {
    const bullet = this.physics.add.sprite(x, y, 'bullet');  // GC pressure
  }
}

// GOOD: Use an object pool (see PERFORMANCE.md)
update(): void {
  if (this.input.activePointer.isDown) {
    this.bulletPool.spawn(x, y, 'bullet');  // Reuses inactive objects
  }
}
```

## 8. Forgetting Delta Time

Without delta time, movement speed depends on frame rate — faster on 144Hz monitors, slower on 30fps mobile.

```typescript
// BAD: Frame-rate dependent movement
update(): void {
  player.x += 5;  // 5px per frame = 300px/s at 60fps, 720px/s at 144fps
}

// GOOD: Frame-rate independent movement
update(time: number, delta: number): void {
  player.x += CONFIG.SPEED * (delta / 1000);  // Consistent speed regardless of FPS
}
```

Note: Phaser's arcade physics velocity is already frame-rate independent. This pitfall applies to manual position changes.
