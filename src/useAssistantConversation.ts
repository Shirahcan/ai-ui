import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readSseFrames, isAbortError } from './sse';
import type { PanelMessage } from './types';

/**
 * A whole conversation's turn loop, for any product (P19d).
 *
 * ⚠ IT EXISTS BECAUSE THE PANEL WAS SHARED AND THE BEHAVIOUR BEHIND IT WAS NOT. After P18 every
 * product drew the same panel, while streaming, Stop, retry-without-retyping, queue-while-restoring
 * and supersede lived in ~900 hand-written lines inside Porter's panel and nowhere else. Mira had
 * none of them. The same component on screen behaved differently underneath, and P18's parity
 * test could not see it, because it tests geometry.
 *
 * ⚠ THE PRODUCT SUPPLIES ROUTES AND A MAPPER, NOTHING ELSE. Where its turn, stream and cancel
 * routes are, and how its own message shape becomes a `PanelMessage`. Everything a person
 * experiences - what Enter does mid-answer, what Stop does, what a failure offers - is decided here
 * once.
 *
 * ⚠ IT NEVER CALLS ai-service. Every URL is the PRODUCT's own route, which proxies the turn with
 * the product's trust key. The service is loopback-only.
 */
export interface AssistantConversationOptions {
  /** POST, JSON: the buffered turn. Always required - it is the fallback for everything. */
  sendUrl: string;
  /**
   * POST, SSE: the streamed turn. A 404 means "not enabled here" and falls back to `sendUrl`, so
   * the product's gate is the only place streaming is switched on or off.
   */
  streamUrl?: string;
  /** DELETE: stop a turn for real. Given the client-minted turn id. Omit it and there is no Stop. */
  cancelUrl?: (turnId: string) => string;
  /** Extra headers on every request (a CSRF token, a bearer). */
  headers?: () => Record<string, string>;
  /** Merged into every turn body (a guest token, a page context). */
  body?: () => Record<string, unknown>;
  /** A product message (from a turn or a reload) as the panel draws it. */
  toPanelMessage: (raw: unknown) => PanelMessage;
  /** Re-open a thread: from history, or the one this person was last in. */
  loadConversation?: (id: string) => Promise<{ id: string; messages: unknown[] }>;
  /** The thread to reopen on mount, if any. Resolving to null means "start empty". */
  restore?: () => Promise<string | null>;
  /**
   * Enter mid-answer folds the new text INTO the running question and asks again.
   *
   * ⚠ OFF BY DEFAULT, because a product whose backend cannot take two questions as one would
   * start a second turn into one message list. Porter's can, and promises it in its knowledge
   * base ("actually, LMIA only").
   */
  supersede?: boolean;
  /** SSE event names, when the product's route speaks its own dialect. */
  events?: { stage?: string; token?: string; reset?: string; message?: string; error?: string };
  /** The thread to restore could not be opened, so the panel started empty. Say so. */
  onRestoreFailed?: () => void;
  /** Called with every finished assistant message, e.g. to refresh a history list. */
  onAnswer?: (raw: unknown, conversationId: string) => void;
  /**
   * A bot check (Cloudflare Turnstile) on the FIRST turn of a thread, for a panel anybody on the
   * internet can reach. Pass `conversation.humanCheck` to `AssistantChat` and it draws the widget.
   *
   * ⚠ AN EMPTY `siteKey` TURNS IT OFF, deliberately: that is local and dev, where the backend
   * skips verification to match. A missing key must never strand a question in a queue.
   */
  humanCheck?: { siteKey: string; field?: string };
}

/** What `AssistantChat` needs to draw the bot check. */
export interface AssistantHumanCheck {
  siteKey: string;
  onToken: (token: string) => void;
  resetSignal: number;
  /** A question is held until the check passes; it sends itself the moment it does. */
  waiting: boolean;
}

export interface AssistantConversation {
  messages: PanelMessage[];
  conversationId: string | null;
  busy: boolean;
  stage: string | null;
  error: string | null;
  /** False until a restore has settled; a question typed before then is queued, never lost. */
  ready: boolean;
  /** A question is waiting for the restore to settle - worth telling the person. */
  queued: boolean;
  /** Whether Stop does anything here. */
  canStop: boolean;
  /** Hand this to `AssistantChat`. Undefined when the product asked for no check. */
  humanCheck: AssistantHumanCheck | undefined;
  /**
   * Ask. `display` is what the person's row shows when it differs from what is sent, and `body`
   * is merged into this one turn only (a consented snapshot, say) - never into the next.
   */
  send: (text: string, turn?: AssistantTurnOptions) => void;
  stop: () => void;
  /** Re-send the question that failed, without the person retyping it. Undefined when none failed. */
  retry: (() => void) | undefined;
  startNew: () => void;
  open: (id: string) => Promise<void>;
  /** Drop the open thread when it is deleted elsewhere (from history). */
  forget: (id: string) => void;
}

