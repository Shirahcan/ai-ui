'use client';

import { useState } from 'react';

import type { AssistantTerminalProps } from './AssistantTerminal';
import type { TerminalEffort, TerminalLevel, TerminalNote } from './types';
import { TERMINAL_ZOOMS } from './zoom';

const LEVELS: TerminalLevel[] = ['normal', 'pro', 'expert'];
const EFFORTS: TerminalEffort[] = ['low', 'medium', 'high'];

function stored(key: string): string | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // A browser that refuses storage keeps the choice for this visit only.
  }
}

/** How one ask runs at a level and effort, as the request carries it: Normal and Low send nothing (the plain ask). */
export function tuningFor(level: TerminalLevel, effort: TerminalEffort): { level?: 'pro' | 'expert'; effort?: 'medium' | 'high' } {
  return { ...(level !== 'normal' ? { level } : {}), ...(effort !== 'low' ? { effort } : {}) };
}

export interface ConsolePrefsOptions {
  /**
   * The browser keys' prefix. A product that already keeps a person's console settings under its own prefix passes
   * it, so the theme, size and level they chose survive the move (Portify: `porter-console`).
   */
  storagePrefix?: string;
  /** A note in the console, for a typed `/recap 45` (the Settings view already shows its own value). */
  note: (text: string, tone?: TerminalNote['tone']) => void;
}

/**
 * The person's console settings, kept in this browser (shared console C4c1, moved from Portify's usePorterConsole):
 * theme, text size, width, level, effort, the recap's idle minutes and the "done on another tab" mark. Returns the
 * values the host reads at ask time and the terminal props that show and change them.
 */
export function useConsolePrefs({ storagePrefix = 'ai-console', note }: ConsolePrefsOptions) {
  const key = (name: string) => `${storagePrefix}:${name}`;
  const [theme, setTheme] = useState(() => stored(key('theme')) ?? 'dark');
  // Text size: in (Ctrl +) bigger text, out (Ctrl -) smaller text.
  const [zoom, setZoom] = useState(() => {
    const value = Number(stored(key('zoom')));

    return (TERMINAL_ZOOMS as readonly number[]).includes(value) ? value : 1;
  });
  const [width, setWidth] = useState<number | null>(() => Number(stored(key('width'))) || null);
  // How hard the assistant works, kept like the theme.
  const [level, setLevel] = useState<TerminalLevel>(() => {
    const kept = stored(key('level')) ?? '';

    return (LEVELS as string[]).includes(kept) ? (kept as TerminalLevel) : 'normal';
  });
  const [effort, setEffort] = useState<TerminalEffort>(() => {
    const kept = stored(key('effort')) ?? '';

    return (EFFORTS as string[]).includes(kept) ? (kept as TerminalEffort) : 'low';
  });
  // The recap's idle minutes: a number, `off`, or the default (30).
  const [recapMinutes, setRecapMinutes] = useState<number | null>(() => {
    const kept = stored(key('recap'));

    if (kept === 'off') return null;

    return Number(kept) > 0 ? Number(kept) : 30;
  });
  // Mark the tab's title when an ask finishes on another tab.
  const [notifyWhenDone, setNotifyWhenDone] = useState(() => stored(key('notify')) !== 'off');

  const props = {
    level,
    onLevelChange: (next) => {
      setLevel(next);
      store(key('level'), next);
    },
    effort,
    onEffortChange: (next) => {
      setEffort(next);
      store(key('effort'), next);
    },
    recapAfterMinutes: recapMinutes,
    onRecapChange: (minutes, from) => {
      setRecapMinutes(minutes);
      store(key('recap'), minutes === null ? 'off' : String(minutes));
      // A typed `/recap 45` gets a line saying what changed; the Settings view already shows its value.
      if (from !== 'settings') note(minutes === null ? 'Recap off.' : `A recap shows when you come back after ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} away.`, 'ok');
    },
    notifyWhenDone,
    onNotifyWhenDoneChange: (on) => {
      setNotifyWhenDone(on);
      store(key('notify'), on ? 'on' : 'off');
    },
    zoom,
    onZoomChange: (next) => {
      setZoom(next);
      store(key('zoom'), String(next));
    },
    theme,
    onThemeChange: (next) => {
      setTheme(next);
      store(key('theme'), next);
    },
    width,
    onWidthChange: (next) => {
      setWidth(next);
      store(key('width'), String(next));
    },
  } satisfies Partial<AssistantTerminalProps>;

  return { level, effort, props };
}
