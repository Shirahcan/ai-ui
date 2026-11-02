import { useMemo, useState } from 'react';
import { useConsole, useConsoleAcross, useConsoleResource } from './ConsoleContext';
import { ScopeNote } from './ProductPicker';
import { Empty, INPUT, Kebab, LoadError, Loading, Pill, Section, Table, Td, copyText, when } from './primitives';
import { TemplateEditor } from './TemplateEditor';
import type { TemplateRow } from './types';

interface TemplateList {
  tasks: TemplateRow[];
  shared: TemplateRow[];
}

/**
 * The words behind every single-shot AI task this product runs, and the shared prompts every
 * product loads by name.
 *
 * ⚠ AN EDIT HERE SURVIVES DEPLOYS UNTIL A DEVELOPER CHANGES THAT TEMPLATE'S FILE (owner,
 * 2026-10-31); then the file wins and its history says which edit it replaced. The screen
 * says so, so nobody is surprised when a release moves a prompt they tuned.
 */
export function AiPromptTemplates({ onCopied }: { onCopied?: (text: string) => void }) {
  const { capabilities, allProducts, productName, setProduct } = useConsole();
  const single = useConsoleResource<TemplateList>(allProducts ? null : 'tasks');
  const across = useConsoleAcross<TemplateList>('tasks');
  // "All products": every product's own templates, each tagged, and the shared ones once.
  const data = useMemo<TemplateList | null>(() => {
    if (!allProducts) return single.data;
    if (!across.active || across.loading) return null;
    return {
      tasks: across.results.flatMap((r) => r.data.tasks.map((t) => ({ ...t, product: r.product }))),
      shared: across.results[0]?.data.shared ?? [],
    };
  }, [allProducts, single.data, across]);
  const error = allProducts ? (across.failed[0]?.error ?? null) : single.error;
  const loading = allProducts ? across.loading : single.loading;
  const reload = allProducts ? across.reload : single.reload;
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<{ key: string; shared: boolean } | null>(null);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = [...(data?.tasks ?? []).map((t) => ({ ...t, shared: false })), ...(data?.shared ?? []).map((t) => ({ ...t, shared: true }))];
    return q ? all.filter((t) => `${t.key} ${t.product ?? ''}`.toLowerCase().includes(q)) : all;
  }, [data, search]);

  const canEdit = (shared: boolean) => (shared ? capabilities?.can.edit_shared_templates === true : capabilities?.can.edit_templates === true);
  // From the merged list, opening a product's template switches the console to that product, so
  // whatever is changed next is aimed at the product it belongs to.
  const openRow = (t: { key: string; shared: boolean; product?: string }) => {
    if (allProducts && !t.shared && t.product) setProduct(t.product);
    setOpen({ key: t.key, shared: t.shared });
  };

  return (
    <Section
      title="Prompt templates"
      description="What each AI task is told. Your edits stay live through deploys until a developer changes that template's file."
      actions={<input aria-label="Search templates" placeholder="Search" className={`${INPUT} w-48`} value={search} onChange={(e) => setSearch(e.target.value)} />}
    >
      {error && !data ? (
        <LoadError error={error} onRetry={reload} />
      ) : loading && !data ? (
        <Loading />
      ) : data ? (
        <>
        <ScopeNote failed={across.failed} />
        <Table
          head={allProducts ? ['Template', 'Product', 'Version', 'Last changed', ''] : ['Template', 'Version', 'Last changed', '']}
          empty={rows.length === 0 ? <Empty>{search ? 'No template matches.' : 'This product has not published any templates yet. Its deploy runs ai:tasks-sync.'}</Empty> : null}
        >
          {rows.map((t) => (
            <tr key={`${t.shared ? 's' : (t.product ?? 'p')}:${t.key}`} className="cursor-pointer hover:bg-[var(--ai-accent-soft)]" onClick={() => openRow(t)}>
              <Td className="break-all">
                <span className="font-medium">{t.key}</span>
                <span className="ml-2 inline-flex gap-1 align-middle">
                  {t.shared ? <Pill tone="accent">Shared</Pill> : null}
                  {t.sensitive ? <Pill>Private data</Pill> : null}
                </span>
              </Td>
              {allProducts ? <Td>{t.shared ? 'Every product' : productName(t.product ?? '')}</Td> : null}
              <Td className="tabular-nums">v{t.version}</Td>
              <Td className="whitespace-nowrap">
                {t.source === 'console' ? <><strong>Edited</strong> by {t.updated_by}</> : 'From the code'}
                {t.updated_at ? <span className="block text-xs text-[var(--ai-muted)]">{when(t.updated_at)}</span> : null}
              </Td>
              <Td className="w-10 text-right">
                <span onClick={(e) => e.stopPropagation()}>
                  <Kebab
                    label={`Actions for ${t.key}`}
                    items={[
                      { label: allProducts && !t.shared ? `Open in ${productName(t.product ?? '')}` : canEdit(t.shared) ? 'Edit' : 'View', onSelect: () => openRow(t) },
                      { label: 'Copy name', onSelect: () => void copyText(t.key).then((ok) => ok && onCopied?.(t.key)) },
                    ]}
                  />
                </span>
              </Td>
            </tr>
          ))}
        </Table>
        </>
      ) : null}

      {open ? (
        <TemplateEditor
          templateKey={open.key}
          shared={open.shared}
          editable={canEdit(open.shared)}
          onClose={() => setOpen(null)}
          onSaved={reload}
        />
      ) : null}
    </Section>
  );
}
