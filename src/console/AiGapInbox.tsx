import { useMemo, useState } from 'react';
import { useConsole, useConsoleAcross, useConsoleResource } from './ConsoleContext';
import { ScopeNote } from './ProductPicker';
import { Button, Dialog, Empty, INPUT, Kebab, LoadError, Loading, Pill, Section, Stat, Table, Td, copyText, when } from './primitives';
import { count } from './types';

export interface AssistantGap {
  id: string;
  product?: string;
  audience: string;
  category: string;
  category_label?: string;
  reason: string | null;
  tool: string | null;
  source: 'tool_outcome' | 'self_report';
  question: string | null;
  status: 'open' | 'planned' | 'fixed' | 'wont_fix';
  note: string | null;
  occurrences: number;
  last_conversation_id: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
}

interface GapPage {
  data?: AssistantGap[];
  meta?: { page: number; last_page: number; total: number; categories?: Record<string, string> };
}

interface GapStats {
  data?: { open: number; planned: number; opened_30d: number; fixed_30d: number; occurrences_30d: number };
}

/** The closed list ai-service records (AssistantGap::CATEGORIES), in the words an admin reads. */
const CATEGORIES: Record<string, string> = {
  no_capability: 'Nothing can do this yet',
  tool_refused: 'A tool said no',
  tool_failed: 'A tool broke',
  query_rejected: 'The data question could not be asked',
  not_grounded: 'Answered without evidence',
  out_of_scope: 'Not something this product does',
};

const STATUS_LABEL: Record<AssistantGap['status'], string> = { open: 'Open', planned: 'Planned', fixed: 'Fixed', wont_fix: "Won't fix" };
const STATUS_TONE: Record<AssistantGap['status'], 'bad' | 'accent' | 'good' | 'muted'> = { open: 'bad', planned: 'accent', fixed: 'good', wont_fix: 'muted' };

/**
 * What the assistant could not do (ai-service assistant-gap-reports, 2026-11-04): every time it could
 * not fetch something or could not do what it was asked, ranked by how often real people hit it, for
 * an admin to plan, fix or set aside. A fixed gap that happens again re-opens by itself.
 */
