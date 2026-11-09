import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { AssistantTerminal, type AssistantTerminalProps } from '../src/terminal/AssistantTerminal';
import { TERMINAL_THEMES } from '../src/terminal/terminalThemes';
import type { TerminalMode, TerminalTurn } from '../src/terminal/types';

/**
 * The console's menu, settings and recap (1.48.0, owner 2026-11-09).
 *
 * ⚠ WHAT THIS GUARDS: Level and effort is in the ⋮ menu; the menu closes on a click outside it; a click
 * on the transcript's plain text puts the cursor in the composer but never takes a click meant for a
 * button or a selection; /config lists every setting the host keeps and changes it in place; a session
 * opened after a break shows its recap (the first build only counted time inside one visit).
 */
const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();

const turnsAt = (minutesAgo: number): TerminalTurn[] => [
  { id: 'a1', role: 'user', body: 'Make the hero darker', structured: null, rewound: false, at: at(minutesAgo + 1) },
  { id: 'b1', role: 'assistant', body: 'Darker hero.', structured: { steps: [{ kind: 'think', text: 'Thinking', detail: 'They want contrast.' }, { kind: 'write', text: 'Writing the hero' }], outcome: { changed: true, elements: 1 } }, rewound: false, at: at(minutesAgo) },
];

function Harness(overrides: Partial<AssistantTerminalProps> = {}) {
  const [value, setValue] = useState('');
  const [mode, setMode] = useState<TerminalMode>('build');

  return (
    <AssistantTerminal
      open
      onClose={() => {}}
      assistantName="Porter"
      subjectLabel="Home page"
      session={{ id: 's1', title: 'Make the hero darker', started_at: null, last_at: null, turns: 2, summary: null }}
      turns={turnsAt(2)}
      mode={mode}
      onModeChange={setMode}
      value={value}
      onChange={setValue}
      onAsk={() => {}}
      onStop={() => {}}
      onCommand={() => {}}
      onRewind={() => {}}
      onSaveBrief={() => {}}
      theme="dark"
      onThemeChange={() => {}}
      {...overrides}
    />
  );
}

beforeAll(() => {
  Element.prototype.scrollTo = vi.fn() as unknown as typeof Element.prototype.scrollTo;
});

const input = () => screen.getByRole('textbox', { name: /describe what you want/i }) as HTMLTextAreaElement;
const openMenu = () => fireEvent.click(screen.getByRole('button', { name: 'More' }));

