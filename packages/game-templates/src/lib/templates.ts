/**
 * Template metadata and file manifest utilities.
 *
 * @remarks
 * Provides functions to locate and enumerate the game starter templates
 * stored within this package. The orchestrator's Project Scaffolder uses
 * these to copy a template into a new session's game directory.
 *
 * @packageDocumentation
 */

import { resolve, dirname } from 'node:path';
import { readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Available template names. */
export const TEMPLATE_NAMES = ['phaser-starter', 'threejs-starter'] as const;

/** A template name type derived from the available templates. */
export type TemplateName = (typeof TEMPLATE_NAMES)[number];

/**
 * Returns the absolute filesystem path to a template directory.
 *
 * @param templateName - The name of the template (e.g. 'phaser-starter').
 * @returns The absolute path to the template directory.
 * @throws If the template name is not recognized.
 */
export function getTemplatePath(templateName: TemplateName): string {
  if (!TEMPLATE_NAMES.includes(templateName)) {
    throw new Error(`Unknown template: ${templateName}`);
  }

  const currentDir = dirname(fileURLToPath(import.meta.url));
  // Resolve to package root (2 levels up from src/lib/ or dist/lib/)
  // then always reference src/templates/ where the actual files live.
  const packageRoot = resolve(currentDir, '..', '..');
  return resolve(packageRoot, 'src', 'templates', templateName);
}

/**
 * Returns a list of all files in a template directory (relative paths).
 *
 * @param templateName - The name of the template.
 * @returns An array of relative file paths within the template.
 * @throws If the template directory does not exist.
 */
export function getTemplateManifest(templateName: TemplateName): string[] {
  const templateDir = getTemplatePath(templateName);

  if (!existsSync(templateDir)) {
    throw new Error(`Template directory not found: ${templateDir}`);
  }

  const files: string[] = [];
  collectFiles(templateDir, templateDir, files);
  return files.sort();
}

/**
 * Recursively collects all file paths relative to the base directory.
 *
 * @param dir - The current directory being scanned.
 * @param baseDir - The root template directory (for computing relative paths).
 * @param files - Accumulator array for discovered file paths.
 */
function collectFiles(dir: string, baseDir: string, files: string[]): void {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = resolve(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      collectFiles(fullPath, baseDir, files);
    } else {
      const relativePath = fullPath.slice(baseDir.length + 1);
      files.push(relativePath);
    }
  }
}
