import { useState } from 'react';
import { ConsoleError, useConsole, useConsoleResource } from './ConsoleContext';
import { Button, Confirm, Empty, Kebab, LoadError, Loading, Pill, Section, Table, Td, copyText, when } from './primitives';
import { GuideTemplates } from './GuideTemplates';
import { SpecializationEditor } from './SpecializationEditor';
import { blankSpecialization, type Specialization, type SpecializationVocabulary } from './specializationTypes';

/** The list with one guide replaced (by key) or added, in name order as the service lists them. */
export function upsertGuide(list: Specialization[], saved: Specialization): Specialization[] {
  return [...list.filter((g) => g.key !== saved.key), saved].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Specializations (1.55.0): named guides the assistant follows for one kind of output ("Blog post",
 * "Landing page"): its instructions, its sections in order, the data it fetches first, the checks after
 * writing and the fields it drafts for the person to accept. The product publishes what a guide may use;
 * its admins own the guides here.
 */
export function AiSpecializations() {
  const { request, notify, reportError } = useConsole();
  const { data, error, loading, reload, setData } = useConsoleResource<{ specializations?: Specialization[]; vocabulary?: SpecializationVocabulary | null }>('specializations');
  const [editing, setEditing] = useState<{ guide: Specialization; isNew: boolean } | null>(null);
  const [removing, setRemoving] = useState<Specialization | null>(null);
  // 1.56.0: the formats inside one guide, opened from its row.
  const [templatesOf, setTemplatesOf] = useState<Specialization | null>(null);

  if (loading && !data) return <Loading />;
  if (error && !data) return <LoadError error={error} onRetry={reload} />;

  const guides = data?.specializations ?? [];
  const vocabulary = data?.vocabulary ?? null;
  const label = (kind: 'surfaces' | 'hosts', key: string) => (vocabulary?.[kind] ?? []).find((v) => v.key === key)?.label ?? key;

  if (templatesOf && vocabulary) {
    return <GuideTemplates guide={templatesOf} vocabulary={vocabulary} onBack={() => setTemplatesOf(null)} />;
  }

  if (editing && vocabulary) {
    return (
      <SpecializationEditor
        initial={editing.guide}
        isNew={editing.isNew}
        vocabulary={vocabulary}
        taken={guides.map((g) => g.key)}
        onCancel={() => setEditing(null)}
        onSaved={(saved) => {
          setEditing(null);
          // The saved guide is drawn at once (1.55.1); the refetch then confirms the whole list.
          if (data) setData({ ...data, specializations: upsertGuide(data.specializations ?? [], saved) });
          reload();
          notify({ title: `Saved ${saved.name}`, description: `Version ${saved.version}.` });
        }}
      />
    );
  }

  const description =
    'Guides the assistant follows for one kind of output: what to say, the sections in order, what to look up first, and what to check after writing. A page can have its own default, and the person can switch it in the console.';

  if (!vocabulary) {
    return (
      <Section title="Specializations" description={description}>
        <Empty>This product has not published what its guides may use yet. Run php artisan ai:specializations-sync on the product.</Empty>
      </Section>
    );
  }

  return (
    <Section
      title="Specializations"
      description={description}
      actions={
        <Button tone="primary" onClick={() => setEditing({ guide: blankSpecialization(), isNew: true })}>
          New specialization
        </Button>
      }
    >
      <Table
        head={['Specialization', 'Used on', 'Default for', 'Status', 'Version', '']}
        empty={
          guides.length === 0 ? <Empty>No specializations yet. Create one, or describe the kind of output to the assistant and it drafts the guide for you.</Empty> : null
        }
      >
        {guides.map((g) => (
          <tr key={g.key}>
            <Td>
              <button type="button" className="text-left font-medium outline-none hover:underline focus-visible:underline" onClick={() => setEditing({ guide: g, isNew: false })}>
                {g.name}
              </button>
              {g.use_when ? <div className="text-xs text-[var(--ai-muted)]">{g.use_when}</div> : null}
              <button type="button" className="text-xs text-[var(--ai-accent)] outline-none hover:underline focus-visible:underline" onClick={() => setTemplatesOf(g)}>
                Templates
              </button>
            </Td>
            <Td className="text-sm">{g.surfaces.map((s) => label('surfaces', s)).join(', ')}</Td>
            <Td className="text-sm">{g.defaults_for.length ? g.defaults_for.map((h) => label('hosts', h)).join(', ') : 'None'}</Td>
            <Td>
              <Pill tone={g.status === 'active' ? 'good' : 'muted'}>{g.status === 'active' ? 'Active' : 'Paused'}</Pill>
            </Td>
            <Td className="whitespace-nowrap text-sm">
              v{g.version}
              <div className="text-xs text-[var(--ai-muted)]">{when(g.updated_at)}</div>
            </Td>
            <Td>
              <Kebab
                label={`Actions for ${g.name}`}
                items={[
                  { label: 'Edit', onSelect: () => setEditing({ guide: g, isNew: false }) },
                  { label: 'Templates', onSelect: () => setTemplatesOf(g) },
                  {
                    label: g.status === 'active' ? 'Pause' : 'Make active',
                    onSelect: () => {
                      request<{ specialization: Specialization }>('PUT', `specializations/${g.key}`, { body: { status: g.status === 'active' ? 'paused' : 'active' } })
                        .then(() => reload())
                        .catch(() => undefined);
                    },
                  },
                  {
                    label: 'Copy key',
                    onSelect: () => {
                      void copyText(g.key).then((ok) => (ok ? notify({ title: `Copied ${g.key}` }) : reportError('Copying to the clipboard was blocked by the browser.')));
                    },
                  },
                  { label: 'Delete', danger: true, onSelect: () => setRemoving(g) },
                ]}
              />
            </Td>
          </tr>
        ))}
      </Table>

      {removing ? (
        <Confirm
          title={`Delete ${removing.name}?`}
          body={`Pages that followed it stop following it on their next ask. Pausing keeps it for later instead.`}
          verb="Delete"
          danger
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            try {
              await request('DELETE', `specializations/${removing.key}`);
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
