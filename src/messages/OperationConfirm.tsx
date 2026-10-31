import { useState } from 'react';
import type { AssistantOperation } from './kinds';
import type { AssistantActionOutcome, AssistantActionResult } from './ActionConfirm';

/**
 * A change the assistant previewed, and the reader's explicit go-ahead WITH A REASON.
 *
 * ⚠ THE REASON IS REQUIRED, AND IT IS A CHOICE FIRST. Privileged changes (an admin editing a
 * person, reopening a step, resending an email, refunding a payment) are audited with why they
 * were made. Typing a reason for every change is how audit trails fill with "fix"; offering the
 * likely reasons the assistant drafted, plus "Other", is how they fill with real ones.
 *
 * ⚠ THE BUTTON NAMES THE ACT ("Change email address", "Take the case back to Biometrics"), never
 * "Submit", and a change that moves money or removes something says so, and whether it can be
 * undone, BEFORE the button.
 *
 * Same state machine as {@link ActionConfirm}: the product runs it and may throw, the card stays
 * on failure so the reader can retry, and a settled outcome survives a re-mount.
 */
const OTHER = '__other__';

export function OperationConfirm({
  operation,
  messageId,
  settled,
  onConfirm,
  onCancel,
  onNavigate,
}: {
  operation: AssistantOperation;
  messageId: string;
  settled?: AssistantActionOutcome;
  onConfirm: (reason: string) => Promise<AssistantActionResult | void>;
  onCancel?: () => void;
  onNavigate?: (url: string) => void;
}) {
  const [status, setStatus] = useState<'idle' | 'busy' | 'done' | 'cancelled' | 'failed'>(
    settled === 'done' ? 'done' : settled === 'cancelled' ? 'cancelled' : 'idle',
  );
  const [choice, setChoice] = useState<string | null>(null);
  const [other, setOther] = useState('');
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reason = choice === OTHER ? other.trim() : (choice ?? '');
  const ready = reason.length >= 3 && status !== 'busy';

  const confirm = async () => {
    setStatus('busy');
    setError(null);
    try {
      const result = await onConfirm(reason);
      setSummary(result?.summary ?? 'Done.');
      setStatus('done');
    } catch (e) {
      setStatus('failed');
      setError(e instanceof Error ? e.message : 'That change did not go through.');
    }
  };

  const cancel = () => {
    setStatus('cancelled');
    onCancel?.();
  };

  return (
    <div className="mt-2 space-y-3">
      <div className="space-y-3 rounded-2xl border border-[var(--ai-border)] p-3.5">
        <div className="space-y-0.5">
          <p className="text-sm font-semibold text-[var(--ai-fg)]">{operation.title}</p>
          {operation.target.label ? (
            operation.target.link && onNavigate ? (
              <button
                type="button"
                onClick={() => onNavigate(operation.target.link as string)}
                className="text-left text-[13px] font-medium text-[var(--ai-accent)] outline-none hover:opacity-80"
              >
                {operation.target.label}
              </button>
            ) : (
              <p className="text-[13px] text-[var(--ai-muted)]">{operation.target.label}</p>
            )
          ) : null}
        </div>

        {operation.changes.length > 0 ? (
          <dl className="space-y-1.5">
            {operation.changes.map((change, i) => (
              <div key={`${change.label}-${i}`} className="text-[13px] leading-snug">
                <dt className="font-medium text-[var(--ai-muted)]">{change.label}</dt>
                <dd className="min-w-0 text-[var(--ai-fg)]">
                  {change.before !== '' ? (
                    <>
                      <span className="text-[var(--ai-muted)] line-through">{change.before}</span>
                      <span className="px-1.5 text-[var(--ai-muted)]">to</span>
                    </>
                  ) : null}
                  {change.after.includes('\n') ? (
                    <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-[var(--ai-accent-soft)] px-3 py-2 font-sans text-[12px]">
                      {change.after}
                    </pre>
                  ) : (
                    <span className="break-words font-semibold">{change.after}</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}

        {operation.consequential ? (
          <p className="text-[13px] font-medium text-[var(--ai-danger)]">
            {operation.undoable
              ? 'This moves money or removes something. Check the details first.'
              : 'This moves money or removes something, and it cannot be undone.'}
          </p>
        ) : null}

        {operation.notes.length > 0 ? (
          <ul className="space-y-0.5 text-[12px] leading-snug text-[var(--ai-muted)]">
            {operation.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : null}
      </div>

      {status === 'done' ? (
        <p className="text-sm font-medium text-[var(--ai-fg)]">{summary ?? 'Done.'}</p>
      ) : status === 'cancelled' ? (
        <p className="text-sm text-[var(--ai-muted)]">Cancelled. Nothing was changed.</p>
      ) : (
        <div className="space-y-3">
          <fieldset className="space-y-1.5">
            <legend className="mb-1 text-[13px] font-semibold text-[var(--ai-fg)]">
              Why are you making this change?
            </legend>
            {[...operation.reasonOptions, OTHER].map((option) => (
              <label key={option} className="flex cursor-pointer items-start gap-2 text-[13px] leading-snug text-[var(--ai-fg)]">
                <input
                  type="radio"
                  name={`reason-${messageId}`}
                  checked={choice === option}
                  onChange={() => setChoice(option)}
                  className="mt-0.5 accent-[var(--ai-accent)] outline-none"
                />
                {option === OTHER ? 'Other' : option}
              </label>
            ))}
            {choice === OTHER ? (
              <textarea
                value={other}
                onChange={(e) => setOther(e.target.value)}
                rows={2}
                maxLength={1000}
                placeholder="Say why, in a sentence"
                aria-label="Your reason"
                className="w-full rounded-xl border border-[var(--ai-border)] bg-[var(--ai-surface)] px-3 py-2 text-[13px] text-[var(--ai-fg)] outline-none focus:border-[var(--ai-accent)]"
              />
            ) : null}
          </fieldset>

          {error ? <p className="text-[13px] text-[var(--ai-danger)]">{error}</p> : null}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={confirm}
              disabled={!ready}
              className="whitespace-nowrap rounded-full bg-[var(--ai-accent)] px-4 py-2 text-sm font-semibold text-[var(--ai-accent-fg)] outline-none transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status === 'busy' ? 'Working...' : operation.verb}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={status === 'busy'}
              className="whitespace-nowrap text-sm text-[var(--ai-muted)] underline underline-offset-2 outline-none hover:opacity-80"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
