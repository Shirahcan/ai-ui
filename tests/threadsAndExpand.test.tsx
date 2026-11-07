import { act, fireEvent, render, screen } from '@testing-library/react';
import { setDisplayTimezone } from '@shirahcan/calendar-ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssistantChat, type AssistantChatThreads } from '../src/components/AssistantChat';
import { AssistantHistory, groupThreads, type AssistantThread } from '../src/components/AssistantHistory';
import { AssistantLauncher } from '../src/components/AssistantLauncher';
import type { AssistantTheme } from '../src/theme';

/**
 * A conversation list that scales and can be found in, a large view, and an unread mark (1.37.0,
 * owner 2026-11-06). Each control appears only when the product supplies its handler.
 */
const THEME: AssistantTheme = {
  surface: '#fff', fg: '#111', muted: '#666', border: '#ddd', accent: '#4361EE', accentFg: '#fff', accentSoft: '#eef',
};

const NOW = new Date('2026-11-06T12:00:00Z');
const threads: AssistantThread[] = [
  { id: 'p', title: 'Pinned fax', updatedAt: '2026-10-01T10:00:00Z', pinned: true },
  { id: 't', title: 'Today thread', updatedAt: '2026-11-06T09:00:00Z' },
  { id: 'y', title: 'Yesterday thread', updatedAt: '2026-11-05T09:00:00Z' },
  { id: 'w', title: 'This week thread', updatedAt: '2026-11-01T09:00:00Z' },
  { id: 'o', title: 'Old thread', updatedAt: '2026-09-01T09:00:00Z' },
  { id: 'n', title: 'No time' },
];

describe('the grouped list', () => {
  it('groups by the viewer calendar with pins first', () => {
    expect(groupThreads(threads, 'Africa/Lagos', NOW).map((g) => [g.label, g.threads.map((t) => t.id)])).toEqual([
      ['Pinned', ['p']],
      ['Today', ['t']],
      ['Yesterday', ['y']],
      ['Previous 7 days', ['w']],
      ['Older', ['o', 'n']],
    ]);
  });

  it('keeps the single delete button when a product offers no rename or pin', () => {
    render(<AssistantHistory threads={threads.slice(1, 2)} onSelect={() => {}} onDelete={() => {}} deleteIcon="x" />);
    expect(screen.getByLabelText('Delete conversation: Today thread')).toBeTruthy();
    expect(screen.queryByLabelText('Actions for conversation: Today thread')).toBeNull();
  });

  it('puts rename, pin and delete behind one kebab, delete last and still confirmed', () => {
    const onPin = vi.fn();
    const onDelete = vi.fn();
    render(<AssistantHistory threads={threads.slice(1, 2)} onSelect={() => {}} onDelete={onDelete} onRename={() => {}} onPin={onPin} />);

    fireEvent.click(screen.getByLabelText('Actions for conversation: Today thread'));
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['Rename', 'Pin to top', 'Delete']);
    fireEvent.click(screen.getByText('Pin to top'));
    expect(onPin).toHaveBeenCalledWith('t', true);

    fireEvent.click(screen.getByLabelText('Actions for conversation: Today thread'));
    fireEvent.click(screen.getByText('Delete'));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByText('Delete this conversation?')).toBeTruthy();
  });

  it('renames inline: Enter saves the trimmed words, Escape keeps the old name', () => {
    const onRename = vi.fn();
    render(<AssistantHistory threads={threads.slice(1, 2)} onSelect={() => {}} onRename={onRename} />);

    fireEvent.click(screen.getByLabelText('Actions for conversation: Today thread'));
    fireEvent.click(screen.getByText('Rename'));
    const box = screen.getByLabelText('New name for conversation: Today thread');
    fireEvent.change(box, { target: { value: '  Maria fax  ' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onRename).toHaveBeenCalledWith('t', 'Maria fax');

    fireEvent.click(screen.getByLabelText('Actions for conversation: Today thread'));
    fireEvent.click(screen.getByText('Rename'));
    fireEvent.keyDown(screen.getByLabelText('New name for conversation: Today thread'), { key: 'Escape' });
    expect(onRename).toHaveBeenCalledTimes(1);
  });
});

