'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { TerminalSavedCommand } from './commands';
import type { ConsoleApi } from './consoleApi';
import type { TerminalConsoleData, TerminalNote, TerminalSessionRow } from './types';

/**
 * What every ask from the console carries to the product's run endpoint: its session, and for the transcript the
 * element it is aimed at and its files' names, the person's zone, their answers to the assistant's questions, and
 * the level and effort (defaults are not sent).
 */
export interface ConsoleAskExtras {
  session_id?: string;
  console_target?: string | null;
  console_files?: string[];
  client_timezone?: string | null;
  answers?: { question: string; answer: string }[];
  level?: 'pro' | 'expert';
  effort?: 'medium' | 'high';
}

export interface ConsoleAskMeta {
  target: string | null;
  files: string[];
  answers?: { question: string; answer: string }[];
}

function browserTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/**
 * The console's session for one subject (shared console C4b, moved from Portify's usePorterConsoleData): what the
 * kit's `TerminalRoutes` hold in ai-service, loaded when the console opens and re-read after each ask (the WORKER
 * records the answer, so the browser never writes the history itself).
 *
 * A failed read or save becomes a NOTE in the console, in words a person can act on; the product's fetcher has
 * already surfaced the HTTP reason in its own error surface, so nothing here reports twice.
 *
 * `extras()` is what every ask carries. It is read at ask time, so it is always the current session.
 */
export function useConsoleData<K extends string>(api: Pick<ConsoleApi<K>, 'open' | 'start' | 'openSession' | 'sessions' | 'commands' | 'saveCommands'>, kind: K, id: string, enabled: boolean) {
  const [data, setData] = useState<TerminalConsoleData | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [notes, setNotes] = useState<TerminalNote[]>([]);
  const [sessions, setSessions] = useState<TerminalSessionRow[] | null>(null);
  // The person's own commands (saved asks): theirs on every subject.
  const [commands, setCommands] = useState<TerminalSavedCommand[]>([]);
  const sessionRef = useRef<string | null>(null);
  const askMeta = useRef<ConsoleAskMeta>({ target: null, files: [] });
  /** The console's level and effort, read at ask time; defaults are not sent. */
  const tuning = useRef<{ level?: 'pro' | 'expert'; effort?: 'medium' | 'high' }>({});
  /** The newest turn on screen: a note sits after it, where it happened. */
  const lastTurn = useRef<string | null>(null);

  const note = useCallback((text: string, tone: TerminalNote['tone'] = 'system') => {
    const after = lastTurn.current;

    setNotes((current) => [...current, { key: `${Date.now()}-${current.length}`, text, tone, after }]);
  }, []);

  const accept = useCallback((next: TerminalConsoleData) => {
    sessionRef.current = next.session?.id ?? null;
    lastTurn.current = next.turns.at(-1)?.id ?? null;
    setData(next);
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;

    // Loading the session is a sync with ai-service; state is set when it answers, never in the effect body.
    let live = true;

    api
      .open(kind, id)
      .then((next) => {
        if (live) accept(next);
      })
      .catch(() => {
        // The product's fetcher already said why; the console still builds, without its history.
        if (live) note('The console history could not be read just now. Asks still work; this session is not being kept.', 'fail');
      })
      .finally(() => {
        if (live) setLoading(false);
      });

    // Read beside the session; a console without them still works.
    api
      .commands(kind, id)
      .then((saved) => {
        if (live) setCommands(saved);
      })
      .catch(() => undefined);

    return () => {
      live = false;
    };
  }, [accept, api, enabled, id, kind, note]);

  /** Keep the person's commands: shown at once, put back if the service refuses. */
  const saveCommands = useCallback(
    async (next: TerminalSavedCommand[]) => {
      const before = commands;

      setCommands(next);

      try {
        setCommands(await api.saveCommands(kind, id, next));
      } catch {
        setCommands(before);
        note('Your commands could not be saved just now. They are as they were.', 'fail');
      }
    },
    [api, commands, id, kind, note],
  );

  /** The current session, started now (titled by the first ask) when there is none yet. */
  const ensureSession = useCallback(
    async (title: string): Promise<string | null> => {
      if (sessionRef.current) return sessionRef.current;

      try {
        const started = await api.start(kind, id, title.slice(0, 120));

        accept(started);

        return started.session?.id ?? null;
      } catch {
        note('A session could not be started, so this ask is not being kept in the history.', 'fail');

        return null;
      }
    },
    [accept, api, id, kind, note],
  );

  /** Re-read the open session (after an ask lands, a rewind, a summary). */
  const refresh = useCallback(async () => {
    try {
      accept(sessionRef.current ? await api.openSession(kind, id, sessionRef.current) : await api.open(kind, id));
    } catch {
      // The product's fetcher said why; the transcript keeps what it had.
    }
  }, [accept, api, id, kind]);

  const extras = useCallback(
    (): ConsoleAskExtras =>
      sessionRef.current
        ? {
            session_id: sessionRef.current,
            console_target: askMeta.current.target,
            console_files: askMeta.current.files,
            // As the chat panel sends it: a question the console answers counts "this week" in their zone.
            client_timezone: browserTimezone(),
            ...(askMeta.current.answers?.length ? { answers: askMeta.current.answers } : {}),
            ...tuning.current,
          }
        : {},
    [],
  );

  const loadSessions = useCallback(async () => {
    setSessions(null);
    try {
      setSessions(await api.sessions(kind, id));
    } catch {
      setSessions([]);
    }
  }, [api, id, kind]);

  return {
    data,
    loading,
    notes,
    note,
    clearNotes: () => setNotes([]),
    accept,
    ensureSession,
    refresh,
    extras,
    /** What the next ask is aimed at and carries, for the transcript (set just before it is sent). */
    setAskMeta: (meta: ConsoleAskMeta) => {
      askMeta.current = meta;
    },
    /** The level and effort the next asks run at (Normal and Low send nothing). */
    setTuning: (next: { level?: 'pro' | 'expert'; effort?: 'medium' | 'high' }) => {
      tuning.current = next;
    },
    sessionId: () => sessionRef.current,
    commands,
    saveCommands,
    sessions,
    loadSessions,
  };
}

export type ConsoleData = ReturnType<typeof useConsoleData>;