export function AiGapInbox() {
  const { allProducts, productName, request, notify, reportError } = useConsole();
  const [status, setStatus] = useState<'' | AssistantGap['status']>('open');
  const [category, setCategory] = useState('');
  const [audience, setAudience] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<AssistantGap | null>(null);
  const [setAside, setSetAside] = useState<AssistantGap | null>(null);
  const [note, setNote] = useState('');

  const query = { status: status || undefined, category: category || undefined, audience: audience || undefined, page: allProducts ? 1 : page, per_page: 25 };
  const stats = useConsoleResource<GapStats>(allProducts ? null : 'gaps/stats');
  const statsAcross = useConsoleAcross<GapStats>('gaps/stats');
  const single = useConsoleResource<GapPage>(allProducts ? null : 'gaps', query);
  const across = useConsoleAcross<GapPage>('gaps', query);

  const totals = useMemo(() => {
    const rows = allProducts ? statsAcross.results.map((r) => r.data.data) : [stats.data?.data];
    return rows.reduce(
      (t, r) => ({ open: t.open + (r?.open ?? 0), planned: t.planned + (r?.planned ?? 0), fixed: t.fixed + (r?.fixed_30d ?? 0), hits: t.hits + (r?.occurrences_30d ?? 0) }),
      { open: 0, planned: 0, fixed: 0, hits: 0 },
    );
  }, [allProducts, stats.data, statsAcross.results]);

  const gaps = useMemo<AssistantGap[]>(() => {
    if (!allProducts) return single.data?.data ?? [];
    return across.results.flatMap((r) => (r.data.data ?? []).map((g) => ({ ...g, product: r.product }))).sort((a, b) => b.occurrences - a.occurrences);
  }, [allProducts, single.data, across.results]);
  const meta = allProducts ? null : single.data?.meta;
  const error = allProducts ? (across.failed[0]?.error ?? null) : single.error;
  const loading = allProducts ? across.loading : single.loading;
  const reload = () => {
    (allProducts ? across.reload : single.reload)();
    (allProducts ? statsAcross.reload : stats.reload)();
  };
  const hasData = allProducts ? !across.loading : single.data !== null;

  const triage = async (gap: AssistantGap, next: AssistantGap['status'], withNote?: string) => {
    try {
      await request('PATCH', `gaps/${encodeURIComponent(gap.id)}`, { body: { status: next, note: withNote }, asProduct: gap.product });
      notify({ title: `Marked ${STATUS_LABEL[next].toLowerCase()}` });
      reload();
    } catch (e) {
      reportError(e instanceof Error ? e.message : 'The gap could not be updated.');
    }
  };

  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <Section
        title="What the assistant could not do"
        description={allProducts ? 'Across every product: each time an assistant could not fetch or do what it was asked.' : 'Each time the assistant could not fetch or do what it was asked, ranked by how often people hit it.'}
      >
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
          <Stat label="Open" value={count(totals.open)} />
          <Stat label="Planned" value={count(totals.planned)} />
          <Stat label="Fixed, last 30 days" value={count(totals.fixed)} />
          <Stat label="Times hit, last 30 days" value={count(totals.hits)} />
        </div>
      </Section>

      <Section title="Gaps">
        <ScopeNote failed={across.failed} />
        <div className="mb-4 grid gap-2 sm:grid-cols-3">
          <select aria-label="Status" className={INPUT} value={status} onChange={(e) => reset(setStatus)(e.target.value as typeof status)}>
            <option value="open">Open</option>
            <option value="planned">Planned</option>
            <option value="fixed">Fixed</option>
            <option value="wont_fix">Won&apos;t fix</option>
            <option value="">Every status</option>
          </select>
          <select aria-label="Kind of gap" className={INPUT} value={category} onChange={(e) => reset(setCategory)(e.target.value)}>
            <option value="">Every kind</option>
            {Object.entries(CATEGORIES).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <input aria-label="Audience" placeholder="Audience (client, consultant...)" className={INPUT} value={audience} onChange={(e) => reset(setAudience)(e.target.value.trim())} />
        </div>

        {error && !hasData ? (
          <LoadError error={error} onRetry={reload} />
        ) : loading && !hasData ? (
          <Loading />
        ) : (
          <>
            <Table
              head={[...(allProducts ? ['Product'] : []), 'What was asked', 'Kind', 'Times', 'Last seen', 'Status', '']}
              empty={gaps.length === 0 ? <Empty>{status === 'open' && !category && !audience ? 'Nothing open: the assistant has managed everything it was asked.' : 'No gap matches these filters.'}</Empty> : null}
            >
              {gaps.map((g) => (
                <tr key={`${g.product ?? ''}:${g.id}`} className="cursor-pointer hover:bg-[var(--ai-accent-soft)]" onClick={() => setOpen(g)}>
                  {allProducts ? <Td>{productName(g.product ?? '')}</Td> : null}
                  <Td className="max-w-[28rem]">
                    <span className="line-clamp-2">{g.question ?? 'The question has expired with its conversation.'}</span>
                    {g.tool ? <span className="mt-1 block text-xs text-[var(--ai-muted)]">{g.tool}{g.reason ? `: ${g.reason}` : ''}</span> : null}
                  </Td>
                  <Td>{CATEGORIES[g.category] ?? g.category_label ?? g.category}</Td>
                  <Td className="whitespace-nowrap"><strong>{count(g.occurrences)}</strong></Td>
                  <Td className="whitespace-nowrap">{when(g.last_seen_at)}</Td>
                  <Td><Pill tone={STATUS_TONE[g.status]}>{STATUS_LABEL[g.status]}</Pill></Td>
                  <Td>
                    <span onClick={(e) => e.stopPropagation()}>
                      <Kebab
                        label="Gap actions"
                        items={[
                          { label: 'Mark planned', onSelect: () => void triage(g, 'planned'), hidden: g.status === 'planned' },
                          { label: 'Mark fixed', onSelect: () => void triage(g, 'fixed'), hidden: g.status === 'fixed' },
                          { label: 'Re-open', onSelect: () => void triage(g, 'open'), hidden: g.status === 'open' },
                          {
                            label: 'Copy the question',
                            onSelect: () => void copyText(g.question ?? '').then((ok) => (ok ? notify({ title: 'Question copied' }) : reportError('Copying to the clipboard was blocked by the browser.'))),
                            hidden: !g.question,
                          },
                          { label: "Won't fix...", onSelect: () => { setNote(g.note ?? ''); setSetAside(g); }, hidden: g.status === 'wont_fix', danger: true },
                        ]}
                      />
                    </span>
                  </Td>
                </tr>
              ))}
            </Table>
            {meta && meta.last_page > 1 ? (
              <div className="mt-3 flex items-center justify-between text-sm text-[var(--ai-muted)]">
                <span><strong>{count(meta.total)}</strong> gaps, page {meta.page} of {meta.last_page}</span>
                <span className="flex gap-2">
                  <Button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>More often</Button>
                  <Button disabled={page >= meta.last_page} onClick={() => setPage((p) => p + 1)}>Less often</Button>
                </span>
              </div>
            ) : null}
          </>
        )}
      </Section>

      {open ? (
        <Dialog wide title="What the assistant could not do" onClose={() => setOpen(null)} footer={<Button onClick={() => setOpen(null)}>Close</Button>}>
          <div className="space-y-3 text-sm">
            <div className="whitespace-pre-wrap rounded-lg bg-[var(--ai-accent-soft)] p-3">{open.question ?? 'The question has expired with its conversation.'}</div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="text-[var(--ai-muted)]">Kind</dt>
              <dd>{CATEGORIES[open.category] ?? open.category}</dd>
              <dt className="text-[var(--ai-muted)]">Found by</dt>
              <dd>{open.source === 'self_report' ? 'The assistant said it could not help' : 'A tool did not do its job'}</dd>
              {open.tool ? (<><dt className="text-[var(--ai-muted)]">Tool</dt><dd className="font-mono text-xs">{open.tool}{open.reason ? ` (${open.reason})` : ''}</dd></>) : null}
              <dt className="text-[var(--ai-muted)]">Asked by</dt>
              <dd>{open.audience}{open.product ? `, ${productName(open.product)}` : ''}</dd>
              <dt className="text-[var(--ai-muted)]">Times</dt>
              <dd>{count(open.occurrences)}, first {when(open.first_seen_at)}, last {when(open.last_seen_at)}</dd>
              {open.note ? (<><dt className="text-[var(--ai-muted)]">Note</dt><dd>{open.note}</dd></>) : null}
            </dl>
          </div>
        </Dialog>
      ) : null}

      {setAside ? (
        <Dialog
          title="Won't fix this gap"
          onClose={() => setSetAside(null)}
          footer={
            <>
              <Button onClick={() => setSetAside(null)}>Cancel</Button>
              <Button tone="danger" disabled={note.trim() === ''} onClick={() => { void triage(setAside, 'wont_fix', note.trim()); setSetAside(null); }}>
                Set aside
              </Button>
            </>
          }
        >
          <label className="block space-y-1 text-sm">
            <span>Why it will not be fixed (the next admin reads this)</span>
            <textarea className={`${INPUT} min-h-[6rem]`} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </Dialog>
      ) : null}
    </div>
  );
}
