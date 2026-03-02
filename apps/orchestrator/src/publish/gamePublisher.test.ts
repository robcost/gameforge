import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildGameProject } from './gamePublisher.js';
import * as fs from 'node:fs';
import * as childProcess from 'node:child_process';

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof fs>('node:fs');
  return { ...actual, existsSync: vi.fn() };
});

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof childProcess>('node:child_process');
  return { ...actual, execFile: vi.fn() };
});

const mockExistsSync = vi.mocked(fs.existsSync);
const mockExecFile = vi.mocked(childProcess.execFile);

describe('buildGameProject', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects when package.json does not exist', async () => {
    mockExistsSync.mockReturnValue(false);

    await expect(buildGameProject('/sessions/test/game')).rejects.toThrow(
      'Project not scaffolded'
    );
  });

  it('calls execFile with correct args and cwd', async () => {
    mockExistsSync.mockReturnValue(true);
    mockExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
      (cb as Function)(null, 'build output', '');
      return {} as ReturnType<typeof childProcess.execFile>;
    });

    await buildGameProject('/sessions/test/game');

    expect(mockExecFile).toHaveBeenCalledWith(
      'npx',
      ['vite', 'build'],
      { cwd: '/sessions/test/game' },
      expect.any(Function)
    );
  });

  it('returns dist path on success', async () => {
    mockExistsSync.mockReturnValue(true);
    mockExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
      (cb as Function)(null, '', '');
      return {} as ReturnType<typeof childProcess.execFile>;
    });

    const result = await buildGameProject('/sessions/test/game');
    expect(result).toMatch(/\/sessions\/test\/game\/dist$/);
  });

  it('rejects with stderr on build failure', async () => {
    mockExistsSync.mockReturnValue(true);
    mockExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
      (cb as Function)(new Error('exit code 1'), '', 'Module not found');
      return {} as ReturnType<typeof childProcess.execFile>;
    });

    await expect(buildGameProject('/sessions/test/game')).rejects.toThrow(
      'Vite build failed: Module not found'
    );
  });

  it('rejects with error message when stderr is empty', async () => {
    mockExistsSync.mockReturnValue(true);
    mockExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
      (cb as Function)(new Error('Command failed'), '', '');
      return {} as ReturnType<typeof childProcess.execFile>;
    });

    await expect(buildGameProject('/sessions/test/game')).rejects.toThrow(
      'Vite build failed: Command failed'
    );
  });
});
