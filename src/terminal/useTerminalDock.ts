import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';

/** Today's Porter box width (`max-w-2xl`), where the console opens (owner 2026-11-08). */
export const TERMINAL_DEFAULT_WIDTH = 672;

/** The narrowest the input stays usable at. */
export const TERMINAL_MIN_WIDTH = 360;

/** The widest, as a share of the window: the canvas behind it must stay readable. */
export const TERMINAL_MAX_SHARE = 0.5;

const KEY_STEP = 24;

function maxWidth(): number {
  return typeof window === 'undefined' ? 1200 : Math.max(TERMINAL_MIN_WIDTH, Math.floor(window.innerWidth * TERMINAL_MAX_SHARE));
}

export function clampTerminalWidth(width: number, max = maxWidth()): number {
  return Math.round(Math.min(max, Math.max(TERMINAL_MIN_WIDTH, width)));
}

/**
 * The panel's width: dragged by its right edge (pointer, or Left/Right on the focused handle), kept
 * within bounds as the window resizes, and handed to the host to remember. The panel always floats
 * over the canvas (owner D1, revised 2026-11-08), so the width never moves the page behind it.
 */
export function useTerminalDock(initial: number | null | undefined, onWidthChange?: (width: number) => void) {
  // What the person chose, kept apart from what the window allows now: a narrow window shrinks the
  // panel, and widening it again gives their width back (it used to stay shrunk).
  const [preferred, setPreferred] = useState(() => Math.max(TERMINAL_MIN_WIDTH, Math.round(initial ?? TERMINAL_DEFAULT_WIDTH)));
  const [max, setMax] = useState(maxWidth);
  const width = clampTerminalWidth(preferred, max);
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);
  const latest = useRef(width);

  useEffect(() => {
    latest.current = width;
  }, [width]);

  useEffect(() => {
    const fit = () => setMax(maxWidth());

    window.addEventListener('resize', fit);

    return () => window.removeEventListener('resize', fit);
  }, []);

  const setWidth = useCallback((next: number) => setPreferred(clampTerminalWidth(next)), []);

  const commit = useCallback(() => onWidthChange?.(latest.current), [onWidthChange]);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault();
    drag.current = { startX: event.clientX, startWidth: latest.current };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, []);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (!drag.current) return;

    setWidth(clampTerminalWidth(drag.current.startWidth + (event.clientX - drag.current.startX)));
  }, []);

  const onPointerUp = useCallback(() => {
    if (!drag.current) return;

    drag.current = null;
    commit();
  }, [commit]);

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;

      event.preventDefault();
      const next = clampTerminalWidth(latest.current + (event.key === 'ArrowRight' ? KEY_STEP : -KEY_STEP));

      latest.current = next;
      setWidth(next);
      onWidthChange?.(next);
    },
    [onWidthChange],
  );

  return {
    width,
    handle: {
      role: 'separator' as const,
      'aria-orientation': 'vertical' as const,
      'aria-valuemin': TERMINAL_MIN_WIDTH,
      'aria-valuemax': max,
      'aria-valuenow': width,
      tabIndex: 0,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onKeyDown,
    },
  };
}
