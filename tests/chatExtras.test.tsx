import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssistantChat } from '../src/components/AssistantChat';
import { Composer } from '../src/components/Composer';
import { readReadFrom } from '../src/messages/kinds';
import { plainForSpeech } from '../src/speech/readAloud';
import { useAssistantShortcut } from '../src/useAssistantShortcut';
import { useHandsFree } from '../src/dictation/useHandsFree';
import type { Dictation } from '../src/dictation/useDictation';
import type { AssistantTheme } from '../src/theme';
import type { PanelMessage } from '../src/types';

/**
 * The panel's extras (1.34.0, owner 2026-11-06): read aloud, edit, ask again, "Use this", the records
 * an answer was read from, "@" and "/" in the box, and Ctrl+/. Every one is OFF until a product asks.
 */
const THEME: AssistantTheme = {
  surface: '#fff', fg: '#111', muted: '#666', border: '#ddd', accent: '#4361EE', accentFg: '#fff', accentSoft: '#eef',
};

const rows: PanelMessage[] = [
  { id: 'u1', role: 'user', text: 'What did the client say about her spouse?' },
  {
    id: 'a1', role: 'assistant', text: 'She said **her spouse** will come.',
    meta: { read_from: [{ label: 'Call transcript, 5 Nov', href: '/consultant/cases/1' }, { label: 'Evil', href: '//evil.example' }] },
  },
];

describe('speech text', () => {
  it('reads the words, not the Markdown', () => {
    expect(plainForSpeech('**$1,800** is due.\n- [Pay now](/pay)\n| a | b |\n|---|---|')).toBe('$1,800 is due.\nPay now\n, a , b ,');
  });
});

describe('read_from', () => {
  it('keeps same-site links only', () => {
    expect(readReadFrom(rows[1]!.meta as never)).toEqual([
      { label: 'Call transcript, 5 Nov', href: '/consultant/cases/1' },
      { label: 'Evil' },
    ]);
  });
});

describe('AssistantChat extras', () => {
  beforeEach(() => {
    // jsdom has neither layout nor scrollTo; the autoscroll inside the panel calls it.
    Object.defineProperty(Element.prototype, 'scrollTo', { value: vi.fn(), configurable: true });
    const synth = { cancel: vi.fn(), speak: vi.fn(), getVoices: () => [] };
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      value: class { lang = ''; voice = null; onend = null; onerror = null; constructor(public text: string) {} },
      configurable: true,
    });
  });
  afterEach(() => {
    delete (window as { speechSynthesis?: unknown }).speechSynthesis;
    delete (window as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance;
  });

  it('shows none of them unless the product asks', () => {
    render(<AssistantChat theme={THEME} title="Porter" messages={rows} onSend={vi.fn()} />);

    expect(screen.queryByLabelText('Read this answer aloud')).toBeNull();
    expect(screen.queryByLabelText('Edit this question')).toBeNull();
    expect(screen.queryByLabelText('Ask this again')).toBeNull();
    expect(screen.queryByText('Use this')).toBeNull();
    expect(screen.queryByText('Call transcript, 5 Nov')).toBeNull();
  });

  it('reads aloud, edits, asks again, uses the answer and names what it read', () => {
    const onSend = vi.fn();
    const onUse = vi.fn();
    const onOpenSource = vi.fn();
    render(
      <AssistantChat
        theme={THEME}
        title="Porter"
        messages={rows}
        onSend={onSend}
        extras={{ readAloud: true, editLast: true, askAgain: true, sources: true, onOpenSource, useThis: [{ key: 'note', label: 'Save as a case note', onUse }] }}
      />,
    );

    fireEvent.click(screen.getByLabelText('Read this answer aloud'));
    expect(window.speechSynthesis.speak).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Stop reading aloud')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Edit this question'));
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('What did the client say about her spouse?');

    fireEvent.click(screen.getByLabelText('Ask this again'));
    expect(onSend).toHaveBeenCalledWith('What did the client say about her spouse?', { input: 'ask_again' });

    fireEvent.click(screen.getByText('Use this'));
    fireEvent.click(screen.getByText('Save as a case note'));
    expect(onUse).toHaveBeenCalledWith('She said **her spouse** will come.', expect.objectContaining({ id: 'a1' }));

    fireEvent.click(screen.getByText('Call transcript, 5 Nov'));
    expect(onOpenSource).toHaveBeenCalledWith('/consultant/cases/1');

    // A question put back with the pencil and sent again is recorded as an edit (1.36.0).
    fireEvent.click(screen.getByLabelText('Edit this question'));
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(onSend).toHaveBeenLastCalledWith('What did the client say about her spouse?', { input: 'edit' });
    expect(screen.getByText('Evil').tagName).toBe('SPAN');
  });
});

