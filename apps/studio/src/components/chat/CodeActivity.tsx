'use client';

import { useEffect, useRef } from 'react';

/** Props for the CodeActivity component. */
export interface CodeActivityProps {
  /** The file name being modified. */
  fileName: string;
  /** The code snippet being written. */
  code: string;
}

/**
 * Displays a scrolling code preview during agent execution.
 * Shows the file name and auto-scrolls through the code to give a visual
 * indication that the agent is actively writing code. Not meant to be
 * legible — purely a progress indicator.
 */
export function CodeActivity({ fileName, code }: CodeActivityProps) {
  const codeRef = useRef<HTMLPreElement>(null);

  // Scroll to bottom when code updates — works naturally with streaming
  // since new code appears at the bottom as it's generated
  useEffect(() => {
    const el = codeRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [code]);

  // Extract just the filename from the full path
  const shortName = fileName.split('/').pop() ?? fileName;

  return (
    <div className="mt-2 rounded-lg overflow-hidden bg-slate-900/80 border border-slate-700/50">
      {/* File name header */}
      <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-800/60 border-b border-slate-700/50">
        <span className="w-2 h-2 rounded-full bg-indigo-400/60 animate-pulse" />
        <span className="text-[10px] font-mono text-slate-400 truncate">
          {shortName}
        </span>
      </div>
      {/* Scrolling code view */}
      <pre
        ref={codeRef}
        className="px-2 py-1.5 text-[10px] leading-tight font-mono text-slate-500/70 max-h-[100px] overflow-hidden select-none"
      >
        {code}
      </pre>
    </div>
  );
}
