import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AssistantThread } from './components/AssistantHistory';

/** One conversation as the kit's thread routes return it (`ThreadRoutes`, ai-client 1.53). */
export interface AssistantThreadRow {
  id: string;
  title: string | null;
  last_message_at?: string | null;
  created_at?: string | null;
  pinned?: boolean;
  snippet?: string;
  match?: 'title' | 'turn';
}

/** The product's three calls to its own thread routes (GET threads, GET threads/search, PATCH threads/{id}). */
export interface AssistantThreadsApi {
  list: (before: string | null) => Promise<{ items: AssistantThreadRow[]; next_before?: string | null; pinned?: AssistantThreadRow[] }>;
  search: (q: string) => Promise<{ results: AssistantThreadRow[]; capped?: boolean }>;
  update: (id: string, changes: { title?: string; pinned?: boolean }) => Promise<unknown>;
}

export interface AssistantThreadsOptions {
  /** The feature is on for this person (Porter's and Mira's `ai.chat_time_and_threads.enabled`). */
  enabled: boolean;
  /** Fetch now. A product that wants no request until the person has a thread passes false until then. */
  fetchNow?: boolean;
  /** Who is signed in: a change starts the list again, so one account never sees another's threads. */
  accountKey?: string | null;
}

type SearchState = { status: 'idle' | 'loading' | 'ready' | 'failed'; results: AssistantThread[]; capped?: boolean };

const IDLE: SearchState = { status: 'idle', results: [] };

function toThread(row: AssistantThreadRow): AssistantThread {
  return {
    id: row.id,
    title: row.title,
    updatedAt: row.last_message_at ?? row.created_at ?? null,
    pinned: row.pinned,
    // A title match's snippet IS the title, already on the row: show words only when a message matched.
    ...(row.snippet && row.match !== 'title' ? { snippet: row.snippet } : {}),
  };
}

/**
 * The conversation list that scales, for every product (1.40.0, moved out of Portify's `usePorterThreads`;
 * owner 2026-11-07: Mira mirrors Porter 1:1): pages of the person's threads with their pins first, a search
 * over what was said (the latest words win), rename and pin. Returns exactly the `threads` fields
 * `AssistantChat` draws; the product keeps select, delete and "New".
 *
 * Call `reload()` when the product knows the list moved (an answer landed, a thread was deleted).
 */
export function useAssistantThreads(api: AssistantThreadsApi, { enabled, fetchNow = true, accountKey = null }: AssistantThreadsOptions) {
  const apiRef = useRef(api);
  apiRef.current = api;

  const [pages, setPages] = useState<Array<{ items: AssistantThreadRow[]; pinned: AssistantThreadRow[] }>>([]);
  const [next, setNext] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'failed' | 'ready'>('ready');
  const [loadingMore, setLoadingMore] = useState(false);
  const generation = useRef(0);

  const loadFirst = useCallback(() => {
    const mine = ++generation.current;
    setStatus('loading');
    apiRef.current
      .list(null)
      .then((page) => {
        if (mine !== generation.current) return;
        setPages([{ items: page.items, pinned: page.pinned ?? [] }]);
        setNext(page.next_before ?? null);
        setStatus('ready');
      })
      .catch(() => {
        if (mine === generation.current) setStatus('failed');
      });
  }, []);

  useEffect(() => {
    if (!enabled || !fetchNow) return;
    loadFirst();
  }, [enabled, fetchNow, accountKey, loadFirst]);

  const onLoadMore = useCallback(() => {
    if (next === null || loadingMore) return;
    const mine = generation.current;
    setLoadingMore(true);
    apiRef.current
      .list(next)
      .then((page) => {
        if (mine !== generation.current) return;
        setPages((prev) => [...prev, { items: page.items, pinned: [] }]);
        setNext(page.next_before ?? null);
      })
      .catch(() => undefined)
      .finally(() => setLoadingMore(false));
  }, [next, loadingMore]);

  // Pins first (first page only), then every loaded page, each thread once.
  const items = useMemo<AssistantThread[]>(() => {
    const seen = new Set<string>();
    const out: AssistantThread[] = [];
    for (const row of [...(pages[0]?.pinned ?? []), ...pages.flatMap((p) => p.items)]) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      out.push(toThread(row));
    }

    return out;
  }, [pages]);

  // The latest words win: an older search answering late never overwrites a newer one.
  const [search, setSearch] = useState<SearchState>(IDLE);
  const latest = useRef('');
  const onSearch = useCallback((q: string) => {
    latest.current = q;
    if (q === '') {
      setSearch(IDLE);
      return;
    }
    setSearch((prev) => ({ ...prev, status: 'loading' }));
    apiRef.current
      .search(q)
      .then((found) => {
        if (latest.current === q) setSearch({ status: 'ready', results: found.results.map(toThread), capped: found.capped });
      })
      .catch(() => {
        if (latest.current === q) setSearch({ status: 'failed', results: [] });
      });
  }, []);

  const onRename = useCallback((id: string, title: string) => {
    void apiRef.current.update(id, { title }).then(loadFirst).catch(() => undefined);
  }, [loadFirst]);

  const onPin = useCallback((id: string, pinned: boolean) => {
    void apiRef.current.update(id, { pinned }).then(loadFirst).catch(() => undefined);
  }, [loadFirst]);

  return {
    items,
    status,
    reload: loadFirst,
    groupByDay: true as const,
    onSearch,
    search,
    onRename,
    onPin,
    hasMore: next !== null,
    onLoadMore,
    loadingMore,
  };
}
