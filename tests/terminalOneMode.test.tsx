import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { AssistantTerminal, type AssistantTerminalProps } from '../src/terminal/AssistantTerminal';

/**
 * A surface with ONE mode (1.60.2, shared console C6f: the email console only builds): the chip names the mode and
 * promises no Alt+M switch, the welcome line does not mention one, and /plan is not offered.
 */
describe('AssistantTerminal with one mode', () => {
  beforeAll(() => Object.defineProperty(Element.prototype, 'scrollTo', { value: vi.fn(), configurable: true }));

  const props = {
    open: true,
    onClose: () => undefined,
    assistantName: 'Porter',
    subjectLabel: 'Welcome email',
    subjectNoun: 'email',
    session: null,
    turns: [],
    live: null,
    notes: [],
    loading: false,
    mode: 'build' as const,
    onModeChange: () => undefined,
    value: '',
    onChange: () => undefined,
    onAsk: () => undefined,
  } as unknown as AssistantTerminalProps;

  it('names Build without offering to switch', () => {
    const { container } = render(<AssistantTerminal {...props} modes={['build']} />);

    expect(container.textContent).toContain('⏵⏵ build');
    expect(container.textContent).not.toMatch(/alt\+m/i);
  });

  it('still offers the switch when there is more than one mode', () => {
    const { container } = render(<AssistantTerminal {...props} modes={['build', 'plan']} />);

    expect(container.textContent).toMatch(/alt\+m to plan first/);
    expect(screen.queryAllByRole('button').some((b) => /plan first/.test(b.textContent ?? ''))).toBe(true);
  });
});
