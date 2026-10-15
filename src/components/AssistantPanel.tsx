import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { Composer, type ComposerProps } from './Composer';
import { MessageBubble } from './MessageBubble';
import { aiVar } from '../theme';
import { useAssistantStream } from '../useAssistantStream';
import { useAutoscroll } from '../useAutoscroll';
import type { MarkdownTheme } from '../markdown';
import type { PanelMessage, StreamEventNames, ToolTrailEntry } from '../types';

/**
 * The shared assistant panel: headless mechanics, product chrome through slots.
 *
 * ⚠ THIS REVERSES A NARROWING MADE ON PURPOSE, so the reasoning matters.
 * `ai-ui` 1.0 shipped owning no layout, because "a shared component that owned
 * the panel chrome would be forked within a month". That risk is real. It was
 * also already spent: four independent assistant panels existed across the
 * estate BEFORE this package shipped, and only one of them streamed at all. The
 * duplication the narrowing was meant to prevent had already happened; what the
 * narrowing actually prevented was the SSE lessons in here reaching anybody.
 *
 * ⚠ SO THE FORK RISK IS ANSWERED BY DESIGN, NOT BY OMISSION. This component
 * owns only what every panel got wrong and nothing a product would want to
 * change: the turn lifecycle, scroll behaviour that does not fight the reader,
 * the streaming cursor, Stop, the error row with a retry, and the `aria-live`
 * region. The bubble, the composer, the empty state, the header and the footer
 * are SLOTS; the palette is CSS custom properties. There is nothing left in
 * here worth copying out.
 *
 * ⚠ IT STILL NEVER CALLS ai-service. The service holds every provider key in
 * the estate and is loopback-only by design. `url` is the PRODUCT's own route.
 *
 * Two ways to mount it:
 *
 * ```tsx
 * // Greenfield: one prop, a working streamed conversation.
 * <AssistantPanel url="/api/proxy/assistant/chat/stream" />
 *
 * // An existing panel that already owns its history and persistence.
 * <AssistantPanel
 *   messages={messages} busy={mutation.isPending} stage={stage} error={error}
 *   onSend={send} onStop={stopTurn} onRetry={retry}
 *   renderBubble={(m) => <PorterBubble message={m} />}
 * />
 * ```
 */
export interface AssistantPanelProps {
  /**
   * The product's own turn route. Required UNLESS `messages` + `onSend` are
   * given, in which case the product owns the turn and this is unused.
   */
  url?: string;

  /** `{id}` is replaced by the stream id. Without it, Stop cannot stop spend. */
  cancelUrl?: string;

  headers?: () => Record<string, string>;
  events?: StreamEventNames;

  /** Merged into every turn's request body - a conversation id, a surface. */
  body?: Record<string, unknown>;

  /** Controlled mode: the product owns the list. */
  messages?: PanelMessage[];
  busy?: boolean;
  stage?: string | null;
  error?: string | null;
  tools?: ToolTrailEntry[];

  onSend?: (text: string) => void;
  onStop?: () => void;
  onRetry?: () => void;

  header?: ReactNode;
  footer?: ReactNode;

  renderBubble?: (message: PanelMessage) => ReactNode;
  renderComposer?: (props: ComposerSlotProps) => ReactNode;
  renderEmpty?: () => ReactNode;
  renderToolTrail?: (tools: ToolTrailEntry[]) => ReactNode;

  markdownTheme?: MarkdownTheme;
  placeholder?: string;
  className?: string;
  listClassName?: string;
  label?: string;
}

/** What the `renderComposer` slot is handed. */
export type ComposerSlotProps = Pick<
  ComposerProps,
  'value' | 'onChange' | 'onSend' | 'busy' | 'onStop'
>;

let seq = 0;
const uid = (): string => `aiui-${++seq}`;

