'use client';

import React, { useEffect, useState } from 'react';

import { AssistantTerminal, type AssistantTerminalProps } from './AssistantTerminal';
import { useConsolePlacement } from './consolePlacement';
import type { TerminalComposerOptions } from './TerminalInput';

function storedOpen(key: string): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

/**
 * Whether the console is open (shared console C4d, moved from Portify's usePorterConsoleOpen): by itself on a fresh
 * subject (`fresh`: just created), else the person's last choice. Derived, never synced in an effect: once the
 * person opens or closes it, their choice wins. `storageKey` keeps a product's existing key (Portify:
 * `porter-console:open`).
 */
export function useConsoleOpen(fresh: boolean, storageKey = 'ai-console:open'): [boolean, (open: boolean) => void] {
  const [chosen, setChosen] = useState<boolean | null>(null);
  const [remembered] = useState(() => storedOpen(storageKey));
  // Fresh once is fresh for the visit: the flag that said so may be removed from the address right after.
  const [wasFresh, setWasFresh] = useState(fresh);

  if (fresh && !wasFresh) setWasFresh(true);

  // A console that opened by itself and was left open is the person's choice too: a reload brings it back open.
  // Closing it records '0'.
  useEffect(() => {
    if (!fresh || chosen !== null) return;

    try {
      window.localStorage.setItem(storageKey, '1');
    } catch {
      // A browser that refuses storage remembers for this visit only.
    }
  }, [fresh, chosen, storageKey]);

  // Closing moves the focus out first: the console is hidden from assistive technology while closed, and a focused
  // button left inside it makes the browser warn (and a screen reader lose its place). Here, so every way of closing
  // it does: its own close, Ctrl+~, a host's top bar, a "what changed" line.
  const setOpen = (open: boolean) => {
    const active = typeof document === 'undefined' ? null : document.activeElement;

    if (!open && active instanceof HTMLElement && active.closest('[data-ai-terminal]')) active.blur();
    setChosen(open);
    try {
      window.localStorage.setItem(storageKey, open ? '1' : '0');
    } catch {
      // A browser that refuses storage remembers for this visit only.
    }
  };

  return [chosen ?? (wasFresh || fresh || remembered), setOpen];
}

export interface ConsoleHostProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  terminal: Omit<AssistantTerminalProps, 'open' | 'onClose' | 'composer' | 'className'>;
  composer: TerminalComposerOptions;
  /** The assistant's name on the closed tab ("Porter"). */
  assistantName: string;
  /** What the assistant is doing, for the closed tab ("Writing the FAQ"); null when idle. */
  working: string | null;
  /**
   * How far below the top of the scrolling region the console sits, and how much of the viewport it leaves free
   * below the product's top bar. Portify passes the larger pair while its own sticky editor header shows.
   */
  offset?: { top: string; height: string };
}

const DEFAULT_OFFSET = { top: '12px', height: 'h-[calc(100dvh-var(--shell-top-bar-h,0px)-24px)]' };

/**
 * The console on a product's screen (shared console C4d, moved from Portify's PorterConsole): AssistantTerminal
 * floating over the LEFT of the canvas (the canvas keeps its full width), held under the product's top bar as the
 * page scrolls; a tab on the canvas edge while it is closed; Ctrl+~ from anywhere on the page except inside an
 * area that opts out (`[data-ai-shortcut-off]`, a code pane).
 *
 * It sits at the top-left corner of the region that scrolls WHEREVER the host mounts it, and its height ends a margin
 * above the bottom of the viewport (useConsolePlacement); AssistantTerminal scrolls its transcript inside, so the
 * composer stays reachable on a short screen.
 */
export function ConsoleHost({ open, onOpenChange, terminal, composer, assistantName, working, offset = DEFAULT_OFFSET }: ConsoleHostProps): React.JSX.Element {
  const { anchor, frame, box } = useConsolePlacement(open);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Ctrl+~: `~` is Shift+` on most layouts, so the key's own name or the backquote key with Shift.
      if (!event.ctrlKey || event.altKey || event.metaKey || !(event.key === '~' || (event.shiftKey && event.code === 'Backquote'))) return;
      if (event.target instanceof Element && event.target.closest('[data-ai-shortcut-off]')) return;

      event.preventDefault();
      onOpenChange(!open);
    };

    window.addEventListener('keydown', onKey);

    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  return (
    <div ref={anchor} className="pointer-events-none sticky z-30 h-0" style={{ top: offset.top }}>
      <div ref={frame} className="absolute left-0 top-0">
        {!open ? (
          <button
            type="button"
            onClick={() => onOpenChange(true)}
            title={`Open the ${assistantName} console (Ctrl+~)`}
            className="pointer-events-auto absolute left-0 top-16 flex items-center gap-2 whitespace-nowrap rounded-r-xl bg-[#0b1020] px-1.5 py-3 text-[11px] font-semibold text-[#e5e9f2] shadow-lg outline-none [writing-mode:vertical-rl] hover:bg-[#111831] focus-visible:ring-2 focus-visible:ring-[#8b9bff]"
          >
            {working ? <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#8b9bff] motion-safe:animate-pulse" /> : null}
            <span className="font-mono">
              ❯_ {assistantName}
              {working ? `: ${working}` : ' console'}
            </span>
          </button>
        ) : null}
        {/* The height is the host's (the window under the top bar, less a margin), capped where the viewport ends. */}
        <div ref={box} data-console-box="" className={`absolute left-3 top-0 flex flex-col ${offset.height}`}>
          <AssistantTerminal
            {...terminal}
            open={open}
            onClose={() => onOpenChange(false)}
            composer={composer}
            // A flex child, so the box's capped height (not its uncapped one) is what the console fills.
            className="pointer-events-auto min-h-0 flex-1 max-w-[calc(100vw-1.5rem)]"
          />
        </div>
      </div>
    </div>
  );
}