/** Per-turn options for `send()`. */
export interface AssistantTurnOptions {
  /** The person's row shows this instead of the text sent, e.g. "Shared a snapshot of this page". */
  display?: string;
  /** Merged into this turn's request only. */
  body?: Record<string, unknown>;
}

const EVENTS = { stage: 'stage', token: 'token', reset: 'reset', message: 'message', error: 'error' };

const PREVIEW_ID = 'aiui-streaming-preview';

let seq = 0;
const localId = (): string => `local-${Date.now()}-${++seq}`;

function mintTurnId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `turn-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** `{ data: {...} }` or the bare object: products wrap their replies differently. */
function unwrap(payload: unknown): Record<string, unknown> {
  if (typeof payload !== 'object' || payload === null) return {};
  const p = payload as Record<string, unknown>;
  const data = p.data;

  return typeof data === 'object' && data !== null && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : p;
}

async function refusal(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown };
    if (typeof body.message === 'string' && body.message.trim() !== '') return body.message;
  } catch {
    /* not JSON */
  }

  return response.status === 429
    ? "You've sent a lot of messages - please wait a moment and try again."
    : "The assistant couldn't answer that just now. Your question is saved - press Retry.";
}

export function useAssistantConversation(options: AssistantConversationOptions): AssistantConversation {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [rows, setRows] = useState<PanelMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [ready, setReady] = useState(options.restore === undefined);

  const conversationRef = useRef<string | null>(null);
  conversationRef.current = conversationId;
  const controllerRef = useRef<AbortController | null>(null);
  const turnRef = useRef<string | null>(null);
  // Questions the person asked that have not been answered yet - what supersede folds together.
  const pendingRef = useRef<string[]>([]);
  const queuedRef = useRef<string | null>(null);
  const [queued, setQueued] = useState(false);

  /*
   * ⚠ THE TOKEN IS SINGLE-USE AND RIDES THE FIRST TURN ONLY. Once a thread exists the server has
   * already met this visitor. A token is spent the moment it is sent, so it is cleared and a fresh
   * challenge is asked for straight away - otherwise a Retry of a failed first turn would carry
   * a spent token and be refused.
   */
  const checkKey = options.humanCheck?.siteKey ?? '';
  const [checkToken, setCheckToken] = useState('');
  const checkTokenRef = useRef('');
  const [checkReset, setCheckReset] = useState(0);
  const needsCheck = useCallback(
    () => (optionsRef.current.humanCheck?.siteKey ?? '') !== '' && conversationRef.current === null,
    [],
  );
  const onCheckToken = useCallback((token: string) => {
    checkTokenRef.current = token;
    setCheckToken(token);
  }, []);
  /** The token for this turn, spent as it is read. */
  const spendCheck = useCallback((): Record<string, unknown> => {
    if (!needsCheck()) return {};
    const token = checkTokenRef.current;
    checkTokenRef.current = '';
    setCheckToken('');
    setCheckReset((n) => n + 1);

    return { [optionsRef.current.humanCheck?.field ?? 'turnstile_token']: token };
  }, [needsCheck]);

  const names = { ...EVENTS, ...(options.events ?? {}) };

  const json = useCallback((extra: Record<string, unknown> = {}) => ({
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(optionsRef.current.headers?.() ?? {}),
    ...extra,
  }), []);

  const settle = useCallback((raw: unknown, threadId: string | null) => {
    if (threadId) setConversationId(threadId);
    if (raw) {
      setRows((prev) => [...prev, optionsRef.current.toPanelMessage(raw)]);
      optionsRef.current.onAnswer?.(raw, threadId ?? conversationRef.current ?? '');
    }
    pendingRef.current = [];
    setFailed(null);
  }, []);

  const fail = useCallback((message: string, question: string) => {
    setError(message);
    setFailed(question);
  }, []);

  /** The buffered turn: the fallback for everything, and the whole path where nothing streams. */
  const buffered = useCallback(async (question: string, signal: AbortSignal, turnBody: Record<string, unknown> = {}) => {
    const o = optionsRef.current;
    const response = await fetch(o.sendUrl, {
      method: 'POST',
      credentials: 'same-origin',
      headers: json(),
      body: JSON.stringify({ message: question, conversation_id: conversationRef.current, ...(o.body?.() ?? {}), ...turnBody }),
      signal,
    });

    if (!response.ok) {
      fail(await refusal(response), question);

      return;
    }

    const data = unwrap(await response.json());
    settle(data.message ?? null, typeof data.conversation_id === 'string' ? data.conversation_id : null);
  }, [fail, json, settle]);

  /**
   * The streamed turn. Returns false when the route is not there (a 404, the gate is off), so the
   * caller falls back to the buffered POST without the person seeing anything but the answer.
   */
  const streamed = useCallback(async (question: string, turnId: string, signal: AbortSignal, turnBody: Record<string, unknown> = {}): Promise<boolean> => {
    const o = optionsRef.current;
    if (!o.streamUrl) return false;

    const response = await fetch(o.streamUrl, {
      method: 'POST',
      credentials: 'same-origin',
      headers: json({ Accept: 'text/event-stream' }),
      body: JSON.stringify({
        message: question,
        conversation_id: conversationRef.current,
        turn_id: turnId,
        ...(o.body?.() ?? {}),
        ...turnBody,
      }),
      signal,
    });

    if (response.status === 404 || !response.body) return false;

    if (!response.ok) {
      fail(await refusal(response), question);

      return true;
    }

    let finished = false;

    for await (const frame of readSseFrames(response.body, signal)) {
      if (frame.event === names.stage) {
        setStage(typeof frame.data.label === 'string' ? frame.data.label : null);
      } else if (frame.event === names.token) {
        const text = typeof frame.data.text === 'string' ? frame.data.text : '';
        if (text !== '') setPreview((prev) => prev + text);
      } else if (frame.event === names.reset) {
        // ⚠ A rung died mid-sentence and the next restarts the answer; gluing them is two half-answers.
        setPreview('');
      } else if (frame.event === names.error) {
        finished = true;
        fail(typeof frame.data.message === 'string' ? frame.data.message : 'The assistant could not answer that.', question);
        break;
      } else if (frame.event === names.message) {
        finished = true;
        const threadId = typeof frame.data.conversation_id === 'string' ? frame.data.conversation_id : null;
        settle(frame.data.cancelled === true ? null : (frame.data.message ?? null), threadId);
        break;
      }
    }

    /*
     * ⚠ A STREAM THAT ENDED WITHOUT A TERMINAL EVENT IS A FAILURE, NOT A SUCCESS. Treating it as
     * done leaves a truncated paragraph that reads as finished, and the reader acts on half an answer.
     */
    if (!finished && !signal.aborted) {
      fail('The answer was cut off before it finished. Your question is saved - press Retry.', question);
    }

    return true;
  }, [fail, json, names.error, names.message, names.reset, names.stage, names.token, settle]);

  const run = useCallback(async (question: string, extraBody: Record<string, unknown> = {}) => {
    const turnBody = { ...extraBody, ...spendCheck() };
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const turnId = mintTurnId();
    turnRef.current = turnId;

    setBusy(true);
    setError(null);
    setStage(null);
    setPreview('');

    try {
      const handled = await streamed(question, turnId, controller.signal, turnBody);
      if (!handled && !controller.signal.aborted) {
        setPreview('');
        await buffered(question, controller.signal, turnBody);
      }
    } catch (e) {
      // The person's own Stop is not a failure to report back at them.
      if (!isAbortError(e) && !controller.signal.aborted) {
        fail("I couldn't reach the assistant just now. Your question is saved - press Retry.", question);
      }
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        turnRef.current = null;
        setBusy(false);
        setStage(null);
        setPreview('');
      }
    }
  }, [buffered, fail, spendCheck, streamed]);

  /**
   * Stop: for the person immediately, and for real on the server.
   *
   * ⚠ LOCAL STATE FIRST, NETWORK AFTER. The panel settles on the same tick as the click; a Stop
   * that waits for the network is a Stop the person presses twice. And the DELETE is the point:
   * hanging up alone leaves the provider generating, and billing, an answer nobody will read.
   */
  const halt = useCallback((keepPending: boolean) => {
    const turnId = turnRef.current;
    /*
     * ⚠ AN EXPLICIT STOP DROPS THE QUESTION FROM WHAT IS STILL PENDING; A SUPERSEDE KEEPS IT.
     * Stop means "I no longer want that"; typing over an answer means "and also this". Folding a
     * question the person abandoned into their next one would answer something they withdrew.
     */
    if (!keepPending) pendingRef.current = [];
    controllerRef.current?.abort();
    controllerRef.current = null;
    turnRef.current = null;
    setBusy(false);
    setStage(null);
    setPreview('');

    const cancelUrl = optionsRef.current.cancelUrl;
    if (turnId && cancelUrl) {
      void fetch(cancelUrl(turnId), {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: json(),
        body: JSON.stringify(optionsRef.current.body?.() ?? {}),
        keepalive: true,
      }).catch(() => undefined);
    }
  }, [json]);

  const stop = useCallback(() => halt(false), [halt]);

  const send = useCallback((raw: string, turn: AssistantTurnOptions = {}) => {
    const text = raw.trim();
    if (text === '') return;

    // ⚠ A QUESTION TYPED WHILE THE THREAD RESTORES, OR BEFORE THE BOT CHECK PASSES, IS QUEUED,
    // NOT DISCARDED. It sends itself when the wait is over; nobody presses Send twice.
    if (!ready || (needsCheck() && checkTokenRef.current === '')) {
      queuedRef.current = text;
      setQueued(true);

      return;
    }

    if (controllerRef.current) {
      if (!optionsRef.current.supersede) return;
      halt(true);
    }

    pendingRef.current = [...pendingRef.current, text];
    setRows((prev) => [...prev, { id: localId(), role: 'user', text: turn.display ?? text }]);

    // Both questions go to the model together, and the turn resolves which one stands.
    const question = pendingRef.current.filter((q, i, all) => all.indexOf(q) === i).join('\n');
    void run(question, turn.body ?? {});
  }, [halt, needsCheck, ready, run]);

  const retry = useMemo(
    () => (failed !== null && !busy
      ? () => {
          setError(null);
          // A failed FIRST turn spent its token; wait for the fresh one rather than be refused.
          if (needsCheck() && checkTokenRef.current === '') {
            queuedRef.current = failed;
            setQueued(true);
            setRows((prev) => prev.slice(0, -1));

            return;
          }
          void run(failed);
        }
      : undefined),
    [busy, failed, needsCheck, run],
  );

  const startNew = useCallback(() => {
    stop();
    pendingRef.current = [];
    setRows([]);
    setConversationId(null);
    setError(null);
    setFailed(null);
  }, [stop]);

  const open = useCallback(async (id: string) => {
    const load = optionsRef.current.loadConversation;
    if (!load) return;
    stop();
    setReady(false);
    try {
      const thread = await load(id);
      setConversationId(thread.id);
      setRows(thread.messages.map((m) => optionsRef.current.toPanelMessage(m)));
      setError(null);
      setFailed(null);
    } catch {
      setError('Could not open that conversation. Please try again.');
    } finally {
      setReady(true);
    }
  }, [stop]);

  const forget = useCallback((id: string) => {
    if (id === conversationRef.current) startNew();
  }, [startNew]);

  // Restore the thread this person was last in. Until it settles, questions are queued.
  useEffect(() => {
    const restore = optionsRef.current.restore;
    if (!restore) return;
    let cancelled = false;

    restore()
      .then(async (id) => {
        if (cancelled || !id) return;
        const load = optionsRef.current.loadConversation;
        if (!load) return;
        const thread = await load(id);
        if (cancelled) return;
        setConversationId(thread.id);
        setRows(thread.messages.map((m) => optionsRef.current.toPanelMessage(m)));
      })
      .catch(() => {
        if (!cancelled) optionsRef.current.onRestoreFailed?.();
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Flush a question typed while the thread was restoring, or held for the bot check.
  useEffect(() => {
    if (!ready || queuedRef.current === null) return;
    if (needsCheck() && checkToken === '') return;
    const text = queuedRef.current;
    queuedRef.current = null;
    setQueued(false);
    send(text);
  }, [checkToken, needsCheck, ready, send]);

  const messages = useMemo<PanelMessage[]>(
    () => (busy && preview !== '' ? [...rows, { id: PREVIEW_ID, role: 'assistant', text: preview, streaming: true }] : rows),
    [busy, preview, rows],
  );

  return {
    messages,
    conversationId,
    busy,
    stage,
    error,
    ready,
    queued,
    canStop: options.cancelUrl !== undefined,
    humanCheck: checkKey === ''
      ? undefined
      : { siteKey: checkKey, onToken: onCheckToken, resetSignal: checkReset, waiting: queued && conversationId === null && checkToken === '' },
    send,
    stop,
    retry,
    startNew,
    open,
    forget,
  };
}
