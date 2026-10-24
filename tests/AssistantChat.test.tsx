import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AssistantChat } from '../src/components/AssistantChat';
import { ASSISTANT_GEOMETRY } from '../src/geometry';
import type { AssistantTheme } from '../src/theme';
import type { PanelMessage } from '../src/types';

/**
 * The whole panel, from a theme and some data.
 *
 * ⚠ THE TEST THAT MATTERS MOST IS THE PARITY ONE. Two products rendered with
 * different palettes must produce the SAME geometry classes on the same
 * elements - that is the thing three rounds of sharing parts never achieved, and
 * the only way it stays true is if a divergence is a red build rather than a
 * screenshot somebody has to notice.
 */
const PORTER: AssistantTheme = {
  surface: 'rgba(255,255,255,0.7)',
  fg: '#1e293b',
  muted: '#64748b',
  border: '#e2e8f0',
  accent: '#4361EE',
  accentFg: '#ffffff',
  accentSoft: '#eef2ff',
};

const MIRA: AssistantTheme = {
  surface: '#ffffff',
  fg: '#152237',
  muted: '#6b7280',
  border: '#e5e7eb',
  accent: '#6f6df3',
  accentFg: '#ffffff',
  accentSoft: '#eeedfd',
};

const rows: PanelMessage[] = [
  { id: 'u1', role: 'user', text: 'What is an LMIA?' },
  { id: 'a1', role: 'assistant', text: 'A **Labour Market Impact Assessment**.' },
];

function mount(theme: AssistantTheme, extra: Record<string, unknown> = {}) {
  return render(
    <AssistantChat theme={theme} title="Assistant" messages={rows} onSend={vi.fn()} {...extra} />,
  );
}

const dialog = (c: HTMLElement) => c.querySelector('[role="dialog"]') as HTMLElement;
const bubble = (c: HTMLElement, role: string) =>
  c.querySelector(`[data-role="${role}"] > div`) as HTMLElement;

