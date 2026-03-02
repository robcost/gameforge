'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { GameEngine } from '@robcost/shared-types';

/** Default orchestrator REST API URL. */
const ORCHESTRATOR_URL =
  process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ?? 'http://localhost:4000';

/**
 * Client component button that creates a new game session via the
 * orchestrator API and navigates to the studio workspace.
 * Includes an engine selector for 2D (Phaser) or 3D (Three.js) games.
 * Shows an error message below the button when creation fails.
 */
export function NewGameButton() {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [engine, setEngine] = useState<GameEngine>('phaser');

  const handleNewGame = async () => {
    setIsCreating(true);
    setError(null);
    const genre = engine === 'threejs' ? '3d' : '2d';
    try {
      const res = await fetch(`${ORCHESTRATOR_URL}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engine, genre }),
      });
      if (!res.ok) {
        throw new Error(`Server error (${res.status})`);
      }
      const data = await res.json();
      router.push(`/studio/${data.sessionId}`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to create session';
      setError(message);
      setIsCreating(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Engine selector */}
      <div className="flex gap-2" data-testid="engine-selector">
        <button
          type="button"
          onClick={() => setEngine('phaser')}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            engine === 'phaser'
              ? 'bg-indigo-600 text-white'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
          data-testid="engine-phaser"
        >
          2D Game (Phaser)
        </button>
        <button
          type="button"
          onClick={() => setEngine('threejs')}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            engine === 'threejs'
              ? 'bg-indigo-600 text-white'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
          data-testid="engine-threejs"
        >
          3D Game (Three.js)
        </button>
      </div>

      <button
        onClick={handleNewGame}
        disabled={isCreating}
        className="rounded-lg bg-indigo-600 px-6 py-3 text-lg font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        data-testid="new-game-button"
      >
        {isCreating ? 'Creating...' : 'New Game'}
      </button>
      {error && (
        <p
          className="text-sm text-red-400"
          data-testid="new-game-error"
        >
          {error}
        </p>
      )}
    </div>
  );
}
