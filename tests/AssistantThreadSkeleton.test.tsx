import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssistantChat, AssistantThreadSkeleton } from '../src';

const theme = { surface: '#fff', fg: '#111', muted: '#666', border: '#ddd', accent: '#6f6df3', accentFg: '#fff' };

describe('AssistantThreadSkeleton', () => {
  beforeEach(() => {
    Object.defineProperty(Element.prototype, 'scrollTo', { value: vi.fn(), configurable: true });
  });

  it('says what is loading, is busy, and draws in the panel theme rather than one product colour', () => {
    render(
      <AssistantChat
        theme={theme}
        title="Mira"
        messages={[]}
        onSend={() => {}}
        renderEmpty={() => <AssistantThreadSkeleton label="Restoring your last conversation..." />}
      />,
    );

    const label = screen.getByText('Restoring your last conversation...');
    const box = label.parentElement as HTMLElement;
    expect(box.getAttribute('aria-busy')).toBe('true');
    expect(box.innerHTML).toContain('var(--ai-accent-soft');
    expect(box.innerHTML).not.toContain('#4361EE');
  });
});
