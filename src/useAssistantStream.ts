import { useCallback, useRef, useState } from 'react';
import { isAbortError, readSseFrames } from './sse';
import {
  DEFAULT_EVENT_NAMES,
  type AssistantTurnState,
  type StreamEventNames,
  type ToolTrailEntry,
} from './types';

export interface AssistantStreamOptions {
  /**
   * The PRODUCT's own route, never ai-service.
   *
   * ⚠ ai-service IS LOOPBACK-ONLY AND MUST STAY SO: it holds every AI provider
   * key in the estate. A browser cannot reach it and must not be able to. This
   * hook therefore talks to a route in the product, which proxies the turn
   * server-side with its own trust key.
   */
  url: string;

  /** DELETE here to stop a turn server-side. `{id}` is replaced by the stream id. */
  cancelUrl?: string;

  /** Extra headers - an Authorization token, a CSRF header. */
  headers?: () => Record<string, string>;

  /** What the product's route calls each event. Defaults to the service's names. */
  events?: StreamEventNames;

  /** Called for every token, for a product that wants to do its own painting. */
  onToken?: (text: string) => void;

  /** Called once on a terminal event, with whatever it carried. */
  onDone?: (payload: Record<string, unknown>, text: string) => void;

  onError?: (message: string) => void;
}

const IDLE: AssistantTurnState = {
  phase: 'idle',
  text: '',
  stage: null,
  streamId: null,
  error: null,
  payload: null,
  tools: [],
};

/**
 * One streamed assistant turn, and a stop that really stops.
 *
 * ```tsx
 * const turn = useAssistantStream({ url: '/api/proxy/assistant/chat/stream', cancelUrl: '/api/proxy/assistant/chat/stream/{id}' });
 *
 * await turn.ask({ message, conversation_id: id });
 * turn.state.text        // the answer so far
 * turn.stop();           // local state, then abort, then DELETE
 * ```
 *
 * ⚠ `discard` IS THE EVENT EVERY CONSUMER FORGETS, AND IT CORRUPTS THE ANSWER.
 * The waterfall can fail a rung AFTER emitting tokens: the provider dies
 * mid-sentence and the next rung starts the answer over. A consumer that keeps
 * appending ends up showing two different half-answers glued together, with no
 * indication that anything went wrong - which is worse than an error, because
 * it reads as finished prose. This hook resets `text` to '' and that is the
 * whole reason it is worth sharing.
 *
 * ⚠ STOP IS THREE THINGS IN THIS ORDER, and the order is the point:
 *   1. local state, so the UI stops immediately and the user is believed;
 *   2. abort the fetch, so this tab stops receiving;
 *   3. DELETE the stream, so the PROVIDER stops generating and billing.
 * Doing (3) first means the user waits on a round trip to be told their own
 * click worked. Skipping (3) means the spinner stops and the money does not.
 */
