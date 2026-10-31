import { useMemo, useState } from 'react';
import { useConsole, useConsoleResource } from './ConsoleContext';
import { Empty, INPUT, LoadError, Loading, Section, Stat, Table, Td } from './primitives';
import { TrendChart } from './TrendChart';
import { count, dollars, type UsageGroup, type UsageReport } from './types';

const PERIODS = [
  { key: '7', label: 'Last 7 days' },
  { key: '30', label: 'Last 30 days' },
  { key: '90', label: 'Last 90 days' },
  { key: 'month', label: 'This month' },
] as const;

type PeriodKey = (typeof PERIODS)[number]['key'];

function fromFor(period: PeriodKey): string {
  const d = new Date();
  if (period === 'month') return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
  d.setDate(d.getDate() - Number(period) + 1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * Calls, spend, tokens and speed over a period, for this product or the whole estate.
 *
 * ⚠ "ALL PRODUCTS" IS READ-ONLY KNOWLEDGE EVERY PRODUCT MAY HAVE (owner, 2026-10-31): usage and
 * trends are global, changing anything estate-wide is not.
 */
export function AiUsageOverview() {
  const { capabilities, productName } = useConsole();
  const [period, setPeriod] = useState<PeriodKey>('30');
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [metric, setMetric] = useState<'spend' | 'calls'>('spend');
  const [showTable, setShowTable] = useState(false);

  const product = capabilities?.product;
  const query = useMemo(
    () => ({ from: fromFor(period), product: scope === 'mine' ? product : undefined }),
    [period, scope, product],
  );
  const { data, error, loading, reload } = useConsoleResource<UsageReport>(product ? 'usage' : null, query);

  const points = (data?.daily ?? []).map((d) => ({
    date: d.date,
    value: metric === 'spend' ? d.spend_micros : d.calls,
    label: metric === 'spend' ? dollars(d.spend_micros) : `${count(d.calls)} calls`,
  }));

  const controls = (
    <>
      <select aria-label="Whose usage" className={`${INPUT} w-auto`} value={scope} onChange={(e) => setScope(e.target.value as 'mine' | 'all')}>
        <option value="mine">{product ? productName(product) : 'This product'}</option>
        <option value="all">All products</option>
      </select>
      <select aria-label="Period" className={`${INPUT} w-auto`} value={period} onChange={(e) => setPeriod(e.target.value as PeriodKey)}>
        {PERIODS.map((p) => (
          <option key={p.key} value={p.key}>
            {p.label}
          </option>
        ))}
      </select>
    </>
  );

  return (
    <div className="space-y-6">
      <Section title="Usage" description="Every AI call, what it cost and how fast it answered." actions={controls}>
        {error && !data ? (
          <LoadError error={error} onRetry={reload} />
        ) : loading && !data ? (
          <Loading />
        ) : data ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
              <Stat label="Calls" value={count(data.totals.calls)} />
              <Stat label="Spend" value={dollars(data.totals.spend_micros)} hint={data.totals.savings ? `Saved about ${data.totals.savings} on free tiers` : undefined} />
              <Stat label="Tokens" value={count(data.totals.tokens_total)} />
              <Stat label="Typical answer time" value={data.latency.samples ? `${(data.latency.p50 / 1000).toFixed(1)}s` : 'n/a'} hint={data.latency.samples ? `Slowest 5% over ${(data.latency.p95 / 1000).toFixed(1)}s` : undefined} />
            </div>

            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-semibold">{metric === 'spend' ? 'Spend per day' : 'Calls per day'}</h4>
                <div className="flex gap-2">
                  <select aria-label="Measure" className={`${INPUT} w-auto py-1`} value={metric} onChange={(e) => setMetric(e.target.value as 'spend' | 'calls')}>
                    <option value="spend">Spend</option>
                    <option value="calls">Calls</option>
                  </select>
                  <button type="button" onClick={() => setShowTable((s) => !s)} className="whitespace-nowrap text-sm text-[var(--ai-accent)] underline-offset-2 outline-none hover:underline focus-visible:underline">
                    {showTable ? 'Show chart' : 'Show as table'}
                  </button>
                </div>
              </div>
              {points.length === 0 ? (
                <Empty>No AI calls in this period.</Empty>
              ) : showTable ? (
                <Table head={['Day', 'Calls', 'Spend']}>
                  {data.daily.map((d) => (
                    <tr key={d.date}>
                      <Td>{d.date}</Td>
                      <Td className="tabular-nums">{count(d.calls)}</Td>
                      <Td className="tabular-nums">{dollars(d.spend_micros)}</Td>
                    </tr>
                  ))}
                </Table>
              ) : (
                <TrendChart points={points} ariaLabel={metric === 'spend' ? 'Spend per day' : 'Calls per day'} />
              )}
            </div>
          </div>
        ) : null}
      </Section>

      {data && data.totals.calls > 0 ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Breakdown title="By task" rows={data.by_task} column="task" />
          {scope === 'all' ? (
            <Breakdown title="By product" rows={data.by_product} column="product" name={productName} />
          ) : (
            <Breakdown title="By provider" rows={data.by_provider} column="provider" />
          )}
        </div>
      ) : null}
    </div>
  );
}

function Breakdown({ title, rows, column, name }: { title: string; rows: UsageGroup[]; column: string; name?: (k: string) => string }) {
  const sorted = [...rows].sort((a, b) => b.spend_micros - a.spend_micros || b.calls - a.calls).slice(0, 12);
  return (
    <Section title={title}>
      <Table head={[title.replace('By ', '').replace(/^./, (c) => c.toUpperCase()), 'Calls', 'Spend']}>
        {sorted.map((r) => {
          const key = String(r[column] ?? 'unknown');
          return (
            <tr key={key}>
              <Td className="break-all">{name ? name(key) : key}</Td>
              <Td className="tabular-nums">{count(r.calls)}</Td>
              <Td className="tabular-nums font-semibold">{dollars(r.spend_micros)}</Td>
            </tr>
          );
        })}
      </Table>
    </Section>
  );
}
