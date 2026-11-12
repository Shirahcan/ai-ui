import type { SpecializationSection } from './specializationTypes';

/**
 * A template (1.56.0, owner 2026-11-12): a FORMAT inside one guide ("Story" or "How-to guide" under "Blog post"),
 * in ai-service's wire shape. It inherits its guide and changes only what it names.
 */
export interface TemplateSection extends SpecializationSection {
  /** How the section is drawn ("a numbered timeline", "a two-column table"). */
  look: string;
}

export interface TemplateDesign {
  layout: string;
  signature: string;
  imagery: string;
}

/** Only what the template sets; a key left out is the guide's own value. */
export interface TemplateChecks {
  min_words?: number;
  max_words?: number;
  require_cta?: boolean;
  require_sections?: boolean;
}

export interface TemplateAsk {
  question: string;
  required: boolean;
  options: string[];
}

export interface SpecializationTemplate {
  key: string;
  guide: string;
  name: string;
  group: string;
  use_when: string;
  example_titles: string[];
  instructions: string;
  sections: TemplateSection[];
  design: TemplateDesign;
  checks: TemplateChecks;
  /** null = the guide's own data list. */
  data: string[] | null;
  asks: TemplateAsk[];
  starter: string;
  reminder: string;
  field_rules: Record<string, string>;
  position: number;
  status: 'active' | 'paused';
  version: number;
  updated_by: string | null;
  updated_at: string | null;
}

/** A blank template for "New template" under a guide. */
export function blankTemplate(guide: string): SpecializationTemplate {
  return {
    key: '',
    guide,
    name: '',
    group: '',
    use_when: '',
    example_titles: [],
    instructions: '',
    sections: [],
    design: { layout: '', signature: '', imagery: '' },
    checks: {},
    data: null,
    asks: [],
    starter: '',
    reminder: '',
    field_rules: {},
    position: 0,
    status: 'active',
    version: 0,
    updated_by: null,
    updated_at: null,
  };
}

/** A wire template with every list and object present (an older row may leave some out). */
export function normaliseTemplate(t: Partial<SpecializationTemplate> & { key: string; guide: string; name: string }): SpecializationTemplate {
  const blank = blankTemplate(t.guide);
  return {
    ...blank,
    ...t,
    example_titles: t.example_titles ?? [],
    sections: (t.sections ?? []).map((s) => ({ ...s, look: s.look ?? '', look_for: s.look_for ?? [] })),
    design: { ...blank.design, ...(t.design ?? {}) },
    checks: t.checks && !Array.isArray(t.checks) ? t.checks : {},
    asks: (t.asks ?? []).map((a) => ({ question: a.question, required: Boolean(a.required), options: a.options ?? [] })),
    field_rules: t.field_rules && !Array.isArray(t.field_rules) ? t.field_rules : {},
  };
}

/** The list with one template replaced (by key) or added, in the picker's order. */
export function upsertTemplate(list: SpecializationTemplate[], saved: SpecializationTemplate): SpecializationTemplate[] {
  return [...list.filter((t) => t.key !== saved.key), saved].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
}

/** The body a save sends: the template's words, never the server's own (version, updated_at). */
export function templateSaveBody(form: SpecializationTemplate): Record<string, unknown> {
  const checks: TemplateChecks = {};
  if (form.checks.min_words) checks.min_words = form.checks.min_words;
  if (form.checks.max_words) checks.max_words = form.checks.max_words;
  if (typeof form.checks.require_cta === 'boolean') checks.require_cta = form.checks.require_cta;
  if (typeof form.checks.require_sections === 'boolean') checks.require_sections = form.checks.require_sections;
  const rules = Object.fromEntries(Object.entries(form.field_rules).filter(([, rule]) => rule.trim() !== '').map(([field, rule]) => [field, rule.trim()]));

  return {
    name: form.name.trim(),
    group: form.group.trim() || null,
    use_when: form.use_when.trim() || null,
    example_titles: form.example_titles.map((t) => t.trim()).filter((t) => t !== ''),
    instructions: form.instructions.trim() || null,
    sections: form.sections
      .filter((s) => s.name.trim() !== '')
      .map((s) => ({
        name: s.name.trim(),
        purpose: s.purpose.trim() || null,
        required: s.required,
        look: s.look.trim() || null,
        look_for: s.look_for.map((w) => w.trim()).filter((w) => w !== ''),
      })),
    design: { layout: form.design.layout.trim() || null, signature: form.design.signature.trim() || null, imagery: form.design.imagery.trim() || null },
    checks,
    data: form.data,
    asks: form.asks
      .filter((a) => a.question.trim() !== '')
      .map((a) => ({ question: a.question.trim(), required: a.required, options: a.options.map((o) => o.trim()).filter((o) => o !== '') })),
    starter: form.starter.trim() || null,
    reminder: form.reminder.trim() || null,
    field_rules: rules,
    status: form.status,
  };
}
