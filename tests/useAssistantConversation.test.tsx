import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAssistantConversation } from '../src/useAssistantConversation';
import type { PanelMessage } from '../src/types';

/**
 * The turn loop every product now shares (P19d).
 *
 * ⚠ THESE ARE BEHAVIOUR TESTS, AND THAT IS THE GAP THEY CLOSE. P18's parity test proved two
 * products draw the same geometry; it could not see that one of them streamed, stopped, retried
 * and superseded while the other did none of it. Each case below is a behaviour Porter had and
 * Mira lacked, and each fails silently if it is wrong.
 */

type Raw = { id: string; role: 'user' | 'assistant'; content: string };

const toPanelMessage = (raw: unknown): PanelMessage => {
  const r = raw as Raw;

  return { id: r.id, role: r.role, text: r.content };
};

const answer = (id = 'a1', content = 'An LMIA is an assessment.') => ({ id, role: 'assistant', content });

function sse(body: string, status = 200): Response {
  const encoder = new TextEncoder();

  return {
    ok: status < 400,
    status,
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(body));
        controller.close();
      },
    }),
    json: async () => ({}),
  } as unknown as Response;
}

function json(payload: unknown, status = 200): Response {
  return { ok: status < 400, status, body: null, json: async () => payload } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const base = {
  sendUrl: '/api/proxy/assistant/chat',
  streamUrl: '/api/proxy/assistant/chat/stream',
  cancelUrl: (turn: string) => `/api/proxy/assistant/chat/stream/${turn}`,
  toPanelMessage,
};

describe('useAssistantConversation', () => {
  it('streams an answer and settles it as one message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sse(
      'event: stage\ndata: {"label":"Thinking"}\n\n'
      + 'event: token\ndata: {"text":"An LMIA "}\n\n'
      + 'event: message\ndata: {"conversation_id":"c-1","message":{"id":"a1","role":"assistant","content":"An LMIA is an assessment."}}\n\n',
    )));

    const { result } = renderHook(() => useAssistantConversation(base));
    act(() => result.current.send('What is an LMIA?'));

    await waitFor(() => expect(result.current.busy).toBe(false));
    expect(result.current.conversationId).toBe('c-1');
    expect(result.current.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(result.current.messages[1]?.text).toBe('An LMIA is an assessment.');
  });

  it('falls back to the buffered turn when the stream route is not enabled', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith('/stream') ? json({ message: 'Streaming is not enabled.' }, 404) : json({ data: { conversation_id: 'c-2', message: answer() } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useAssistantConversation(base));
    act(() => result.current.send('What is an LMIA?'));

    await waitFor(() => expect(result.current.messages).toHaveLength(2));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeNull();
  });

  it('calls a stream that ends with no terminal event a failure, and keeps the question for Retry', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sse('event: token\ndata: {"text":"half an answ"}\n\n')));

    const { result } = renderHook(() => useAssistantConversation(base));
    act(() => result.current.send('What is an LMIA?'));

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.retry).toBeDefined();
    expect(result.current.messages.filter((m) => m.role === 'assistant')).toHaveLength(0);
  });

  it('re-sends the failed question on Retry without the person retyping it', async () => {
    const bodies: string[] = [];
    let call = 0;
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(String(init.body));
      call++;

      return call === 1
        ? sse('event: error\ndata: {"message":"Provider timed out."}\n\n')
        : sse('event: message\ndata: {"conversation_id":"c-3","message":{"id":"a2","role":"assistant","content":"Done."}}\n\n');
    }));

    const { result } = renderHook(() => useAssistantConversation(base));
    act(() => result.current.send('Draft a reminder'));
    await waitFor(() => expect(result.current.error).toBe('Provider timed out.'));

    act(() => result.current.retry?.());
    await waitFor(() => expect(result.current.messages.at(-1)?.text).toBe('Done.'));

    expect(JSON.parse(bodies[1] ?? '{}').message).toBe('Draft a reminder');
    expect(result.current.messages.filter((m) => m.role === 'user')).toHaveLength(1);
  });

  it('stops for real: the turn id it streamed with is the one it cancels', async () => {
    const calls: Array<{ url: string; method?: string; body?: string }> = [];
    vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => {
      calls.push({ url, method: init.method, body: init.body as string });
      if (init.method === 'DELETE') return Promise.resolve(json({ success: true }));

      // A stream that never finishes until it is aborted.
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    }));

    const { result } = renderHook(() => useAssistantConversation(base));
    act(() => result.current.send('A long question'));
    await waitFor(() => expect(result.current.busy).toBe(true));

    act(() => result.current.stop());

    expect(result.current.busy).toBe(false);
    const turnId = JSON.parse(calls[0]?.body ?? '{}').turn_id as string;
    expect(turnId).toBeTruthy();
    expect(calls.find((c) => c.method === 'DELETE')?.url).toBe(`/api/proxy/assistant/chat/stream/${turnId}`);
    // A Stop is the person's own doing, never an error reported back at them.
    expect(result.current.error).toBeNull();
  });

  it('with supersede, a question typed mid-answer is sent TOGETHER with the one it interrupts', async () => {
    const bodies: string[] = [];
    vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => {
      if (init.method === 'DELETE') return Promise.resolve(json({}));
      bodies.push(String(init.body));
      if (bodies.length === 1) {
        return new Promise<Response>((_r, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        });
      }

      return Promise.resolve(sse('event: message\ndata: {"conversation_id":"c-4","message":{"id":"a3","role":"assistant","content":"LMIA only."}}\n\n'));
    }));

    const { result } = renderHook(() => useAssistantConversation({ ...base, supersede: true }));
    act(() => result.current.send('Explain the recruitment requirements'));
    await waitFor(() => expect(result.current.busy).toBe(true));
    act(() => result.current.send('actually, LMIA only'));

    await waitFor(() => expect(result.current.messages.at(-1)?.text).toBe('LMIA only.'));
    expect(JSON.parse(bodies[1] ?? '{}').message).toBe('Explain the recruitment requirements\nactually, LMIA only');
  });

  it('without supersede, Enter mid-answer does nothing rather than starting a second turn', async () => {
    const fetchMock = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_r, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useAssistantConversation(base));
    act(() => result.current.send('First'));
    await waitFor(() => expect(result.current.busy).toBe(true));
    act(() => result.current.send('Second'));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.messages.filter((m) => m.role === 'user')).toHaveLength(1);
  });

  it('an explicit Stop drops the question, so it is not folded into the next one', async () => {
    const bodies: string[] = [];
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => {
      if (init.method === 'DELETE') return Promise.resolve(json({}));
      bodies.push(String(init.body));
      if (bodies.length === 1) {
        return new Promise<Response>((_r, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        });
      }

      return Promise.resolve(sse('event: message\ndata: {"conversation_id":"c","message":{"id":"a","role":"assistant","content":"ok"}}\n\n'));
    }));

    const { result } = renderHook(() => useAssistantConversation({ ...base, supersede: true }));
    act(() => result.current.send('Something I withdraw'));
    await waitFor(() => expect(result.current.busy).toBe(true));
    act(() => result.current.stop());
    act(() => result.current.send('A new question'));

    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(JSON.parse(bodies[1] ?? '{}').message).toBe('A new question');
  });

  it('queues a question typed while the thread restores, instead of losing it', async () => {
    let release: (id: string | null) => void = () => undefined;
    const fetchMock = vi.fn(async () =>
      sse('event: message\ndata: {"conversation_id":"c-9","message":{"id":"a9","role":"assistant","content":"Hello again."}}\n\n'),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useAssistantConversation({
      ...base,
      restore: () => new Promise((resolve) => { release = resolve; }),
      loadConversation: async (id) => ({ id, messages: [] }),
    }));

    expect(result.current.ready).toBe(false);
    act(() => result.current.send('Typed straight away'));
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => release(null));

    await waitFor(() => expect(result.current.messages.at(-1)?.text).toBe('Hello again.'));
    expect(result.current.messages[0]?.text).toBe('Typed straight away');
  });

  it('sends the product body on every turn, and has no Stop where there is no cancel route', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json({ data: { conversation_id: 'g', message: answer() } }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useAssistantConversation({
      sendUrl: '/api/proxy/assistant/public/chat',
      toPanelMessage,
      body: () => ({ guest_token: 'tok' }),
    }));

    expect(result.current.canStop).toBe(false);
    act(() => result.current.send('Hi'));
    await waitFor(() => expect(result.current.messages).toHaveLength(2));

    const init = fetchMock.mock.calls[0]?.[1] ?? {};
    expect(JSON.parse(String(init.body)).guest_token).toBe('tok');
  });

  it('shows what the person did while sending what the turn needs, for this turn only', async () => {
    const bodies: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(String(init.body));

      return sse('event: message\ndata: {"conversation_id":"c","message":{"id":"a","role":"assistant","content":"ok"}}\n\n');
    }));

    const { result } = renderHook(() => useAssistantConversation(base));
    act(() => result.current.send('Why will this page not save?', {
      display: 'Shared a redacted snapshot of this page.',
      body: { it_snapshot: { route: '/x' } },
    }));
    await waitFor(() => expect(result.current.busy).toBe(false));

    expect(result.current.messages[0]?.text).toBe('Shared a redacted snapshot of this page.');
    expect(JSON.parse(bodies[0] ?? '{}').it_snapshot).toEqual({ route: '/x' });

    act(() => result.current.send('And now?'));
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(JSON.parse(bodies[1] ?? '{}').it_snapshot).toBeUndefined();
  });

  it('says a question is queued while the thread restores, and says when the restore failed', async () => {
    let fail: (e: Error) => void = () => undefined;
    const onRestoreFailed = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async () =>
      sse('event: message\ndata: {"conversation_id":"c","message":{"id":"a","role":"assistant","content":"ok"}}\n\n'),
    ));

    const { result } = renderHook(() => useAssistantConversation({
      ...base,
      restore: () => new Promise((_resolve, reject) => { fail = reject; }),
      loadConversation: async (id) => ({ id, messages: [] }),
      onRestoreFailed,
    }));

    act(() => result.current.send('Typed early'));
    expect(result.current.queued).toBe(true);

    await act(async () => fail(new Error('gone')));

    await waitFor(() => expect(result.current.queued).toBe(false));
    expect(onRestoreFailed).toHaveBeenCalledTimes(1);
  });
});
