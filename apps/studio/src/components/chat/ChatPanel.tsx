'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { AgentRole, AgentStatus } from '@robcost/shared-types';
import type { ChatMessage } from '../../stores/sessionStore';
import type { ConnectionState } from '../../hooks/useWebSocket';
import { AgentMarkdown } from './AgentMarkdown';
import { CodeActivity } from './CodeActivity';

/** Props for the ChatPanel component. */
export interface ChatPanelProps {
  /** Chat messages to display. */
  messages: ChatMessage[];
  /** Current status of each agent role. */
  agentStates: Record<AgentRole, AgentStatus>;
  /** Latest code activity from the working agent, or null. */
  codeActivity: { fileName: string; code: string } | null;
  /** Human-readable description of what the working agent is currently doing. */
  agentActivity: string | null;
  /** Callback when the user sends a message. */
  onSendMessage: (content: string) => void;
  /** Current WebSocket connection state. */
  connectionState?: ConnectionState;
}

/** Human-readable labels for agent roles. */
const AGENT_LABELS: Record<string, string> = {
  designer: 'Designer',
  artist: 'Artist',
  musician: 'Musician',
  developer: 'Developer',
  qa: 'QA',
  orchestrator: 'Orchestrator',
};

/**
 * Chat panel component for the studio workspace.
 * Displays a scrollable message list with role-based styling, markdown
 * rendering for agent messages, a code activity preview during agent
 * execution, and a text input for sending messages.
 */
export function ChatPanel({ messages, agentStates, codeActivity, agentActivity, onSendMessage, connectionState = 'connected' }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Find which agents are currently working
  const workingAgents = (['designer', 'artist', 'developer', 'qa'] as const).filter(
    (role) => agentStates[role] === 'working'
  );
  const isAgentBusy = workingAgents.length > 0;
  const isDisconnected = connectionState !== 'connected';
  const isInputDisabled = isAgentBusy || isDisconnected;

  // Auto-scroll to bottom when messages change or an agent starts working
  useEffect(() => {
    const el = scrollRef.current;
    if (el?.scrollTo) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }, [messages.length, isAgentBusy, codeActivity]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isInputDisabled) return;
    onSendMessage(trimmed);
    setInput('');
  };

  return (
    <div className="flex h-full flex-col" data-testid="chat-panel">
      {/* Message list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <p className="text-slate-500 text-sm">
            Describe the game you want to create...
          </p>
        ) : (
          messages.map((msg, i) => (
            <div
              key={i}
              className={`rounded-lg px-3 py-2 text-sm ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white ml-8'
                  : 'bg-slate-700 text-slate-200 mr-8'
              }`}
            >
              {msg.role !== 'user' && (
                <span className="text-xs text-slate-400 block mb-1">
                  {AGENT_LABELS[msg.role] ?? msg.role}
                </span>
              )}
              {msg.role === 'user' ? (
                msg.content
              ) : (
                <>
                  {msg.imageBase64 && (
                    <img
                      src={`data:image/png;base64,${msg.imageBase64}`}
                      alt="QA Screenshot"
                      className="rounded-lg border border-slate-600 max-w-full my-2"
                    />
                  )}
                  <AgentMarkdown content={msg.content} />
                </>
              )}
            </div>
          ))
        )}

        {/* Agent working indicator */}
        {isAgentBusy && (
          <div
            className="mr-8 rounded-lg bg-slate-700/60 px-3 py-2 text-sm text-slate-400"
            data-testid="agent-working-indicator"
          >
            <div className="flex items-center gap-2">
              <span className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:300ms]" />
              </span>
              <span>
                {workingAgents.map((r) => AGENT_LABELS[r]).join(', ')} is working...
              </span>
            </div>
            {agentActivity && (
              <p className="text-xs text-slate-500 mt-1 ml-5 truncate">{agentActivity}</p>
            )}
            {/* Code activity streaming view */}
            {codeActivity && (
              <CodeActivity
                fileName={codeActivity.fileName}
                code={codeActivity.code}
              />
            )}
          </div>
        )}
      </div>

      {/* Input form */}
      <form onSubmit={handleSubmit} className="border-t border-slate-700 p-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isDisconnected ? 'Reconnecting to server...' : isAgentBusy ? 'Waiting for agents to finish...' : 'Type a message...'}
            disabled={isInputDisabled}
            className="flex-1 rounded-lg bg-slate-700 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="chat-input"
          />
          <button
            type="submit"
            disabled={isInputDisabled}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="chat-send"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
