import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { tableAsTsv, type TerminalTable } from './terminalTables';

/** The console theme's colours, copied onto the viewer: it lives outside the console, which is where they are set. */
const THEME_VARS = ['--term-bg', '--term-bar', '--term-border', '--term-text', '--term-dim', '--term-accent', '--term-on-accent', '--term-fail'] as const;

const LINK = 'whitespace-nowrap text-[11px] text-[var(--term-dim)] underline decoration-dotted underline-offset-2 outline-none hover:text-[var(--term-accent)] focus-visible:text-[var(--term-accent)]';
const BUTTON = 'whitespace-nowrap rounded border border-[var(--term-border)] px-3 py-1 text-[12px] text-[var(--term-text)] outline-none hover:border-[var(--term-accent)] focus-visible:ring-2 focus-visible:ring-[var(--term-accent)]';

/**
 * "Open table" under an answer that holds tables, one link per table. A console is narrow, so a wide grid wraps and
 * loses its columns; the link opens the same rows as a real table, full width, scrolling inside a viewport-bounded
 * panel (header and footer stay reachable on a short screen).
 */
export function TerminalTableLinks({ tables }: { tables: TerminalTable[] }): React.JSX.Element | null {
  const [open, setOpen] = useState<number | null>(null);
  const [theme, setTheme] = useState<Record<string, string>>({});
  const opener = useRef<HTMLButtonElement | null>(null);

  if (tables.length === 0) return null;

  const show = (index: number, button: HTMLButtonElement) => {
    const style = window.getComputedStyle(button);
    const vars: Record<string, string> = { fontFamily: style.fontFamily };
    THEME_VARS.forEach((name) => {
      const value = style.getPropertyValue(name).trim();
      if (value !== '') vars[name] = value;
    });
    opener.current = button;
    setTheme(vars);
    setOpen(index);
  };

  const close = () => {
    setOpen(null);
    opener.current?.focus();
  };

  return (
    <>
      <div className="mt-1 flex flex-wrap gap-x-3">
        {tables.map((table, index) => (
          <button key={index} type="button" className={LINK} onClick={(event) => show(index, event.currentTarget)}>
            {tables.length === 1 ? 'Open table' : `Open table ${index + 1} of ${tables.length}`}
            {table.rows.length > 0 ? ` (${table.rows.length} ${table.rows.length === 1 ? 'row' : 'rows'})` : ''}
          </button>
        ))}
      </div>
      {open !== null && tables[open] ? (
        <TableDialog
          table={tables[open]}
          title={tables.length === 1 ? 'Table' : `Table ${open + 1} of ${tables.length}`}
          theme={theme}
          onClose={close}
        />
      ) : null}
    </>
  );
}

function TableDialog({ table, title, theme, onClose }: { table: TerminalTable; title: string; theme: Record<string, string>; onClose: () => void }): React.JSX.Element | null {
  const closeButton = useRef<HTMLButtonElement | null>(null);
  const [copy, setCopy] = useState<'idle' | 'done' | 'failed'>('idle');

  useEffect(() => {
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);

    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const copyTable = () => {
    navigator.clipboard
      .writeText(tableAsTsv(table))
      .then(() => setCopy('done'))
      .catch(() => setCopy('failed'));
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4"
      style={theme as React.CSSProperties}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-[var(--term-border)] bg-[var(--term-bg)] text-[13px] leading-6 text-[var(--term-text)] shadow-[0_24px_64px_rgba(2,6,23,0.45)]"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--term-border)] bg-[var(--term-bar)] px-4 py-2">
          <p className="font-semibold">
            {title}
            <span className="ml-2 font-normal text-[var(--term-dim)]">
              {table.rows.length} {table.rows.length === 1 ? 'row' : 'rows'}
            </span>
          </p>
          <div className="flex items-center gap-2">
            {copy === 'done' ? <span className="text-[12px] text-[var(--term-dim)]">Copied</span> : null}
            {copy === 'failed' ? <span role="alert" className="text-[12px] text-[var(--term-fail)]">This browser blocked copying</span> : null}
            <button type="button" className={BUTTON} onClick={copyTable}>
              Copy
            </button>
            <button ref={closeButton} type="button" className={BUTTON} onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse text-left">
            <thead className="sticky top-0 bg-[var(--term-bar)]">
              <tr>
                {table.header.map((cell, index) => (
                  <th key={index} scope="col" className="whitespace-nowrap border-b border-[var(--term-border)] px-3 py-2 font-semibold text-[var(--term-text)]">
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, r) => (
                <tr key={r} className="align-top">
                  {table.header.map((_, c) => (
                    <td key={c} className="min-w-[8rem] max-w-[28rem] border-b border-[var(--term-border)] px-3 py-2 break-words">
                      {row[c] ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>,
    document.body,
  );
}
