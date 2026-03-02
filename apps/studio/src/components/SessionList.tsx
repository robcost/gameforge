'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

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
 * Returns a human-readable relative time string (e.g. "2 hours ago").
 *
 * @param timestamp - Unix timestamp in milliseconds.
 * @returns Relative time string.
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

/**
 * Fetches and displays a list of previous game sessions.
 * Each session card links to its studio workspace.
 */
export function SessionList() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
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
  }, []);

  if (isLoading) return null;

  if (error) {
    return (
      <p className="text-sm text-red-400" data-testid="session-list-error">
        {error}
      </p>
    );
  }

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
    } catch {
      // Silently ignore — session card remains in list
    } finally {
      setDeletingId(null);
    }
  };

  if (sessions.length === 0) {
    return (
      <p className="text-sm text-slate-500" data-testid="session-list-empty">
        No previous sessions
      </p>
    );
  }

  return (
    <div
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 w-full"
      data-testid="session-list"
    >
      {sessions.map((s) => (
        <Link
          key={s.id}
          href={`/studio/${s.id}`}
          className="rounded-lg border border-slate-700 bg-slate-800/50 p-4 hover:border-indigo-500/50 hover:bg-slate-800 transition-colors"
          data-testid="session-card"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-200 capitalize">
              {s.genre}
            </span>
            <div className="flex items-center gap-1">
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[s.status] ?? 'bg-slate-500/20 text-slate-400'}`}
                data-testid="session-status-badge"
              >
                {s.status}
              </span>
              <button
                onClick={(e) => handleDeleteSession(s.id, e)}
                disabled={deletingId === s.id}
                className="p-1 text-slate-500 hover:text-red-400 transition-colors disabled:opacity-50"
                data-testid="session-delete"
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
            <span>{s.messageCount} messages</span>
            <span>{relativeTime(s.updatedAt)}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}
