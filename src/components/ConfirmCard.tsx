import type { ReactNode } from 'react';

/**
 * The card an assistant offers before it DOES something.
 *
 * ⚠ CONFIRM-TO-EXECUTE IS THE RULE, NOT A COURTESY, and this component exists
 * to make the rule hard to skip. An assistant that acts on its own reading of a
 * sentence will eventually act on a misreading, and the actions worth having -
 * drafting a letter, starting a case, sending an email - are exactly the ones
 * whose misfire is expensive. So the model proposes, the card shows what WILL
 * happen in the product's own nouns, and a human presses the verb.
 *
 * ⚠ THE LABEL IS THE REAL VERB, NEVER "CONFIRM". "Send 3 options to Maria
 * Garcia" is a sentence somebody can refuse; "Confirm" is a button people press
 * to make a dialog go away. The prop is required for that reason.
 *
 * ⚠ AND A CANCELLED CARD MUST NOT LATER READ AS DONE. Portify shipped exactly
 * that: cancel and success were stored as the same "completed" mark, so a
 * re-mounted card said "Done." about an action that never ran. `outcome` has
 * three states and they are not interchangeable.
 */
export interface ConfirmCardProps {
  /** What will happen, in the product's nouns. One line. */
  title: string;

  /** The detail a person needs in order to refuse. Names, amounts, dates. */
  children?: ReactNode;

  /**
   * ⚠ THE REAL VERB. "Send 3 options to Maria Garcia", not "Confirm".
   */
  confirmLabel: string;

  cancelLabel?: string;

  /**
   * Where this card stands.
   *
   * ⚠ `cancelled` IS NOT `done`. A re-mounted card that says "Done." about an
   * action the user refused is a lie the user cannot correct.
   */
  outcome?: 'pending' | 'done' | 'cancelled';

  /** Shown instead of the buttons once the outcome is settled. */
  doneLabel?: string;
  cancelledLabel?: string;

  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;

  className?: string;
  confirmClassName?: string;
  cancelClassName?: string;
}

export function ConfirmCard({
  title,
  children,
  confirmLabel,
  cancelLabel = 'Not now',
  outcome = 'pending',
  doneLabel = 'Done.',
  cancelledLabel = 'Cancelled - nothing was changed.',
  busy = false,
  onConfirm,
  onCancel,
  className = 'rounded-2xl border p-3',
  confirmClassName = 'whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-bold outline-none',
  cancelClassName = 'whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold outline-none',
}: ConfirmCardProps) {
  return (
    <div className={className}>
      <p className="text-sm font-semibold">{title}</p>

      {children ? <div className="mt-1 text-xs opacity-80">{children}</div> : null}

      {outcome === 'pending' ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={onConfirm} disabled={busy} className={confirmClassName}>
            {busy ? 'Working...' : confirmLabel}
          </button>
          <button type="button" onClick={onCancel} disabled={busy} className={cancelClassName}>
            {cancelLabel}
          </button>
        </div>
      ) : (
        <p className="mt-2 text-xs font-semibold opacity-80">
          {outcome === 'done' ? doneLabel : cancelledLabel}
        </p>
      )}
    </div>
  );
}
