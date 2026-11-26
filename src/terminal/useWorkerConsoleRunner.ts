import { useCallback, useMemo, useRef, useState } from 'react';

import type { ConsoleAskMode, ConsoleRunner, ConsoleRunState } from './consoleHostPorts';
import type { TerminalStep } from './types';

/**
 * A console on a WORKER (Plan first and Brainstorm since 1.70.0, when the product hands in `startPlanRun`) (1.63.0, shared Studio P4a2; moved from Portify's
 * `useWorkerConsoleRunner`, where a share card, a blog post, a newsletter and an email template already used it).
 * An ask starts the subject's Build as a background run, the console polls it, and Stop asks the worker to drop it
 * before anything is saved. Nothing here names a product: the product hands in its run routes, its error surface
 * (`onError`) and, optionally, where a refused ask is said (`onRefused`).
 */

/** What finished elements and steps a run reports while it works (only those since the last look). */
export interface WorkerRunProgress {
  elements?: unknown[];
  steps?: TerminalStep[];
  thinking?: string | null;
}

/** A background run as the product's API returns it. */
export interface WorkerRun<D = unknown> {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | string;
  summary: string | null;
  data?: D | null;
  progress?: WorkerRunProgress | null;
  /**
   * A failed run the server REFUSED (1.71.1): its reason is a sentence the person can act on, already recorded in the
   * session's answer, so it is neither raised as an error nor offered again at another level.
   */
  refused?: boolean;
}

/** A refused run (1.71.1): the session already says why, so the console raises nothing else. */
export class WorkerRunRefused extends Error {}

/** How the console reaches the subject's runs. `getRun`'s cursors are how many elements and steps it has seen. */
export interface WorkerRunApi<D = unknown> {
  startRun: (id: string, payload: { instruction: string } & Record<string, unknown>) => Promise<{ run: WorkerRun<D> }>;
  getRun: (id: string, from?: number, stepsFrom?: number) => Promise<WorkerRun<D>>;
  stopRun: (id: string) => Promise<unknown>;
  /**
   * Plan first and Brainstorm (1.70.0): start the subject's plan or brainstorm as a background run. It changes nothing:
   * the server records the plan (or the ideas and questions) in the console session, and **Build this** then builds it
   * through `startRun` with the agreed steps as `plan`. Without it the console offers Build only.
   */
  startPlanRun?: (id: string, payload: { instruction: string; kind: 'plan' | 'brainstorm' | 'compare' } & Record<string, unknown>) => Promise<{ run: WorkerRun<D> }>;
}

/** A Build on a worker, as the console draws it while it runs. */
export interface WorkerRunState extends ConsoleRunState {
  stopping?: boolean;
}

