import type { TerminalSavedCommand } from './commands';
import type {
  TerminalBrief,
  TerminalConsoleData,
  TerminalSessionRow,
  TerminalSpecialization,
  TerminalSpecializationOption,
  TerminalTemplate,
  TerminalTemplateOption,
  TerminalUsage,
} from './types';

/**
 * The console's HTTP client, for any product (shared console C4a, 2026-11-13). The routes are the kit's
 * `TerminalRoutes` (shirahcan/ai-client), mounted wherever the product chose: the product hands in where they
 * live (`base`) and how it talks to its API (`fetcher`), so nothing here names a product path.
 *
 * The fetcher returns the response's payload already unwrapped from the product's envelope (Portify's helpers
 * unwrap BaseController's `data`), and honours `quietStatuses`: those statuses reject as usual but the product
 * does not surface them as an error (a vanished session or a throttle on a background read nobody asked for).
 */
export interface ConsoleFetchOptions {
  quietStatuses?: number[];
}

export interface ConsoleFetcher {
  get<T>(url: string, options?: ConsoleFetchOptions): Promise<T>;
  post<T>(url: string, body?: unknown, options?: ConsoleFetchOptions): Promise<T>;
  put<T>(url: string, body?: unknown, options?: ConsoleFetchOptions): Promise<T>;
}

export interface ConsoleApiOptions<K extends string = string> {
  /** Where one subject's console routes live, e.g. `/v1/admin/website/console/site_page/{id}`. */
  base: (kind: K, id: string) => string;
  /** Where a rewind point is read: checkpoints belong to the subject, not to the console's routes. */
  checkpointUrl: (kind: K, id: string, checkpoint: string) => string;
  fetcher: ConsoleFetcher;
}

/** A rewind point: whatever the product's subject stores as its design (a page's nodes, a component's body). */
export interface ConsoleCheckpoint<D = unknown> {
  id: string;
  design: D;
  created_at: string | null;
}

/**
 * Specializations (guides): which guide applies now and why, the guides on offer, and the person's own choice
 * (a key or 'none'; null means "let the page or the assistant decide").
 */
export interface ConsoleSpecializations {
  specialization: TerminalSpecialization | null;
  specializations: TerminalSpecializationOption[];
  specialization_choice?: { key: string; by: string | null; at: string | null } | null;
}

/** The template the subject follows inside its guide: what applies now, the guide's templates, the stored choice. */
export interface ConsoleTemplates {
  template: TerminalTemplate | null;
  templates: TerminalTemplateOption[];
  template_choice?: { guide: string; key: string; by: string | null; at: string | null; source: string } | null;
}

type TemplateFields = Partial<{ template: TerminalTemplate | null; templates: TerminalTemplateOption[]; template_choice: ConsoleTemplates['template_choice'] }>;

/** The template fields a console answer may carry (a guide change brings its own templates). */
function templatesOf(out: TemplateFields): Partial<ConsoleTemplates> {
  return out.templates === undefined ? {} : { template: out.template ?? null, templates: out.templates, template_choice: out.template_choice ?? null };
}

