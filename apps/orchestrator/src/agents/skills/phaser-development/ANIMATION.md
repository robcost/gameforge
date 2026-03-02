# Phaser 3 Animation and Game Feel

## Sprite Animation

Create animations from spritesheets or atlas frames:

```typescript
// From a spritesheet (uniform grid cells)
this.anims.create({
  key: 'player_run',
  frames: this.anims.generateFrameNumbers('player_sheet', { start: 0, end: 7 }),
  frameRate: 12,
  repeat: -1,
});

// From a texture atlas (arbitrary frame positions)
this.anims.create({
  key: 'player_idle',
  frames: this.anims.generateFrameNames('gameSprites', {
    prefix: 'player_idle_',
    start: 1, end: 4, zeroPad: 2,
  }),
  frameRate: 8,
  repeat: -1,
});

// Play animation — ignoreIfPlaying prevents restart stutter
player.play('player_run', true); // true = ignoreIfPlaying
```

## Tween Basics

```typescript
// Single tween
this.tweens.add({
  targets: enemy,
  x: 500,
  duration: 2000,
  ease: 'Sine.easeInOut',
  yoyo: true,
  repeat: -1,
});

// Chained sequence
this.tweens.chain({
  targets: player,
  tweens: [
    { scaleX: 1.2, scaleY: 0.8, duration: 100 },  // Squash
    { scaleX: 0.9, scaleY: 1.1, duration: 100 },  // Stretch
    { scaleX: 1, scaleY: 1, duration: 150 },       // Recover
  ],
});
```

## Game Juice Effects

These small effects make games feel polished:

**Screen Shake** — on hit, explosion, or impact:

```typescript
this.cameras.main.shake(150, 0.01);  // duration ms, intensity
```

**Camera Flash** — on damage taken:

```typescript
this.cameras.main.flash(200, 255, 0, 0);  // duration, r, g, b
```

**Squash and Stretch** — on player landing:

```typescript
function onPlayerLand(player: Phaser.GameObjects.Sprite): void {
  player.setScale(1.3, 0.7); // Squash
  this.tweens.add({
    targets: player,
    scaleX: 1, scaleY: 1,
    duration: 200,
    ease: 'Back.easeOut',
  });
}
```

**Collect Pop** — when picking up items:

```typescript
function onCollect(player: Phaser.GameObjects.Sprite, item: Phaser.GameObjects.Sprite): void {
  this.tweens.add({
    targets: item,
    scale: 1.5,
    alpha: 0,
    y: item.y - 30,
    duration: 300,
    ease: 'Cubic.easeOut',
    onComplete: () => item.destroy(),
  });
}
```

**Knockback** — when hit by enemy:

```typescript
function applyKnockback(target: Phaser.Physics.Arcade.Sprite, fromX: number): void {
  const direction = target.x > fromX ? 1 : -1;
  target.setVelocityX(direction * CONFIG.KNOCKBACK_FORCE);
  target.setVelocityY(-CONFIG.KNOCKBACK_FORCE * 0.5);
  target.setTint(0xff0000);
  this.time.delayedCall(200, () => target.clearTint());
}
```

## Easing Function Guide

Choose the right easing for the right effect:

| Easing | Use For | Feel |
|--------|---------|------|
| `Sine.easeOut` | Deceleration, landing | Smooth stop |
| `Sine.easeInOut` | Patrol movement, floating | Gentle back-and-forth |
| `Back.easeOut` | UI pop-in, squash recovery | Slight overshoot |
| `Elastic.easeOut` | Springy UI, bounce effects | Bouncy/wobbly |
| `Cubic.easeIn` | Acceleration, falling | Gaining speed |
| `Cubic.easeOut` | Projectile arc, fadeout | Slowing down |
| `Bounce.easeOut` | Ball landing, item drop | Physical bounce |
| `Linear` | Constant speed, timers | No easing |

## Animation State Machine

For complex characters, use a transition table:

```typescript
const ANIM_STATES: Record<string, string> = {
  idle: 'player_idle',
  run: 'player_run',
  jump: 'player_jump',
  fall: 'player_fall',
  hurt: 'player_hurt',
};

function updateAnimation(player: Phaser.Physics.Arcade.Sprite, state: string): void {
  const animKey = ANIM_STATES[state];
  if (animKey && player.anims.currentAnim?.key !== animKey) {
    player.play(animKey, true);
  }
}

// In update():
if (isHurt) updateAnimation(player, 'hurt');
else if (!body.touching.down && body.velocity.y < 0) updateAnimation(player, 'jump');
else if (!body.touching.down && body.velocity.y > 0) updateAnimation(player, 'fall');
else if (Math.abs(body.velocity.x) > 10) updateAnimation(player, 'run');
else updateAnimation(player, 'idle');
```
