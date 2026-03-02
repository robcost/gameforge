import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { GamePreview } from './GamePreview';

describe('GamePreview', () => {
  it('renders the preview container', () => {
    render(<GamePreview />);
    expect(screen.getByTestId('game-preview')).toBeInTheDocument();
  });

  it('shows empty state when no src is provided', () => {
    render(<GamePreview />);
    expect(
      screen.getByText(/game preview will appear here/i)
    ).toBeInTheDocument();
  });

  it('renders an iframe when src is provided', () => {
    render(<GamePreview src="http://localhost:8080" />);
    const iframe = screen.getByTestId('game-iframe');
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute('src', 'http://localhost:8080');
  });

  it('does not render an iframe when no src is provided', () => {
    render(<GamePreview />);
    expect(screen.queryByTestId('game-iframe')).not.toBeInTheDocument();
  });

  it('renders a reset button when src is provided', () => {
    render(<GamePreview src="http://localhost:8080" />);
    expect(screen.getByTestId('preview-reset')).toBeInTheDocument();
  });

  it('calls onReset when reset button is clicked', () => {
    const onReset = vi.fn();
    render(<GamePreview src="http://localhost:8080" onReset={onReset} />);
    fireEvent.click(screen.getByTestId('preview-reset'));
    expect(onReset).toHaveBeenCalledOnce();
  });

  it('shows scaffolding loading state when isScaffolding is true and no src', () => {
    render(<GamePreview isScaffolding={true} />);
    expect(screen.getByTestId('preview-scaffolding')).toBeInTheDocument();
    expect(
      screen.getByText(/setting up your game workspace/i)
    ).toBeInTheDocument();
    // Should not show normal empty state
    expect(
      screen.queryByText(/game preview will appear here/i)
    ).not.toBeInTheDocument();
  });

  it('shows normal empty state when not scaffolding and no src', () => {
    render(<GamePreview isScaffolding={false} />);
    expect(
      screen.getByText(/game preview will appear here/i)
    ).toBeInTheDocument();
    expect(screen.queryByTestId('preview-scaffolding')).not.toBeInTheDocument();
  });

  it('shows iframe even when scaffolding if src is provided', () => {
    render(<GamePreview src="http://localhost:8080" isScaffolding={true} />);
    expect(screen.getByTestId('game-iframe')).toBeInTheDocument();
    expect(screen.queryByTestId('preview-scaffolding')).not.toBeInTheDocument();
  });

  it('renders a fullscreen button when src is provided', () => {
    render(<GamePreview src="http://localhost:8080" />);
    expect(screen.getByTestId('preview-fullscreen')).toBeInTheDocument();
  });

  it('does not render fullscreen button when no src', () => {
    render(<GamePreview />);
    expect(screen.queryByTestId('preview-fullscreen')).not.toBeInTheDocument();
  });

  it('renders Share button when onPublish is provided', () => {
    render(<GamePreview src="http://localhost:8080" onPublish={vi.fn()} />);
    expect(screen.getByTestId('preview-share')).toBeInTheDocument();
    expect(screen.getByTestId('preview-share')).toHaveTextContent('Share');
  });

  it('does not render Share button when onPublish is not provided', () => {
    render(<GamePreview src="http://localhost:8080" />);
    expect(screen.queryByTestId('preview-share')).not.toBeInTheDocument();
  });

  it('shows Publishing... when isPublishing is true', () => {
    render(<GamePreview src="http://localhost:8080" onPublish={vi.fn()} isPublishing={true} />);
    const btn = screen.getByTestId('preview-share');
    expect(btn).toHaveTextContent('Publishing...');
    expect(btn).toBeDisabled();
  });

  it('calls onPublish when Share button is clicked', () => {
    const onPublish = vi.fn();
    render(<GamePreview src="http://localhost:8080" onPublish={onPublish} />);
    fireEvent.click(screen.getByTestId('preview-share'));
    expect(onPublish).toHaveBeenCalledOnce();
  });

  it('shows published URL and Copy button when publishedUrl is set', () => {
    render(
      <GamePreview
        src="http://localhost:8080"
        onPublish={vi.fn()}
        publishedUrl="/games/test-id/"
      />
    );
    expect(screen.getByTestId('published-url')).toHaveTextContent('/games/test-id/');
    expect(screen.getByTestId('copy-url')).toBeInTheDocument();
  });

  it('does not show published URL when publishedUrl is null', () => {
    render(<GamePreview src="http://localhost:8080" onPublish={vi.fn()} />);
    expect(screen.queryByTestId('published-url')).not.toBeInTheDocument();
    expect(screen.queryByTestId('copy-url')).not.toBeInTheDocument();
  });
});
