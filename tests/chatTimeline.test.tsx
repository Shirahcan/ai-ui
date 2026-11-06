import { fireEvent, render, screen } from '@testing-library/react';
import { setDisplayTimezone } from '@shirahcan/calendar-ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssistantChat } from '../src/components/AssistantChat';
import { conversationAsText, readRenderedTurns } from '../src/conversationCopy';
import type { AssistantTheme } from '../src/theme';
import type { PanelMessage } from '../src/types';

/**
 * When each message was said (1.37.0, owner 2026-11-06): the time on each answer's action row, a quiet
 * divider at each new day, the asked/answered detail on a tap, and times in the exports. OFF unless the
 * product asks, so an upgrade changes nothing on its own.
 */
const THEME: AssistantTheme = {
  surface: '#fff', fg: '#111', muted: '#666', border: '#ddd', accent: '#4361EE', accentFg: '#fff', accentSoft: '#eef',
};

const rows: PanelMessage[] = [
  { id: 'u1', role: 'user', text: 'What meetings do I have today?', at: '2026-11-04T13:05:00Z' },
  { id: 'a1', role: 'assistant', text: 'One at 3 PM.', at: '2026-11-04T13:05:08Z' },
  { id: 'u2', role: 'user', text: 'Any new cases?', at: '2026-11-05T09:00:00Z' },
  { id: 'a2', role: 'assistant', text: 'Two.', at: '2026-11-05T09:02:10Z' },
  { id: 'a3', role: 'assistant', text: 'Undated note.' },
];

function chat(timeline: boolean, messages: PanelMessage[] = rows) {
  return render(
    <AssistantChat theme={THEME} title="Porter" messages={messages} onSend={() => {}} extras={{ timeline }} />,
  );
}

describe('chat timeline', () => {
  beforeEach(() => {
    Object.defineProperty(Element.prototype, 'scrollTo', { value: vi.fn(), configurable: true });
    setDisplayTimezone('Africa/Lagos');
  });
  afterEach(() => setDisplayTimezone(null));

  it('draws nothing new while the product has not asked for it', () => {
    chat(false);
    expect(screen.queryAllByRole('separator')).toHaveLength(0);
    expect(document.querySelector('[data-ai-message-time]')).toBeNull();
    expect(document.querySelector('[data-ai-export-at]')).toBeNull();
  });

  it('puts the time on each dated answer and a divider over each new day', () => {
    chat(true);

    const times = Array.from(document.querySelectorAll('[data-ai-message-time] time')).map((t) => t.textContent);
    expect(times).toEqual(['2:05 PM WAT', '10:02 AM WAT']);
    expect(document.querySelectorAll('time')[0]?.getAttribute('dateTime')).toBe('2026-11-04T13:05:08Z');

    const dividers = screen.getAllByRole('separator');
    expect(dividers).toHaveLength(2);
    expect(dividers[0]?.getAttribute('aria-label')).toBe('Wednesday, November 4, 2026');
    expect(dividers[1]?.getAttribute('aria-label')).toBe('Thursday, November 5, 2026');
  });

  it('says when it was asked and how long the answer took, on a tap', () => {
    chat(true);
    const first = document.querySelector<HTMLButtonElement>('[data-ai-message-time]')!;
    expect(first.getAttribute('aria-label')).toBe('Asked 2:05 PM WAT, answered 8 s later');

    fireEvent.click(first);
    expect(first.textContent).toBe('Asked 2:05 PM WAT, answered 8 s later');
    fireEvent.click(first);
    expect(first.textContent).toBe('2:05 PM WAT');

    const second = document.querySelectorAll<HTMLButtonElement>('[data-ai-message-time]')[1]!;
    expect(second.getAttribute('aria-label')).toBe('Asked 10:00 AM WAT, answered 2 min later');
  });

  it('shows the person their own message time on hover', () => {
    chat(true);
    const own = document.querySelector('[data-ai-export-role="user"]');
    expect(own?.getAttribute('title')).toBe('Sent 2:05 PM WAT');
  });

  it('exports each turn with when it was said, and never the divider or the row time', () => {
    const { container } = chat(true);
    const turns = readRenderedTurns(container, { user: 'You', assistant: 'Porter' }, 'Africa/Lagos');

    expect(turns.map((t) => t.when)).toEqual([
      'Wed, Nov 4, 2026, 2:05 PM WAT',
      'Wed, Nov 4, 2026, 2:05 PM WAT',
      'Thu, Nov 5, 2026, 10:00 AM WAT',
      'Thu, Nov 5, 2026, 10:02 AM WAT',
      undefined,
    ]);
    const text = conversationAsText('Meetings', turns);
    expect(text).toContain('You (Wed, Nov 4, 2026, 2:05 PM WAT):\nWhat meetings do I have today?');
    expect(text).toContain('Porter:\nUndated note.');
    expect(text).not.toContain('Wednesday, November 4');
    expect(text).toMatch(/Exported .+ (WAT|GMT|UTC|[A-Z]{2,5})/);
  });

  it('says how long background work has been running', () => {
    chat(true, [
      { id: 'u1', role: 'user', text: 'List every case', at: new Date(Date.now() - 125_000).toISOString() },
      {
        id: 'a1', role: 'assistant', text: 'Working on it.', streaming: true,
        at: new Date(Date.now() - 120_000).toISOString(), deferred: [{ ticket: 't1', label: 'cases' }],
      },
    ]);
    expect(screen.getByText('Still working, 2 min so far')).toBeTruthy();
  });
});
