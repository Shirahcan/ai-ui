import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useComposerHistory } from '../src';

describe('useComposerHistory', () => {
  it('puts a sent question on top at once, skips an immediate repeat, and caps the ring', () => {
    const { result } = renderHook(() => useComposerHistory({ limit: 2 }));

    act(() => result.current.remember('first'));
    act(() => result.current.remember('second'));
    act(() => result.current.remember('second'));
    act(() => result.current.remember('  third  '));

    expect(result.current.history).toEqual(['third', 'second']);
  });

  it("loads the account's own ring and reloads it when the account changes", async () => {
    const load = vi.fn().mockResolvedValueOnce(['a1']).mockResolvedValueOnce(['b1', 'b2']);
    const { result, rerender } = renderHook(({ account }) => useComposerHistory({ load, accountKey: account }), {
      initialProps: { account: 'a' },
    });

    await waitFor(() => expect(result.current.history).toEqual(['a1']));
    rerender({ account: 'b' });
    await waitFor(() => expect(result.current.history).toEqual(['b1', 'b2']));
    expect(load).toHaveBeenCalledTimes(2);
  });
});
