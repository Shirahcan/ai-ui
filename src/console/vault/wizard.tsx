import { useState, type ReactNode } from 'react';
import { Button } from './ui';
import type { LucideIcon } from './icons';

/**
 * A step-at-a-time flow for the vault's "Add a key" (ported from Portify's wizard shell): one
 * decision per step, a step's own `validate` gates Continue, the last step carries the real
 * verb. Only what the vault's wizard uses is here.
 */

export interface WizardStepDefinition<S> {
  id: string;
  title: string;
  icon?: LucideIcon;
  validate?: (state: S) => string | null;
  render: (ctx: { state: S; patch: (changes: Partial<S>) => void; goTo: (id: string) => void }) => ReactNode;
}

export function WizardShell<S>({
  registry,
  state,
  patch,
  onCancel,
  cancelWarning,
  onSubmit,
  submitting,
  submitLabel,
}: {
  variant?: 'modal' | 'page';
  registry: WizardStepDefinition<S>[];
  state: S;
  patch: (changes: Partial<S>) => void;
  onCancel: () => void;
  cancelWarning?: string;
  onSubmit: () => Promise<boolean> | boolean;
  submitting?: boolean;
  submitLabel: string;
}) {
  const [index, setIndex] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const step = registry[index] as WizardStepDefinition<S>;
  const last = index === registry.length - 1;

  const goTo = (id: string) => {
    const at = registry.findIndex((s) => s.id === id);
    if (at >= 0) {
      setProblem(null);
      setIndex(at);
    }
  };

  const next = async () => {
    const issue = step.validate?.(state) ?? null;
    if (issue) {
      setProblem(issue);
      return;
    }
    setProblem(null);
    if (last) await onSubmit();
    else setIndex((i) => i + 1);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 pb-3">
        <ol className="flex flex-wrap gap-1.5" aria-label="Steps">
          {registry.map((s, i) => (
            <li key={s.id}>
              <span
                aria-current={i === index ? 'step' : undefined}
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs ${
                  i === index ? 'bg-[var(--ai-accent)] text-[var(--ai-accent-fg)]' : i < index ? 'bg-[var(--ai-accent-soft)] text-[var(--ai-fg)]' : 'text-[var(--ai-muted)]'
                }`}
              >
                {i + 1}. {s.title}
              </span>
            </li>
          ))}
        </ol>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <h3 className="mb-3 text-base font-semibold">{step.title}</h3>
        {step.render({ state, patch, goTo })}
        {problem ? (
          <p role="alert" className="mt-3 text-sm text-[var(--ai-danger)]">
            {problem}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[var(--ai-border)] pt-3">
        <span className="text-xs text-[var(--ai-muted)]">{cancelWarning}</span>
        <span className="flex gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          {index > 0 ? (
            <Button variant="outline" onClick={() => { setProblem(null); setIndex((i) => i - 1); }}>
              Back
            </Button>
          ) : null}
          <Button disabled={submitting} onClick={() => void next()}>
            {last ? (submitting ? 'Saving…' : submitLabel) : 'Continue'}
          </Button>
        </span>
      </div>
    </div>
  );
}

export function WizardChoiceGroup<T extends string>({
  ariaLabel,
  value,
  onSelect,
  options,
  columns,
}: {
  ariaLabel: string;
  value: T | null;
  onSelect: (value: T) => void;
  options: Array<{ value: T; label: string; description?: string; icon?: LucideIcon }>;
  columns?: 'one' | 'two' | 'three';
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={`grid gap-2 ${columns === 'two' ? 'sm:grid-cols-2' : columns === 'three' ? 'sm:grid-cols-3' : ''}`}>
      {options.map((o) => {
        const Icon = o.icon;
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onSelect(o.value)}
            className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--ai-accent)] ${
              on ? 'border-[var(--ai-accent)] bg-[var(--ai-accent-soft)]' : 'border-[var(--ai-border)] hover:bg-[var(--ai-accent-soft)]'
            }`}
          >
            {Icon ? <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ai-accent)]" /> : null}
            <span>
              <span className="block text-sm font-medium">{o.label}</span>
              {o.description ? <span className="block text-xs text-[var(--ai-muted)]">{o.description}</span> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function ReviewCollapsible({ title, summary, children }: { title: string; summary?: string; children: ReactNode }) {
  return (
    <details className="rounded-xl border border-[var(--ai-border)] px-3 py-2">
      <summary className="cursor-pointer text-sm">
        <strong>{title}</strong>
        {summary ? <span className="text-[var(--ai-muted)]">: {summary}</span> : null}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}
