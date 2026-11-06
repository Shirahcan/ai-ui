import { useEffect, useRef, useState } from 'react';
import { MoreVerticalIcon } from '../icons';

/**
 * A conversation row's actions behind ONE kebab (1.37.0): Rename, Pin or Unpin, then Delete last and
 * in red (the estate's row-action rule). Each item appears only when the product supplies its handler,
 * so a product with no rename route shows no Rename.
 *
 * ⚠ DELETE STILL CONFIRMS. This menu only starts the delete; the row's inline confirmation (with the
 * thread's name in it) is what removes anything.
 */
export interface ThreadRowMenuProps {
  title: string;
  pinned: boolean;
  onRename?: () => void;
  onPin?: (pinned: boolean) => void;
  onDelete?: () => void;
}

const ITEM =
  'block w-full whitespace-nowrap px-3 py-1.5 text-left text-sm outline-none'
  + ' hover:bg-[var(--ai-accent-soft)] focus-visible:bg-[var(--ai-accent-soft)]';

export function ThreadRowMenu({ title, pinned, onRename, onPin, onDelete }: ThreadRowMenuProps) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onDown = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);

    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  if (!onRename && !onPin && !onDelete) return null;

  const pick = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Actions for conversation: ${title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--ai-muted)] outline-none transition-colors hover:bg-[var(--ai-accent-soft)] hover:text-[var(--ai-fg)] focus-visible:bg-[var(--ai-accent-soft)]"
      >
        <MoreVerticalIcon />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 min-w-[9rem] overflow-hidden rounded-xl border border-[var(--ai-border)] bg-[var(--ai-surface)] py-1 text-[var(--ai-fg)] shadow-lg"
          style={{ backgroundColor: 'color-mix(in srgb, Canvas 96%, transparent)' }}
        >
          {onRename ? (
            <button type="button" role="menuitem" className={ITEM} onClick={() => pick(onRename)}>
              Rename
            </button>
          ) : null}
          {onPin ? (
            <button type="button" role="menuitem" className={ITEM} onClick={() => pick(() => onPin(!pinned))}>
              {pinned ? 'Unpin' : 'Pin to top'}
            </button>
          ) : null}
          {onDelete ? (
            <>
              {onRename || onPin ? <div role="separator" className="my-1 h-px bg-[var(--ai-border)]" /> : null}
              <button type="button" role="menuitem" className={`${ITEM} text-red-600`} onClick={() => pick(onDelete)}>
                Delete
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
