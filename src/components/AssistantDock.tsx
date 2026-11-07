import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import type { AssistantTheme } from '../theme';
import { useAssistantShortcut } from '../useAssistantShortcut';
import { AssistantLauncher } from './AssistantLauncher';

/** Which corner the dock sits in: bottom/top, right/left. */
export type AssistantCorner = 'br' | 'bl' | 'tr' | 'tl';

const CORNERS: AssistantCorner[] = ['br', 'bl', 'tr', 'tl'];

/** Pointer travel (px) past which a press is a drag, not a tap. */
const DRAG_THRESHOLD_PX = 6;

const LAUNCHER_CORNER: Record<AssistantCorner, string> = {
  br: 'bottom-5 right-5',
  bl: 'bottom-5 left-5',
  tr: 'top-5 right-5',
  tl: 'top-5 left-5',
};

/*
 * The panel clears the stack. Alone, the launcher is the 1.25rem inset + the 4rem button + a 1.25rem gap =
 * 6.5rem; with one button stacked above it (3rem + a 0.5rem gap) it is 10rem, Porter's offset since the
 * report button moved above the chat button. Static strings, so every product's Tailwind sees them.
 */
const PANEL_CORNER: Record<'single' | 'stacked', Record<AssistantCorner, string>> = {
  single: {
    br: 'bottom-[calc(6.5rem+var(--floating-dock-offset,0px))] right-5',
    bl: 'bottom-[calc(6.5rem+var(--floating-dock-offset,0px))] left-5',
    tr: 'top-28 right-5',
    tl: 'top-28 left-5',
  },
  stacked: {
    br: 'bottom-[calc(10rem+var(--floating-dock-offset,0px))] right-5',
    bl: 'bottom-[calc(10rem+var(--floating-dock-offset,0px))] left-5',
    tr: 'top-40 right-5',
    tl: 'top-40 left-5',
  },
};

export interface AssistantDockProps {
  theme: AssistantTheme;
  open: boolean;
  onToggle: () => void;
  openLabel: string;
  closeLabel: string;
  unread?: boolean;
  unreadLabel?: string;
  /** localStorage prefix: the corner is kept at `<prefix>.corner` (Porter: `portify.assistant`). */
  storagePrefix: string;
  /** Buttons stacked ABOVE the launcher (a report button). The panel then clears the taller stack. */
  stack?: (corner: AssistantCorner) => ReactNode;
  /** The panel, anchored to the dock's corner: pass `className` into its card. */
  renderPanel: (placement: { corner: AssistantCorner; className: string }) => ReactNode;
  /** Ctrl+/ (Cmd+/) toggles, as the launcher does. */
  shortcut?: boolean;
}

function readCorner(key: string): AssistantCorner {
  try {
    const saved = typeof window === 'undefined' ? null : window.localStorage.getItem(key);
    return CORNERS.includes(saved as AssistantCorner) ? (saved as AssistantCorner) : 'br';
  } catch {
    return 'br';
  }
}

/**
 * The assistant's way in for every product (1.39.0, moved out of Portify's AssistantWidget; owner 2026-11-07:
 * Mira mirrors Porter 1:1): the launcher, anything stacked above it, the panel anchored to the same corner,
 * drag-to-a-corner (remembered), Ctrl+/, and the pinned-footer offset. The product keeps only what is its own:
 * which panel to open, and when.
 *
 * ⚠ `pointer-events-none` ON THE WRAPPER IS LOAD-BEARING. The cluster is a rectangle pinned over a corner of
 * every page and its buttons are round; the dead gutter swallowed clicks meant for the page underneath (a
 * kebab menu at the screen edge in Portify). Each child turns hit-testing back on.
 *
 * ⚠ A BAR PINNED TO THE BOTTOM publishes `--floating-dock-offset` (a wizard footer, a message composer); in a
 * bottom corner the cluster rises above it, or the launcher sits on that bar's primary button.
 */
export function AssistantDock({
  theme,
  open,
  onToggle,
  openLabel,
  closeLabel,
  unread,
  unreadLabel,
  storagePrefix,
  stack,
  renderPanel,
  shortcut = false,
}: AssistantDockProps) {
  const cornerKey = `${storagePrefix}.corner`;
  const [corner, setCorner] = useState<AssistantCorner>('br');
  const [dragPos, setDragPos] = useState<{ left: number; top: number } | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; offsetX: number; offsetY: number; moved: boolean } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useAssistantShortcut(onToggle, shortcut);

  // The saved corner lives in the browser, so it is read after mount (the server render cannot know it).
  useEffect(() => {
    const saved = readCorner(cornerKey);
    if (saved !== 'br') setCorner(saved);
  }, [cornerKey]);

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    const rect = (wrapperRef.current ?? e.currentTarget).getBoundingClientRect();
    dragRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top, moved: false };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* Not every environment supports capture; the drag still works while the pointer stays on the button. */
    }
  };

  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const s = dragRef.current;
    if (!s || s.pointerId !== e.pointerId) return;
    if (!s.moved && Math.hypot(e.clientX - s.startX, e.clientY - s.startY) < DRAG_THRESHOLD_PX) return;
    s.moved = true;
    setDragPos({ left: e.clientX - s.offsetX, top: e.clientY - s.offsetY });
  };

  const onPointerUp = (e: PointerEvent<HTMLButtonElement>) => {
    const s = dragRef.current;
    if (!s || s.pointerId !== e.pointerId) return;
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* see above */
    }
    if (!s.moved) return; // A tap: the click that follows toggles the panel.

    // Snap to the corner of the quadrant the pointer was released in, and remember it.
    const next = `${e.clientY < window.innerHeight / 2 ? 't' : 'b'}${e.clientX < window.innerWidth / 2 ? 'l' : 'r'}` as AssistantCorner;
    setCorner(next);
    setDragPos(null);
    try {
      window.localStorage.setItem(cornerKey, next);
    } catch {
      /* A full or blocked storage only forgets the corner. */
    }

    // The browser still fires `click` after a drag: swallow that one so the panel does not toggle on release.
    const swallow = (ev: MouseEvent) => {
      ev.preventDefault();
      ev.stopImmediatePropagation();
    };
    document.addEventListener('click', swallow, { capture: true, once: true });
    window.setTimeout(() => document.removeEventListener('click', swallow, { capture: true }), 0);
  };

  const stacked = stack?.(corner) ?? null;
  const panelClass = PANEL_CORNER[stacked ? 'stacked' : 'single'][corner];
  const wrapperStyle: CSSProperties | undefined = dragPos
    ? { position: 'fixed', left: dragPos.left, top: dragPos.top, zIndex: 50 }
    : corner === 'br' || corner === 'bl'
      ? { bottom: 'calc(1.25rem + var(--floating-dock-offset, 0px))' }
      : undefined;

  return (
    <>
      {renderPanel({ corner, className: panelClass })}
      <div
        ref={wrapperRef}
        data-ai-dock=""
        style={wrapperStyle}
        className={`fixed ${dragPos ? '' : LAUNCHER_CORNER[corner]} z-50 flex flex-col items-center gap-2 touch-none select-none pointer-events-none`}
      >
        {stacked ? <div className="pointer-events-auto">{stacked}</div> : null}
        <div className="pointer-events-auto">
          <AssistantLauncher
            open={open}
            onToggle={onToggle}
            theme={theme}
            openLabel={openLabel}
            closeLabel={closeLabel}
            unread={unread}
            unreadLabel={unreadLabel}
            drag={{ dragging: dragPos !== null, onPointerDown, onPointerMove, onPointerUp }}
          />
        </div>
      </div>
    </>
  );
}
