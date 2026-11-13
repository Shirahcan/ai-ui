'use client';

import { useCallback, useState } from 'react';

import type { AssistantTerminalProps } from './AssistantTerminal';
import type { ConsoleApi, ConsoleSpecializations, ConsoleTemplates } from './consoleApi';
import type { ConsoleData } from './useConsoleData';
import type { TerminalConsoleData, TerminalTurn } from './types';

type ProposalState = 'applied' | 'dismissed';

function readProposals(key: string): Record<string, ProposalState> {
  try {
    const raw = typeof window === 'undefined' ? null : window.localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : {};

    return parsed && typeof parsed === 'object' ? (parsed as Record<string, ProposalState>) : {};
  } catch {
    return {};
  }
}

/** The run a recorded Build answer came from (the kit keeps it on the turn), or null. */
function runOf(turns: TerminalTurn[], turnId: string): string | null {
  const structured = turns.find((t) => t.id === turnId)?.structured as { run_id?: unknown } | null | undefined;

  return typeof structured?.run_id === 'string' ? structured.run_id : null;
}

export interface ConsoleGuidesOptions<K extends string> {
  api: Pick<ConsoleApi<K>, 'saveSpecialization'>;
  kind: K;
  id: string;
  console: ConsoleData;
  turns: TerminalTurn[];
  /** The product's own switch for guides, read fail-closed by the product. */
  enabled: boolean;
  /** Where the guides are edited, in the product. */
  manageHref?: string;
  /**
   * Fields a Build drafted for the subject's own record (a blog post's title, a landing page's SEO), when the
   * subject has such a record. `apply` writes them and tells the person (a toast, in the product's way); a failure
   * is surfaced by the product's fetcher. Omit for a subject with no record (a component).
   */
  proposals?: { apply: (runId: string, fields: string[]) => Promise<unknown>; storageKey?: string } | null;
}

/**
 * The console's guides (specializations; shared console C4b, moved from Portify's useConsoleSpecializations): the
 * chip saying which guide applies and why, the picker and `/specialize`, and Apply / Dismiss on the fields a Build
 * drafted for the subject's record. Nothing is offered while the product's switch is off, or before the console has
 * loaded: before that there is no answer, and "No guide" would be a wrong one.
 */
export function useConsoleGuides<K extends string>({ api, kind, id, console: data, turns, enabled, manageHref, proposals: drafted }: ConsoleGuidesOptions<K>): Partial<AssistantTerminalProps> {
  const storageKey = drafted?.storageKey ?? 'ai-console:proposals';
  const [proposals, setProposals] = useState<Record<string, ProposalState>>(() => readProposals(storageKey));
  const current = data.data as (TerminalConsoleData & Partial<ConsoleSpecializations>) | null;

  const remember = useCallback(
    (runId: string, state: ProposalState) => {
      setProposals((before) => {
        const next = { ...before, [runId]: state };

        try {
          window.localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          // A browser that refuses storage keeps it for this visit only.
        }

        return next;
      });
    },
    [storageKey],
  );

  const change = useCallback(
    (key: string | null) => {
      api
        .saveSpecialization(kind, id, key)
        .then((next) => {
          if (data.data) data.accept({ ...data.data, ...next } as TerminalConsoleData);
          const name = next.specialization?.key === null ? 'I pick a guide for each ask' : next.specialization ? `I follow the ${next.specialization.name} guide here` : 'I follow no guide here';
          data.note(`${name} from your next ask.`, 'ok');
        })
        // A refused choice is an API error: the product's fetcher shows the real reason.
        .catch(() => undefined);
    },
    [api, data, id, kind],
  );

  const apply = drafted?.apply;
  const proposal = useCallback(
    (turnId: string, action: 'apply' | 'dismiss') => {
      const runId = runOf(turns, turnId);

      if (!runId || !apply) return;
      if (action === 'dismiss') {
        remember(runId, 'dismissed');

        return;
      }

      const fields = (turns.find((t) => t.id === turnId)?.structured?.outcome?.proposal?.fields ?? []).map((f) => f.key);

      apply(runId, fields)
        .then(() => remember(runId, 'applied'))
        // The product's fetcher surfaces the real reason (a moved page, an expired run).
        .catch(() => undefined);
    },
    [apply, remember, turns],
  );

  if (!enabled || !current) return {};

  return {
    specialization: current.specialization ?? null,
    specializations: current.specializations ?? [],
    specializationChoice: current.specialization_choice?.key ?? null,
    onSpecializationChange: change,
    ...(manageHref ? { manageSpecializationsHref: manageHref } : {}),
    ...(apply
      ? {
          onProposal: proposal,
          proposalState: (turnId: string) => {
            const runId = runOf(turns, turnId);

            return runId ? (proposals[runId] ?? null) : null;
          },
        }
      : {}),
  };
}

export interface ConsoleTemplatesOptions<K extends string> {
  api: Pick<ConsoleApi<K>, 'saveTemplate'>;
  kind: K;
  id: string;
  console: ConsoleData;
  turns: TerminalTurn[];
  /** The product's own switch for templates, read fail-closed by the product. */
  enabled: boolean;
}

/**
 * The console's templates (shared console C4b, moved from Portify's useConsoleTemplates): the chip names the format
 * beside the guide, `/template` and its grouped picker switch it, and a NEW subject's empty composer starts from the
 * chosen template's starter. Nothing is offered while the product's switch is off, or before the console has loaded.
 */
export function useConsoleTemplates<K extends string>({ api, kind, id, console: data, turns, enabled }: ConsoleTemplatesOptions<K>): Partial<AssistantTerminalProps> {
  const current = data.data as (TerminalConsoleData & Partial<ConsoleTemplates>) | null;

  const change = useCallback(
    (key: string | null) => {
      api
        .saveTemplate(kind, id, key)
        .then((next) => {
          if (data.data) data.accept({ ...data.data, ...next } as TerminalConsoleData);
          const said = next.template ? `I write this as a ${next.template.name}` : key === 'none' ? "I write in the guide's own sections" : 'I pick the format that fits';
          data.note(`${said} from your next ask.`, 'ok');
        })
        // A refused choice is an API error: the product's fetcher shows the real reason.
        .catch(() => undefined);
    },
    [api, data, id, kind],
  );

  if (!enabled || !current || current.templates === undefined) return {};

  // The starter belongs to a subject nobody has asked anything about yet: no session, no turns.
  const chosen = current.template?.source === 'person' ? (current.templates.find((t) => t.key === current.template?.key) ?? null) : null;
  const isNew = !current.session && turns.length === 0;

  return {
    template: current.template ?? null,
    templates: current.templates,
    // The assistant's remembered pick is not the person's choice: the picker shows "let it pick" for it.
    templateChoice: current.template_choice?.source === 'porter' ? null : (current.template_choice?.key ?? null),
    onTemplateChange: change,
    starter: isNew && chosen?.starter ? chosen.starter : null,
  };
}
