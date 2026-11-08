/**
 * The console's data, as the kit's `TerminalRoutes` (shirahcan/ai-client >= 1.58) returns it, plus the
 * live state of an ask while it runs. Neutral: no product's words or fields.
 */

/** One step an ask took ("Writing the hero"), with how long it took and one line of detail. */
export interface TerminalStep {
  kind: string;
  text: string;
  ms?: number | null;
  detail?: string | null;
}

/** What came of an ask. */
export interface TerminalOutcome {
  changed?: boolean;
  elements?: number;
  /** Edits the person made while the assistant worked, kept. */
  kept?: number;
  /** Elements both changed; the person's version won. */
  conflicts?: number;
  /** Why it could not finish (a refusal, an outage, a stop). */
  reason?: string | null;
}

export interface TerminalPlan {
  summary: string;
  steps: string[];
}

export interface TerminalTurnStructured {
  /** The element the ask was aimed at, as the person names it. */
  target?: string | null;
  files?: string[];
  mode?: 'build' | 'plan' | string;
  steps?: TerminalStep[];
  outcome?: TerminalOutcome;
  checkpoint_id?: string | null;
  run_id?: string | null;
  plan?: TerminalPlan | null;
}

export interface TerminalTurn {
  id: string;
  role: 'user' | 'assistant' | string;
  body: string | null;
  structured: TerminalTurnStructured | null;
  /** Rewound: kept on screen, dimmed, left out of the context. */
  rewound: boolean;
  at: string | null;
}

export interface TerminalSummary {
  text: string;
  /** `before`: it covers turns before the ones still shown in full; `after`: the turns from a point on. */
  scope: 'before' | 'after' | string;
  turns_folded: number;
  at: string | null;
  folded: string[];
}

export interface TerminalSessionRow {
  id: string;
  title: string | null;
  started_at: string | null;
  last_at: string | null;
  turns: number;
  summary: TerminalSummary | null;
}

export interface TerminalSize {
  parts: { brief: number; summary: number; turns: number; design: number; files: number };
  used: number;
  budget: number;
  percent: number;
  compact_at: number;
}

export interface TerminalBrief {
  text: string;
  by: string | null;
  at: string | null;
}

/** One subject's console as the kit's show/open/start routes return it. */
export interface TerminalConsoleData {
  subject: { ref: string; label: string };
  session: TerminalSessionRow | null;
  turns: TerminalTurn[];
  brief: TerminalBrief | null;
  size: TerminalSize;
  /** The subject's asks, newest first, for the up-arrow. */
  history: string[];
}

/** An ask under way: shown line by line before it is recorded. */
export interface TerminalLive {
  /** Its start, which also keys its lines, so the next ask starts fresh. */
  startedAt: number;
  ask: { text: string; target?: string | null; files?: string[]; mode?: string } | null;
  /** The steps so far, in order; the last one is the one running now. */
  steps: TerminalStep[];
  /** What the assistant is doing right now, when it is not a step yet ("Getting ready"). */
  verb: string | null;
  /** What the person added to run next. */
  queued: string | null;
  stopping?: boolean;
}

/** A line the host adds itself: a screen clear, a refusal before anything ran, a command's answer. */
export interface TerminalNote {
  key: string;
  tone?: 'system' | 'fail' | 'ok';
  text: string;
}

type Muted = { muted?: 'rewound' | 'folded' };

export type TerminalLine =
  | ({ key: string; kind: 'ask'; text: string; chips: string[]; turnId: string | null } & Muted)
  | ({ key: string; kind: 'step'; text: string; ms: number | null; live: boolean; stepKind: string } & Muted)
  | ({ key: string; kind: 'detail'; text: string; stepKind: string } & Muted)
  | ({ key: string; kind: 'reply'; text: string } & Muted)
  | ({ key: string; kind: 'outcome'; tone: 'ok' | 'none' | 'fail'; text: string; turnId: string | null; canRewind: boolean } & Muted)
  | ({ key: string; kind: 'plan'; summary: string; steps: string[]; turnId: string | null; open: boolean } & Muted)
  | { key: string; kind: 'system'; text: string; tone: 'system' | 'fail' | 'ok' }
  | { key: string; kind: 'queued'; text: string };
