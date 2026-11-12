import { useId, useRef, type KeyboardEvent } from 'react';

/** One template the picker offers (the product's own read of its guide's active templates). */
export interface TemplatePickerOption {
  key: string;
  name: string;
  group?: string | null;
  use_when?: string | null;
  example_titles?: string[];
}

interface Props {
  options: TemplatePickerOption[];
  /** The chosen template's key, or null for "Let {assistant} decide". */
  value: string | null;
  onChange: (key: string | null) => void;
  /** "Porter". */
  assistantName: string;
  /** What is being created, as a noun: "post", "page". */
  subjectNoun?: string;
  /** Accessible name of the whole group. */
  label?: string;
}

/**
 * The template picker a product mounts where a page is CREATED (1.56.0, owner 2026-11-12): "What kind of post?"
 * as cards grouped the way the guide groups its templates, with "Let {assistant} decide" first. Pure
 * presentation: the product reads the templates and owns the dialog it sits in.
 *
 * A radio group: one tab stop, arrow keys move between cards, the chosen card is marked for screen readers.
 * Styled with neutral classes and the `--ai-accent` palette (falling back to the platform blue), so it reads the
 * same inside and outside the AI console.
 */
export function TemplatePicker({ options, value, onChange, assistantName, subjectNoun = 'page', label = 'Template' }: Props) {
  const name = useId();
  const list = useRef<HTMLDivElement>(null);
  const all: (TemplatePickerOption | null)[] = [null, ...options];
  const groups: { name: string; items: TemplatePickerOption[] }[] = [];
  for (const option of options) {
    const title = option.group?.trim() || 'Other';
    const group = groups.find((g) => g.name === title);
    if (group) group.items.push(option);
    else groups.push({ name: title, items: [option] });
  }

  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const by = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 0;
    if (by === 0) return;
    event.preventDefault();
    const at = all.findIndex((o) => (o?.key ?? null) === value);
    const next = all[(Math.max(0, at) + by + all.length) % all.length] ?? null;
    onChange(next?.key ?? null);
    requestAnimationFrame(() => list.current?.querySelector<HTMLElement>(`[data-key="${next?.key ?? ''}"]`)?.focus());
  };

  const card = (option: TemplatePickerOption | null) => {
    const key = option?.key ?? null;
    const on = key === value;
    return (
      <button
        key={key ?? ''}
        type="button"
        role="radio"
        aria-checked={on}
        tabIndex={on ? 0 : -1}
        data-key={key ?? ''}
        onClick={() => onChange(key)}
        className={`w-full rounded-2xl border px-4 py-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--ai-accent,#4361EE)] ${
          on ? 'border-[var(--ai-accent,#4361EE)] bg-[var(--ai-accent-soft,#EEF1FD)]' : 'border-slate-200 bg-white/70 hover:border-slate-300'
        }`}
      >
        <span className="block text-sm font-semibold text-slate-900">{option ? option.name : `Let ${assistantName} decide`}</span>
        <span className="mt-0.5 block text-xs text-slate-600">
          {option ? option.use_when : `${assistantName} picks the format that fits your first ask, and keeps it for this ${subjectNoun}.`}
        </span>
        {option?.example_titles?.[0] ? <span className="mt-1 block text-xs italic text-slate-500">“{option.example_titles[0]}”</span> : null}
      </button>
    );
  };

  return (
    <div ref={list} role="radiogroup" aria-label={label} onKeyDown={move} className="space-y-4">
      {card(null)}
      {groups.map((group) => (
        <section key={group.name} aria-labelledby={`${name}-${group.name}`}>
          <h3 id={`${name}-${group.name}`} className="mb-2 text-xs font-semibold text-slate-500">
            {group.name}
          </h3>
          <div className="grid gap-2 sm:grid-cols-2">{group.items.map((option) => card(option))}</div>
        </section>
      ))}
    </div>
  );
}
