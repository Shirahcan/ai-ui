import { useState, type ReactNode } from 'react';
import { ConfirmCard } from '../components/ConfirmCard';

/**
 * A do-prompt the reader has to agree to, and everything that happens after.
 *
 * ⚠ IT IS PORTER'S CARD, PROMOTED (P18g). The estate's first shared confirm card
 * had a Yes, a No and nothing else, while Porter's had been carrying five states
 * and three outcomes in production for months - a settled summary, an action that
 * HANDS OFF rather than finishes, an inline failure the reader can retry without
 * losing the card, and an explanation fetched only if asked for. Migrating Porter
 * onto the thin version would have been a downgrade dressed as consolidation, so
 * the thin version grew up instead. None of what it learned is immigration-shaped.
 *
 * ⚠ THE STATE MACHINE IS HERE AND THE CALLS ARE THE PRODUCT'S. `onConfirm` is an
 * async function that may return a summary and a handoff; this file owns busy,
 * done, cancelled, error and the explanation panel. That split is what lets two
 * products behave identically while talking to different backends.
 *
 * ⚠ A SETTLED CARD MUST SURVIVE A RE-MOUNT, and `cancelled` is not `done`. A
 * conversation re-renders constantly and is re-read from history later; a card
 * that forgot would offer to do the thing again, and one that said "Done." about
 * something the reader REFUSED is a lie they cannot correct. The product persists
 * the outcome and hands it back as `settled`.
 */

/** What a confirmed action came back with. */
export interface AssistantActionResult {
  /** What happened, in the product's own words. */
  summary?: string;
  /**
   * An action that hands off rather than finishes.
   *
   * ⚠ SOME ACTIONS DELIBERATELY DO NOT COMPLETE. Composing a case ends on a
   * review page, because creating one emails a real client and consumes a plan
   * slot. Without somewhere to go next, that action dead-ends on a card that
   * says it succeeded.
   */
  handoff?: { url: string; label: string };
}

export type AssistantActionOutcome = 'pending' | 'done' | 'cancelled';

const LINK =
  'mt-2 inline-block whitespace-nowrap rounded-full bg-[var(--ai-accent)] px-4 py-2'
  + ' text-sm font-semibold text-[var(--ai-accent-fg)] outline-none transition-opacity'
  + ' hover:opacity-90';
const QUIET =
  'text-sm underline underline-offset-2 outline-none transition-opacity hover:opacity-80';

export function ActionConfirm({
  title,
  detail,
  confirmLabel,
  cancelLabel,
  settled,
  canRefine,
  canExplain,
  onConfirm,
  onCancel,
  onRefine,
  onExplain,
  onNavigate,
}: {
  title: string;
  detail?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** The persisted outcome, so a re-mount never re-offers or misreports it. */
  settled?: AssistantActionOutcome;
  canRefine?: boolean;
  canExplain?: boolean;
  onConfirm: () => Promise<AssistantActionResult | void>;
  onCancel?: () => void;
  onRefine?: () => void;
  /** Fetched only when asked for, because it costs a turn. */
  onExplain?: () => Promise<string>;
  onNavigate?: (url: string) => void;
}) {
  const [status, setStatus] = useState<'idle' | 'busy' | 'done' | 'cancelled' | 'failed'>(
    settled === 'done' ? 'done' : settled === 'cancelled' ? 'cancelled' : 'idle',
  );
  const [summary, setSummary] = useState<string | null>(null);
  const [handoff, setHandoff] = useState<{ url: string; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);

  const confirm = async () => {
    setStatus('busy');
    setError(null);
    try {
      const result = await onConfirm();
      setSummary(result?.summary ?? 'Done.');
      setHandoff(result?.handoff ?? null);
      setStatus('done');
    } catch (e) {
      /*
       * ⚠ THE CARD STAYS, SO THE READER CAN TRY AGAIN. A failure that replaces
       * the card with an error loses the one control that would fix it, and the
       * reader has to retype the request that produced it.
       */
      setStatus('failed');
      setError(e instanceof Error ? e.message : 'That did not go through. Please try again.');
    }
  };

  const cancel = () => {
    setStatus('cancelled');
    onCancel?.();
  };

  const explain = async () => {
    if (!onExplain || explaining) return;
    setExplaining(true);
    try {
      setExplanation(await onExplain());
    } catch (e) {
      setExplanation(e instanceof Error ? e.message : 'I could not explain that just now.');
    } finally {
      setExplaining(false);
    }
  };

  if (status === 'done') {
    return (
      <div className="mt-2 rounded-2xl border border-[var(--ai-border)] p-3.5">
        <p className="text-sm font-medium text-[var(--ai-fg)]">{summary ?? 'Done.'}</p>
        {handoff ? (
          <button
            type="button"
            onClick={() => onNavigate?.(handoff.url)}
            className={LINK}
          >
            {handoff.label}
          </button>
        ) : null}
      </div>
    );
  }

  if (status === 'cancelled') {
    return (
      <p className="mt-2 text-sm text-[var(--ai-muted)]">
        Cancelled. Nothing was changed.
      </p>
    );
  }

  return (
    <ConfirmCard
      title={title}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      busy={status === 'busy'}
      onConfirm={() => void confirm()}
      onCancel={cancel}
    >
      {detail}

      {explanation ? (
        <p className="mt-2 rounded-xl bg-[var(--ai-accent-soft)] px-3 py-2 text-[13px] leading-relaxed text-[var(--ai-fg)]">
          {explanation}
        </p>
      ) : null}

      {error ? (
        <p className="mt-2 text-xs text-[var(--ai-danger)]" role="alert">
          {error}
        </p>
      ) : null}

      {/*
        ⚠ REFINE AND EXPLAIN ARE OFFERED ONLY WHEN THE SERVICE SAID SO. They cost
        a turn each, and a card that offers to explain something the backend
        cannot explain fails after the reader has committed to asking.
      */}
      {(canRefine && onRefine) || (canExplain && onExplain) ? (
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[var(--ai-muted)]">
          {canRefine && onRefine ? (
            <button type="button" onClick={onRefine} className={QUIET}>
              Change something
            </button>
          ) : null}
          {canExplain && onExplain ? (
            <button
              type="button"
              onClick={() => void explain()}
              disabled={explaining}
              className={QUIET}
            >
              {explaining ? 'Explaining...' : 'Explain this'}
            </button>
          ) : null}
        </div>
      ) : null}
    </ConfirmCard>
  );
}
