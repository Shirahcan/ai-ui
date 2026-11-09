import { useCallback, useEffect, useRef, useState } from 'react';

import { recapLines } from './transcript';
import type { TerminalTurn } from './types';

export interface TerminalRecap {
  key: string;
  lines: string[];
  /** The session's shape when the recap was made: once the turns move on, it is no longer drawn. */
  at: string;
}

const shapeOf = (turns: TerminalTurn[]) => turns.map((t) => `${t.id}${t.rewound ? '~' : ''}`).join(',');

/**
 * A recap after a break (1.45.0, owner 2026-11-09: "session recap after a set idle duration"): where the
 * session stands, drawn from the turns alone (no AI call), after the person was away for the set minutes.
 *
 * "Away" is measured two ways (1.48.0):
 * - in this visit, from the last moment the person was in the console to their return (the tab shown
 *   again, the window or the console focused);
 * - ⚠ on OPENING a session, from its last turn. The first build measured only the visit, so a page
 *   opened the next day (the usual return) started its clock at the reload and never showed a recap
 *   (owner 2026-11-09: "I don't see the recaps").
 */
export function useTerminalRecap({
  turns,
  words,
  afterMinutes,
  working,
  loading,
  sessionId,
}: {
  turns: TerminalTurn[];
  words: { assistant: string; subject: string };
  afterMinutes: number | null;
  working: boolean;
  loading: boolean;
  sessionId: string | null;
}): {
  /** The recap to draw, or null (none, or the session moved on since). */
  recap: TerminalRecap | null;
  /** `/recap`: now, whatever the time away. */
  show: () => void;
  dismiss: () => void;
  /** The person is here (a click in the console, an ask). */
  touch: () => void;
  /** The person may be back: a recap if they were away long enough. */
  returned: () => void;
} {
  const [recap, setRecap] = useState<TerminalRecap | null>(null);
  const shape = shapeOf(turns);
  const lastHere = useRef(Date.now());
  const latest = useRef({ turns, words, afterMinutes, working });

  useEffect(() => {
    latest.current = { turns, words, afterMinutes, working };
  });

  const make = (all: TerminalTurn[], w: { assistant: string; subject: string }, fallback: string | null) => {
    const text = recapLines(all, w);
    const lines = text.length > 0 ? text : fallback ? [fallback] : [];

    if (lines.length > 0) setRecap({ key: `recap:${Date.now()}`, lines, at: shapeOf(all) });
  };

  const returned = useCallback(() => {
    const { turns: all, words: w, afterMinutes: minutes, working: busy } = latest.current;
    const away = Date.now() - lastHere.current;

    lastHere.current = Date.now();
    if (minutes === null || busy || away < minutes * 60_000) return;
    make(all, w, null);
  }, []);

  // A session opened (the page loaded, /resume): its last turn says how long the person was away.
  const opened = useRef<string | null>(null);

  useEffect(() => {
    if (loading || sessionId === null || opened.current === sessionId) return;
    opened.current = sessionId;

    const { afterMinutes: minutes, working: busy } = latest.current;
    const last = turns.at(-1)?.at ?? null;
    const since = last ? Date.now() - new Date(last).getTime() : Number.NaN;

    if (minutes === null || busy || !Number.isFinite(since) || since < minutes * 60_000) return;
    make(turns, words, null);
  }, [loading, sessionId, turns, words]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') returned();
    };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', returned);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', returned);
    };
  }, [returned]);

  return {
    recap: recap && recap.at === shape ? recap : null,
    show: () => make(turns, words, 'Nothing asked in this session yet.'),
    dismiss: () => setRecap(null),
    touch: () => {
      lastHere.current = Date.now();
    },
    returned,
  };
}
