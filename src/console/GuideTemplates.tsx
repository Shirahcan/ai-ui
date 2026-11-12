import { useState } from 'react';
import { ConsoleError, useConsole, useConsoleResource } from './ConsoleContext';
import { GuideTemplateEditor } from './GuideTemplateEditor';
import { Button, Confirm, Empty, Kebab, LoadError, Loading, Pill, Section, Table, Td, copyText, when } from './primitives';
import type { Specialization, SpecializationVocabulary } from './specializationTypes';
import { blankTemplate, normaliseTemplate, upsertTemplate, type SpecializationTemplate } from './templateTypes';

interface Props {
  guide: Specialization;
  vocabulary: SpecializationVocabulary;
  onBack: () => void;
}

/**
 * A guide's templates (1.56.0, owner 2026-11-12): the formats inside it ("Story", "How-to guide" under "Blog
 * post"), each with its own sections, look, length and what to ask first. The person picks one when they create a
 * page, switches it in the console with /template, or lets the assistant pick.
 */
export function GuideTemplates({ guide, vocabulary, onBack }: Props) {
  const { request, notify, reportError } = useConsole();
  const path = `specializations/${guide.key}/templates`;
  const { data, error, loading, reload, setData } = useConsoleResource<{ templates?: SpecializationTemplate[] }>(path);
  const [editing, setEditing] = useState<{ template: SpecializationTemplate; isNew: boolean } | null>(null);
  const [removing, setRemoving] = useState<SpecializationTemplate | null>(null);

  if (loading && !data) return <Loading />;
  if (error && !data) return <LoadError error={error} onRetry={reload} />;

  const templates = (data?.templates ?? []).map(normaliseTemplate);

  if (editing) {
    return (
      <GuideTemplateEditor
        guide={guide}
        initial={editing.template}
        isNew={editing.isNew}
        vocabulary={vocabulary}
        taken={templates.map((t) => t.key)}
        onCancel={() => setEditing(null)}
        onSaved={(saved) => {
          setEditing(null);
          // Drawn at once, as guides are (1.55.1); the refetch then confirms the whole list.
          setData({ templates: upsertTemplate(templates, normaliseTemplate(saved)) });
          reload();
          notify({ title: `Saved ${saved.name}`, description: `Version ${saved.version}.` });
        }}
      />
    );
  }

  // Moving swaps positions with the neighbour, so the picker's order is exactly the list's.
  const move = async (index: number, by: -1 | 1) => {
    const a = templates[index];
    const b = templates[index + by];
    if (!a || !b) return;
    try {
      await request('PUT', `${path}/${a.key}`, { body: { position: index + by + 1 } });
      await request('PUT', `${path}/${b.key}`, { body: { position: index + 1 } });
    } finally {
      reload();
    }
  };

  return (
    <Section
      title={`${guide.name} templates`}
      description={`Formats inside ${guide.name}. Each keeps the guide's rules and sets its own sections, look and length. The person picks one when they create a page, or switches it in the console with /template.`}
      actions={
        <div className="flex gap-2">
          <Button onClick={onBack}>Back to specializations</Button>
          <Button tone="primary" onClick={() => setEditing({ template: blankTemplate(guide.key), isNew: true })}>
            New template
          </Button>
        </div>
      }
    >
      <Table head={['Template', 'Group', 'Status', 'Version', '']} empty={templates.length === 0 ? <Empty>No templates yet. Without one, pages follow the guide's own sections.</Empty> : null}>
        {templates.map((t, i) => (
          <tr key={t.key}>
            <Td>
              <button type="button" className="text-left font-medium outline-none hover:underline focus-visible:underline" onClick={() => setEditing({ template: t, isNew: false })}>
                {t.name}
              </button>
              {t.use_when ? <div className="text-xs text-[var(--ai-muted)]">{t.use_when}</div> : null}
            </Td>
            <Td className="text-sm">{t.group || 'None'}</Td>
            <Td>
              <Pill tone={t.status === 'active' ? 'good' : 'muted'}>{t.status === 'active' ? 'Active' : 'Paused'}</Pill>
            </Td>
            <Td className="whitespace-nowrap text-sm">
              v{t.version}
              <div className="text-xs text-[var(--ai-muted)]">{when(t.updated_at)}</div>
            </Td>
            <Td>
              <Kebab
                label={`Actions for ${t.name}`}
                items={[
                  { label: 'Edit', onSelect: () => setEditing({ template: t, isNew: false }) },
                  { label: 'Move up', hidden: i === 0, onSelect: () => void move(i, -1).catch(() => undefined) },
                  { label: 'Move down', hidden: i === templates.length - 1, onSelect: () => void move(i, 1).catch(() => undefined) },
                  {
                    label: t.status === 'active' ? 'Pause' : 'Make active',
                    onSelect: () => {
                      request('PUT', `${path}/${t.key}`, { body: { status: t.status === 'active' ? 'paused' : 'active' } })
                        .then(() => reload())
                        .catch(() => undefined);
                    },
                  },
                  {
                    label: 'Copy key',
                    onSelect: () => {
                      void copyText(t.key).then((ok) => (ok ? notify({ title: `Copied ${t.key}` }) : reportError('Copying to the clipboard was blocked by the browser.')));
                    },
                  },
                  { label: 'Delete', danger: true, onSelect: () => setRemoving(t) },
                ]}
              />
            </Td>
          </tr>
        ))}
      </Table>

      {removing ? (
        <Confirm
          title={`Delete ${removing.name}?`}
          body="Pages that follow it fall back to the guide's own sections on their next ask. Pausing keeps it for later instead."
          verb="Delete"
          danger
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            try {
              await request('DELETE', `${path}/${removing.key}`);
              notify({ title: `Deleted ${removing.name}` });
              reload();
            } catch (e) {
              if (!(e instanceof ConsoleError)) reportError(e);
              throw e;
            }
          }}
        />
      ) : null}
    </Section>
  );
}
