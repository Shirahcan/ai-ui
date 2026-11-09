import React, { useState } from 'react';

import type { TerminalAnswer, TerminalOption, TerminalQuestion as Question } from './types';

/**
 * The assistant's questions with their choices (1.45.0): Claude Code's multiple-choice tool, in the
 * console. Each question offers its options (with what each means and which one the assistant
 * recommends), and always "Other" to type an answer; `multi` lets several be picked.
 *
 * One question is drawn whole. SEVERAL are tabs, as Claude Code draws them (owner 2026-11-09: "mirror
 * the multi-tab UI ... with a summary last tab"): one tab per question, named by its short `header`,
 * checked once answered, and a last "Submit" tab that reviews every answer before they are sent.
 * Keys: 1-9 pick an option, Left and Right move between tabs, Enter sends from the last tab (or from a
 * single question), Space picks the focused option.
 *
 * ⚠ THE ANSWER IS AN ASK. Sending it starts the next turn with the answers beside the ask, so a reload,
 * the transcript and the assistant's next context all hold the same thing.
 */

const RECOMMENDED_SUFFIX = /\s*\((?:recommended)\)\s*$/i;

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

export function TerminalQuestionBlock({
  questions,
  answerable,
  answers,
  onAnswer,
}: {
  questions: Question[];
  answerable: boolean;
  /** Given already (the ask after this one): drawn beside each question. */
  answers: TerminalAnswer[];
  onAnswer?: (answers: TerminalAnswer[]) => void;
}): React.JSX.Element {
  const [picked, setPicked] = useState<string[][]>(() => questions.map(() => []));
  const [other, setOther] = useState<string[]>(() => questions.map(() => ''));
  // Several questions are tabs; the last tab (index = questions.length) is the summary.
  const [tab, setTab] = useState(0);
  const live = answerable && onAnswer !== undefined;
  const tabbed = questions.length > 1;
  const summary = tabbed && tab === questions.length;

  const answerFor = (i: number): string => {
    const own = (other[i] ?? '').trim();

    return [...(picked[i] ?? []), ...(own !== '' ? [own] : [])].join(', ');
  };
  const ready = questions.every((_, i) => answerFor(i) !== '');

  const go = (next: number) => setTab(Math.max(0, Math.min(questions.length, next)));

  const toggle = (qi: number, label: string) => {
    const multi = questions[qi]?.multi ?? false;
    const already = (picked[qi] ?? []).includes(label);

    setPicked((all) =>
      all.map((list, i) => {
        if (i !== qi) return list;
        if (multi) return already ? list.filter((l) => l !== label) : [...list, label];

        return already ? [] : [label];
      }),
    );
    if (!multi) setOther((all) => all.map((t, i) => (i === qi ? '' : t)));
    // Picking one answer to one question moves on to the next tab, as Claude Code does.
    if (tabbed && !multi && !already) go(qi + 1);
  };

  const send = () => {
    if (!live || !ready) return;

    onAnswer?.(questions.map((q, i) => ({ question: q.text, answer: answerFor(i) })));
  };

  const onKey = (qi: number | null) => (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!live) return;

    const typing = (event.target as HTMLElement).tagName === 'INPUT';

    if (typing) {
      if (event.key === 'Enter') {
        event.preventDefault();
        if (tabbed && qi !== null) go(qi + 1);
        else send();
      }

      return;
    }

    if (tabbed && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
      event.preventDefault();
      go(tab + (event.key === 'ArrowRight' ? 1 : -1));

      return;
    }

    const n = Number(event.key);
    const option = qi !== null && Number.isInteger(n) && n >= 1 ? questions[qi]?.options[n - 1] : undefined;

    if (option && qi !== null) {
      event.preventDefault();
      toggle(qi, option.label);
    } else if (event.key === 'Enter' && !event.shiftKey && (!tabbed || summary)) {
      event.preventDefault();
      send();
    }
  };

  const questionBody = (q: Question, qi: number) => {
    const given = answers.find((a) => a.question === q.text)?.answer ?? null;

    return (
      <div key={qi} role="group" aria-label={q.text} onKeyDown={onKey(qi)} className={!tabbed && qi > 0 ? 'mt-3' : ''}>
        <p className="flex gap-2">
          <span aria-hidden="true" className="w-4 shrink-0 select-none text-center text-[var(--term-accent)]">?</span>
          <span className="min-w-0 flex-1 whitespace-pre-wrap break-words font-semibold text-[var(--term-text)]">{q.text}</span>
        </p>
        {given !== null ? (
          <p className="ml-6 mt-1 text-[var(--term-dim)]">⎿ <span className="text-[var(--term-text)]">{given}</span></p>
        ) : live ? (
          <>
            {q.options.length > 0 ? (
              <ul className="ml-6 mt-1 space-y-1" role={q.multi ? 'group' : 'radiogroup'} aria-label={q.multi ? 'Pick any' : 'Pick one'}>
                {q.options.map((option, oi) => {
                  const on = (picked[qi] ?? []).includes(option.label);
                  const look = shown(option);

                  return (
                    <li key={option.label}>
                      <button
                        type="button"
                        role={q.multi ? 'checkbox' : 'radio'}
                        aria-checked={on}
                        onClick={() => toggle(qi, option.label)}
                        className={`flex w-full gap-2 rounded px-2 py-1 text-left outline-none focus-visible:ring-1 focus-visible:ring-[var(--term-accent)] ${on ? 'bg-[var(--term-selection)]' : 'hover:bg-[var(--term-selection)]'}`}
                      >
                        <span aria-hidden="true" className="shrink-0 tabular-nums text-[var(--term-dim)]">{oi + 1}.</span>
                        <span aria-hidden="true" className={`shrink-0 ${on ? 'text-[var(--term-accent)]' : 'text-[var(--term-dim)]'}`}>{q.multi ? (on ? '[x]' : '[ ]') : on ? '(•)' : '( )'}</span>
                        <span className="min-w-0 flex-1">
                          <span className="text-[var(--term-text)]">{look.label}</span>
                          {look.recommended ? (
                            <span className="ml-2 rounded border border-[var(--term-ok)] px-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--term-ok)]">Recommended</span>
                          ) : null}
                          {option.description ? <span className="block text-[12px] text-[var(--term-dim)]">{option.description}</span> : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            <label className="ml-6 mt-1 flex items-center gap-2 px-2 text-[12px] text-[var(--term-dim)]">
              <span className="shrink-0">{q.options.length > 0 ? 'Other:' : 'Your answer:'}</span>
              <input
                value={other[qi] ?? ''}
                onChange={(e) => {
                  const text = e.target.value;

                  setOther((all) => all.map((t, i) => (i === qi ? text : t)));
                  if (!q.multi && text.trim() !== '') setPicked((all) => all.map((list, i) => (i === qi ? [] : list)));
                }}
                className="min-w-0 flex-1 rounded border border-[var(--term-border)] bg-[var(--term-bg)] px-3 py-1 text-[13px] text-[var(--term-text)] outline-none focus-visible:border-[var(--term-accent)]"
              />
            </label>
            {tabbed && q.multi ? (
              <div className="ml-6 mt-2">
                <button type="button" onClick={() => go(qi + 1)} className="whitespace-nowrap rounded border border-[var(--term-border)] px-3 py-1 text-[12px] text-[var(--term-text)] outline-none hover:bg-[var(--term-selection)] focus-visible:ring-1 focus-visible:ring-[var(--term-accent)]">
                  Next
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <p className="ml-6 mt-1 text-[12px] text-[var(--term-dim)]">Not answered</p>
        )}
      </div>
    );
  };

  // Answered already, or no longer answerable: every question with what was given, no tabs.
  if (!live || !tabbed) {
    return (
      <div className="mt-2 rounded-md border border-[var(--term-accent)] px-3 py-2">
        {questions.map((q, qi) => questionBody(q, qi))}
        {live ? (
          <div className="ml-6 mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={send}
              disabled={!ready}
              className="whitespace-nowrap rounded bg-[var(--term-accent)] px-3 py-1 text-[12px] font-semibold text-[var(--term-on-accent)] outline-none disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-[var(--term-text)]"
            >
              Send {questions.length === 1 ? 'answer' : 'answers'}
            </button>
            <span className="text-[11px] text-[var(--term-dim)]">1-9 pick · enter sends</span>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-md border border-[var(--term-accent)] px-3 py-2">
      <div role="tablist" aria-label="Questions" className="mb-2 flex flex-wrap items-center gap-1 border-b border-[var(--term-border)] pb-2">
        <button type="button" aria-label="Previous question" disabled={tab === 0} onClick={() => go(tab - 1)} className={`${TAB} text-[var(--term-dim)] disabled:opacity-40`}>←</button>
        {questions.map((q, qi) => {
          const done = answerFor(qi) !== '';

          return (
            <button
              key={qi}
              type="button"
              role="tab"
              aria-selected={tab === qi}
              onClick={() => go(qi)}
              className={`${TAB} ${tab === qi ? 'bg-[var(--term-accent)] font-semibold text-[var(--term-on-accent)]' : 'text-[var(--term-text)] hover:bg-[var(--term-selection)]'}`}
            >
              <span aria-hidden="true">{done ? '☒' : '☐'} </span>
              {tabName(q, qi)}
            </button>
          );
        })}
        <button
          type="button"
          role="tab"
          aria-selected={summary}
          onClick={() => go(questions.length)}
          className={`${TAB} ${summary ? 'bg-[var(--term-accent)] font-semibold text-[var(--term-on-accent)]' : 'text-[var(--term-text)] hover:bg-[var(--term-selection)]'}`}
        >
          <span aria-hidden="true">{ready ? '✔' : '·'} </span>Submit
        </button>
        <button type="button" aria-label="Next question" disabled={summary} onClick={() => go(tab + 1)} className={`${TAB} text-[var(--term-dim)] disabled:opacity-40`}>→</button>
      </div>

      {summary ? (
        <div role="tabpanel" aria-label="Review your answers" onKeyDown={onKey(null)} tabIndex={-1} className="outline-none">
          <p className="font-semibold text-[var(--term-text)]">Review your answers</p>
          <ul className="mt-1 space-y-1">
            {questions.map((q, qi) => {
              const answer = answerFor(qi);

              return (
                <li key={qi} className="flex gap-2">
                  <span aria-hidden="true" className={`w-4 shrink-0 text-center ${answer ? 'text-[var(--term-ok)]' : 'text-[var(--term-warn)]'}`}>{answer ? '●' : '○'}</span>
                  <span className="min-w-0 flex-1 break-words">
                    <span className="text-[var(--term-dim)]">{q.text}</span>
                    <br />
                    {answer ? (
                      <span className="text-[var(--term-text)]">→ {answer}</span>
                    ) : (
                      <button type="button" onClick={() => go(qi)} className="text-[12px] text-[var(--term-warn)] underline decoration-dotted underline-offset-2 outline-none focus-visible:text-[var(--term-accent)]">
                        Not answered yet: answer it
                      </button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={send}
              disabled={!ready}
              className="whitespace-nowrap rounded bg-[var(--term-accent)] px-3 py-1 text-[12px] font-semibold text-[var(--term-on-accent)] outline-none disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-[var(--term-text)]"
            >
              Send answers
            </button>
            <span className="text-[11px] text-[var(--term-dim)]">← → tabs · enter sends</span>
          </div>
        </div>
      ) : (
        <div role="tabpanel" aria-label={tabName(questions[tab] as Question, tab)}>
          {questionBody(questions[tab] as Question, tab)}
          <p className="ml-6 mt-2 text-[11px] text-[var(--term-dim)]">1-9 pick · ← → tabs</p>
        </div>
      )}
    </div>
  );
}