export interface WorkerRunnerOptions {
  /** The product's error surface for a failure that is not a refusal (Portify: reportErrorToPorter). */
  onError: (error: unknown) => void;
  /** Say the server's refusal of an ask in the console (its `data.note`); without it, the refusal goes to `onError`. */
  onRefused?: (message: string) => void;
  /**
   * The run this console is waiting on, as it starts (its id) and as it ends (null), so a host can remember it across a
   * reload and {@link WorkerConsoleRunner.resume} it (1.65.0: the worker keeps the result; the reopened tab follows it).
   */
  onRunChange?: (runId: string | null) => void;
  /** Overrides for tests: how long to wait between looks, and the clock. */
  pollMs?: number;
  giveUpMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export const WORKER_POLL_MS = 700;
export const WORKER_GIVE_UP_MS = 10 * 60 * 1000;
const UNAVAILABLE = 'I could not finish that just now. Try again in a moment.';
const TOO_LONG = 'That is taking more than 10 minutes, so I stopped waiting for it here. Ask again in a moment.';
const FINISHED = new Set(['succeeded', 'failed']);

const noop = () => undefined;
const nothing = async () => null;
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Poll a run until it finishes: each look asks only for what is new since the last one (appended, never redrawn). A
 * failed run throws its own words; one still going after `giveUpMs` throws, and the run itself carries on.
 */
export async function waitForWorkerRun<D>(
  api: Pick<WorkerRunApi<D>, 'getRun'>,
  id: string,
  onProgress?: (progress: WorkerRunProgress) => void,
  { pollMs = WORKER_POLL_MS, giveUpMs = WORKER_GIVE_UP_MS, sleep = wait }: Pick<WorkerRunnerOptions, 'pollMs' | 'giveUpMs' | 'sleep'> = {},
): Promise<WorkerRun<D>> {
  const started = Date.now();
  let seen = 0;
  let stepsSeen = 0;

  for (;;) {
    const run = await api.getRun(id, seen, stepsSeen);

    if (run.progress) {
      seen += run.progress.elements?.length ?? 0;
      stepsSeen += run.progress.steps?.length ?? 0;
      onProgress?.(run.progress);
    }

    if (FINISHED.has(run.status)) {
      if (run.status === 'failed') throw run.refused === true ? new WorkerRunRefused(run.summary ?? UNAVAILABLE) : new Error(run.summary ?? UNAVAILABLE);

      return run;
    }

    if (Date.now() - started > giveUpMs) throw new Error(TOO_LONG);

    await sleep(pollMs);
  }
}

/** The server's own sentence when it REFUSED an ask (409 / 422 with a message), else null. */
export function refusalOf(error: unknown): string | null {
  const e = error as { status?: number; message?: unknown; response?: { status?: number; data?: { message?: unknown } } } | null;
  const status = e?.status ?? e?.response?.status;
  if (status !== 409 && status !== 422) return null;
  const message = e?.response?.data?.message ?? e?.message;

  return typeof message === 'string' && message.trim() !== '' && !/^Request failed with status code/i.test(message) ? message.trim() : null;
}

/** The worker runner: the console's runner, plus following a run this tab did not start (a reload mid-run). */
export interface WorkerConsoleRunner extends ConsoleRunner<WorkerRunState> {
  /**
   * Follow a run that is already under way (started before a reload): the console shows it working with its steps
   * so far, `onLanded` runs once it finishes, as for an ask made here. Resolves with its summary, or null.
   */
  resume: (runId: string) => Promise<string | null>;
}

/**
 * The runner. `extras()` is what every ask carries besides its words (the console session, from useConsoleData), read
 * at ask time; `onLanded` runs once with the finished run, so the product lands its result (or reloads what the server
 * saved).
 */
export function useWorkerConsoleRunner<D = unknown>(
  api: WorkerRunApi<D>,
  id: string,
  extras: () => Record<string, unknown>,
  onLanded: (run: WorkerRun<D>) => void,
  { onError, onRefused, onRunChange, pollMs, giveUpMs, sleep }: WorkerRunnerOptions,
): WorkerConsoleRunner {
  const [building, setBuilding] = useState<WorkerRunState | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [planFirst, setPlanFirstState] = useState(false);
  const [brainstorm, setBrainstormState] = useState(false);
  const busy = useRef(false);
  const runId = useRef<string | null>(null);
  const stopping = useRef(false);
  const remembered = useRef(false);

  /** Wait for a run to finish, drawing its steps, then land it. Shared by an ask made here and a resumed one. */
  const follow = useCallback(
    async (followed: string, land = true): Promise<string> => {
      runId.current = followed;
      // Only a Build is remembered across a reload: a plan lands nothing, and the session already holds its answer.
      if (land) onRunChange?.(followed);
      const done = await waitForWorkerRun(
        api,
        followed,
        (progress) =>
          setBuilding((current) => (current ? { ...current, steps: [...(current.steps ?? []), ...(progress.steps ?? [])], thinking: progress.thinking ?? null } : current)),
        { pollMs, giveUpMs, sleep },
      );

      setAnswer(done.summary);
      if (land) onLanded(done);

      return done.summary ?? '';
    },
    [api, giveUpMs, onLanded, onRunChange, pollMs, sleep],
  );

  /** The end of any run this console followed: whatever happened, it is no longer waited on. */
  const settle = useCallback(() => {
    busy.current = false;
    if (runId.current !== null && remembered.current) onRunChange?.(null);
    remembered.current = false;
    runId.current = null;
    setAsking(false);
    setBuilding(null);
  }, [onRunChange]);

  /** Start a run (a Build, or a plan when `kind` is set) and follow it; a refusal is said, anything else reported. */
  const run = useCallback(
    async (text: string, fileIds: string[] | undefined, kind: 'plan' | 'brainstorm' | 'compare' | null, more: Record<string, unknown> = {}): Promise<string | null> => {
      if (busy.current) return null;
      busy.current = true;
      stopping.current = false;
      setAsking(true);
      setBuilding({ startedAt: Date.now(), steps: [], thinking: null });

      try {
        // Files attached in the composer go with the ask as references.
        const payload = { instruction: text, ...extras(), ...more, ...(fileIds && fileIds.length > 0 ? { reference_ids: fileIds } : {}) };
        const started = kind !== null && api.startPlanRun ? await api.startPlanRun(id, { ...payload, kind }) : await api.startRun(id, payload);
        remembered.current = kind === null;

        return await follow(started.run.id, kind === null);
      } catch (error) {
        if (stopping.current) return null;
        // A refused RUN was answered in the session already ("There is no picture in this session..."): reporting it
        // again drew a second, error-styled copy beside the console's own line (Portify 2026-11-26).
        if (error instanceof WorkerRunRefused) return null;
        // A REFUSAL (409 / 422 with the server's own sentence) is the answer to the ask, said in the console: the
        // console only draws answers the server recorded, and a refused ask never is (Portify N1h-3, 2026-11-18).
        // Anything else goes to the product's error surface. The ask's words stay in the box either way.
        const refused = refusalOf(error);
        if (refused !== null) {
          if (onRefused) onRefused(refused);
          else onError(refused);

          return null;
        }
        onError(error);

        return null;
      } finally {
        settle();
      }
    },
    [api, extras, follow, id, onError, onRefused, settle],
  );

  /**
   * An ask: in Plan first or Brainstorm (or asked in one) it runs as a plan, when the product can plan; a Compare (the
   * design against the person's picture, 1.71.0) runs as one too and changes nothing; else a Build.
   */
  const ask = useCallback(
    (text: string, _target?: number[] | null, fileIds?: string[], mode?: ConsoleAskMode): Promise<string | null> => {
      const as = mode ?? (brainstorm ? 'brainstorm' : planFirst ? 'plan' : 'build');
      const kind = (as === 'plan' || as === 'brainstorm' || as === 'compare') && api.startPlanRun ? as : null;
      // A Compare never falls through to a Build: without a plan endpoint it does nothing.
      if (as === 'compare' && kind === null) return Promise.resolve(null);

      return run(text, fileIds, kind);
    },
    [api.startPlanRun, brainstorm, planFirst, run],
  );

  /** **Build this** on a plan in the session: the ask it answered, built with the steps it set out. */
  const buildAgreed = useCallback((instruction: string, steps: string[]) => run(instruction, undefined, null, { plan: steps }), [run]);

  const setPlanFirst = useCallback((on: boolean) => {
    setPlanFirstState(on);
    if (on) setBrainstormState(false);
  }, []);
  const setBrainstorm = useCallback((on: boolean) => {
    setBrainstormState(on);
    if (on) setPlanFirstState(false);
  }, []);

  const resume = useCallback(
    async (existing: string): Promise<string | null> => {
      if (busy.current) return null;
      busy.current = true;
      stopping.current = false;
      remembered.current = true;
      setAsking(true);
      setBuilding({ startedAt: Date.now(), steps: [], thinking: null });

      try {
        return await follow(existing);
      } catch (error) {
        // A run that failed says so in its own words, as an ask made here would; a Stop is not a failure.
        if (!stopping.current) onError(error);

        return null;
      } finally {
        settle();
      }
    },
    [follow, onError, settle],
  );

  const stop = useCallback(() => {
    const current = runId.current;

    if (!current) return;
    stopping.current = true;
    setBuilding((state) => (state ? { ...state, stopping: true } : state));
    // A refused stop reaches the product's error surface through its own client; the run then finishes as it would have.
    api.stopRun(current).catch(noop);
  }, [api]);

  return useMemo<WorkerConsoleRunner>(
    () => ({
      building,
      queued: null,
      asking,
      answer,
      plan: null,
      planFirst,
      brainstorm,
      ask,
      buildPlan: nothing,
      buildAgreed,
      dismissPlan: noop,
      stop,
      setPlanFirst,
      setBrainstorm,
      resume,
    }),
    [answer, ask, asking, brainstorm, buildAgreed, building, planFirst, resume, setBrainstorm, setPlanFirst, stop],
  );
}
