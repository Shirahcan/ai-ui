import React, { useState } from 'react';

import { outcomeLine } from './transcript';
import type { TerminalTurn } from './types';
import { TerminalView } from './TerminalViews';

/** What a rewind does: the design, the conversation, both, or a summary from or up to the ask. */
export type TerminalRewindChoice = 'both' | 'conversation' | 'design' | 'summarise_from' | 'summarise_upto';

interface Ask {
  id: string;
  text: string;
  at: string | null;
  /** The answer changed the design, so the design can be put back to before it. */
  changed: boolean;
  outcome: string;
}

/** The asks still in the conversation, newest first, each with what came of it. */
export function rewindableAsks(turns: TerminalTurn[]): Ask[] {
  const asks: Ask[] = [];

  turns.forEach((turn, i) => {
    if (turn.role !== 'user' || turn.rewound) return;
    const answer = turns[i + 1]?.role === 'assistant' ? turns[i + 1] : null;
    const outcome = answer?.structured?.plan ? { tone: 'none' as const, text: 'Plan only, nothing changed' } : outcomeLine(answer?.structured?.outcome);

    asks.push({ id: turn.id, text: (turn.body ?? '').trim(), at: turn.at, changed: Boolean(answer?.structured?.outcome?.changed), outcome: answer ? outcome.text : 'No answer recorded' });
  });

  return asks.reverse();
}

/**
 * The rewind menu (Claude Code's, design section 10): pick an ask, then what to restore. Restoring the
 * design changes it for everyone editing it, and the menu says so before anything happens.
 */
export function TerminalRewind({ turns, subject, initial = null, onChoose, onBack }: {
  turns: TerminalTurn[];
  subject: string;
  /** Open straight on one ask (an outcome's "Rewind to before this"). */
  initial?: string | null;
  onChoose: (turnId: string, choice: TerminalRewindChoice, focus?: string) => void;
  onBack: () => void;
}): React.JSX.Element {
  const asks = rewindableAsks(turns);
  const [picked, setPicked] = useState<string | null>(initial);
  const [focus, setFocus] = useState('');
  const ask = asks.find((a) => a.id === picked) ?? null;

  if (!ask) {
    return (
      <TerminalView title="Rewind" onBack={onBack}>
        {asks.length === 0 ? (
          <p className="text-[var(--term-dim)]">Nothing to rewind in this session yet.</p>
        ) : (
          <>
            <p className="mb-2 text-[var(--term-dim)]">Go back to before which ask?</p>
            <ul className="space-y-1">
              {asks.map((a, i) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => setPicked(a.id)}
                    className="flex w-full gap-3 rounded px-2 py-1.5 text-left outline-none hover:bg-[var(--term-selection)] focus-visible:bg-[var(--term-selection)]"
                  >
                    <span className="w-5 shrink-0 tabular-nums text-[var(--term-dim)]">{i + 1}.</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[var(--term-text)]">{a.text}</span>
                      <span className="block truncate text-[11px] text-[var(--term-dim)]">{a.outcome}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </TerminalView>
    );
  }

  const option = (choice: TerminalRewindChoice, label: string, detail: string, enabled = true) => (
    <li key={choice}>
      <button
        type="button"
        disabled={!enabled}
        onClick={() => onChoose(ask.id, choice, focus.trim() || undefined)}
        className="w-full rounded px-2 py-1.5 text-left outline-none hover:bg-[var(--term-selection)] focus-visible:bg-[var(--term-selection)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span className="block text-[var(--term-text)]">{label}</span>
        <span className="block text-[11px] text-[var(--term-dim)]">{detail}</span>
      </button>
    </li>
  );

  return (
    <TerminalView title="Rewind" onBack={() => (initial ? onBack() : setPicked(null))}>
      <p className="text-[var(--term-dim)]">Before: <span className="text-[var(--term-text)]">{ask.text}</span></p>
      {ask.changed ? (
        <p className="mt-2 text-[var(--term-warn)]">Restoring the {subject} changes it for everyone editing it. The editor&apos;s own undo can bring it back.</p>
      ) : null}
      <ul className="mt-3 space-y-1">
        {option('both', `Restore the ${subject} and the conversation`, `The ${subject} as it was before this ask, and this ask and everything after it left out of the context.`, ask.changed)}
        {option('conversation', 'Restore the conversation', `Leave the ${subject} as it is now; this ask and everything after it leave the context (kept on screen, dimmed).`)}
        {option('design', `Restore the ${subject}`, `Put the ${subject} back as it was before this ask; the conversation stays.`, ask.changed)}
        {option('summarise_from', 'Summarise from here', 'Fold this ask and everything after it into the session summary.')}
        {option('summarise_upto', 'Summarise up to here', 'Fold everything before this ask into the session summary.')}
      </ul>
      <label htmlFor="terminal-rewind-focus" className="mt-3 block text-[11px] text-[var(--term-dim)]">Focus for a summary (optional)</label>
      <input
        id="terminal-rewind-focus"
        name="terminal-rewind-focus"
        value={focus}
        onChange={(event) => setFocus(event.target.value)}
        maxLength={500}
        className="mt-1 w-full rounded border border-[var(--term-border)] bg-[var(--term-bar)] px-3 py-2 font-[inherit] text-[12px] text-[var(--term-text)] outline-none focus-visible:border-[var(--term-accent)]"
        placeholder="keep the decisions about colours"
      />
    </TerminalView>
  );
}
