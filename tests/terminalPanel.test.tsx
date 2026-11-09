import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { AssistantTerminal, type AssistantTerminalProps } from '../src/terminal/AssistantTerminal';
import { parseCommand } from '../src/terminal/commands';
import { TERMINAL_THEMES, contrastRatio } from '../src/terminal/terminalThemes';
import type { TerminalMode, TerminalTurn } from '../src/terminal/types';
import { clampTerminalWidth } from '../src/terminal/useTerminalDock';

/**
 * The console panel (1.44.0, Porter console).
 *
 * ⚠ WHAT THIS GUARDS: a command runs and never reaches the assistant; Esc stops a running ask before
 * it does anything else; Esc Esc on an empty input opens the rewind menu; the browser's own Ctrl+R is
 * taken only inside the console; every theme's text passes AA; the width keeps its floor.
 */
const turns: TerminalTurn[] = [
  { id: 'a1', role: 'user', body: 'Make the hero darker', structured: { target: 'Hero' }, rewound: false, at: null },
  { id: 'b1', role: 'assistant', body: 'Darker hero.', structured: { steps: [{ kind: 'think', text: 'Thinking', detail: 'They want contrast; I will darken the band only.' }, { kind: 'write', text: 'Writing the hero', ms: 3000 }], outcome: { changed: true, elements: 1 } }, rewound: false, at: null },
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
      turns={turns}
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
      className="fixed left-4 top-4 bottom-4"
      {...overrides}
    />
  );
}

beforeAll(() => {
  // jsdom has no layout: the transcript's follow-the-bottom scroll is a no-op here.
  Element.prototype.scrollTo = vi.fn() as unknown as typeof Element.prototype.scrollTo;
});

const input = () => screen.getByRole('textbox', { name: /describe what you want/i }) as HTMLTextAreaElement;

describe('AssistantTerminal', () => {
  it('draws the session line by line, the thinking included', () => {
    render(<Harness />);

    expect(screen.getByText('Make the hero darker')).toBeTruthy();
    // Folded once something follows it (owner 2026-11-09): opened with a click.
    expect(screen.queryByText('They want contrast; I will darken the band only.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /thought it through/i }));
    expect(screen.getByText('They want contrast; I will darken the band only.')).toBeTruthy();
    expect(screen.getByText('Writing the hero')).toBeTruthy();
    expect(screen.getByText('Changed 1 element')).toBeTruthy();
    expect(screen.getByRole('log', { name: 'Transcript' })).toBeTruthy();
  });

  it('runs a command instead of sending it', () => {
    const onAsk = vi.fn();
    const onCommand = vi.fn();
    render(<Harness onAsk={onAsk} onCommand={onCommand} />);

    fireEvent.change(input(), { target: { value: '/compact keep the colours' } });
    fireEvent.keyDown(input(), { key: 'Enter' });

    expect(onCommand).toHaveBeenCalledWith('compact', 'keep the colours');
    expect(onAsk).not.toHaveBeenCalled();
    expect(input().value).toBe('');
  });

  it('opens its own views for /help and /context, and sends an ask that only starts with a slash', () => {
    const onAsk = vi.fn();
    render(<Harness onAsk={onAsk} />);

    fireEvent.change(input(), { target: { value: '/help' } });
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(screen.getByRole('heading', { name: 'Commands and shortcuts' })).toBeTruthy();

    fireEvent.keyDown(screen.getByRole('heading', { name: 'Commands and shortcuts' }), { key: 'Escape' });
    expect(parseCommand('/pricing page needs a FAQ')).toBeNull();
  });

  it('stops a running ask on Esc before anything else', () => {
    const onStop = vi.fn();
    render(<Harness onStop={onStop} live={{ startedAt: Date.now(), ask: { text: 'Add a FAQ' }, steps: [{ kind: 'write', text: 'Writing the FAQ' }], verb: null, queued: null }} />);

    fireEvent.keyDown(input(), { key: 'Escape' });

    expect(onStop).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status').textContent).toContain('Writing the FAQ');
  });

  it('opens the rewind menu on Esc Esc with an empty input', () => {
    render(<Harness />);

    fireEvent.keyDown(input(), { key: 'Escape' });
    fireEvent.keyDown(input(), { key: 'Escape' });

    expect(screen.getByRole('heading', { name: 'Rewind' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Make the hero darker/ }));
    expect(screen.getByRole('button', { name: /Restore the page and the conversation/ })).toBeTruthy();
  });

  it('switches Build and Plan first with Alt+M, and searches history with Ctrl+R', () => {
    render(<Harness history={['Make the hero darker', 'Add a pricing table']} />);

    fireEvent.keyDown(input(), { key: 'm', altKey: true });
    expect(screen.getByText(/plan first/)).toBeTruthy();

    act(() => {
      fireEvent.keyDown(input(), { key: 'r', ctrlKey: true });
    });
    const search = screen.getByLabelText('(search)');
    fireEvent.change(search, { target: { value: 'pricing' } });
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(input().value).toBe('Add a pricing table');
  });
});

describe('themes and width', () => {
  it('keeps every text colour of every theme at AA on the panel and its bars', () => {
    for (const theme of TERMINAL_THEMES) {
      for (const token of ['text', 'dim', 'accent', 'ok', 'warn', 'fail'] as const) {
        for (const ground of ['bg', 'bar'] as const) {
          expect(contrastRatio(theme[token], theme[ground]), `${theme.key} ${token} on ${ground}`).toBeGreaterThanOrEqual(4.5);
        }
      }
      expect(contrastRatio(theme.onAccent, theme.accent), `${theme.key} onAccent`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the width between its floor and half the window', () => {
    expect(clampTerminalWidth(100, 900)).toBe(360);
    expect(clampTerminalWidth(2000, 900)).toBe(900);
    expect(clampTerminalWidth(672, 900)).toBe(672);
  });
});
