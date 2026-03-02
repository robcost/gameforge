import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  TEMPLATE_NAMES,
  getTemplatePath,
  getTemplateManifest,
} from './templates.js';

describe('game-templates', () => {
  describe('TEMPLATE_NAMES', () => {
    it('contains phaser-starter', () => {
      expect(TEMPLATE_NAMES).toContain('phaser-starter');
    });

    it('contains threejs-starter', () => {
      expect(TEMPLATE_NAMES).toContain('threejs-starter');
    });
  });

  describe('getTemplatePath', () => {
    it('returns a valid path for phaser-starter', () => {
      const path = getTemplatePath('phaser-starter');
      expect(existsSync(path)).toBe(true);
    });

    it('returns a valid path for threejs-starter', () => {
      const path = getTemplatePath('threejs-starter');
      expect(existsSync(path)).toBe(true);
    });

    it('throws for an unknown template name', () => {
      expect(() =>
        getTemplatePath('nonexistent' as 'phaser-starter')
      ).toThrow('Unknown template');
    });
  });

  describe('getTemplateManifest', () => {
    it('returns an array of file paths', () => {
      const manifest = getTemplateManifest('phaser-starter');
      expect(Array.isArray(manifest)).toBe(true);
      expect(manifest.length).toBeGreaterThan(0);
    });

    it('includes the expected core files', () => {
      const manifest = getTemplateManifest('phaser-starter');

      expect(manifest).toContain('index.html');
      expect(manifest).toContain('package.json');
      expect(manifest).toContain('tsconfig.json');
      expect(manifest).toContain('vite.config.ts');
      expect(manifest).toContain('src/main.ts');
      expect(manifest).toContain('src/config.ts');
      expect(manifest).toContain('src/scenes/BootScene.ts');
      expect(manifest).toContain('src/scenes/MainScene.ts');
    });
  });

  describe('threejs-starter manifest', () => {
    it('includes the expected core files', () => {
      const manifest = getTemplateManifest('threejs-starter');

      expect(manifest).toContain('index.html');
      expect(manifest).toContain('package.json');
      expect(manifest).toContain('tsconfig.json');
      expect(manifest).toContain('vite.config.ts');
      expect(manifest).toContain('src/main.ts');
      expect(manifest).toContain('src/config.ts');
      expect(manifest).toContain('src/scenes/BootScene.ts');
      expect(manifest).toContain('src/scenes/MainScene.ts');
    });
  });

  describe('template package.json', () => {
    it('phaser-starter has phaser as a dependency', () => {
      const templatePath = getTemplatePath('phaser-starter');
      const pkgPath = resolve(templatePath, 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

      expect(pkg.dependencies).toHaveProperty('phaser');
      expect(pkg.dependencies.phaser).toMatch(/\^3\.\d+/);
    });

    it('threejs-starter has three as a dependency', () => {
      const templatePath = getTemplatePath('threejs-starter');
      const pkgPath = resolve(templatePath, 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

      expect(pkg.dependencies).toHaveProperty('three');
      expect(pkg.dependencies.three).toMatch(/\^0\.\d+/);
    });

    it('threejs-starter has @types/three as a devDependency', () => {
      const templatePath = getTemplatePath('threejs-starter');
      const pkgPath = resolve(templatePath, 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

      expect(pkg.devDependencies).toHaveProperty('@types/three');
    });
  });

  describe('template tsconfig.json', () => {
    it('phaser-starter has useDefineForClassFields set to false', () => {
      const templatePath = getTemplatePath('phaser-starter');
      const tsconfigPath = resolve(templatePath, 'tsconfig.json');
      const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf-8'));

      expect(tsconfig.compilerOptions.useDefineForClassFields).toBe(false);
    });

    it('both templates use bundler moduleResolution', () => {
      for (const name of TEMPLATE_NAMES) {
        const templatePath = getTemplatePath(name);
        const tsconfigPath = resolve(templatePath, 'tsconfig.json');
        const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf-8'));

        expect(tsconfig.compilerOptions.moduleResolution).toBe('bundler');
      }
    });
  });
});
