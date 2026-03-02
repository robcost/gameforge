import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ViteManager } from './viteManager.js';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import type { ChildProcess } from 'node:child_process';

// Mock child_process.spawn
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

import { spawn } from 'node:child_process';

const mockSpawn = vi.mocked(spawn);

/** Creates a fake ChildProcess with controllable stdout. */
function createFakeProcess(): ChildProcess & {
  emitStdout: (data: string) => void;
} {
  const proc = new EventEmitter() as ChildProcess & {
    emitStdout: (data: string) => void;
  };
  const stdout = new Readable({ read() {} });
  proc.stdout = stdout;
  proc.stderr = new Readable({ read() {} });
  proc.stdin = null;
  proc.stdio = [null, stdout, proc.stderr, null, null];
  proc.pid = 12345;
  proc.killed = false;
  proc.kill = vi.fn(() => {
    proc.killed = true;
    return true;
  });
  proc.emitStdout = (data: string) => {
    stdout.push(Buffer.from(data));
  };
  return proc;
}

describe('ViteManager', () => {
  let manager: ViteManager;

  beforeEach(() => {
    manager = new ViteManager({ basePort: 9000, readyTimeoutMs: 500 });
  });

  afterEach(() => {
    manager.stopAll();
    vi.restoreAllMocks();
  });

  it('allocates ports incrementally starting from basePort', async () => {
    const proc1 = createFakeProcess();
    const proc2 = createFakeProcess();
    mockSpawn.mockReturnValueOnce(proc1).mockReturnValueOnce(proc2);

    const p1 = manager.startDevServer('session-1', '/fake/path1');
    proc1.emitStdout('  ➜  Local:   http://localhost:9000/\n');
    const result1 = await p1;

    const p2 = manager.startDevServer('session-2', '/fake/path2');
    proc2.emitStdout('  ➜  Local:   http://localhost:9001/\n');
    const result2 = await p2;

    expect(result1.port).toBe(9000);
    expect(result1.url).toBe('http://localhost:9000');
    expect(result2.port).toBe(9001);
    expect(result2.url).toBe('http://localhost:9001');
  });

  it('resolves when Vite outputs the Local URL', async () => {
    const proc = createFakeProcess();
    mockSpawn.mockReturnValueOnce(proc);

    const promise = manager.startDevServer('session-1', '/fake/path');
    proc.emitStdout('  VITE v6.0.0  ready in 200 ms\n');
    proc.emitStdout('  ➜  Local:   http://localhost:9000/\n');

    const result = await promise;
    expect(result.port).toBe(9000);
    expect(result.url).toBe('http://localhost:9000');
  });

  it('rejects if dev server times out', async () => {
    const proc = createFakeProcess();
    mockSpawn.mockReturnValueOnce(proc);

    // Don't emit the ready line — should timeout
    await expect(
      manager.startDevServer('session-1', '/fake/path')
    ).rejects.toThrow('did not start within 500ms');
  });

  it('rejects if the child process exits before ready', async () => {
    const proc = createFakeProcess();
    mockSpawn.mockReturnValueOnce(proc);

    const promise = manager.startDevServer('session-1', '/fake/path');
    proc.emit('exit', 1);

    await expect(promise).rejects.toThrow('exited unexpectedly with code 1');
  });

  it('rejects if spawn emits an error', async () => {
    const proc = createFakeProcess();
    mockSpawn.mockReturnValueOnce(proc);

    const promise = manager.startDevServer('session-1', '/fake/path');
    proc.emit('error', new Error('ENOENT'));

    await expect(promise).rejects.toThrow('Failed to spawn Vite');
  });

  it('rejects if a server is already running for the session', async () => {
    const proc = createFakeProcess();
    mockSpawn.mockReturnValueOnce(proc);

    const p = manager.startDevServer('session-1', '/fake/path');
    proc.emitStdout('  ➜  Local:   http://localhost:9000/\n');
    await p;

    await expect(
      manager.startDevServer('session-1', '/fake/path')
    ).rejects.toThrow('already running');
  });

  it('stopDevServer kills the process and removes it from tracking', async () => {
    const proc = createFakeProcess();
    mockSpawn.mockReturnValueOnce(proc);

    const p = manager.startDevServer('session-1', '/fake/path');
    proc.emitStdout('  ➜  Local:   http://localhost:9000/\n');
    await p;

    expect(manager.isRunning('session-1')).toBe(true);
    manager.stopDevServer('session-1');
    expect(manager.isRunning('session-1')).toBe(false);
    expect(proc.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('stopDevServer is a no-op for unknown sessions', () => {
    expect(() => manager.stopDevServer('unknown')).not.toThrow();
  });

  it('stopAll kills all running processes', async () => {
    const proc1 = createFakeProcess();
    const proc2 = createFakeProcess();
    mockSpawn.mockReturnValueOnce(proc1).mockReturnValueOnce(proc2);

    const p1 = manager.startDevServer('s1', '/fake/p1');
    proc1.emitStdout('  ➜  Local:   http://localhost:9000/\n');
    await p1;

    const p2 = manager.startDevServer('s2', '/fake/p2');
    proc2.emitStdout('  ➜  Local:   http://localhost:9001/\n');
    await p2;

    expect(manager.activeCount).toBe(2);
    manager.stopAll();
    expect(manager.activeCount).toBe(0);
    expect(proc1.kill).toHaveBeenCalledWith('SIGTERM');
    expect(proc2.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('activeCount reflects the number of running servers', async () => {
    expect(manager.activeCount).toBe(0);

    const proc = createFakeProcess();
    mockSpawn.mockReturnValueOnce(proc);

    const p = manager.startDevServer('session-1', '/fake/path');
    proc.emitStdout('  ➜  Local:   http://localhost:9000/\n');
    await p;

    expect(manager.activeCount).toBe(1);
  });

  it('spawns vite with correct arguments', async () => {
    const proc = createFakeProcess();
    mockSpawn.mockReturnValueOnce(proc);

    const p = manager.startDevServer('session-1', '/projects/game');
    proc.emitStdout('  ➜  Local:   http://localhost:9000/\n');
    await p;

    expect(mockSpawn).toHaveBeenCalledWith(
      '/projects/game/node_modules/.bin/vite',
      ['--port', '9000', '--host', '0.0.0.0'],
      expect.objectContaining({ cwd: '/projects/game' })
    );
  });

  describe('touchSession', () => {
    it('updates lastAccessed timestamp', async () => {
      const proc = createFakeProcess();
      mockSpawn.mockReturnValueOnce(proc);

      const p = manager.startDevServer('session-1', '/fake/path');
      proc.emitStdout('  ➜  Local:   http://localhost:9000/\n');
      await p;

      // touchSession should not throw
      expect(() => manager.touchSession('session-1')).not.toThrow();
    });

    it('is a no-op for unknown sessions', () => {
      expect(() => manager.touchSession('nonexistent')).not.toThrow();
    });
  });

  describe('maxConcurrent and LRU eviction', () => {
    let limitedManager: ViteManager;

    beforeEach(() => {
      limitedManager = new ViteManager({
        basePort: 9100,
        readyTimeoutMs: 500,
        maxConcurrent: 2,
        idleTimeoutMs: 0, // disable idle timeout for these tests
      });
    });

    afterEach(() => {
      limitedManager.stopAll();
    });

    it('evicts the least-recently-accessed server when at max capacity', async () => {
      const proc1 = createFakeProcess();
      const proc2 = createFakeProcess();
      const proc3 = createFakeProcess();
      mockSpawn
        .mockReturnValueOnce(proc1)
        .mockReturnValueOnce(proc2)
        .mockReturnValueOnce(proc3);

      // Start two servers (at max)
      const p1 = limitedManager.startDevServer('s1', '/fake/p1');
      proc1.emitStdout('  ➜  Local:   http://localhost:9100/\n');
      await p1;

      const p2 = limitedManager.startDevServer('s2', '/fake/p2');
      proc2.emitStdout('  ➜  Local:   http://localhost:9101/\n');
      await p2;

      expect(limitedManager.activeCount).toBe(2);

      // Start a third — should evict s1 (oldest)
      const p3 = limitedManager.startDevServer('s3', '/fake/p3');
      proc3.emitStdout('  ➜  Local:   http://localhost:9102/\n');
      await p3;

      expect(limitedManager.activeCount).toBe(2);
      expect(limitedManager.isRunning('s1')).toBe(false);
      expect(limitedManager.isRunning('s2')).toBe(true);
      expect(limitedManager.isRunning('s3')).toBe(true);
      expect(proc1.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('evicts the least-recently-touched server (not just oldest)', async () => {
      vi.useFakeTimers({ now: 1000 });

      const timedManager = new ViteManager({
        basePort: 9150,
        readyTimeoutMs: 500,
        maxConcurrent: 2,
        idleTimeoutMs: 0,
      });

      const proc1 = createFakeProcess();
      const proc2 = createFakeProcess();
      const proc3 = createFakeProcess();
      mockSpawn
        .mockReturnValueOnce(proc1)
        .mockReturnValueOnce(proc2)
        .mockReturnValueOnce(proc3);

      // Start s1 at t=1000
      const p1 = timedManager.startDevServer('s1', '/fake/p1');
      proc1.emitStdout('  ➜  Local:   http://localhost:9150/\n');
      await p1;

      // Start s2 at t=2000
      vi.advanceTimersByTime(1000);
      const p2 = timedManager.startDevServer('s2', '/fake/p2');
      proc2.emitStdout('  ➜  Local:   http://localhost:9151/\n');
      await p2;

      // Touch s1 at t=3000 — makes s2 the oldest
      vi.advanceTimersByTime(1000);
      timedManager.touchSession('s1');

      // Start a third at t=4000 — should evict s2 (oldest)
      vi.advanceTimersByTime(1000);
      const p3 = timedManager.startDevServer('s3', '/fake/p3');
      proc3.emitStdout('  ➜  Local:   http://localhost:9152/\n');
      await p3;

      expect(timedManager.isRunning('s1')).toBe(true);
      expect(timedManager.isRunning('s2')).toBe(false);
      expect(timedManager.isRunning('s3')).toBe(true);
      expect(proc2.kill).toHaveBeenCalledWith('SIGTERM');

      timedManager.stopAll();
      vi.useRealTimers();
    });
  });

  describe('idle timeout', () => {
    it('stops servers idle beyond the timeout threshold', async () => {
      vi.useFakeTimers();

      const idleManager = new ViteManager({
        basePort: 9200,
        readyTimeoutMs: 500,
        maxConcurrent: 10,
        idleTimeoutMs: 10_000,       // 10s idle threshold
        idleCheckIntervalMs: 5_000,  // check every 5s
      });

      const proc = createFakeProcess();
      mockSpawn.mockReturnValueOnce(proc);

      const p = idleManager.startDevServer('idle-session', '/fake/path');
      proc.emitStdout('  ➜  Local:   http://localhost:9200/\n');
      await p;

      expect(idleManager.isRunning('idle-session')).toBe(true);

      // Advance time beyond idle threshold + check interval
      vi.advanceTimersByTime(15_000);

      expect(idleManager.isRunning('idle-session')).toBe(false);
      expect(proc.kill).toHaveBeenCalledWith('SIGTERM');

      idleManager.stopAll();
      vi.useRealTimers();
    });

    it('does not evict recently-touched sessions', async () => {
      vi.useFakeTimers();

      const idleManager = new ViteManager({
        basePort: 9300,
        readyTimeoutMs: 500,
        maxConcurrent: 10,
        idleTimeoutMs: 10_000,
        idleCheckIntervalMs: 5_000,
      });

      const proc = createFakeProcess();
      mockSpawn.mockReturnValueOnce(proc);

      const p = idleManager.startDevServer('active-session', '/fake/path');
      proc.emitStdout('  ➜  Local:   http://localhost:9300/\n');
      await p;

      // Advance partway and touch the session
      vi.advanceTimersByTime(8_000);
      idleManager.touchSession('active-session');

      // Advance past the original idle threshold (but not past the touch timestamp)
      vi.advanceTimersByTime(7_000); // total: 15s from start, 7s from touch

      expect(idleManager.isRunning('active-session')).toBe(true);

      // Now advance past the idle threshold from the touch point
      vi.advanceTimersByTime(5_000); // total: 12s from touch

      expect(idleManager.isRunning('active-session')).toBe(false);

      idleManager.stopAll();
      vi.useRealTimers();
    });
  });
});
