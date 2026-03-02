/**
 * Vite dev server lifecycle manager for game sessions.
 *
 * @remarks
 * Manages per-session Vite dev server child processes. Each session gets its
 * own Vite instance running on a unique port. The manager handles spawning,
 * readiness detection (by watching stdout for Vite's "Local:" URL), graceful
 * shutdown, max concurrency with LRU eviction, and idle timeout.
 *
 * @packageDocumentation
 */

import { type ChildProcess, spawn } from 'node:child_process';
import { resolve } from 'node:path';

/** Result returned when a Vite dev server starts successfully. */
export interface ViteServerInfo {
  /** The port the Vite dev server is listening on. */
  port: number;
  /** The full URL to access the dev server. */
  url: string;
}

/** Internal tracking entry for a running Vite process. */
interface ViteEntry {
  process: ChildProcess;
  /** Timestamp of last access (creation or touchSession call). */
  lastAccessed: number;
}

/** Configuration options for ViteManager. */
export interface ViteManagerOptions {
  /** Starting port number for allocation (default 8100). */
  basePort?: number;
  /** Max time in ms to wait for Vite ready signal (default 30000). */
  readyTimeoutMs?: number;
  /** Max concurrent Vite processes. Oldest idle server is evicted when at limit. Default: 5. */
  maxConcurrent?: number;
  /** Idle timeout in ms. Servers idle beyond this are stopped automatically. 0 disables. Default: 1800000 (30 min). */
  idleTimeoutMs?: number;
  /** Interval in ms between idle checks. Default: 300000 (5 min). */
  idleCheckIntervalMs?: number;
}

/**
 * Strips ANSI escape codes from a string.
 * Vite may emit colored output even when piped, depending on the
 * `FORCE_COLOR` env or picocolors detection.
 *
 * @param text - Raw string potentially containing ANSI codes.
 * @returns The string with all ANSI escape sequences removed.
 */
