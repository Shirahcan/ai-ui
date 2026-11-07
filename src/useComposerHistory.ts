import { useCallback, useEffect, useRef, useState } from 'react';

export interface ComposerHistoryOptions {
  /**
   * The person's own recent questions from the server, newest first (deduped and capped there), loaded per
   * account so the up-arrow never recalls another account's words. Absent: the ring starts empty and holds
   * this session's questions only.
   */
  load?: () => Promise<string[]>;
  /** Who is signed in. A change reloads the ring and drops the previous account's. */
  accountKey?: string | null;
  /** How many questions the ring keeps. Default 50. */
  limit?: number;
}

export interface ComposerHistory {
  /** Newest first: pass as `AssistantChat`'s `composer.history`. */
  history: string[];
  /** Call when a question is sent: it goes to the top now, before the server has it. */
  remember: (text: string) => void;
  /** Re-read the server's copy (after an answer lands, so the two never disagree for long). */
  reload: () => void;
}

/**
 * The composer's up/down recall ring (moved out of Portify in 1.39.0, owner 2026-11-07: Mira mirrors Porter
 * 1:1). Optimistic on send, reconciled with the server when the product calls `reload`.
 */
export function useComposerHistory({ load, accountKey = null, limit = 50 }: ComposerHistoryOptions = {}): ComposerHistory {
  const [history, setHistory] = useState<string[]>([]);
  const loadRef = useRef(load);
  loadRef.current = load;

  const reload = useCallback(() => {
    const fetchRing = loadRef.current;
    if (!fetchRing) return;
    fetchRing().then((ring) => setHistory(ring.slice(0, limit))).catch(() => {
      /* A failed read keeps what this session already has. */
    });
  }, [limit]);

  // Per account: a switch must never show the previous person's questions, even for a moment.
  useEffect(() => {
    let cancelled = false;
    const fetchRing = loadRef.current;
    if (!fetchRing) return undefined;
    fetchRing()
      .then((ring) => {
        if (!cancelled) setHistory(ring.slice(0, limit));
      })
      .catch(() => {
        if (!cancelled) setHistory([]);
      });

    return () => {
      cancelled = true;
    };
  }, [accountKey, limit]);

  const remember = useCallback((text: string) => {
    const trimmed = text.trim();
    if (trimmed === '') return;
    setHistory((prev) => (prev[0] === trimmed ? prev : [trimmed, ...prev].slice(0, limit)));
  }, [limit]);

  return { history, remember, reload };
}
