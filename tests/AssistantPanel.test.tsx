import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssistantPanel } from '../src/components/AssistantPanel';
import type { PanelMessage } from '../src/types';

const URL_ = '/api/proxy/assistant/chat/stream';
const CANCEL = '/api/proxy/assistant/chat/stream/{id}';

/** A fetch that answers one SSE body, optionally held open until released. */
function sseFetch(frames: string[], hold = false) {
  let release: (() => void) | undefined;

  const fn = vi.fn(async () => {
    const encoder = new TextEncoder();

    return {
      ok: true,
      status: 200,
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          for (const frame of frames) controller.enqueue(encoder.encode(frame));

          if (hold) {
            release = () => controller.close();
          } else {
            controller.close();
          }
        },
      }),
      json: async () => ({}),
    } as unknown as Response;
  });

  return { fn, release: () => release?.() };
}

beforeEach(() => {
  // jsdom has neither layout nor scrollTo.
  Object.defineProperty(Element.prototype, 'scrollTo', { value: vi.fn(), configurable: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AssistantPanel, uncontrolled', () => {
  /** The acceptance test: ONE prop, a working streamed conversation. */
  it('streams a turn with the url as its only prop', async () => {
    const { fn } = sseFetch([
      'event: open\ndata: {"stream_id":"s1"}\n\n',
      'event: token\ndata: {"text":"The fee "}\n\n',
      'event: token\ndata: {"text":"is $1,365."}\n\n',
      'event: done\ndata: {"text":"The fee is $1,365."}\n\n',
    ]);
    vi.stubGlobal('fetch', fn);

    render(<AssistantPanel url={URL_} />);

    const box = screen.getByLabelText('Ask a question');
    fireEvent.change(box, { target: { value: 'What is the fee?' } });

    await act(async () => {
      screen.getByLabelText('Send').click();
    });

    await waitFor(() => {
      expect(screen.getByText('The fee is $1,365.')).toBeTruthy();
    });

    // The question is in the list too, and the box is empty again.
    expect(screen.getByText('What is the fee?')).toBeTruthy();
    expect((screen.getByLabelText('Ask a question') as HTMLTextAreaElement).value).toBe('');
  });

  it('says so, loudly, when it is given nothing to talk to', () => {
    render(<AssistantPanel />);

    expect(screen.getByRole('alert').textContent).toContain('not configured');
    expect(screen.queryByLabelText('Ask a question')).toBeNull();
  });

  it('offers Stop while a turn runs, and keeps what was already written', async () => {
    const { fn, release } = sseFetch(
      [
        'event: open\ndata: {"stream_id":"s9"}\n\n',
        'event: token\ndata: {"text":"Half an answer"}\n\n',
      ],
      true,
    );
    vi.stubGlobal('fetch', fn);

    render(<AssistantPanel url={URL_} cancelUrl={CANCEL} />);

    const box = screen.getByLabelText('Ask a question');
    fireEvent.change(box, { target: { value: 'Tell me' } });
    await act(async () => {
      screen.getByLabelText('Send').click();
    });

    await waitFor(() => {
      expect(screen.getByText('Half an answer')).toBeTruthy();
    });

    // Send has been REPLACED by Stop, not joined by it.
    expect(screen.queryByLabelText('Send')).toBeNull();

    await act(async () => {
      screen.getByLabelText('Stop').click();
    });

    // The partial answer survives, and the status says what happened.
    expect(screen.getByText('Half an answer')).toBeTruthy();
    expect(screen.getAllByText('You stopped this answer.').length).toBeGreaterThan(0);
    // A deliberate stop is never reported as an error.
    expect(screen.queryByText('Try again')).toBeNull();

    // And the DELETE went out, so the provider stopped billing.
    const deletes = fn.mock.calls.filter(
      (call) => (call[1] as RequestInit | undefined)?.method === 'DELETE',
    );
    expect(deletes.length).toBe(1);

    release();
  });

  it('shows the failure and retries the same question', async () => {
    const failing = sseFetch(['event: error\ndata: {"message":"Every provider refused."}\n\n']);
    vi.stubGlobal('fetch', failing.fn);

    render(<AssistantPanel url={URL_} />);

    const box = screen.getByLabelText('Ask a question');
    fireEvent.change(box, { target: { value: 'Why?' } });
    await act(async () => {
      screen.getByLabelText('Send').click();
    });

    await waitFor(() => {
      expect(screen.getByText('Every provider refused.')).toBeTruthy();
    });

    const succeeding = sseFetch(['event: done\ndata: {"text":"Because the quota ran out."}\n\n']);
    vi.stubGlobal('fetch', succeeding.fn);

    await act(async () => {
      screen.getByText('Try again').click();
    });

    await waitFor(() => {
      expect(screen.getByText('Because the quota ran out.')).toBeTruthy();
    });

    // Retried with the SAME question, without making the user retype it.
    const body = JSON.parse((succeeding.fn.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(body.message).toBe('Why?');
  });

  it('un-paints a discarded rung instead of gluing two half-answers together', async () => {
    const { fn } = sseFetch([
      'event: token\ndata: {"text":"The fee is $900"}\n\n',
      'event: discard\ndata: {}\n\n',
      'event: token\ndata: {"text":"The fee is $1,365."}\n\n',
      'event: done\ndata: {"text":"The fee is $1,365."}\n\n',
    ]);
    vi.stubGlobal('fetch', fn);

    render(<AssistantPanel url={URL_} />);

    const box = screen.getByLabelText('Ask a question');
    fireEvent.change(box, { target: { value: 'Fee?' } });
    await act(async () => {
      screen.getByLabelText('Send').click();
    });

    await waitFor(() => {
      expect(screen.getByText('The fee is $1,365.')).toBeTruthy();
    });

    expect(screen.queryByText(/\$900/)).toBeNull();
    // And exactly one assistant answer, not the live row plus a settled copy.
    expect(screen.getAllByText('The fee is $1,365.').length).toBe(1);
  });

  it('never sends an empty turn', async () => {
    const { fn } = sseFetch(['event: done\ndata: {}\n\n']);
    vi.stubGlobal('fetch', fn);

    render(<AssistantPanel url={URL_} />);

    const send = screen.getByLabelText('Send') as HTMLButtonElement;
    expect(send.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Ask a question'), { target: { value: '   ' } });

    expect((screen.getByLabelText('Send') as HTMLButtonElement).disabled).toBe(true);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('AssistantPanel, controlled', () => {
  const messages: PanelMessage[] = [
    { id: 'm1', role: 'user', text: 'Can I bring my spouse?' },
    { id: 'm2', role: 'assistant', text: 'Yes - as an **accompanying** spouse.' },
  ];

  it('renders the product list and hands sends back to the product', async () => {
    const onSend = vi.fn();
    render(<AssistantPanel messages={messages} onSend={onSend} />);

    expect(screen.getByText('Can I bring my spouse?')).toBeTruthy();
    expect(screen.getByText('accompanying')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Ask a question'), {
      target: { value: 'And my children?' },
    });
    await act(async () => {
      screen.getByLabelText('Send').click();
    });

    expect(onSend).toHaveBeenCalledWith('And my children?');
  });

  it('needs no url, because the product owns the turn', () => {
    render(<AssistantPanel messages={[]} onSend={vi.fn()} />);

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByLabelText('Ask a question')).toBeTruthy();
  });

  it('shows the product stage while busy and calls its own stop', async () => {
    const onStop = vi.fn();
    render(
      <AssistantPanel messages={messages} onSend={vi.fn()} busy stage="Asking groq" onStop={onStop} />,
    );

    expect(screen.getAllByText('Asking groq').length).toBeGreaterThan(0);

    await act(async () => {
      screen.getByLabelText('Stop').click();
    });

    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('lets a product replace every slot', () => {
    render(
      <AssistantPanel
        messages={messages}
        onSend={vi.fn()}
        header={<h2>Porter</h2>}
        footer={<small>Porter can be wrong.</small>}
        renderBubble={(message) => <p data-testid="own-bubble">{message.role}</p>}
        renderComposer={({ onSend }) => (
          <button type="button" data-testid="own-composer" onClick={onSend}>
            own composer
          </button>
        )}
      />,
    );

    expect(screen.getByText('Porter')).toBeTruthy();
    expect(screen.getByText('Porter can be wrong.')).toBeTruthy();
    expect(screen.getAllByTestId('own-bubble').length).toBe(2);
    expect(screen.getByTestId('own-composer')).toBeTruthy();
    // The package's own composer is gone, not hidden behind the override.
    expect(screen.queryByLabelText('Ask a question')).toBeNull();
  });

  it('shows the empty slot only while there is nothing to read', () => {
    const { rerender } = render(
      <AssistantPanel messages={[]} onSend={vi.fn()} renderEmpty={() => <p>Ask me anything.</p>} />,
    );

    expect(screen.getByText('Ask me anything.')).toBeTruthy();

    rerender(
      <AssistantPanel
        messages={messages}
        onSend={vi.fn()}
        renderEmpty={() => <p>Ask me anything.</p>}
      />,
    );

    expect(screen.queryByText('Ask me anything.')).toBeNull();
  });

  /** A user's own words are never re-interpreted as Markdown. */
  it('renders a user message literally', () => {
    render(
      <AssistantPanel
        messages={[{ id: 'u1', role: 'user', text: 'Is **IRCC** the right word?' }]}
        onSend={vi.fn()}
      />,
    );

    expect(screen.getByText('Is **IRCC** the right word?')).toBeTruthy();
  });

  it('marks the list busy for assistive technology', () => {
    const { rerender } = render(<AssistantPanel messages={messages} onSend={vi.fn()} />);

    expect(screen.getByRole('log').getAttribute('aria-busy')).toBe('false');

    rerender(<AssistantPanel messages={messages} onSend={vi.fn()} busy />);
    expect(screen.getByRole('log').getAttribute('aria-busy')).toBe('true');
  });
});
