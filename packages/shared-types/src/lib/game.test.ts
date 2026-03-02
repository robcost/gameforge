import { describe, it, expect } from 'vitest';
import { createDefaultGDD } from './game.js';

describe('game', () => {
  describe('createDefaultGDD', () => {
    it('returns a valid GDD with all required fields', () => {
      const gdd = createDefaultGDD();

      expect(gdd.title).toBe('Untitled Game');
      expect(gdd.genre).toBe('other');
      expect(gdd.engine).toBe('phaser');
    });

    it('has genre-neutral physics defaults', () => {
      const gdd = createDefaultGDD();

      expect(gdd.physics.gravity).toBe(0);
      expect(gdd.physics.playerSpeed).toBe(200);
      expect(gdd.physics.playerJumpForce).toBeUndefined();
      expect(gdd.physics.doubleJump).toBeUndefined();
      expect(gdd.physics.wallJump).toBeUndefined();
    });

    it('has correct viewport defaults', () => {
      const gdd = createDefaultGDD();

      expect(gdd.viewport.width).toBe(800);
      expect(gdd.viewport.height).toBe(500);
      expect(gdd.viewport.backgroundColor).toBe('#1a1a2e');
    });

    it('has a player definition', () => {
      const gdd = createDefaultGDD();

      expect(gdd.player.width).toBe(32);
      expect(gdd.player.height).toBe(32);
      expect(gdd.player.color).toBe('#4fc3f7');
      expect(gdd.player.startPosition).toEqual({ x: 400, y: 300 });
      expect(gdd.player.abilities).toContain('move');
    });

    it('starts with no entity arrays', () => {
      const gdd = createDefaultGDD();

      expect(gdd.enemies).toBeUndefined();
      expect(gdd.collectibles).toBeUndefined();
      expect(gdd.hazards).toBeUndefined();
      expect(gdd.levels).toBeUndefined();
    });

    it('has UI config with score and lives enabled', () => {
      const gdd = createDefaultGDD();

      expect(gdd.ui.showScore).toBe(true);
      expect(gdd.ui.showLives).toBe(true);
      expect(gdd.ui.showHealth).toBe(false);
      expect(gdd.ui.showTimer).toBe(false);
    });

    it('returns a new object each time', () => {
      const a = createDefaultGDD();
      const b = createDefaultGDD();
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });

    it('has no artDirection by default (Circle 2 backward compat)', () => {
      const gdd = createDefaultGDD();
      expect(gdd.artDirection).toBeUndefined();
      expect(gdd.assetManifest).toBeUndefined();
    });
  });
});
