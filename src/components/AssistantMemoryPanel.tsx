import { useCallback, useEffect, useState } from 'react';
import type { AssistantMemoryFact, AssistantSpaceClient } from '../space/client';

/**
 * "What {assistant} knows about you" (1.43, plan S3b): Porter's memory panel, moved into the shared
 * package so every assistant has it with no product code (owner 2026-11-08: the assistant "should now
 * cover every data-related specific including 'what [assistant] knows about you'").
 *
 * Drawn INSIDE the assistant's panel as its own view (a Back button returns to the chat), so it needs no
 * product dialog components and never escapes the panel's bounds on a short screen: the list scrolls in
 * its own region and the footer stays reachable.
 *
 * ⚠ DESTRUCTIVE ACTIONS CONFIRM. Forgetting one fact and forgetting everything each ask first, inline,
 * naming what goes; nothing is removed by a single click.
 */
export interface AssistantMemoryPanelProps {
  memory: AssistantSpaceClient['memory'];
  /** The assistant's display name ("Porter", "Mira"), from its ai-service record. */
  assistantName: string;
  onClose: () => void;
  /** The product's error surface (Porter: `reportErrorToPorter`). Receives the server's own reason. */
  onError?: (error: unknown) => void;
  /** A short confirmation after a change ("Porter forgot that."). */
  onNotice?: (message: string) => void;
  /** Section headings per key prefix; unknown prefixes fall under "Other". */
  categories?: Array<{ key: string; label: string }>;
}

export function defaultMemoryCategories(assistantName: string): Array<{ key: string; label: string }> {
  return [
    { key: 'identity', label: 'About you' },
    { key: 'situation', label: 'Your situation' },
    { key: 'family', label: 'Your family' },
    { key: 'preference', label: 'Your preferences' },
    { key: 'work', label: 'Your work' },
    { key: 'business', label: 'Your business' },
    { key: 'commitment', label: `What ${assistantName} has done` },
  ];
}

/**
 * The heading a fact's key prefix belongs under. The model writes keys itself, and a plural
 * ("preferences.answer_style") is the same category as its singular; anything else is "Other".
 */
function sectionFor(prefix: string, sections: Array<{ key: string }>): string {
  const p = prefix.toLowerCase();
  const singular = p.endsWith('s') ? p.slice(0, -1) : p;
  return sections.find((s) => s.key === p || s.key === singular)?.key ?? 'general';
}

const BUTTON = 'whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold outline-none transition-colors';

