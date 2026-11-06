import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AssistantChat } from '../src/components/AssistantChat';
import { cleanClone, conversationAsText, htmlToPlainText, readRenderedTurns } from '../src/conversationCopy';
import type { AssistantTheme } from '../src/theme';
import type { PanelMessage } from '../src/types';

/**
 * Copy, export and follow-ups on every assistant answer (owner, 2026-11-03).
 */
const THEME: AssistantTheme = {
  surface: '#ffffff', fg: '#1e293b', muted: '#64748b', border: '#e2e8f0',
  accent: '#4361EE', accentFg: '#ffffff', accentSoft: '#eef2ff',
};

const rows: PanelMessage[] = [
  { id: 'u1', role: 'user', text: 'Run the books check' },
  { id: 'a1', role: 'assistant', text: 'Earlier answer.', meta: { follow_ups: ['Stale suggestion'] } },
  { id: 'u2', role: 'user', text: 'And now?' },
  {
    id: 'a2',
    role: 'assistant',
    text: 'Money tied to the wrong person:\n\n- **54** entries name the worker\n- **7** top-ups miss slots',
    meta: { follow_ups: ['Apply the fix', 'Show me the 54 entries'] },
  },
];

/** jsdom's Blob has no text(). */
const readBlob = (blob: Blob) =>
  new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });

describe('answer actions', () => {
  Object.defineProperty(Element.prototype, 'scrollTo', { value: vi.fn(), configurable: true });

  it('offers the latest answer\'s follow-ups only, and sends one as the person', () => {
    const onSend = vi.fn();
    render(<AssistantChat theme={THEME} title="Porter" messages={rows} onSend={onSend} />);

    expect(screen.queryByRole('button', { name: 'Stale suggestion' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Apply the fix' }));
    expect(onSend).toHaveBeenCalledWith('Apply the fix', { input: 'follow_up' });
  });

  it('hides follow-ups once the person has replied, and disables them while an answer is written', () => {
    const { rerender } = render(
      <AssistantChat theme={THEME} title="Porter" messages={rows} onSend={vi.fn()} busy />,
    );
    expect((screen.getByRole('button', { name: 'Apply the fix' }) as HTMLButtonElement).disabled).toBe(true);

    rerender(
      <AssistantChat theme={THEME} title="Porter" messages={[...rows, { id: 'u3', role: 'user', text: 'Thanks' }]} onSend={vi.fn()} />,
    );
    expect(screen.queryByRole('button', { name: 'Apply the fix' })).toBeNull();
  });

  it('copies the answer as drawn: HTML with the bold kept, plain text without asterisks or controls', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const blobs: Record<string, Blob> = {};
    class FakeItem {
      constructor(items: Record<string, Blob>) {
        Object.assign(blobs, items);
      }
    }
    vi.stubGlobal('ClipboardItem', FakeItem);
    Object.defineProperty(navigator, 'clipboard', { value: { write, writeText: vi.fn() }, configurable: true });

    render(<AssistantChat theme={THEME} title="Porter" messages={rows} onSend={vi.fn()} />);
    const copies = screen.getAllByRole('button', { name: 'Copy this answer' });
    fireEvent.click(copies[copies.length - 1]!);

    await waitFor(() => expect(write).toHaveBeenCalled());
    expect(await readBlob(blobs['text/html']!)).toContain('<strong>54</strong>');
    const text = await readBlob(blobs['text/plain']!);
    expect(text).toBe('Money tied to the wrong person:\n\n- 54 entries name the worker\n- 7 top-ups miss slots');
    expect(text).not.toContain('Apply the fix');
    vi.unstubAllGlobals();
  });

  it('exports every turn with its speaker, as it read on screen', () => {
    const { container } = render(<AssistantChat theme={THEME} title="Porter" messages={rows} onSend={vi.fn()} />);

    const turns = readRenderedTurns(container, { user: 'You', assistant: 'Porter' });
    expect(turns.map((t) => t.speaker)).toEqual(['You', 'Porter', 'You', 'Porter']);
    const file = conversationAsText('Books check', turns);
    expect(file).toContain('Porter:\nMoney tied to the wrong person:');
    expect(file).not.toContain('**');
    expect(file).not.toContain('Show me the 54 entries');
  });

  it('reads tables as tab-separated rows and numbered lists as numbers', () => {
    const el = document.createElement('div');
    el.innerHTML = '<p>Top two:</p><ol><li>Maria</li><li>Ade</li></ol><table><tr><th>Case</th><th>Due</th></tr><tr><td>A</td><td>Nov 4</td></tr></table><button>Apply it</button>';

    expect(htmlToPlainText(cleanClone(el))).toBe('Top two:\n\n1. Maria\n2. Ade\n\nCase\tDue\nA\tNov 4');
  });
});
