import React, { useEffect, useState } from 'react';

import { savedNameProblem, type TerminalSavedCommand } from './commands';
import { LEVEL_LABELS } from './transcript';
import type { TerminalLevel, TerminalSpecialization, TerminalSpecializationOption, TerminalUsage } from './types';
import { BUTTON, PRIMARY, TerminalView } from './TerminalViews';

const FIELD =
  'w-full rounded-md border border-[var(--term-border)] bg-[var(--term-bar)] px-3 py-2 font-[inherit] text-[13px] text-[var(--term-text)] outline-none focus-visible:border-[var(--term-accent)]';

const PICK =
  'w-full rounded-md border px-3 py-2 text-left outline-none hover:bg-[var(--term-selection)] focus-visible:ring-2 focus-visible:ring-[var(--term-accent)]';

/** Why the current guide applies, in a few words. */
export function specializationWhy(current: TerminalSpecialization | null, subject: string): string {
  if (!current) return 'No guide: you turned it off for this ' + subject + '.';
  if (current.source === 'person') return 'You chose it for this ' + subject + '.';
  if (current.source === 'page') return 'This ' + subject + "'s own kind decides it.";
  return 'Picked for each ask from the active guides, or none.';
}

/**
 * `/specialize` (1.55.0, owner 2026-11-11): which guide the assistant follows on this subject. "Let the
 * subject decide" goes back to its own kind (a blog post's page follows Blog post) or the assistant's pick;
 * "None" follows no guide. The choice is kept per subject, for everyone working on it.
 */
export function SpecializationView({
  assistant,
  subject,
  current,
  chosen,
  options,
  manageHref,
  onPick,
  onBack,
}: {
  assistant: string;
  subject: string;
  current: TerminalSpecialization | null;
  /** The person's own choice, when they made one: a key, or 'none'. */
  chosen: string | null;
  options: TerminalSpecializationOption[];
  manageHref?: string | null;
  onPick: (key: string | null) => void;
  onBack: () => void;
}): React.JSX.Element {
  const ring = (on: boolean) => (on ? 'border-[var(--term-accent)]' : 'border-[var(--term-border)]');

  return (
    <TerminalView title="Specialization" onBack={onBack}>
      <p className="text-[var(--term-dim)]">
        A guide {assistant} follows for one kind of output: its sections, what it looks up first, and what it checks after writing.
        {current ? ` Now: ${current.key === null ? `${assistant} picks` : current.name}. ` : ' Now: none. '}
        {specializationWhy(current, subject)}
      </p>
      <ul className="mt-3 space-y-2">
        <li>
          <button type="button" onClick={() => onPick(null)} className={`${PICK} ${ring(chosen === null)}`}>
            <span className="font-semibold text-[var(--term-text)]">Let the {subject} decide</span>
            <span className="block text-[var(--term-dim)]">Its own kind when it has one, otherwise {assistant} picks a guide for each ask.</span>
          </button>
        </li>
        {options.map((option) => (
          <li key={option.key}>
            <button type="button" onClick={() => onPick(option.key)} className={`${PICK} ${ring(chosen === option.key)}`}>
              <span className="font-semibold text-[var(--term-text)]">{option.name}</span>
              {option.use_when ? <span className="block text-[var(--term-dim)]">{option.use_when}</span> : null}
            </button>
          </li>
        ))}
        <li>
          <button type="button" onClick={() => onPick('none')} className={`${PICK} ${ring(chosen === 'none')}`}>
            <span className="font-semibold text-[var(--term-text)]">None</span>
            <span className="block text-[var(--term-dim)]">Follow no guide on this {subject}.</span>
          </button>
        </li>
      </ul>
      {manageHref ? (
        <p className="mt-3">
          <a href={manageHref} className="text-[var(--term-accent)] underline underline-offset-2 outline-none focus-visible:ring-1 focus-visible:ring-[var(--term-accent)]">
            Manage specializations
          </a>
        </p>
      ) : null}
    </TerminalView>
  );
}

