import type { AttachmentChip } from '../types';
import type { AssistantTerminalProps } from './AssistantTerminal';
import type { ConsoleHostProps } from './ConsoleHost';
import type { ConsoleApi } from './consoleApi';
import type { TerminalComposerOptions } from './TerminalInput';
import type { TerminalCardOutcome, TerminalTurn } from './types';
import type { WorkerRun, WorkerRunApi } from './useWorkerConsoleRunner';

/**
 * The Porter console on ANY Studio (1.63.0, shared Studio P4a3): a product writes a SUBJECT (what the object is, how its
 * design is saved, landed and restored, which blocks an ask may be aimed at) and gets the whole console: sessions, asks
 * on a worker, "@" aiming, hand-offs from the canvas, a document prepared once, proposals decided on the server, rewind.
 * Lifted from Portify's DesignerConsole (blog posts, newsletters, email templates). ai-ui never imports PML: the tree is
 * any `{children?}` tree, and everything PML-specific (part marks, details fields) lives in the product's subject.
 */

/** Any element of a design: the console only walks `children`. */
export type StudioNode = { children?: unknown };

/**
 * The console's routes (the kit's TerminalRoutes) and the subject's run routes, in one client. `D` is what a rewind point
 * holds: a design's elements by default, or the subject's own shape (a share card's `{ source, nodes, alt }`, 1.64.0).
 */
export type StudioConsoleApi<K extends string, N, R = unknown, D = N[]> = ConsoleApi<K, D> & WorkerRunApi<R>;

export interface StudioConsoleSubject<K extends string, N extends StudioNode, R = unknown, D = N[]> {
  api: StudioConsoleApi<K, N, R, D>;
  /** The console subject's kind (`growth_post`, `email_template_design`). */
  kind: K;
  id: string;
  /** What the object is called in the assistant's words ("post", "newsletter", "email"). */
  noun: string;
  nodes: N[];
  /** Send a waiting save; false when it did not land (an ask never starts on an unsaved design). */
  flush: () => Promise<boolean>;
  /** Land a finished run: the product puts its result in its tree, aimed at `path`, or the whole document. */
  land: (run: WorkerRun<R>, path: number[] | null) => void;
  /** Put the design back as a rewind point had it (in the subject's own shape, `D`). */
  restore: (design: D) => void;
  /** A block's name for "@" and the transcript; empty leaves it out of "@". */
  labelFor: (path: number[]) => string;
  /** Whether an ask may be aimed at this block: ONE authority (the profile's rule), never a copy of the server's. */
  canAim: (node: N) => boolean;
  /** Apply a proposal (details a run drafted): resolves once written, throws in words a person can act on. */
  applyProposal?: (run: WorkerRun<R>) => Promise<void>;
  /** Where the object's details are edited: a hand-off aimed at a block the assistant does not write opens it. */
  openDetails?: () => void;
  /**
   * "Compare with the picture" (1.71.0): the design as drawn, as an image, and the console's own upload for it. Both, and
   * a product that can plan (`api.startPlanRun`), or no Compare. The compare runs as a plan and changes nothing.
   */
  capture?: () => Promise<File | null>;
  upload?: (file: File) => Promise<AttachmentChip>;
}

/** A document handed over by a create flow ("Start from a document"), asked about once as the console's first ask. */
export interface StudioPrepare {
  /** The console attachment's id. */
  id: string;
  name: string | null;
  /** What the run needs to know it is a prepare (Portify: `{ prepare: true }`). */
  payload?: Record<string, unknown>;
}

/** What the canvas hands the console: an ask's words, aimed at a block (its path) or at the whole document (null). */
export interface StudioHandOff {
  text: string;
  path: number[] | null;
  /** The block's name as the canvas shows it, used for the aim when given. */
  label?: string | null;
}

