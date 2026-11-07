import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAssistantThreads, type AssistantThreadsApi } from '../src';

function api(overrides: Partial<AssistantThreadsApi> = {}): AssistantThreadsApi {
  return {
    list: vi.fn(async (before: string | null) => before === null
      ? { items: [{ id: 'a', title: 'Alpha', last_message_at: '2026-11-07T10:00:00Z' }, { id: 'p', title: 'Pinned too' }], next_before: 'c1', pinned: [{ id: 'p', title: 'Pinned too', pinned: true }] }
      : { items: [{ id: 'b', title: 'Bravo', created_at: '2026-11-01T10:00:00Z' }], next_before: null }),
    search: vi.fn(async () => ({ results: [{ id: 'a', title: 'Alpha', snippet: '...the fax...', match: 'turn' as const }], capped: false })),
    update: vi.fn(async () => ({})),
    ...overrides,
  };
}

describe('useAssistantThreads', () => {
  it('lists pins first, each thread once, then loads older pages', async () => {
    const calls = api();
    const { result } = renderHook(() => useAssistantThreads(calls, { enabled: true }));

    await waitFor(() => expect(result.current.items.map((t) => t.id)).toEqual(['p', 'a']));
    expect(result.current.items[0]?.pinned).toBe(true);
    expect(result.current.hasMore).toBe(true);

    act(() => result.current.onLoadMore());
    await waitFor(() => expect(result.current.items.map((t) => t.id)).toEqual(['p', 'a', 'b']));
    expect(result.current.hasMore).toBe(false);
    expect(calls.list).toHaveBeenLastCalledWith('c1');
  });

  it('fetches nothing while off, and a pin or rename reloads the list', async () => {
    const calls = api();
    const { result, rerender } = renderHook(({ on }) => useAssistantThreads(calls, { enabled: on }), { initialProps: { on: false } });
    expect(calls.list).not.toHaveBeenCalled();

    rerender({ on: true });
    await waitFor(() => expect(calls.list).toHaveBeenCalledTimes(1));
    act(() => result.current.onPin('a', true));
    await waitFor(() => expect(calls.list).toHaveBeenCalledTimes(2));
    expect(calls.update).toHaveBeenCalledWith('a', { pinned: true });
  });

  it('shows where a search matched, and the latest words win', async () => {
    type Found = Awaited<ReturnType<AssistantThreadsApi['search']>>;
    let resolveOld: (v: Found) => void = () => {};
    const calls = api({
      search: vi.fn((q: string): Promise<Found> => q === 'old'
        ? new Promise<Found>((r) => { resolveOld = r; })
        : Promise.resolve({ results: [{ id: 'a', title: 'Alpha', snippet: '...the fax...', match: 'turn' as const }] })),
    });
    const { result } = renderHook(() => useAssistantThreads(calls, { enabled: true }));

    act(() => result.current.onSearch('old'));
    act(() => result.current.onSearch('fax'));
    await waitFor(() => expect(result.current.search.status).toBe('ready'));
    act(() => resolveOld({ results: [] }));
    expect(result.current.search.results[0]?.snippet).toBe('...the fax...');
  });
});
