import { useEffect, useRef, useState } from 'react';
import { AssistantHistory } from './AssistantHistory';
import type { AssistantChatThreads } from './AssistantChat';
import { ASSISTANT_GEOMETRY } from '../geometry';
import { ChatIcon, SearchIcon, TrashIcon } from '../icons';

/** Words a search needs before it runs, and how long typing must pause first. */
const SEARCH_MIN = 2;
const SEARCH_DEBOUNCE_MS = 300;

/**
 * The conversation list, with the three states a product used to draw itself, and since 1.37.0 a
 * search box, day groups, rename and pin, and "Load older conversations" (owner 2026-11-06). Moved
 * out of `AssistantChat` when it grew; behaviour with none of the 1.37 handlers is unchanged.
 *
 * ⚠ A FAILED LOAD SAYS SO AND OFFERS ANOTHER GO. The alternative - an empty
 * list after a failed request - tells somebody their conversations are gone.
 */
export function ThreadList({
  threads,
  zone,
  onSelect,
}: {
  threads: AssistantChatThreads;
  zone: string;
  onSelect: (id: string) => void;
}) {
  const status = threads.status ?? 'ready';
  const [query, setQuery] = useState('');
  const searching = threads.onSearch !== undefined && query.trim().length >= SEARCH_MIN;
  const onSearch = threads.onSearch;

  /*
   * Debounced: a search decrypts a person's threads on the service, so not one per keystroke.
   * ⚠ ONLY WHEN THE WORDS CHANGE. A product passing an inline `onSearch` gives a new function every
   * render; without the `sent` check each answer would re-send the same search, and an empty one on
   * every open of the menu.
   */
  const sent = useRef('');
  useEffect(() => {
    if (!onSearch) return undefined;
    const words = query.trim().length >= SEARCH_MIN ? query.trim() : '';
    if (words === sent.current) return undefined;
    const t = window.setTimeout(() => {
      sent.current = words;
      onSearch(words);
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(t);
  }, [query, onSearch]);

  if (status === 'loading') {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-[var(--ai-muted)]">
        Loading your conversations...
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className="flex-1 space-y-2 p-4 text-sm text-[var(--ai-muted)]">
        <p>Could not load your conversations.</p>
        {threads.onReload ? (
          <button
            type="button"
            onClick={threads.onReload}
            className={`${ASSISTANT_GEOMETRY.historyConfirmButton} bg-[var(--ai-accent)] text-[var(--ai-accent-fg)]`}
          >
            Try again
          </button>
        ) : null}
      </div>
    );
  }

  const search = threads.search;
  const shown = searching ? (search?.results ?? []) : threads.items;
  const emptyTitle = searching
    ? search?.status === 'loading' ? 'Searching...' : search?.status === 'failed' ? 'Search did not work' : 'Nothing found'
    : threads.emptyTitle ?? 'No conversations yet';
  const emptyBody = searching
    ? search?.status === 'failed' ? 'Try again in a moment.' : search?.status === 'loading' ? '' : 'Try other words, or fewer of them.'
    : threads.emptyBody ?? 'Anything you ask here is kept so you can pick it up again.';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {threads.onSearch ? (
        <div className="shrink-0 px-3 pb-2">
          <label className="flex items-center gap-2 rounded-xl border border-[var(--ai-border)] px-3 py-2 text-[var(--ai-muted)] focus-within:border-[var(--ai-accent)]">
            <SearchIcon />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && query !== '') {
                  event.stopPropagation();
                  setQuery('');
                }
              }}
              placeholder="Search your conversations"
              aria-label="Search your conversations"
              maxLength={100}
              className="min-w-0 flex-1 bg-transparent text-sm text-[var(--ai-fg)] outline-none"
            />
          </label>
          {searching && search?.status === 'ready' && search.capped ? (
            <p className="mt-1 px-1 text-[11px] text-[var(--ai-muted)]">Searched your 200 most recent conversations.</p>
          ) : null}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <AssistantHistory
          threads={shown}
          activeId={threads.activeId}
          onSelect={onSelect}
          onDelete={threads.onDelete}
          deleting={threads.deleting}
          deleteFailed={threads.deleteFailed}
          onRename={threads.onRename}
          onPin={threads.onPin}
          groupZone={threads.groupByDay && !searching ? zone : undefined}
          empty={
            <div className="flex flex-col items-center gap-1 px-6 py-12 text-center">
              <p className="text-sm font-medium text-[var(--ai-muted)]">{emptyTitle}</p>
              {emptyBody ? <p className="text-xs text-[var(--ai-muted)]">{emptyBody}</p> : null}
            </div>
          }
          icon={threads.icon ?? <ChatIcon />}
          deleteIcon={threads.deleteIcon ?? <TrashIcon />}
          className={ASSISTANT_GEOMETRY.historyList}
          rowClassName={`${ASSISTANT_GEOMETRY.historyRow} transition-colors hover:bg-[var(--ai-accent-soft)]`}
          iconClassName={`${ASSISTANT_GEOMETRY.historyIcon} bg-[var(--ai-accent-soft)] text-[var(--ai-accent)]`}
          activeIconClassName={`${ASSISTANT_GEOMETRY.historyIcon} bg-[var(--ai-accent)] text-[var(--ai-accent-fg)]`}
          titleClassName={`${ASSISTANT_GEOMETRY.historyTitle} text-[var(--ai-fg)]`}
          metaClassName={`${ASSISTANT_GEOMETRY.historyMeta} text-[var(--ai-muted)]`}
          currentClassName="font-semibold text-[var(--ai-accent)]"
          deleteClassName="shrink-0 rounded-full p-1.5 text-[var(--ai-muted)] outline-none transition-colors hover:bg-red-50 hover:text-[var(--ai-danger)]"
          confirmRowClassName={`${ASSISTANT_GEOMETRY.historyConfirmRow} bg-red-50 text-[var(--ai-danger)]`}
          confirmClassName={`${ASSISTANT_GEOMETRY.historyConfirmButton} bg-[var(--ai-danger)] text-white disabled:opacity-50`}
          cancelClassName={`${ASSISTANT_GEOMETRY.historyConfirmButton} border border-[var(--ai-border)] text-[var(--ai-muted)] disabled:opacity-50`}
        />

        {!searching && threads.hasMore && threads.onLoadMore ? (
          <div className="px-3 pb-3">
            <button
              type="button"
              onClick={threads.onLoadMore}
              disabled={threads.loadingMore}
              className="w-full whitespace-nowrap rounded-xl border border-[var(--ai-border)] px-3 py-2 text-sm text-[var(--ai-muted)] outline-none transition-colors hover:border-[var(--ai-accent)] hover:text-[var(--ai-accent)] disabled:opacity-50"
            >
              {threads.loadingMore ? 'Loading...' : 'Load older conversations'}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