export interface StudioConsoleOptions {
  /** The assistant's name on the tab and in the header ("Porter"). */
  assistantName: string;
  /** Where the console remembers being open, per object type. */
  openKey: string;
  /** Where the person's console settings are kept. */
  storagePrefix?: string;
  /** The product's error surface (Portify: reportErrorToPorter). */
  onError: (error: unknown) => void;
  /** A run is in flight (the canvas takes no edits meanwhile). */
  onBusyChange?: (busy: boolean) => void;
  prepare?: StudioPrepare | null;
  /** The handed-over document was asked about: drop it from the address, so a reload never asks again. */
  onPrepareSent?: () => void;
  /** A proposal was applied (the product's success notice, a re-read of the object). */
  onApplied?: () => void;
  /** The composer's send button ("Change"). */
  sendLabel?: string;
  /** Props the product adds to the terminal (guides, templates). */
  extraProps?: Partial<AssistantTerminalProps>;
  /**
   * The host owns whether the console is open (1.64.0; a share card's designer opens it from its own button). Both, or
   * neither: without them the console keeps its own open state under `openKey`.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Where the console sits below the host's own header row (passed to ConsoleHost). */
  offset?: ConsoleHostProps['offset'];
  /** What the run is doing once it has steps, before the noun ("Designing" the card); default "Working on". */
  workingVerb?: string;
  /**
   * What the composer offers beyond the words (1.66.0): files attached to an ask (sent as its `reference_ids`), dictation
   * and hands-free, exactly as the product's other consoles offer them. Without it the composer takes words only, which
   * is what every Studio console did until now (Portify 2026-11-18: "missing tools it had before, attachments, voice").
   */
  composer?: Pick<TerminalComposerOptions, 'attachments' | 'dictation' | 'handsFree'>;
  /** The answer's line once an ask has landed (hands-free reads it aloud), or null when it was refused or stopped. */
  answered?: (line: string | null) => void;
}

/** The element at a path, or null. */
export function nodeAtPath<N extends StudioNode>(nodes: N[], path: number[]): N | null {
  let level: unknown[] = nodes;
  let node: N | null = null;

  for (const step of path) {
    const next = level[step];
    if (!next || typeof next !== 'object') return null;
    node = next as N;
    level = Array.isArray(node.children) ? (node.children as unknown[]) : [];
  }

  return node;
}

/** The same tree with the element at `path` replaced. */
export function replaceAtPath<N extends StudioNode>(nodes: N[], path: number[], replacement: N): N[] {
  if (path.length === 0) return nodes;
  const [head, ...rest] = path;

  return nodes.map((node, i) => {
    if (i !== head) return node;
    if (rest.length === 0) return replacement;
    const children = Array.isArray(node.children) ? (node.children as N[]) : [];

    return { ...node, children: replaceAtPath(children, rest, replacement) };
  });
}

/** The run a recorded answer came from (the kit keeps it on the turn). */
export function runOfTurn(turns: TerminalTurn[], turnId: string): string | null {
  const structured = turns.find((turn) => turn.id === turnId)?.structured as { run_id?: unknown } | null | undefined;

  return typeof structured?.run_id === 'string' ? structured.run_id : null;
}

/**
 * A proposal card's state as the terminal draws it: the SERVER's `card_state` first (so a reload, or another device,
 * shows it decided: mount rule 2), else what this tab just did while the session is being read again.
 */
export function proposalStateOf(turns: TerminalTurn[], turnId: string, local: Record<string, TerminalCardOutcome>): 'applied' | 'dismissed' | null {
  const card = turns.find((turn) => turn.id === turnId)?.card_state?.card ?? local[turnId];

  return card === 'done' ? 'applied' : card === 'cancelled' ? 'dismissed' : null;
}

/** A file's type from its name, for the prepare's file chip (the hand-off carries the name and the reference only). */
export function mimeOfName(name: string): string {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  const types: Record<string, string> = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    md: 'text/markdown',
    txt: 'text/plain',
  };

  return types[ext] ?? 'application/octet-stream';
}
