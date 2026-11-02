import { useState } from 'react';
import { ConsoleError, useConsole, useConsoleResource } from './ConsoleContext';
import { Button, Confirm, Dialog, Field, INPUT, LoadError, Loading, Pill, when } from './primitives';
import type { TemplateDetail, TemplateVersion } from './types';
import { AssistBox } from './AssistBox';

/**
 * Read, edit or restore one template. Only the words are editable (instructions and prompt);
 * the output contract is the code's, because the product parses it.
 */
export function TemplateEditor({
  templateKey,
  shared,
  editable,
  onClose,
  onSaved,
}: {
  templateKey: string;
  shared: boolean;
  editable: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { request, capabilities } = useConsole();
  const [reverting, setReverting] = useState(false);
  const { data, error, loading, reload, setData } = useConsoleResource<TemplateDetail>(`tasks/${encodeURIComponent(templateKey)}`);
  const [draft, setDraft] = useState<{ system: string; prompt: string } | null>(null);
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [restore, setRestore] = useState<TemplateVersion | null>(null);
  const [tab, setTab] = useState<'edit' | 'history'>('edit');

  const base = shared ? `shared-tasks/${encodeURIComponent(templateKey)}` : `tasks/${encodeURIComponent(templateKey)}`;
  const live = data?.live;
  const system = draft?.system ?? live?.system ?? '';
  const prompt = draft?.prompt ?? live?.prompt ?? '';
  const dirty = live !== undefined && (system !== live.system || prompt !== live.prompt);

  const refresh = async () => {
    const fresh = await request<TemplateDetail>('GET', `tasks/${encodeURIComponent(templateKey)}`);
    setData(fresh);
    setDraft(null);
    onSaved();
  };

  const save = async () => {
    if (!live) return;
    setSaving(true);
    setFieldError(null);
    try {
      const body: Record<string, string> = {};
      if (system !== live.system) body.system = system;
      if (prompt !== live.prompt) body.prompt = prompt;
      // A 422 is shown beside its field, so it is not also sent to the product's error surface.
      await request('PATCH', base, { body, quiet: true });
      await refresh();
    } catch (e) {
      const err = e as ConsoleError;
      if (err.status === 422) setFieldError({ field: err.field ?? 'prompt', message: err.message });
      else setFieldError({ field: 'form', message: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      wide
      title={templateKey}
      onClose={onClose}
      footer={
        editable && tab === 'edit' ? (
          <>
            <Button onClick={onClose}>Close</Button>
            <Button tone="primary" disabled={!dirty || saving} onClick={save}>
              {saving ? 'Saving…' : 'Save as new version'}
            </Button>
          </>
        ) : (
          <Button onClick={onClose}>Close</Button>
        )
      }
    >
      {error && !data ? (
        <LoadError error={error} onRetry={reload} />
      ) : loading && !data ? (
        <Loading />
      ) : data && live ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Pill tone="accent">Live: v{live.version}</Pill>
            {shared ? <Pill>Shared by every product</Pill> : null}
            {live.sensitive ? <Pill>Private data: paid, cleared models only</Pill> : null}
            <span className="text-[var(--ai-muted)]">
              {live.source === 'console' ? `Edited by ${live.updated_by}` : 'From the code'}, {when(live.created_at)}
            </span>
          </div>

          <div role="tablist" className="flex gap-1 border-b border-[var(--ai-border)]">
            {(['edit', 'history'] as const).map((t) => (
              <button
                key={t}
                role="tab"
                type="button"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm outline-none ${tab === t ? 'border-[var(--ai-accent)] font-semibold' : 'border-transparent text-[var(--ai-muted)]'}`}
              >
                {t === 'edit' ? (editable ? 'Edit' : 'Text') : `History (${data.versions.length})`}
              </button>
            ))}
          </div>

          {tab === 'edit' ? (
            <div className="space-y-4">
              {!editable ? (
                <p className="text-sm text-[var(--ai-muted)]">{shared ? 'Shared prompts are changed from the estate console.' : 'You can read this template but not change it.'}</p>
              ) : null}
              {live.variables.length > 0 ? (
                <p className="text-sm">
                  <span className="text-[var(--ai-muted)]">Filled in by the product: </span>
                  {live.variables.map((v) => (
                    <code key={v} className="mr-1.5 rounded bg-[var(--ai-accent-soft)] px-1.5 py-0.5 text-xs">{`{{${v}}}`}</code>
                  ))}
                </p>
              ) : null}
              {editable && !shared && live.source === 'console' && capabilities?.can.revert_templates === true ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--ai-border)] px-3 py-2 text-sm">
                  <span>This template carries a console edit. The code's own words are kept in its history.</span>
                  <Button onClick={() => setReverting(true)}>Back to the code's words</Button>
                </div>
              ) : null}
              <Field label="Instructions" hint="Who the AI is and the rules it follows for this task." error={fieldError?.field === 'system' ? fieldError.message : null}>
                {(id) => (
                  <textarea id={id} rows={8} readOnly={!editable} className={`${INPUT} font-mono text-xs`} value={system} onChange={(e) => setDraft({ system: e.target.value, prompt })} />
                )}
              </Field>
              <AssistBox field="system" text={system} disabled={!editable} onUse={(t) => setDraft({ system: t, prompt })} />
              <Field label="Prompt" hint="What the AI is asked each time. Keep every {{variable}} the product fills in." error={fieldError?.field === 'prompt' ? fieldError.message : null}>
                {(id) => (
                  <textarea id={id} rows={8} readOnly={!editable} className={`${INPUT} font-mono text-xs`} value={prompt} onChange={(e) => setDraft({ system, prompt: e.target.value })} />
                )}
              </Field>
              <AssistBox field="prompt" text={prompt} disabled={!editable} onUse={(t) => setDraft({ system, prompt: t })} />
              {fieldError?.field === 'form' ? <p className="text-sm text-[var(--ai-danger)]">{fieldError.message}</p> : null}
            </div>
          ) : (
            <ol className="space-y-2">
              {data.versions.map((v) => (
                <li key={v.version} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--ai-border)] px-3 py-2 text-sm">
                  <span>
                    <strong>v{v.version}</strong> {v.is_active ? <Pill tone="good">Live</Pill> : null}{' '}
                    <span className="text-[var(--ai-muted)]">
                      {v.source === 'console' ? `edited by ${v.updated_by}` : 'from the code'}, {when(v.created_at)}
                    </span>
                  </span>
                  {editable && !v.is_active ? <Button onClick={() => setRestore(v)}>Restore</Button> : null}
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : null}

      {reverting ? (
        <Confirm
          title="Back to the code's words?"
          body="The console edits on this template stop being live; the words from its file become a new live version, and from the next deploy on the file decides again. Nothing in the history is lost."
          verb="Go back"
          onClose={() => setReverting(false)}
          onConfirm={async () => {
            await request('POST', `tasks/${encodeURIComponent(templateKey)}/revert`, { body: {} });
            await refresh();
          }}
        />
      ) : null}

      {restore ? (
        <Confirm
          title={`Restore v${restore.version}?`}
          body="Its words become a new live version. Nothing in the history is lost."
          verb="Restore"
          onClose={() => setRestore(null)}
          onConfirm={async () => {
            await request('POST', `${base}/versions/${restore.version}/restore`, { body: {} });
            await refresh();
          }}
        />
      ) : null}
    </Dialog>
  );
}
