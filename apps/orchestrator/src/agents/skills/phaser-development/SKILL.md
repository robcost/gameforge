---
name: phaser-development
description: Phaser 3 TypeScript game development patterns including scene architecture, arcade physics, texture generation, config-driven design, and coding conventions. Use when implementing or modifying a Phaser 2D game.
---

# Phaser 3 Game Development Patterns

## Project Structure

The Phaser game project uses Vite + TypeScript with this layout:

```
src/
  config.ts        - All game constants (VIEWPORT, CONTROLS, plus everything from GDD)
  main.ts          - DOM entry point, calls startGame()
  scenes/
    BootScene.ts   - Has generateTexture() helper, preload() for texture/asset setup
    MainScene.ts   - Empty scene shell with reset key - all gameplay goes here
```

## Config-Driven Design

- **All game constants** (dimensions, speeds, colors, physics values) go in `src/config.ts`
- Scenes import from config - never hardcode values in scene files
- When the GDD specifies values, add them to config.ts
- Read the GDD's `controls` field to know what keys to wire up

## Scene Architecture

- Every scene extends `Phaser.Scene` with a unique `key` string
- `BootScene` handles texture generation via its `generateTexture(key, width, height, color)` method
- Add texture generation calls in BootScene's `preload()` method - one per visual entity
- `MainScene` (or level-specific scenes) handle gameplay logic
- Register new scenes in `BootScene.ts`'s `startGame()` function

## Textures (Procedural Generation)

- Default visuals are colored rectangles generated programmatically via `generateTexture()`
- Colors in Phaser use hex numbers: `0x4fc3f7` (not CSS strings)
- GDD colors are CSS hex strings: `'#4fc3f7'` - convert by replacing `#` with `0x`
- Each entity needs one `generateTexture()` call in BootScene's `preload()`

## Physics (Arcade)

- The template starts with gravity=0 and arcade physics enabled
- **Set gravity in startGame()** or in the scene based on the GDD (e.g. gravity.y=600 for platformers, 0 for shooters)
- `this.physics.add.staticGroup()` for immovable objects (platforms, walls, barriers)
- `this.physics.add.sprite()` for the player and dynamic entities
- `this.physics.add.group()` for enemies, collectibles, projectiles
- Set world bounds for levels wider/taller than viewport: `this.physics.world.setBounds()`
- Collision: `this.physics.add.collider(player, platforms)` for solid collision
- Overlap: `this.physics.add.overlap(player, coins, collectCallback)` for trigger-style

## HUD

- Use `this.add.text()` with `.setScrollFactor(0)` for fixed UI elements
- Score, lives, health, timer - only render what the GDD enables
- Position HUD elements relative to the camera viewport, not world coordinates

## Mandatory Controls

- **Every game MUST include a reset key**: The template already has this wired (R key)
- Do NOT remove or modify the existing reset key handler in MainScene
- Add a small HUD text in the top-right corner: `"Press R to restart"` - the template already has this

## Genre Patterns

For genre-specific implementation patterns (platformer, shooter, top-down, arcade, puzzle), see [GENRES.md](GENRES.md).

## Asset Loading and Audio

For image asset loading, sprite display sizing, platform rendering, and background music integration, see [ASSETS.md](ASSETS.md).

## Performance Optimization

For object pooling, BitmapText, GC avoidance, camera culling, and render pipeline tips, see [PERFORMANCE.md](PERFORMANCE.md).

## Animation and Game Feel

For sprite animation, tween chaining, game juice effects, and easing functions, see [ANIMATION.md](ANIMATION.md).

## Common Pitfalls

For the most common Phaser 3 bugs and how to avoid them, see [PITFALLS.md](PITFALLS.md).
