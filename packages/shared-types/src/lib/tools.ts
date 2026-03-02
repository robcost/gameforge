/**
 * Tool interface type definitions for the agent tool registry.
 *
 * @remarks
 * These types define the contracts for tools that agents use to interact
 * with the game project filesystem, build system, and testing infrastructure.
 * The actual implementations live in the orchestrator app.
 *
 * @packageDocumentation
 */

// ────────────────────────────────────────────────────────────────
// File Tools
// ────────────────────────────────────────────────────────────────

/** Information about a file in the project. */
export interface FileInfo {
  path: string;
  name: string;
  isDirectory: boolean;
  size: number;
}

/** A single edit operation on a file. */
export interface FileEdit {
  type: 'replace' | 'insert_after' | 'insert_before' | 'delete_lines';
  /** The text to search for (used with 'replace'). */
  search?: string;
  /** The replacement text (used with 'replace'). */
  replace?: string;
  /** Line number for insert/delete operations. */
  line?: number;
  /** Content to insert. */
  content?: string;
  /** End line for delete_lines operations. */
  endLine?: number;
}

// ────────────────────────────────────────────────────────────────
// Build Tools
// ────────────────────────────────────────────────────────────────

// BuildError is defined in messages.ts and re-exported from the barrel.

// ────────────────────────────────────────────────────────────────
// Playwright Tools
// ────────────────────────────────────────────────────────────────

/** A keyboard action for the QA agent to simulate. */
export interface KeyAction {
  /** Key identifier (e.g. 'ArrowRight', 'Space'). */
  key: string;
  action: 'down' | 'up' | 'press';
  /** Duration to hold the key in milliseconds. */
  holdMs?: number;
}

/** A console error captured from the game's browser context. */
export interface ConsoleError {
  message: string;
  source: string;
  line: number;
  timestamp: number;
}

// ────────────────────────────────────────────────────────────────
// Project State
// ────────────────────────────────────────────────────────────────

/** A node in the project file tree. */
export interface FileTreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileTreeNode[];
}
