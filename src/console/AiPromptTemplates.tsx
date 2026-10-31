import { useMemo, useState } from 'react';
import { useConsole, useConsoleResource } from './ConsoleContext';
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
  const { capabilities } = useConsole();
  const { data, error, loading, reload } = useConsoleResource<TemplateList>('tasks');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<{ key: string; shared: boolean } | null>(null);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = [...(data?.tasks ?? []).map((t) => ({ ...t, shared: false })), ...(data?.shared ?? []).map((t) => ({ ...t, shared: true }))];
    return q ? all.filter((t) => t.key.toLowerCase().includes(q)) : all;
  }, [data, search]);

  const canEdit = (shared: boolean) => (shared ? capabilities?.can.edit_shared_templates === true : capabilities?.can.edit_templates === true);

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
        <Table
          head={['Template', 'Version', 'Last changed', '']}
          empty={rows.length === 0 ? <Empty>{search ? 'No template matches.' : 'This product has not published any templates yet. Its deploy runs ai:tasks-sync.'}</Empty> : null}
        >
          {rows.map((t) => (
            <tr key={`${t.shared ? 's' : 'p'}:${t.key}`} className="cursor-pointer hover:bg-[var(--ai-accent-soft)]" onClick={() => setOpen({ key: t.key, shared: t.shared })}>
              <Td className="break-all">
                <span className="font-medium">{t.key}</span>
                <span className="ml-2 inline-flex gap-1 align-middle">
                  {t.shared ? <Pill tone="accent">Shared</Pill> : null}
                  {t.sensitive ? <Pill>Private data</Pill> : null}
                </span>
              </Td>
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
                      { label: canEdit(t.shared) ? 'Edit' : 'View', onSelect: () => setOpen({ key: t.key, shared: t.shared }) },
                      { label: 'Copy name', onSelect: () => void copyText(t.key).then((ok) => ok && onCopied?.(t.key)) },
                    ]}
                  />
                </span>
              </Td>
            </tr>
          ))}
        </Table>
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
