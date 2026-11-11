import { useState, type ReactNode } from 'react';
import { ConsoleError, useConsole } from './ConsoleContext';
import { Button, Field, INPUT, Section } from './primitives';
import {
  keyFromName,
  mergeDraft,
  moveSection,
  saveBody,
  type Specialization,
  type SpecializationDraft,
  type SpecializationSection,
  type SpecializationVocabulary,
} from './specializationTypes';

interface Props {
  initial: Specialization;
  isNew: boolean;
  vocabulary: SpecializationVocabulary;
  /** Keys already used, so a new guide's key never collides. */
  taken: string[];
  onCancel: () => void;
  onSaved: (saved: Specialization) => void;
}

function Checks({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      {hint ? <p className="text-xs text-[var(--ai-muted)]">{hint}</p> : null}
      <div className="flex flex-wrap gap-x-5 gap-y-2">{children}</div>
    </fieldset>
  );
}

function Tick({ checked, onChange, children, title }: { checked: boolean; onChange: (on: boolean) => void; children: ReactNode; title?: string }) {
  return (
    <label className="flex items-center gap-2 text-sm" title={title}>
      <input type="checkbox" className="outline-none" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

const toggle = (list: string[], key: string, on: boolean) => (on ? [...new Set([...list, key])] : list.filter((k) => k !== key));

/** One guide, edited in the page (never a tall modal): every field, plus "Describe it to the assistant". */
export function SpecializationEditor({ initial, isNew, vocabulary, taken, onCancel, onSaved }: Props) {
  const { request, reportError } = useConsole();
  const [form, setForm] = useState<Specialization>(initial);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [describe, setDescribe] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [dropped, setDropped] = useState<string[]>([]);

  const set = <K extends keyof Specialization>(key: K, value: Specialization[K]) => setForm((f) => ({ ...f, [key]: value }));
  const setSection = (i: number, patch: Partial<SpecializationSection>) =>
    setForm((f) => ({ ...f, sections: f.sections.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));

  const key = isNew ? keyFromName(form.name) : form.key;
  const keyTaken = isNew && key !== '' && taken.includes(key);
  const canSave = !saving && form.name.trim() !== '' && form.surfaces.length > 0 && key !== '' && !keyTaken;

  const save = async () => {
    setSaving(true);
    setProblem(null);
    try {
      const out = await request<{ specialization: Specialization }>('PUT', `specializations/${key}`, { body: saveBody(form), quiet: true });
      onSaved(out.specialization);
    } catch (e) {
      if (e instanceof ConsoleError && e.status === 422) setProblem(e.message);
      else reportError(e);
      setSaving(false);
    }
  };

  const draft = async () => {
    setDrafting(true);
    setDropped([]);
    try {
      const out = await request<{ draft: Partial<SpecializationDraft>; dropped: string[] }>('POST', 'specializations/draft', {
        body: { description: describe.trim(), ...(isNew ? {} : { current: saveBody(form) }) },
      });
      setForm((f) => mergeDraft(f, out.draft));
      setDropped(out.dropped ?? []);
    } catch {
      // The console's error surface already shows the reason; the form is unchanged.
    } finally {
      setDrafting(false);
    }
  };

  return (
    <Section
      title={isNew ? 'New specialization' : `Edit ${initial.name}`}
      description={isNew ? 'A guide for one kind of output. Describe it to the assistant to start from a draft, or fill it in.' : `Version ${initial.version}. Saving a change to its words makes a new version.`}
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
        <div className="space-y-2 rounded-xl border border-[var(--ai-border)] p-4">
          <Field label="Describe it to the assistant" hint="What is this kind of output for, who reads it, and what must every one have? The assistant fills the form; nothing is saved until you save.">
            {(id) => (
              <textarea id={id} rows={3} className={INPUT} value={describe} maxLength={2000} onChange={(e) => setDescribe(e.target.value)} placeholder="e.g. A case study page telling one client's story, start to finish, for employers." />
            )}
          </Field>
          <div className="flex items-center gap-3">
            <Button disabled={drafting || describe.trim().length < 3} onClick={() => void draft()}>
              {drafting ? 'Drafting…' : isNew ? 'Draft it' : 'Redraft with this'}
            </Button>
            {dropped.length ? <span className="text-xs text-[var(--ai-muted)]">Left out (this product does not offer them): {dropped.join(', ')}</span> : null}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" hint={isNew ? (keyTaken ? `A specialization called "${key}" exists already. Choose another name.` : key ? `Key: ${key}` : 'For example, Blog post.') : `Key: ${form.key}`}>
            {(id) => <input id={id} className={INPUT} value={form.name} maxLength={80} onChange={(e) => set('name', e.target.value)} />}
          </Field>
          <Field label="When to use it" hint="One sentence. The assistant reads it to pick a guide for pages that have none.">
            {(id) => <input id={id} className={INPUT} value={form.use_when} maxLength={300} onChange={(e) => set('use_when', e.target.value)} />}
          </Field>
        </div>

        <Checks label="Used on">
          {vocabulary.surfaces.map((s) => (
            <Tick key={s.key} checked={form.surfaces.includes(s.key)} onChange={(on) => set('surfaces', toggle(form.surfaces, s.key, on))}>
              {s.label}
            </Tick>
          ))}
        </Checks>

        {vocabulary.hosts.length ? (
          <Checks label="The default for" hint="A page of this kind follows this guide unless the person chooses another.">
            {vocabulary.hosts.map((h) => (
              <Tick key={h.key} checked={form.defaults_for.includes(h.key)} onChange={(on) => set('defaults_for', toggle(form.defaults_for, h.key, on))}>
                {h.label}
              </Tick>
            ))}
          </Checks>
        ) : null}

        <Field label="Instructions" hint={`${form.instructions.length} of 6,000 characters. Written to the assistant: audience, purpose, tone, must-haves, what to avoid.`}>
          {(id) => <textarea id={id} rows={8} className={INPUT} value={form.instructions} maxLength={6000} onChange={(e) => set('instructions', e.target.value)} />}
        </Field>

        <div className="space-y-2">
          <div className="text-sm font-medium">Sections, in order</div>
          <p className="text-xs text-[var(--ai-muted)]">Required sections are always written. "Heading words" are how a check finds the section on the page.</p>
          {form.sections.map((s, i) => (
            <div key={i} className="grid gap-2 rounded-xl border border-[var(--ai-border)] p-3 sm:grid-cols-[1fr_1.4fr_1fr_auto]">
              <input aria-label={`Section ${i + 1} name`} className={INPUT} value={s.name} maxLength={80} placeholder="Name" onChange={(e) => setSection(i, { name: e.target.value })} />
              <input aria-label={`Section ${i + 1} purpose`} className={INPUT} value={s.purpose} maxLength={300} placeholder="What it does" onChange={(e) => setSection(i, { purpose: e.target.value })} />
              <input
                aria-label={`Section ${i + 1} heading words`}
                className={INPUT}
                value={s.look_for.join(', ')}
                placeholder="Heading words, comma separated"
                onChange={(e) => setSection(i, { look_for: e.target.value.split(',').map((w) => w.trimStart()).slice(0, 6) })}
              />
              <div className="flex items-center gap-2">
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
          <Button
            disabled={form.sections.length >= 20}
            onClick={() => set('sections', [...form.sections, { key: '', name: '', purpose: '', required: false, look_for: [] }])}
          >
            Add a section
          </Button>
        </div>

        <Checks label="Look up first" hint="What the assistant fetches before it writes.">
          {vocabulary.data.map((d) => (
            <Tick key={d.key} title={d.description ?? undefined} checked={form.data.includes(d.key)} onChange={(on) => set('data', toggle(form.data, d.key, on))}>
              {d.label}
            </Tick>
          ))}
        </Checks>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Checks after writing</legend>
          <p className="text-xs text-[var(--ai-muted)]">A miss gets one fix from the assistant, then a note in the console. It never stops the work.</p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <label className="flex items-center gap-2 text-sm">
              Fewest words
              <input type="number" min={0} max={20000} className={`${INPUT} w-28`} value={form.checks.min_words ?? ''} onChange={(e) => set('checks', { ...form.checks, min_words: e.target.value === '' ? null : Number(e.target.value) })} />
            </label>
            <label className="flex items-center gap-2 text-sm">
              Most words
              <input type="number" min={0} max={20000} className={`${INPUT} w-28`} value={form.checks.max_words ?? ''} onChange={(e) => set('checks', { ...form.checks, max_words: e.target.value === '' ? null : Number(e.target.value) })} />
            </label>
            <Tick checked={form.checks.require_cta} onChange={(on) => set('checks', { ...form.checks, require_cta: on })}>
              Needs a call to action
            </Tick>
            <Tick checked={form.checks.require_sections} onChange={(on) => set('checks', { ...form.checks, require_sections: on })}>
              Every required section is there
            </Tick>
          </div>
        </fieldset>

        {vocabulary.hosts.some((h) => h.fields.length) ? (
          <Checks label="Also draft these fields" hint="After writing, the assistant suggests them for the person to accept. Nothing is saved without them.">
            {vocabulary.hosts.flatMap((h) =>
              h.fields.map((f) => {
                const on = form.host_fields.some((p) => p.host === h.key && p.field === f.key);
                return (
                  <Tick
                    key={`${h.key}.${f.key}`}
                    checked={on}
                    onChange={(next) =>
                      set('host_fields', next ? [...form.host_fields, { host: h.key, field: f.key }] : form.host_fields.filter((p) => !(p.host === h.key && p.field === f.key)))
                    }
                  >
                    {h.label}: {f.label}
                  </Tick>
                );
              }),
            )}
          </Checks>
        ) : null}

        <Checks label="Status">
          <Tick checked={form.status === 'active'} onChange={(on) => set('status', on ? 'active' : 'paused')}>
            Active (a paused guide is never used or offered)
          </Tick>
        </Checks>

        {problem ? <p className="text-sm text-[var(--ai-danger)]">{problem}</p> : null}
      </div>
    </Section>
  );
}