export function AssistantMemoryPanel({ memory, assistantName, onClose, onError, onNotice, categories }: AssistantMemoryPanelProps) {
  const [facts, setFacts] = useState<AssistantMemoryFact[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);
  const [blankDraft, setBlankDraft] = useState(false);
  const sections = categories ?? defaultMemoryCategories(assistantName);

  const fail = useCallback((error: unknown) => onError?.(error), [onError]);

  useEffect(() => {
    let live = true;
    memory
      .list()
      .then((rows) => live && setFacts(rows.filter((f) => f.value !== '')))
      .catch((error: unknown) => {
        if (live) {
          setFacts([]);
          fail(error);
        }
      });
    return () => {
      live = false;
    };
  }, [memory, fail]);

  const save = (key: string) => {
    const value = draft.trim();
    if (value === '') {
      setBlankDraft(true);
      return;
    }
    memory
      .correct(key, value, facts?.find((f) => f.key === key)?.label)
      .then((fact) => {
        setFacts((rows) => (rows ?? []).map((f) => (f.key === key ? { ...f, ...fact, value } : f)));
        setEditing(null);
        onNotice?.(`Updated what ${assistantName} remembers.`);
      })
      .catch(fail);
  };

  const forget = (key: string) => {
    memory
      .forget(key)
      .then(() => {
        setFacts((rows) => (rows ?? []).filter((f) => f.key !== key));
        setConfirming(null);
        onNotice?.(`${assistantName} forgot that.`);
      })
      .catch((error: unknown) => {
        // The fact is still remembered: show it again, and let the product say why it was not forgotten.
        setConfirming(null);
        fail(error);
      });
  };

  const forgetAll = () => {
    memory
      .forgetAll()
      .then(() => {
        setFacts([]);
        setConfirming(null);
        onNotice?.(`${assistantName} cleared everything it remembered about you.`);
      })
      .catch((error: unknown) => {
        setConfirming(null);
        fail(error);
      });
  };

  const grouped = new Map<string, AssistantMemoryFact[]>();
  for (const fact of facts ?? []) {
    const section = sectionFor(fact.key.split('.', 1)[0] ?? '', sections);
    grouped.set(section, [...(grouped.get(section) ?? []), fact]);
  }
  const ordered = [...sections, { key: 'general', label: 'Other' }].filter((s) => grouped.has(s.key));

  return (
    <section aria-label={`What ${assistantName} knows about you`} className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-[var(--ai-border)] px-4 py-3">
        <button type="button" onClick={onClose} className={`${BUTTON} hover:bg-[var(--ai-accent-soft)]`} aria-label="Back to the chat">
          Back
        </button>
        <h2 className="truncate text-sm font-semibold">What {assistantName} knows about you</h2>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <p className="mb-3 text-xs text-[var(--ai-muted)]">
          What {assistantName} keeps in mind so your chats feel like one continuous conversation. You are in control: edit or
          forget anything here.
        </p>

        {facts === null ? (
          <p className="py-6 text-center text-sm text-[var(--ai-muted)]">Loading what {assistantName} remembers...</p>
        ) : facts.length === 0 ? (
          <div className="py-6 text-center text-sm text-[var(--ai-muted)]">
            <p className="font-medium">{assistantName} hasn&apos;t noted anything about you yet.</p>
            <p className="mt-1">As you chat, it remembers the essentials so you never have to repeat yourself.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {ordered.map((section) => (
              <div key={section.key}>
                <h3 className="mb-1.5 text-xs font-semibold text-[var(--ai-muted)]">{section.label}</h3>
                <ul className="space-y-2">
                  {(grouped.get(section.key) ?? []).map((fact) => (
                    <li key={fact.key} className="rounded-xl border border-[var(--ai-border)] px-3 py-2">
                      {editing === fact.key ? (
                        <div className="space-y-2">
                          <label className="block text-xs text-[var(--ai-muted)]" htmlFor={`memory-${fact.key}`}>
                            {fact.label}
                          </label>
                          <input
                            id={`memory-${fact.key}`}
                            autoFocus
                            value={draft}
                            onChange={(e) => {
                              setDraft(e.target.value);
                              setBlankDraft(false);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') save(fact.key);
                              if (e.key === 'Escape') setEditing(null);
                            }}
                            aria-invalid={blankDraft}
                            className="w-full rounded-lg border border-[var(--ai-border)] bg-transparent px-3 py-2 text-sm outline-none"
                          />
                          {blankDraft && (
                            <p className="text-xs text-[var(--ai-danger)]">A remembered detail can&apos;t be blank. Enter a value, or forget it instead.</p>
                          )}
                          <div className="flex gap-2">
                            <button type="button" onClick={() => save(fact.key)} className={`${BUTTON} bg-[var(--ai-accent)] text-[var(--ai-accent-fg)]`}>
                              Save
                            </button>
                            <button type="button" onClick={() => setEditing(null)} className={`${BUTTON} hover:bg-[var(--ai-accent-soft)]`}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : confirming === fact.key ? (
                        <div className="space-y-2">
                          <p className="text-sm">
                            {assistantName} will no longer remember &quot;{fact.label}&quot;. You can tell it again later.
                          </p>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => forget(fact.key)} className={`${BUTTON} bg-[var(--ai-danger)] text-white`}>
                              Forget
                            </button>
                            <button type="button" onClick={() => setConfirming(null)} className={`${BUTTON} hover:bg-[var(--ai-accent-soft)]`}>
                              Keep it
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs text-[var(--ai-muted)]">{fact.label}</p>
                            <p className="break-words text-sm">{fact.value}</p>
                            <span className="mt-1 inline-block rounded-full bg-[var(--ai-accent-soft)] px-2 py-0.5 text-[10px] font-medium">
                              {fact.source === 'explicit' ? `You told ${assistantName}` : `${assistantName} guessed`}
                            </span>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setEditing(fact.key);
                                setDraft(fact.value);
                                setBlankDraft(false);
                              }}
                              aria-label={`Edit ${fact.label}`}
                              className={`${BUTTON} hover:bg-[var(--ai-accent-soft)]`}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirming(fact.key)}
                              aria-label={`Forget ${fact.label}`}
                              className={`${BUTTON} text-[var(--ai-danger)] hover:bg-[var(--ai-accent-soft)]`}
                            >
                              Forget
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {facts !== null && facts.length > 0 && (
        <footer className="shrink-0 border-t border-[var(--ai-border)] px-4 py-3">
          {confirming === '*' ? (
            <div className="space-y-2">
              <p className="text-sm">
                {assistantName} will start fresh and won&apos;t recall anything here until you tell it again. This can&apos;t be undone.
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={forgetAll} className={`${BUTTON} bg-[var(--ai-danger)] text-white`}>
                  Forget everything
                </button>
                <button type="button" onClick={() => setConfirming(null)} className={`${BUTTON} hover:bg-[var(--ai-accent-soft)]`}>
                  Keep it all
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirming('*')} className={`${BUTTON} text-[var(--ai-danger)] hover:bg-[var(--ai-accent-soft)]`}>
              Forget everything
            </button>
          )}
        </footer>
      )}
    </section>
  );
}
