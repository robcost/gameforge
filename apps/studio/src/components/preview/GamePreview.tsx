'use client';

import { useRef, useCallback, useState } from 'react';

/** Props for the GamePreview component. */
export interface GamePreviewProps {
  /** URL to load in the preview iframe. */
  src?: string;
  /** Counter used as iframe key to force reload. */
  refreshKey?: number;
  /** Callback when the user clicks the reset button. */
  onReset?: () => void;
  /** Whether the project is currently being scaffolded. */
  isScaffolding?: boolean;
  /** URL path where the published game is served, or null if not yet published. */
  publishedUrl?: string | null;
  /** Whether a publish operation is currently in progress. */
  isPublishing?: boolean;
  /** Callback to trigger game publishing. */
  onPublish?: () => void;
}

/**
 * Game preview component that wraps an iframe for displaying the live game.
 * Shows a pulsing loading state during scaffolding, an empty state until a
 * game session is active, and supports forced reload via refreshKey and a
 * reset button. Includes fullscreen toggle for the preview container.
 */
export function GamePreview({
  src,
  refreshKey,
  onReset,
  isScaffolding = false,
  publishedUrl,
  isPublishing = false,
  onPublish,
}: GamePreviewProps) {
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  /** Toggles the preview container between fullscreen and normal mode. */
  const handleFullscreen = useCallback(() => {
    const container = previewContainerRef.current;
    if (!container) return;

    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      container.requestFullscreen();
    }
  }, []);

  /** Copies the full share URL to clipboard. */
  const handleCopyUrl = useCallback(() => {
    if (!publishedUrl) return;
    const orchestratorUrl = process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ?? 'http://localhost:4000';
    const fullUrl = `${orchestratorUrl}${publishedUrl}`;
    navigator.clipboard.writeText(fullUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [publishedUrl]);

  return (
    <div
      ref={previewContainerRef}
      className="flex h-full flex-col bg-slate-950"
      data-testid="game-preview"
    >
      {src ? (
        <>
          {/* Preview controls */}
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-800">
            <button
              onClick={onReset}
              className="rounded px-2 py-1 text-xs text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
              data-testid="preview-reset"
            >
              Reset
            </button>
            <div className="flex items-center gap-2 ml-auto">
              {publishedUrl && (
                <span className="text-xs text-slate-500 truncate max-w-[200px]" data-testid="published-url">
                  {publishedUrl}
                </span>
              )}
              {publishedUrl && (
                <button
                  onClick={handleCopyUrl}
                  className="rounded px-2 py-1 text-xs text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                  data-testid="copy-url"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              )}
              {onPublish && (
                <button
                  onClick={onPublish}
                  disabled={isPublishing}
                  className="rounded px-2 py-1 text-xs text-indigo-400 hover:text-white hover:bg-indigo-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="preview-share"
                >
                  {isPublishing ? 'Publishing...' : 'Share'}
                </button>
              )}
              <button
                onClick={handleFullscreen}
                className="rounded px-2 py-1 text-xs text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                data-testid="preview-fullscreen"
                aria-label="Toggle fullscreen"
              >
                Fullscreen
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            <iframe
              key={refreshKey}
              src={src}
              title="Game Preview"
              className="h-full w-full border-0"
              data-testid="game-iframe"
              sandbox="allow-scripts allow-same-origin"
            />
          </div>
        </>
      ) : isScaffolding ? (
        <div className="flex flex-1 items-center justify-center" data-testid="preview-scaffolding">
          <div className="text-center">
            <div className="mb-4 flex justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-indigo-400" />
            </div>
            <p className="text-slate-400 text-sm animate-pulse">
              Setting up your game workspace...
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <div className="text-4xl text-slate-600 mb-3">&#127918;</div>
            <p className="text-slate-500 text-sm">
              Game preview will appear here
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
