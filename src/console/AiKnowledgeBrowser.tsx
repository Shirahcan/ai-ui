import { useMemo, useState } from 'react';
import { useConsoleResource } from './ConsoleContext';
import { Button, Dialog, Empty, INPUT, LoadError, Loading, Pill, Section, Table, Td, when } from './primitives';
import type { KnowledgeEntry } from './types';

interface KnowledgePage {
  entries: KnowledgeEntry[];
  meta: { page: number; last_page: number; total: number };
}

/**
 * What the assistant knows, as it was published. Read-only on purpose: each product's
 * knowledge files are the authority, so the screen says where an entry is changed.
 */
export function AiKnowledgeBrowser({ sourceHint = "Entries are changed in the product's knowledge files and published on deploy." }: { sourceHint?: string }) {
  const [audience, setAudience] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<KnowledgeEntry | null>(null);
  const { data, error, loading, reload } = useConsoleResource<KnowledgePage>('knowledge', { audience: audience || undefined, page, per_page: 50 });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = data?.entries ?? [];
    return q ? list.filter((e) => `${e.slug} ${e.question ?? ''} ${e.description ?? ''}`.toLowerCase().includes(q)) : list;
  }, [data, search]);

  return (
    <Section
      title="Knowledge"
      description={sourceHint}
      actions={
        <>
          <input aria-label="Search this page" placeholder="Search" className={`${INPUT} w-44`} value={search} onChange={(e) => setSearch(e.target.value)} />
          <input aria-label="Audience" placeholder="Audience" className={`${INPUT} w-32`} value={audience} onChange={(e) => { setAudience(e.target.value.trim()); setPage(1); }} />
        </>
      }
    >
      {error && !data ? (
        <LoadError error={error} onRetry={reload} />
      ) : loading && !data ? (
        <Loading />
      ) : data ? (
        <>
          <Table head={['Entry', 'Audiences', 'Status', 'Updated']} empty={rows.length === 0 ? <Empty>{search || audience ? 'No entry matches.' : 'Nothing published yet. The product publishes with ai:knowledge-sync.'}</Empty> : null}>
            {rows.map((e) => (
              <tr key={e.slug} className="cursor-pointer hover:bg-[var(--ai-accent-soft)]" onClick={() => setOpen(e)}>
                <Td>
                  <div className="font-medium">{e.question ?? e.slug}</div>
                  <div className="break-all text-xs text-[var(--ai-muted)]">{e.slug}</div>
                </Td>
                <Td>{(e.audiences ?? []).join(', ') || 'Everyone'}</Td>
                <Td>
                  <Pill tone={e.status === 'published' ? 'good' : 'muted'}>{e.status}</Pill>
                  {e.expires_at ? <span className="block text-xs text-[var(--ai-muted)]">Check by {when(e.expires_at)}</span> : null}
                </Td>
                <Td className="whitespace-nowrap">{when(e.updated_at)}</Td>
              </tr>
            ))}
          </Table>
          {data.meta.last_page > 1 ? (
            <div className="mt-3 flex items-center justify-between text-sm text-[var(--ai-muted)]">
              <span>
                <strong>{data.meta.total}</strong> entries, page {data.meta.page} of {data.meta.last_page}
              </span>
              <span className="flex gap-2">
                <Button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <Button disabled={page >= data.meta.last_page} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </span>
            </div>
          ) : null}
        </>
      ) : null}

      {open ? (
        <Dialog wide title={open.question ?? open.slug} onClose={() => setOpen(null)} footer={<Button onClick={() => setOpen(null)}>Close</Button>}>
          <div className="space-y-3 text-sm">
            <p className="break-all text-xs text-[var(--ai-muted)]">{open.slug}</p>
            {open.description ? <p>{open.description}</p> : null}
            <div className="whitespace-pre-wrap rounded-lg bg-[var(--ai-accent-soft)] p-3">{open.answer}</div>
            {open.aliases.length ? <p className="text-xs text-[var(--ai-muted)]">Also asked as: {open.aliases.join('; ')}</p> : null}
          </div>
        </Dialog>
      ) : null}
    </Section>
  );
}
