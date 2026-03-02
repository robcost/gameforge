# Phaser 3 Genre-Specific Implementation Patterns

## Platformers

- Set gravity in the Phaser config or scene: `this.physics.world.gravity.y = gravity`
- Ground platform: static body spanning full level width at the bottom
- Floating platforms: placed at GDD-specified positions using `staticGroup.create(x, y, key)`
- Player input: arrow keys for horizontal movement, space/up for jump
- Jump: only allow when `player.body.touching.down` is true (prevents mid-air jumping)
- Camera follows player: `this.cameras.main.startFollow(player)`
- World bounds: set to level dimensions, camera bounds match

```typescript
// Typical platformer setup
this.physics.world.gravity.y = CONFIG.PHYSICS.GRAVITY;
const platforms = this.physics.add.staticGroup();
platforms.create(400, 568, 'ground').setDisplaySize(800, 64).refreshBody();

const player = this.physics.add.sprite(100, 450, 'player');
player.setCollideWorldBounds(true);
this.physics.add.collider(player, platforms);

this.cameras.main.startFollow(player);
```

## Shooters / Space Invaders Style

- Keep gravity at 0
- Player at bottom of screen, constrained to horizontal movement
- Create a bullet group: `this.physics.add.group()` with max size and velocity
- Fire bullets on Space key press, with cooldown timer
- Spawn enemies in formations, move them in patterns (e.g. sine wave, grid descent)
- Use overlap detection for bullet-enemy and enemy-player collisions
- Track score and waves in scene state

```typescript
// Bullet creation with cooldown
const bullets = this.physics.add.group({ maxSize: 10 });
let lastFired = 0;

function fireBullet(time: number) {
  if (time - lastFired < CONFIG.FIRE_RATE) return;
  const bullet = bullets.get(player.x, player.y - 20, 'bullet');
  if (bullet) {
    bullet.setActive(true).setVisible(true);
    bullet.body.velocity.y = -CONFIG.BULLET_SPEED;
    lastFired = time;
  }
}
```

## Top-Down / Adventure

- Keep gravity at 0
- 4-directional player movement (all arrow keys set velocity)
- Stop player when no keys pressed (set velocity to 0)
- Camera follows player with world bounds
- Rooms/areas can be separate scenes or data-driven zones

```typescript
// 4-directional movement
const cursors = this.input.keyboard!.createCursorKeys();
player.setVelocity(0);

if (cursors.left.isDown) player.setVelocityX(-CONFIG.PLAYER_SPEED);
else if (cursors.right.isDown) player.setVelocityX(CONFIG.PLAYER_SPEED);

if (cursors.up.isDown) player.setVelocityY(-CONFIG.PLAYER_SPEED);
else if (cursors.down.isDown) player.setVelocityY(CONFIG.PLAYER_SPEED);
```

## Arcade (Breakout, Pong, etc.)

- Keep gravity at 0
- Game-specific physics: ball bouncing, paddle movement
- Use velocity and collision callbacks for game logic
- Simple controls: typically just left/right or up/down
- Ball physics: set velocity and use `setBounce(1)` for perfect bouncing

```typescript
// Breakout-style ball setup
const ball = this.physics.add.sprite(400, 500, 'ball');
ball.setCollideWorldBounds(true);
ball.setBounce(1);
ball.setVelocity(CONFIG.BALL_SPEED_X, -CONFIG.BALL_SPEED_Y);

// Paddle
const paddle = this.physics.add.sprite(400, 550, 'paddle');
paddle.setImmovable(true);
this.physics.add.collider(ball, paddle);
```

## Puzzle

- Keep gravity at 0
- Grid-based layout using calculated positions
- Tile selection/matching via keyboard or click
- Game state managed in scene properties
- Use 2D arrays for grid representation

```typescript
// Grid layout
const GRID_SIZE = CONFIG.GRID_SIZE;
const TILE_SIZE = CONFIG.TILE_SIZE;
const startX = (CONFIG.VIEWPORT.WIDTH - GRID_SIZE * TILE_SIZE) / 2;
const startY = (CONFIG.VIEWPORT.HEIGHT - GRID_SIZE * TILE_SIZE) / 2;

for (let row = 0; row < GRID_SIZE; row++) {
  for (let col = 0; col < GRID_SIZE; col++) {
    const x = startX + col * TILE_SIZE + TILE_SIZE / 2;
    const y = startY + row * TILE_SIZE + TILE_SIZE / 2;
    const tile = this.add.image(x, y, tileKey);
    tile.setDisplaySize(TILE_SIZE - 2, TILE_SIZE - 2);
  }
}
```
