import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ChatPanel } from './ChatPanel';
import type { ChatMessage } from '../../stores/sessionStore';
import type { AgentRole, AgentStatus } from '@robcost/shared-types';

const noop = vi.fn();

/** Default idle agent states for tests. */
const idleAgentStates: Record<AgentRole, AgentStatus> = {
  designer: 'idle',
  artist: 'idle',
  developer: 'idle',
  qa: 'idle',
  orchestrator: 'idle',
};

function createMessages(...contents: string[]): ChatMessage[] {
  return contents.map((content, i) => ({
    role: 'user' as const,
    content,
    timestamp: 1000 + i,
  }));
}

describe('ChatPanel', () => {
  it('renders the chat panel container', () => {
    render(<ChatPanel messages={[]} agentStates={idleAgentStates} codeActivity={null} agentActivity={null} onSendMessage={noop} />);
    expect(screen.getByTestId('chat-panel')).toBeInTheDocument();
  });

  it('renders the placeholder text when no messages exist', () => {
    render(<ChatPanel messages={[]} agentStates={idleAgentStates} codeActivity={null} agentActivity={null} onSendMessage={noop} />);
    expect(
      screen.getByText(/describe the game you want to create/i)
    ).toBeInTheDocument();
  });

  it('renders the text input', () => {
    render(<ChatPanel messages={[]} agentStates={idleAgentStates} codeActivity={null} agentActivity={null} onSendMessage={noop} />);
    expect(screen.getByTestId('chat-input')).toBeInTheDocument();
  });

  it('accepts text input', () => {
    render(<ChatPanel messages={[]} agentStates={idleAgentStates} codeActivity={null} agentActivity={null} onSendMessage={noop} />);
    const input = screen.getByTestId('chat-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Make a platformer' } });
    expect(input.value).toBe('Make a platformer');
  });

  it('calls onSendMessage on form submit and clears input', () => {
    const onSend = vi.fn();
    render(<ChatPanel messages={[]} agentStates={idleAgentStates} codeActivity={null} agentActivity={null} onSendMessage={onSend} />);
    const input = screen.getByTestId('chat-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Build a space game' } });
    fireEvent.click(screen.getByTestId('chat-send'));
    expect(onSend).toHaveBeenCalledWith('Build a space game');
    expect(input.value).toBe('');
  });

  it('does not call onSendMessage for empty messages', () => {
    const onSend = vi.fn();
    render(<ChatPanel messages={[]} agentStates={idleAgentStates} codeActivity={null} agentActivity={null} onSendMessage={onSend} />);
    fireEvent.click(screen.getByTestId('chat-send'));
    expect(onSend).not.toHaveBeenCalled();
  });

  it('renders provided messages', () => {
    const msgs = createMessages('Hello', 'World');
    render(<ChatPanel messages={msgs} agentStates={idleAgentStates} codeActivity={null} agentActivity={null} onSendMessage={noop} />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('World')).toBeInTheDocument();
  });

  it('renders agent messages with role label', () => {
    const msgs: ChatMessage[] = [
      { role: 'orchestrator', content: 'Setup complete', timestamp: 1000 },
    ];
    render(<ChatPanel messages={msgs} agentStates={idleAgentStates} codeActivity={null} agentActivity={null} onSendMessage={noop} />);
    expect(screen.getByText('Orchestrator')).toBeInTheDocument();
    expect(screen.getByText('Setup complete')).toBeInTheDocument();
  });

  it('renders markdown in agent messages', () => {
    const msgs: ChatMessage[] = [
      { role: 'developer', content: 'Added **bold text** feature', timestamp: 1000 },
    ];
    render(<ChatPanel messages={msgs} agentStates={idleAgentStates} codeActivity={null} agentActivity={null} onSendMessage={noop} />);
    const boldEl = screen.getByText('bold text');
    expect(boldEl.tagName).toBe('STRONG');
  });

  it('renders user messages as plain text without markdown processing', () => {
    const msgs: ChatMessage[] = [
      { role: 'user', content: '**not bold**', timestamp: 1000 },
    ];
    render(<ChatPanel messages={msgs} agentStates={idleAgentStates} codeActivity={null} agentActivity={null} onSendMessage={noop} />);
    expect(screen.getByText('**not bold**')).toBeInTheDocument();
  });

  it('shows working indicator when an agent is busy', () => {
    const busyStates: Record<AgentRole, AgentStatus> = {
      ...idleAgentStates,
      designer: 'working',
    };
    render(<ChatPanel messages={[]} agentStates={busyStates} codeActivity={null} agentActivity={null} onSendMessage={noop} />);
    expect(screen.getByTestId('agent-working-indicator')).toBeInTheDocument();
    expect(screen.getByText(/Designer is working/)).toBeInTheDocument();
  });

  it('disables input and send button when an agent is busy', () => {
    const busyStates: Record<AgentRole, AgentStatus> = {
      ...idleAgentStates,
      developer: 'working',
    };
    render(<ChatPanel messages={[]} agentStates={busyStates} codeActivity={null} agentActivity={null} onSendMessage={noop} />);
    expect(screen.getByTestId('chat-input')).toBeDisabled();
    expect(screen.getByTestId('chat-send')).toBeDisabled();
  });

  it('does not show working indicator when all agents are idle', () => {
    render(<ChatPanel messages={[]} agentStates={idleAgentStates} codeActivity={null} agentActivity={null} onSendMessage={noop} />);
    expect(screen.queryByTestId('agent-working-indicator')).not.toBeInTheDocument();
  });

  it('renders Artist label for artist messages', () => {
    const msgs: ChatMessage[] = [
      { role: 'artist', content: 'Generated player sprite', timestamp: 1000 },
    ];
    render(<ChatPanel messages={msgs} agentStates={idleAgentStates} codeActivity={null} agentActivity={null} onSendMessage={noop} />);
    expect(screen.getByText('Artist')).toBeInTheDocument();
    expect(screen.getByText('Generated player sprite')).toBeInTheDocument();
  });

  it('shows Artist in working indicator when artist is busy', () => {
    const busyStates: Record<AgentRole, AgentStatus> = {
      ...idleAgentStates,
      artist: 'working',
    };
    render(<ChatPanel messages={[]} agentStates={busyStates} codeActivity={null} agentActivity={null} onSendMessage={noop} />);
    expect(screen.getByTestId('agent-working-indicator')).toBeInTheDocument();
    expect(screen.getByText(/Artist is working/)).toBeInTheDocument();
  });

  it('shows code activity when agent is busy and code is available', () => {
    const busyStates: Record<AgentRole, AgentStatus> = {
      ...idleAgentStates,
      developer: 'working',
    };
    const activity = { fileName: 'src/scenes/MainScene.ts', code: 'const x = 1;' };
    render(<ChatPanel messages={[]} agentStates={busyStates} codeActivity={activity} agentActivity={null} onSendMessage={noop} />);
    expect(screen.getByText('MainScene.ts')).toBeInTheDocument();
    expect(screen.getByText('const x = 1;')).toBeInTheDocument();
  });

  describe('disconnect awareness', () => {
    it('disables input and send button when disconnected', () => {
      render(
        <ChatPanel
          messages={[]}
          agentStates={idleAgentStates}
          codeActivity={null}
          agentActivity={null}
          onSendMessage={noop}
          connectionState="disconnected"
        />
      );
      expect(screen.getByTestId('chat-input')).toBeDisabled();
      expect(screen.getByTestId('chat-send')).toBeDisabled();
    });

    it('shows reconnecting placeholder when disconnected', () => {
      render(
        <ChatPanel
          messages={[]}
          agentStates={idleAgentStates}
          codeActivity={null}
          agentActivity={null}
          onSendMessage={noop}
          connectionState="disconnected"
        />
      );
      const input = screen.getByTestId('chat-input') as HTMLInputElement;
      expect(input.placeholder).toBe('Reconnecting to server...');
    });

    it('shows reconnecting placeholder when reconnecting', () => {
      render(
        <ChatPanel
          messages={[]}
          agentStates={idleAgentStates}
          codeActivity={null}
          agentActivity={null}
          onSendMessage={noop}
          connectionState="reconnecting"
        />
      );
      const input = screen.getByTestId('chat-input') as HTMLInputElement;
      expect(input.placeholder).toBe('Reconnecting to server...');
    });

    it('does not send message when disconnected', () => {
      const onSend = vi.fn();
      render(
        <ChatPanel
          messages={[]}
          agentStates={idleAgentStates}
          codeActivity={null}
          agentActivity={null}
          onSendMessage={onSend}
          connectionState="disconnected"
        />
      );
      const input = screen.getByTestId('chat-input') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'hello' } });
      fireEvent.click(screen.getByTestId('chat-send'));
      expect(onSend).not.toHaveBeenCalled();
    });

    it('re-enables input when connection is restored', () => {
      const { rerender } = render(
        <ChatPanel
          messages={[]}
          agentStates={idleAgentStates}
          codeActivity={null}
          agentActivity={null}
          onSendMessage={noop}
          connectionState="disconnected"
        />
      );
      expect(screen.getByTestId('chat-input')).toBeDisabled();

      rerender(
        <ChatPanel
          messages={[]}
          agentStates={idleAgentStates}
          codeActivity={null}
          agentActivity={null}
          onSendMessage={noop}
          connectionState="connected"
        />
      );
      expect(screen.getByTestId('chat-input')).not.toBeDisabled();
    });
  });
});
