/** A specialization: a named guide for one kind of output (1.55.0), in ai-service's wire shape. */
export interface SpecializationSection {
  key: string;
  name: string;
  purpose: string;
  required: boolean;
  look_for: string[];
}

export interface SpecializationChecks {
  min_words: number | null;
  max_words: number | null;
  require_cta: boolean;
  require_sections: boolean;
}

export interface Specialization {
  key: string;
  name: string;
  use_when: string;
  surfaces: string[];
  defaults_for: string[];
  instructions: string;
  sections: SpecializationSection[];
  data: string[];
  checks: SpecializationChecks;
  host_fields: { host: string; field: string }[];
  status: 'active' | 'paused';
  version: number;
  updated_by: string | null;
  updated_at: string | null;
}

/** The words a product's guides may use, published by the product. */
export interface SpecializationVocabulary {
  surfaces: { key: string; label: string }[];
  hosts: { key: string; label: string; fields: { key: string; label: string; max?: number | null }[] }[];
  data: { key: string; label: string; description?: string | null }[];
}

export type SpecializationDraft = Omit<Specialization, 'key' | 'status' | 'version' | 'updated_by' | 'updated_at'>;

export const EMPTY_CHECKS: SpecializationChecks = { min_words: null, max_words: null, require_cta: false, require_sections: false };

/** A blank guide for "New specialization". */
export function blankSpecialization(): Specialization {
  return {
    key: '',
    name: '',
    use_when: '',
    surfaces: [],
    defaults_for: [],
    instructions: '',
    sections: [],
    data: [],
    checks: { ...EMPTY_CHECKS },
    host_fields: [],
    status: 'active',
    version: 0,
    updated_by: null,
    updated_at: null,
  };
}

/** The key a new guide gets from its name: lowercase words joined by "-", starting with a letter. */
export function keyFromName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^[^a-z]+/, '')
    .slice(0, 48);
  return slug.length >= 2 ? slug : '';
}

/** Move one section up (-1) or down (+1); out of range leaves the list as it is. */
export function moveSection<T>(list: T[], index: number, by: -1 | 1): T[] {
  const to = index + by;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return list;
  const next = list.slice();
  const [item] = next.splice(index, 1);
  if (item === undefined) return list;
  next.splice(to, 0, item);
  return next;
}

/** A draft from "Describe it to Porter" laid over the form: the draft's words, the form's key and status. */
export function mergeDraft(form: Specialization, draft: Partial<SpecializationDraft>): Specialization {
  return {
    ...form,
    name: draft.name ?? form.name,
    use_when: draft.use_when ?? form.use_when,
    surfaces: draft.surfaces ?? form.surfaces,
    defaults_for: draft.defaults_for ?? form.defaults_for,
    instructions: draft.instructions ?? form.instructions,
    sections: draft.sections ?? form.sections,
    data: draft.data ?? form.data,
    checks: draft.checks ? { ...EMPTY_CHECKS, ...draft.checks } : form.checks,
    host_fields: draft.host_fields ?? form.host_fields,
  };
}

/** The body a save sends: every guide field, never the server's own (version, updated_at). */
export function saveBody(form: Specialization): Record<string, unknown> {
  return {
    name: form.name.trim(),
    use_when: form.use_when.trim() || null,
    surfaces: form.surfaces,
    defaults_for: form.defaults_for,
    instructions: form.instructions.trim() || null,
    sections: form.sections
      .filter((s) => s.name.trim() !== '')
      .map((s) => ({ name: s.name.trim(), purpose: s.purpose.trim() || null, required: s.required, look_for: s.look_for.filter((w) => w.trim() !== '') })),
    data: form.data,
    checks: form.checks,
    host_fields: form.host_fields,
    status: form.status,
  };
}
