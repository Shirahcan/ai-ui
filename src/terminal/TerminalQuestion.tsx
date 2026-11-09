import React, { useEffect, useRef, useState } from 'react';

import type { TerminalAnswer, TerminalOption, TerminalQuestion as Question } from './types';

/**
 * The assistant's questions, asked as Claude Code asks them (1.46.0, owner 2026-11-09: "should properly
 * mirror Claude Code: it should show over the composer ... should also include the 'chat about this'
 * option").
 *
 * TWO PIECES. While questions wait for an answer, `TerminalQuestionBlock` takes the composer's place at
 * the bottom of the console (the composer comes back the moment they are answered or set aside). The
 * transcript keeps only `TerminalQuestionLog`: each question and, once given, its answer.
 *
 * The picker: each question lists its choices, numbered, with what each means and the recommended one
 * badged; then "Type something" for an answer of the person's own; then "Chat about this", which puts
 * the composer back so the person can talk it through instead (the questions stay in the transcript with
 * a way back to them). Several questions are tabs, one per question, with a last "Submit" tab that reviews
 * the answers. Keys: Up and Down move, Enter picks, 1-9 pick by number, Left and Right change tabs, Esc
 * chats instead. One question with one answer to pick sends the moment it is picked, as Claude Code does.
 *
 * ⚠ THE ANSWER IS AN ASK. Sending starts the next turn with the answers beside the ask, so a reload, the
 * transcript and the assistant's next context all hold the same thing.
 */

const RECOMMENDED_SUFFIX = /\s*\(recommended\)\s*$/i;

/** An option as drawn: a "(Recommended)" written into the label becomes the badge, once. */
function shown(option: TerminalOption): { label: string; recommended: boolean } {
  const suffixed = RECOMMENDED_SUFFIX.test(option.label);

  return { label: option.label.replace(RECOMMENDED_SUFFIX, ''), recommended: Boolean(option.recommended) || suffixed };
}

/** A tab's name: the question's own short header, else its number. */
function tabName(question: Question, index: number): string {
  const header = (question.header ?? '').trim();

  return header !== '' ? header : `Question ${index + 1}`;
}

const TAB = 'whitespace-nowrap rounded px-2 py-0.5 text-[12px] outline-none focus-visible:ring-1 focus-visible:ring-[var(--term-accent)]';
const ROW = 'flex w-full gap-2 rounded px-2 py-1 text-left outline-none focus-visible:bg-[var(--term-selection)] focus-visible:ring-1 focus-visible:ring-[var(--term-accent)]';
const PRIMARY = 'whitespace-nowrap rounded bg-[var(--term-accent)] px-3 py-1 text-[12px] font-semibold text-[var(--term-on-accent)] outline-none disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-[var(--term-text)]';

/** The focus is in the console already (or nowhere): taking the composer's place may take its focus. */
function focusIsHere(panel: HTMLElement): boolean {
  const active = document.activeElement;

  if (active === null || active === document.body) return true;

  return Boolean((panel.closest('[data-ai-terminal]') ?? panel).contains(active));
}

