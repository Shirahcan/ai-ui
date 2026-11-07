import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AssistantLauncher } from '../src/components/AssistantLauncher';

const theme = { surface: '#fff', fg: '#111', muted: '#666', border: '#ddd', accent: '#4361EE', accentFg: '#fff' };

describe('AssistantLauncher', () => {
  it('shows the chat glyph closed and the close mark open, with matching names', () => {
    const { rerender, container } = render(
      <AssistantLauncher open={false} onToggle={() => {}} theme={theme} openLabel="Ask Reeve" closeLabel="Close Reeve" />,
    );

    expect(screen.getByRole('button', { name: 'Ask Reeve' })).toBeTruthy();
    expect(container.querySelector('svg')).toBeTruthy();

    rerender(
      <AssistantLauncher open onToggle={() => {}} theme={theme} openLabel="Ask Reeve" closeLabel="Close Reeve" />,
    );

    const button = screen.getByRole('button', { name: 'Close Reeve' });
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.textContent).toBe('×');
  });

  it('is round, takes the accent from the theme, and toggles', () => {
    const onToggle = vi.fn();
    render(<AssistantLauncher open={false} onToggle={onToggle} theme={theme} openLabel="Ask" closeLabel="Close" />);

    const button = screen.getByRole('button', { name: 'Ask' });
    expect(button.className).toContain('rounded-full');
    expect(button.style.getPropertyValue('--ai-accent')).toBe('#4361EE');

    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('puts the product position on a wrapper, so the button\'s own `relative` cannot cancel a `fixed`', () => {
    const { container } = render(
      <AssistantLauncher open={false} onToggle={() => {}} theme={theme} openLabel="Ask" closeLabel="Close" className="fixed bottom-4 right-4 z-50" />,
    );

    const button = screen.getByRole('button', { name: 'Ask' });
    expect(button.className).not.toContain('fixed');
    expect((button.parentElement as HTMLElement).className).toBe('fixed bottom-4 right-4 z-50');
    expect(container.firstElementChild?.tagName).toBe('DIV');
  });
});
