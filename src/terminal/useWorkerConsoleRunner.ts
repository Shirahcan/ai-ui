import { useCallback, useMemo, useRef, useState } from 'react';

import type { ConsoleRunner, ConsoleRunState } from './consoleHostPorts';
import type { TerminalStep } from './types';

/**
 * A console whose only mode is Build, on a WORKER (1.63.0, shared Studio P4a2; moved from Portify's
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
}

/** How the console reaches the subject's runs. `getRun`'s cursors are how many elements and steps it has seen. */
export interface WorkerRunApi<D = unknown> {
  startRun: (id: string, payload: { instruction: string } & Record<string, unknown>) => Promise<{ run: WorkerRun<D> }>;
  getRun: (id: string, from?: number, stepsFrom?: number) => Promise<WorkerRun<D>>;
  stopRun: (id: string) => Promise<unknown>;
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
      if (run.status === 'failed') throw new Error(run.summary ?? UNAVAILABLE);

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
  const busy = useRef(false);
  const runId = useRef<string | null>(null);
  const stopping = useRef(false);

  /** Wait for a run to finish, drawing its steps, then land it. Shared by an ask made here and a resumed one. */
  const follow = useCallback(
    async (followed: string): Promise<string> => {
      runId.current = followed;
      onRunChange?.(followed);
      const done = await waitForWorkerRun(
        api,
        followed,
        (progress) =>
          setBuilding((current) => (current ? { ...current, steps: [...(current.steps ?? []), ...(progress.steps ?? [])], thinking: progress.thinking ?? null } : current)),
        { pollMs, giveUpMs, sleep },
      );

      setAnswer(done.summary);
      onLanded(done);

      return done.summary ?? '';
    },
    [api, giveUpMs, onLanded, onRunChange, pollMs, sleep],
  );

  /** The end of any run this console followed: whatever happened, it is no longer waited on. */
  const settle = useCallback(() => {
    busy.current = false;
    if (runId.current !== null) onRunChange?.(null);
    runId.current = null;
    setAsking(false);
    setBuilding(null);
  }, [onRunChange]);

  const ask = useCallback(
    async (text: string, _target?: number[] | null, fileIds?: string[]): Promise<string | null> => {
      if (busy.current) return null;
      busy.current = true;
      stopping.current = false;
      setAsking(true);
      setBuilding({ startedAt: Date.now(), steps: [], thinking: null });

      try {
        // Files attached in the composer go with the ask as references.
        const { run } = await api.startRun(id, { instruction: text, ...extras(), ...(fileIds && fileIds.length > 0 ? { reference_ids: fileIds } : {}) });

        return await follow(run.id);
      } catch (error) {
        if (stopping.current) return null;
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

  const resume = useCallback(
    async (existing: string): Promise<string | null> => {
      if (busy.current) return null;
      busy.current = true;
      stopping.current = false;
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
      planFirst: false,
      brainstorm: false,
      ask,
      buildPlan: nothing,
      buildAgreed: nothing,
      dismissPlan: noop,
      stop,
      setPlanFirst: noop,
      setBrainstorm: noop,
      resume,
    }),
    [answer, ask, asking, building, resume, stop],
  );
}
