import type { TerminalLevel, TerminalLine, TerminalLive, TerminalNote, TerminalOutcome, TerminalSessionRow, TerminalStep, TerminalTurn } from './types';

/** Steps whose detail is shown even when details are collapsed: the ones a person acts on. */
const ALWAYS_DETAILED = new Set(['gather', 'repair', 'check', 'merge']);

const LEVEL_ORDER: TerminalLevel[] = ['normal', 'pro', 'expert'];

/** The levels as the person reads them (owner 2026-11-09: name the level, never the model). */
export const LEVEL_LABELS: Record<TerminalLevel, string> = { normal: 'Normal', pro: 'Pro', expert: 'Expert' };

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function isLevel(value: unknown): value is TerminalLevel {
  return value === 'normal' || value === 'pro' || value === 'expert';
}

/** The level above this one, or null at the top ("Try again at Pro"). */
export function nextLevel(level: string | null | undefined): TerminalLevel | null {
  const at = LEVEL_ORDER.indexOf(isLevel(level) ? level : 'normal');

  return LEVEL_ORDER[at + 1] ?? null;
}

/**
 * Which level answered, in the person's words: `by Expert`, or `Expert unavailable, Pro answered` when the
 * level asked for could not serve (no key, a spent account) and a lower one did. Nothing when no level
 * above Normal was asked.
 */
