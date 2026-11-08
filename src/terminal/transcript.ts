import type { TerminalLine, TerminalLive, TerminalNote, TerminalOutcome, TerminalSessionRow, TerminalStep, TerminalTurn } from './types';

/** Steps whose detail is shown even when details are collapsed: the assistant's thinking, and the ones a person acts on. */
const ALWAYS_DETAILED = new Set(['think', 'gather', 'repair', 'check', 'merge']);

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** What came of an answer, as the person reads it. */
export function outcomeLine(outcome: TerminalOutcome | undefined): { tone: 'ok' | 'none' | 'fail'; text: string } {
  if (outcome?.changed) {
    const n = Number(outcome.elements ?? 0);
    let text = n > 0 ? `Changed ${plural(n, 'element', 'elements')}` : 'Changed the design';
    const conflicts = Number(outcome.conflicts ?? 0);

    if (conflicts > 0) text += `, kept your version of ${plural(conflicts, 'element', 'elements')} you changed meanwhile`;
    else if (Number(outcome.kept ?? 0) > 0) text += ', kept the edits you made meanwhile';

    return { tone: 'ok', text };
  }

  const reason = (outcome?.reason ?? '').trim();

  return reason !== '' ? { tone: 'fail', text: `Could not finish: ${reason}` } : { tone: 'none', text: 'Nothing changed' };
}

function stepLines(steps: TerminalStep[], keyPrefix: string, expanded: boolean, muted: 'rewound' | 'folded' | undefined, liveIndex: number | null): TerminalLine[] {
  const lines: TerminalLine[] = [];

  steps.forEach((step, i) => {
    const live = liveIndex === i;

    lines.push({ key: `${keyPrefix}:step:${i}`, kind: 'step', text: step.text, ms: step.ms ?? null, live, stepKind: step.kind, muted });

    if (step.detail && (expanded || live || ALWAYS_DETAILED.has(step.kind))) {
      lines.push({ key: `${keyPrefix}:detail:${i}`, kind: 'detail', text: step.detail, stepKind: step.kind, muted });
    }
  });

  return lines;
}

function chipsFor(structured: TerminalTurn['structured'] | TerminalLive['ask']): string[] {
  const chips: string[] = [];

  if (!structured) return chips;
  if (structured.target) chips.push(`@${structured.target}`);
  if (structured.files?.length) chips.push(plural(structured.files.length, 'file', 'files'));
  if (structured.mode === 'plan') chips.push('plan');

  return chips;
}

export interface ToLinesOptions {
  session?: TerminalSessionRow | null;
  live?: TerminalLive | null;
  /** Ctrl+O: every step's detail and timing. */
  expanded?: boolean;
  /** Lines the host adds (a cleared screen, a command's answer), placed after the turns they follow. */
  notes?: TerminalNote[];
  /** Turns before this id are off screen (Ctrl+L clears the screen, the session is kept). */
  clearedThrough?: string | null;
  /** The assistant's name, for the summary marker ("Porter"). */
  assistantName?: string;
}

/**
 * The console's lines, in order: each recorded ask with its steps, reply and outcome; the ask running
 * now growing step by step; what is queued next; and the host's notes.
 *
 * ⚠ KEYS ARE STABLE. A recorded turn keys by its id and a live ask by its start, so a line already on
 * screen is never re-keyed while the next ones arrive: the transcript grows, it never redraws.
 */
