'use client';

import { useState } from 'react';
import { ChatPanel } from '../chat/ChatPanel';
import { GamePreview } from '../preview/GamePreview';
import { SessionTray } from '../SessionTray';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useSessionStore } from '../../stores/sessionStore';

/** Props for the StudioLayout component. */
export interface StudioLayoutProps {
  /** The session UUID for WebSocket connectivity. */
  sessionId: string;
}

/**
 * Two-panel studio layout: chat on the left (40%), game preview on the right (60%).
 * Wires the WebSocket hook and Zustand store to the child components.
 */
export function StudioLayout({ sessionId }: StudioLayoutProps) {
  const [isTrayOpen, setIsTrayOpen] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const { sendMessage, connectionState } = useWebSocket(sessionId);

  const messages = useSessionStore((s) => s.messages);
  const agentStates = useSessionStore((s) => s.agentStates);
  const codeActivity = useSessionStore((s) => s.codeActivity);
  const agentActivity = useSessionStore((s) => s.agentActivity);
  const previewUrl = useSessionStore((s) => s.previewUrl);
  const isScaffolding = useSessionStore((s) => s.isScaffolding);
  const refreshCounter = useSessionStore((s) => s.refreshCounter);
  const totalCostUsd = useSessionStore((s) => s.totalCostUsd);
  const publishedUrl = useSessionStore((s) => s.publishedUrl);
  const setPublishedUrl = useSessionStore((s) => s.setPublishedUrl);

  const handleSendMessage = (content: string) => {
    // Add user message to local store immediately
    useSessionStore.getState().addMessage({
      role: 'user',
      content,
      timestamp: Date.now(),
    });
    // Send to orchestrator via WebSocket
    sendMessage({ type: 'user_message', content });
  };

  const handleReset = () => {
    sendMessage({ type: 'preview_interaction', action: 'reset' });
  };

  const handlePublish = async () => {
    const orchestratorUrl = process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ?? 'http://localhost:4000';
    setIsPublishing(true);
    try {
      const res = await fetch(`${orchestratorUrl}/api/sessions/${sessionId}/publish`, {
        method: 'POST',
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || 'Publish failed');
      }
      const body = await res.json();
      setPublishedUrl(body.publishedUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Publish failed';
      useSessionStore.getState().addMessage({
        role: 'orchestrator',
        content: `Publish failed: ${message}`,
        timestamp: Date.now(),
      });
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="flex h-screen" data-testid="studio-layout">
      <SessionTray
        isOpen={isTrayOpen}
        onClose={() => setIsTrayOpen(false)}
        currentSessionId={sessionId}
      />

      {/* Chat panel — 40% width */}
      <div className="w-2/5 border-r border-slate-700 flex flex-col">
        <div className="border-b border-slate-700 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsTrayOpen(true)}
              className="text-slate-400 hover:text-slate-200 transition-colors"
              data-testid="session-tray-toggle"
              aria-label="Open session tray"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
              </svg>
            </button>
            <h2 className="text-sm font-semibold text-slate-300">Chat</h2>
          </div>
          <div className="flex items-center gap-3 text-xs">
            {totalCostUsd > 0 && (
              <span className="text-slate-500" data-testid="session-cost">
                ${totalCostUsd.toFixed(4)}
              </span>
            )}
            <div className="flex items-center gap-1.5" data-testid="connection-status">
              <span
                className={`w-2 h-2 rounded-full ${
                  connectionState === 'connected'
                    ? 'bg-green-400'
                    : connectionState === 'reconnecting'
                    ? 'bg-amber-400 animate-pulse'
                    : 'bg-red-400'
                }`}
              />
              <span className="text-slate-500">
                {connectionState === 'connected'
                  ? 'Connected'
                  : connectionState === 'reconnecting'
                  ? 'Reconnecting...'
                  : 'Disconnected'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <ChatPanel messages={messages} agentStates={agentStates} codeActivity={codeActivity} agentActivity={agentActivity} onSendMessage={handleSendMessage} connectionState={connectionState} />
        </div>
      </div>

      {/* Game preview — 60% width */}
      <div className="w-3/5 flex flex-col">
        <div className="border-b border-slate-700 px-4 py-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-300">Preview</h2>
          {isScaffolding && (
            <span className="text-xs text-amber-400 animate-pulse">
              Setting up workspace...
            </span>
          )}
        </div>
        <div className="flex-1 overflow-hidden">
          <GamePreview
            src={previewUrl ?? undefined}
            refreshKey={refreshCounter}
            onReset={handleReset}
            isScaffolding={isScaffolding}
            publishedUrl={publishedUrl}
            isPublishing={isPublishing}
            onPublish={handlePublish}
          />
        </div>
      </div>
    </div>
  );
}
