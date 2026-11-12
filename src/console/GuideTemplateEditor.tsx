import { useState } from 'react';
import { ConsoleError, useConsole } from './ConsoleContext';
import { Button, Field, INPUT, Section } from './primitives';
import { Checks, Tick } from './SpecializationEditor';
import { keyFromName, moveSection, type Specialization, type SpecializationVocabulary } from './specializationTypes';
import { templateSaveBody, type SpecializationTemplate, type TemplateAsk, type TemplateSection } from './templateTypes';

interface Props {
  guide: Specialization;
  initial: SpecializationTemplate;
  isNew: boolean;
  vocabulary: SpecializationVocabulary;
  /** Keys already used in this guide, so a new template's key never collides. */
  taken: string[];
  onCancel: () => void;
  onSaved: (saved: SpecializationTemplate) => void;
}

const toggle = (list: string[], key: string, on: boolean) => (on ? [...new Set([...list, key])] : list.filter((k) => k !== key));
const number = (v: string) => (v === '' ? undefined : Number(v));

/**
 * One template, edited in the page (1.56.0): a format inside its guide. Every field is optional except the name;
 * what it leaves out is the guide's own (its checks, its data, its field rules).
 */
export function GuideTemplateEditor({ guide, initial, isNew, vocabulary, taken, onCancel, onSaved }: Props) {
  const { request, reportError } = useConsole();
  const [form, setForm] = useState<SpecializationTemplate>(initial);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof SpecializationTemplate>(key: K, value: SpecializationTemplate[K]) => setForm((f) => ({ ...f, [key]: value }));
  const setSection = (i: number, patch: Partial<TemplateSection>) => setForm((f) => ({ ...f, sections: f.sections.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  const setAsk = (i: number, patch: Partial<TemplateAsk>) => setForm((f) => ({ ...f, asks: f.asks.map((a, j) => (j === i ? { ...a, ...patch } : a)) }));

  const key = isNew ? keyFromName(form.name) : form.key;
  const keyTaken = isNew && key !== '' && taken.includes(key);
  const canSave = !saving && form.name.trim() !== '' && key !== '' && !keyTaken;

  // The fields this template may set a rule for: only the ones its guide drafts.
  const fields = guide.host_fields.map((p) => {
    const host = vocabulary.hosts.find((h) => h.key === p.host);
    return { field: p.field, label: host?.fields.find((f) => f.key === p.field)?.label ?? p.field };
  });

  const save = async () => {
    setSaving(true);
    setProblem(null);
    try {
      const out = await request<{ template: SpecializationTemplate }>('PUT', `specializations/${guide.key}/templates/${key}`, { body: templateSaveBody(form), quiet: true });
      onSaved(out.template);
    } catch (e) {
      if (e instanceof ConsoleError && e.status === 422) setProblem(e.message);
      else reportError(e);
      setSaving(false);
    }
  };

  return (
    <Section
      title={isNew ? `New ${guide.name} template` : `Edit ${initial.name}`}
      description={
        isNew
          ? `A format inside ${guide.name}. It keeps the guide's rules and changes only what you set here.`
          : `Version ${initial.version}. Saving a change to its words makes a new version.`
      }
      actions={
        <div className="flex gap-2">
          <Button onClick={onCancel}>Cancel</Button>
          <Button tone="primary" disabled={!canSave} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" hint={isNew ? (keyTaken ? `A template called "${key}" exists already. Choose another name.` : key ? `Key: ${key}` : 'For example, Story.') : `Key: ${form.key}`}>
            {(id) => <input id={id} className={INPUT} value={form.name} maxLength={80} onChange={(e) => set('name', e.target.value)} />}
          </Field>
          <Field label="Group" hint="The heading it sits under in the picker, for example Tell a story.">
            {(id) => <input id={id} className={INPUT} value={form.group} maxLength={40} onChange={(e) => set('group', e.target.value)} />}
          </Field>
        </div>
        <Field label="When to use it" hint="One sentence. The assistant reads it to pick a template when the person has not.">
          {(id) => <input id={id} className={INPUT} value={form.use_when} maxLength={300} onChange={(e) => set('use_when', e.target.value)} />}
        </Field>
        <Field label="Example titles" hint="Up to three, one per line. Shown on the picker card.">
          {(id) => (
            <textarea id={id} rows={3} className={INPUT} value={form.example_titles.join('\n')} onChange={(e) => set('example_titles', e.target.value.split('\n').slice(0, 3))} />
          )}
        </Field>
        <Field label="Instructions" hint={`${form.instructions.length} of 4,000 characters. Added after the guide's own: what makes this format what it is.`}>
          {(id) => <textarea id={id} rows={6} className={INPUT} value={form.instructions} maxLength={4000} onChange={(e) => set('instructions', e.target.value)} />}
        </Field>

        <div className="space-y-2">
          <div className="text-sm font-medium">Sections, in order</div>
          <p className="text-xs text-[var(--ai-muted)]">They replace the guide's sections. "How it looks" is how the section is drawn, for example a numbered timeline.</p>
          {form.sections.map((s, i) => (
            <div key={i} className="space-y-2 rounded-xl border border-[var(--ai-border)] p-3">
              <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
                <input aria-label={`Section ${i + 1} name`} className={INPUT} value={s.name} maxLength={80} placeholder="Name" onChange={(e) => setSection(i, { name: e.target.value })} />
                <input aria-label={`Section ${i + 1} purpose`} className={INPUT} value={s.purpose} maxLength={300} placeholder="What it does" onChange={(e) => setSection(i, { purpose: e.target.value })} />
              </div>
              <input aria-label={`Section ${i + 1} look`} className={INPUT} value={s.look} maxLength={300} placeholder="How it looks" onChange={(e) => setSection(i, { look: e.target.value })} />
              <div className="flex flex-wrap items-center gap-2">
                <input
                  aria-label={`Section ${i + 1} heading words`}
                  className={`${INPUT} min-w-[12rem] flex-1`}
                  value={s.look_for.join(', ')}
                  placeholder="Heading words the check looks for, comma separated"
                  onChange={(e) => setSection(i, { look_for: e.target.value.split(',').map((w) => w.trimStart()).slice(0, 6) })}
                />
                <Tick checked={s.required} onChange={(on) => setSection(i, { required: on })}>
                  Required
                </Tick>
                <Button aria-label={`Move section ${i + 1} up`} disabled={i === 0} onClick={() => set('sections', moveSection(form.sections, i, -1))}>
                  ↑
                </Button>
                <Button aria-label={`Move section ${i + 1} down`} disabled={i === form.sections.length - 1} onClick={() => set('sections', moveSection(form.sections, i, 1))}>
                  ↓
                </Button>
                <Button aria-label={`Remove section ${i + 1}`} onClick={() => set('sections', form.sections.filter((_, j) => j !== i))}>
                  Remove
                </Button>
              </div>
            </div>
          ))}
          <Button disabled={form.sections.length >= 20} onClick={() => set('sections', [...form.sections, { key: '', name: '', purpose: '', required: false, look_for: [], look: '' }])}>
            Add a section
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Layout" hint="The page's overall shape.">
            {(id) => <textarea id={id} rows={2} className={INPUT} value={form.design.layout} maxLength={300} onChange={(e) => set('design', { ...form.design, layout: e.target.value })} />}
          </Field>
          <Field label="Signature" hint="The one element readers remember.">
            {(id) => <textarea id={id} rows={2} className={INPUT} value={form.design.signature} maxLength={300} onChange={(e) => set('design', { ...form.design, signature: e.target.value })} />}
          </Field>
          <Field label="Imagery" hint="Photos, screenshots or none.">
            {(id) => <textarea id={id} rows={2} className={INPUT} value={form.design.imagery} maxLength={300} onChange={(e) => set('design', { ...form.design, imagery: e.target.value })} />}
          </Field>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium">Ask first</div>
          <p className="text-xs text-[var(--ai-muted)]">What the assistant needs before writing. A required one is asked only when the ask, the brief and the record leave it open.</p>
          {form.asks.map((a, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--ai-border)] p-3">
              <input aria-label={`Question ${i + 1}`} className={`${INPUT} min-w-[14rem] flex-[2]`} value={a.question} maxLength={200} placeholder="The question" onChange={(e) => setAsk(i, { question: e.target.value })} />
              <input
                aria-label={`Question ${i + 1} options`}
                className={`${INPUT} min-w-[12rem] flex-1`}
                value={a.options.join(', ')}
                placeholder="Choices, comma separated (optional)"
                onChange={(e) => setAsk(i, { options: e.target.value.split(',').map((o) => o.trimStart()).slice(0, 4) })}
              />
              <Tick checked={a.required} onChange={(on) => setAsk(i, { required: on })}>
                Required
              </Tick>
              <Button aria-label={`Remove question ${i + 1}`} onClick={() => set('asks', form.asks.filter((_, j) => j !== i))}>
                Remove
              </Button>
            </div>
          ))}
          <Button disabled={form.asks.length >= 6} onClick={() => set('asks', [...form.asks, { question: '', required: false, options: [] }])}>
            Add a question
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Starter" hint="Fills the console's empty box on a new page. Use [brackets] for what the person fills in.">
            {(id) => <textarea id={id} rows={3} className={INPUT} value={form.starter} maxLength={1000} onChange={(e) => set('starter', e.target.value)} />}
          </Field>
          <Field label="Reminder after writing" hint="Shown in the console after a Build, never on the page.">
            {(id) => <textarea id={id} rows={3} className={INPUT} value={form.reminder} maxLength={300} onChange={(e) => set('reminder', e.target.value)} />}
          </Field>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Checks after writing</legend>
          <p className="text-xs text-[var(--ai-muted)]">Leave a box empty to keep the guide's own value.</p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <label className="flex items-center gap-2 text-sm">
              Fewest words
              <input type="number" min={0} max={20000} className={`${INPUT} w-28`} value={form.checks.min_words ?? ''} onChange={(e) => set('checks', { ...form.checks, min_words: number(e.target.value) })} />
            </label>
            <label className="flex items-center gap-2 text-sm">
              Most words
              <input type="number" min={0} max={20000} className={`${INPUT} w-28`} value={form.checks.max_words ?? ''} onChange={(e) => set('checks', { ...form.checks, max_words: number(e.target.value) })} />
            </label>
          </div>
        </fieldset>

        {fields.length ? (
          <div className="space-y-2">
            <div className="text-sm font-medium">Field rules</div>
            <p className="text-xs text-[var(--ai-muted)]">How the drafted fields read for this format. Empty keeps the guide's rule.</p>
            {fields.map((f) => (
              <Field key={f.field} label={f.label}>
                {(id) => (
                  <input id={id} className={INPUT} value={form.field_rules[f.field] ?? ''} maxLength={300} onChange={(e) => set('field_rules', { ...form.field_rules, [f.field]: e.target.value })} />
                )}
              </Field>
            ))}
          </div>
        ) : null}

        <Checks label="Look up first" hint="Leave on to look up what the guide looks up.">
          <Tick checked={form.data === null} onChange={(on) => set('data', on ? null : [...guide.data])}>
            The guide's own list
          </Tick>
          {form.data !== null
            ? vocabulary.data.map((d) => (
                <Tick key={d.key} title={d.description ?? undefined} checked={form.data?.includes(d.key) ?? false} onChange={(on) => set('data', toggle(form.data ?? [], d.key, on))}>
                  {d.label}
                </Tick>
              ))
            : null}
        </Checks>

        <Checks label="Status">
          <Tick checked={form.status === 'active'} onChange={(on) => set('status', on ? 'active' : 'paused')}>
            Active (a paused template is never used or offered)
          </Tick>
        </Checks>

        {problem ? <p className="text-sm text-[var(--ai-danger)]">{problem}</p> : null}
      </div>
    </Section>
  );
}
