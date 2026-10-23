import { useState, type ReactNode } from 'react';
import { aiVar } from '../theme';

/**
 * Was that reply any good? One control, one wording, for every assistant in the estate.
 *
 * ⚠ IT EXISTS BECAUSE THE DRIFT WAS ALREADY MEASURED (P18a, 2026-10-23). Two products had
 * their own copy of this control, posting the SAME five reason codes to the same kind of
 * analytics, and asking the user in different words - four of the five labels differed. A
 * backlog that groups by reason code was therefore grouping answers to five differently
 * worded questions, and nothing in either product said so.
 *
 * ⚠ THE WORDING IS SETTLED HERE, AND BOTH PRODUCTS CHANGED. Portify is the blueprint for
 * this panel, which does not make it the owner of the copy: where the two disagreed, the
 * plainer of the two existing phrasings won. "Wrong topic" / "Off topic" became **Off
 * topic**; "Outdated info" / "Out of date" became **Out of date**. Keeping Portify's words
 * because Portify is the blueprint would have made this package a Portify export rather
 * than shared infrastructure.
 *
 * ⚠ THE REASONS REVEAL INLINE RATHER THAN IN A POPOVER, which is MployNow's mechanism and
 * not Portify's. A popover needs a positioning library, and a shared component that pulls in
 * Radix makes itself unadoptable by any product that does not already have it. The richer
 * part of Portify's version - the free-text field, the counter, the settled state - is kept.
 *
 * ⚠ IT MAKES NO REQUEST. `onSubmit` is the product's, because the endpoint differs (Portify
 * alone has a guest variant) and because a component that owned the call would own the
 * failure handling too. It owns the states; the product owns the wire.
 */

/** The reason codes every product already posts. Values are the contract; labels are copy. */
export const ASSISTANT_FEEDBACK_REASONS = [
  { code: 'wrong_topic', label: 'Off topic' },
  { code: 'outdated_info', label: 'Out of date' },
  { code: 'didnt_understand', label: 'Did not understand my question' },
  { code: 'missing_detail', label: 'Missing detail' },
  { code: 'unhelpful_other', label: 'Not helpful, something else' },
] as const;

export type AssistantFeedbackReason = (typeof ASSISTANT_FEEDBACK_REASONS)[number]['code'];

export interface AssistantFeedbackPayload {
  sentiment: 'positive' | 'negative';
  reasonCode?: AssistantFeedbackReason;
  reasonText?: string;
}

export interface AssistantFeedbackProps {
  /** The product's own call. Throwing is how it reports a failure. */
  onSubmit: (payload: AssistantFeedbackPayload) => Promise<void>;
  /** Longest free-text note a reader may add. */
  maxTextLength?: number;
  /** Class slots, so a product brands it without forking it. */
  className?: string;
  buttonClassName?: string;
  chipClassName?: string;
  chipSelectedClassName?: string;
  submitClassName?: string;
  /** The icons. Omitted, the control falls back to readable text. */
  upIcon?: ReactNode;
  downIcon?: ReactNode;
}

type State =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'done'; sentiment: 'positive' | 'negative' }
  | { status: 'error'; message: string };

