import React, { useState } from 'react';

import type { TerminalAnswer, TerminalQuestion as Question } from './types';

/**
 * The assistant's questions with their choices (1.45.0): Claude Code's multiple-choice tool, in the
 * console. Each question offers its options (with what each means), and always "Other" to type an
 * answer; `multi` lets several be picked. Keys: 1-9 pick an option of the focused question, Space picks,
 * Enter sends once every question has an answer.
 *
 * ⚠ THE ANSWER IS AN ASK. Sending it starts the next turn with the answers, as the person read them,
 * so a reload, the transcript and the assistant's next context all hold the same thing.
 */
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
  const live = answerable && onAnswer !== undefined;

  const answerFor = (i: number): string => {
    const own = (other[i] ?? '').trim();

    return [...(picked[i] ?? []), ...(own !== '' ? [own] : [])].join(', ');
  };
  const ready = questions.every((_, i) => answerFor(i) !== '');

  const toggle = (qi: number, label: string) => {
    const multi = questions[qi]?.multi ?? false;

    setPicked((all) =>
      all.map((list, i) => {
        if (i !== qi) return list;
        if (multi) return list.includes(label) ? list.filter((l) => l !== label) : [...list, label];

        return list[0] === label ? [] : [label];
      }),
    );
    if (!multi) setOther((all) => all.map((t, i) => (i === qi ? '' : t)));
  };

  const send = () => {
    if (!live || !ready) return;

    onAnswer?.(questions.map((q, i) => ({ question: q.text, answer: answerFor(i) })));
  };

  const onGroupKey = (qi: number) => (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!live) return;
    if ((event.target as HTMLElement).tagName === 'INPUT') {
      if (event.key === 'Enter') {
        event.preventDefault();
        send();
      }

      return;
    }

    const n = Number(event.key);
    const option = Number.isInteger(n) && n >= 1 ? questions[qi]?.options[n - 1] : undefined;

    if (option) {
      event.preventDefault();
      toggle(qi, option.label);
    } else if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  return (
    <div className="mt-2 rounded-md border border-[var(--term-accent)] px-3 py-2">
      {questions.map((q, qi) => {
        const given = answers.find((a) => a.question === q.text)?.answer ?? null;

        return (
          <div key={qi} role="group" aria-label={q.text} onKeyDown={onGroupKey(qi)} className={qi > 0 ? 'mt-3' : ''}>
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
                              <span className="text-[var(--term-text)]">{option.label}</span>
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
              </>
            ) : (
              <p className="ml-6 mt-1 text-[12px] text-[var(--term-dim)]">Not answered</p>
            )}
          </div>
        );
      })}
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
