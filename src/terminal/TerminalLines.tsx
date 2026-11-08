import React from 'react';

import type { TerminalLine } from './types';

/**
 * The transcript, line by line, in the console's marks (design section 3): `❯` an ask, `●` a step,
 * `✻` the assistant's thinking, `⎿` a detail, `◆` the reply, `✓ ○ ✗` the outcome, `▸` a plan, `—` a
 * note. Every colour is a `--term-*` variable, so a theme is values only.
 */

const MARK = 'w-4 shrink-0 select-none text-center';

function seconds(ms: number | null): string | null {
  if (ms === null || ms <= 0) return null;

  return ms < 1000 ? '<1s' : `${Math.round(ms / 1000)}s`;
}

/** Bold runs written as **this** in a reply; nothing else of Markdown is drawn in a terminal. */
function emphasised(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
      <strong key={i} className="font-semibold text-[var(--term-text)]">{part.slice(2, -2)}</strong>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    ),
  );
}

export interface TerminalLinesProps {
  lines: TerminalLine[];
  /** "Rewind to before this" on an outcome: the ask's turn id. */
  onRewind?: (turnId: string) => void;
  onBuildPlan?: () => void;
  onDismissPlan?: () => void;
  /** Words for the plan buttons ("Build this"). */
  buildLabel?: string;
}

export function TerminalLines({ lines, onRewind, onBuildPlan, onDismissPlan, buildLabel = 'Build this' }: TerminalLinesProps): React.JSX.Element {
  return (
    <>
      {lines.map((line, index) => {
        const muted = 'muted' in line && line.muted ? 'opacity-50' : '';

        switch (line.kind) {
          case 'ask':
            return (
              <div key={line.key} className={`${index === 0 ? '' : 'mt-4'} flex gap-2 rounded-md border-l-2 border-[var(--term-accent)] bg-[var(--term-bar)] py-1.5 pl-2 pr-3 ${muted}`}>
                <span aria-hidden="true" className={`${MARK} font-bold text-[var(--term-accent)]`}>❯</span>
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-wrap break-words text-[var(--term-text)]">{line.text}</p>
                  {line.chips.length > 0 || line.muted === 'rewound' ? (
                    <p className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-[var(--term-dim)]">
                      {line.chips.map((chip) => (
                        <span key={chip} className="rounded border border-[var(--term-border)] px-1.5">{chip}</span>
                      ))}
                      {line.muted === 'rewound' ? <span className="rounded border border-[var(--term-border)] px-1.5">rewound</span> : null}
                    </p>
                  ) : null}
                </div>
              </div>
            );

          case 'step': {
            const think = line.stepKind === 'think';

            return (
              <div key={line.key} className={`mt-1 flex gap-2 ${muted}`}>
                <span
                  aria-hidden="true"
                  className={`${MARK} ${think ? 'text-[var(--term-dim)]' : line.live ? 'text-[var(--term-accent)] motion-safe:animate-pulse' : 'text-[var(--term-ok)]'}`}
                >
                  {think ? '✻' : '●'}
                </span>
                <span className={`min-w-0 flex-1 break-words ${think ? 'italic text-[var(--term-dim)]' : 'text-[var(--term-text)]'}`}>
                  {line.text}
                  {line.live ? <span aria-hidden="true" className="ml-1 inline-block h-[1em] w-[0.55em] translate-y-[2px] bg-[var(--term-accent)] motion-safe:animate-pulse" /> : null}
                </span>
                {seconds(line.ms) ? <span className="shrink-0 tabular-nums text-[11px] text-[var(--term-dim)]">{seconds(line.ms)}</span> : null}
              </div>
            );
          }

          case 'detail':
            return line.stepKind === 'think' ? (
              <p key={line.key} className={`ml-6 mt-0.5 whitespace-pre-wrap break-words border-l border-[var(--term-border)] pl-3 italic text-[var(--term-dim)] ${muted}`}>
                {line.text}
              </p>
            ) : (
              <div key={line.key} className={`flex gap-2 text-[var(--term-dim)] ${muted}`}>
                <span aria-hidden="true" className="ml-4 w-4 shrink-0 select-none">⎿</span>
                <span className="min-w-0 flex-1 break-words">{line.text}</span>
              </div>
            );

          case 'reply':
            return (
              <div key={line.key} className={`mt-2 flex gap-2 ${muted}`}>
                <span aria-hidden="true" className={`${MARK} text-[var(--term-accent)]`}>◆</span>
                <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-[var(--term-text)]">{emphasised(line.text)}</p>
              </div>
            );

          case 'outcome': {
            const tone = line.tone === 'ok' ? 'text-[var(--term-ok)]' : line.tone === 'fail' ? 'text-[var(--term-fail)]' : 'text-[var(--term-dim)]';

            return (
              <div key={line.key} className={`mt-1 flex flex-wrap items-baseline gap-x-2 ${muted}`}>
                <span aria-hidden="true" className={`${MARK} ${tone}`}>{line.tone === 'ok' ? '✓' : line.tone === 'fail' ? '✗' : '○'}</span>
                <span className={`min-w-0 flex-1 break-words ${tone}`}>{line.text}</span>
                {line.canRewind && line.turnId && onRewind ? (
                  <button
                    type="button"
                    onClick={() => onRewind(line.turnId as string)}
                    className="whitespace-nowrap text-[11px] text-[var(--term-dim)] underline decoration-dotted underline-offset-2 outline-none hover:text-[var(--term-accent)] focus-visible:text-[var(--term-accent)]"
                  >
                    Rewind to before this
                  </button>
                ) : null}
              </div>
            );
          }

          case 'plan':
            return (
              <div key={line.key} className={`mt-2 rounded-md border border-[var(--term-border)] px-3 py-2 ${muted}`}>
                <p className="flex gap-2">
                  <span aria-hidden="true" className={`${MARK} text-[var(--term-accent)]`}>▸</span>
                  <span className="min-w-0 flex-1 font-semibold text-[var(--term-text)]">{line.summary}</span>
                </p>
                <ol className="ml-6 mt-1 list-decimal space-y-0.5 pl-4 text-[var(--term-dim)]">
                  {line.steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
                {line.open && (onBuildPlan || onDismissPlan) ? (
                  <div className="ml-6 mt-2 flex gap-2">
                    {onBuildPlan ? (
                      <button type="button" onClick={onBuildPlan} className="whitespace-nowrap rounded bg-[var(--term-accent)] px-3 py-1 text-[12px] font-semibold text-[var(--term-on-accent)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--term-text)]">
                        {buildLabel}
                      </button>
                    ) : null}
                    {onDismissPlan ? (
                      <button type="button" onClick={onDismissPlan} className="whitespace-nowrap rounded border border-[var(--term-border)] px-3 py-1 text-[12px] text-[var(--term-dim)] outline-none hover:text-[var(--term-text)] focus-visible:ring-2 focus-visible:ring-[var(--term-accent)]">
                        Dismiss
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );

          case 'system':
            return (
              <p key={line.key} className={`my-2 text-center text-[11px] ${line.tone === 'fail' ? 'text-[var(--term-fail)]' : line.tone === 'ok' ? 'text-[var(--term-ok)]' : 'text-[var(--term-dim)]'}`}>
                — {line.text} —
              </p>
            );

          case 'queued':
            return (
              <div key={line.key} className="mt-2 flex gap-2 italic text-[var(--term-dim)]">
                <span aria-hidden="true" className={MARK}>❯</span>
                <span className="min-w-0 flex-1 break-words">next: {line.text}</span>
              </div>
            );

          default:
            return null;
        }
      })}
    </>
  );
}
