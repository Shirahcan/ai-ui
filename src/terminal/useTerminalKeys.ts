import { useCallback, useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';

/** Two Escapes within this long are one "Esc Esc". */
const DOUBLE_ESCAPE_MS = 500;

export interface TerminalKeyHandlers {
  /** An ask is running: Esc stops it. */
  working: boolean;
  /** A view (rewind, context, help...) is open over the transcript: Esc closes it. */
  viewOpen: boolean;
  inputEmpty: boolean;
  onStop: () => void;
  onCloseView: () => void;
  /** Esc Esc on an empty input. */
  onRewind: () => void;
  /** Esc Esc with a draft: clear it (the host keeps it in the up-arrow history). */
  onClearDraft: () => void;
  onToggleMode: () => void;
  onToggleDetails: () => void;
  onClearScreen: () => void;
  onHelp: () => void;
  onSearch: () => void;
}

/**
 * The console's keys (design section 6), read on the panel root as they bubble, so the Composer acts
 * first: an open "@" or "/" list keeps its own Escape and arrows, and the history recall keeps Up/Down.
 *
 * ⚠ CTRL+R / CTRL+O / CTRL+L ARE THE BROWSER'S EVERYWHERE ELSE. They are taken only here, while focus
 * is inside the console, so reload, open and the address bar still work on the rest of the page.
 * ⚠ SHIFT+TAB IS NOT TAKEN (Claude Code's mode key): in a browser it is backward keyboard navigation,
 * and taking it traps keyboard users. The mode is Alt+M, Claude Code's own alternative on Windows.
 */
export function useTerminalKeys(handlers: TerminalKeyHandlers) {
  const lastEscape = useRef(0);
  const latest = useRef(handlers);

  useEffect(() => {
    latest.current = handlers;
  });

  return useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    const h = latest.current;
    const key = event.key;
    const plainCtrl = event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey;

    if (key === 'Escape') {
      // The Composer's own lists (and the search row) answered it already.
      if (event.defaultPrevented) return;
      if ((event.currentTarget as HTMLElement).querySelector('[role="listbox"]')) return;

      if (h.viewOpen) {
        event.preventDefault();
        h.onCloseView();

        return;
      }

      if (h.working) {
        event.preventDefault();
        h.onStop();
        lastEscape.current = 0;

        return;
      }

      const now = Date.now();
      const twice = now - lastEscape.current < DOUBLE_ESCAPE_MS;

      lastEscape.current = twice ? 0 : now;

      if (twice) {
        event.preventDefault();
        if (h.inputEmpty) h.onRewind();
        else h.onClearDraft();
      }

      return;
    }

    if (plainCtrl && key.toLowerCase() === 'r') {
      event.preventDefault();
      h.onSearch();
    } else if (plainCtrl && key.toLowerCase() === 'o') {
      event.preventDefault();
      h.onToggleDetails();
    } else if (plainCtrl && key.toLowerCase() === 'l') {
      event.preventDefault();
      h.onClearScreen();
    } else if (event.altKey && !event.ctrlKey && !event.metaKey && (key.toLowerCase() === 'm' || event.code === 'KeyM')) {
      event.preventDefault();
      h.onToggleMode();
    } else if (key === '?' && !event.ctrlKey && !event.altKey && !event.metaKey && h.inputEmpty && (event.target as HTMLElement).tagName === 'TEXTAREA') {
      event.preventDefault();
      h.onHelp();
    }
  }, []);
}
