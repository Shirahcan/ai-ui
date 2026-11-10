import React from 'react';

import type { TerminalTheme } from './terminalThemes';
import { LEVEL_LABELS } from './transcript';
import type { TerminalEffort, TerminalLevel } from './types';
import { TerminalView } from './TerminalViews';
import { TERMINAL_ZOOMS } from './zoom';

/** The recap choices offered; a host's own number (`/recap 45`) is added in its place. */
const RECAP_MINUTES: (number | null)[] = [null, 10, 30, 60, 120];

const EFFORT_LABELS: Record<TerminalEffort, string> = { low: 'Low', medium: 'Medium', high: 'High' };

interface SettingRow {
  key: string;
  label: string;
  value: string;
  note: string;
  /** One step forward (+1) or back (-1) through the setting's values. */
  step: (by: 1 | -1) => void;
}

function cycle<T>(values: T[], current: T, by: 1 | -1): T {
  const at = values.indexOf(current);

  return values[((at < 0 ? 0 : at) + by + values.length) % values.length] ?? current;
}

function recapLabel(minutes: number | null): string {
  return minutes === null ? 'Off' : `After ${minutes} min away`;
}

/**
 * Settings (1.48.0, `/config` as in Claude Code; owner 2026-11-09: "I don't see the recaps or any related
 * settings/config"). Every choice the console keeps, in one list: a row's value changes in place (click,
 * Enter, Space, → forward, ← back; ↑ ↓ move between rows), so the effect is seen at once (the theme
 * repaints the panel). A setting the host does not offer is not listed.
 */
export function SettingsView({
  assistant,
  levels,
  level,
  onLevel,
  efforts,
  effort,
  onEffort,
  recapAfterMinutes,
  onRecap,
  onRecapNow,
  notifyWhenDone,
  onNotify,
  zoom = 1,
  onZoom,
  themes,
  theme,
  onTheme,
  onBack,
}: {
  assistant: string;
  levels: TerminalLevel[];
  level: TerminalLevel;
  onLevel?: (level: TerminalLevel) => void;
  efforts: TerminalEffort[];
  effort: TerminalEffort;
  onEffort?: (effort: TerminalEffort) => void;
  recapAfterMinutes: number | null;
  onRecap?: (minutes: number | null) => void;
  onRecapNow: () => void;
  notifyWhenDone: boolean;
  onNotify?: (on: boolean) => void;
  /** The console's text size (1.54.0): a factor, 1 the usual size. */
  zoom?: number;
  onZoom?: (zoom: number) => void;
  themes: TerminalTheme[];
  theme: string;
  onTheme: (key: string) => void;
  onBack: () => void;
}): React.JSX.Element {
  const recapChoices = RECAP_MINUTES.includes(recapAfterMinutes) ? RECAP_MINUTES : [...RECAP_MINUTES, recapAfterMinutes].sort((a, b) => (a ?? -1) - (b ?? -1));
  const current = themes.find((t) => t.key === theme) ?? themes[0];
  const rows: SettingRow[] = [];

  if (onLevel) {
    rows.push({
      key: 'level',
      label: 'Level',
      value: LEVEL_LABELS[level],
      note: `How capable a model ${assistant} works on. Pro and Expert fall back when unavailable.`,
      step: (by) => onLevel(cycle(levels, level, by)),
    });
  }
  if (onEffort) {
    rows.push({
      key: 'effort',
      label: 'Effort',
      value: EFFORT_LABELS[effort],
      note: `How hard ${assistant} thinks before it answers. Higher is slower.`,
      step: (by) => onEffort(cycle(efforts, effort, by)),
    });
  }
  if (onRecap) {
    rows.push({
      key: 'recap',
      label: 'Recap after a break',
      value: recapLabel(recapAfterMinutes),
      note: 'Where the session stands, shown when you come back after this long away.',
      step: (by) => onRecap(cycle(recapChoices, recapAfterMinutes, by)),
    });
  }
  if (onNotify) {
    rows.push({
      key: 'notify',
      label: 'Mark the tab when done',
      value: notifyWhenDone ? 'On' : 'Off',
      note: `Marks the browser tab's title when ${assistant} finishes while you are on another tab.`,
      step: () => onNotify(!notifyWhenDone),
    });
  }
  if (onZoom) {
    const sizes: number[] = [...TERMINAL_ZOOMS];
    const nearest = sizes.reduce((best, size) => (Math.abs(size - zoom) < Math.abs(best - zoom) ? size : best), 1);

    rows.push({
      key: 'zoom',
      label: 'Text size',
      value: `${Math.round(nearest * 100)}%`,
      note: 'Ctrl + and Ctrl - change it while you are in the console; Ctrl 0 puts it back.',
      step: (by) => onZoom(cycle(sizes, nearest, by)),
    });
  }
  if (current) {
    rows.push({
      key: 'theme',
      label: 'Theme',
      value: current.label,
      note: 'The console repaints as you change it.',
      step: (by) => onTheme(cycle(themes.map((t) => t.key), current.key, by)),
    });
  }

  const keys = (event: React.KeyboardEvent<HTMLButtonElement>, row: SettingRow) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      row.step(event.key === 'ArrowRight' ? 1 : -1);

      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();

    const list = event.currentTarget.closest('ul');
    const buttons = Array.from(list?.querySelectorAll<HTMLButtonElement>('[data-setting]') ?? []);
    const at = buttons.indexOf(event.currentTarget);

    buttons[(at + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
  };

  return (
    <TerminalView title="Settings" onBack={onBack}>
      <p className="mb-3 text-[12px] text-[var(--term-dim)]">Kept in this browser. Click a setting, or press Enter or ← →, to change it.</p>
      <ul className="space-y-1">
        {rows.map((row) => (
          <li key={row.key}>
            <button
              type="button"
              data-setting={row.key}
              aria-label={`${row.label}: ${row.value}. Press to change.`}
              onClick={() => row.step(1)}
              onKeyDown={(event) => keys(event, row)}
              className="group w-full rounded-md border border-transparent px-3 py-2 text-left outline-none hover:bg-[var(--term-selection)] focus-visible:border-[var(--term-accent)]"
            >
              <span className="flex items-baseline gap-3">
                <span className="min-w-0 flex-1 text-[12px] text-[var(--term-text)]">{row.label}</span>
                <span className="shrink-0 whitespace-nowrap text-[12px] font-semibold text-[var(--term-accent)]">‹ {row.value} ›</span>
              </span>
              <span className="mt-0.5 block text-[12px] text-[var(--term-dim)]">{row.note}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-4">
        <button
          type="button"
          onClick={onRecapNow}
          className="whitespace-nowrap rounded border border-[var(--term-border)] px-3 py-1 text-[12px] text-[var(--term-text)] outline-none hover:bg-[var(--term-selection)] focus-visible:ring-2 focus-visible:ring-[var(--term-accent)]"
        >
          Show a recap now (/recap)
        </button>
      </div>
    </TerminalView>
  );
}
