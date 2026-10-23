/**
 * The message kinds ai-service emits, as a contract this package can render.
 *
 * ⚠ THIS IS THE ESTATE'S CONTRACT, NOT ONE PRODUCT'S. Every product in the
 * estate gets its answers from the same service, so `kind` and the `meta` keys
 * under it are already the same words in all of them - `action_module`,
 * `module_id`, `draft_body`, `can_refine`. What differed was only that one
 * product had written a renderer for them and the others had not. Porter's
 * bubble carried eleven of these branches; Mira's carried none, so a confirm
 * card or a data table that ai-service sent to MployNow arrived as the raw
 * sentence above it and the structured half was silently dropped.
 *
 * ⚠ SO THE PACKAGE PARSES THE SERVICE'S OWN NAMES, AND A PRODUCT MAPS NOTHING.
 * The alternative - a neutral block union each product translates into - reads
 * tidier and costs every adopter a mapping layer that can drift from the service
 * on its own. Speaking the contract directly is what makes adoption a theme and
 * a handler object.
 *
 * ⚠ EVERY READ IS DEFENSIVE, because this is a wire format. A kind this build
 * does not know, or a meta bag missing the field its kind promises, renders as
 * the message's prose rather than throwing - an older frontend meeting a newer
 * service must degrade to the sentence, never to a blank bubble.
 */

export type AssistantMessageKind =
  /** Ordinary prose. The default for anything unrecognised. */
  | 'text'
  /** One or more call-to-action links under the answer. */
  | 'action_cta'
  /** A button that opens an action, in a modal or on its own page. */
  | 'action_launch'
  /** A do-prompt awaiting an explicit yes. Drawn as the shared confirm card. */
  | 'action_confirm'
  /** An action's form, embedded in the thread. */
  | 'action_module'
  /** An invitation to start an intake from what was just said. */
  | 'intake_cta'
  /** Structured rows the assistant read, drawn as a table. */
  | 'data_table'
  | 'data_tables'
  /** A long-running research task was queued. */
  | 'research_dispatched'
  /** A finished research answer with its sources. */
  | 'research'
  /** A request for the reader's consent before reading something. */
  | 'it_snapshot_request';

/** A link the assistant offers after an answer. */
export interface AssistantCta {
  label: string;
  href?: string;
  /** An action id, when the CTA runs something rather than navigating. */
  action?: string;
  description?: string;
}

/** One column of a rendered table. */
export interface AssistantTableColumn {
  key: string;
  label: string;
  /** Right-aligns the cell, for money and counts. */
  numeric?: boolean;
}

/**
 * A table the assistant read, ready to draw.
 *
 * ⚠ THIS IS PORTER'S `PorterTargetResult` SHAPE, PROMOTED (P18g), down to
 * `status` and `notes`. A query can come back UNAVAILABLE - the source was
 * unreachable, or the reader may not see it - and a table that renders that as
 * "no rows" tells somebody their data is gone. The whole point of carrying the
 * status is that the two are different answers.
 */
export interface AssistantTable {
  id?: string;
  /** What the rows ARE: cases, candidates, invoices. */
  entity?: string;
  title?: string;
  columns: AssistantTableColumn[];
  rows: Array<Record<string, string | number | null>>;
  /** How many exist, when `rows` is only the first page of them. */
  total?: number;
  /** ⚠ `unavailable` is not "empty". Defaults to `ok` when the service omits it. */
  status?: 'ok' | 'unavailable';
  /** What the reader needs to know before acting: a caveat, an omission. */
  notes?: string[];
  /** The assistant's own sentence about what it looked for. */
  interpretation?: string;
  /** A product route the reader can open to see the whole record. */
  href?: string;
}

/** A source a research answer was built from. */
export interface AssistantSource {
  title: string;
  url?: string;
  publisher?: string;
}

/** `meta` as this package reads it. Every field optional: it is a wire format. */
export interface AssistantMeta {
  cta?: AssistantCta | AssistantCta[];
  module_id?: string;
  action_id?: string;
  presentation?: 'modal' | 'page';
  launch_label?: string;
  launch_intro?: string;
  draft_body?: string;
  draft_message_action_id?: string;
  params?: Record<string, unknown>;
  context?: Record<string, unknown>;
  timezone?: string | null;
  can_refine?: boolean;
  can_explain?: boolean;
  confirm_label?: string;
  seed_text?: string;
  intake_intro?: string;
  result?: AssistantTable | AssistantTable[];
  notes?: string;
  narrated?: boolean;
  research_task_id?: string;
  research_topic?: string;
  research_href?: string;
  sources?: AssistantSource[];
  it_question?: string;
  module_launch?: { module_id: string; label?: string; draft_body?: string } | null;
}

/** A plain object, or null for anything else a wire format might send. */
function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** A non-empty trimmed string, or null. Never the empty string. */
export function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();

  return trimmed === '' ? null : trimmed;
}

/**
 * The kind this message should be drawn as.
 *
 * ⚠ AN UNKNOWN KIND IS `text`, NOT AN ERROR. ai-service ships ahead of the
 * frontends that read it; a kind added there next month must render as the
 * sentence the service also sent, not as an empty bubble or a thrown render.
 */
export function readKind(value: unknown): AssistantMessageKind {
  const known: AssistantMessageKind[] = [
    'action_cta',
    'action_launch',
    'action_confirm',
    'action_module',
    'intake_cta',
    'data_table',
    'data_tables',
    'research_dispatched',
    'research',
    'it_snapshot_request',
  ];
  const kind = readString(value);

  return known.find((k) => k === kind) ?? 'text';
}

/** `meta`, with anything that is not an object read as empty. */
export function readMeta(value: unknown): AssistantMeta {
  return (record(value) ?? {}) as AssistantMeta;
}

/** Every CTA on a message, whether the service sent one or a list. */
export function readCtas(meta: AssistantMeta): AssistantCta[] {
  const raw = meta.cta;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];

  return list.filter((cta): cta is AssistantCta => readString(cta?.label) !== null);
}

/**
 * Every table on a message.
 *
 * ⚠ `data_table` AND `data_tables` ARE THE SAME SHAPE, singular or plural, and
 * a reader should never be able to tell which one the service chose. Porter's
 * bubble handled both with one branch for exactly this reason.
 */
export function readTables(meta: AssistantMeta): AssistantTable[] {
  const raw = meta.result;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];

  /*
   * ⚠ AN UNAVAILABLE TABLE IS KEPT EVEN WITH NO COLUMNS. It is the one case
   * where there is nothing to draw and something to SAY, and dropping it here
   * would silently turn "I could not read that" into no answer at all.
   */
  return list.filter(
    (table): table is AssistantTable =>
      table?.status === 'unavailable'
      || (Array.isArray(table?.columns) && Array.isArray(table?.rows)),
  );
}

/** Sources on a research answer, dropping anything with no title to show. */
export function readSources(meta: AssistantMeta): AssistantSource[] {
  const list = Array.isArray(meta.sources) ? meta.sources : [];

  return list.filter((s): s is AssistantSource => readString(s?.title) !== null);
}