function Box(props: Partial<Parameters<typeof Composer>[0]>) {
  const [value, setValue] = useState('');

  return <Composer {...props} value={value} onChange={setValue} onSend={vi.fn()} />;
}

const box = () => screen.getByRole('textbox') as HTMLTextAreaElement;

describe('"/" and "@" in the box', () => {
  it('"/" lists the commands and fills the box with the pick, without sending', () => {
    const onSend = vi.fn();
    render(<Box onSend={onSend} slashCommands={[{ key: 'move', label: 'Move a meeting', prompt: 'Move my meeting with ' }, { key: 'note', label: 'Add a note', prompt: 'Add a note: ' }]} />);

    fireEvent.change(box(), { target: { value: '/mo', selectionStart: 3 } });
    expect(screen.getByText('Move a meeting')).toBeTruthy();
    expect(screen.queryByText('Add a note')).toBeNull();

    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(box().value).toBe('Move my meeting with ');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('"@" searches and writes the pick into the message', async () => {
    vi.useFakeTimers();
    const search = vi.fn(async () => [{ id: 'c1', label: 'Study Visa (Maria Garcia)', detail: 'MKT-1', insert: 'Study Visa (Maria Garcia) MKT-1' }]);
    render(<Box mentions={{ search }} />);

    fireEvent.change(box(), { target: { value: 'Summarise @mar', selectionStart: 14 } });
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    vi.useRealTimers();
    expect(search).toHaveBeenCalledWith('mar');

    fireEvent.click(await screen.findByText('Study Visa (Maria Garcia)'));
    expect(box().value).toBe('Summarise Study Visa (Maria Garcia) MKT-1 ');
  });
});

function Shortcut({ onToggle }: { onToggle: () => void }) {
  useAssistantShortcut(onToggle);

  return null;
}

describe('Ctrl+/', () => {
  it('toggles the assistant, except inside a region that keeps the key', () => {
    const onToggle = vi.fn();
    render(<><Shortcut onToggle={onToggle} /><div data-ai-shortcut-off=""><input aria-label="code" /></div></>);

    fireEvent.keyDown(window, { key: '/', ctrlKey: true });
    expect(onToggle).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(screen.getByLabelText('code'), { key: '/', ctrlKey: true });
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});


describe('hands-free', () => {
  const dictation = (over: Partial<Dictation> = {}): Dictation => ({
    state: 'idle', level: 0, preview: '', message: null, supported: true, listening: false,
    start: vi.fn(), stop: vi.fn(), toggle: vi.fn(), ...over,
  });

  it('opens the microphone on the person\'s turn and closes it while the answer is read', () => {
    const idle = dictation();
    const { rerender } = renderHook((p: { d: Dictation; suspended: boolean; busy: boolean }) =>
      useHandsFree({ active: true, suspended: p.suspended }, p.d, p.busy, '', vi.fn()), { initialProps: { d: idle, suspended: false, busy: false } });
    expect(idle.start).toHaveBeenCalledTimes(1);

    const listening = dictation({ state: 'listening', listening: true });
    rerender({ d: listening, suspended: true, busy: false });
    expect(listening.stop).toHaveBeenCalled();
  });

  it('after the person goes quiet: Stop, wait for every piece, then send', () => {
    vi.useFakeTimers();
    const send = vi.fn();
    const talking = dictation({ state: 'listening', listening: true, level: 0.5 });
    const { rerender } = renderHook((p: { d: Dictation; value: string }) =>
      useHandsFree({ active: true, suspended: false }, p.d, false, p.value, send), { initialProps: { d: talking, value: 'Move my' } });

    const quiet = dictation({ state: 'listening', listening: true, level: 0 });
    rerender({ d: quiet, value: 'Move my' });
    act(() => {
      vi.advanceTimersByTime(2200);
    });
    expect(quiet.stop).toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();

    // The last piece arrives while finishing; only at idle is the box sent.
    rerender({ d: dictation({ state: 'finishing' }), value: 'Move my call to Friday.' });
    expect(send).not.toHaveBeenCalled();
    rerender({ d: dictation({ state: 'idle' }), value: 'Move my call to Friday.' });
    expect(send).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
