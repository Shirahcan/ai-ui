import React, { useEffect, useRef, useState } from 'react';

import { TERMINAL_COMMANDS, TERMINAL_KEYS, fillWords, type TerminalCommandName } from './commands';
import type { TerminalTheme } from './terminalThemes';
import { LEVEL_LABELS } from './transcript';
import type { TerminalBrief, TerminalEffort, TerminalLevel, TerminalSessionRow, TerminalSize } from './types';

/**
 * The views a command opens OVER the transcript (inside the panel, never a page modal): context,
 * sessions, help, theme and brief. Each takes the panel's whole body and is closed by Esc or its Back.
 */

export const BUTTON = 'whitespace-nowrap rounded border border-[var(--term-border)] px-3 py-1 text-[12px] text-[var(--term-text)] outline-none hover:bg-[var(--term-selection)] focus-visible:ring-2 focus-visible:ring-[var(--term-accent)]';
export const PRIMARY = 'whitespace-nowrap rounded bg-[var(--term-accent)] px-3 py-1 text-[12px] font-semibold text-[var(--term-on-accent)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--term-text)]';

export function TerminalView({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }): React.JSX.Element {
  const heading = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    heading.current?.focus();
  }, []);

  return (
    <section aria-label={title} className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--term-border)] px-4 py-2">
        <h3 ref={heading} tabIndex={-1} className="min-w-0 flex-1 font-semibold text-[var(--term-text)] outline-none">{title}</h3>
        <button type="button" onClick={onBack} className={BUTTON}>Back (Esc)</button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
    </section>
  );
}

const PART_LABELS: Record<keyof TerminalSize['parts'], string> = {
  brief: 'Brief',
  summary: 'Session summary',
  turns: 'Earlier asks and answers',
  design: 'The design itself',
  files: 'Attached files',
};