export function createConsoleApi<K extends string = string, D = unknown>({ base, checkpointUrl, fetcher }: ConsoleApiOptions<K>) {
  const { get, post, put } = fetcher;

  return {
    /** The console as it opens: the latest session (null when there is none yet), brief, size, history. */
    open: (kind: K, id: string) => get<TerminalConsoleData>(base(kind, id)),
    /** `/clear`: a new session. */
    start: (kind: K, id: string, title?: string) => post<TerminalConsoleData>(`${base(kind, id)}/sessions`, title ? { title } : {}),
    /** `/resume`. */
    sessions: async (kind: K, id: string): Promise<TerminalSessionRow[]> => (await get<{ sessions: TerminalSessionRow[] }>(`${base(kind, id)}/sessions`)).sessions,
    openSession: (kind: K, id: string, session: string) => get<TerminalConsoleData>(`${base(kind, id)}/sessions/${session}`),
    /** `/compact [focus]`, and "Summarise up to / from here" with a turn. */
    compact: (kind: K, id: string, session: string, payload: { focus?: string; range?: 'older' | 'upto' | 'from'; turn?: string }) =>
      post<TerminalConsoleData & { compacted: boolean }>(`${base(kind, id)}/sessions/${session}/compact`, payload),
    /**
     * The recap written for a person coming back: paid once per point in the session, `recap: null` when it could
     * not be written (the console then keeps the recap it drew from the turns). A vanished session or a throttle
     * stays quiet: nobody asked by name.
     */
    recap: (kind: K, id: string, session: string, awayMinutes: number | null) =>
      post<{ recap: { lines: string[]; cached: boolean } | null; unavailable: boolean }>(
        `${base(kind, id)}/sessions/${session}/recap`,
        awayMinutes === null ? {} : { away_minutes: awayMinutes },
        { quietStatuses: [404, 429] },
      ),
    /** `/cost`: what this session has cost, by level. `null` when it cannot be read; quiet on 404 and 429. */
    usage: async (kind: K, id: string, session: string): Promise<TerminalUsage | null> =>
      (await get<{ usage: TerminalUsage | null }>(`${base(kind, id)}/sessions/${session}/usage`, { quietStatuses: [404, 429] })).usage,
    /** The person's own commands ("saved asks"). */
    commands: async (kind: K, id: string): Promise<TerminalSavedCommand[]> => (await get<{ commands: TerminalSavedCommand[] }>(`${base(kind, id)}/commands`)).commands ?? [],
    saveCommands: async (kind: K, id: string, commands: TerminalSavedCommand[]): Promise<TerminalSavedCommand[]> =>
      (await put<{ commands: TerminalSavedCommand[] }>(`${base(kind, id)}/commands`, { commands })).commands ?? [],
    /** Rewind the conversation to before an ask (the product restores the design itself). */
    rewind: (kind: K, id: string, session: string, turn: string) => post<TerminalConsoleData & { rewound: number }>(`${base(kind, id)}/sessions/${session}/rewind`, { turn }),
    /** `/brief`: null text removes it. */
    saveBrief: async (kind: K, id: string, text: string | null): Promise<TerminalBrief | null> => (await put<{ brief: TerminalBrief | null }>(`${base(kind, id)}/brief`, { text })).brief,
    /** `/specialize`: a guide's key, 'none', or null to let the subject's own kind (or the assistant) decide. */
    saveSpecialization: async (kind: K, id: string, key: string | null): Promise<ConsoleSpecializations & Partial<ConsoleTemplates>> => {
      const out = await put<
        { choice: ConsoleSpecializations['specialization_choice']; specialization: TerminalSpecialization | null; specializations: TerminalSpecializationOption[] } & TemplateFields
      >(`${base(kind, id)}/specialization`, { key });

      // A new guide brings its own templates in the same answer.
      return { specialization: out.specialization, specializations: out.specializations ?? [], specialization_choice: out.choice ?? null, ...templatesOf(out) };
    },
    /** `/template`: a template's key, 'none', or null for "let the assistant pick". */
    saveTemplate: async (kind: K, id: string, key: string | null): Promise<ConsoleTemplates> => {
      const out = await put<{ choice: ConsoleTemplates['template_choice']; template: TerminalTemplate | null; templates: TerminalTemplateOption[] }>(`${base(kind, id)}/template`, { key });

      return { template: out.template, templates: out.templates ?? [], template_choice: out.choice ?? null };
    },
    checkpoint: async (kind: K, id: string, checkpoint: string): Promise<ConsoleCheckpoint<D>> =>
      (await get<{ checkpoint: ConsoleCheckpoint<D> }>(checkpointUrl(kind, id, checkpoint))).checkpoint,
  };
}

export type ConsoleApi<K extends string = string, D = unknown> = ReturnType<typeof createConsoleApi<K, D>>;