const dollars = (usd: number) => (usd > 0 && usd < 0.01 ? 'under $0.01' : `$${usd.toFixed(2)}`);
const tokens = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n));

/**
 * `/cost` (1.53.0, owner 2026-11-09): what this session has cost so far, by LEVEL (never the model), so
 * choosing Pro or Expert is not blind. Asked of the host when the view opens; nothing is guessed here.
 */
export function CostView({ assistant, load, onBack }: { assistant: string; load: () => Promise<TerminalUsage | null>; onBack: () => void }): React.JSX.Element {
  const [usage, setUsage] = useState<TerminalUsage | null | 'loading'>('loading');

  useEffect(() => {
    let alive = true;

    load().then(
      (found) => alive && setUsage(found),
      () => alive && setUsage(null),
    );

    return () => {
      alive = false;
    };
  }, [load]);

  return (
    <TerminalView title="Session cost" onBack={onBack}>
      {usage === 'loading' ? (
        <p className="text-[var(--term-dim)]">Counting…</p>
      ) : usage === null ? (
        <p className="text-[var(--term-dim)]">The cost cannot be read right now. Try again in a moment.</p>
      ) : usage.total.calls === 0 ? (
        <p className="text-[var(--term-dim)]">Nothing has been spent in this session yet.</p>
      ) : (
        <>
          <table className="w-full text-left">
            <thead className="text-[11px] text-[var(--term-dim)]">
              <tr>
                <th scope="col" className="py-1 font-normal">Level</th>
                <th scope="col" className="py-1 text-right font-normal">Calls</th>
                <th scope="col" className="py-1 text-right font-normal">Read / written</th>
                <th scope="col" className="py-1 text-right font-normal">Cost</th>
              </tr>
            </thead>
            <tbody>
              {usage.levels
                .filter((row) => row.calls > 0)
                .map((row) => (
                  <tr key={row.level} className="border-t border-[var(--term-border)]">
                    <th scope="row" className="py-1 font-normal text-[var(--term-text)]">{LEVEL_LABELS[row.level as TerminalLevel] ?? row.level}</th>
                    <td className="py-1 text-right">{row.calls}</td>
                    <td className="py-1 text-right text-[var(--term-dim)]">{tokens(row.tokens_in)} / {tokens(row.tokens_out)}</td>
                    <td className="py-1 text-right">{dollars(row.cost_usd)}</td>
                  </tr>
                ))}
              <tr className="border-t border-[var(--term-border)] font-semibold">
                <th scope="row" className="py-1">All</th>
                <td className="py-1 text-right">{usage.total.calls}</td>
                <td className="py-1 text-right text-[var(--term-dim)]">{tokens(usage.total.tokens_in)} / {tokens(usage.total.tokens_out)}</td>
                <td className="py-1 text-right">{dollars(usage.total.cost_usd)}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-3 text-[var(--term-dim)]">
            Every call {assistant} made for this session&apos;s asks, its recaps and summaries. Normal uses the free or cheapest service first; Pro and Expert cost more per ask.
          </p>
        </>
      )}
    </TerminalView>
  );
}

/**
 * The person's own commands (1.53.0, owner 2026-11-09 "saved asks"): `/seo-pass` sends its ask again.
 * Add, change and delete here; `/save name` opens it with the last ask filled in.
 */