export function ContextView({ size, assistant, onCompact, onClear, onBack }: { size: TerminalSize | null; assistant: string; onCompact: () => void; onClear: () => void; onBack: () => void }): React.JSX.Element {
  return (
    <TerminalView title="Context" onBack={onBack}>
      {size ? (
        <>
          <p className="text-[var(--term-dim)]">
            What {assistant} reads with your next ask, estimated in tokens (about 4 characters each).
          </p>
          <p className="mt-2 text-[var(--term-text)]">
            <span className="font-semibold">{size.percent}%</span> of {size.budget.toLocaleString()} used ({size.used.toLocaleString()}). At {size.compact_at}% the session is summarised before the next ask.
          </p>
          <ul className="mt-3 space-y-2">
            {(Object.keys(PART_LABELS) as (keyof TerminalSize['parts'])[]).map((part) => {
              const share = Math.min(100, Math.round((size.parts[part] / Math.max(1, size.budget)) * 100));

              return (
                <li key={part}>
                  <div className="flex justify-between text-[12px]">
                    <span className="text-[var(--term-text)]">{PART_LABELS[part]}</span>
                    <span className="tabular-nums text-[var(--term-dim)]">{size.parts[part].toLocaleString()}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded bg-[var(--term-selection)]" aria-hidden="true">
                    <div className="h-1.5 rounded bg-[var(--term-accent)]" style={{ width: `${share}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={onCompact} className={PRIMARY}>Summarise now (/compact)</button>
            <button type="button" onClick={onClear} className={BUTTON}>New session (/clear)</button>
          </div>
        </>
      ) : (
        <p className="text-[var(--term-dim)]">The context size is not available right now.</p>
      )}
    </TerminalView>
  );
}

function when(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);

  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function ResumeView({ sessions, currentId, subject, onOpen, onBack }: { sessions: TerminalSessionRow[] | null; currentId: string | null; subject: string; onOpen: (id: string) => void; onBack: () => void }): React.JSX.Element {
  return (
    <TerminalView title={`Sessions on this ${subject}`} onBack={onBack}>
      {sessions === null ? (
        <p className="text-[var(--term-dim)]">Loading sessions…</p>
      ) : sessions.length === 0 ? (
        <p className="text-[var(--term-dim)]">No earlier sessions on this {subject} yet.</p>
      ) : (
        <ul className="space-y-1">
          {sessions.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onOpen(s.id)}
                aria-current={s.id === currentId ? 'true' : undefined}
                className="flex w-full items-baseline gap-3 rounded px-2 py-1.5 text-left outline-none hover:bg-[var(--term-selection)] focus-visible:bg-[var(--term-selection)]"
              >
                <span className="min-w-0 flex-1 truncate text-[var(--term-text)]">{s.title ?? 'Untitled session'}</span>
                <span className="shrink-0 text-[11px] text-[var(--term-dim)]">
                  {s.id === currentId ? 'open now · ' : ''}{s.turns} {s.turns === 1 ? 'turn' : 'turns'} · {when(s.last_at)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </TerminalView>
  );
}

export function HelpView({ words, hidden = [], onBack }: { words: { assistant: string; subject: string }; hidden?: readonly TerminalCommandName[]; onBack: () => void }): React.JSX.Element {
  return (
    <TerminalView title="Commands and shortcuts" onBack={onBack}>
      <table className="w-full text-[12px]">
        <caption className="mb-1 text-left font-semibold text-[var(--term-text)]">Commands (type / at the start)</caption>
        <tbody>
          {TERMINAL_COMMANDS.filter((c) => !hidden.includes(c.name)).map((c) => (
            <tr key={c.name} className="align-top">
              <th scope="row" className="whitespace-nowrap py-0.5 pr-3 text-left font-normal text-[var(--term-accent)]">/{c.name}{c.args ? ` ${c.args}` : ''}</th>
              <td className="py-0.5 text-[var(--term-dim)]">{fillWords(c.description, words)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table className="mt-4 w-full text-[12px]">
        <caption className="mb-1 text-left font-semibold text-[var(--term-text)]">Keys</caption>
        <tbody>
          {TERMINAL_KEYS.map((k) => (
            <tr key={k.keys} className="align-top">
              <th scope="row" className="whitespace-nowrap py-0.5 pr-3 text-left font-normal text-[var(--term-accent)]"><kbd>{k.keys}</kbd></th>
              <td className="py-0.5 text-[var(--term-dim)]">{fillWords(k.does, words)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TerminalView>
  );
}

const LEVEL_NOTES: Record<TerminalLevel, string> = {
  normal: 'The everyday models: fast, and enough for most asks.',
  pro: 'A stronger model for harder asks. Falls back to Normal when it is unavailable.',
  expert: 'The strongest model, for the hardest asks. Slower, and costs the most. Falls back to Pro, then Normal.',
};

const EFFORT_NOTES: Record<TerminalEffort, string> = {
  low: 'Answers quickly. Right for most asks.',
  medium: 'Thinks longer before it answers.',
  high: 'Thinks the longest. Slower, for asks that need care.',
};

function Choices<T extends string>({ label, values, current, labels, notes, onPick }: { label: string; values: T[]; current: T; labels: Record<T, string>; notes: Record<T, string>; onPick: (value: T) => void }): React.JSX.Element {
  const move = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const at = values.indexOf(current);
    const next = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? at + 1 : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? at - 1 : null;

    if (next === null) return;
    event.preventDefault();
    const value = values[(next + values.length) % values.length] ?? current;

    onPick(value);
    (event.currentTarget.querySelector(`[data-value="${value}"]`) as HTMLElement | null)?.focus();
  };

  return (
    <div role="radiogroup" aria-label={label} onKeyDown={move} className="grid gap-2">
      {values.map((value) => (
        <button
          key={value}
          type="button"
          role="radio"
          data-value={value}
          aria-checked={value === current}
          tabIndex={value === current ? 0 : -1}
          onClick={() => onPick(value)}
          className={`rounded-md border px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--term-accent)] ${value === current ? 'border-[var(--term-accent)]' : 'border-[var(--term-border)]'}`}
        >
          <span className="block text-[12px] font-semibold text-[var(--term-text)]">{labels[value]}{value === current ? ' (on)' : ''}</span>
          <span className="block text-[12px] text-[var(--term-dim)]">{notes[value]}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Level and effort (1.45.0, owner 2026-11-09): how capable a model the assistant works on, and how hard
 * it thinks. Named by level, never by model; both kept by the host.
 */
export function TuningView({
  assistant,
  levels,
  level,
  onLevel,
  efforts,
  effort,
  onEffort,
  onBack,
}: {
  assistant: string;
  levels: TerminalLevel[];
  level: TerminalLevel;
  onLevel?: (level: TerminalLevel) => void;
  efforts: TerminalEffort[];
  effort: TerminalEffort;
  onEffort?: (effort: TerminalEffort) => void;
  onBack: () => void;
}): React.JSX.Element {
  return (
    <TerminalView title="Level and effort" onBack={onBack}>
      {onLevel ? (
        <>
          <p className="mb-2 font-semibold text-[var(--term-text)]">Level</p>
          <Choices label="Level" values={levels} current={level} labels={LEVEL_LABELS} notes={LEVEL_NOTES} onPick={onLevel} />
        </>
      ) : null}
      {onEffort ? (
        <>
          <p className="mb-2 mt-4 font-semibold text-[var(--term-text)]">Effort</p>
          <Choices label="Effort" values={efforts} current={effort} labels={{ low: 'Low', medium: 'Medium', high: 'High' }} notes={EFFORT_NOTES} onPick={onEffort} />
        </>
      ) : null}
      <p className="mt-4 text-[12px] text-[var(--term-dim)]">Applies to your next ask. Each answer says which level gave it, so you can see when {assistant} fell back.</p>
    </TerminalView>
  );
}

export function ThemeView({ themes, current, onPick, onBack }: { themes: TerminalTheme[]; current: string; onPick: (key: string) => void; onBack: () => void }): React.JSX.Element {
  return (
    <TerminalView title="Theme" onBack={onBack}>
      <div role="radiogroup" aria-label="Console theme" className="grid gap-2">
        {themes.map((theme) => (
          <button
            key={theme.key}
            type="button"
            role="radio"
            aria-checked={theme.key === current}
            onClick={() => onPick(theme.key)}
            className={`rounded-md border p-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--term-accent)] ${theme.key === current ? 'border-[var(--term-accent)]' : 'border-[var(--term-border)]'}`}
          >
            <span className="mb-1 block text-[12px] text-[var(--term-text)]">{theme.label}{theme.key === current ? ' (on)' : ''}</span>
            <span className="block rounded px-2 py-1.5 text-[12px]" style={{ background: theme.bg, color: theme.text }}>
              <span style={{ color: theme.accent }}>❯ </span>make the hero darker
              <span className="block" style={{ color: theme.dim }}><span style={{ color: theme.ok }}>● </span>Writing the hero</span>
              <span className="block" style={{ color: theme.ok }}>✓ Changed 1 element</span>
            </span>
          </button>
        ))}
      </div>
    </TerminalView>
  );
}

export function BriefView({ brief, subject, onSave, onBack }: { brief: TerminalBrief | null; subject: string; onSave: (text: string | null) => void; onBack: () => void }): React.JSX.Element {
  const [text, setText] = useState(brief?.text ?? '');

  return (
    <TerminalView title={`Brief for this ${subject}`} onBack={onBack}>
      <p className="text-[var(--term-dim)]">
        Standing instructions read with every ask on this {subject}, by everyone who edits it: who it is for, the tone, what to keep.
        {brief?.by ? ` Last set by ${brief.by}${brief.at ? `, ${when(brief.at)}` : ''}.` : ''}
      </p>
      <label htmlFor="terminal-brief" className="sr-only">Brief</label>
      <textarea
        id="terminal-brief"
        name="terminal-brief"
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={8}
        maxLength={4000}
        className="mt-3 w-full resize-y rounded-md border border-[var(--term-border)] bg-[var(--term-bar)] px-3 py-2 font-[inherit] text-[13px] text-[var(--term-text)] outline-none focus-visible:border-[var(--term-accent)]"
        placeholder="Employers hiring from abroad read this page. Plain words, no jargon. Keep the blue hero."
      />
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={() => onSave(text.trim() === '' ? null : text.trim())} className={PRIMARY}>Save brief</button>
        {brief ? <button type="button" onClick={() => onSave(null)} className={BUTTON}>Remove brief</button> : null}
      </div>
    </TerminalView>
  );
}
