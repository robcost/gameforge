/**
 * Validates Agent Skill file structure, YAML frontmatter, and content
 * for all Skills in the orchestrator's skills directory.
 *
 * @remarks
 * Skills are markdown-based packages discovered by the Claude Agent SDK.
 * Each Skill must have a SKILL.md with valid YAML frontmatter (name, description)
 * and optional reference files. This test ensures all Skills conform to the
 * SDK's requirements before they are copied into session directories.
 *
 * @packageDocumentation
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

/**
 * Root directory containing all Skill packages.
 * Handles both monorepo-root cwd (production) and project-root cwd (vitest).
 */
const SKILLS_DIR = (() => {
  const fromMonorepo = resolve(process.cwd(), 'apps', 'orchestrator', 'src', 'agents', 'skills');
  if (existsSync(fromMonorepo)) return fromMonorepo;
  return resolve(process.cwd(), 'src', 'agents', 'skills');
})();

/** Expected Skill directories with their required and optional reference files. */
const SKILL_DEFINITIONS = [
  {
    name: 'phaser-development',
    requiredFiles: ['SKILL.md', 'GENRES.md', 'ASSETS.md', 'PERFORMANCE.md', 'ANIMATION.md', 'PITFALLS.md'],
  },
  {
    name: 'threejs-development',
    requiredFiles: ['SKILL.md', 'ASSETS.md', 'PERFORMANCE.md', 'PITFALLS.md'],
  },
];

/**
 * Parses YAML frontmatter from a SKILL.md file.
 * Expects `---` delimiters at the start and a `name` + `description` field.
 */
function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const result: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim().replace(/^["']|["']$/g, '');
      result[key] = value;
    }
  }
  return result;
}

// ────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────

describe('Agent Skills validation', () => {
  it('skills directory exists', () => {
    expect(existsSync(SKILLS_DIR)).toBe(true);
  });

  it('contains expected skill directories', () => {
    const dirs = readdirSync(SKILLS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    for (const def of SKILL_DEFINITIONS) {
      expect(dirs).toContain(def.name);
    }
  });

  for (const def of SKILL_DEFINITIONS) {
    describe(`${def.name}`, () => {
      const skillDir = join(SKILLS_DIR, def.name);

      it('has all required files', () => {
        for (const file of def.requiredFiles) {
          expect(existsSync(join(skillDir, file))).toBe(true);
        }
      });

      it('SKILL.md has valid YAML frontmatter with name', () => {
        const content = readFileSync(join(skillDir, 'SKILL.md'), 'utf-8');
        const frontmatter = parseFrontmatter(content);

        expect(frontmatter['name']).toBe(def.name);
        expect(frontmatter['name'].length).toBeLessThanOrEqual(64);
        expect(frontmatter['name']).toMatch(/^[a-z0-9-]+$/);
      });

      it('SKILL.md has valid description in frontmatter', () => {
        const content = readFileSync(join(skillDir, 'SKILL.md'), 'utf-8');
        const frontmatter = parseFrontmatter(content);

        expect(frontmatter['description']).toBeDefined();
        expect(frontmatter['description'].length).toBeGreaterThan(0);
        expect(frontmatter['description'].length).toBeLessThanOrEqual(1024);
      });

      it('SKILL.md body is under 500 lines', () => {
        const content = readFileSync(join(skillDir, 'SKILL.md'), 'utf-8');
        const lines = content.split('\n').length;
        expect(lines).toBeLessThan(500);
      });

      it('all required files are non-empty', () => {
        for (const file of def.requiredFiles) {
          const content = readFileSync(join(skillDir, file), 'utf-8');
          expect(content.trim().length).toBeGreaterThan(0);
        }
      });
    });
  }
});
