import React from 'react';

import { LEVEL_LABELS } from './transcript';
import { TerminalQuestionLog } from './TerminalQuestion';
import type { TerminalLevel, TerminalLine } from './types';

/**
 * The transcript, line by line, in the console's marks (design section 3): `❯` an ask, `●` a step,
 * `✻` the assistant's thinking, `⎿` a detail, `◆` the reply, `✓ ○ ✗` the outcome, `▸` a plan, `?` a
 * question, `—` a note. Every colour is a `--term-*` variable, so a theme is values only.
 *
 * ⚠ FOLDED, NEVER CUT (1.45.0, owner 2026-11-09). A long reply or detail shows its first lines and
 * "+N lines"; thinking folds to "Thought for 12s" once anything follows it; a rewound turn folds into its
 * ask line. Each opens with a click or Enter, and Ctrl+O opens everything.
 */

const MARK = 'w-4 shrink-0 select-none text-center';
const TOGGLE = 'whitespace-nowrap text-[11px] text-[var(--term-dim)] underline decoration-dotted underline-offset-2 outline-none hover:text-[var(--term-accent)] focus-visible:text-[var(--term-accent)]';

/** Lines shown of a folded entry. */
const FOLD_AT = { reply: 8, detail: 3 } as const;

/** About this many characters make one line of the panel at its usual width. */
const CHARS_PER_LINE = 90;

function seconds(ms: number | null): string | null {
  if (ms === null || ms <= 0) return null;

  return ms < 1000 ? '<1s' : `${Math.round(ms / 1000)}s`;
}

/** The first lines of a long text, cut at a word, and how many lines are folded away. */
export function foldText(text: string, lines: number): { head: string; hidden: number } {
  const rows = text.split('\n');
  const budget = lines * CHARS_PER_LINE;
  let head = '';
  let used = 0;

  for (const row of rows) {
    const cost = Math.max(1, Math.ceil(row.length / CHARS_PER_LINE));

    if (used + cost > lines) {
      const room = (lines - used) * CHARS_PER_LINE;

      if (room > 20) {
        const cut = row.slice(0, room);
        const space = cut.lastIndexOf(' ');

        head += `${head ? '\n' : ''}${(space > room * 0.5 ? cut.slice(0, space) : cut).trimEnd()}…`;
      }

      break;
    }

    head += `${head ? '\n' : ''}${row}`;
    used += cost;
  }

  const total = rows.reduce((n, row) => n + Math.max(1, Math.ceil(row.length / CHARS_PER_LINE)), 0);

  return text.length <= budget && rows.length <= lines ? { head: text, hidden: 0 } : { head, hidden: Math.max(1, total - lines) };
}

/** Bold runs written as **this** in a reply; nothing else of Markdown is drawn in a terminal. */
function emphasised(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
      <strong key={i} className="font-semibold text-[var(--term-text)]">{part.slice(2, -2)}</strong>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    ),
  );
}

function FoldToggle({ open, hidden, onToggle }: { open: boolean; hidden: number; onToggle?: () => void }): React.JSX.Element | null {
  if (!onToggle) return null;

  return (
    <button type="button" aria-expanded={open} onClick={onToggle} className={`${TOGGLE} mt-0.5 block`}>
      {open ? 'Fold' : `+${hidden} ${hidden === 1 ? 'line' : 'lines'} (ctrl+o to open all)`}
    </button>
  );
}

const FINDING: Record<string, { mark: string; tone: string; label: string }> = {
  issue: { mark: '⚠', tone: 'text-[var(--term-warn)]', label: 'Issue' },
  error: { mark: '✗', tone: 'text-[var(--term-fail)]', label: 'Error' },
  gap: { mark: '◇', tone: 'text-[var(--term-warn)]', label: 'Gap' },
  suggestion: { mark: '✦', tone: 'text-[var(--term-accent)]', label: 'Suggestion' },
};

