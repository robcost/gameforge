import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionList } from './SessionList';

// Mock next/link as a plain anchor for testing
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

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = originalFetch;
});

describe('SessionList', () => {
  it('renders session cards from API', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 's1',
          status: 'ready',
          engine: 'phaser',
          genre: 'platformer',
          createdAt: Date.now() - 60000,
          updatedAt: Date.now() - 30000,
          messageCount: 5,
        },
        {
          id: 's2',
          status: 'error',
          engine: 'phaser',
          genre: 'shooter',
          createdAt: Date.now() - 120000,
          updatedAt: Date.now() - 60000,
          messageCount: 2,
        },
      ],
    });

    render(<SessionList />);

    await waitFor(() => {
      expect(screen.getByTestId('session-list')).toBeInTheDocument();
    });
    const cards = screen.getAllByTestId('session-card');
    expect(cards).toHaveLength(2);
  });

  it('shows empty state when no sessions', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    });

    render(<SessionList />);

    await waitFor(() => {
      expect(screen.getByTestId('session-list-empty')).toBeInTheDocument();
    });
    expect(screen.getByText('No previous sessions')).toBeInTheDocument();
  });

  it('renders status badges with correct text', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 's1',
          status: 'awaiting_feedback',
          engine: 'phaser',
          genre: 'platformer',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messageCount: 3,
        },
      ],
    });

    render(<SessionList />);

    await waitFor(() => {
      const badge = screen.getByTestId('session-status-badge');
      expect(badge).toHaveTextContent('awaiting_feedback');
    });
  });

  it('links cards to correct studio URL', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 'abc-123',
          status: 'ready',
          engine: 'phaser',
          genre: 'platformer',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messageCount: 0,
        },
      ],
    });

    render(<SessionList />);

    await waitFor(() => {
      const card = screen.getByTestId('session-card');
      expect(card).toHaveAttribute('href', '/studio/abc-123');
    });
  });

  it('handles fetch error gracefully', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    render(<SessionList />);

    await waitFor(() => {
      expect(screen.getByTestId('session-list-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('session-list-error')).toHaveTextContent(
      'Network error'
    );
  });

  it('displays message count', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 's1',
          status: 'ready',
          engine: 'phaser',
          genre: 'platformer',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messageCount: 7,
        },
      ],
    });

    render(<SessionList />);

    await waitFor(() => {
      expect(screen.getByText('7 messages')).toBeInTheDocument();
    });
  });

  it('renders delete buttons on session cards', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 's1',
          status: 'ready',
          engine: 'phaser',
          genre: 'platformer',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messageCount: 3,
        },
      ],
    });

    render(<SessionList />);

    await waitFor(() => {
      expect(screen.getByTestId('session-delete')).toBeInTheDocument();
    });
  });

  it('removes session card on successful delete', async () => {
    const mockFetchFn = vi.fn()
      // First call: fetch sessions list
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: 's1',
            status: 'ready',
            engine: 'phaser',
            genre: 'platformer',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messageCount: 3,
          },
        ],
      })
      // Second call: delete session
      .mockResolvedValueOnce({ ok: true, json: async () => ({ deleted: true }) });

    globalThis.fetch = mockFetchFn;
    window.confirm = vi.fn().mockReturnValue(true);

    render(<SessionList />);

    await waitFor(() => {
      expect(screen.getByTestId('session-delete')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('session-delete'));

    await waitFor(() => {
      expect(screen.queryByTestId('session-card')).not.toBeInTheDocument();
    });

    expect(mockFetchFn).toHaveBeenCalledWith(
      expect.stringContaining('/api/sessions/s1?cleanup=true'),
      expect.objectContaining({ method: 'DELETE' })
    );
  });
});
