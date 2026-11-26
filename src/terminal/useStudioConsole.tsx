'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ConsoleHost, useConsoleOpen, type ConsoleHostProps } from './ConsoleHost';
import type { ConsoleCheckpoint } from './consoleApi';
import type { ConsoleTarget } from './consoleHostPorts';
import { mimeOfName, nodeAtPath, proposalStateOf, runOfTurn, type StudioConsoleOptions, type StudioConsoleSubject, type StudioHandOff, type StudioNode } from './studioConsole';
import type { TerminalCardOutcome } from './types';
import { useConsoleData } from './useConsoleData';
import { useConsoleHost } from './useConsoleHost';
import { WORKER_GIVE_UP_MS, useWorkerConsoleRunner, type WorkerRun, type WorkerRunApi, type WorkerRunState } from './useWorkerConsoleRunner';

/** The run a subject's console was waiting on when the tab closed or reloaded, kept per viewer in this browser. */
interface LiveRun {
  run: string;
  path: number[] | null;
  at: number;
}

function readLiveRun(key: string): LiveRun | null {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as Partial<LiveRun>) : null;

    return parsed && typeof parsed.run === 'string' && typeof parsed.at === 'number'
      ? { run: parsed.run, path: Array.isArray(parsed.path) ? parsed.path.filter((step): step is number => typeof step === 'number') : null, at: parsed.at }
      : null;
  } catch {
    return null;
  }
}

function writeLiveRun(key: string, live: LiveRun | null): void {
  try {
    if (live) window.localStorage.setItem(key, JSON.stringify(live));
    else window.localStorage.removeItem(key);
  } catch {
    // Storage blocked (a private window): a reload mid-run then shows the result on the next open, as before.
  }
}

export interface StudioConsoleHandle {
  /** Spread into `<ConsoleHost>` (or render `<StudioConsole>`). */
  host: ConsoleHostProps;
  /** The canvas's hand-off: open the console, aim it, ask, as a normal turn (or open the details, per `canAim`). */
  handOff: (ask: StudioHandOff) => void;
  /** A run is in flight. */
  busy: boolean;
}

/**
 * The whole console for one Studio subject (1.63.0, shared Studio P4a3). The four mount rules, each a defect already
 * paid for on Portify:
 *
 *   1. Every programmatic ask (a hand-off, a prepare) goes through the composer's own `onAsk`, never a session made by
 *      hand and a runner called directly (TEST showed "0 turns" and the welcome for a whole run).
 *   2. A proposal's decided state is the SERVER's `card_state` on its turn, written through `api.decide` (a reload of
 *      per-tab state offered Apply again on something applied).
 *   3. "Changed N elements" is the outcome the server recorded from the nodes the run returned; the console never
 *      recounts ("Changed 19 elements" for one heading).
 *   4. What can be aimed is the subject's `canAim`, ONE authority (the profile), never a client copy of a server rule.
 *
 * And a run outlives its tab (1.65.0): the worker keeps the result as the subject's draft, so a reload mid-run loses
 * nothing; the console remembers the run it is waiting on (this browser only) and the reopened console follows it to
 * the end and lands it, instead of showing the ask with no answer over the design as it was before.
 */
