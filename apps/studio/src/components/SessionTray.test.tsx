import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionTray } from './SessionTray';

// Mock next/link as a plain anchor for testing
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    onClick,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    onClick?: () => void;
    [key: string]: unknown;
  }) => (
    <a href={href} onClick={onClick} {...props}>
      {children}
    </a>
  ),
}));

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = originalFetch;
  mockPush.mockClear();
});

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  currentSessionId: 'current-session',
};

describe('SessionTray', () => {
  it('renders tray panel', () => {
    render(<SessionTray {...defaultProps} />);
    expect(screen.getByTestId('session-tray')).toBeInTheDocument();
  });

  it('is visually hidden when closed (translated off-screen)', () => {
    render(<SessionTray {...defaultProps} isOpen={false} />);
    const tray = screen.getByTestId('session-tray');
    expect(tray.className).toContain('-translate-x-full');
  });

  it('is visible when open (translated to origin)', () => {
    render(<SessionTray {...defaultProps} isOpen={true} />);
    const tray = screen.getByTestId('session-tray');
    expect(tray.className).toContain('translate-x-0');
  });

  it('renders backdrop when open', () => {
    render(<SessionTray {...defaultProps} isOpen={true} />);
    expect(screen.getByTestId('session-tray-backdrop')).toBeInTheDocument();
  });

  it('does not render backdrop when closed', () => {
    render(<SessionTray {...defaultProps} isOpen={false} />);
    expect(screen.queryByTestId('session-tray-backdrop')).not.toBeInTheDocument();
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    render(<SessionTray {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('session-tray-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<SessionTray {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('session-tray-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

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
          gameTitle: null,
          totalCostUsd: 0,
        },
        {
          id: 's2',
          status: 'error',
          engine: 'phaser',
          genre: 'shooter',
          createdAt: Date.now() - 120000,
          updatedAt: Date.now() - 60000,
          messageCount: 2,
          gameTitle: null,
          totalCostUsd: 0,
        },
      ],
    });

    render(<SessionTray {...defaultProps} />);

    await waitFor(() => {
      const cards = screen.getAllByTestId('session-tray-card');
      expect(cards).toHaveLength(2);
    });
  });

  it('highlights the current session', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 'current-session',
          status: 'ready',
          engine: 'phaser',
          genre: 'platformer',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messageCount: 3,
          gameTitle: null,
          totalCostUsd: 0,
        },
        {
          id: 'other-session',
          status: 'ready',
          engine: 'phaser',
          genre: 'shooter',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messageCount: 1,
          gameTitle: null,
          totalCostUsd: 0,
        },
      ],
    });

    render(<SessionTray {...defaultProps} currentSessionId="current-session" />);

    await waitFor(() => {
      const cards = screen.getAllByTestId('session-tray-card');
      expect(cards[0].className).toContain('bg-indigo-500/10');
      expect(cards[1].className).not.toContain('bg-indigo-500/10');
    });
  });

  it('displays game title when available, falls back to genre', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 's1',
          status: 'ready',
          engine: 'phaser',
          genre: '2d',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messageCount: 5,
          gameTitle: 'Space Blaster',
          totalCostUsd: 0,
        },
        {
          id: 's2',
          status: 'new',
          engine: 'phaser',
          genre: '2d',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messageCount: 0,
          gameTitle: null,
          totalCostUsd: 0,
        },
      ],
    });

    render(<SessionTray {...defaultProps} />);

    await waitFor(() => {
      const titles = screen.getAllByTestId('session-tray-card-title');
      expect(titles[0]).toHaveTextContent('Space Blaster');
      expect(titles[1]).toHaveTextContent('2d');
    });
  });

  it('displays session cost when greater than zero', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 's1',
          status: 'ready',
          engine: 'phaser',
          genre: '2d',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messageCount: 5,
          gameTitle: 'My Game',
          totalCostUsd: 0.1234,
        },
        {
          id: 's2',
          status: 'new',
          engine: 'phaser',
          genre: '2d',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messageCount: 0,
          gameTitle: null,
          totalCostUsd: 0,
        },
      ],
    });

    render(<SessionTray {...defaultProps} />);

    await waitFor(() => {
      const costs = screen.getAllByTestId('session-tray-cost');
      expect(costs).toHaveLength(1);
      expect(costs[0]).toHaveTextContent('$0.1234');
    });
  });

  it('shows error state on fetch failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    render(<SessionTray {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByTestId('session-tray-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('session-tray-error')).toHaveTextContent(
      'Network error'
    );
  });

  it('shows empty state when no sessions', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    });

    render(<SessionTray {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByTestId('session-tray-empty')).toBeInTheDocument();
    });
  });

  it('renders home link', () => {
    render(<SessionTray {...defaultProps} />);
    const homeLink = screen.getByTestId('session-tray-home');
    expect(homeLink).toHaveAttribute('href', '/');
  });

  it('renders new game button', () => {
    render(<SessionTray {...defaultProps} />);
    expect(screen.getByTestId('session-tray-new-game')).toBeInTheDocument();
  });

  it('does not fetch sessions when closed', () => {
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;

    render(<SessionTray {...defaultProps} isOpen={false} />);

    expect(mockFetch).not.toHaveBeenCalled();
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
          messageCount: 5,
          gameTitle: null,
          totalCostUsd: 0,
        },
      ],
    });

    render(<SessionTray {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByTestId('session-tray-delete')).toBeInTheDocument();
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
            messageCount: 5,
            gameTitle: null,
            totalCostUsd: 0,
          },
        ],
      })
      // Second call: delete session
      .mockResolvedValueOnce({ ok: true, json: async () => ({ deleted: true }) });

    globalThis.fetch = mockFetchFn;
    window.confirm = vi.fn().mockReturnValue(true);

    render(<SessionTray {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByTestId('session-tray-delete')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('session-tray-delete'));

    await waitFor(() => {
      expect(screen.queryByTestId('session-tray-card')).not.toBeInTheDocument();
    });

    expect(mockFetchFn).toHaveBeenCalledWith(
      expect.stringContaining('/api/sessions/s1?cleanup=true'),
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('does not delete when user cancels confirmation', async () => {
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
          messageCount: 5,
          gameTitle: null,
          totalCostUsd: 0,
        },
      ],
    });
    window.confirm = vi.fn().mockReturnValue(false);

    render(<SessionTray {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByTestId('session-tray-delete')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('session-tray-delete'));

    // Card should still be there
    expect(screen.getByTestId('session-tray-card')).toBeInTheDocument();
  });
});
