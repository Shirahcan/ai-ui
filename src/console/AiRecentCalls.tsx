import { useMemo, useState } from 'react';
import { useConsole, useConsoleAcross, useConsoleResource } from './ConsoleContext';
import { ScopeNote } from './ProductPicker';
import { Button, Dialog, Empty, INPUT, LoadError, Loading, Pill, Section, Table, Td, when } from './primitives';
import { count, dollars, type UsageCall } from './types';

interface CallsPage {
  calls: UsageCall[];
  meta: { page: number; per_page: number; total: number; last_page: number };
}

// The ledger's own vocabulary (ai-service UsageRecorder).
const OUTCOMES = ['', 'ok', 'failed', 'rate_limited', 'refused', 'over_budget'];

/** This product's AI calls one by one, newest first, with the failures easy to find. */
export function AiRecentCalls() {
  const [outcome, setOutcome] = useState('');
  const [task, setTask] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<UsageCall | null>(null);

  const { allProducts, productName } = useConsole();
  const query = { days: 30, outcome: outcome || undefined, task: task.trim() || undefined, page: allProducts ? 1 : page, per_page: 25 };
  const single = useConsoleResource<CallsPage>(allProducts ? null : 'usage/calls', query);
  const across = useConsoleAcross<CallsPage>('usage/calls', query);
  // "All products": the newest 25 of each product, merged newest first.
  const merged = useMemo<CallsPage | null>(() => {
    if (!across.active || across.loading) return null;
    const calls = across.results
      .flatMap((r) => r.data.calls.map((c) => ({ ...c, product: r.product })))
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return { calls, meta: { page: 1, per_page: calls.length, total: calls.length, last_page: 1 } };
  }, [across]);
  const data = allProducts ? merged : single.data;
  const error = allProducts ? (across.failed[0]?.error ?? null) : single.error;
  const loading = allProducts ? across.loading : single.loading;
  const reload = allProducts ? across.reload : single.reload;

  return (
    <Section
      title="Recent calls"
      description={allProducts ? "The newest 25 AI calls of each product in the last 30 days." : "The last 30 days of this product's AI calls."}
      actions={
        <>
          <input aria-label="Filter by task" placeholder="Task" className={`${INPUT} w-40`} value={task} onChange={(e) => { setTask(e.target.value); setPage(1); }} />
          <select aria-label="Filter by outcome" className={`${INPUT} w-auto`} value={outcome} onChange={(e) => { setOutcome(e.target.value); setPage(1); }}>
            {OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {o === '' ? 'Every outcome' : o.replace('_', ' ')}
              </option>
            ))}
          </select>
        </>
      }
    >
      {error && !data ? (
        <LoadError error={error} onRetry={reload} />
      ) : loading && !data ? (
        <Loading />
      ) : data ? (
        <>
          <ScopeNote failed={across.failed} />
          <Table wide head={allProducts ? ['When', 'Product', 'Task', 'Outcome', 'Model', 'Time', 'Cost'] : ['When', 'Task', 'Outcome', 'Model', 'Time', 'Cost']} empty={data.calls.length === 0 ? <Empty>No calls match.</Empty> : null}>
            {data.calls.map((c) => (
              <tr key={`${c.product ?? ''}:${c.id}`} className="cursor-pointer hover:bg-[var(--ai-accent-soft)]" onClick={() => setOpen(c)}>
                <Td className="whitespace-nowrap">{when(c.created_at)}</Td>
                {allProducts ? <Td>{productName(c.product ?? '')}</Td> : null}
                <Td className="break-all">{c.task}</Td>
                <Td>
                  <Pill tone={c.outcome === 'ok' ? 'good' : 'bad'}>{c.outcome ?? 'unknown'}</Pill>
                </Td>
                <Td className="break-all">{c.model ?? c.provider}</Td>
                <Td className="tabular-nums">{c.latency_ms ? `${(c.latency_ms / 1000).toFixed(1)}s` : ''}</Td>
                <Td className="tabular-nums">{dollars(c.cost_usd * 1_000_000)}</Td>
              </tr>
            ))}
          </Table>
          {data.meta.last_page > 1 ? (
            <div className="mt-3 flex items-center justify-between text-sm text-[var(--ai-muted)]">
              <span>
                Page <strong>{data.meta.page}</strong> of {data.meta.last_page} ({count(data.meta.total)} calls)
              </span>
              <span className="flex gap-2">
                <Button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Newer</Button>
                <Button disabled={page >= data.meta.last_page} onClick={() => setPage((p) => p + 1)}>Older</Button>
              </span>
            </div>
          ) : null}
        </>
      ) : null}

      {open ? (
        <Dialog title={open.task ?? 'AI call'} onClose={() => setOpen(null)} footer={<Button onClick={() => setOpen(null)}>Close</Button>}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-[var(--ai-muted)]">When</dt><dd>{when(open.created_at)}</dd>
            <dt className="text-[var(--ai-muted)]">Outcome</dt><dd><strong>{open.outcome}</strong></dd>
            <dt className="text-[var(--ai-muted)]">Model</dt><dd className="break-all">{open.provider} {open.model} ({open.tier})</dd>
            <dt className="text-[var(--ai-muted)]">Tokens</dt><dd>{count(open.prompt_tokens)} in, {count(open.completion_tokens)} out</dd>
            <dt className="text-[var(--ai-muted)]">Time</dt><dd>{open.latency_ms ? `${(open.latency_ms / 1000).toFixed(2)}s` : 'n/a'}</dd>
            <dt className="text-[var(--ai-muted)]">Cost</dt><dd><strong>{dollars(open.cost_usd * 1_000_000)}</strong></dd>
            {open.error ? (<><dt className="text-[var(--ai-muted)]">Error</dt><dd className="break-words text-[var(--ai-danger)]">{open.error}</dd></>) : null}
          </dl>
        </Dialog>
      ) : null}
    </Section>
  );
}