export function levelPhrase(asked: string | null | undefined, served: string | null | undefined): string | null {
  if (!isLevel(asked) || asked === 'normal') return null;
  if (!isLevel(served)) return `at ${LEVEL_LABELS[asked]}`;

  return served === asked ? `by ${LEVEL_LABELS[asked]}` : `${LEVEL_LABELS[asked]} unavailable, ${LEVEL_LABELS[served]} answered`;
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

type IsOpen = (key: string) => boolean;

function stepLines(steps: TerminalStep[], keyPrefix: string, expanded: boolean, isOpen: IsOpen, muted: 'rewound' | 'folded' | undefined, liveIndex: number | null): TerminalLine[] {
  const lines: TerminalLine[] = [];

  steps.forEach((step, i) => {
    const live = liveIndex === i;
    const key = `${keyPrefix}:step:${i}`;

    // The assistant's thinking is ONE line: open while it is the last thing being written, folded the
    // moment anything follows it (owner 2026-11-09), and opened again by the person or Ctrl+O.
    if (step.kind === 'think') {
      lines.push({ key, kind: 'thinking', text: (step.detail ?? '').trim(), ms: step.ms ?? null, live, open: live || isOpen(key), muted });

      return;
    }

    lines.push({ key, kind: 'step', text: step.text, ms: step.ms ?? null, live, stepKind: step.kind, muted });

    if (step.detail && (expanded || live || ALWAYS_DETAILED.has(step.kind))) {
      const detailKey = `${keyPrefix}:detail:${i}`;

      lines.push({ key: detailKey, kind: 'detail', text: step.detail, stepKind: step.kind, open: isOpen(detailKey), muted });
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
  if (structured.mode === 'brainstorm') chips.push('brainstorm');

  return chips;
}

export interface ToLinesOptions {
  session?: TerminalSessionRow | null;
  live?: TerminalLive | null;
  /** Ctrl+O: every step's detail and timing, and everything folded opened. */
  expanded?: boolean;
  /** The entries the person opened (thinking, a long reply, a rewound turn), by line key. */
  opened?: ReadonlySet<string>;
  /** Lines the host adds (a cleared screen, a command's answer), placed after the turns they follow. */
  notes?: TerminalNote[];
  /** Turns before this id are off screen (Ctrl+L clears the screen, the session is kept). */
  clearedThrough?: string | null;
  /** The assistant's name, for the summary marker ("Porter"). */
  assistantName?: string;
  /** Where the session stands, after an idle time (`/recap`): drawn after the last turn. */
  recap?: { key: string; lines: string[] } | null;
}

/**
 * The console's lines, in order: each recorded ask with its steps, reply and outcome; the ask running
 * now growing step by step; what is queued next; and the host's notes.
 *
 * ⚠ KEYS ARE STABLE. A recorded turn keys by its id and a live ask by its start, so a line already on
 * screen is never re-keyed while the next ones arrive: the transcript grows, it never redraws. Opening a
 * fold is a key in `opened`, so it survives every redraw too.
 */
export function toLines(turns: TerminalTurn[], options: ToLinesOptions = {}): TerminalLine[] {
  const { session = null, live = null, expanded = false, opened, notes = [], clearedThrough = null, assistantName = 'the assistant', recap = null } = options;
  const isOpen: IsOpen = (key) => expanded || (opened?.has(key) ?? false);
  const folded = new Set(session?.summary?.folded ?? []);
  const lines: TerminalLine[] = [];
  let visible = clearedThrough === null;
  let lastFoldedAt = -1;
  let askId: string | null = null;
  // A rewound turn the person has not opened: its lines are counted into its ask line, not drawn.
  let collapsed: Extract<TerminalLine, { kind: 'ask' }> | null = null;
  const lastIndex = turns.length - 1;

  turns.forEach((turn, index) => {
    if (!visible) {
      if (turn.id === clearedThrough) visible = true;

      return;
    }

    const muted: 'rewound' | 'folded' | undefined = turn.rewound ? 'rewound' : folded.has(turn.id) ? 'folded' : undefined;
    const out: TerminalLine[] = [];

    if (turn.role === 'user') {
      askId = turn.id;
      collapsed = null;

      const foldKey = `${turn.id}:fold`;
      const ask: Extract<TerminalLine, { kind: 'ask' }> = {
        key: `${turn.id}:ask`,
        kind: 'ask',
        text: (turn.body ?? '').trim(),
        chips: chipsFor(turn.structured),
        turnId: turn.id,
        answers: turn.structured?.answers ?? [],
        muted,
      };

      // Rewind folds the whole block (owner 2026-11-09): the ask stays, what came of it is one click away.
      if (turn.rewound && !isOpen(foldKey)) {
        ask.folded = 0;
        ask.foldKey = foldKey;
        collapsed = ask;
      } else if (turn.rewound) {
        ask.foldKey = foldKey;
      }

      lines.push(ask);
    } else if (turn.role === 'assistant') {
      const s = turn.structured ?? {};
      const last = index === lastIndex && !turn.rewound && live === null;
      const asked = s.level ?? null;

      out.push(...stepLines(s.steps ?? [], turn.id, expanded, isOpen, muted, null));

      // A plan's own summary is its reply: drawn once, in the plan.
      if (turn.body && turn.body.trim() !== '' && turn.body.trim() !== s.plan?.summary?.trim()) {
        out.push({ key: `${turn.id}:reply`, kind: 'reply', text: turn.body.trim(), open: isOpen(`${turn.id}:reply`), muted });
      }

      (s.findings ?? []).forEach((finding, i) => {
        out.push({ key: `${turn.id}:finding:${i}`, kind: 'finding', findingKind: finding.kind, text: finding.text, actionable: !turn.rewound && live === null, muted });
      });

      if (s.ideas?.length || s.recommendation) {
        out.push({ key: `${turn.id}:ideas`, kind: 'ideas', ideas: s.ideas ?? [], recommendation: s.recommendation ?? null, open: last, muted });
      }

      const questions = s.questions ?? [];
      const after = turns[index + 1];
      const answeredBy = after?.role === 'user' ? (after.structured?.answers ?? []) : [];

      if (questions.length > 0) {
        out.push({ key: `${turn.id}:question`, kind: 'question', turnId: turn.id, questions, answerable: last, answers: answeredBy, muted });
      }

      if (s.plan) {
        // A plan waits for a yes only while it is the last thing said and nothing is running.
        out.push({ key: `${turn.id}:plan`, kind: 'plan', summary: s.plan.summary, steps: s.plan.steps ?? [], turnId: askId, open: last, muted });
      } else if (questions.length === 0 && !(s.ideas?.length || s.recommendation)) {
        const outcome = outcomeLine(s.outcome);
        const retry = outcome.tone === 'fail' && last ? nextLevel(asked) : null;

        out.push({
          key: `${turn.id}:outcome`,
          kind: 'outcome',
          tone: outcome.tone,
          text: outcome.text,
          turnId: askId,
          canRewind: !turn.rewound && Boolean(s.outcome?.changed),
          level: levelPhrase(asked, s.served_level),
          retry,
          muted,
        });
      }

      if (collapsed !== null) {
        collapsed.folded = (collapsed.folded ?? 0) + out.length;
      } else {
        lines.push(...out);
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

  if (recap && recap.lines.length > 0 && live === null) lines.push({ key: recap.key, kind: 'recap', lines: recap.lines });

  if (live) {
    const prefix = `live:${live.startedAt}`;

    if (live.ask) lines.push({ key: `${prefix}:ask`, kind: 'ask', text: live.ask.text, chips: chipsFor(live.ask), turnId: null });
    lines.push(...stepLines(live.steps, prefix, expanded, isOpen, undefined, live.steps.length - 1));
    if (live.queued) lines.push({ key: `${prefix}:queued`, kind: 'queued', text: live.queued });
  }

  return lines;
}

/** An ask as a recap quotes it: cut at a word, never mid-word. */
function quote(text: string, max = 70): string {
  const flat = text.replace(/\s+/g, ' ').trim();

  if (flat.length <= max) return flat;

  const cut = flat.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');

  return `${(space > max * 0.5 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/**
 * Where the session stands, in three or four lines, for a person coming back after a break (1.45.0,
 * owner 2026-11-09: "session recap after a set idle duration"). Drawn from the turns alone: no AI call.
 */
export function recapLines(turns: TerminalTurn[], words: { assistant: string; subject: string }): string[] {
  const live = turns.filter((t) => !t.rewound);
  const answers = live.filter((t) => t.role === 'assistant');
  const asks = live.filter((t) => t.role === 'user');

  if (asks.length === 0) return [];

  const changed = answers.filter((t) => t.structured?.outcome?.changed).length;
  const failed = answers.filter((t) => outcomeLine(t.structured?.outcome).tone === 'fail' && !t.structured?.plan && !t.structured?.questions?.length).length;
  const out = [`${plural(asks.length, 'ask', 'asks')} in this session: ${changed} changed the ${words.subject}${failed > 0 ? `, ${failed} could not finish` : ''}.`];
  const lastAsk = asks.at(-1);
  const lastTurn = live.at(-1);

  if (lastAsk) {
    const lastAnswer = lastTurn?.role === 'assistant' ? lastTurn : null;
    const result = lastAnswer
      ? lastAnswer.structured?.plan
        ? 'a plan, not built yet'
        : lastAnswer.structured?.questions?.length
          ? `${words.assistant} asked you a question`
          : lastAnswer.structured?.ideas?.length || lastAnswer.structured?.recommendation
            ? `${words.assistant} offered ideas`
            : outcomeLine(lastAnswer.structured?.outcome).text
      : 'no answer was recorded';

    out.push(`Last: “${quote(lastAsk.body ?? '')}”, ${result.charAt(0).toLowerCase()}${result.slice(1)}.`);
  }

  const open = lastTurn?.role === 'assistant' ? lastTurn.structured : null;

  if (open?.plan) out.push('Waiting on you: the plan above, to build or dismiss.');
  else if (open?.questions?.length) out.push(`Waiting on you: ${plural(open.questions.length, 'question', 'questions')} above.`);
  else if (open?.recommendation) out.push('Waiting on you: build the recommendation above, or ask for something else.');
  else if (open && outcomeLine(open.outcome).tone === 'fail') out.push('Nothing changed. Try again at a higher level, or ask differently.');

  return out;
}

const MARK: Record<string, string> = { ask: '>', step: '●', thinking: '✻', detail: '  ⎿', reply: '◆', finding: '  ⎿', plan: '▸', system: '—', queued: '> next:' };
const OUTCOME_MARK = { ok: '✓', none: '○', fail: '✗' } as const;

/** The transcript as Markdown for `/export`: the same marks, so it reads like the screen. */
export function toMarkdown(title: string, lines: TerminalLine[]): string {
  const out = [`# ${title}`, ''];

  for (const line of lines) {
    switch (line.kind) {
      case 'ask':
        out.push('', `> ${line.text}${line.chips.length ? `  (${line.chips.join(', ')})` : ''}`, ...(line.answers ?? []).map((a) => `>   ${a.question} ${a.answer}`), '');
        break;
      case 'outcome':
        out.push(`${OUTCOME_MARK[line.tone]} ${line.text}${line.level ? ` (${line.level})` : ''}`);
        break;
      case 'plan':
        out.push(`${MARK.plan} ${line.summary}`, ...line.steps.map((step, i) => `   ${i + 1}. ${step}`));
        break;
      case 'step':
        out.push(`${MARK.step} ${line.text}${line.ms ? ` (${Math.max(1, Math.round(line.ms / 1000))}s)` : ''}`);
        break;
      case 'thinking':
        out.push(`${MARK.thinking} Thinking`, ...line.text.split('\n').map((l) => `   ${l}`));
        break;
      case 'finding':
        out.push(`${MARK.finding} ${line.findingKind}: ${line.text}`);
        break;
      case 'question':
        for (const q of line.questions) out.push(`? ${q.text}`, ...q.options.map((o, i) => `   ${i + 1}. ${o.label}${o.description ? `: ${o.description}` : ''}`));
        break;
      case 'ideas':
        out.push(...line.ideas.map((idea) => `- ${idea.title}${idea.why ? `: ${idea.why}` : ''}`), ...(line.recommendation ? [`Recommended: ${line.recommendation}`] : []));
        break;
      case 'recap':
        out.push(...line.lines.map((l) => `— ${l}`));
        break;
      default:
        out.push(`${MARK[line.kind]} ${line.text}`);
    }
  }

  return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}