describe('AssistantChat', () => {
  // jsdom has neither layout nor scrollTo; the autoscroll inside the panel calls it.
  Object.defineProperty(Element.prototype, 'scrollTo', { value: vi.fn(), configurable: true });

  it('draws the same geometry for two different palettes', () => {
    const porter = mount(PORTER);
    const mira = mount(MIRA);

    for (const role of ['user', 'assistant']) {
      expect(bubble(porter.container, role).className).toBe(
        bubble(mira.container, role).className,
      );
    }

    const list = (c: HTMLElement) => c.querySelector('[role="log"]') as HTMLElement;
    expect(list(porter.container).className).toBe(list(mira.container).className);
  });

  it('puts the palette on the card as custom properties, so the subtree inherits', () => {
    const { container } = mount(MIRA);
    const card = dialog(container);

    expect(card.style.getPropertyValue('--ai-accent')).toBe('#6f6df3');
    expect(card.style.getPropertyValue('--ai-bubble-user-bg')).toBe('#6f6df3');
    expect(card.style.getPropertyValue('--ai-fg')).toBe('#152237');
  });

  it("draws Porter's surface bubble by default: invisible, but inset and capped", () => {
    const { container } = mount(PORTER);
    const card = dialog(container);

    expect(bubble(container, 'assistant').className).toContain(
      ASSISTANT_GEOMETRY.bubbleSurface,
    );
    expect(bubble(container, 'user').className).toContain('max-w-[85%]');

    /*
     * ⚠ THE FILL AND THE BORDER ARE BOTH THE CARD'S OWN COLOUR. That is what
     * makes the bubble read as prose while still measuring 16px of inset - the
     * property a first pass lost by copying the look instead of the geometry.
     */
    expect(card.style.getPropertyValue('--ai-bubble-assistant-bg')).toBe(PORTER.surface);
    expect(card.style.getPropertyValue('--ai-bubble-assistant-border')).toBe(PORTER.surface);
  });

  it('widens the bubble for a kind that sets its own layout', () => {
    const { container } = render(
      <AssistantChat
        theme={PORTER}
        title="Porter"
        onSend={vi.fn()}
        messages={[
          { id: 'p', role: 'assistant', text: 'prose' },
          { id: 't', role: 'assistant', text: 'rows', kind: 'data_table' },
        ]}
      />,
    );
    const rows = [...container.querySelectorAll('[data-role="assistant"] > div')];

    expect(rows[0]?.className).toContain('max-w-[85%]');
    expect(rows[1]?.className).toContain('w-full');
  });

  it('fills or empties the assistant bubble only when asked for by name', () => {
    const filled = mount({ ...MIRA, assistantBubble: 'filled' });
    expect(dialog(filled.container).style.getPropertyValue('--ai-bubble-assistant-bg'))
      .toBe(MIRA.accentSoft);

    const plain = mount({ ...MIRA, assistantBubble: 'plain' });
    expect(bubble(plain.container, 'assistant').className).toContain('w-full');
    expect(bubble(plain.container, 'assistant').className).not.toContain('px-4');
  });

  it("renders the assistant markdown but never a person's own words", () => {
    const { container } = mount(PORTER);

    expect(within(bubble(container, 'assistant')).getByText('Labour Market Impact Assessment').tagName)
      .toBe('STRONG');
    expect(bubble(container, 'user').textContent).toBe('What is an LMIA?');
  });

  it('keeps the shared size whatever a product puts in theme.card', () => {
    const { container } = mount({ ...PORTER, card: 'h-[560px] w-[400px]' });

    expect(dialog(container).style.height).toBe('40rem');
    expect(dialog(container).style.width).toBe('34rem');
  });

  it('shows New and History only when a product passes threads', () => {
    const plain = mount(PORTER);
    expect(plain.queryByRole('button', { name: 'History' })).toBeNull();

    const withThreads = mount(PORTER, {
      threads: { items: [], onSelect: vi.fn(), onNew: vi.fn() },
    });
    expect(withThreads.getByRole('button', { name: 'History' })).toBeTruthy();
    expect(withThreads.getByRole('button', { name: 'New' })).toBeTruthy();
  });

  it('opens the thread list in place and reloads it on the way in', () => {
    const onReload = vi.fn();
    const { getByRole, getByText } = mount(PORTER, {
      threads: {
        items: [{ id: 't1', title: 'An earlier question', updatedAt: new Date().toISOString() }],
        onSelect: vi.fn(),
        onReload,
      },
    });

    fireEvent.click(getByRole('button', { name: 'History' }));

    expect(onReload).toHaveBeenCalledTimes(1);
    expect(getByText('An earlier question')).toBeTruthy();
    expect(getByRole('button', { name: 'Back' })).toBeTruthy();
  });

  it('says a thread list failed rather than showing an empty one', () => {
    const { getByRole, getByText } = mount(PORTER, {
      threads: { items: [], onSelect: vi.fn(), status: 'failed', onReload: vi.fn() },
    });

    fireEvent.click(getByRole('button', { name: 'History' }));

    expect(getByText('Could not load your conversations.')).toBeTruthy();
  });

  it('sends what was typed and clears the box', () => {
    const onSend = vi.fn();
    const { container } = render(
      <AssistantChat theme={PORTER} title="Porter" messages={[]} onSend={onSend} />,
    );
    const box = container.querySelector('textarea') as HTMLTextAreaElement;

    fireEvent.change(box, { target: { value: '  How do I invite a client?  ' } });
    fireEvent.keyDown(box, { key: 'Enter' });

    expect(onSend).toHaveBeenCalledWith('How do I invite a client?');
    expect(box.value).toBe('');
  });

  it('draws the intro prompts as sendable questions, stacked', () => {
    const onPrompt = vi.fn();
    const { getByRole, getByText } = render(
      <AssistantChat
        theme={MIRA}
        title="Mira"
        messages={[]}
        onSend={vi.fn()}
        onPrompt={onPrompt}
        intro={{ greeting: 'Hi, I am Mira.', body: 'I answer questions.', prompts: ['How does it work?'] }}
      />,
    );

    expect(getByText('Hi, I am Mira.')).toBeTruthy();
    expect(getByText('Try asking')).toBeTruthy();

    fireEvent.click(getByRole('button', { name: 'How does it work?' }));
    expect(onPrompt).toHaveBeenCalledWith('How does it work?');
  });

  it('labels an ungrounded answer, and says nothing when no claim was made', () => {
    const { container } = render(
      <AssistantChat
        theme={MIRA}
        title="Mira"
        messages={[
          { id: 'g', role: 'assistant', text: 'Probably.', grounded: false, confidence: 'low' },
          { id: 'q', role: 'assistant', text: 'Certainly.' },
        ]}
        onSend={vi.fn()}
      />,
    );

    expect(container.textContent).toContain('Best-effort');
    expect(container.textContent?.match(/Best-effort/g)).toHaveLength(1);
  });

  /*
   * ⚠ THE GUEST PANEL PASSED NO ICONS AND THE PANEL DREW THE WORDS. "Helpful"
   * and "Not helpful" landed inside two 28px circles sized for a glyph and
   * overlapped on a public page. A product must never have to supply an icon for
   * the panel to look right.
   */
  it('draws the rating icons itself when a product passes none', () => {
    const { container } = render(
      <AssistantChat
        theme={PORTER}
        title="Porter"
        onSend={vi.fn()}
        messages={[{ id: 'a1', role: 'assistant', text: 'An answer.' }]}
        feedback={{ onSubmit: vi.fn() }}
      />,
    );
    const up = container.querySelector('[aria-label="This reply was helpful"]');
    const down = container.querySelector('[aria-label="This reply was not helpful"]');

    expect(up?.querySelector('svg')).toBeTruthy();
    expect(down?.querySelector('svg')).toBeTruthy();
    expect(up?.textContent).toBe('');
    expect(down?.textContent).toBe('');
  });

  it('draws the bot check and says why a question is waiting', () => {
    const { container, getByText } = mount(MIRA, {
      messages: [],
      humanCheck: { siteKey: 'site-key', onToken: vi.fn(), resetSignal: 0, waiting: true },
    });

    expect(container.querySelector('[data-aiui-human-check]')).not.toBeNull();
    expect(getByText(/Verify you are human/)).toBeTruthy();
  });

  it('draws no bot check when the product asked for none', () => {
    const { container, queryByText } = mount(MIRA);

    expect(container.querySelector('[data-aiui-human-check]')).toBeNull();
    expect(queryByText(/Verify you are human/)).toBeNull();
  });
});