export function SavedCommandsView({
  saved,
  draft,
  onSave,
  onBack,
}: {
  saved: TerminalSavedCommand[];
  /** A new command to start with (`/save name`: the name and the last ask). */
  draft?: TerminalSavedCommand | null;
  onSave: (next: TerminalSavedCommand[]) => void;
  onBack: () => void;
}): React.JSX.Element {
  // The command being edited: its original name (null for a new one) and its fields.
  const [editing, setEditing] = useState<{ was: string | null; name: string; ask: string; description: string } | null>(
    draft ? { was: null, name: draft.name, ask: draft.ask, description: draft.description ?? '' } : null,
  );
  const problem = editing ? savedNameProblem(editing.name.trim(), saved, editing.was) ?? (editing.ask.trim() === '' ? 'Write the ask it sends.' : null) : null;

  const save = () => {
    if (!editing || problem) return;

    const entry: TerminalSavedCommand = { name: editing.name.trim(), ask: editing.ask.trim(), description: editing.description.trim() || null };

    onSave(editing.was === null ? [...saved, entry] : saved.map((c) => (c.name === editing.was ? entry : c)));
    setEditing(null);
  };

  return (
    <TerminalView title="Your commands" onBack={onBack}>
      <p className="text-[var(--term-dim)]">Asks you send often, each under a name of your own. Type / and the name to send it again; words after the name are added to it.</p>

      {saved.length === 0 && !editing ? <p className="mt-3 text-[var(--term-dim)]">None yet. Add one, or type /save name after an ask you want to keep.</p> : null}

      <ul className="mt-3 space-y-2">
        {saved.map((command) => (
          <li key={command.name} className="rounded-md border border-[var(--term-border)] px-3 py-2">
            <div className="flex items-baseline gap-2">
              <span className="font-semibold text-[var(--term-accent)]">/{command.name}</span>
              <span className="min-w-0 flex-1 truncate text-[var(--term-dim)]">{command.description || ''}</span>
              <button type="button" onClick={() => setEditing({ was: command.name, name: command.name, ask: command.ask, description: command.description ?? '' })} className={BUTTON}>
                Edit
              </button>
              <button type="button" onClick={() => onSave(saved.filter((c) => c.name !== command.name))} aria-label={`Delete /${command.name}`} className={BUTTON}>
                Delete
              </button>
            </div>
            <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-[var(--term-text)]">{command.ask}</p>
          </li>
        ))}
      </ul>

      {editing ? (
        <div className="mt-3 space-y-2 rounded-md border border-[var(--term-accent)] px-3 py-3">
          <label htmlFor="terminal-command-name" className="block text-[11px] text-[var(--term-dim)]">Name (typed after /)</label>
          <input
            id="terminal-command-name"
            name="terminal-command-name"
            value={editing.name}
            onChange={(event) => setEditing({ ...editing, name: event.target.value.toLowerCase().replace(/\s+/g, '-') })}
            className={FIELD}
            placeholder="seo-pass"
            autoComplete="off"
          />
          <label htmlFor="terminal-command-ask" className="block text-[11px] text-[var(--term-dim)]">The ask it sends</label>
          <textarea
            id="terminal-command-ask"
            name="terminal-command-ask"
            value={editing.ask}
            onChange={(event) => setEditing({ ...editing, ask: event.target.value })}
            rows={5}
            maxLength={2000}
            className={`${FIELD} resize-y`}
            placeholder="Check every heading and description for search: one h1, clear titles, a description under 160 characters."
          />
          <label htmlFor="terminal-command-description" className="block text-[11px] text-[var(--term-dim)]">What it is for (optional)</label>
          <input
            id="terminal-command-description"
            name="terminal-command-description"
            value={editing.description}
            onChange={(event) => setEditing({ ...editing, description: event.target.value })}
            maxLength={120}
            className={FIELD}
            placeholder="Search pass on headings and descriptions"
          />
          {problem && editing.name !== '' ? <p role="alert" className="text-[var(--term-warn)]">{problem}</p> : null}
          <div className="flex gap-2">
            <button type="button" onClick={save} disabled={problem !== null} className={`${PRIMARY} disabled:opacity-50`}>
              {editing.was === null ? 'Add command' : 'Save command'}
            </button>
            <button type="button" onClick={() => setEditing(null)} className={BUTTON}>Cancel</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setEditing({ was: null, name: '', ask: '', description: '' })} className={`${BUTTON} mt-3`}>
          Add a command
        </button>
      )}
    </TerminalView>
  );
}
