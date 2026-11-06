import { useEffect, useRef, useState, type ReactNode } from 'react';
import { copyRendered } from '../conversationCopy';
import { CheckIcon, CopyIcon, RefreshIcon, SpeakerIcon, StopSquareIcon } from '../icons';

/**
 * The row under an assistant answer: Copy, then the rating, then (on the latest answer only) the next
 * steps it suggests (owner, 2026-11-03).
 *
 * ⚠ COPY TAKES THE ANSWER AS IT WAS DRAWN, from the sibling `[data-ai-copy-source]` in the same
 * bubble, so a table, a list and bold figures paste as themselves into an email or a document. See
 * {@link copyRendered}.
 *
 * ⚠ A FOLLOW-UP IS SENT AS THE PERSON'S OWN MESSAGE, word for word, exactly as if they had typed it,
 * so the turn that answers it is an ordinary turn with nothing hidden in it.
 */
export interface MessageActionsProps {
  /** Copy is offered once the answer has finished arriving. */
  canCopy: boolean;
  /** The rating control, when this row may be rated. */
  feedback?: ReactNode;
  followUps: string[];
  onFollowUp?: (text: string) => void;
  /** No follow-up can be sent while an answer is still being written. */
  busy?: boolean;
  /** A failure the product reports (a refused clipboard is not an API error). */
  onCopyError?: (error: unknown) => void;

  /** Read this answer aloud (1.34.0); `speaking` turns the button into Stop. */
  onSpeak?: () => void;
  speaking?: boolean;
  /** Ask the question behind this answer again (the latest answer only, 1.34.0). */
  onAskAgain?: () => void;
  /** Where this answer can be put to use, the product's own targets (1.34.0). */
  useThis?: Array<{ key: string; label: string; onUse: () => void }>;
  /** What the answer was read from, each opening the record (1.34.0). */
  sources?: Array<{ label: string; href?: string }>;
  onOpenSource?: (href: string) => void;
}

const ICON_BUTTON =
  'inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--ai-muted)]'
  + ' outline-none transition-colors hover:text-[var(--ai-accent)] focus-visible:text-[var(--ai-accent)]';

const SOURCE =
  'inline-flex max-w-full items-center truncate rounded-full border border-[var(--ai-border)] px-2 py-0.5 text-xs'
  + ' text-[var(--ai-muted)] no-underline outline-none transition-colors hover:border-[var(--ai-accent)]'
  + ' hover:text-[var(--ai-accent)] focus-visible:border-[var(--ai-accent)]';

const FOLLOW_UP =
  'max-w-full whitespace-normal rounded-full border border-[var(--ai-border)] bg-[var(--ai-surface)]'
  + ' px-3 py-1.5 text-left text-xs font-medium text-[var(--ai-accent)] outline-none transition-colors'
  + ' hover:border-[var(--ai-accent)] hover:bg-[var(--ai-accent-soft)] focus-visible:border-[var(--ai-accent)]'
  + ' disabled:opacity-50';

export function MessageActions({
  canCopy, feedback, followUps, onFollowUp, busy = false, onCopyError,
  onSpeak, speaking = false, onAskAgain, useThis = [], sources = [], onOpenSource,
}: MessageActionsProps) {
  const [useOpen, setUseOpen] = useState(false);
  const row = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return undefined;
    const t = window.setTimeout(() => setCopied(false), 2000);

    return () => window.clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    const source = row.current?.parentElement?.querySelector<HTMLElement>('[data-ai-copy-source]');
    if (!source) return;
    try {
      await copyRendered(source);
      setCopied(true);
    } catch (error) {
      onCopyError?.(error);
    }
  };

  const showFollowUps = followUps.length > 0 && onFollowUp !== undefined;
  const hasTools = canCopy || Boolean(feedback) || Boolean(onSpeak) || Boolean(onAskAgain) || useThis.length > 0;
  if (!hasTools && !showFollowUps && sources.length === 0) return null;

  return (
    <div ref={row} data-ai-no-copy="">
      {sources.length > 0 ? (
        <div role="group" aria-label="Read from" className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-[var(--ai-muted)]">From</span>
          {sources.map((source) =>
            source.href ? (
              <a
                key={`${source.label}${source.href}`}
                href={source.href}
                onClick={(event) => {
                  if (!onOpenSource) return;
                  event.preventDefault();
                  onOpenSource(source.href!);
                }}
                className={SOURCE}
              >
                {source.label}
              </a>
            ) : (
              <span key={source.label} className={SOURCE}>{source.label}</span>
            ),
          )}
        </div>
      ) : null}

      {hasTools ? (
        <div className="mt-1.5 flex items-start gap-1">
          {canCopy ? (
            <button
              type="button"
              onClick={() => void copy()}
              aria-label={copied ? 'Copied' : 'Copy this answer'}
              title={copied ? 'Copied' : 'Copy'}
              className={ICON_BUTTON}
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
            </button>
          ) : null}
          {onSpeak ? (
            <button
              type="button"
              onClick={onSpeak}
              aria-label={speaking ? 'Stop reading aloud' : 'Read this answer aloud'}
              title={speaking ? 'Stop' : 'Read aloud'}
              className={ICON_BUTTON}
            >
              {speaking ? <StopSquareIcon size={12} /> : <SpeakerIcon />}
            </button>
          ) : null}
          {onAskAgain ? (
            <button
              type="button"
              disabled={busy}
              onClick={onAskAgain}
              aria-label="Ask this again"
              title="Ask again"
              className={`${ICON_BUTTON} disabled:opacity-40`}
            >
              <RefreshIcon />
            </button>
          ) : null}
          {useThis.length > 0 ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setUseOpen((open) => !open)}
                aria-expanded={useOpen}
                className="inline-flex h-7 items-center whitespace-nowrap rounded-full px-2.5 text-xs font-medium text-[var(--ai-muted)] outline-none transition-colors hover:text-[var(--ai-accent)] focus-visible:text-[var(--ai-accent)]"
              >
                Use this
              </button>
              {useOpen ? (
                <div role="menu" className="absolute bottom-full left-0 z-10 mb-1 min-w-[12rem] overflow-hidden rounded-xl border border-[var(--ai-border)] bg-[var(--ai-surface)] py-1 shadow-lg">
                  {useThis.map((target) => (
                    <button
                      key={target.key}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setUseOpen(false);
                        target.onUse();
                      }}
                      className="block w-full whitespace-nowrap px-3 py-1.5 text-left text-sm text-[var(--ai-fg)] outline-none hover:bg-[var(--ai-accent-soft)] focus-visible:bg-[var(--ai-accent-soft)]"
                    >
                      {target.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          <span className="sr-only" role="status">{copied ? 'Answer copied' : ''}</span>
          {feedback ? <div className="min-w-0">{feedback}</div> : null}
        </div>
      ) : null}

      {showFollowUps ? (
        <div role="group" aria-label="Suggested next steps" className="mt-2 flex flex-wrap gap-1.5">
          {followUps.map((item) => (
            <button key={item} type="button" disabled={busy} onClick={() => onFollowUp(item)} className={FOLLOW_UP}>
              {item}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
