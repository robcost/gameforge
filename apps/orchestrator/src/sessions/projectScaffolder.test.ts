import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scaffoldProject, isProjectScaffolded, copySkills } from './projectScaffolder.js';
import type { Session } from '@robcost/shared-types';
import { createDefaultAgentStates } from '@robcost/shared-types';

import type { GameEngine } from '@robcost/shared-types';

/** Creates a minimal session object pointing to a temp directory. */
function createTestSession(engine: GameEngine = 'phaser'): Session {
  const tempDir = mkdtempSync(join(tmpdir(), 'gameforge-test-'));
  const projectPath = join(tempDir, 'game');
  return {
    id: 'test-session-id',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: 'scaffolding',
    engine,
    genre: 'platformer',
    projectPath,
    vitePort: null,
    viteUrl: null,
    gdd: null,
    conversationHistory: [],
    agentStates: createDefaultAgentStates(),
    qaResults: [],
    iterationCount: 0,
    totalCostUsd: 0,
  };
}

let tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

describe('scaffoldProject', () => {
  it('copies template files to the project directory', async () => {
    const session = createTestSession();
    tempDirs.push(join(session.projectPath, '..'));

    await scaffoldProject(session, { skipInstall: true });

    expect(existsSync(join(session.projectPath, 'package.json'))).toBe(true);
    expect(existsSync(join(session.projectPath, 'src', 'main.ts'))).toBe(true);
    expect(existsSync(join(session.projectPath, 'vite.config.ts'))).toBe(true);
    expect(existsSync(join(session.projectPath, 'index.html'))).toBe(true);
  });

  it('copied package.json has phaser dependency', async () => {
    const session = createTestSession();
    tempDirs.push(join(session.projectPath, '..'));

    await scaffoldProject(session, { skipInstall: true });

    const pkg = JSON.parse(
      readFileSync(join(session.projectPath, 'package.json'), 'utf-8')
    );
    expect(pkg.dependencies.phaser).toBeDefined();
  });

  it('copies scene files', async () => {
    const session = createTestSession();
    tempDirs.push(join(session.projectPath, '..'));

    await scaffoldProject(session, { skipInstall: true });

    expect(
      existsSync(join(session.projectPath, 'src', 'scenes', 'BootScene.ts'))
    ).toBe(true);
    expect(
      existsSync(join(session.projectPath, 'src', 'scenes', 'MainScene.ts'))
    ).toBe(true);
  });

  it('scaffolds threejs-starter template for threejs engine', async () => {
    const session = createTestSession('threejs');
    tempDirs.push(join(session.projectPath, '..'));

    await scaffoldProject(session, { skipInstall: true });

    expect(existsSync(join(session.projectPath, 'package.json'))).toBe(true);
    expect(existsSync(join(session.projectPath, 'src', 'main.ts'))).toBe(true);

    const pkg = JSON.parse(
      readFileSync(join(session.projectPath, 'package.json'), 'utf-8')
    );
    expect(pkg.dependencies.three).toBeDefined();
    expect(pkg.dependencies.phaser).toBeUndefined();
  });

  it('scaffolds phaser-starter template for phaser engine', async () => {
    const session = createTestSession('phaser');
    tempDirs.push(join(session.projectPath, '..'));

    await scaffoldProject(session, { skipInstall: true });

    const pkg = JSON.parse(
      readFileSync(join(session.projectPath, 'package.json'), 'utf-8')
    );
    expect(pkg.dependencies.phaser).toBeDefined();
    expect(pkg.dependencies.three).toBeUndefined();
  });
});

describe('copySkills', () => {
  it('copies skill files into .claude/skills/ directory', async () => {
    const session = createTestSession();
    tempDirs.push(join(session.projectPath, '..'));

    await scaffoldProject(session, { skipInstall: true });

    expect(existsSync(join(session.projectPath, '.claude', 'skills'))).toBe(true);
    expect(
      existsSync(join(session.projectPath, '.claude', 'skills', 'phaser-development', 'SKILL.md'))
    ).toBe(true);
    expect(
      existsSync(join(session.projectPath, '.claude', 'skills', 'threejs-development', 'SKILL.md'))
    ).toBe(true);
  });

  it('copies genre and asset reference files', async () => {
    const session = createTestSession();
    tempDirs.push(join(session.projectPath, '..'));

    await scaffoldProject(session, { skipInstall: true });

    expect(
      existsSync(join(session.projectPath, '.claude', 'skills', 'phaser-development', 'GENRES.md'))
    ).toBe(true);
    expect(
      existsSync(join(session.projectPath, '.claude', 'skills', 'phaser-development', 'ASSETS.md'))
    ).toBe(true);
    expect(
      existsSync(join(session.projectPath, '.claude', 'skills', 'threejs-development', 'ASSETS.md'))
    ).toBe(true);
  });

  it('is idempotent — does not error on repeated calls', async () => {
    const session = createTestSession();
    tempDirs.push(join(session.projectPath, '..'));

    await scaffoldProject(session, { skipInstall: true });

    // Second call should not throw
    expect(() => copySkills(session.projectPath)).not.toThrow();
  });
});

describe('isProjectScaffolded', () => {
  it('returns true after scaffolding', async () => {
    const session = createTestSession();
    tempDirs.push(join(session.projectPath, '..'));

    await scaffoldProject(session, { skipInstall: true });

    expect(isProjectScaffolded(session)).toBe(true);
  });

  it('returns false for unscaffolded session', () => {
    const session = createTestSession();
    tempDirs.push(join(session.projectPath, '..'));

    expect(isProjectScaffolded(session)).toBe(false);
  });
});