function stripAnsi(text: string): string {
  // Matches all common ANSI escape sequences (CSI, OSC, etc.)
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

/**
 * Manages per-session Vite dev server processes.
 *
 * @remarks
 * Allocates ports starting from a configurable base (default 8100) and
 * increments for each new server. Tracks child processes by session ID
 * for targeted or bulk shutdown. Supports max concurrency with LRU eviction
 * and automatic idle timeout.
 */
export class ViteManager {
  /** Next port to allocate for a new dev server. */
  private nextPort: number;

  /** Map of session ID to the running Vite entry. */
  private entries = new Map<string, ViteEntry>();

  /** Timeout in milliseconds to wait for Vite to become ready. */
  private readonly readyTimeoutMs: number;

  /** Maximum number of concurrent Vite processes. */
  private readonly maxConcurrent: number;

  /** Idle timeout in milliseconds (0 = disabled). */
  private readonly idleTimeoutMs: number;

  /** Handle for the periodic idle check interval. */
  private idleCheckTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * @param options - Configuration options.
   */
  constructor(options?: ViteManagerOptions) {
    this.nextPort = options?.basePort ?? 8100;
    this.readyTimeoutMs = options?.readyTimeoutMs ?? 30_000;
    this.maxConcurrent = options?.maxConcurrent ?? 5;
    this.idleTimeoutMs = options?.idleTimeoutMs ?? 30 * 60 * 1000;

    const checkInterval = options?.idleCheckIntervalMs ?? 5 * 60 * 1000;
    if (this.idleTimeoutMs > 0 && checkInterval > 0) {
      this.idleCheckTimer = setInterval(() => this.evictIdle(), checkInterval);
      // Don't prevent Node from exiting
      if (this.idleCheckTimer.unref) {
        this.idleCheckTimer.unref();
      }
    }
  }

  /**
   * Starts a Vite dev server for the given session.
   * If at the max concurrent limit, the least-recently-accessed server is evicted first.
   *
   * @param sessionId - The session this server belongs to.
   * @param projectPath - Absolute path to the scaffolded game project.
   * @returns The port and URL once Vite reports ready.
   * @throws If the server fails to start or times out.
   */
  async startDevServer(
    sessionId: string,
    projectPath: string
  ): Promise<ViteServerInfo> {
    if (this.entries.has(sessionId)) {
      throw new Error(
        `Vite dev server already running for session ${sessionId}`
      );
    }

    // Evict oldest idle server if at capacity
    if (this.entries.size >= this.maxConcurrent) {
      const evictId = this.findLeastRecentlyAccessed();
      if (evictId) {
        console.log(`[vite] evicting idle server for session ${evictId} (at max ${this.maxConcurrent} concurrent)`);
        this.stopDevServer(evictId);
      }
    }

    const port = this.nextPort++;
    const viteBin = resolve(projectPath, 'node_modules', '.bin', 'vite');

    console.log(`[vite] spawning: ${viteBin} --port ${port} --host 0.0.0.0`);
    console.log(`[vite] cwd: ${projectPath}`);

    const child = spawn(viteBin, ['--port', String(port), '--host', '0.0.0.0'], {
      cwd: projectPath,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.entries.set(sessionId, { process: child, lastAccessed: Date.now() });

    return new Promise<ViteServerInfo>((resolvePromise, reject) => {
      const readyRegex = /Local:\s+https?:\/\/[^\s]+/;
      let settled = false;
      let stderrOutput = '';

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          this.stopDevServer(sessionId);
          reject(
            new Error(
              `Vite dev server for session ${sessionId} did not start within ${this.readyTimeoutMs}ms. stderr: ${stderrOutput || '(empty)'}`
            )
          );
        }
      }, this.readyTimeoutMs);

      /** Checks output for the Vite "ready" pattern. */
      const checkReady = (raw: string): boolean => {
        const clean = stripAnsi(raw);
        if (readyRegex.test(clean)) {
          settled = true;
          clearTimeout(timeout);
          resolvePromise({
            port,
            url: `http://localhost:${port}`,
          });
          return true;
        }
        return false;
      };

      child.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        console.log(`[vite:stdout] ${text.trimEnd()}`);
        if (!settled) {
          checkReady(text);
        }
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stderrOutput += text;
        console.error(`[vite:stderr] ${text.trimEnd()}`);
        // Some Vite versions/plugins emit ready message on stderr
        if (!settled) {
          checkReady(text);
        }
      });

      child.on('error', (err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          this.entries.delete(sessionId);
          reject(
            new Error(`Failed to spawn Vite for session ${sessionId}: ${err.message}`)
          );
        }
      });

      child.on('exit', (code) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          this.entries.delete(sessionId);
          reject(
            new Error(
              `Vite dev server for session ${sessionId} exited unexpectedly with code ${code}. stderr: ${stderrOutput || '(empty)'}`
            )
          );
        }
      });
    });
  }

  /**
   * Updates the last-accessed timestamp for a session's Vite server.
   * Call this when the session receives WebSocket activity.
   *
   * @param sessionId - The session to touch.
   */
  touchSession(sessionId: string): void {
    const entry = this.entries.get(sessionId);
    if (entry) {
      entry.lastAccessed = Date.now();
    }
  }

  /**
   * Stops the Vite dev server for a specific session.
   *
   * @param sessionId - The session whose server to stop.
   */
  stopDevServer(sessionId: string): void {
    const entry = this.entries.get(sessionId);
    if (entry) {
      entry.process.kill('SIGTERM');
      this.entries.delete(sessionId);
    }
  }

  /**
   * Stops all running Vite dev servers and clears the idle check timer.
   * Used during graceful shutdown.
   */
  stopAll(): void {
    if (this.idleCheckTimer) {
      clearInterval(this.idleCheckTimer);
      this.idleCheckTimer = null;
    }
    for (const [sessionId, entry] of this.entries) {
      entry.process.kill('SIGTERM');
      this.entries.delete(sessionId);
    }
  }

  /**
   * Returns the number of currently running dev servers.
   */
  get activeCount(): number {
    return this.entries.size;
  }

  /**
   * Checks if a dev server is running for the given session.
   *
   * @param sessionId - The session to check.
   * @returns true if a process is tracked for this session.
   */
  isRunning(sessionId: string): boolean {
    return this.entries.has(sessionId);
  }

  /**
   * Returns the session ID of the least-recently-accessed running server,
   * or null if no servers are running.
   */
  private findLeastRecentlyAccessed(): string | null {
    let oldestId: string | null = null;
    let oldestTime = Infinity;

    for (const [id, entry] of this.entries) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestId = id;
      }
    }

    return oldestId;
  }

  /**
   * Stops Vite servers that have been idle beyond the idle timeout threshold.
   * Called periodically by the idle check interval.
   */
  private evictIdle(): void {
    if (this.idleTimeoutMs <= 0) return;

    const now = Date.now();
    for (const [sessionId, entry] of this.entries) {
      if (now - entry.lastAccessed > this.idleTimeoutMs) {
        console.log(`[vite] stopping idle server for session ${sessionId} (idle ${Math.round((now - entry.lastAccessed) / 1000)}s)`);
        entry.process.kill('SIGTERM');
        this.entries.delete(sessionId);
      }
    }
  }
}