export function toLines(turns: TerminalTurn[], options: ToLinesOptions = {}): TerminalLine[] {
  const { session = null, live = null, expanded = false, notes = [], clearedThrough = null, assistantName = 'the assistant' } = options;
  const folded = new Set(session?.summary?.folded ?? []);
  const lines: TerminalLine[] = [];
  let visible = clearedThrough === null;
  let lastFoldedAt = -1;
  let askId: string | null = null;
  const lastIndex = turns.length - 1;

  turns.forEach((turn, index) => {
    if (!visible) {
      if (turn.id === clearedThrough) visible = true;

      return;
    }

    const muted: 'rewound' | 'folded' | undefined = turn.rewound ? 'rewound' : folded.has(turn.id) ? 'folded' : undefined;

    if (turn.role === 'user') {
      askId = turn.id;
      lines.push({ key: `${turn.id}:ask`, kind: 'ask', text: (turn.body ?? '').trim(), chips: chipsFor(turn.structured), turnId: turn.id, muted });
    } else if (turn.role === 'assistant') {
      const s = turn.structured ?? {};

      lines.push(...stepLines(s.steps ?? [], turn.id, expanded, muted, null));

      // A plan's own summary is its reply: drawn once, in the plan.
      if (turn.body && turn.body.trim() !== '' && turn.body.trim() !== s.plan?.summary?.trim()) {
        lines.push({ key: `${turn.id}:reply`, kind: 'reply', text: turn.body.trim(), muted });
      }

      if (s.plan) {
        // A plan waits for a yes only while it is the last thing said and nothing is running.
        const open = index === lastIndex && !turn.rewound && live === null;

        lines.push({ key: `${turn.id}:plan`, kind: 'plan', summary: s.plan.summary, steps: s.plan.steps ?? [], turnId: askId, open, muted });
      } else {
        const outcome = outcomeLine(s.outcome);

        lines.push({ key: `${turn.id}:outcome`, kind: 'outcome', tone: outcome.tone, text: outcome.text, turnId: askId, canRewind: !turn.rewound && Boolean(s.outcome?.changed), muted });
      }
    }

    if (folded.has(turn.id)) lastFoldedAt = lines.length;

    // A note made right after this turn (a saved brief, a rewind) stays where it happened.
    for (const note of notes) {
      if (note.after === turn.id) lines.push({ key: `note:${note.key}`, kind: 'system', tone: note.tone ?? 'system', text: note.text });
    }
  });

  if (session?.summary && lastFoldedAt >= 0) {
    const n = session.summary.turns_folded;

    lines.splice(lastFoldedAt, 0, { key: `summary:${session.summary.at ?? ''}`, kind: 'system', tone: 'system', text: `Session summarised (${plural(n, 'turn', 'turns')} folded into the summary ${assistantName} reads)` });
  }

  const placed = new Set(turns.map((t) => t.id));

  for (const note of notes) {
    if (!note.after || !placed.has(note.after)) lines.push({ key: `note:${note.key}`, kind: 'system', tone: note.tone ?? 'system', text: note.text });
  }

  if (live) {
    const prefix = `live:${live.startedAt}`;

    if (live.ask) lines.push({ key: `${prefix}:ask`, kind: 'ask', text: live.ask.text, chips: chipsFor(live.ask), turnId: null });
    lines.push(...stepLines(live.steps, prefix, expanded, undefined, live.steps.length - 1));
    if (live.queued) lines.push({ key: `${prefix}:queued`, kind: 'queued', text: live.queued });
  }

  return lines;
}

const MARK: Record<string, string> = { ask: '>', step: '●', detail: '  ⎿', reply: '◆', plan: '▸', system: '—', queued: '> next:' };
const OUTCOME_MARK = { ok: '✓', none: '○', fail: '✗' } as const;

/** The transcript as Markdown for `/export`: the same marks, so it reads like the screen. */
export function toMarkdown(title: string, lines: TerminalLine[]): string {
  const out = [`# ${title}`, ''];

  for (const line of lines) {
    switch (line.kind) {
      case 'ask':
        out.push('', `> ${line.text}${line.chips.length ? `  (${line.chips.join(', ')})` : ''}`, '');
        break;
      case 'outcome':
        out.push(`${OUTCOME_MARK[line.tone]} ${line.text}`);
        break;
      case 'plan':
        out.push(`${MARK.plan} ${line.summary}`, ...line.steps.map((step, i) => `   ${i + 1}. ${step}`));
        break;
      case 'step':
        out.push(`${MARK.step} ${line.text}${line.ms ? ` (${Math.max(1, Math.round(line.ms / 1000))}s)` : ''}`);
        break;
      default:
        out.push(`${MARK[line.kind]} ${line.text}`);
    }
  }

  return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}