export function AssistantPanel(props: AssistantPanelProps) {
  const {
    url,
    cancelUrl,
    headers,
    events,
    body,
    messages,
    busy: controlledBusy,
    stage: controlledStage,
    error: controlledError,
    tools: controlledTools,
    onSend,
    onStop,
    onRetry,
    header,
    footer,
    renderBubble,
    renderComposer,
    renderEmpty,
    renderToolTrail,
    markdownTheme,
    placeholder,
    className,
    listClassName,
    label = 'Assistant conversation',
  } = props;

  const isControlled = messages !== undefined;

  const [draft, setDraft] = useState('');
  const [thread, setThread] = useState<PanelMessage[]>([]);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [stopped, setStopped] = useState(false);
  const lastAskRef = useRef<string | null>(null);

  const turn = useAssistantStream({
    url: url ?? '',
    cancelUrl,
    headers,
    events,
    onDone: (_payload, text) => {
      /*
       * ⚠ THE ANSWER IS COMMITTED HERE, NOT IN AN EFFECT WATCHING `text`.
       * Deriving the live row during render and committing it on the terminal
       * event means there is never a tick where both the live row and the
       * settled one exist, which is how a duplicated final message appears.
       */
      setThread((prev) => [...prev, { id: uid(), role: 'assistant', text }]);
      setPendingId(null);
    },
  });

  const ownBusy = turn.state.phase === 'thinking' || turn.state.phase === 'writing';
  const busy = isControlled ? controlledBusy === true : ownBusy;
  const stage = isControlled ? (controlledStage ?? null) : turn.state.stage;
  const error = isControlled
    ? (controlledError ?? null)
    : turn.state.phase === 'failed'
      ? turn.state.error
      : null;
  const tools = isControlled ? (controlledTools ?? []) : turn.state.tools;

  /*
   * The in-flight answer is DERIVED, not stored. One list, one set of keys, and
   * no second source of truth for "what the assistant is saying right now".
   */
  const rows: PanelMessage[] = useMemo(() => {
    if (isControlled) return messages;
    if (!pendingId) return thread;

    return [
      ...thread,
      /*
       * ⚠ NO `error` ON THIS ROW. The panel states a failure ONCE, in its
       * own error row, which is also where the retry lives. Setting it here as
       * well printed the provider's message twice - a duplication a test
       * caught by being unable to find "the" error, and that a user would read
       * as two separate things having gone wrong. `PanelMessage.error` stays
       * for CONTROLLED mode, where a product may pin a failure to one
       * historical message rather than to the turn.
       */
      { id: pendingId, role: 'assistant', text: turn.state.text, streaming: ownBusy },
    ];
  }, [isControlled, messages, pendingId, thread, turn.state.text, ownBusy]);

  const { scrollRef, onScroll, isPinned, scrollToBottom } = useAutoscroll({
    watch: `${rows.length}:${rows[rows.length - 1]?.text.length ?? 0}:${String(busy)}`,
  });

  const send = useCallback(() => {
    const text = draft.trim();
    if (text === '' || busy) return;

    setDraft('');
    setStopped(false);
    lastAskRef.current = text;

    if (isControlled) {
      onSend?.(text);
      return;
    }

    setThread((prev) => [...prev, { id: uid(), role: 'user', text }]);
    setPendingId(uid());
    void turn.ask({ message: text, ...(body ?? {}) });
  }, [draft, busy, isControlled, onSend, turn, body]);

  const stop = useCallback(() => {
    setStopped(true);

    if (isControlled) {
      onStop?.();
      return;
    }

    const partial = turn.state.text;
    turn.stop();

    /*
     * ⚠ THE PARTIAL ANSWER IS KEPT, not wiped. The user stopped reading
     * something they had already begun reading; throwing it away punishes them
     * for the click. It is committed as an ordinary message and the status line
     * says what happened - never an error row, because a deliberate act must
     * not be reported back as a fault.
     */
    setPendingId(null);

    if (partial !== '') {
      setThread((prev) => [...prev, { id: uid(), role: 'assistant', text: partial }]);
    }
  }, [isControlled, onStop, turn]);

  const retry = useCallback(() => {
    setStopped(false);

    if (isControlled) {
      onRetry?.();
      return;
    }

    const text = lastAskRef.current;
    if (text === null || busy) return;

    setPendingId(uid());
    void turn.ask({ message: text, ...(body ?? {}) });
  }, [isControlled, onRetry, busy, turn, body]);

  /*
   * ⚠ A MISCONFIGURED PANEL SAYS SO, rather than rendering an input that
   * silently does nothing. An unset value is a visible "not configured" state,
   * never a quiet no-op: a broken screen somebody reports beats a Send button
   * that swallows every question.
   */
  if (!isControlled && (url === undefined || url === '')) {
    return (
      <div className={className} role="alert" style={{ color: aiVar('--ai-danger') }}>
        <p className="p-4 text-sm">
          This assistant panel is not configured: it needs either a <code>url</code> for its own
          turn route, or <code>messages</code> and <code>onSend</code> from the product.
        </p>
      </div>
    );
  }

  const status = stopped ? 'You stopped this answer.' : busy && stage ? stage : null;

  return (
    <div
      className={className ?? 'flex h-full min-h-0 flex-col'}
      style={{ background: aiVar('--ai-surface'), color: aiVar('--ai-fg') }}
    >
      {header}

      {/*
        ⚠ `min-h-0` IS LOAD-BEARING. A flex child's automatic minimum height is
        its content, so without it the list refuses to shrink, grows the panel
        past its container and never scrolls - the same half-fix the modal
        directive names, in a panel instead of a dialog.
      */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className={listClassName ?? 'flex-1 min-h-0 overflow-y-auto px-2 py-3'}
        role="log"
        aria-label={label}
        aria-busy={busy}
      >
        {rows.length === 0
          ? (renderEmpty?.() ?? null)
          : rows.map((message) =>
              renderBubble ? (
                <div key={message.id}>{renderBubble(message)}</div>
              ) : (
                <MessageBubble key={message.id} message={message} markdownTheme={markdownTheme} />
              ),
            )}

        {tools.length > 0 ? renderToolTrail?.(tools) : null}
      </div>

      {/*
        ⚠ THE STATUS LINE IS THE ONE THING A SCREEN READER IS TOLD. Tokens are
        NOT announced: a polite live region fed on a token cadence reads the
        answer aloud from the beginning every few hundred milliseconds, which is
        worse than silence. The phase changes are what matter.
      */}
      <div aria-live="polite" className="sr-only">
        {status ?? (busy ? 'The assistant is answering.' : '')}
      </div>

      {status ? (
        <p className="px-3 pb-1 text-xs" style={{ color: aiVar('--ai-muted') }}>
          {status}
        </p>
      ) : null}

      {!isPinned && busy ? (
        <button
          type="button"
          onClick={scrollToBottom}
          className="mx-3 mb-1 self-start rounded-full px-3 py-1 text-xs outline-none"
          style={{ border: `1px solid ${aiVar('--ai-border')}`, color: aiVar('--ai-muted') }}
        >
          Jump to the latest
        </button>
      ) : null}

      {error ? (
        <div className="flex items-center gap-2 px-3 pb-1" role="alert">
          <p className="text-xs" style={{ color: aiVar('--ai-danger') }}>
            {error}
          </p>
          <button
            type="button"
            onClick={retry}
            className="rounded-full px-2 py-0.5 text-xs font-medium underline outline-none"
          >
            Try again
          </button>
        </div>
      ) : null}

      {renderComposer ? (
        renderComposer({ value: draft, onChange: setDraft, onSend: send, busy, onStop: stop })
      ) : (
        <Composer
          value={draft}
          onChange={setDraft}
          onSend={send}
          busy={busy}
          onStop={stop}
          placeholder={placeholder}
        />
      )}

      {footer}
    </div>
  );
}