export interface TerminalLinesProps {
  lines: TerminalLine[];
  /** "Rewind to before this" on an outcome: the ask's turn id. */
  onRewind?: (turnId: string) => void;
  onBuildPlan?: () => void;
  onDismissPlan?: () => void;
  /** Words for the plan buttons ("Build this"). */
  buildLabel?: string;
  /** Open or fold one entry (thinking, a long reply or detail, a rewound turn), by its key. */
  onToggle?: (key: string) => void;
  /** "Try again at Pro" on a failed answer: the ask's turn id and the level to try. */
  onRetry?: (turnId: string, level: TerminalLevel) => void;
  /**
   * The open questions the picker is asking right now (their line key), drawn over the composer by the
   * console (1.46.0). The transcript only says "answer below" for them.
   */
  asking?: string | null;
  /** "Answer them now" on open questions the person set aside to chat about: their line key. */
  onReopenQuestions?: (key: string) => void;
  /** "Do this" on a suggestion, and "Build this" on a brainstorm's recommendation: the next ask. */
  onSuggestion?: (text: string) => void;
}

export function TerminalLines({ lines, onRewind, onBuildPlan, onDismissPlan, buildLabel = 'Build this', onToggle, onRetry, asking = null, onReopenQuestions, onSuggestion }: TerminalLinesProps): React.JSX.Element {
  return (
    <>
      {lines.map((line, index) => {
        const muted = 'muted' in line && line.muted ? 'opacity-50' : '';
        const toggle = onToggle ? (key: string) => () => onToggle(key) : () => undefined;

        switch (line.kind) {
          case 'ask':
            return (
              <div key={line.key} className={`${index === 0 ? '' : 'mt-4'} flex gap-2 rounded-md border-l-2 border-[var(--term-accent)] bg-[var(--term-bar)] py-1.5 pl-2 pr-3 ${muted}`}>
                <span aria-hidden="true" className={`${MARK} font-bold text-[var(--term-accent)]`}>❯</span>
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-wrap break-words text-[var(--term-text)]">{line.text}</p>
                  {(line.answers ?? []).map((a) => (
                    <p key={a.question} className="mt-0.5 break-words text-[12px] text-[var(--term-dim)]">⎿ {a.question} <span className="text-[var(--term-text)]">{a.answer}</span></p>
                  ))}
                  {line.chips.length > 0 || line.muted === 'rewound' ? (
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--term-dim)]">
                      {line.chips.map((chip) => (
                        <span key={chip} className="rounded border border-[var(--term-border)] px-1.5">{chip}</span>
                      ))}
                      {line.muted === 'rewound' ? <span className="rounded border border-[var(--term-border)] px-1.5">rewound</span> : null}
                      {line.foldKey && onToggle ? (
                        <button type="button" aria-expanded={line.folded === undefined} onClick={toggle(line.foldKey)} className={TOGGLE}>
                          {line.folded === undefined ? 'Fold' : `+${line.folded} ${line.folded === 1 ? 'line' : 'lines'}`}
                        </button>
                      ) : null}
                    </p>
                  ) : null}
                </div>
              </div>
            );

          case 'step':
            return (
              <div key={line.key} className={`mt-1 flex gap-2 ${muted}`}>
                <span aria-hidden="true" className={`${MARK} ${line.live ? 'text-[var(--term-accent)] motion-safe:animate-pulse' : 'text-[var(--term-ok)]'}`}>●</span>
                <span className="min-w-0 flex-1 break-words text-[var(--term-text)]">
                  {line.text}
                  {line.live ? <span aria-hidden="true" className="ml-1 inline-block h-[1em] w-[0.55em] translate-y-[2px] bg-[var(--term-accent)] motion-safe:animate-pulse" /> : null}
                </span>
                {seconds(line.ms) ? <span className="shrink-0 tabular-nums text-[11px] text-[var(--term-dim)]">{seconds(line.ms)}</span> : null}
              </div>
            );

          case 'thinking': {
            const took = seconds(line.ms);

            return (
              <div key={line.key} className={`mt-1 ${muted}`}>
                <button
                  type="button"
                  aria-expanded={line.open}
                  disabled={line.live || !onToggle || line.text === ''}
                  onClick={toggle(line.key)}
                  className="flex w-full gap-2 text-left italic text-[var(--term-dim)] outline-none hover:text-[var(--term-text)] focus-visible:text-[var(--term-text)] disabled:hover:text-[var(--term-dim)]"
                >
                  <span aria-hidden="true" className={`${MARK} not-italic ${line.live ? 'text-[var(--term-accent)] motion-safe:animate-pulse' : ''}`}>✻</span>
                  <span className="min-w-0 flex-1">
                    {line.live ? 'Thinking…' : took ? `Thought for ${took}` : 'Thought it through'}
                    {!line.live && line.text !== '' ? <span className="not-italic text-[11px]"> {line.open ? '(fold)' : '(open)'}</span> : null}
                  </span>
                </button>
                {line.open && line.text !== '' ? (
                  <p className="ml-6 mt-0.5 whitespace-pre-wrap break-words border-l border-[var(--term-border)] pl-3 italic text-[var(--term-dim)]">{line.text}</p>
                ) : null}
              </div>
            );
          }

          case 'detail': {
            const fold = foldText(line.text, FOLD_AT.detail);
            const shown = line.open || fold.hidden === 0 ? line.text : fold.head;

            return (
              <div key={line.key} className={`flex gap-2 text-[var(--term-dim)] ${muted}`}>
                <span aria-hidden="true" className="ml-4 w-4 shrink-0 select-none">⎿</span>
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-wrap break-words">{shown}</p>
                  {fold.hidden > 0 ? <FoldToggle open={line.open} hidden={fold.hidden} onToggle={onToggle ? toggle(line.key) : undefined} /> : null}
                </div>
              </div>
            );
          }

          case 'reply': {
            const fold = foldText(line.text, FOLD_AT.reply);
            const shown = line.open || fold.hidden === 0 ? line.text : fold.head;

            return (
              <div key={line.key} className={`mt-2 flex gap-2 ${muted}`}>
                <span aria-hidden="true" className={`${MARK} text-[var(--term-accent)]`}>◆</span>
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-wrap break-words text-[var(--term-text)]">{emphasised(shown)}</p>
                  {fold.hidden > 0 ? <FoldToggle open={line.open} hidden={fold.hidden} onToggle={onToggle ? toggle(line.key) : undefined} /> : null}
                </div>
              </div>
            );
          }

          case 'finding': {
            const look = FINDING[line.findingKind] ?? { mark: '•', tone: 'text-[var(--term-dim)]', label: 'Note' };

            return (
              <div key={line.key} className={`flex gap-2 ${muted}`}>
                <span aria-hidden="true" className={`ml-4 w-4 shrink-0 select-none text-center ${look.tone}`}>{look.mark}</span>
                <p className="min-w-0 flex-1 break-words text-[var(--term-text)]">
                  <span className={`font-semibold ${look.tone}`}>{look.label}:</span> {line.text}
                  {line.findingKind === 'suggestion' && line.actionable && onSuggestion ? (
                    <button type="button" onClick={() => onSuggestion(line.text)} className={`${TOGGLE} ml-2`}>Do this</button>
                  ) : null}
                </p>
              </div>
            );
          }

          case 'question':
            return (
              <div key={line.key} className={muted}>
                <TerminalQuestionLog
                  questions={line.questions}
                  answers={line.answers}
                  state={line.answers.length > 0 ? 'answered' : !line.answerable ? 'closed' : asking === line.key ? 'asking' : onReopenQuestions ? 'aside' : 'closed'}
                  onReopen={onReopenQuestions ? () => onReopenQuestions(line.key) : undefined}
                />
              </div>
            );

          case 'ideas':
            return (
              <div key={line.key} className={`mt-2 rounded-md border border-[var(--term-border)] px-3 py-2 ${muted}`}>
                {line.ideas.length > 0 ? (
                  <ul className="space-y-1">
                    {line.ideas.map((idea) => (
                      <li key={idea.title} className="flex gap-2">
                        <span aria-hidden="true" className={`${MARK} text-[var(--term-accent)]`}>◇</span>
                        <span className="min-w-0 flex-1 break-words">
                          <span className="text-[var(--term-text)]">{idea.title}</span>
                          {idea.why ? <span className="block whitespace-pre-wrap text-[12px] text-[var(--term-dim)]">{idea.why}</span> : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {line.recommendation ? (
                  <div className={`${line.ideas.length > 0 ? 'mt-2 border-t border-[var(--term-border)] pt-2' : ''} flex gap-2`}>
                    <span aria-hidden="true" className={`${MARK} text-[var(--term-ok)]`}>★</span>
                    <div className="min-w-0 flex-1">
                      <p className="whitespace-pre-wrap break-words text-[var(--term-text)]"><span className="font-semibold">Recommended:</span> {line.recommendation}</p>
                      {line.open && onSuggestion ? (
                        <button type="button" onClick={() => onSuggestion(line.recommendation as string)} className="mt-2 whitespace-nowrap rounded bg-[var(--term-accent)] px-3 py-1 text-[12px] font-semibold text-[var(--term-on-accent)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--term-text)]">
                          {buildLabel}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {line.level ? <p className="mt-1 text-right text-[11px] text-[var(--term-dim)]">{line.level}</p> : null}
              </div>
            );

          case 'outcome': {
            const tone = line.tone === 'ok' ? 'text-[var(--term-ok)]' : line.tone === 'fail' ? 'text-[var(--term-fail)]' : 'text-[var(--term-dim)]';

            return (
              <div key={line.key} className={`mt-1 flex flex-wrap items-baseline gap-x-2 ${muted}`}>
                <span aria-hidden="true" className={`${MARK} ${tone}`}>{line.tone === 'ok' ? '✓' : line.tone === 'fail' ? '✗' : '○'}</span>
                <span className={`min-w-0 flex-1 break-words ${tone}`}>
                  {line.text}
                  {line.level ? <span className="text-[11px] text-[var(--term-dim)]"> · {line.level}</span> : null}
                </span>
                {line.retry && line.turnId && onRetry ? (
                  <button type="button" onClick={() => onRetry(line.turnId as string, line.retry as TerminalLevel)} className={TOGGLE}>
                    Try again at {LEVEL_LABELS[line.retry]}
                  </button>
                ) : null}
                {line.canRewind && line.turnId && onRewind ? (
                  <button type="button" onClick={() => onRewind(line.turnId as string)} className={TOGGLE}>
                    Rewind to before this
                  </button>
                ) : null}
              </div>
            );
          }

          case 'plan':
            return (
              <div key={line.key} className={`mt-2 rounded-md border border-[var(--term-border)] px-3 py-2 ${muted}`}>
                <p className="flex gap-2">
                  <span aria-hidden="true" className={`${MARK} text-[var(--term-accent)]`}>▸</span>
                  <span className="min-w-0 flex-1 font-semibold text-[var(--term-text)]">{line.summary}</span>
                  {line.level ? <span className="shrink-0 text-[11px] text-[var(--term-dim)]">{line.level}</span> : null}
                </p>
                <ol className="ml-6 mt-1 list-decimal space-y-0.5 pl-4 text-[var(--term-dim)]">
                  {line.steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
                {line.open && (onBuildPlan || onDismissPlan) ? (
                  <div className="ml-6 mt-2 flex gap-2">
                    {onBuildPlan ? (
                      <button type="button" onClick={onBuildPlan} className="whitespace-nowrap rounded bg-[var(--term-accent)] px-3 py-1 text-[12px] font-semibold text-[var(--term-on-accent)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--term-text)]">
                        {buildLabel}
                      </button>
                    ) : null}
                    {onDismissPlan ? (
                      <button type="button" onClick={onDismissPlan} className="whitespace-nowrap rounded border border-[var(--term-border)] px-3 py-1 text-[12px] text-[var(--term-dim)] outline-none hover:text-[var(--term-text)] focus-visible:ring-2 focus-visible:ring-[var(--term-accent)]">
                        Dismiss
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );

          case 'recap':
            return (
              <div key={line.key} role="note" aria-label="Recap" className="my-3 rounded-md border border-dashed border-[var(--term-border)] px-3 py-2">
                <p className="text-[11px] font-semibold text-[var(--term-accent)]">Recap</p>
                {line.lines.map((text) => (
                  <p key={text} className="break-words text-[var(--term-text)]">{text}</p>
                ))}
              </div>
            );

          case 'system':
            return (
              <p key={line.key} className={`my-2 text-center text-[11px] ${line.tone === 'fail' ? 'text-[var(--term-fail)]' : line.tone === 'ok' ? 'text-[var(--term-ok)]' : 'text-[var(--term-dim)]'}`}>
                — {line.text} —
              </p>
            );

          case 'queued':
            return (
              <div key={line.key} className="mt-2 flex gap-2 italic text-[var(--term-dim)]">
                <span aria-hidden="true" className={MARK}>❯</span>
                <span className="min-w-0 flex-1 break-words">next: {line.text}</span>
              </div>
            );

          default:
            return null;
        }
      })}
    </>
  );
}