export function useStudioConsole<K extends string, N extends StudioNode, R = unknown, D = N[]>(subject: StudioConsoleSubject<K, N, R, D>, options: StudioConsoleOptions): StudioConsoleHandle {
  const { api, kind, id, noun } = subject;
  const { onError, onBusyChange, prepare = null, onPrepareSent, onApplied } = options;
  const [ownOpen, setOwnOpen] = useConsoleOpen(prepare !== null, options.openKey);
  // A host that owns the open state (a share card's designer) decides it; otherwise the console remembers it.
  const open = options.open ?? ownOpen;
  const setOpen = options.onOpenChange ?? setOwnOpen;
  const data = useConsoleData(api, kind, id, true);
  const subjectRef = useRef(subject);
  const pending = useRef<Record<string, unknown> | null>(null);
  const asked = useRef(false);
  // The block an ask is aimed at ("@", or a hand-off), the name the canvas gave it, and a stamp so the same block aimed
  // twice still counts as a new aim. Read by the run when it starts; the run's own path places its result back.
  const [aim, setAim] = useState<{ path: number[]; label: string | null; at: number } | null>(null);
  const aimPath = useRef<number[] | null>(null);
  const runPath = useRef<number[] | null>(null);
  const queued = useRef<string | null>(null);
  const [handOffs, setHandOffs] = useState(0);

  useEffect(() => {
    subjectRef.current = subject;
  });

  const verbFor = useCallback(
    (run: WorkerRunState): string => {
      if (run.stopping) return 'Stopping';
      if (run.thinking) return 'Thinking';

      return (run.steps?.length ?? 0) > 0 ? `${options.workingVerb ?? 'Working on'} the ${noun}` : `Reading the ${noun}`;
    },
    [noun, options.workingVerb],
  );

  const runApi = useMemo<WorkerRunApi<R>>(() => {
    /** What every run sends: the SAVED design (a waiting save goes first), and the block an ask is aimed at. */
    const prepared = async (payload: Record<string, unknown>): Promise<Record<string, unknown>> => {
      // The run reads the SAVED design: send a waiting save first, and never start on one that did not save.
      if (!(await subjectRef.current.flush())) throw new Error('Your latest change has not saved yet, so I did not start. Try again in a moment.');
      const extra = pending.current;
      pending.current = null;
      // A prepare fills the whole document; any other ask aimed at one block revises only that block.
      const path = extra ? null : aimPath.current;
      runPath.current = path;

      return { ...payload, ...(extra ?? {}), ...(path ? { path } : {}) };
    };
    const startPlanRun = api.startPlanRun;

    return {
      startRun: async (runFor, payload) => api.startRun(runFor, (await prepared(payload)) as typeof payload),
      getRun: api.getRun,
      stopRun: api.stopRun,
      // Plan first and Brainstorm (1.70.0): only when the product can plan; the plan reads the same saved design.
      ...(startPlanRun ? { startPlanRun: async (runFor: string, payload: Parameters<typeof startPlanRun>[1]) => startPlanRun(runFor, (await prepared(payload)) as typeof payload) } : {}),
    };
  }, [api]);

  const onLanded = useCallback((run: WorkerRun<R>) => subjectRef.current.land(run, runPath.current), []);
  const { note } = data;
  // A refused ask is said in the console, as a failure note after the last turn, in the server's own words.
  const onRefused = useCallback((message: string) => note(message, 'fail'), [note]);
  const liveKey = `${options.storagePrefix ?? 'porter-console'}:live-run:${kind}:${id}`;
  const onRunChange = useCallback(
    (run: string | null) => writeLiveRun(liveKey, run ? { run, path: runPath.current, at: Date.now() } : null),
    [liveKey],
  );
  const runner = useWorkerConsoleRunner<R>(runApi, id, data.extras as () => Record<string, unknown>, onLanded, { onError, onRefused, onRunChange });

  // A run still under way when this tab closed or reloaded: follow it to the end, once, when the session has been read.
  // Only while its ask is still the last turn (no answer recorded yet); otherwise the design already holds the result.
  const resumed = useRef(false);
  const { resume } = runner;
  const { refresh: refreshSession } = data;
  useEffect(() => {
    if (resumed.current || !data.data) return;
    resumed.current = true;
    const live = readLiveRun(liveKey);
    if (!live) return;
    const last = data.data.turns?.at(-1);
    if (Date.now() - live.at > WORKER_GIVE_UP_MS || !last || last.role === 'assistant') {
      writeLiveRun(liveKey, null);

      return;
    }
    runPath.current = live.path;
    void resume(live.run).then(() => refreshSession());
  }, [data.data, liveKey, refreshSession, resume]);

  useEffect(() => {
    onBusyChange?.(runner.building !== null);
  }, [onBusyChange, runner.building]);

  // Rule 2: what became of a proposal is the server's card state; `decided` only covers the moment before it is read.
  const turns = useMemo(() => data.data?.turns ?? [], [data.data]);
  const [decided, setDecided] = useState<Record<string, TerminalCardOutcome>>({});
  const { refresh } = data;
  const onProposal = useCallback(
    (turnId: string, action: 'apply' | 'dismiss') => {
      const runId = runOfTurn(turns, turnId);
      const session = data.sessionId();
      const apply = subjectRef.current.applyProposal;
      if (!runId || !session || (action === 'apply' && !apply)) return;
      const card: TerminalCardOutcome = action === 'apply' ? 'done' : 'cancelled';

      (async () => {
        if (action === 'apply' && apply) await apply(await api.getRun(runId));
        setDecided((before) => ({ ...before, [turnId]: card }));
        if (action === 'apply') onApplied?.();
        await api.decide(kind, id, session, turnId, card);
        await refresh();
      })().catch(onError);
    },
    [api, data, id, kind, onApplied, onError, refresh, turns],
  );
  const proposalState = useCallback((turnId: string) => proposalStateOf(turns, turnId, decided), [decided, turns]);

  const target = useMemo<ConsoleTarget>(
    () => ({
      node: aim ? nodeAtPath(subject.nodes, aim.path) : null,
      path: aim?.path ?? null,
      add: (path: number[]) => {
        aimPath.current = path;
        setAim({ path, label: null, at: Date.now() });
      },
      clear: () => {
        aimPath.current = null;
        setAim(null);
      },
    }),
    [aim, subject.nodes],
  );

  // A block's name: the canvas's own name when the canvas aimed it, else the subject's; only blocks it may aim at.
  const { labelFor: nameOf, canAim } = subject;
  const labelFor = useCallback(
    (path: number[]) => {
      if (aim?.label && aim.path.length === path.length && aim.path.every((step, i) => step === path[i])) return aim.label;
      const node = nodeAtPath(subject.nodes, path);

      return node && canAim(node) ? nameOf(path) : '';
    },
    [aim, canAim, nameOf, subject.nodes],
  );

  // The rewind point as the subject stores it (a list of elements, or a card's own shape); a point with no design is skipped.
  const restoreDesign = useCallback((checkpoint: ConsoleCheckpoint<D>) => {
    if (checkpoint.design !== null && checkpoint.design !== undefined) subjectRef.current.restore(checkpoint.design);
  }, []);

  const terminal = useConsoleHost({
    api,
    kind,
    id,
    console: data,
    runner,
    target,
    // Compare with the picture (1.71.0): only with a picture, an upload and a plan endpoint, since it runs as a plan.
    subject: {
      noun,
      nodes: subject.nodes,
      labelFor,
      restoreDesign,
      ...(subject.capture && subject.upload && api.startPlanRun ? { capture: subject.capture, upload: subject.upload } : {}),
    },
    verbFor,
    assistantName: options.assistantName,
    storagePrefix: options.storagePrefix ?? 'porter-console',
    // Plan first and Brainstorm are offered only when the product can plan (`api.startPlanRun`, 1.70.0).
    modes: api.startPlanRun ? ['build', 'plan', 'brainstorm'] : ['build'],
    extraProps: { ...options.extraProps, onProposal, proposalState },
    onError,
    answered: options.answered,
  });

  // Rule 1: a handed-over document is asked about ONCE, through the composer's own ask, exactly like a typed ask with
  // the file attached; a reload never asks again.
  const { onAsk } = terminal;
  useEffect(() => {
    if (!prepare || asked.current || !data.data) return;
    asked.current = true;
    const name = prepare.name ?? 'the attached document';

    pending.current = prepare.payload ?? {};
    onPrepareSent?.();
    onAsk(`Prepare this ${noun} from ${name}`, [{ id: prepare.id, name, mime: mimeOfName(name), size: 0 }]);
  }, [data.data, noun, onAsk, onPrepareSent, prepare]);

  // Rule 4: a hand-off aimed at a block the subject does not let the assistant write opens the details instead.
  const handOff = useCallback(
    (ask: StudioHandOff) => {
      const node = ask.path ? nodeAtPath(subjectRef.current.nodes, ask.path) : null;
      if (node && !subjectRef.current.canAim(node)) {
        subjectRef.current.openDetails?.();

        return;
      }
      aimPath.current = ask.path;
      queued.current = ask.text;
      setAim(ask.path ? { path: ask.path, label: ask.label ?? null, at: Date.now() } : null);
      setHandOffs((n) => n + 1);
      setOpen(true);
    },
    [setOpen],
  );

  // Asked once the aim has rendered, so the ask carries it (rule 1: through onAsk).
  useEffect(() => {
    if (!queued.current) return;
    const text = queued.current;
    queued.current = null;
    onAsk(text, []);
  }, [aim, handOffs, onAsk]);

  const working = runner.building ? verbFor(runner.building) : null;

  return {
    host: {
      open,
      onOpenChange: setOpen,
      // Every hand-off puts the cursor in the composer, the console open or not ("Add to Porter" waits for words there).
      terminal: { ...terminal, focusRequest: handOffs },
      composer: { ...options.composer, sendLabel: options.sendLabel ?? 'Change', busy: runner.asking, onStop: runner.stop },
      assistantName: options.assistantName,
      working,
      ...(options.offset ? { offset: options.offset } : {}),
    },
    handOff,
    busy: runner.building !== null,
  };
}

/**
 * The console docked on a Studio, for a product that needs nothing between the hook and the host. `handOffRef` is
 * filled with the console's hand-off, for the canvas's AI actions and a pinned comment's "send to the assistant".
 */
export function StudioConsole<K extends string, N extends StudioNode, R = unknown, D = N[]>({
  subject,
  options,
  handOffRef,
}: {
  subject: StudioConsoleSubject<K, N, R, D>;
  options: StudioConsoleOptions;
  handOffRef?: React.MutableRefObject<((ask: StudioHandOff) => void) | null>;
}): React.JSX.Element {
  const studio = useStudioConsole(subject, options);
  const { handOff } = studio;

  useEffect(() => {
    if (!handOffRef) return undefined;
    handOffRef.current = handOff;

    return () => {
      handOffRef.current = null;
    };
  }, [handOff, handOffRef]);

  return <ConsoleHost {...studio.host} />;
}
