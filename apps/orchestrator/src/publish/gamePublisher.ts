/**
 * Game publisher — builds a game project for production using Vite.
 *
 * @remarks
 * Runs `npx vite build` in the game project directory to produce a
 * self-contained set of static files in the `dist/` folder. The built
 * output can then be served via Express static file serving.
 *
 * @packageDocumentation
 */

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Builds a game project for production using Vite.
 *
 * @param projectPath - Absolute path to the game project directory (must contain package.json).
 * @returns The absolute path to the `dist/` output directory.
 * @throws If the project directory does not exist or the build fails.
 */
export function buildGameProject(projectPath: string): Promise<string> {
  return new Promise((resolve_, reject) => {
    if (!existsSync(resolve(projectPath, 'package.json'))) {
      reject(new Error(`Project not scaffolded: ${projectPath}/package.json not found`));
      return;
    }

    execFile('npx', ['vite', 'build'], { cwd: projectPath }, (error, _stdout, stderr) => {
      if (error) {
        reject(new Error(`Vite build failed: ${stderr || error.message}`));
        return;
      }

      resolve_(resolve(projectPath, 'dist'));
    });
  });
}
