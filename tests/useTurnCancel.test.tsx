import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTurnCancel } from '../src/useTurnCancel';

const CANCEL = '/api/proxy/assistant/chat/stream/{id}';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useTurnCancel', () => {
  it('is not stoppable until a turn starts, and is again once it ends', () => {
    const { result } = renderHook(() => useTurnCancel({ cancelUrl: CANCEL }));

    expect(result.current.isStoppable).toBe(false);

    act(() => {
      result.current.startTurn();
    });
    expect(result.current.isStoppable).toBe(true);

    act(() => {
      result.current.endTurn();
    });
    expect(result.current.isStoppable).toBe(false);
  });

  it('DELETEs the tracked stream id, with keepalive and the product headers', () => {
    const fetchMock = vi.fn(async () => ({ ok: true }) as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useTurnCancel({ cancelUrl: CANCEL, headers: () => ({ Authorization: 'Bearer t0ken' }) }),
    );

    act(() => {
      result.current.startTurn();
      result.current.trackTurn('turn-42');
      result.current.stop();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/proxy/assistant/chat/stream/turn-42');
    expect(init.method).toBe('DELETE');
    expect(init.keepalive).toBe(true);
    expect(init.headers).toEqual({ Authorization: 'Bearer t0ken' });
  });

  /**
   * The ordering guard. `onStop` is the user's experience and MUST land before
   * any network call, or the panel sits streaming until a round trip returns.
   */
  it('wipes local state BEFORE it touches the network', () => {
    const order: string[] = [];

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        order.push('fetch');
        return { ok: true } as unknown as Response;
      }),
    );

    const { result } = renderHook(() =>
      useTurnCancel({ cancelUrl: CANCEL, onStop: () => order.push('onStop') }),
    );

    let signal: AbortSignal | undefined;

    act(() => {
      signal = result.current.startTurn().signal;
      result.current.trackTurn('turn-7');
      result.current.stop();
    });

    expect(order).toEqual(['onStop', 'fetch']);
    // And step 2 happened: this tab is no longer listening.
    expect(signal?.aborted).toBe(true);
    expect(result.current.wasStopped).toBe(true);
    expect(result.current.isStoppable).toBe(false);
  });

  /**
   * ⚠ The ref, not the state. A turn stopped in the same tick its open frame
   * arrived must still send the DELETE - otherwise the provider keeps
   * generating, and keeps billing, for a turn nobody is watching.
   */
  it('cancels a turn whose id arrived in the same tick as the stop', () => {
    const fetchMock = vi.fn(async () => ({ ok: true }) as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useTurnCancel({ cancelUrl: CANCEL }));

    act(() => {
      result.current.startTurn();
      // No re-render between these two lines. State would still read null.
      result.current.trackTurn('same-tick');
      result.current.stop();
    });

    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toBe('/api/proxy/assistant/chat/stream/same-tick');
  });

  it('still stops locally when the product has no cancel route yet', () => {
    const fetchMock = vi.fn(async () => ({ ok: true }) as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);

    const onStop = vi.fn();
    const { result } = renderHook(() => useTurnCancel({ onStop }));

    let signal: AbortSignal | undefined;

    act(() => {
      signal = result.current.startTurn().signal;
      result.current.trackTurn('turn-9');
      result.current.stop();
    });

    expect(onStop).toHaveBeenCalledTimes(1);
    expect(signal?.aborted).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does nothing at all when there is no turn to stop', () => {
    const fetchMock = vi.fn(async () => ({ ok: true }) as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);

    const onStop = vi.fn();
    const { result } = renderHook(() => useTurnCancel({ cancelUrl: CANCEL, onStop }));

    act(() => {
      result.current.stop();
    });

    expect(onStop).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.wasStopped).toBe(false);
  });

  it('aborts a turn still in flight when the next one starts', () => {
    const { result } = renderHook(() => useTurnCancel({ cancelUrl: CANCEL }));

    let first: AbortSignal | undefined;
    let second: AbortSignal | undefined;

    act(() => {
      first = result.current.startTurn().signal;
    });
    act(() => {
      second = result.current.startTurn().signal;
    });

    expect(first?.aborted).toBe(true);
    expect(second?.aborted).toBe(false);
  });

  it('a swallowed cancel failure never reaches the product', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));

    const { result } = renderHook(() => useTurnCancel({ cancelUrl: CANCEL }));

    await act(async () => {
      result.current.startTurn();
      result.current.trackTurn('turn-11');
      result.current.stop();
      await Promise.resolve();
    });

    expect(result.current.wasStopped).toBe(true);
  });

  /** Every product here reaches its API through axios somewhere. */
  it('recognises all three shapes a cancellation arrives in', () => {
    const { result } = renderHook(() => useTurnCancel());

    const fetchAbort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const axiosNamed = Object.assign(new Error('canceled'), { name: 'CanceledError' });
    const axiosCoded = Object.assign(new Error('canceled'), { code: 'ERR_CANCELED' });

    expect(result.current.isStopError(fetchAbort)).toBe(true);
    expect(result.current.isStopError(axiosNamed)).toBe(true);
    expect(result.current.isStopError(axiosCoded)).toBe(true);
    expect(result.current.isStopError(new Error('the provider died'))).toBe(false);
    expect(result.current.isStopError(null)).toBe(false);
  });

  /** It goes on a button and into dependency arrays. */
  it('keeps a stable identity across renders', () => {
    const { result, rerender } = renderHook(
      ({ label }: { label: string }) => useTurnCancel({ onStop: () => void label }),
      { initialProps: { label: 'a' } },
    );

    const before = result.current.stop;
    rerender({ label: 'b' });

    expect(result.current.stop).toBe(before);
  });
});
