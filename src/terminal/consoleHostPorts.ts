import type { AttachmentChip } from '../types';
import type { AssistantTerminalProps } from './AssistantTerminal';
import type { ConsoleApi, ConsoleCheckpoint } from './consoleApi';
import type { ConsoleData } from './useConsoleData';
import type { TerminalAnswer, TerminalEffort, TerminalLevel, TerminalMode, TerminalStep } from './types';

/**
 * The ports a product implements to mount the console (shared console C4c): the RUNNER that asks and builds, the
 * TARGET an ask is aimed at, and the SUBJECT it changes. Portify implements them over useCreatorPorter, usePorterTarget
 * and its page or component builder; growth-ui implements them over growth-service documents.
 */
export type ConsoleAskMode = 'build' | 'plan' | 'brainstorm' | 'compare';

/** A run under way, as the console draws it. A product's run state may carry more; the console reads only this. */
export interface ConsoleRunState {
  startedAt: number;
  steps?: TerminalStep[];
  thinking?: string | null;
  stopping?: boolean;
}

/** What asks and builds: the product's own engine (Portify: useCreatorPorter). */
export interface ConsoleRunner<S extends ConsoleRunState = ConsoleRunState> {
  building: S | null;
  /** What the person added while a run was going; it runs next. */
  queued: string | null;
  asking: boolean;
  /** The last answer's words, for a console with no session to record them. */
  answer: string | null;
  plan: { instruction: string } | null;
  planFirst: boolean;
  brainstorm: boolean;
  /** Resolves with the answer's line, or null when the ask failed. */
  ask: (text: string, target: number[] | null, fileIds?: string[], mode?: ConsoleAskMode) => Promise<string | null>;
  buildPlan: () => Promise<string | null>;
  buildAgreed: (instruction: string, steps: string[]) => Promise<string | null>;
  dismissPlan: () => void;
  stop: () => void;
  setPlanFirst: (on: boolean) => void;
  setBrainstorm: (on: boolean) => void;
}

/** The element an ask is aimed at ("@"), by its path in the subject's tree. */
export interface ConsoleTarget {
  node: unknown | null;
  path: number[] | null | undefined;
  add: (path: number[]) => void;
  clear: () => void;
}

/** What the console changes: a page, a component, a post. */
export interface ConsoleSubject<D = unknown> {
  /** "page" or "design": what the console calls it. */
  noun: string;
  nodes: { children?: unknown }[];
  /** The name a person calls an element ("Hero", "FAQ 2"); empty to leave it out of "@". */
  labelFor: (path: number[]) => string;
  /** Put the design back as a rewind point had it (through the product's own validated save). */
  restoreDesign: (checkpoint: ConsoleCheckpoint<D>) => void;
  /** Show one element by its id (a "what changed" line). */
  showElement?: (uid: string) => void;
  /** Briefly mark the elements an ask just changed. */
  flashChanges?: (uids: string[]) => void;
  /** "Compare with the picture": the design as drawn, and the console's own upload for it. Both, or no Compare. */
  capture?: () => Promise<File | null>;
  upload?: (file: File) => Promise<AttachmentChip>;
}

export interface ConsoleHostOptions<K extends string, D, S extends ConsoleRunState> {
  api: ConsoleApi<K, D>;
  kind: K;
  id: string;
  console: ConsoleData;
  runner: ConsoleRunner<S>;
  target: ConsoleTarget;
  subject: ConsoleSubject<D>;
  /** What the run is doing now, in words ("Writing the FAQ"). */
  verbFor: (run: S, noun: string) => string;
  /** The assistant's name, as the console's header says it. */
  assistantName: string;
  /** Where the person's console settings are kept (see useConsolePrefs). */
  storagePrefix?: string;
  /** Props the product adds: its guides and templates (useConsoleGuides / useConsoleTemplates). */
  extraProps?: Partial<AssistantTerminalProps>;
  /** Hands-free reads the answer aloud. */
  answered?: (line: string | null) => void;
  /** A failure that is not an HTTP answer (a refused upload): the product's error surface. */
  onError: (error: unknown) => void;
  /** The modes this surface offers (1.60.1). A surface whose engine only builds passes ['build']. */
  modes?: TerminalMode[];
}

/** What an ask carries besides its words: its own mode or level (a retry, "Do this"), and answers. */
export interface AskOptions {
  mode?: ConsoleAskMode;
  /** The effort this one ask runs at ("Think harder" after a failure); else the console's. */
  effort?: TerminalEffort;
  /** The console wrote this ask itself (Compare): a failure does not put its words back in the composer. */
  ownWords?: false;
  level?: TerminalLevel;
  answers?: TerminalAnswer[];
}

/** An ask quoted back in one line: cut at a word, never mid-word. */
export function shortenAsk(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();

  if (flat.length <= 60) return flat;

  const cut = flat.slice(0, 58);
  const atWord = cut.replace(/\s+\S*$/, '');

  return `${atWord.length >= 30 ? atWord : cut}…`;
}

/** Every element of a design with the name a person calls it, for "@". */
export function elementsOf(nodes: { children?: unknown }[], labelFor: (path: number[]) => string, at: number[] = []): { path: number[]; label: string }[] {
  return nodes.flatMap((node, i) => {
    const path = [...at, i];
    const children = Array.isArray(node.children) ? (node.children as { children?: unknown }[]) : [];
    const label = labelFor(path);

    return [...(label ? [{ path, label }] : []), ...elementsOf(children, labelFor, path)];
  });
}
