import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConsoleHost, useConsoleOpen } from '../src/terminal/ConsoleHost';

/**
 * The console any product mounts (shared console C4d): a tab with the assistant's name while closed, Ctrl+~ from
 * anywhere except an area that opts out, and the person's open or closed choice remembered under the product's key.
 */
const terminal = { assistantName: 'Porter', subjectLabel: 'Home', subjectNoun: 'page', session: null, turns: [], live: null, notes: [], loading: false, value: '', onChange: () => undefined, onAsk: () => undefined } as never;

describe('ConsoleHost', () => {
  // jsdom has neither layout nor scrollTo; the transcript's autoscroll calls it.
  beforeAll(() => Object.defineProperty(Element.prototype, 'scrollTo', { value: vi.fn(), configurable: true }));
  beforeEach(() => window.localStorage.clear());

  it('shows a tab with the assistant\'s name, and what it is doing, while closed', () => {
    const onOpenChange = vi.fn();

    render(<ConsoleHost open={false} onOpenChange={onOpenChange} terminal={terminal} composer={{} as never} assistantName="Reeve" working="Writing the FAQ" />);

    const tab = screen.getByTitle('Open the Reeve console (Ctrl+~)');

    expect(tab.textContent).toContain('Reeve: Writing the FAQ');
    fireEvent.click(tab);
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it('draws no tab when the host opens the console from its own control (1.73.3)', () => {
    render(<ConsoleHost open={false} onOpenChange={vi.fn()} terminal={terminal} composer={{} as never} assistantName="Porter" working={null} showTab={false} />);

    expect(screen.queryByTitle('Open the Porter console (Ctrl+~)')).toBeNull();
  });

  it('toggles on Ctrl+~ except inside an area that opts out', () => {
    const onOpenChange = vi.fn();

    render(
      <div>
        <textarea data-ai-shortcut-off aria-label="code" />
        <ConsoleHost open={false} onOpenChange={onOpenChange} terminal={terminal} composer={{} as never} assistantName="Porter" working={null} />
      </div>,
    );

    fireEvent.keyDown(screen.getByLabelText('code'), { key: '~', ctrlKey: true });
    expect(onOpenChange).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: '~', ctrlKey: true });
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });
});

describe('two consoles on one page', () => {
  beforeAll(() => Object.defineProperty(Element.prototype, 'scrollTo', { value: vi.fn(), configurable: true }));

  it('only the console in front answers Ctrl+~, and the one behind takes it back when the front one goes', () => {
    const behind = vi.fn();
    const front = vi.fn();
    const page = render(<ConsoleHost open={false} onOpenChange={behind} terminal={terminal} composer={{} as never} assistantName="Porter" working={null} />);
    const card = render(<ConsoleHost open onOpenChange={front} terminal={terminal} composer={{} as never} assistantName="Porter" working={null} />);

    fireEvent.keyDown(window, { key: '~', ctrlKey: true });
    expect(front).toHaveBeenCalledWith(false);
    expect(behind).not.toHaveBeenCalled();

    card.unmount();
    fireEvent.keyDown(window, { key: '~', ctrlKey: true });
    expect(behind).toHaveBeenCalledWith(true);
    page.unmount();
  });
});

describe('useConsoleOpen', () => {
  beforeEach(() => window.localStorage.clear());

  it('opens by itself on a fresh subject and remembers that under the product\'s key', () => {
    const { result } = renderHook(() => useConsoleOpen(true, 'porter-console:open'));

    expect(result.current[0]).toBe(true);
    expect(window.localStorage.getItem('porter-console:open')).toBe('1');
  });

  it('keeps the person\'s choice once they close it', () => {
    window.localStorage.setItem('porter-console:open', '1');
    const { result } = renderHook(() => useConsoleOpen(false, 'porter-console:open'));

    expect(result.current[0]).toBe(true);
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
    expect(window.localStorage.getItem('porter-console:open')).toBe('0');
  });
});
