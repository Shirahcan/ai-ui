import { useEffect, useRef, useState, type ReactNode } from 'react';
import { copyRendered } from '../conversationCopy';
import { CheckIcon, CopyIcon } from '../icons';

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
}

const ICON_BUTTON =
  'inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--ai-muted)]'
  + ' outline-none transition-colors hover:text-[var(--ai-accent)] focus-visible:text-[var(--ai-accent)]';

const FOLLOW_UP =
  'max-w-full whitespace-normal rounded-full border border-[var(--ai-border)] bg-[var(--ai-surface)]'
  + ' px-3 py-1.5 text-left text-xs font-medium text-[var(--ai-accent)] outline-none transition-colors'
  + ' hover:border-[var(--ai-accent)] hover:bg-[var(--ai-accent-soft)] focus-visible:border-[var(--ai-accent)]'
  + ' disabled:opacity-50';

export function MessageActions({ canCopy, feedback, followUps, onFollowUp, busy = false, onCopyError }: MessageActionsProps) {
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
  if (!canCopy && !feedback && !showFollowUps) return null;

  return (
    <div ref={row} data-ai-no-copy="">
      {canCopy || feedback ? (
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
