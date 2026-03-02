import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NewGameButton } from './NewGameButton';

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Store original fetch for restoration
const originalFetch = globalThis.fetch;

beforeEach(() => {
  mockPush.mockClear();
  globalThis.fetch = originalFetch;
});

describe('NewGameButton', () => {
  it('renders the new game button', () => {
    render(<NewGameButton />);
    expect(screen.getByTestId('new-game-button')).toBeInTheDocument();
    expect(screen.getByText('New Game')).toBeInTheDocument();
  });

  it('shows error when network request fails', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    render(<NewGameButton />);
    fireEvent.click(screen.getByTestId('new-game-button'));

    await waitFor(() => {
      expect(screen.getByTestId('new-game-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('new-game-error')).toHaveTextContent(
      'Network error'
    );
  });

  it('shows error when server returns non-200', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });
    render(<NewGameButton />);
    fireEvent.click(screen.getByTestId('new-game-button'));

    await waitFor(() => {
      expect(screen.getByTestId('new-game-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('new-game-error')).toHaveTextContent(
      'Server error (500)'
    );
  });

  it('clears error on retry', async () => {
    // First call fails
    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('Offline'));
    render(<NewGameButton />);
    fireEvent.click(screen.getByTestId('new-game-button'));

    await waitFor(() => {
      expect(screen.getByTestId('new-game-error')).toBeInTheDocument();
    });

    // Second call succeeds
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sessionId: 'abc-123' }),
    });
    fireEvent.click(screen.getByTestId('new-game-button'));

    await waitFor(() => {
      expect(screen.queryByTestId('new-game-error')).not.toBeInTheDocument();
    });
  });

  it('navigates to studio on success', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sessionId: 'session-xyz' }),
    });
    render(<NewGameButton />);
    fireEvent.click(screen.getByTestId('new-game-button'));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/studio/session-xyz');
    });
  });

  it('re-enables button after error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Fail'));
    render(<NewGameButton />);
    fireEvent.click(screen.getByTestId('new-game-button'));

    await waitFor(() => {
      expect(screen.getByTestId('new-game-button')).not.toBeDisabled();
    });
  });

  it('renders engine selector buttons', () => {
    render(<NewGameButton />);
    expect(screen.getByTestId('engine-selector')).toBeInTheDocument();
    expect(screen.getByTestId('engine-phaser')).toBeInTheDocument();
    expect(screen.getByTestId('engine-threejs')).toBeInTheDocument();
  });

  it('defaults to phaser engine', () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sessionId: 'abc' }),
    });
    render(<NewGameButton />);
    fireEvent.click(screen.getByTestId('new-game-button'));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ engine: 'phaser', genre: '2d' }),
      })
    );
  });

  it('sends threejs engine when 3D is selected', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sessionId: 'abc' }),
    });
    render(<NewGameButton />);
    fireEvent.click(screen.getByTestId('engine-threejs'));
    fireEvent.click(screen.getByTestId('new-game-button'));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ engine: 'threejs', genre: '3d' }),
      })
    );
  });
});
