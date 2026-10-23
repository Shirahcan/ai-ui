import type { ReactNode } from 'react';
import type { AssistantCta, AssistantSource, AssistantTable } from './kinds';

/**
 * The structured things an assistant says, drawn once for the whole estate.
 *
 * ⚠ THESE WERE ELEVEN BRANCHES INSIDE ONE PRODUCT'S BUBBLE. ai-service sends
 * the same `kind` and the same `meta` to every product, and only Portify had
 * written renderers for them - so a confirm card, a data table or a research
 * answer sent to MployNow arrived as the bare sentence above it and the
 * structured half was dropped on the floor. Nothing about an action launcher or
 * a table of rows is immigration-shaped; what IS the product's is the handler
 * that runs when the button is pressed.
 *
 * ⚠ EVERY COLOUR HERE IS A CUSTOM PROPERTY, so these inherit the panel's theme
 * with nothing passed down. A product never styles one of these and cannot.
 */

/** The shared card frame: a structured block that is not prose. */
const CARD =
  'mt-2 rounded-2xl border border-[var(--ai-border)] bg-[var(--ai-surface)] p-3.5';
const CARD_TITLE = 'text-sm font-semibold text-[var(--ai-fg)]';
const CARD_BODY = 'mt-1 text-sm leading-relaxed text-[var(--ai-muted)]';
const PRIMARY =
  'whitespace-nowrap rounded-full bg-[var(--ai-accent)] px-4 py-2 text-sm font-semibold'
  + ' text-[var(--ai-accent-fg)] outline-none transition-opacity hover:opacity-90'
  + ' disabled:opacity-50';
const SECONDARY =
  'whitespace-nowrap rounded-full border border-[var(--ai-border)] px-4 py-2 text-sm'
  + ' font-semibold text-[var(--ai-fg)] outline-none transition-colors'
  + ' hover:bg-[var(--ai-accent-soft)] disabled:opacity-50';

/**
 * Calls to action under an answer.
 *
 * ⚠ ONE ROW THAT WRAPS, never a column. Two or three short verbs read as a set
 * of choices side by side; stacked full-width they read as a menu, and the
 * answer above them stops being the point of the message.
 */
export function CtaRow({
  ctas,
  onSelect,
}: {
  ctas: AssistantCta[];
  onSelect: (cta: AssistantCta) => void;
}) {
  if (ctas.length === 0) return null;

  return (
    <div className="mt-2.5 flex flex-wrap gap-2">
      {ctas.map((cta, index) => (
        <button
          key={`${cta.label}-${index}`}
          type="button"
          onClick={() => onSelect(cta)}
          title={cta.description}
          className={index === 0 ? PRIMARY : SECONDARY}
        >
          {cta.label}
        </button>
      ))}
    </div>
  );
}

/** A card whose button opens an action, in a modal or on its own page. */
export function LaunchCard({
  intro,
  label,
  busy,
  done,
  onLaunch,
}: {
  intro?: ReactNode;
  label: string;
  busy?: boolean;
  /** Already run from this message: the button becomes a settled line. */
  done?: boolean;
  onLaunch: () => void;
}) {
  return (
    <div className={CARD}>
      {intro ? <div className={CARD_BODY}>{intro}</div> : null}

      {done ? (
        <p className="mt-2.5 text-sm font-medium text-[var(--ai-muted)]">Done.</p>
      ) : (
        <button type="button" onClick={onLaunch} disabled={busy} className={`mt-2.5 ${PRIMARY}`}>
          {label}
        </button>
      )}
    </div>
  );
}

/** An action's own form, in the shared frame. The fields are the product's. */
export function ModuleCard({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className={CARD}>
      {title ? <p className={CARD_TITLE}>{title}</p> : null}
      <div className={title ? 'mt-2' : undefined}>{children}</div>
    </div>
  );
}

/**
 * Rows the assistant read, as a table.
 *
 * ⚠ IT SCROLLS IN ITSELF, NOT IN THE PANEL. A six-column table inside a 34rem
 * card will overflow; letting the panel scroll sideways takes the composer and
 * every other message with it.
 */
