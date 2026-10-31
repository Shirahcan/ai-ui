import { useMemo, useState } from 'react';
import { ConsoleError, useConsole, useConsoleResource } from './ConsoleContext';
import { Button, Confirm, Dialog, Empty, Field, INPUT, Kebab, LoadError, Loading, Pill, Section, Table, Td, when } from './primitives';
import type { Persona } from './types';

/**
 * How this product's assistant speaks, per audience, with every earlier version kept.
 * A save publishes a new version and makes it live; an earlier one can be made live again.
 */
export function AiVoiceEditor() {
  const { capabilities, request } = useConsole();
  const { data, error, loading, reload } = useConsoleResource<{ personas: Persona[] }>('personas');
  const [editing, setEditing] = useState<Persona | 'new' | null>(null);
  const [history, setHistory] = useState<Persona | null>(null);
  const [turnOff, setTurnOff] = useState<Persona | null>(null);
  const canEdit = capabilities?.can.edit_voice === true;

  // One row per voice (key + audience): the live version, or the newest if none is live.
  const voices = useMemo(() => {
    const groups = new Map<string, Persona[]>();
    for (const p of data?.personas ?? []) {
      const k = `${p.key}|${p.audience ?? ''}`;
      groups.set(k, [...(groups.get(k) ?? []), p]);
    }
    return [...groups.values()].map((versions) => ({
      // A group is only created with a row in it, so there is always a first version.
      current: (versions.find((v) => v.is_active) ?? versions[0]) as Persona,
      live: versions.some((v) => v.is_active),
      versions,
    }));
  }, [data]);

  return (
    <Section
      title="Voice"
      description="How the assistant speaks to each audience. Applied to every answer it gives them."
      actions={canEdit ? <Button tone="primary" onClick={() => setEditing('new')}>Add a voice</Button> : null}
    >
      {error && !data ? (
        <LoadError error={error} onRetry={reload} />
      ) : loading && !data ? (
        <Loading />
      ) : (
        <Table head={['Voice', 'Audience', 'Version', '']} empty={voices.length === 0 ? <Empty>No voice published yet. The assistant uses its default tone.</Empty> : null}>
          {voices.map(({ current, live, versions }) => (
            <tr key={`${current.key}|${current.audience ?? ''}`}>
              <Td>
                <div className="font-medium">{current.label}</div>
                <div className="line-clamp-2 text-xs text-[var(--ai-muted)]">{current.voice}</div>
              </Td>
              <Td>{current.audience ?? 'Everyone'}</Td>
              <Td className="whitespace-nowrap">
                v{current.version} {live ? <Pill tone="good">Live</Pill> : <Pill tone="bad">Off</Pill>}
              </Td>
              <Td className="w-10 text-right">
                <Kebab
                  label={`Actions for ${current.label}`}
                  items={[
                    { label: 'Edit', onSelect: () => setEditing(current), hidden: !canEdit },
                    { label: `History (${versions.length})`, onSelect: () => setHistory(current) },
                    { label: 'Turn off', onSelect: () => setTurnOff(current), danger: true, hidden: !canEdit || !live },
                  ]}
                />
              </Td>
            </tr>
          ))}
        </Table>
      )}

      {editing ? <VoiceForm persona={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={reload} /> : null}

      {history ? (
        <Dialog title={`${history.label}: history`} onClose={() => setHistory(null)} footer={<Button onClick={() => setHistory(null)}>Close</Button>}>
          <ol className="space-y-2">
            {(data?.personas ?? [])
              .filter((p) => p.key === history.key && p.audience === history.audience)
              .map((p) => (
                <li key={p.id} className="space-y-1 rounded-lg border border-[var(--ai-border)] px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <strong>v{p.version}</strong> {p.is_active ? <Pill tone="good">Live</Pill> : null}{' '}
                      <span className="text-[var(--ai-muted)]">{p.updated_by ?? 'unknown'}, {when(p.created_at)}</span>
                    </span>
                    {canEdit && !p.is_active ? (
                      <Button
                        onClick={async () => {
                          await request('POST', `personas/${p.id}/activate`, { body: {} });
                          setHistory(null);
                          reload();
                        }}
                      >
                        Make live
                      </Button>
                    ) : null}
                  </div>
                  <p className="whitespace-pre-wrap text-xs text-[var(--ai-muted)]">{p.voice}</p>
                </li>
              ))}
          </ol>
        </Dialog>
      ) : null}

      {turnOff ? (
        <Confirm
          title={`Turn off "${turnOff.label}"?`}
          body={`The assistant stops using this voice for ${turnOff.audience ?? 'everyone'} and falls back to its default tone. You can make a version live again from its history.`}
          verb="Turn off"
          danger
          onClose={() => setTurnOff(null)}
          onConfirm={async () => {
            await request('DELETE', `personas/${turnOff.id}`);
            reload();
          }}
        />
      ) : null}
    </Section>
  );
}

function VoiceForm({ persona, onClose, onSaved }: { persona: Persona | null; onClose: () => void; onSaved: () => void }) {
  const { request } = useConsole();
  const [form, setForm] = useState({
    key: persona?.key ?? '',
    audience: persona?.audience ?? '',
    label: persona?.label ?? '',
    voice: persona?.voice ?? '',
  });
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const ready = form.key.trim() && form.label.trim() && form.voice.trim();

  return (
    <Dialog
      wide
      title={persona ? `Edit ${persona.label}` : 'Add a voice'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            tone="primary"
            disabled={!ready || busy}
            onClick={async () => {
              setBusy(true);
              setProblem(null);
              try {
                await request('POST', 'personas', {
                  body: { key: form.key.trim(), audience: form.audience.trim() || null, label: form.label.trim(), voice: form.voice },
                  quiet: true,
                });
                onSaved();
                onClose();
              } catch (e) {
                setProblem((e as ConsoleError).message);
                setBusy(false);
              }
            }}
          >
            Publish
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {persona ? null : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name in the code" hint="The key the product asks for, e.g. assistant.">
              {(id) => <input id={id} className={INPUT} value={form.key} onChange={set('key')} maxLength={48} />}
            </Field>
            <Field label="Audience" hint="Leave empty for everyone.">
              {(id) => <input id={id} className={INPUT} value={form.audience} onChange={set('audience')} maxLength={32} />}
            </Field>
          </div>
        )}
        <Field label="Label">{(id) => <input id={id} className={INPUT} value={form.label} onChange={set('label')} maxLength={120} />}</Field>
        <Field label="Voice" hint={`${form.voice.length} of 4,000 characters. Added to every answer, so shorter costs less.`} error={problem}>
          {(id) => <textarea id={id} rows={10} className={INPUT} value={form.voice} onChange={set('voice')} maxLength={4000} />}
        </Field>
      </div>
    </Dialog>
  );
}