export function useAssistantStream(options: AssistantStreamOptions) {
  const [state, setState] = useState<AssistantTurnState>(IDLE);

  const controllerRef = useRef<AbortController | null>(null);
  /**
   * ⚠ A REF AS WELL AS STATE, because `stop()` needs the id SYNCHRONOUSLY and
   * React state is a render behind. Stopping a turn whose open event arrived in
   * the same tick would otherwise send no DELETE at all, and the provider would
   * keep generating for a turn nobody is watching.
   */
  const streamIdRef = useRef<string | null>(null);
  const textRef = useRef('');

  const names = { ...DEFAULT_EVENT_NAMES, ...(options.events ?? {}) };

  const reset = useCallback(() => {
    textRef.current = '';
    streamIdRef.current = null;
    setState(IDLE);
  }, []);

  const stop = useCallback(() => {
    // 1. The user is believed first.
    setState((prev) =>
      prev.phase === 'thinking' || prev.phase === 'writing' ? { ...prev, phase: 'stopped' } : prev,
    );

    // 2. This tab stops listening.
    controllerRef.current?.abort();
    controllerRef.current = null;

    // 3. And the provider stops generating.
    const id = streamIdRef.current;

    if (id && options.cancelUrl) {
      const url = options.cancelUrl.replace('{id}', encodeURIComponent(id));

      void fetch(url, {
        method: 'DELETE',
        headers: options.headers?.() ?? {},
        /*
         * ⚠ `keepalive` SO A CLOSING TAB STILL STOPS THE SPEND. Navigating away
         * is the most common way a turn is abandoned, and without this the
         * request is cancelled with the page - leaving the provider generating
         * an answer nobody will ever see.
         */
        keepalive: true,
        // A failed cancel is deliberately swallowed: the user has already been
        // told the turn stopped, and an error here would either resurrect their
        // spinner or report a failure for something they did on purpose.
      }).catch(() => undefined);
    }

    streamIdRef.current = null;
  }, [options]);

  const ask = useCallback(
    async (body: Record<string, unknown>): Promise<boolean> => {
      controllerRef.current?.abort();

      const controller = new AbortController();
      controllerRef.current = controller;

      textRef.current = '';
      streamIdRef.current = null;
      setState({ ...IDLE, phase: 'thinking' });

      let sawTerminal = false;

      try {
        const response = await fetch(options.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
            ...(options.headers?.() ?? {}),
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          // A refusal (a gate off, validation, auth) arrives as ordinary JSON,
          // not as SSE, so there is no stream to read.
          const message = await refusalMessage(response);
          setState((prev) => ({ ...prev, phase: 'failed', error: message }));
          options.onError?.(message);

          return false;
        }

        for await (const frame of readSseFrames(response.body, controller.signal)) {
          if (frame.event === names.open) {
            const id = typeof frame.data.stream_id === 'string' ? frame.data.stream_id : null;
            streamIdRef.current = id;
            setState((prev) => ({ ...prev, streamId: id }));
            continue;
          }

          if (frame.event === names.stage) {
            const label =
              typeof frame.data.label === 'string'
                ? frame.data.label
                : typeof frame.data.provider === 'string'
                  ? frame.data.provider
                  : null;

            setState((prev) => ({ ...prev, stage: label }));
            continue;
          }

          if (frame.event === names.token) {
            const text = typeof frame.data.text === 'string' ? frame.data.text : '';
            if (text === '') continue;

            textRef.current += text;
            const next = textRef.current;
            setState((prev) => ({ ...prev, phase: 'writing', text: next }));
            options.onToken?.(text);
            continue;
          }

          if (frame.event === names.discard) {
            /*
             * ⚠ UN-PAINT EVERYTHING. The abandoned rung's half-answer is
             * already on screen and the next rung is about to start over.
             */
            textRef.current = '';
            setState((prev) => ({ ...prev, phase: 'thinking', text: '' }));
            continue;
          }

          if (frame.event === names.error) {
            const message =
              typeof frame.data.message === 'string'
                ? frame.data.message
                : 'The assistant could not answer that.';

            sawTerminal = true;
            setState((prev) => ({ ...prev, phase: 'failed', error: message }));
            options.onError?.(message);
            break;
          }

          if (frame.event === names.done) {
            sawTerminal = true;

            /*
             * ⚠ THE TERMINAL EVENT'S TEXT WINS OVER THE ACCUMULATED TOKENS when
             * it has one. A provider can emit tokens that differ from its final
             * answer (a repaired JSON field, a trimmed ending), and showing the
             * accumulation then leaves the user reading something the model did
             * not finally say.
             */
            const finalText =
              typeof frame.data.text === 'string' && frame.data.text !== ''
                ? frame.data.text
                : textRef.current;

            textRef.current = finalText;

            setState((prev) => ({
              ...prev,
              phase: 'done',
              text: finalText,
              payload: frame.data,
              tools: toolTrail(frame.data),
            }));

            options.onDone?.(frame.data, finalText);
            break;
          }
        }

        if (!sawTerminal) {
          /*
           * ⚠ A STREAM THAT ENDED WITHOUT A TERMINAL EVENT DID NOT FINISH, and
           * reporting it as success is how a user acts on half an answer: the
           * paragraph simply stops, and a truncated sentence reads as a
           * complete one often enough to matter. Fail loudly.
           */
          const message = 'The answer stopped before it was finished.';
          setState((prev) => ({ ...prev, phase: 'failed', error: message }));
          options.onError?.(message);

          return false;
        }

        return true;
      } catch (error) {
        if (isAbortError(error)) {
          // The viewer pressed stop. `stop()` has already set the phase, and
          // overwriting it with an error would report their own click as a fault.
          return false;
        }

        const message = error instanceof Error ? error.message : 'The assistant could not be reached.';
        setState((prev) => ({ ...prev, phase: 'failed', error: message }));
        options.onError?.(message);

        return false;
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
        }
      }
    },
    [names.discard, names.done, names.error, names.open, names.stage, names.token, options],
  );

  return {
    state,
    ask,
    stop,
    reset,
    isBusy: state.phase === 'thinking' || state.phase === 'writing',
  };
}

async function refusalMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();

    if (typeof body === 'object' && body !== null) {
      const message = (body as { message?: unknown }).message;
      if (typeof message === 'string' && message !== '') return message;
    }
  } catch {
    // Not JSON. Fall through to the status, which is still better than silence.
  }

  return `The assistant could not start that turn (HTTP ${response.status}).`;
}

/** The tool trail, when the product's terminal event reports one. */
function toolTrail(data: Record<string, unknown>): ToolTrailEntry[] {
  const raw = data.tools ?? data.trail;

  if (!Array.isArray(raw)) return [];

  return raw.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return [];

    const name = (entry as { name?: unknown }).name;
    const outcome = (entry as { outcome?: unknown }).outcome;

    if (typeof name !== 'string') return [];

    return [
      {
        name,
        outcome: typeof outcome === 'string' ? (outcome as ToolTrailEntry['outcome']) : 'ran',
        error: typeof (entry as { error?: unknown }).error === 'string'
          ? ((entry as { error: string }).error)
          : undefined,
      },
    ];
  });
}