export function DataTable({ table, onOpen }: { table: AssistantTable; onOpen?: () => void }) {
  if (table.rows.length === 0) return null;

  return (
    <div className={CARD}>
      {table.title ? <p className={CARD_TITLE}>{table.title}</p> : null}

      <div className="mt-2 overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-[var(--ai-border)]">
              {table.columns.map((column) => (
                <th
                  key={column.key}
                  className={`px-2 py-1.5 font-semibold text-[var(--ai-muted)] ${
                    column.numeric ? 'text-right' : 'text-left'
                  }`}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, index) => (
              <tr key={index} className="border-b border-[var(--ai-border)] last:border-0">
                {table.columns.map((column) => (
                  <td
                    key={column.key}
                    className={`px-2 py-1.5 text-[var(--ai-fg)] ${
                      column.numeric ? 'text-right tabular-nums' : 'text-left'
                    }`}
                  >
                    {row[column.key] ?? '-'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {table.note ? <p className="mt-2 text-xs text-[var(--ai-muted)]">{table.note}</p> : null}

      {onOpen ? (
        <button type="button" onClick={onOpen} className={`mt-2.5 ${SECONDARY}`}>
          Open the full record
        </button>
      ) : null}
    </div>
  );
}

/**
 * A research answer's sources.
 *
 * ⚠ SOURCES ARE PART OF THE ANSWER, not an appendix. A researched reply that
 * does not show what it read is indistinguishable from one the model composed,
 * which is the same failure the ungrounded caveat exists to prevent.
 */
export function SourceList({
  sources,
  onOpen,
}: {
  sources: AssistantSource[];
  onOpen?: (source: AssistantSource) => void;
}) {
  if (sources.length === 0) return null;

  return (
    <div className="mt-2.5">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--ai-muted)]">
        Sources
      </p>
      <ol className="mt-1 list-decimal space-y-1 pl-5 text-[13px] text-[var(--ai-muted)]">
        {sources.map((source, index) => (
          <li key={`${source.title}-${index}`}>
            {source.url && onOpen ? (
              <button
                type="button"
                onClick={() => onOpen(source)}
                className="text-left underline underline-offset-2 outline-none hover:text-[var(--ai-accent)]"
              >
                {source.title}
              </button>
            ) : (
              source.title
            )}
            {source.publisher ? <span className="opacity-70"> - {source.publisher}</span> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Work the assistant queued, with somewhere to read it when it lands. */
export function PendingWork({
  topic,
  label,
  onOpen,
}: {
  topic?: string;
  label: string;
  onOpen?: () => void;
}) {
  return (
    <div className={CARD}>
      <p className={CARD_TITLE}>{label}</p>
      {topic ? <p className={CARD_BODY}>{topic}</p> : null}
      {onOpen ? (
        <button type="button" onClick={onOpen} className={`mt-2.5 ${SECONDARY}`}>
          Follow along
        </button>
      ) : null}
    </div>
  );
}

/**
 * A request for the reader's permission before anything is read.
 *
 * ⚠ REFUSING IS AS PROMINENT AS AGREEING. A consent card whose decline is a
 * faint link is not consent; both verbs are real buttons, and the card states
 * what will be read before either of them.
 */
export function ConsentCard({
  title,
  detail,
  confirmLabel,
  declineLabel = 'Not now',
  busy,
  settled,
  onConfirm,
  onDecline,
}: {
  title: string;
  detail?: ReactNode;
  confirmLabel: string;
  declineLabel?: string;
  busy?: boolean;
  settled?: 'agreed' | 'declined';
  onConfirm: () => void;
  onDecline: () => void;
}) {
  return (
    <div className={CARD}>
      <p className={CARD_TITLE}>{title}</p>
      {detail ? <div className={CARD_BODY}>{detail}</div> : null}

      {settled ? (
        <p className="mt-2.5 text-sm font-medium text-[var(--ai-muted)]">
          {settled === 'agreed' ? 'Shared.' : 'Not shared.'}
        </p>
      ) : (
        <div className="mt-2.5 flex flex-wrap gap-2">
          <button type="button" onClick={onConfirm} disabled={busy} className={PRIMARY}>
            {confirmLabel}
          </button>
          <button type="button" onClick={onDecline} disabled={busy} className={SECONDARY}>
            {declineLabel}
          </button>
        </div>
      )}
    </div>
  );
}
