/**
 * Project scaffolding — copies a game template into a session directory
 * and installs dependencies.
 *
 * @remarks
 * The scaffolder uses `getTemplatePath` from the game-templates package
 * to locate the source template, then performs a recursive copy into the
 * session's project directory. After copying, it runs `npm install` to
 * install the game's dependencies (Phaser, Vite, etc.).
 *
 * @packageDocumentation
 */

import { mkdirSync, cpSync, existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { getTemplatePath } from '@robcost/game-templates';
import type { TemplateName } from '@robcost/game-templates';
import type { Session } from '@robcost/shared-types';

/**
 * Copies the game template into the session's project directory
 * and runs `npm install`.
 *
 * @param session - The session whose projectPath will be populated.
 * @param options - Optional configuration.
 * @param options.skipInstall - If true, skips `npm install` (useful for tests).
 * @throws If the template cannot be found or the copy/install fails.
 */
export async function scaffoldProject(
  session: Session,
  options?: { skipInstall?: boolean }
): Promise<void> {
  const templateName: TemplateName = session.engine === 'threejs' ? 'threejs-starter' : 'phaser-starter';
  const templatePath = getTemplatePath(templateName);

  // Create the session project directory
  mkdirSync(session.projectPath, { recursive: true });

  // Copy the entire template into the project directory
  cpSync(templatePath, session.projectPath, { recursive: true });

  // Copy Agent Skills into the session's .claude/skills/ directory for SDK discovery
  copySkills(session.projectPath);

  // Run npm install unless explicitly skipped
  if (!options?.skipInstall) {
    await runNpmInstall(session.projectPath);
  }
}

/**
 * Runs `npm install` in the given directory.
 *
 * @param cwd - The working directory to run npm install in.
 * @returns A promise that resolves when install completes.
 * @throws If npm install exits with a non-zero code.
 */
function runNpmInstall(cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile('npm', ['install'], { cwd }, (error, _stdout, stderr) => {
      if (error) {
        reject(new Error(`npm install failed: ${stderr || error.message}`));
        return;
      }
      resolve();
    });
  });
}

/**
 * Copies Agent Skills from the orchestrator's source into the session's
 * `.claude/skills/` directory. This enables the Claude Agent SDK to discover
 * Skills when the agent runs with `cwd` set to the session project path.
 *
 * @remarks
 * Skills are resolved from `apps/orchestrator/src/agents/skills/` relative to
 * `process.cwd()` (the monorepo root). The copy is idempotent — if the target
 * already exists it is silently skipped. If the source doesn't exist (e.g., no
 * Skills defined yet), the function returns without error.
 *
 * @param projectPath - The session project directory to copy Skills into.
 */
export function copySkills(projectPath: string): void {
  // Try monorepo-root-relative path first (production: cwd = monorepo root),
  // then project-relative path (tests: cwd = apps/orchestrator/).
  const candidates = [
    resolve(process.cwd(), 'apps', 'orchestrator', 'src', 'agents', 'skills'),
    resolve(process.cwd(), 'src', 'agents', 'skills'),
  ];
  const skillsSource = candidates.find((p) => existsSync(p));

  if (!skillsSource) {
    return;
  }

  const targetDir = resolve(projectPath, '.claude', 'skills');

  if (existsSync(targetDir)) {
    return;
  }

  mkdirSync(resolve(projectPath, '.claude'), { recursive: true });
  cpSync(skillsSource, targetDir, { recursive: true });
}

/**
 * Checks if a session's project directory has been scaffolded.
 *
 * @param session - The session to check.
 * @returns true if the project directory contains a package.json.
 */
export function isProjectScaffolded(session: Session): boolean {
  return existsSync(`${session.projectPath}/package.json`);
}
