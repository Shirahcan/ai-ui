import { useMemo, useState } from 'react';
import { useConsole, useConsoleAcross, useConsoleResource } from './ConsoleContext';
import { ScopeNote } from './ProductPicker';
import { Button, Dialog, Empty, INPUT, LoadError, Loading, Pill, Section, Stat, Table, Td, copyText, when } from './primitives';
import { count, type FeedbackVote } from './types';

interface FeedbackPage {
  data?: FeedbackVote[];
  feedback?: FeedbackVote[];
  meta?: { page: number; last_page: number; total: number; searched?: number };
}

interface FeedbackStats {
  rows: Array<{ audience: string | null; sentiment: string; reason_code: string | null; votes: number }>;
}

/** The reasons a person can pick under a thumbs-down (ai-service TurnFeedbackController::REASONS). */
const REASONS: Array<{ code: string; label: string }> = [
  { code: 'wrong_topic', label: 'Wrong topic' },
  { code: 'outdated_info', label: 'Out of date' },
  { code: 'didnt_understand', label: 'Did not understand' },
  { code: 'missing_detail', label: 'Missing detail' },
  { code: 'unhelpful_other', label: 'Other' },
];

const reasonLabel = (code: string | null | undefined) => REASONS.find((r) => r.code === code)?.label ?? code?.replace(/_/g, ' ') ?? '';

/**
 * What people said about the assistant's answers: the votes, why, and the answer they judged.
 *
 * Site management v2 (2026-11-02): it carries the filters Porter's own "Feedback review" page had
 * (audience, reason, dates, words in the answer), so that page could retire into this one.
 */
