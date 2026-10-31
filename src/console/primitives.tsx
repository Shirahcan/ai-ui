import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { ConsoleError } from './ConsoleContext';

/**
 * The console's few building blocks. Colour comes only from the `--ai-*` properties the
 * provider sets, so every product's console wears that product's palette with no class slot.
 */

export function Section({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-[var(--ai-radius)] border border-[var(--ai-border)] bg-[var(--ai-surface)] p-5">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">{title}</h3>
          {description ? <p className="mt-0.5 text-sm text-[var(--ai-muted)]">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-sm text-[var(--ai-muted)]">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-[var(--ai-muted)]">{hint}</div> : null}
    </div>
  );
}

type ButtonTone = 'primary' | 'quiet' | 'danger';

const BUTTON: Record<ButtonTone, string> = {
  primary: 'bg-[var(--ai-accent)] text-[var(--ai-accent-fg)] border-transparent',
  quiet: 'bg-transparent text-[var(--ai-fg)] border-[var(--ai-border)] hover:bg-[var(--ai-accent-soft)]',
  danger: 'bg-[var(--ai-danger)] text-white border-transparent',
};

export function Button({ tone = 'quiet', children, ...rest }: { tone?: ButtonTone } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--ai-accent)] disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON[tone]}`}
    >
      {children}
    </button>
  );
}

export function Pill({ tone = 'muted', children }: { tone?: 'muted' | 'good' | 'bad' | 'accent'; children: ReactNode }) {
  const cls =
    tone === 'good'
      ? 'bg-[#dcfce7] text-[#166534]'
      : tone === 'bad'
        ? 'bg-[#fee2e2] text-[var(--ai-danger)]'
        : tone === 'accent'
          ? 'bg-[var(--ai-accent-soft)] text-[var(--ai-accent)]'
          : 'bg-[var(--ai-accent-soft)] text-[var(--ai-muted)]';
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

/** A table that scrolls sideways inside itself, never the page. */
export function Table({ head, children, empty, wide }: { head: ReactNode[]; children: ReactNode; empty?: ReactNode; wide?: boolean }) {
  // Only a wide table (five or more columns) holds a minimum width; a narrow one fits its card.
  return (
    <div className="overflow-x-auto">
      <table className={`w-full border-collapse text-sm ${wide ? 'min-w-[640px]' : ''}`}>
        <thead>
          <tr className="border-b border-[var(--ai-border)] text-left text-[var(--ai-muted)]">
            {head.map((h, i) => (
              <th key={i} className="whitespace-nowrap px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      {empty}
    </div>
  );
}

export function Td({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <td className={`border-b border-[var(--ai-border)] px-3 py-2 align-top ${className}`}>{children}</td>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-3 py-8 text-center text-sm text-[var(--ai-muted)]">{children}</p>;
}

/** A failed read, said as what happened and what to do; never rendered as an empty or zeroed screen. */
export function LoadError({ error, onRetry }: { error: ConsoleError; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--ai-radius)] border border-[var(--ai-danger)] px-4 py-3 text-sm text-[var(--ai-danger)]">
      <span>{error.message}</span>
      {onRetry ? <Button onClick={onRetry}>Try again</Button> : null}
    </div>
  );
}

export function Loading() {
  return <p className="px-3 py-8 text-center text-sm text-[var(--ai-muted)]">Loading…</p>;
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {children(id)}
      {error ? <p className="text-xs text-[var(--ai-danger)]">{error}</p> : hint ? <p className="text-xs text-[var(--ai-muted)]">{hint}</p> : null}
    </div>
  );
}

export const INPUT =
  'w-full rounded-lg border border-[var(--ai-border)] bg-[var(--ai-surface)] px-3 py-2 text-sm text-[var(--ai-fg)] outline-none focus:border-[var(--ai-accent)]';

/** Row actions behind one trigger (the estate's kebab rule). */
export function Kebab({ label, items }: { label: string; items: Array<{ label: string; onSelect: () => void; danger?: boolean; hidden?: boolean }> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  const shown = items.filter((i) => !i.hidden);
  if (shown.length === 0) return null;
  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="rounded-full p-1.5 text-[var(--ai-muted)] outline-none hover:bg-[var(--ai-accent-soft)] focus-visible:ring-2 focus-visible:ring-[var(--ai-accent)]"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="12" cy="5" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="12" cy="19" r="1.8" />
        </svg>
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 z-20 mt-1 min-w-[10rem] overflow-hidden rounded-lg border border-[var(--ai-border)] bg-[var(--ai-surface)] py-1 shadow-lg">
          {shown.map((item, i) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={`block w-full whitespace-nowrap px-3 py-2 text-left text-sm outline-none hover:bg-[var(--ai-accent-soft)] focus-visible:bg-[var(--ai-accent-soft)] ${item.danger ? 'text-[var(--ai-danger)]' : ''} ${item.danger && i > 0 ? 'border-t border-[var(--ai-border)]' : ''}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * A modal that stays inside the viewport and scrolls its body, so the action buttons are
 * always reachable on a short screen.
 */
export function Dialog({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-[90vh] w-full flex-col overflow-hidden rounded-[var(--ai-radius)] bg-[var(--ai-surface)] text-[var(--ai-fg)] shadow-2xl ${wide ? 'max-w-3xl' : 'max-w-md'}`}
      >
        <div className="shrink-0 border-b border-[var(--ai-border)] px-5 py-4 text-base font-semibold">{title}</div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-[var(--ai-border)] px-5 py-3">{footer}</div>
      </div>
    </div>
  );
}

/** Confirm a consequential action; `reason` asks for the one sentence the audit trail keeps. */
export function Confirm({
  title,
  body,
  verb,
  danger,
  reason,
  onConfirm,
  onClose,
}: {
  title: string;
  body: ReactNode;
  verb: string;
  danger?: boolean;
  reason?: string;
  onConfirm: (reason: string) => Promise<void> | void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const blocked = busy || (reason !== undefined && text.trim() === '');
  return (
    <Dialog
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            tone={danger ? 'danger' : 'primary'}
            disabled={blocked}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm(text.trim());
                onClose();
              } catch {
                setBusy(false);
              }
            }}
          >
            {verb}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <div>{body}</div>
        {reason !== undefined ? (
          <Field label={reason}>
            {(id) => <input id={id} className={INPUT} value={text} onChange={(e) => setText(e.target.value)} maxLength={200} />}
          </Field>
        ) : null}
      </div>
    </Dialog>
  );
}

export function copyText(text: string): Promise<boolean> {
  return navigator.clipboard?.writeText(text).then(
    () => true,
    () => false,
  ) ?? Promise.resolve(false);
}

export function when(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
