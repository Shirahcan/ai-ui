import React, { useEffect, useState } from 'react';

import { LEVEL_LABELS } from './transcript';
import type { TerminalEffort, TerminalLevel, TerminalMode, TerminalSize } from './types';

/**
 * The line under the transcript, Claude Code's status line: while the assistant works, what it is doing
 * and for how long, with how to stop it; at rest, the mode (Build or Plan first) and how to switch.
 * On the right, the element the assistant is aimed at and how full its context is.
 *
 * Only the verb is announced to screen readers when it changes; the ticking seconds are not.
 */
export function TerminalStatus({
  working,
  verb,
  startedAt,
  stopping,
  mode,
  onToggleMode,
  target,
  size,
  onContext,
  tuning = null,
  specialization = null,
}: {
  working: boolean;
  verb: string | null;
  startedAt: number | null;
  stopping?: boolean;
  mode: TerminalMode;
  onToggleMode: () => void;
  target: { label: string; onClear: () => void } | null;
  size: TerminalSize | null;
  onContext: () => void;
  /** The level and effort (1.45.0), when the host offers them: a chip that opens their picker. */
  tuning?: { level: TerminalLevel | null; effort: TerminalEffort | null; onOpen: () => void } | null;
  /** The guide the work follows (1.55.0), when the host offers them: a chip that opens the picker. */
  specialization?: { label: string; title: string; onOpen: () => void } | null;
}): React.JSX.Element {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!working) return;

    const tick = setInterval(() => setNow(Date.now()), 1000);

    return () => clearInterval(tick);
  }, [working]);

  const secs = working && startedAt ? Math.max(0, Math.round((now - startedAt) / 1000)) : 0;
  const meterTone = !size ? 'text-[var(--term-dim)]' : size.percent >= size.compact_at ? 'text-[var(--term-fail)]' : size.percent >= 70 ? 'text-[var(--term-warn)]' : 'text-[var(--term-dim)]';

  return (
    <div className="flex h-8 shrink-0 items-center gap-3 border-t border-[var(--term-border)] bg-[var(--term-bar)] px-3 text-[11px]">
      {working ? (
        <p className="flex min-w-0 flex-1 items-center gap-2">
          <span aria-hidden="true" className="text-[var(--term-accent)] motion-safe:animate-spin" style={{ animationDuration: '2.4s' }}>✻</span>
          <span role="status" aria-live="polite" className="truncate text-[var(--term-text)]">{stopping ? 'Stopping' : (verb ?? 'Working')}…</span>
          <span aria-hidden="true" className="shrink-0 tabular-nums text-[var(--term-dim)]">({secs}s · esc to stop)</span>
        </p>
      ) : (
        <button type="button" onClick={onToggleMode} className="min-w-0 flex-1 truncate text-left text-[var(--term-dim)] outline-none hover:text-[var(--term-text)] focus-visible:text-[var(--term-text)]">
          {mode === 'plan' ? (
            <><span className="text-[var(--term-warn)]">⏸ plan first</span> on (alt+m to switch)</>
          ) : mode === 'brainstorm' ? (
            <><span className="text-[var(--term-ok)]">◇ brainstorm</span> on, nothing is changed (alt+m to switch)</>
          ) : (
            <><span className="text-[var(--term-accent)]">⏵⏵ build</span> (alt+m to plan first)</>
          )}
        </button>
      )}
      {target ? (
        <button type="button" onClick={target.onClear} title="Stop aiming at this element" className="max-w-[10rem] shrink-0 truncate rounded border border-[var(--term-border)] px-1.5 text-[var(--term-accent)] outline-none hover:border-[var(--term-accent)] focus-visible:border-[var(--term-accent)]">
          @{target.label} ×
        </button>
      ) : null}
      {specialization ? (
        <button type="button" onClick={specialization.onOpen} title={specialization.title} className="max-w-[9rem] shrink-0 truncate rounded border border-[var(--term-border)] px-1.5 text-[var(--term-dim)] outline-none hover:text-[var(--term-text)] focus-visible:border-[var(--term-accent)]">
          {specialization.label}
        </button>
      ) : null}
      {tuning ? (
        <button type="button" onClick={tuning.onOpen} title="Level and effort (/level, /effort)" className="shrink-0 rounded border border-[var(--term-border)] px-1.5 text-[var(--term-dim)] outline-none hover:text-[var(--term-text)] focus-visible:border-[var(--term-accent)]">
          {[tuning.level ? LEVEL_LABELS[tuning.level] : null, tuning.effort ? `${tuning.effort} effort` : null].filter(Boolean).join(' · ')}
        </button>
      ) : null}
      <button type="button" onClick={onContext} title="What fills the context (/context)" className={`shrink-0 tabular-nums outline-none hover:underline focus-visible:underline ${meterTone}`}>
        ctx {size ? `${size.percent}%` : '–'}
      </button>
    </div>
  );
}
