import { useState } from 'react';
import { useConsoleResource } from './ConsoleContext';
import { Button, Dialog, Empty, INPUT, LoadError, Loading, Pill, Section, Stat, Table, Td, when } from './primitives';
import { count, type FeedbackVote } from './types';

interface FeedbackPage {
  data?: FeedbackVote[];
  feedback?: FeedbackVote[];
  meta?: { page: number; last_page: number; total: number };
}

interface FeedbackStats {
  rows: Array<{ audience: string | null; sentiment: string; reason_code: string | null; votes: number }>;
}

/** What people said about the assistant's answers: the votes, why, and the answer they judged. */
export function AiFeedbackInbox() {
  const [sentiment, setSentiment] = useState<'' | 'positive' | 'negative'>('negative');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<FeedbackVote | null>(null);
  const stats = useConsoleResource<FeedbackStats>('feedback/stats');
  const { data, error, loading, reload } = useConsoleResource<FeedbackPage>('feedback', { sentiment: sentiment || undefined, page, per_page: 25 });

  const up = (stats.data?.rows ?? []).filter((r) => r.sentiment === 'positive').reduce((n, r) => n + r.votes, 0);
  const down = (stats.data?.rows ?? []).filter((r) => r.sentiment === 'negative').reduce((n, r) => n + r.votes, 0);
  const votes = data?.data ?? data?.feedback ?? [];

  return (
    <div className="space-y-6">
      <Section title="Answer feedback" description="Thumbs up and down from people who used the assistant.">
        {stats.error && !stats.data ? (
          <LoadError error={stats.error} onRetry={stats.reload} />
        ) : (
          <div className="grid grid-cols-3 gap-5">
            <Stat label="Helpful" value={count(up)} />
            <Stat label="Not helpful" value={count(down)} />
            <Stat label="Helpful share" value={up + down ? `${Math.round((100 * up) / (up + down))}%` : 'n/a'} />
          </div>
        )}
      </Section>

      <Section
        title="Votes"
        actions={
          <select aria-label="Which votes" className={`${INPUT} w-auto`} value={sentiment} onChange={(e) => { setSentiment(e.target.value as typeof sentiment); setPage(1); }}>
            <option value="negative">Not helpful</option>
            <option value="positive">Helpful</option>
            <option value="">All</option>
          </select>
        }
      >
        {error && !data ? (
          <LoadError error={error} onRetry={reload} />
        ) : loading && !data ? (
          <Loading />
        ) : (
          <>
            <Table head={['When', 'Vote', 'Why', 'Audience']} empty={votes.length === 0 ? <Empty>No votes yet.</Empty> : null}>
              {votes.map((v) => (
                <tr key={v.id} className="cursor-pointer hover:bg-[var(--ai-accent-soft)]" onClick={() => setOpen(v)}>
                  <Td className="whitespace-nowrap">{when(v.created_at)}</Td>
                  <Td><Pill tone={v.sentiment === 'positive' ? 'good' : 'bad'}>{v.sentiment === 'positive' ? 'Helpful' : 'Not helpful'}</Pill></Td>
                  <Td>{v.reason_text || v.reason_code?.replace(/_/g, ' ') || ''}</Td>
                  <Td>{v.audience ?? ''}</Td>
                </tr>
              ))}
            </Table>
            {data?.meta && data.meta.last_page > 1 ? (
              <div className="mt-3 flex justify-end gap-2">
                <Button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Newer</Button>
                <Button disabled={page >= data.meta.last_page} onClick={() => setPage((p) => p + 1)}>Older</Button>
              </div>
            ) : null}
          </>
        )}
      </Section>

      {open ? (
        <Dialog wide title="The answer that was judged" onClose={() => setOpen(null)} footer={<Button onClick={() => setOpen(null)}>Close</Button>}>
          <div className="space-y-3 text-sm">
            <p>
              <strong>{open.sentiment === 'positive' ? 'Helpful' : 'Not helpful'}</strong>
              {open.reason_text || open.reason_code ? `: ${open.reason_text || open.reason_code?.replace(/_/g, ' ')}` : ''}
            </p>
            <div className="whitespace-pre-wrap rounded-lg bg-[var(--ai-accent-soft)] p-3">{open.answer ?? 'The answer is no longer held (its transcript has expired).'}</div>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