export function AiFeedbackInbox() {
  const { allProducts, productName, notify, reportError } = useConsole();
  const [sentiment, setSentiment] = useState<'' | 'positive' | 'negative'>('negative');
  const [audience, setAudience] = useState('');
  const [reason, setReason] = useState('');
  const [since, setSince] = useState('');
  const [until, setUntil] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<FeedbackVote | null>(null);

  const query = {
    sentiment: sentiment || undefined,
    audience: audience || undefined,
    reason_code: reason || undefined,
    since: since || undefined,
    until: until || undefined,
    search: search.trim() || undefined,
    page: allProducts ? 1 : page,
    per_page: 25,
  };

  const stats = useConsoleResource<FeedbackStats>(allProducts ? null : 'feedback/stats');
  const statsAcross = useConsoleAcross<FeedbackStats>('feedback/stats');
  const single = useConsoleResource<FeedbackPage>(allProducts ? null : 'feedback', query);
  const across = useConsoleAcross<FeedbackPage>('feedback', query);

  const statRows = allProducts ? statsAcross.results.flatMap((r) => r.data.rows) : (stats.data?.rows ?? []);
  const statsError = allProducts ? (statsAcross.failed[0]?.error ?? null) : stats.error;
  const up = statRows.filter((r) => r.sentiment === 'positive').reduce((n, r) => n + r.votes, 0);
  const down = statRows.filter((r) => r.sentiment === 'negative').reduce((n, r) => n + r.votes, 0);

  const votes = useMemo<FeedbackVote[]>(() => {
    if (!allProducts) return single.data?.data ?? single.data?.feedback ?? [];
    return across.results
      .flatMap((r) => (r.data.data ?? r.data.feedback ?? []).map((v) => ({ ...v, product: r.product })))
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }, [allProducts, single.data, across.results]);
  const meta = allProducts ? null : single.data?.meta;
  const error = allProducts ? (across.failed[0]?.error ?? null) : single.error;
  const loading = allProducts ? across.loading : single.loading;
  const reload = allProducts ? across.reload : single.reload;
  const hasData = allProducts ? !across.loading : single.data !== null;

  const filtered = Boolean(audience || reason || since || until || search.trim());
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <Section title="Answer feedback" description={allProducts ? 'Thumbs up and down across every product.' : 'Thumbs up and down from people who used the assistant.'}>
        {statsError && statRows.length === 0 ? (
          <LoadError error={statsError} onRetry={allProducts ? statsAcross.reload : stats.reload} />
        ) : (
          <div className="grid grid-cols-3 gap-5">
            <Stat label="Helpful" value={count(up)} />
            <Stat label="Not helpful" value={count(down)} />
            <Stat label="Helpful share" value={up + down ? `${Math.round((100 * up) / (up + down))}%` : 'n/a'} />
          </div>
        )}
      </Section>

      <Section title="Votes" description={allProducts ? 'The newest 25 votes of each product that match.' : undefined}>
        <ScopeNote failed={across.failed} />
        <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <select aria-label="Which votes" className={INPUT} value={sentiment} onChange={(e) => reset(setSentiment)(e.target.value as typeof sentiment)}>
            <option value="negative">Not helpful</option>
            <option value="positive">Helpful</option>
            <option value="">Every vote</option>
          </select>
          <select aria-label="Reason" className={INPUT} value={reason} onChange={(e) => reset(setReason)(e.target.value)}>
            <option value="">Any reason</option>
            {REASONS.map((r) => (
              <option key={r.code} value={r.code}>
                {r.label}
              </option>
            ))}
          </select>
          <input aria-label="Audience" placeholder="Audience (client, consultant...)" className={INPUT} value={audience} onChange={(e) => reset(setAudience)(e.target.value.trim())} />
          <input aria-label="From" type="date" className={INPUT} value={since} onChange={(e) => reset(setSince)(e.target.value)} />
          <input aria-label="To" type="date" className={INPUT} value={until} onChange={(e) => reset(setUntil)(e.target.value)} />
          <input aria-label="Words in the answer" placeholder="Words in the answer" className={INPUT} value={search} onChange={(e) => reset(setSearch)(e.target.value)} />
        </div>

        {error && !hasData ? (
          <LoadError error={error} onRetry={reload} />
        ) : loading && !hasData ? (
          <Loading />
        ) : (
          <>
            <Table head={allProducts ? ['When', 'Product', 'Vote', 'Why', 'Audience'] : ['When', 'Vote', 'Why', 'Audience']} empty={votes.length === 0 ? <Empty>{filtered ? 'No vote matches these filters.' : 'No votes yet.'}</Empty> : null}>
              {votes.map((v) => (
                <tr key={`${v.product ?? ''}:${v.id}`} className="cursor-pointer hover:bg-[var(--ai-accent-soft)]" onClick={() => setOpen(v)}>
                  <Td className="whitespace-nowrap">{when(v.created_at)}</Td>
                  {allProducts ? <Td>{productName(v.product ?? '')}</Td> : null}
                  <Td><Pill tone={v.sentiment === 'positive' ? 'good' : 'bad'}>{v.sentiment === 'positive' ? 'Helpful' : 'Not helpful'}</Pill></Td>
                  <Td>{v.reason_text || reasonLabel(v.reason_code)}</Td>
                  <Td>{v.audience ?? ''}</Td>
                </tr>
              ))}
            </Table>
            {meta?.searched ? <p className="mt-2 text-xs text-[var(--ai-muted)]">Searched the newest {count(meta.searched)} votes that match the other filters.</p> : null}
            {meta && meta.last_page > 1 ? (
              <div className="mt-3 flex items-center justify-between text-sm text-[var(--ai-muted)]">
                <span>
                  <strong>{count(meta.total)}</strong> votes, page {meta.page} of {meta.last_page}
                </span>
                <span className="flex gap-2">
                  <Button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Newer</Button>
                  <Button disabled={page >= meta.last_page} onClick={() => setPage((p) => p + 1)}>Older</Button>
                </span>
              </div>
            ) : null}
          </>
        )}
      </Section>

      {open ? (
        <Dialog
          wide
          title="The answer that was judged"
          onClose={() => setOpen(null)}
          footer={
            <>
              <Button
                onClick={() =>
                  void copyText(open.conversation_id).then((ok) =>
                    ok ? notify({ title: 'Conversation reference copied' }) : reportError('Copying to the clipboard was blocked by the browser.'),
                  )
                }
              >
                Copy conversation reference
              </Button>
              <Button onClick={() => setOpen(null)}>Close</Button>
            </>
          }
        >
          <div className="space-y-3 text-sm">
            <p>
              <strong>{open.sentiment === 'positive' ? 'Helpful' : 'Not helpful'}</strong>
              {open.reason_text || open.reason_code ? `: ${open.reason_text || reasonLabel(open.reason_code)}` : ''}
            </p>
            <p className="text-xs text-[var(--ai-muted)]">
              {when(open.created_at)}
              {open.audience ? `, asked by a ${open.audience}` : ''}
              {open.product ? `, ${productName(open.product)}` : ''}
            </p>
            <div className="whitespace-pre-wrap rounded-lg bg-[var(--ai-accent-soft)] p-3">{open.answer ?? 'The answer is no longer held (its transcript has expired).'}</div>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
