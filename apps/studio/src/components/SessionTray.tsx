'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

/** Default orchestrator REST API URL. */
const ORCHESTRATOR_URL =
  process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ?? 'http://localhost:4000';

/** Summary of a session returned by the API. */
interface SessionSummary {
  id: string;
  status: string;
  engine: string;
  genre: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  /** Game title from GDD, or null if not yet designed. */
  gameTitle: string | null;
  /** Cumulative API cost in USD. */
  totalCostUsd: number;
}

/** Status badge color map. */
const STATUS_COLORS: Record<string, string> = {
  ready: 'bg-green-500/20 text-green-400',
  awaiting_feedback: 'bg-green-500/20 text-green-400',
  designing: 'bg-amber-500/20 text-amber-400',
  developing: 'bg-amber-500/20 text-amber-400',
  testing: 'bg-amber-500/20 text-amber-400',
  iterating: 'bg-amber-500/20 text-amber-400',
  scaffolding: 'bg-amber-500/20 text-amber-400',
  error: 'bg-red-500/20 text-red-400',
  new: 'bg-slate-500/20 text-slate-400',
  closed: 'bg-slate-500/20 text-slate-400',
};

/**
 * Returns a human-readable relative time string.
 *
 * @param timestamp - Unix timestamp in milliseconds.
 * @returns Relative time string (e.g. "2h ago").
 */
function relativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Props for the SessionTray component. */
export interface SessionTrayProps {
  /** Whether the tray is open (visible). */
  isOpen: boolean;
  /** Callback to close the tray. */
  onClose: () => void;
  /** The currently active session ID, used for highlighting. */
  currentSessionId: string;
}

/**
 * Collapsible side tray that shows session navigation.
 * Slides in from the left over the chat panel with a translate-x transition.
 * Fetches the session list from the orchestrator API when opened.
 */
export function SessionTray({ isOpen, onClose, currentSessionId }: SessionTrayProps) {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Fetch sessions when tray opens
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setIsLoading(true);

    async function fetchSessions() {
      try {
        const res = await fetch(`${ORCHESTRATOR_URL}/api/sessions`);
        if (!res.ok) throw new Error(`Server error (${res.status})`);
        const data: SessionSummary[] = await res.json();
        if (!cancelled) {
          setSessions(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to load sessions'
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    fetchSessions();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const handleNewGame = async () => {
    setIsCreating(true);
    try {
      const res = await fetch(`${ORCHESTRATOR_URL}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engine: 'phaser', genre: '2d' }),
      });
      if (!res.ok) throw new Error(`Server error (${res.status})`);
      const data = await res.json();
      onClose();
      router.push(`/studio/${data.sessionId}`);
    } catch {
      setIsCreating(false);
    }
  };

  /**
   * Deletes a session after user confirmation.
   * Removes from the API with disk cleanup and updates the local list.
   */
  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.preventDefault(); // Prevent Link navigation
    e.stopPropagation();

    if (!window.confirm('Delete this session and all its files?')) return;

    setDeletingId(sessionId);
    try {
      const res = await fetch(
        `${ORCHESTRATOR_URL}/api/sessions/${sessionId}?cleanup=true`,
        { method: 'DELETE' }
      );
      if (!res.ok) throw new Error(`Server error (${res.status})`);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));

      // If deleting the current session, navigate home
      if (sessionId === currentSessionId) {
        onClose();
        router.push('/');
      }
    } catch {
      // Silently ignore — session card remains in list
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      {/* Backdrop — click to close */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40"
          onClick={onClose}
          data-testid="session-tray-backdrop"
        />
      )}

      {/* Tray panel */}
      <div
        className={`fixed top-0 left-0 h-full w-80 bg-slate-900 border-r border-slate-700 z-50 flex flex-col transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        data-testid="session-tray"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-300">Sessions</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 transition-colors"
            data-testid="session-tray-close"
            aria-label="Close session tray"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* New Game button */}
        <div className="px-4 py-3 border-b border-slate-700">
          <button
            onClick={handleNewGame}
            disabled={isCreating}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="session-tray-new-game"
          >
            {isCreating ? 'Creating...' : 'New Game'}
          </button>
        </div>

        {/* Home link */}
        <div className="px-4 py-2 border-b border-slate-700">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
            data-testid="session-tray-home"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
            </svg>
            Home
          </Link>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {isLoading && (
            <p className="text-sm text-slate-500">Loading sessions...</p>
          )}
          {error && (
            <p className="text-sm text-red-400" data-testid="session-tray-error">
              {error}
            </p>
          )}
          {!isLoading && !error && sessions.length === 0 && (
            <p className="text-sm text-slate-500" data-testid="session-tray-empty">
              No sessions yet
            </p>
          )}
          {sessions.map((s) => (
            <Link
              key={s.id}
              href={`/studio/${s.id}`}
              onClick={onClose}
              className={`block rounded-lg border p-3 transition-colors ${
                s.id === currentSessionId
                  ? 'border-indigo-500 bg-indigo-500/10'
                  : 'border-slate-700 bg-slate-800/50 hover:border-indigo-500/50 hover:bg-slate-800'
              }`}
              data-testid="session-tray-card"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-slate-200 truncate" data-testid="session-tray-card-title">
                  {s.gameTitle ?? s.genre}
                </span>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[s.status] ?? 'bg-slate-500/20 text-slate-400'}`}
                  >
                    {s.status}
                  </span>
                  <button
                    onClick={(e) => handleDeleteSession(s.id, e)}
                    disabled={deletingId === s.id}
                    className="p-1 text-slate-500 hover:text-red-400 transition-colors disabled:opacity-50"
                    data-testid="session-tray-delete"
                    aria-label="Delete session"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span>{s.engine}</span>
                <span>{s.messageCount} msgs</span>
                {s.totalCostUsd > 0 && (
                  <span data-testid="session-tray-cost">${s.totalCostUsd.toFixed(4)}</span>
                )}
                <span>{relativeTime(s.updatedAt)}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
