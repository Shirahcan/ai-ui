import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { ConsolePortal } from './ConsolePortal';

/**
 * A row menu drawn on the body, fixed beside its trigger.
 *
 * ⚠ WHY NOT `absolute` INSIDE THE ROW. Every console table sits in an `overflow-x-auto` box so a
 * wide table scrolls by itself; a scroller clips on BOTH axes, so a menu opened on one of the
 * last rows was cut off at the table's bottom edge. On the body, nothing clips it.
 */
export function FloatingMenu({
  anchor,
  open,
  onClose,
  align = 'end',
  className = '',
  children,
}: {
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  align?: 'start' | 'end';
  className?: string;
  children: ReactNode;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchor.current) return;
    const place = () => {
      const r = anchor.current!.getBoundingClientRect();
      const height = menu.current?.offsetHeight ?? 0;
      // Opens upward when there is no room below, so the last row's menu stays on screen.
      const below = r.bottom + 4 + height <= window.innerHeight;
      const top = below ? r.bottom + 4 : Math.max(8, r.top - 4 - height);
      setPos(align === 'end' ? { top, right: window.innerWidth - r.right } : { top, left: r.left });
    };
    place();
    // ⚠ The portal mounts a frame later, so the first measurement sees no menu (height 0) and
    // would always open downward. Measure again once it exists.
    let frame = requestAnimationFrame(function again() {
      if (menu.current) place();
      else frame = requestAnimationFrame(again);
    });
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, anchor, align]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !anchor.current?.contains(t)) onClose();
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open, onClose, anchor]);

  if (!open) return null;
  return (
    <ConsolePortal>
      <div
        ref={menu}
        role="menu"
        style={{ position: 'fixed', top: pos?.top ?? -9999, left: pos?.left, right: pos?.right, visibility: pos ? 'visible' : 'hidden' }}
        className={`z-[90] min-w-[11rem] overflow-hidden rounded-lg border border-[var(--ai-dialog-border,#e2e8f0)] bg-[var(--ai-dialog-bg,#ffffff)] py-1 text-[var(--ai-fg)] shadow-lg ${className}`}
      >
        {children}
      </div>
    </ConsolePortal>
  );
}
