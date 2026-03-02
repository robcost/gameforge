import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StudioLayout } from './StudioLayout';
import { useSessionStore } from '../../stores/sessionStore';
import type { ConnectionState } from '../../hooks/useWebSocket';

// Mock next/link as a plain anchor for SessionTray
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Mock next/navigation for SessionTray's useRouter
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// Default mock connection state — tests can override via mockConnectionState
let mockConnectionState: ConnectionState = 'connected';

// Mock the WebSocket hook
vi.mock('../../hooks/useWebSocket', () => ({
  useWebSocket: () => ({
    sendMessage: vi.fn(),
    connectionState: mockConnectionState,
  }),
}));

describe('StudioLayout', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
    mockConnectionState = 'connected';
  });

  it('renders the studio layout container', () => {
    render(<StudioLayout sessionId="test-123" />);
    expect(screen.getByTestId('studio-layout')).toBeInTheDocument();
  });

  it('renders the chat panel', () => {
    render(<StudioLayout sessionId="test-123" />);
    expect(screen.getByTestId('chat-panel')).toBeInTheDocument();
  });

  it('renders the game preview', () => {
    render(<StudioLayout sessionId="test-123" />);
    expect(screen.getByTestId('game-preview')).toBeInTheDocument();
  });

  it('renders Chat and Preview headings', () => {
    render(<StudioLayout sessionId="test-123" />);
    expect(screen.getByText('Chat')).toBeInTheDocument();
    expect(screen.getByText('Preview')).toBeInTheDocument();
  });

  it('shows scaffolding status when isScaffolding is true', () => {
    useSessionStore.getState().setIsScaffolding(true);
    render(<StudioLayout sessionId="test-123" />);
    expect(screen.getByText(/setting up workspace/i)).toBeInTheDocument();
  });

  it('shows Connected indicator when connection state is connected', () => {
    mockConnectionState = 'connected';
    render(<StudioLayout sessionId="test-123" />);
    const indicator = screen.getByTestId('connection-status');
    expect(indicator).toHaveTextContent('Connected');
  });

  it('shows Reconnecting indicator when connection state is reconnecting', () => {
    mockConnectionState = 'reconnecting';
    render(<StudioLayout sessionId="test-123" />);
    const indicator = screen.getByTestId('connection-status');
    expect(indicator).toHaveTextContent('Reconnecting...');
  });

  it('shows Disconnected indicator when connection state is disconnected', () => {
    mockConnectionState = 'disconnected';
    render(<StudioLayout sessionId="test-123" />);
    const indicator = screen.getByTestId('connection-status');
    expect(indicator).toHaveTextContent('Disconnected');
  });

  it('renders the session tray toggle button', () => {
    render(<StudioLayout sessionId="test-123" />);
    expect(screen.getByTestId('session-tray-toggle')).toBeInTheDocument();
  });

  it('tray is initially closed (off-screen)', () => {
    render(<StudioLayout sessionId="test-123" />);
    const tray = screen.getByTestId('session-tray');
    expect(tray.className).toContain('-translate-x-full');
  });

  it('opens tray when toggle button is clicked', () => {
    render(<StudioLayout sessionId="test-123" />);
    fireEvent.click(screen.getByTestId('session-tray-toggle'));
    const tray = screen.getByTestId('session-tray');
    expect(tray.className).toContain('translate-x-0');
  });

  it('displays session cost when greater than zero', () => {
    useSessionStore.getState().updateCost(0.4567);
    render(<StudioLayout sessionId="test-123" />);
    const cost = screen.getByTestId('session-cost');
    expect(cost).toHaveTextContent('$0.4567');
  });

  it('does not display cost when zero', () => {
    render(<StudioLayout sessionId="test-123" />);
    expect(screen.queryByTestId('session-cost')).not.toBeInTheDocument();
  });

  it('renders Share button in preview when game has source', () => {
    useSessionStore.getState().setPreviewUrl('http://localhost:8080');
    render(<StudioLayout sessionId="test-123" />);
    expect(screen.getByTestId('preview-share')).toBeInTheDocument();
  });

  it('shows published URL when set in store', () => {
    useSessionStore.getState().setPreviewUrl('http://localhost:8080');
    useSessionStore.getState().setPublishedUrl('/games/test-123/');
    render(<StudioLayout sessionId="test-123" />);
    expect(screen.getByTestId('published-url')).toHaveTextContent('/games/test-123/');
  });
});
