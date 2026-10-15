import { useCallback, useRef, useState } from 'react';
import { isAbortError } from './sse';

/**
 * A stop that really stops, for a product that runs its OWN turn loop.
 *
 * ⚠ WHY THIS EXISTS BESIDE `useAssistantStream`, WHICH ALREADY STOPS CORRECTLY.
 * The hook that owns the whole turn is the right answer for a new assistant and
 * the wrong one for an existing panel: a mature panel's turn is a query-library
 * mutation with retry disabled for a specific reason, with its own history
 * cache and its own persistence, and asking it to hand all of that to a package
 * in order to get a correct Stop is how an adoption becomes a rewrite and never
 * happens. So the cancel discipline is extractable on its own. A product keeps its turn loop,
 * passes the signal to its own fetch, and gets the ordering right by default.
 *
 * ⚠ THE ORDER IS THE WHOLE POINT, and each step fails differently:
 *   1. LOCAL STATE, on the same tick as the click. A Stop that waits for the
 *      network is a Stop the user presses twice, because nothing on screen
 *      acknowledged the first press.
 *   2. ABORT the fetch, so this tab stops receiving tokens it will not show.
 *   3. DELETE the stream, so the PROVIDER stops generating - and stops billing.
 *      Hanging up alone leaves the work happening, nobody reading it, and the
 *      money spent. This estate shipped step 2 without step 3 for a release.
 *
 * ```tsx
 * const cancel = useTurnCancel({
 *   cancelUrl: '/api/proxy/assistant/chat/stream/{id}',
 *   headers: () => ({ Authorization: `Bearer ${token}` }),
 *   onStop: () => { setStreamingText(''); setStage(null); },
 * });
 *
 * const controller = cancel.startTurn();
 * // ... fetch(url, { signal: controller.signal }) ...
 * // ... on the stream's open frame: cancel.trackTurn(data.stream_id) ...
 * // ... in a finally: cancel.endTurn() ...
 *
 * {cancel.isStoppable ? <StopButton onStop={cancel.stop} /> : null}
 * ```
 */
export interface TurnCancelOptions {
  /**
   * The PRODUCT's own cancel route. `{id}` is replaced by the tracked stream id.
   *
   * ⚠ NEVER ai-service DIRECTLY. The service holds every provider key in the
   * estate and is loopback-only by design, so a browser cannot reach it and
   * must not be able to. The product proxies the DELETE with its trust key.
   *
   * Omitting it leaves steps 1 and 2 working and step 3 absent, which is a
   * deliberate option for a product whose backend has no cancel route YET -
   * but it means a stopped turn keeps generating and keeps billing, so it is
   * a staging post, not a destination.
   */
  cancelUrl?: string;

  /** Extra headers for the DELETE - an Authorization token, a CSRF header. */
  headers?: () => Record<string, string>;

  /**
   * Wipe whatever the turn had painted so far. Called SYNCHRONOUSLY, before
   * any network call, because this is step 1 and step 1 is what the user sees.
   */
  onStop?: () => void;
}

export interface TurnCancel {
  /**
   * Call this immediately before sending a turn. It aborts any turn still in
   * flight (so a second question never leaves two streams running against one
   * panel) and returns the controller whose signal the product passes to fetch.
   */
  startTurn: () => AbortController;

  /**
   * Record the id the server cancels by, the moment the stream reports it.
   *
   * ⚠ IT IS HELD IN A REF AS WELL AS STATE, because `stop()` needs the id
   * SYNCHRONOUSLY and React state is a render behind. A turn stopped in the
   * same tick its open frame arrived would otherwise send no DELETE at all,
   * and the provider would keep generating for a turn nobody is watching.
   */
  trackTurn: (streamId: string | null) => void;

  /** The three steps, in order. A no-op when there is no turn to stop. */
  stop: () => void;

  /**
   * Call in the turn's `finally`. It clears the tracked id and hides the Stop
   * control, without disturbing `wasStopped`.
   */
  endTurn: () => void;

  /** True while a turn is running, so a product knows when to offer Stop. */
  isStoppable: boolean;

  /**
   * True when the turn that just ended ended because the viewer stopped it.
   *
   * ⚠ READ IT BEFORE REPORTING AN ERROR. An aborted fetch rejects, and a
   * product that reports every rejection tells the user their own deliberate
   * click was a failure.
   */
  wasStopped: boolean;

  /** Does this rejection mean the viewer pressed stop, rather than a fault? */
  isStopError: (error: unknown) => boolean;
}

export function useTurnCancel(options: TurnCancelOptions = {}): TurnCancel {
  const [isStoppable, setIsStoppable] = useState(false);
  const [wasStopped, setWasStopped] = useState(false);

  const controllerRef = useRef<AbortController | null>(null);
  const streamIdRef = useRef<string | null>(null);

  /*
   * ⚠ OPTIONS IN A REF SO EVERY RETURNED CALLBACK IS STABLE. `stop` goes
   * straight into a product's dependency arrays and onto a button; if its
   * identity changed whenever an inline `onStop` closure was re-created, every
   * effect watching it would re-run on every render of the panel.
   */
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const startTurn = useCallback((): AbortController => {
    controllerRef.current?.abort();

    const controller = new AbortController();
    controllerRef.current = controller;
    streamIdRef.current = null;

    setIsStoppable(true);
    setWasStopped(false);

    return controller;
  }, []);

  const trackTurn = useCallback((streamId: string | null) => {
    streamIdRef.current = streamId !== '' ? streamId : null;
  }, []);

  const endTurn = useCallback(() => {
    controllerRef.current = null;
    streamIdRef.current = null;
    setIsStoppable(false);
  }, []);

  const stop = useCallback(() => {
    /*
     * ⚠ NOTHING RUNNING MEANS NOTHING TO DO. A panel that binds Stop to Escape
     * would otherwise wipe a finished answer off the screen and fire a DELETE
     * for a stream id that is already spent.
     */
    if (!controllerRef.current && !streamIdRef.current) return;

    const { cancelUrl, headers, onStop } = optionsRef.current;
    const id = streamIdRef.current;

    // 1. The user is believed, on this tick.
    setIsStoppable(false);
    setWasStopped(true);
    onStop?.();

    // 2. This tab stops listening.
    controllerRef.current?.abort();
    controllerRef.current = null;
    streamIdRef.current = null;

    // 3. And the provider stops generating, which is where the money is.
    if (id && cancelUrl) {
      void fetch(cancelUrl.replace('{id}', encodeURIComponent(id)), {
        method: 'DELETE',
        headers: headers?.() ?? {},
        /*
         * ⚠ `keepalive` SO A CLOSING TAB STILL STOPS THE SPEND. Navigating away
         * is the commonest way a turn is abandoned, and without this the
         * request dies with the page - leaving the provider generating an
         * answer nobody will ever read, and charging for it.
         */
        keepalive: true,
        /*
         * A failed cancel is deliberately swallowed. The user has already been
         * told the turn stopped; an error here would either resurrect their
         * spinner or report a failure for something they did on purpose.
         */
      }).catch(() => undefined);
    }
  }, []);

  return {
    startTurn,
    trackTurn,
    stop,
    endTurn,
    isStoppable,
    wasStopped,
    isStopError: isAbortError,
  };
}
