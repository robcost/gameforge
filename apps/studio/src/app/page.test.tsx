import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import HomePage from './page';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

describe('HomePage', () => {
  it('renders the GameForge heading', () => {
    render(<HomePage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'GameForge'
    );
  });

  it('renders the tagline', () => {
    render(<HomePage />);
    expect(screen.getByText(/describe your game/i)).toBeInTheDocument();
  });

  it('renders a New Game button', () => {
    render(<HomePage />);
    const button = screen.getByTestId('new-game-button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('New Game');
  });
});