describe('the panel list, search and the large view', () => {
  beforeEach(() => {
    Object.defineProperty(Element.prototype, 'scrollTo', { value: vi.fn(), configurable: true });
    setDisplayTimezone('Africa/Lagos');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });
  afterEach(() => {
    vi.useRealTimers();
    setDisplayTimezone(null);
  });

  function panel(list: Partial<AssistantChatThreads>, extra: Record<string, unknown> = {}) {
    return render(
      <AssistantChat
        theme={THEME}
        title="Porter"
        messages={[]}
        onSend={() => {}}
        threads={{ items: threads.slice(1, 3), onSelect: () => {}, ...list }}
        {...extra}
      />,
    );
  }

  it('searches once the words settle, shows what was found, and says when it stopped early', () => {
    const onSearch = vi.fn();
    const { rerender } = panel({ onSearch });
    fireEvent.click(screen.getByLabelText('Open the menu: new conversation and history'));

    const box = screen.getByLabelText('Search your conversations');
    fireEvent.change(box, { target: { value: 'f' } });
    act(() => { vi.advanceTimersByTime(400); });
    expect(onSearch).not.toHaveBeenCalled();

    fireEvent.change(box, { target: { value: 'fax' } });
    act(() => { vi.advanceTimersByTime(400); });
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith('fax');

    rerender(
      <AssistantChat
        theme={THEME}
        title="Porter"
        messages={[]}
        onSend={() => {}}
        threads={{
          items: threads.slice(1, 3), onSelect: () => {}, onSearch,
          search: { status: 'ready', capped: true, results: [{ id: 'p', title: 'Pinned fax', snippet: '...send the fax to IRCC' }] },
        }}
      />,
    );
    expect(screen.getByText('...send the fax to IRCC')).toBeTruthy();
    expect(screen.queryByText('Today thread')).toBeNull();
    expect(screen.getByText('Searched your 200 most recent conversations.')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(400); });
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it('offers older conversations when there are more', () => {
    // ⚠ THE PANEL GROUPS BY THE REAL CLOCK, so this row is dated NOW: the shared fixture's "Today thread"
    // (2026-11-06) became "Yesterday" the day after this test was written and the suite went red.
    const onLoadMore = vi.fn();
    panel({ hasMore: true, onLoadMore, groupByDay: true, items: [{ id: 't', title: 'Today thread', updatedAt: new Date().toISOString() }] });
    fireEvent.click(screen.getByLabelText('Open the menu: new conversation and history'));
    expect(screen.getByLabelText('Today')).toBeTruthy();
    fireEvent.click(screen.getByText('Load older conversations'));
    expect(onLoadMore).toHaveBeenCalled();
  });

  it('expands to the large view and Escape brings it back', () => {
    const onExpandedChange = vi.fn();
    panel({}, { expandable: true, onExpandedChange });

    const dialog = screen.getByRole('dialog');
    expect(dialog.style.position).not.toBe('fixed');
    fireEvent.click(screen.getByLabelText('Expand'));
    expect(onExpandedChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole('dialog').style.position).toBe('fixed');
    expect(screen.getByRole('dialog').style.maxWidth).toBe('60rem');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onExpandedChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByLabelText('Expand')).toBeTruthy();
  });

  it('draws no expand button unless the product asks', () => {
    panel({});
    expect(screen.queryByLabelText('Expand')).toBeNull();
  });
});

describe('the unread mark', () => {
  it('shows a dot and says so only while unread and closed', () => {
    const { rerender } = render(
      <AssistantLauncher open={false} onToggle={() => {}} theme={THEME} openLabel="Open Porter" closeLabel="Close Porter" unread />,
    );
    expect(screen.getByLabelText('Open Porter: a new answer is waiting')).toBeTruthy();
    expect(document.querySelector('[data-ai-unread]')).not.toBeNull();

    rerender(<AssistantLauncher open onToggle={() => {}} theme={THEME} openLabel="Open Porter" closeLabel="Close Porter" unread />);
    expect(document.querySelector('[data-ai-unread]')).toBeNull();
    expect(screen.getByLabelText('Close Porter')).toBeTruthy();
  });
});

describe('the large view and the sidebar (1.37.2)', () => {
  beforeEach(() => {
    Object.defineProperty(Element.prototype, 'scrollTo', { value: vi.fn(), configurable: true });
  });

  it('fills the card with the conversation and slides the sidebar in from the card edge', () => {
    render(
      <AssistantChat
        theme={THEME}
        title="Porter"
        messages={[]}
        onSend={() => {}}
        expandable
        threads={{ items: threads.slice(1, 2), onSelect: () => {} }}
      />,
    );
    fireEvent.click(screen.getByLabelText('Expand'));
    expect(document.querySelector('.max-w-4xl')).toBeNull();

    fireEvent.click(screen.getByLabelText('Open the menu: new conversation and history'));
    const sidebar = document.getElementById('assistant-sidebar')!;
    expect(sidebar.className).toContain('aiui-slide-in');
    expect(sidebar.className).toContain('left-0');
    // The drawer sits on the card itself, not on an inner column.
    expect(sidebar.parentElement?.className).not.toContain('max-w');
    expect(document.querySelector('style')?.textContent).toContain('prefers-reduced-motion');
  });
});
