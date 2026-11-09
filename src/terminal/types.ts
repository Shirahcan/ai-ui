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

/** How capable a model answers (1.45.0): the ordinary waterfall, or Pro and Expert, each falling back. */
export type TerminalLevel = 'normal' | 'pro' | 'expert';

/** How hard the model thinks (1.45.0). */
export type TerminalEffort = 'low' | 'medium' | 'high';

/** Build directly, plan first, or think it through together without changing anything (1.45.0). */
export type TerminalMode = 'build' | 'plan' | 'brainstorm';

/** Something the assistant noticed, listed under its reply as Claude Code's summary does (1.45.0). */
export interface TerminalFinding {
  kind: 'issue' | 'error' | 'gap' | 'suggestion' | string;
  text: string;
}

/** One choice of a question (the multiple-choice tool). */
export interface TerminalOption {
  label: string;
  description?: string | null;
  /** The choice the assistant recommends (drawn with a badge; owner 2026-11-09: "always ... specify which options it recommends"). */
  recommended?: boolean;
}

/** A question the assistant asks before it goes on (1.45.0), with choices or none (the person types). */
export interface TerminalQuestion {
  text: string;
  options: TerminalOption[];
  multi?: boolean;
  /** A word or two naming the question: its tab when there are several ("Tone", "Audience"). */
  header?: string | null;
}

/** An answer the person gave, as they read it. */
export interface TerminalAnswer {
  question: string;
  answer: string;
}

/** A brainstorm's idea. */
export interface TerminalIdea {
  title: string;
  why?: string | null;
}

export interface TerminalTurnStructured {
  /** The element the ask was aimed at, as the person names it. */
  target?: string | null;
  files?: string[];
  mode?: TerminalMode | string;
  steps?: TerminalStep[];
  outcome?: TerminalOutcome;
  checkpoint_id?: string | null;
  run_id?: string | null;
  plan?: TerminalPlan | null;
  /** The level asked for and the level that answered (1.45.0). */
  level?: TerminalLevel | null;
  served_level?: TerminalLevel | null;
  effort?: TerminalEffort | null;
  findings?: TerminalFinding[];
  questions?: TerminalQuestion[];
  ideas?: TerminalIdea[];
  recommendation?: string | null;
  /** On an ask: the answers it gives to the questions before it. */
  answers?: TerminalAnswer[];
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
  /** The turn it came after, so it stays where it happened; absent or unknown: after everything. */
  after?: string | null;
}

type Muted = { muted?: 'rewound' | 'folded' };

/**
 * One line of the transcript. ⚠ FOLDED, NEVER CUT (1.45.0, owner 2026-11-09): a line that may be long
 * carries `open` (the person opened it, or Ctrl+O opened everything); the panel draws a long one folded
 * with "+N lines" until it is open. A rewound turn folds whole into its ask line (`folded` = the lines
 * it holds, `foldKey` opens it).
 */
export type TerminalLine =
  | ({ key: string; kind: 'ask'; text: string; chips: string[]; turnId: string | null; answers?: TerminalAnswer[]; folded?: number; foldKey?: string } & Muted)
  | ({ key: string; kind: 'step'; text: string; ms: number | null; live: boolean; stepKind: string } & Muted)
  /** The assistant's thinking: open while it streams, folded to "Thought for 12s" once anything follows. */
  | ({ key: string; kind: 'thinking'; text: string; ms: number | null; live: boolean; open: boolean } & Muted)
  | ({ key: string; kind: 'detail'; text: string; stepKind: string; open: boolean } & Muted)
  | ({ key: string; kind: 'reply'; text: string; open: boolean } & Muted)
  | ({ key: string; kind: 'finding'; findingKind: string; text: string; actionable: boolean } & Muted)
  | ({ key: string; kind: 'question'; turnId: string; questions: TerminalQuestion[]; answerable: boolean; answers: TerminalAnswer[] } & Muted)
  | ({ key: string; kind: 'ideas'; ideas: TerminalIdea[]; recommendation: string | null; open: boolean } & Muted)
  | ({ key: string; kind: 'outcome'; tone: 'ok' | 'none' | 'fail'; text: string; turnId: string | null; canRewind: boolean; level?: string | null; retry?: TerminalLevel | null } & Muted)
  | ({ key: string; kind: 'plan'; summary: string; steps: string[]; turnId: string | null; open: boolean } & Muted)
  | { key: string; kind: 'system'; text: string; tone: 'system' | 'fail' | 'ok' }
  | { key: string; kind: 'recap'; lines: string[] }
  | { key: string; kind: 'queued'; text: string };
