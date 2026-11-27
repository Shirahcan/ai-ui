import React, { useEffect, useRef, useState } from 'react';

import type { AssistantOperation } from '../messages/kinds';

/**
 * Approving a change in the console (1.73.0, owner 2026-11-27: "Ensure the cards aren't just lazily added but done to
 * match the console UX"). Not the chat card dropped into the transcript: the console asks the way Claude Code asks
 * "Do you want to proceed?", in the question block's place over the composer and with its keys.
 *
 * The rows: one "Yes" per reason the card offers (the reason goes in the audit), "Yes, with my own reason", and
 * "No, tell {assistant} what to change". Up and Down move, Enter picks, 1-9 pick by number, Esc is the "No" row: the
 * composer comes back, and the host records the card declined (`onDeclineOperation`; without one it stays waiting).
 *
 * ⚠ A REFUSAL KEEPS THE BLOCK. The sentence is shown in the fail colour and the rows stay, so the person can pick
 * another reason or decline; nothing is retried on their behalf.
 */

/** The executor's own floor (AdminOperationExecutor::MIN_REASON_LENGTH); the server refuses a shorter reason anyway. */
const MIN_REASON = 3;

const ROW = 'flex w-full gap-2 rounded px-2 py-1 text-left outline-none focus-visible:bg-[var(--term-selection)] focus-visible:ring-1 focus-visible:ring-[var(--term-accent)] disabled:opacity-50';

export function TerminalApprovalBlock({
  operation,
  assistantName = 'the assistant',
  onApprove,
  onDecline,
}: {
  operation: AssistantOperation;
  assistantName?: string;
  /** Run it with this reason. Throw to report a refusal: the block stays with the sentence shown. */
  onApprove: (reason: string) => Promise<void>;
  /** "No, tell ... what to change", and Esc: the composer comes back; the card stays waiting. */
  onDecline: () => void;
}): React.JSX.Element {
  const [own, setOwn] = useState('');
  const [running, setRunning] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);
  const reasons = operation.reasonOptions;
  const ownRow = reasons.length + 1;
  const noRow = reasons.length + 2;

  // The first row takes the focus, so the keys work at once (the console already holds the focus: the block
  // appears in answer to the person's own ask).
  useEffect(() => {
    panel.current?.querySelector<HTMLElement>('[data-row]')?.focus();
  }, []);

  const approve = async (reason: string) => {
    const why = reason.trim();
    if (running || why.length < MIN_REASON) return;
    setRunning(true);
    setRefusal(null);
    try {
      await onApprove(why);
    } catch (error) {
      setRefusal(error instanceof Error && error.message ? error.message : 'That was refused.');
    } finally {
      setRunning(false);
    }
  };

  const onKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;

    if (event.key === 'Escape') {
      // Kept from the console's own Esc (stop, rewind): here it only declines.
      event.preventDefault();
      event.stopPropagation();
      if (!running) onDecline();

      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const rows = [...(panel.current?.querySelectorAll<HTMLElement>('[data-row]') ?? [])];
      if (rows.length > 0) {
        event.preventDefault();
        const at = rows.indexOf(target);
        rows[(at + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length]?.focus();
      }

      return;
    }
    if (target.tagName === 'INPUT' || running) return;

    const n = Number(event.key);
    if (!Number.isInteger(n) || n < 1) return;
    if (n <= reasons.length) {
      event.preventDefault();
      void approve(reasons[n - 1] ?? '');
    } else if (n === ownRow) {
      event.preventDefault();
      panel.current?.querySelector<HTMLElement>('input[data-row]')?.focus();
    } else if (n === noRow) {
      event.preventDefault();
      onDecline();
    }
  };

  const yes = operation.consequential && !operation.undoable ? 'Yes, it cannot be undone' : 'Yes';

  return (
    <div
      ref={panel}
      data-ai-approval=""
      role="dialog"
      aria-label={`Approve: ${operation.title}`}
      aria-busy={running}
      tabIndex={-1}
      onKeyDown={onKey}
      className="mt-2 max-h-[55vh] overflow-y-auto rounded-md border border-[var(--term-accent)] bg-[var(--term-bg)] px-3 py-2 outline-none"
    >
      <p className="mb-1 break-words font-semibold text-[var(--term-text)]">
        {/* Always the same question (1.73.1): the card's verb is a button's label, often the title clipped ("Test client
            Amara Okafor with spousal..."), and read as a question it was nonsense. What runs is the card above. */}
        Run this?
        <span className="ml-2 font-normal text-[12px] text-[var(--term-dim)]">the reason goes in the audit</span>
      </p>
      {operation.consequential && !operation.undoable ? (
        <p className="mb-1 text-[12px] text-[var(--term-warn)]">This cannot be undone.</p>
      ) : null}

      <ul className="space-y-0.5" role="radiogroup" aria-label="Approve or decline">
        {reasons.map((reason, i) => (
          <li key={reason}>
            <button type="button" data-row="" role="radio" aria-checked={false} disabled={running} onClick={() => void approve(reason)} className={`${ROW} hover:bg-[var(--term-selection)]`}>
              <span aria-hidden="true" className="w-5 shrink-0 tabular-nums text-[var(--term-dim)]">{i + 1}.</span>
              <span className="min-w-0 flex-1 break-words">
                <span className="text-[var(--term-ok)]">{yes}:</span> <span className="text-[var(--term-text)]">{reason}</span>
              </span>
            </button>
          </li>
        ))}
        <li>
          <label className="flex w-full items-center gap-2 px-2 py-1">
            <span aria-hidden="true" className="w-5 shrink-0 tabular-nums text-[var(--term-dim)]">{ownRow}.</span>
            <input
              data-row=""
              value={own}
              disabled={running}
              placeholder={`${yes}, with my own reason…`}
              aria-label={`${yes}, with my own reason`}
              onChange={(e) => setOwn(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                void approve(own);
              }}
              className="min-w-0 flex-1 rounded border border-[var(--term-border)] bg-[var(--term-bg)] px-3 py-1 text-[13px] text-[var(--term-text)] outline-none placeholder:text-[var(--term-dim)] focus-visible:border-[var(--term-accent)]"
            />
          </label>
        </li>
        <li>
          <button type="button" data-row="" role="radio" aria-checked={false} disabled={running} onClick={onDecline} className={`${ROW} hover:bg-[var(--term-selection)]`}>
            <span aria-hidden="true" className="w-5 shrink-0 tabular-nums text-[var(--term-dim)]">{noRow}.</span>
            <span className="min-w-0 flex-1 break-words text-[var(--term-text)]">No, tell {assistantName} what to change</span>
            <span aria-hidden="true" className="shrink-0 text-[11px] text-[var(--term-dim)]">Esc</span>
          </button>
        </li>
      </ul>

      {running ? <p role="status" className="mt-1 px-2 text-[12px] text-[var(--term-dim)]">… Running</p> : null}
      {refusal ? <p role="alert" className="mt-1 break-words px-2 text-[12px] text-[var(--term-fail)]">{refusal}</p> : null}
    </div>
  );
}
