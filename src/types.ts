/**
 * The shapes a streamed assistant turn speaks in.
 *
 * ⚠ THESE MIRROR ai-service's STREAM EVENTS, NOT A PRODUCT'S API. Every product
 * proxies the service's stream through its own route (the service is
 * loopback-only and this code runs in a browser), so the event NAMES are the
 * product's to choose - see {@link StreamEventNames}. The event MEANINGS are
 * fixed here, because a product that renamed `discard` to something else and
 * then handled it differently would reintroduce the bug that event exists for.
 */

/** The state one turn moves through. */
export type TurnPhase =
  | 'idle'
  /** The request is open and nothing has been written yet. */
  | 'thinking'
  /** Tokens are arriving. */
  | 'writing'
  /** Finished normally. */
  | 'done'
  /** The viewer pressed stop. */
  | 'stopped'
  /** It failed, and `error` says how. */
  | 'failed';

/**
 * What the product's proxy calls each event.
 *
 * ⚠ DEFAULTS MATCH ai-service's OWN NAMES, so a product that proxies the stream
 * through untouched needs no configuration. A product whose route already
 * speaks a different dialect - Portify's says `reset` where the service says
 * `discard`, and ends with `message` rather than `done` - maps them here
 * instead of rewriting its backend, which is the difference between adopting
 * this package in an afternoon and never adopting it.
 */
export interface StreamEventNames {
  /** Carries the stream id, which is what makes Stop able to stop. */
  open?: string;
  /** A waterfall rung started. Carries `provider` / `model` / `label`. */
  stage?: string;
  /** Append `text`. */
  token?: string;
  /** ⚠ Throw away everything shown so far. See `useAssistantStream`. */
  discard?: string;
  /** Terminal, success. May carry the full `text` and a product payload. */
  done?: string;
  /** Terminal, failure. Carries `message`. */
  error?: string;
}

export const DEFAULT_EVENT_NAMES: Required<StreamEventNames> = {
  open: 'open',
  stage: 'stage',
  token: 'token',
  discard: 'discard',
  done: 'done',
  error: 'error',
};

/** One decoded SSE frame. */
export interface StreamFrame {
  event: string;
  data: Record<string, unknown>;
}

/** What a tool did during the turn, when the product reports it. */
export interface ToolTrailEntry {
  name: string;
  outcome: 'ran' | 'refused' | 'unknown_tool' | 'failed';
  error?: string;
}

export interface AssistantTurnState {
  phase: TurnPhase;
  /** The answer so far. Reset to '' by a `discard`. */
  text: string;
  /** The last stage label, for a "thinking" line that is not a lie. */
  stage: string | null;
  /** ⚠ Null means there is nothing to cancel server-side. See the hook. */
  streamId: string | null;
  error: string | null;
  /** Whatever the terminal event carried, for a product that needs the record. */
  payload: Record<string, unknown> | null;
  tools: ToolTrailEntry[];
}

/**
 * One message in a panel's list.
 *
 * ⚠ `id` IS REQUIRED AND MUST BE STABLE. It is the React key for a list that
 * re-renders on a token cadence; an index key makes React reconcile the wrong
 * bubble when a turn is retried or a failed message is dropped, and the symptom
 * is one speaker's words appearing under the other's name.
 *
 * ⚠ AND THE STREAMING MESSAGE IS A MESSAGE, not a special case bolted beside
 * the list. Every panel this package replaces keeps the in-flight answer in
 * separate state from the history, and each then has to re-implement the
 * ordering, the keys and the empty-while-thinking case. Here the panel appends
 * one message with `streaming: true` and the list stays the list.
 */
export interface PanelMessage {
  id: string;
  role: 'user' | 'assistant';

  /** Markdown. Rendered through the shared map unless `content` is given. */
  text: string;

  /**
   * A product's own rendering, instead of the text - a confirm card, a data
   * table, an action launcher. The panel does not inspect it.
   */
  content?: import('react').ReactNode;

  /** True while tokens are still arriving, which is what draws the cursor. */
  streaming?: boolean;

  /** Set on a turn that failed, so the row can offer a retry. */
  error?: string | null;

  /**
   * Whether the answer was composed from something the assistant retrieved.
   *
   * ⚠ ITS ABSENCE IS NOT `false`. A product that does not report grounding
   * leaves this `undefined`, which means "no claim made" - and `MessageBubble`
   * tests for `=== false` precisely so that silence is never read as a
   * confession. Setting it false is a product saying, on the record, that this
   * answer came out of the model rather than out of its own data.
   */
  grounded?: boolean;

  /**
   * How sure the assistant said it was: a label, not a number.
   *
   * ⚠ A LABEL. Portify stored this as a float for a day because the column
   * looked numeric, and `(float) 'high'` is `0.0`, so every reply in the
   * transcript came back as zero and the caveat vanished. The two products that
   * report it both speak `high` / `medium` / `low`.
   *
   * Rendered only alongside `grounded: false`, where it is the difference
   * between a guess the reader can weigh and a guess they cannot see.
   */
  confidence?: string | null;
}