export function AssistantFeedback({
  onSubmit,
  maxTextLength = 500,
  className,
  buttonClassName,
  chipClassName,
  chipSelectedClassName,
  submitClassName,
  upIcon,
  downIcon,
}: AssistantFeedbackProps) {
  const [state, setState] = useState<State>({ status: 'idle' });
  const [open, setOpen] = useState(false);
  const [reasonCode, setReasonCode] = useState<AssistantFeedbackReason | null>(null);
  const [reasonText, setReasonText] = useState('');

  const submitting = state.status === 'submitting';

  async function send(payload: AssistantFeedbackPayload) {
    setState({ status: 'submitting' });
    try {
      await onSubmit(payload);
      setState({ status: 'done', sentiment: payload.sentiment });
      setOpen(false);
    } catch (e) {
      setState({ status: 'error', message: e instanceof Error ? e.message : 'Could not send that.' });
    }
  }

  /*
   * ⚠ SETTLED, AND IT SAYS SO. The control disables itself after one answer because asking
   * again is noise, not because the backend refuses a second row - it overwrites. A reader
   * who clicked needs to see that it landed.
   */
  if (state.status === 'done') {
    return (
      <div
        className={className ?? 'mt-2 inline-flex items-center gap-1.5 px-3 py-1 text-xs'}
        style={{ color: aiVar('--ai-muted') }}
      >
        <span aria-hidden="true">{state.sentiment === 'positive' ? upIcon : downIcon}</span>
        <span>Thanks for the feedback</span>
      </div>
    );
  }

  const fallbackButton = 'inline-flex h-8 items-center justify-center px-2 text-xs outline-none disabled:opacity-50';

  return (
    <div className={className ?? 'mt-2'}>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label="This reply was helpful"
          disabled={submitting}
          onClick={() => void send({ sentiment: 'positive' })}
          className={buttonClassName ?? fallbackButton}
          style={{ color: aiVar('--ai-muted') }}
        >
          {upIcon ?? 'Helpful'}
        </button>

        <button
          type="button"
          aria-label="This reply was not helpful"
          aria-expanded={open}
          disabled={submitting}
          onClick={() => setOpen((o) => !o)}
          className={buttonClassName ?? fallbackButton}
          style={{ color: aiVar('--ai-muted') }}
        >
          {downIcon ?? 'Not helpful'}
        </button>

        {state.status === 'error' ? (
          <span className="text-xs" role="alert" style={{ color: aiVar('--ai-danger') }}>
            {state.message}
          </span>
        ) : null}
      </div>

      {open ? (
        <div className="mt-2">
          <p className="text-xs font-semibold" style={{ color: aiVar('--ai-accent') }}>
            What was wrong?
          </p>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {ASSISTANT_FEEDBACK_REASONS.map(({ code, label }) => {
              const selected = reasonCode === code;

              return (
                <button
                  key={code}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setReasonCode(selected ? null : code)}
                  className={
                    (selected ? chipSelectedClassName : chipClassName)
                    ?? 'whitespace-nowrap px-3 py-1 text-xs outline-none'
                  }
                  style={
                    chipClassName
                      ? undefined
                      : selected
                        ? { background: aiVar('--ai-accent'), color: aiVar('--ai-accent-fg') }
                        : { border: `1px solid ${aiVar('--ai-border')}`, color: aiVar('--ai-muted') }
                  }
                >
                  {label}
                </button>
              );
            })}
          </div>

          <textarea
            value={reasonText}
            onChange={(e) => setReasonText(e.target.value.slice(0, maxTextLength))}
            placeholder="Add detail (optional)"
            rows={3}
            aria-label="Add detail about what was wrong"
            className="mt-3 block w-full px-3 py-2 text-sm outline-none"
            style={{ border: `1px solid ${aiVar('--ai-border')}`, color: aiVar('--ai-fg') }}
          />

          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-xs" style={{ color: aiVar('--ai-muted') }}>
              {reasonText.length}/{maxTextLength}
            </span>
            <button
              type="button"
              disabled={submitting}
              onClick={() =>
                void send({
                  sentiment: 'negative',
                  reasonCode: reasonCode ?? undefined,
                  reasonText: reasonText.trim() === '' ? undefined : reasonText.trim(),
                })
              }
              className={submitClassName ?? 'whitespace-nowrap px-4 py-2 text-xs font-semibold outline-none disabled:opacity-50'}
              style={
                submitClassName
                  ? undefined
                  : { background: aiVar('--ai-accent'), color: aiVar('--ai-accent-fg') }
              }
            >
              {submitting ? 'Sending…' : 'Submit'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
