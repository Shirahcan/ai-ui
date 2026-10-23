import { useState, type ReactNode } from 'react';
import { aiVar } from '../theme';

/**
 * The threads somebody has already had with an assistant.
 *
 * ⚠ THIS ONE IS A CAPABILITY GAIN, NOT A DE-DUPLICATION, which makes it the odd
 * phase of P18. Only Portify had thread history at all: every other assistant in
 * the estate forgot the conversation the moment its panel closed, and MployNow
 * had even written and shipped the endpoints for it - list, show and delete -
 * with no caller anywhere in the frontend. A capability that exists on the server
 * and cannot be reached from any screen does not exist.
 *
 * ⚠ IT MAKES NO REQUEST, like every other component here. The product fetches,
 * caches, scopes the cache to an account and decides what a failure looks like.
 * What moves here is the part that was worth writing once: the row, the relative
 * time, the marker for the thread you are reading, and the delete confirmation.
 *
 * ⚠ THE CONFIRMATION IS INLINE AND IS NOT `window.confirm`. A native dialog is
 * unstyleable, unmockable in a test and blocks the whole tab; it also cannot say
 * WHICH thread it is about. Two taps on the row, with a cancel that is as easy to
 * hit as the delete, is the pattern Portify already proved.
 *
 * ⚠ AND NO ICON SET LIVES HERE. The three products use three icon libraries, so
 * the glyphs are slots. Omitted, the rows simply have no icons and still work.
 */
export interface AssistantThread {
  id: string;
  title?: string | null;
  /** ISO timestamp of the most recent activity, for the relative label. */
  updatedAt?: string | null;
}

export interface AssistantHistoryProps {
  threads: AssistantThread[];
  /** The thread open in the panel right now, marked rather than hidden. */
  activeId?: string | null;
  onSelect: (id: string) => void;

  /**
   * Omitted entirely means no delete affordance, which is the right default for
   * a product whose endpoint does not support it.
   */
  onDelete?: (id: string) => void;
  /** True while a delete is in flight, so the row can say so and not double-fire. */
  deleting?: boolean;
  /** The last delete failed: the confirm button offers another go. */
  deleteFailed?: boolean;

  /** Rendered in place of the list when there are no threads. */
  empty?: ReactNode;

  /** A thread whose first message never produced a title. */
  untitledLabel?: string;
  /** Appended to the active thread's timestamp. */
  currentLabel?: string;
  confirmPrompt?: string;

  icon?: ReactNode;
  deleteIcon?: ReactNode;

  className?: string;
  rowClassName?: string;
  iconClassName?: string;
  activeIconClassName?: string;
  titleClassName?: string;
  metaClassName?: string;
  currentClassName?: string;
  deleteClassName?: string;
  confirmRowClassName?: string;
  confirmClassName?: string;
  cancelClassName?: string;
}

/**
 * How long ago, in words.
 *
 * ⚠ IT IS DELIBERATELY NOT A LIBRARY CALL. A relative label is the one piece of
 * date formatting an assistant panel needs, and pulling a date library into a
 * shared package to get it would make every consumer carry it. Falls back to an
 * absolute date past a week, where "9d ago" stops being useful.
 */
function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '';

  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';

  const minutes = Math.floor((Date.now() - then) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(then).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function AssistantHistory({
  threads,
  activeId,
  onSelect,
  onDelete,
  deleting = false,
  deleteFailed = false,
  empty,
  untitledLabel = 'Untitled conversation',
  currentLabel = 'Current',
  confirmPrompt = 'Delete this conversation?',
  icon,
  deleteIcon,
  className,
  rowClassName,
  iconClassName,
  activeIconClassName,
  titleClassName,
  metaClassName,
  currentClassName,
  deleteClassName,
  confirmRowClassName,
  confirmClassName,
  cancelClassName,
}: AssistantHistoryProps) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  if (threads.length === 0) return <>{empty ?? null}</>;

  return (
    <ul className={className ?? 'space-y-1 p-2'}>
      {threads.map((thread) => {
        const title = thread.title ?? untitledLabel;
        const isActive = activeId === thread.id;

        if (confirmingId === thread.id && onDelete) {
          return (
            <li key={thread.id}>
              <div
                className={confirmRowClassName ?? 'flex items-center gap-2 px-3 py-2.5'}
                style={
                  confirmRowClassName
                    ? undefined
                    : { border: `1px solid ${aiVar('--ai-border')}` }
                }
              >
                <span className="min-w-0 flex-1 truncate text-sm">{confirmPrompt}</span>
                <button
                  type="button"
                  onClick={() => onDelete(thread.id)}
                  disabled={deleting}
                  className={
                    confirmClassName
                    ?? 'whitespace-nowrap px-3 py-1 text-xs font-semibold outline-none disabled:opacity-50'
                  }
                  style={
                    confirmClassName
                      ? undefined
                      : { background: aiVar('--ai-danger'), color: aiVar('--ai-accent-fg') }
                  }
                >
                  {deleting ? 'Deleting…' : deleteFailed ? 'Try again' : 'Delete'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingId(null)}
                  disabled={deleting}
                  className={
                    cancelClassName
                    ?? 'whitespace-nowrap px-3 py-1 text-xs font-semibold outline-none disabled:opacity-50'
                  }
                >
                  Cancel
                </button>
              </div>
            </li>
          );
        }

        return (
          <li key={thread.id} className="group">
            <div className={rowClassName ?? 'flex items-center gap-2 px-2 py-1.5'}>
              <button
                type="button"
                onClick={() => onSelect(thread.id)}
                className="flex min-w-0 flex-1 items-center gap-2.5 px-1 py-1 text-left outline-none"
              >
                {icon ? (
                  <span
                    className={
                      (isActive ? activeIconClassName : iconClassName)
                      ?? 'flex h-8 w-8 shrink-0 items-center justify-center'
                    }
                    style={
                      iconClassName
                        ? undefined
                        : isActive
                          ? { background: aiVar('--ai-accent'), color: aiVar('--ai-accent-fg') }
                          : { color: aiVar('--ai-accent') }
                    }
                    aria-hidden="true"
                  >
                    {icon}
                  </span>
                ) : null}

                <span className="min-w-0">
                  <span
                    className={titleClassName ?? 'block truncate text-sm font-medium'}
                    style={titleClassName ? undefined : { color: aiVar('--ai-fg') }}
                  >
                    {title}
                  </span>
                  <span
                    className={metaClassName ?? 'block text-xs'}
                    style={metaClassName ? undefined : { color: aiVar('--ai-muted') }}
                  >
                    {relativeTime(thread.updatedAt)}
                    {isActive ? (
                      <span
                        className={currentClassName ?? 'font-semibold'}
                        style={currentClassName ? undefined : { color: aiVar('--ai-accent') }}
                      >
                        {' '}
                        · {currentLabel}
                      </span>
                    ) : null}
                  </span>
                </span>
              </button>

              {onDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmingId(thread.id)}
                  /*
                   * ⚠ THE THREAD'S NAME IS IN THE ACCESSIBLE NAME. A list of
                   * identical "Delete" buttons is unusable with a screen reader,
                   * and this is the one control here that cannot be undone.
                   */
                  aria-label={`Delete conversation: ${title}`}
                  className={deleteClassName ?? 'shrink-0 p-1.5 outline-none'}
                  style={deleteClassName ? undefined : { color: aiVar('--ai-muted') }}
                >
                  {deleteIcon ?? 'Delete'}
                </button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
