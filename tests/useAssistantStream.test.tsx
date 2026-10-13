import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAssistantStream } from '../src/useAssistantStream';

/** A fetch that answers one SSE body. */
function sseFetch(body: string, init: { ok?: boolean; status?: number } = {}) {
  return vi.fn(async () => {
    const encoder = new TextEncoder();

    return {
      ok: init.ok ?? true,
      status: init.status ?? 200,
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(body));
          controller.close();
        },
      }),
      json: async () => ({}),
    } as unknown as Response;
  });
}

const URL_ = '/api/proxy/assistant/chat/stream';
const CANCEL = '/api/proxy/assistant/chat/stream/{id}';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useAssistantStream', () => {
  it('accumulates tokens and finishes', async () => {
    vi.stubGlobal(
      'fetch',
      sseFetch(
        'event: open\ndata: {"stream_id":"abc"}\n\n' +
          'event: token\ndata: {"text":"Hello "}\n\n' +
          'event: token\ndata: {"text":"there."}\n\n' +
          'event: done\ndata: {"text":"Hello there."}\n\n',
      ),
    );

    const { result } = renderHook(() => useAssistantStream({ url: URL_ }));

    await act(async () => {
      await result.current.ask({ message: 'hi' });
    });

    expect(result.current.state.phase).toBe('done');
    expect(result.current.state.text).toBe('Hello there.');
    expect(result.current.state.streamId).toBe('abc');
  });

  /**
   * ⚠ THE EVENT EVERY CONSUMER FORGETS, AND IT CORRUPTS THE ANSWER. A rung dies
   * mid-sentence and the next one starts over; appending leaves two half-answers
   * glued together, which reads as finished prose.
   */
  it('throws away the text on a discard', async () => {
    vi.stubGlobal(
      'fetch',
      sseFetch(
        'event: token\ndata: {"text":"The first rung said this"}\n\n' +
          'event: discard\ndata: {}\n\n' +
          'event: token\ndata: {"text":"The second rung says this."}\n\n' +
          'event: done\ndata: {}\n\n',
      ),
    );

    const { result } = renderHook(() => useAssistantStream({ url: URL_ }));

    await act(async () => {
      await result.current.ask({ message: 'hi' });
    });

    expect(result.current.state.text).toBe('The second rung says this.');
    expect(result.current.state.text).not.toContain('first rung');
  });

  /**
   * ⚠ A STREAM THAT ENDED WITHOUT A TERMINAL EVENT DID NOT FINISH. Reporting it
   * as success is how a user acts on half an answer: the paragraph simply stops,
   * and a truncated sentence reads as a complete one often enough to matter.
   */
  it('fails when the stream ends with no terminal event', async () => {
    vi.stubGlobal('fetch', sseFetch('event: token\ndata: {"text":"half an answ"}\n\n'));

    const { result } = renderHook(() => useAssistantStream({ url: URL_ }));

    let ok = true;

    await act(async () => {
      ok = await result.current.ask({ message: 'hi' });
    });

    expect(ok).toBe(false);
    expect(result.current.state.phase).toBe('failed');
    expect(result.current.state.error).toContain('before it was finished');
  });

  it('reports an error event and stops reading', async () => {
    vi.stubGlobal(
      'fetch',
      sseFetch('event: error\ndata: {"message":"Every provider refused."}\n\n'),
    );

    const onError = vi.fn();
    const { result } = renderHook(() => useAssistantStream({ url: URL_, onError }));

    await act(async () => {
      await result.current.ask({ message: 'hi' });
    });

    expect(result.current.state.phase).toBe('failed');
    expect(result.current.state.error).toBe('Every provider refused.');
    expect(onError).toHaveBeenCalledWith('Every provider refused.');
  });

  /** A refusal arrives as ordinary JSON, not as SSE: there is no stream to read. */
  it('surfaces the message from a non-SSE refusal', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 403,
        body: null,
        json: async () => ({ message: 'Porter is switched off on this environment.' }),
      }) as unknown as Response),
    );

    const { result } = renderHook(() => useAssistantStream({ url: URL_ }));

    await act(async () => {
      await result.current.ask({ message: 'hi' });
    });

    expect(result.current.state.error).toBe('Porter is switched off on this environment.');
  });

  /**
   * ⚠ STOP IS THREE THINGS IN ORDER: local state, abort, DELETE. Doing the
   * DELETE first makes the user wait on a round trip to be told their own click
   * worked; skipping it stops the spinner and not the money.
   */
  it('stop sets the phase immediately and tells the service', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') {
        return { ok: true, status: 200, body: null, json: async () => ({}) } as unknown as Response;
      }

      const encoder = new TextEncoder();

      return {
        ok: true,
        status: 200,
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode('event: open\ndata: {"stream_id":"abc"}\n\n'));
            controller.enqueue(encoder.encode('event: token\ndata: {"text":"writing"}\n\n'));
            controller.enqueue(encoder.encode('event: done\ndata: {}\n\n'));
            controller.close();
          },
        }),
        json: async () => ({}),
      } as unknown as Response;
    });

    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useAssistantStream({ url: URL_, cancelUrl: CANCEL }));

    await act(async () => {
      await result.current.ask({ message: 'hi' });
    });

    act(() => {
      result.current.stop();
    });

    await waitFor(() => {
      const deletes = fetchMock.mock.calls.filter(([, init]) => (init as RequestInit)?.method === 'DELETE');

      expect(deletes).toHaveLength(1);
      expect(deletes[0]?.[0]).toBe('/api/proxy/assistant/chat/stream/abc');
      // ⚠ keepalive, so a closing tab still stops the spend.
      expect((deletes[0]?.[1] as RequestInit).keepalive).toBe(true);
    });
  });

  /** A product whose route speaks a different dialect maps the names. */
  it('honours renamed events', async () => {
    vi.stubGlobal(
      'fetch',
      sseFetch(
        'event: token\ndata: {"text":"first"}\n\n' +
          'event: reset\ndata: {}\n\n' +
          'event: token\ndata: {"text":"second"}\n\n' +
          'event: message\ndata: {"text":"second"}\n\n',
      ),
    );

    const { result } = renderHook(() =>
      useAssistantStream({ url: URL_, events: { discard: 'reset', done: 'message' } }),
    );

    await act(async () => {
      await result.current.ask({ message: 'hi' });
    });

    expect(result.current.state.phase).toBe('done');
    expect(result.current.state.text).toBe('second');
  });

  /**
   * ⚠ THE TERMINAL EVENT'S TEXT WINS. A provider can emit tokens that differ
   * from its final answer (a repaired field, a trimmed ending), and showing the
   * accumulation leaves the user reading something the model did not finally say.
   */
  it('prefers the terminal text over the accumulated tokens', async () => {
    vi.stubGlobal(
      'fetch',
      sseFetch(
        'event: token\ndata: {"text":"draft wording"}\n\n' +
          'event: done\ndata: {"text":"final wording"}\n\n',
      ),
    );

    const { result } = renderHook(() => useAssistantStream({ url: URL_ }));

    await act(async () => {
      await result.current.ask({ message: 'hi' });
    });

    expect(result.current.state.text).toBe('final wording');
  });

  it('reads a tool trail from the terminal event', async () => {
    vi.stubGlobal(
      'fetch',
      sseFetch(
        'event: done\ndata: {"text":"ok","tools":[{"name":"atlas_query","outcome":"ran"},{"name":"secret","outcome":"refused"}]}\n\n',
      ),
    );

    const { result } = renderHook(() => useAssistantStream({ url: URL_ }));

    await act(async () => {
      await result.current.ask({ message: 'hi' });
    });

    expect(result.current.state.tools).toEqual([
      { name: 'atlas_query', outcome: 'ran', error: undefined },
      { name: 'secret', outcome: 'refused', error: undefined },
    ]);
  });
});