describe('the ⋮ menu', () => {
  it('offers Level and effort when the host keeps them, and opens that view', () => {
    render(<Harness onLevelChange={() => {}} onEffortChange={() => {}} />);

    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Level and effort' }));
    expect(screen.getByRole('heading', { name: 'Level and effort' })).toBeTruthy();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('leaves Level and effort out when the host offers neither', () => {
    render(<Harness />);

    openMenu();
    expect(screen.queryByRole('menuitem', { name: 'Level and effort' })).toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Settings' })).toBeTruthy();
  });

  it('closes on a click outside it, and stays open for a click inside it', () => {
    render(
      <div>
        <button type="button">Canvas</button>
        <Harness />
      </div>,
    );

    openMenu();
    fireEvent.pointerDown(screen.getByRole('menu'));
    expect(screen.getByRole('menu')).toBeTruthy();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Canvas' }));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('moves between its items with the arrow keys', () => {
    render(<Harness />);

    openMenu();
    const items = screen.getAllByRole('menuitem');

    items[0]!.focus();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowUp' });
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowUp' });
    expect(document.activeElement).toBe(items.at(-1));
  });
});

describe('a click on the transcript', () => {
  it('puts the cursor in the composer', () => {
    render(<Harness />);

    screen.getByRole('button', { name: 'More' }).focus();
    fireEvent.click(screen.getByText('Make the hero darker'));
    expect(document.activeElement).toBe(input());
  });

  it('leaves a click on a fold to the fold', () => {
    render(<Harness />);

    const fold = screen.getByRole('button', { name: /thought it through/i });

    fold.focus();
    fireEvent.click(fold);
    expect(document.activeElement).toBe(fold);
    expect(screen.getByText('They want contrast.')).toBeTruthy();
  });

  it('leaves a text selection alone', () => {
    render(<Harness />);

    const text = screen.getByText('Make the hero darker');
    const range = document.createRange();

    // Focus first: jsdom drops the document's selection when an element takes the focus.
    screen.getByRole('button', { name: 'More' }).focus();
    range.selectNodeContents(text);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    expect(window.getSelection()?.toString()).toBe('Make the hero darker');
    fireEvent.click(text);
    expect(document.activeElement).not.toBe(input());
    window.getSelection()?.removeAllRanges();
  });
});

describe('/config', () => {
  const openSettings = () => {
    fireEvent.change(input(), { target: { value: '/config' } });
    fireEvent.keyDown(input(), { key: 'Enter' });
  };

  it('changes the level, the effort, the recap and the theme in place', () => {
    const onLevelChange = vi.fn();
    const onEffortChange = vi.fn();
    const onRecapChange = vi.fn();
    const onThemeChange = vi.fn();

    render(<Harness level="normal" onLevelChange={onLevelChange} effort="low" onEffortChange={onEffortChange} onRecapChange={onRecapChange} onThemeChange={onThemeChange} />);
    openSettings();

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Level: Normal/ }));
    expect(onLevelChange).toHaveBeenCalledWith('pro');
    // ← steps back, and wraps.
    fireEvent.keyDown(screen.getByRole('button', { name: /^Effort: Low/ }), { key: 'ArrowLeft' });
    expect(onEffortChange).toHaveBeenCalledWith('high');
    fireEvent.click(screen.getByRole('button', { name: /^Recap after a break: After 30 min away/ }));
    expect(onRecapChange).toHaveBeenCalledWith(60, 'settings');
    fireEvent.click(screen.getByRole('button', { name: /^Theme: / }));
    expect(onThemeChange).toHaveBeenCalledWith(TERMINAL_THEMES[1]!.key);
  });

  it('turns the recap back on from off, and lists the tab mark only when the host keeps it', () => {
    const onRecapChange = vi.fn();
    const onNotifyWhenDoneChange = vi.fn();

    const { unmount } = render(<Harness recapAfterMinutes={null} onRecapChange={onRecapChange} />);

    openSettings();
    expect(screen.queryByRole('button', { name: /^Mark the tab when done/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^Recap after a break: Off/ }));
    expect(onRecapChange).toHaveBeenCalledWith(10, 'settings');
    unmount();

    render(<Harness notifyWhenDone onNotifyWhenDoneChange={onNotifyWhenDoneChange} />);
    openSettings();
    fireEvent.click(screen.getByRole('button', { name: /^Mark the tab when done: On/ }));
    expect(onNotifyWhenDoneChange).toHaveBeenCalledWith(false);
  });

  it('shows a recap now', () => {
    render(<Harness />);
    openSettings();
    fireEvent.click(screen.getByRole('button', { name: /show a recap now/i }));

    expect(screen.getByRole('note', { name: 'Recap' }).textContent).toContain('1 ask in this session: 1 changed the page.');
  });
});

describe('the recap on opening a session', () => {
  it('shows when the last turn is older than the recap time', () => {
    render(<Harness turns={turnsAt(120)} recapAfterMinutes={30} />);

    expect(screen.getByRole('note', { name: 'Recap' }).textContent).toContain('Make the hero darker');
  });

  it('does not show for a session touched a moment ago, or with the recap off', () => {
    const { unmount } = render(<Harness turns={turnsAt(2)} recapAfterMinutes={30} />);

    expect(screen.queryByRole('note', { name: 'Recap' })).toBeNull();
    unmount();

    render(<Harness turns={turnsAt(120)} recapAfterMinutes={null} />);
    expect(screen.queryByRole('note', { name: 'Recap' })).toBeNull();
  });

  it('waits for the session to load', () => {
    const { rerender } = render(<Harness turns={[]} loading session={null} />);

    expect(screen.queryByRole('note', { name: 'Recap' })).toBeNull();
    rerender(<Harness turns={turnsAt(120)} />);
    expect(screen.getByRole('note', { name: 'Recap' })).toBeTruthy();
  });
});