export function TerminalQuestionBlock({
  questions,
  onAnswer,
  onChat,
}: {
  questions: Question[];
  onAnswer: (answers: TerminalAnswer[]) => void;
  /** "Chat about this", and Esc: the questions step aside and the composer comes back. */
  onChat: () => void;
}): React.JSX.Element {
  const [picked, setPicked] = useState<string[][]>(() => questions.map(() => []));
  const [other, setOther] = useState<string[]>(() => questions.map(() => ''));
  // Several questions are tabs; the last tab (index = questions.length) is the summary.
  const [tab, setTab] = useState(0);
  const panel = useRef<HTMLDivElement | null>(null);
  const firstDraw = useRef(true);
  const tabbed = questions.length > 1;
  const summary = tabbed && tab === questions.length;

  const answerFor = (i: number, picks: string[][] = picked, typed: string[] = other): string => {
    const own = (typed[i] ?? '').trim();

    return [...(picks[i] ?? []), ...(own !== '' ? [own] : [])].join(', ');
  };
  const ready = questions.every((_, i) => answerFor(i) !== '');

  // The first choice of the tab on show takes the focus, so the keys work at once and keep working after
  // a pick moves on (the picked row is gone with its tab). On the first draw only when the console holds
  // the focus already: a question arriving never pulls the cursor out of the page.
  useEffect(() => {
    const here = panel.current;

    if (!here) return;
    if (firstDraw.current) {
      firstDraw.current = false;
      if (!focusIsHere(here)) return;
    }
    (here.querySelector<HTMLElement>('[data-row]') ?? here).focus();
  }, [tab]);

  const go = (next: number) => setTab(Math.max(0, Math.min(questions.length, next)));

  const send = (picks: string[][] = picked, typed: string[] = other) => {
    if (!questions.every((_, i) => answerFor(i, picks, typed) !== '')) return;

    onAnswer(questions.map((q, i) => ({ question: q.text, answer: answerFor(i, picks, typed) })));
  };

  const pick = (qi: number, label: string) => {
    const multi = questions[qi]?.multi ?? false;
    const already = (picked[qi] ?? []).includes(label);
    const picks = picked.map((list, i) => {
      if (i !== qi) return list;
      if (multi) return already ? list.filter((l) => l !== label) : [...list, label];

      return [label];
    });
    const typed = multi ? other : other.map((t, i) => (i === qi ? '' : t));

    setPicked(picks);
    setOther(typed);
    if (multi) return;
    // One question: picking is answering (Claude Code). Several: on to the next tab.
    if (tabbed) go(qi + 1);
    else send(picks, typed);
  };

  const typedDone = (qi: number) => {
    if ((other[qi] ?? '').trim() === '') return;
    if (tabbed) go(qi + 1);
    else send();
  };

  const onKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;

    if (event.key === 'Escape') {
      // Kept from the console's own Esc (stop, rewind): here it only sets the questions aside.
      event.preventDefault();
      event.stopPropagation();
      onChat();

      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const rows = [...(panel.current?.querySelectorAll<HTMLElement>('[data-row]') ?? [])];

      if (rows.length > 0) {
        event.preventDefault();
        const at = rows.indexOf(target);
        const step = event.key === 'ArrowDown' ? 1 : -1;

        rows[(at + step + rows.length) % rows.length]?.focus();
      }

      return;
    }

    if (target.tagName === 'INPUT') return;

    if (tabbed && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
      event.preventDefault();
      go(tab + (event.key === 'ArrowRight' ? 1 : -1));

      return;
    }

    const n = Number(event.key);
    const option = !summary && Number.isInteger(n) && n >= 1 ? questions[tab]?.options[n - 1] : undefined;

    if (option) {
      event.preventDefault();
      pick(tab, option.label);
    }
  };

  const question = summary ? null : (questions[tab] ?? null);
  const qi = tab;
  const count = question?.options.length ?? 0;

  return (
    <div
      ref={panel}
      data-ai-question=""
      role="dialog"
      aria-label={tabbed ? `${questions.length} questions to answer` : 'A question to answer'}
      tabIndex={-1}
      onKeyDown={onKey}
      className="mt-2 max-h-[55vh] overflow-y-auto rounded-md border border-[var(--term-accent)] bg-[var(--term-bg)] px-3 py-2 outline-none"
    >
      {tabbed ? (
        <div role="tablist" aria-label="Questions" className="mb-2 flex flex-wrap items-center gap-1 border-b border-[var(--term-border)] pb-2">
          <button type="button" tabIndex={-1} aria-label="Previous question" disabled={tab === 0} onClick={() => go(tab - 1)} className={`${TAB} text-[var(--term-dim)] disabled:opacity-40`}>←</button>
          {questions.map((q, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              tabIndex={-1}
              aria-selected={tab === i}
              onClick={() => go(i)}
              className={`${TAB} ${tab === i ? 'bg-[var(--term-accent)] font-semibold text-[var(--term-on-accent)]' : 'text-[var(--term-text)] hover:bg-[var(--term-selection)]'}`}
            >
              {/* ✓ and ○, not ☒ and ☐: at the console's size a crossed box reads as an empty one. */}
              <span aria-hidden="true">{answerFor(i) !== '' ? '✓' : '○'} </span>
              {tabName(q, i)}
            </button>
          ))}
          <button
            type="button"
            role="tab"
            tabIndex={-1}
            aria-selected={summary}
            onClick={() => go(questions.length)}
            className={`${TAB} ${summary ? 'bg-[var(--term-accent)] font-semibold text-[var(--term-on-accent)]' : 'text-[var(--term-text)] hover:bg-[var(--term-selection)]'}`}
          >
            <span aria-hidden="true">{ready ? '✔' : '·'} </span>Submit
          </button>
          <button type="button" tabIndex={-1} aria-label="Next question" disabled={summary} onClick={() => go(tab + 1)} className={`${TAB} text-[var(--term-dim)] disabled:opacity-40`}>→</button>
        </div>
      ) : null}

      {question ? (
        <div role={tabbed ? 'tabpanel' : 'group'} aria-label={question.text}>
          <p className="mb-1 whitespace-pre-wrap break-words font-semibold text-[var(--term-text)]">{question.text}</p>
          <ul className="space-y-0.5" role={question.multi ? 'group' : 'radiogroup'} aria-label={question.multi ? 'Pick any' : 'Pick one'}>
            {question.options.map((option, oi) => {
              const on = (picked[qi] ?? []).includes(option.label);
              const look = shown(option);

              return (
                <li key={option.label}>
                  <button
                    type="button"
                    data-row=""
                    role={question.multi ? 'checkbox' : 'radio'}
                    aria-checked={on}
                    onClick={() => pick(qi, option.label)}
                    className={`${ROW} ${on ? 'bg-[var(--term-selection)]' : 'hover:bg-[var(--term-selection)]'}`}
                  >
                    <span aria-hidden="true" className="w-5 shrink-0 tabular-nums text-[var(--term-dim)]">{oi + 1}.</span>
                    {question.multi ? <span aria-hidden="true" className={`shrink-0 ${on ? 'text-[var(--term-accent)]' : 'text-[var(--term-dim)]'}`}>{on ? '[x]' : '[ ]'}</span> : null}
                    <span className="min-w-0 flex-1">
                      <span className={on ? 'font-semibold text-[var(--term-accent)]' : 'text-[var(--term-text)]'}>{look.label}</span>
                      {look.recommended ? (
                        <span className="ml-2 rounded border border-[var(--term-ok)] px-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--term-ok)]">Recommended</span>
                      ) : null}
                      {option.description ? <span className="block text-[12px] text-[var(--term-dim)]">{option.description}</span> : null}
                    </span>
                  </button>
                </li>
              );
            })}
            <li>
              <label className="flex w-full items-center gap-2 px-2 py-1">
                <span aria-hidden="true" className="w-5 shrink-0 tabular-nums text-[var(--term-dim)]">{count + 1}.</span>
                <input
                  data-row=""
                  value={other[qi] ?? ''}
                  placeholder={count > 0 ? 'Type something.' : 'Type your answer.'}
                  aria-label={count > 0 ? 'Type something else' : 'Your answer'}
                  onChange={(e) => {
                    const text = e.target.value;

                    setOther((all) => all.map((t, i) => (i === qi ? text : t)));
                    if (!question.multi && text.trim() !== '') setPicked((all) => all.map((list, i) => (i === qi ? [] : list)));
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    typedDone(qi);
                  }}
                  className="min-w-0 flex-1 rounded border border-[var(--term-border)] bg-[var(--term-bg)] px-3 py-1 text-[13px] text-[var(--term-text)] outline-none placeholder:text-[var(--term-dim)] focus-visible:border-[var(--term-accent)]"
                />
              </label>
            </li>
          </ul>
          {question.multi ? (
            <div className="mt-1 px-2">
              <button type="button" data-row="" onClick={() => (tabbed ? go(qi + 1) : send())} disabled={answerFor(qi) === ''} className={PRIMARY}>
                {tabbed ? 'Next' : 'Send'}
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div role="tabpanel" aria-label="Review your answers">
          <p className="font-semibold text-[var(--term-text)]">Review your answers</p>
          <ul className="mt-1 space-y-1">
            {questions.map((q, i) => {
              const answer = answerFor(i);

              return (
                <li key={i} className="flex gap-2">
                  <span aria-hidden="true" className={`w-4 shrink-0 text-center ${answer ? 'text-[var(--term-ok)]' : 'text-[var(--term-warn)]'}`}>{answer ? '●' : '○'}</span>
                  <span className="min-w-0 flex-1 break-words">
                    <span className="text-[var(--term-dim)]">{q.text}</span>
                    <br />
                    {answer ? (
                      <span className="text-[var(--term-text)]">→ {answer}</span>
                    ) : (
                      <button type="button" onClick={() => go(i)} className="text-[12px] text-[var(--term-warn)] underline decoration-dotted underline-offset-2 outline-none focus-visible:text-[var(--term-accent)]">
                        Not answered yet: answer it
                      </button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          <button type="button" data-row="" onClick={() => send()} disabled={!ready} className={`${PRIMARY} mt-2`}>
            Send answers
          </button>
        </div>
      )}

      <div className="mt-2 border-t border-[var(--term-border)] pt-1">
        <button type="button" data-row="" onClick={onChat} className={`${ROW} text-[var(--term-dim)] hover:bg-[var(--term-selection)] hover:text-[var(--term-text)]`}>
          <span aria-hidden="true" className="w-5 shrink-0 text-center">↩</span>
          <span className="min-w-0 flex-1">
            <span className="text-[var(--term-text)]">Chat about this</span>
            <span className="block text-[12px]">Set {tabbed ? 'these questions' : 'this question'} aside and reply in your own words.</span>
          </span>
        </button>
      </div>
      <p className="mt-1 px-2 text-[11px] text-[var(--term-dim)]">
        enter to select · ↑↓ to move{count > 0 ? ` · 1-${count} to pick` : ''}{tabbed ? ' · ←→ tabs' : ''} · esc to chat instead
      </p>
    </div>
  );
}

/**
 * The questions as the transcript keeps them: each question and, once given, its answer. While they are
 * still open it says where to answer them, or, once set aside to chat, offers the way back.
 */
export function TerminalQuestionLog({
  questions,
  answers,
  state,
  onReopen,
}: {
  questions: Question[];
  answers: TerminalAnswer[];
  /** asking: the picker is up · aside: the person chose to chat about it · closed: no longer open. */
  state: 'answered' | 'asking' | 'aside' | 'closed';
  onReopen?: () => void;
}): React.JSX.Element {
  return (
    <div className="mt-2">
      {questions.map((q, qi) => {
        const given = answers.find((a) => a.question === q.text)?.answer ?? null;

        return (
          <div key={qi} className={qi > 0 ? 'mt-1' : ''}>
            <p className="flex gap-2">
              <span aria-hidden="true" className="w-4 shrink-0 select-none text-center text-[var(--term-accent)]">?</span>
              <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-[var(--term-text)]">{q.text}</span>
            </p>
            {given !== null ? <p className="ml-6 break-words text-[var(--term-dim)]">⎿ <span className="text-[var(--term-text)]">{given}</span></p> : null}
          </div>
        );
      })}
      {state === 'asking' ? <p className="ml-6 text-[12px] text-[var(--term-dim)]">⎿ Waiting for your answer below.</p> : null}
      {state === 'aside' ? (
        <p className="ml-6 text-[12px] text-[var(--term-dim)]">
          ⎿ Set aside to chat about it.{' '}
          {onReopen ? (
            <button type="button" onClick={onReopen} className="rounded px-1 text-[var(--term-accent)] underline decoration-dotted underline-offset-2 outline-none hover:text-[var(--term-text)] focus-visible:ring-1 focus-visible:ring-[var(--term-accent)]">
              Answer {questions.length === 1 ? 'it' : 'them'} now
            </button>
          ) : null}
        </p>
      ) : null}
      {state === 'closed' ? <p className="ml-6 text-[12px] text-[var(--term-dim)]">⎿ Not answered.</p> : null}
    </div>
  );
}
